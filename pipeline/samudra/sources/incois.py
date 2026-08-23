"""Source Adapter for INCOIS's own public ERDDAP.

Serves `incois_argo_10d_VAM` - INCOIS's 10-day gridded Argo analysis produced by their
Variational Analysis Methodology. Temperature and salinity on 24 Levels from 5 m to 2000 m,
1 degree, over the whole Indian Ocean, currently maintained.

This matters for the story: the gridded field and the Profiles we overlay on it are not
unrelated datasets that happen to share an ocean. The analysis is *derived from* Argo
profiles, so a Collocation is a genuine operational question - did the analysis reproduce the
observation that went into it? - and not a contrived apples-to-oranges comparison.
"""

from __future__ import annotations

import io
from datetime import datetime, timezone
from functools import lru_cache
from typing import Sequence

import numpy as np
import requests
import xarray as xr

from ..grid import Grid
from ..tls import ca_bundle
from .base import BoundingBox, FieldSpec

_SERVER = "https://erddap.incois.gov.in/erddap/griddap"
_DATASET = "incois_argo_10d_VAM"
_TIMEOUT = 120

_FIELDS = (
    FieldSpec(
        key="temperature",
        label="Sea Water Temperature",
        units="°C",
        palette="thermal",
        display_min=2.0,
        display_max=31.0,
    ),
    FieldSpec(
        key="salinity",
        label="Sea Water Salinity",
        units="PSU",
        palette="haline",
        display_min=32.0,
        display_max=37.0,
    ),
)

_ERDDAP_VARIABLE = {"temperature": "TEMP", "salinity": "SAL"}


class IncoisErddapSource:
    """Reads gridded Fields from INCOIS's public ERDDAP."""

    name = "INCOIS ERDDAP"
    attribution = (
        "Indian National Centre for Ocean Information Services (INCOIS), Ministry of Earth "
        "Sciences — ARGO 10-day gridded analysis (Variational Analysis Methodology)"
    )

    def fields(self) -> Sequence[FieldSpec]:
        return _FIELDS

    def timesteps(self) -> Sequence[datetime]:
        return _fetch_timesteps()

    def fetch_grid(self, field_key: str, timestep: datetime, bbox: BoundingBox) -> Grid:
        variable = _ERDDAP_VARIABLE[field_key]
        stamp = timestep.strftime("%Y-%m-%dT%H:%M:%SZ")
        selector = (
            f"{variable}"
            f"[({stamp}):({stamp})]"
            f"[(5.0):(2000.0)]"
            f"[({bbox.south}):({bbox.north})]"
            f"[({bbox.west}):({bbox.east})]"
        )
        response = requests.get(
            f"{_SERVER}/{_DATASET}.nc?{selector}", timeout=_TIMEOUT, verify=ca_bundle()
        )
        response.raise_for_status()

        with xr.open_dataset(io.BytesIO(response.content)) as ds:
            data = ds[variable].isel(time=0)
            return Grid(
                levels=ds["ZAX"].values.astype(float),
                latitudes=ds["latitude"].values.astype(float),
                longitudes=ds["longitude"].values.astype(float),
                values=data.values.astype(float),
            )


@lru_cache(maxsize=1)
def _fetch_timesteps() -> tuple[datetime, ...]:
    response = requests.get(
        f"{_SERVER}/{_DATASET}.json?time", timeout=_TIMEOUT, verify=ca_bundle()
    )
    response.raise_for_status()
    rows = response.json()["table"]["rows"]
    return tuple(
        datetime.strptime(row[0], "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
        for row in rows
    )
