"""A Grid, described the way the rest of oceanography expects to be handed one.

PS 26067 asks for CF Conventions. INCOIS publish CF-1.6 and `sources/incois.py` reads those
conventions directly, which is their compliance rather than ours - everything this platform
writes is a packed binary Volume plus JSON, which is right for a GPU and useless to a scientist.

This module is the other half: one place that turns a `Grid` into a self-describing dataset with
real standard names, so `/api/netcdf`, the OPeNDAP endpoint and the WMS all describe the same
thing in the same words. A consumer never has to be told what is in the file.

Two rules govern everything here.

**It reads the native Grid, never the Volume.** The Volume is quantised to 255 levels,
depth-warped and back-filled across land for the GPU's benefit. Serving that over a scientific
protocol would be the worst possible violation of this project's first rule, because unlike a
picture on screen the consumer cannot see what they have been given.

**A quantity we invented does not get to borrow a standard name.** Temperature, salinity and
density have real CF standard names. Observation Coverage does not - it is a count of Argo casts
in a neighbourhood, which no vocabulary has a term for - so it is served with a `long_name` and
no `standard_name` at all. Inventing one that looks official is the same class of error as
printing "the conventional oceanographic scale for observation coverage".
"""

from __future__ import annotations

from datetime import datetime

import numpy as np
import xarray as xr

CONVENTIONS = "CF-1.8"

# Standard names from the CF standard name table. A Field missing from here is served with a
# long_name only, which is what CF asks you to do when no standard name applies.
_STANDARD_NAMES = {
    "temperature": "sea_water_temperature",
    "salinity": "sea_water_practical_salinity",
    "density": "sea_water_sigma_theta",
    # A departure from a four-month mean of this bake is not an anomaly in the CF sense, which
    # means a departure from a climatology. There is no standard name for what this actually is.
    "temperature_anomaly": None,
    "coverage": None,
}

_LONG_NAMES = {
    "temperature": "Sea water temperature",
    "salinity": "Sea water practical salinity",
    "density": "Sea water potential density anomaly (sigma-theta)",
    "temperature_anomaly": (
        "Sea water temperature departure from the mean of the twelve analysis steps in this "
        "build (approximately April to July 2026). Not a climatological anomaly."
    ),
    "coverage": (
        "Count of Argo profile casts within 334 km whose dive passed through this depth, in "
        "the ten days around this analysis step. Evidence for the analysis, not a model field."
    ),
}

_UNITS = {
    "temperature": "degree_Celsius",
    "salinity": "1",  # practical salinity is dimensionless in CF; PSU is not a CF unit
    "density": "kg m-3",
    "temperature_anomaly": "degree_Celsius",
    "coverage": "1",
}


def as_dataset(grid, field: str, when: datetime, extra_attributes: dict | None = None):
    """One Grid at one Timestep as a CF-1.8 `xarray.Dataset`.

    Axes are named and attributed so a client can orient itself without being told: depth is
    positive down and carries `positive: "down"`, which is the attribute that stops a plotting
    library drawing the ocean upside down.
    """
    depth = xr.DataArray(
        np.asarray(grid.levels, dtype="float32"),
        dims="depth",
        attrs={
            "standard_name": "depth",
            "long_name": "Depth below sea surface",
            "units": "m",
            "positive": "down",
            "axis": "Z",
        },
    )
    latitude = xr.DataArray(
        np.asarray(grid.latitudes, dtype="float32"),
        dims="latitude",
        attrs={
            "standard_name": "latitude",
            "long_name": "Latitude",
            "units": "degrees_north",
            "axis": "Y",
        },
    )
    longitude = xr.DataArray(
        np.asarray(grid.longitudes, dtype="float32"),
        dims="longitude",
        attrs={
            "standard_name": "longitude",
            "long_name": "Longitude",
            "units": "degrees_east",
            "axis": "X",
        },
    )
    time = xr.DataArray(
        np.array([np.datetime64(when.replace(tzinfo=None), "s")]),
        dims="time",
        attrs={"standard_name": "time", "long_name": "Analysis time", "axis": "T"},
    )

    variable = xr.DataArray(
        np.asarray(grid.values, dtype="float32")[np.newaxis, ...],
        dims=("time", "depth", "latitude", "longitude"),
        attrs={
            key: value
            for key, value in {
                "standard_name": _STANDARD_NAMES.get(field),
                "long_name": _LONG_NAMES.get(field, field),
                "units": _UNITS.get(field, "1"),
                # NaN is the mask - land, or sea floor above this level. Declared, so a client
                # does not read it as a value of zero.
                "_FillValue": np.float32(np.nan),
                "missing_value": np.float32(np.nan),
            }.items()
            if value is not None
        },
    )

    dataset = xr.Dataset(
        {field: variable},
        coords={"time": time, "depth": depth, "latitude": latitude, "longitude": longitude},
        attrs={
            "Conventions": CONVENTIONS,
            "title": f"Samudra 3D - {_LONG_NAMES.get(field, field)}",
            "institution": "Indian National Centre for Ocean Information Services (INCOIS)",
            "source": (
                "INCOIS ARGO 10-day gridded analysis (Variational Analysis Methodology), "
                "dataset incois_argo_10d_VAM, served on its native axes"
            ),
            "references": "https://erddap.incois.gov.in/erddap/griddap/incois_argo_10d_VAM.html",
            "comment": (
                "Served from the native Grid, never from the rendering Volume: the Volume is "
                "quantised to 255 levels, depth-warped and back-filled across land for the GPU."
            ),
            "geospatial_lat_min": float(np.min(grid.latitudes)),
            "geospatial_lat_max": float(np.max(grid.latitudes)),
            "geospatial_lon_min": float(np.min(grid.longitudes)),
            "geospatial_lon_max": float(np.max(grid.longitudes)),
            "geospatial_vertical_min": float(np.min(grid.levels)),
            "geospatial_vertical_max": float(np.max(grid.levels)),
            "geospatial_vertical_positive": "down",
            "time_coverage_start": when.strftime("%Y-%m-%dT%H:%M:%SZ"),
            "time_coverage_end": when.strftime("%Y-%m-%dT%H:%M:%SZ"),
        },
    )
    if extra_attributes:
        dataset.attrs.update(extra_attributes)
    return dataset


def to_netcdf_bytes(dataset) -> bytes:
    """Serialise to NetCDF in memory. `to_netcdf(None)` returns bytes rather than writing."""
    return dataset.to_netcdf(None)
