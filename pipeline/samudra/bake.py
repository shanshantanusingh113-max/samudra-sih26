"""Bake: turn live INCOIS and Argo data into static assets the browser can open instantly.

Why bake at all, when there is a perfectly good REST API in `api/`?

Because the demo runs in front of judges on a venue network we do not control, and the two
upstream servers are in Hyderabad and Brest. A cold fetch of a Timestep is fast when it works,
and the whole platform is dead when it does not. Everything the demo needs is therefore
committed as static files; the live path exists, is real, and is demonstrated, but it is never
on the critical path.

The other reason is honesty about resolution. INCOIS publishes on a 1 degree grid, so the
Volume is written at the grid's native horizontal resolution and left for the GPU's trilinear
filter to smooth. Upsampling here with a cubic spline would look sharper and would be
inventing structure the instrument never measured.
"""

from __future__ import annotations

import argparse
import json
import warnings
from dataclasses import asdict
from datetime import datetime, timedelta, timezone
from pathlib import Path

import numpy as np

from .anomaly import (
    DEGREES_THRESHOLD,
    MIN_CELLS,
    Z_THRESHOLD,
    anomaly_series,
    find_anomaly_features,
    symmetric_encoding_range,
)
from .collocation import choose_cast, collocate
from .currents import (
    ATTRIBUTION as CURRENTS_ATTRIBUTION,
    LAYER as CURRENTS_LAYER,
    fetch_legend,
    fetch_overlay,
)
from .coverage import (
    BANDS,
    BAND_LABELS,
    METRES_PER_DEGREE,
    RADIUS_DEGREES,
    observation_coverage,
)
from .density import potential_density, profile_density
from .depth_warp import DepthWarp
from .grid import Grid
from .palettes import all_tables, banded_table
from .thermocline import isotherm_depth, swept_through
from .sources.argo import ArgoErddapSource, BgcArgoSource
from .sources.base import BoundingBox, FieldSpec
from .sources.incois import IncoisErddapSource
from .sources.osmc import OsmcSource
from .volume import encode_volume

# India's EEZ and the surrounding seas a forecaster actually works in: the Arabian Sea, the
# Bay of Bengal, the Lakshadweep and Andaman groups, and enough equatorial water to show the
# thermocline doming that drives monsoon forecasts.
DEMO_REGION = BoundingBox(south=-10.0, north=25.0, west=55.0, east=100.0)

SURFACE_METRES = 5.0
FLOOR_METRES = 2000.0
DEPTH_SAMPLES = 48

# Observation Coverage is a Field the browser selects like any other, but it is derived here
# rather than fetched: no provider publishes "how much did anyone measure near this voxel".
#
# It is drawn flat rather than gradient-weighted, because the emphasis trick that makes
# temperature legible would fade out precisely the uniform regions coverage exists to show, and
# at higher opacity, because four discrete bands should read as solid blocks and not as haze.
COVERAGE_FIELD = FieldSpec(
    key="coverage",
    label="Observation Coverage",
    units="casts",
    palette="coverage",
    display_min=0.0,
    display_max=40.0,
    emphasis=0.0,
    opacity=0.06,
    isosurface=False,
    description=(
        "How many Argo casts were taken near each point and whose dive passed through this "
        "depth. Counted in a neighbourhood rather than per cell. This is evidence, not model "
        "error."
    ),
)

# Density and Temperature Anomaly are computed here from Fields already on disk. Neither needs
# a provider, a download or an assumption: density is fixed by TEOS-10 given temperature,
# salinity and pressure, and an anomaly is a subtraction. They ride the same encoder, the same
# manifest and the same shader as the fetched Fields, which is the claim PS 26067 asks for -
# additional model variables with minimal code change - demonstrated rather than asserted.
DENSITY_FIELD = FieldSpec(
    key="density",
    label="Sea Water Density",
    units="kg/m³",
    palette="dense",
    display_min=20.0,
    display_max=28.0,
    description=(
        "Potential density anomaly, sigma-theta, from TEOS-10. Computed from the temperature "
        "and salinity analyses at each cell's own pressure. Density is what the ocean responds "
        "to: water moves because it is light, not because it is warm."
    ),
)

# Drawn with the gradient emphasis turned part way down. Anomaly is near zero below about 300 m,
# so at full emphasis the deep half of the block correctly vanishes but a large uniform warm
# patch - the thing worth seeing - fades with it. Part way keeps the patch and still clears the
# flat abyss out of the way.
ANOMALY_FIELD = FieldSpec(
    key="temperature_anomaly",
    label="Temperature Anomaly",
    units="°C",
    palette="balance",
    display_min=-3.0,
    display_max=3.0,
    emphasis=0.55,
    opacity=0.05,
    description=(
        "Departure of each cell from its own average across the twelve Timesteps in this bake, "
        "roughly April to July 2026. A seasonal swing, not a climatological normal: there is no "
        "thirty-year reference series in this build."
    ),
)

# Order is the order of the buttons in the Variable selector. Fetched Fields first, then the
# ones derived from them, then the evidence behind all of it.
DERIVED_FIELDS = (DENSITY_FIELD, ANOMALY_FIELD)


# The isotherm an anomaly feature is explained against. 20 degC is the conventional proxy for
# the bottom of the warm surface layer and is what INCOIS publishes; see samudra/thermocline.py
# for the correlation that makes it an explanation rather than a decoration.
ISOTHERM_VALUE = 20.0


# Profiles counted towards a Timestep, as a half-window either side of the analysis date. An
# Argo float surfaces about every ten days and the analysis steps every ten days, so five days
# each way collects roughly one cast per float per step, and the half-windows tile the timeline
# without gaps or overlap. That is what makes the coverage field animate rather than sit still.
#
# It is shipped in the manifest because the frontend needs the same number: a Float marker is
# drawn at a Timestep exactly when a cast of its own was counted by that Timestep's window.
# These used to be two independent constants, 5 here and 12 in floatTime.ts, and 2% of the
# markers on screen were therefore instruments that no coverage window had counted.
COVERAGE_WINDOW_DAYS = 5.0


# Channels an instrument measures that the model has no counterpart for, so they are shown on
# their own rather than as half of a comparison. Chlorophyll is the only one today.
#
# PS 26067 names chlorophyll in the same clause as Argo and glider profiles. It is reachable -
# 532 casts from 49 BGC floats over this region and window, measured - and there is no gridded
# chlorophyll on this timeline to hold it against: INCOIS's own ocean colour products end
# 2006-03-21 and 2020-05-01. So it is an observation with no model side, which is the same thing
# Observation Coverage says one quantity further on.
OBSERVED_ONLY_CHANNELS = (("chlorophyll", "Chlorophyll a", "mg/m3"),)

# How far a BGC cast may be from the cast being charted and still describe the same float's
# water. Measured across the 50 chlorophyll-carrying floats in this bake, the gap is bimodal:
# 22 of them have a BGC cast at the same instant, and the rest sit 9 to 10 days away - exactly
# one Argo cycle, because the synthetic BGC product is assembled a cycle behind the core one.
#
# At one day, 28 floats' chlorophyll was silently thrown away. Twelve days - one cycle plus the
# coverage window - keeps 41 of the 50 and reaches only the adjacent dive of the same float.
# Past that a float has surfaced twice and drifted, and it is honestly a different piece of
# water, so the remaining nine are dropped rather than stretched to fit.
#
# Nothing is being compared against the model at an instant here - chlorophyll has no model side
# - so a neighbouring cast costs nothing as long as the panel says which cast it is, which
# `sameDive` below is for.
BGC_MATCH_DAYS = 12.0


def bake(output_dir: Path, timesteps: int, profile_days: int, grid_dir: Path | None = None) -> None:
    if timesteps < 1:
        raise ValueError(f"need at least one timestep, got {timesteps}")

    output_dir.mkdir(parents=True, exist_ok=True)
    (output_dir / "volumes").mkdir(exist_ok=True)
    if grid_dir:
        grid_dir.mkdir(parents=True, exist_ok=True)
        # Clear first. A shorter re-bake would otherwise leave grids from the previous run
        # behind, and the API resolves them by filename - it would happily interpolate a stale
        # grid from a different date range and report it as the current analysis.
        for stale in grid_dir.glob("*.npz"):
            stale.unlink()

    model = IncoisErddapSource()
    observations = ArgoErddapSource()
    # Two more instrument feeds, each one class behind the same ProfileSource protocol. Neither
    # is allowed to be fatal: the demo's spine is the Argo comparison, and a provider in Brest or
    # Miami being down at bake time must not cost us the bake.
    biogeochemical = BgcArgoSource()
    moored = OsmcSource()
    warp = DepthWarp(top=SURFACE_METRES, bottom=FLOOR_METRES)

    wanted = list(model.timesteps())[-timesteps:]
    print(f"[bake] {len(wanted)} timesteps, {wanted[0]:%Y-%m-%d} to {wanted[-1]:%Y-%m-%d}")

    grids: dict[tuple[str, int], Grid] = {}
    for field in model.fields():
        for index, stamp in enumerate(wanted):
            grids[(field.key, index)] = model.fetch_grid(field.key, stamp, DEMO_REGION)
            print(f"[bake]   {field.key} {stamp:%Y-%m-%d}")

    # Derived Fields, computed from the Grids just fetched. Added to the same dictionary, so
    # everything downstream - the native-grid export, the encoder, the manifest - treats them
    # exactly as it treats temperature.
    for index in range(len(wanted)):
        grids[(DENSITY_FIELD.key, index)] = potential_density(
            grids[("temperature", index)], grids[("salinity", index)]
        )
    anomalies = anomaly_series([grids[("temperature", i)] for i in range(len(wanted))])
    for index, grid in enumerate(anomalies):
        grids[(ANOMALY_FIELD.key, index)] = grid
    print(f"[bake] derived {', '.join(f.key for f in DERIVED_FIELDS)}")

    volume_fields = [*model.fields(), *DERIVED_FIELDS]

    # One encoding range per Field across every Timestep. If each frame were scaled to its own
    # min/max the colours would breathe as the animation ran and a viewer would read that
    # shimmer as a real seasonal signal.
    ranges = {
        field.key: _encoding_range(
            [grids[(field.key, i)] for i in range(len(wanted))], field
        )
        for field in volume_fields
    }
    # Except the anomaly, whose range has to be symmetric or the diverging palette's midpoint
    # stops meaning "no departure". See samudra/anomaly.py.
    ranges[ANOMALY_FIELD.key] = symmetric_encoding_range(anomalies)

    # The native Grids are kept for the API, which must never answer a scientific question from
    # the Volume: the Volume is quantised, depth-warped and back-filled across land for the sake
    # of the GPU. Collocation reads these instead.
    if grid_dir:
        for (field_key, index), grid in grids.items():
            np.savez_compressed(
                grid_dir / f"{field_key}_{index:03d}.npz",
                levels=grid.levels,
                latitudes=grid.latitudes,
                longitudes=grid.longitudes,
                values=grid.values.astype(np.float32),
            )
        (grid_dir / "index.json").write_text(
            json.dumps(
                {
                    "fields": [f.key for f in volume_fields],
                    "timesteps": [t.isoformat() for t in wanted],
                }
            ),
            encoding="utf-8",
        )
        print(f"[bake] wrote {len(grids)} native grids to {grid_dir}")

    end = wanted[-1]
    start = end - timedelta(days=profile_days)
    # Fetched wider than the region on purpose, in both space and time.
    #
    # In time, by the coverage half-window: otherwise the last Timestep counts only the casts
    # that happened to land before the analysis date, which halves its coverage on the frame the
    # app opens on.
    #
    # In space, by the coverage radius: a float at 54 E is real evidence about a voxel at
    # 55.5 E, and fetching only inside the region made every edge voxel reachable from one side
    # only. Measured before the fix: 0.41 casts at the western edge against 2.71 in the
    # interior, and 0.00 at the eastern edge - a false "no observations" rim that a viewer would
    # read as a genuine gap in the Argo array.
    halo = BoundingBox(
        south=DEMO_REGION.south - RADIUS_DEGREES,
        north=DEMO_REGION.north + RADIUS_DEGREES,
        west=DEMO_REGION.west - RADIUS_DEGREES,
        east=DEMO_REGION.east + RADIUS_DEGREES,
    )
    profiles = list(
        observations.fetch_profiles(halo, start, end + timedelta(days=COVERAGE_WINDOW_DAYS))
    )
    # Coverage counts every cast in the halo. Everything else - the Floats drawn on screen and
    # the Collocations - is restricted to the region, so the halo never puts a marker outside
    # the box or a comparison against a Grid that does not reach it.
    in_region = [p for p in profiles if DEMO_REGION.contains(p.latitude, p.longitude)]
    print(
        f"[bake] {len(profiles)} Argo profiles in the halo, {len(in_region)} inside the region, "
        f"from {len(set(p.platform_id for p in in_region))} floats"
    )

    bgc = _try_fetch("BGC-Argo", biogeochemical, DEMO_REGION, start, end)
    with_chlorophyll = [
        p for p in bgc if np.isfinite(p.values.get("chlorophyll", np.array([np.nan]))).any()
    ]
    print(
        f"[bake] {len(bgc)} BGC profiles, {len(with_chlorophyll)} carrying chlorophyll, "
        f"from {len(set(p.platform_id for p in with_chlorophyll))} floats"
    )

    moorings = _try_fetch("moorings", moored, DEMO_REGION, start, end)
    print(
        f"[bake] {len(moorings)} moored-buoy profiles from "
        f"{len(set(p.platform_id for p in moorings))} buoys "
        f"({', '.join(sorted(set(p.country or '?' for p in moorings)))})"
    )

    sample = grids[(model.fields()[0].key, 0)]
    volume_files: dict[str, list[str]] = {}

    for field in volume_fields:
        vmin, vmax = ranges[field.key]
        paths = []
        for index in range(len(wanted)):
            block = _warp_to_volume(grids[(field.key, index)], warp)
            encoded = encode_volume(block, vmin=vmin, vmax=vmax)
            name = f"volumes/{field.key}_{index:03d}.bin"
            (output_dir / name).write_bytes(encoded.data)
            paths.append(name)
        volume_files[field.key] = paths
        print(f"[bake] {field.key}: {len(paths)} volumes, range {vmin:.2f}..{vmax:.2f}")

    currents = _bake_currents(output_dir, wanted)

    coverage_paths, coverage_range, coverage_fields = _bake_coverage(
        output_dir, profiles, grids, wanted, model.fields()[0].key, warp
    )
    volume_files[COVERAGE_FIELD.key] = coverage_paths
    ranges[COVERAGE_FIELD.key] = coverage_range

    # Density joins the Collocation because a Float measures both of its ingredients, so both
    # sides of the comparison can be put through the same TEOS-10 chain. The anomaly cannot: a
    # single cast has no baseline of its own to depart from.
    collocated = [*model.fields(), DENSITY_FIELD]
    features = _build_anomaly_features(anomalies, grids, wanted, coverage_fields, warp)
    (output_dir / "anomalies.json").write_text(json.dumps(features), encoding="utf-8")
    print(
        f"[bake] {sum(len(f) for f in features)} anomaly features across {len(features)} steps, "
        f"{sum(len(f) for f in features) / len(features):.1f} per step"
    )

    floats, collocations = _build_observations(
        in_region, grids, wanted, collocated, extra=with_chlorophyll, moorings=moorings
    )
    (output_dir / "floats.json").write_text(json.dumps(floats), encoding="utf-8")
    (output_dir / "collocations.json").write_text(json.dumps(collocations), encoding="utf-8")

    if grid_dir:
        np.savez_compressed(
            grid_dir / "profiles.npz",
            **{
                f"{p.platform_id}|{p.time.isoformat()}|{p.latitude}|{p.longitude}": np.vstack(
                    [
                        p.depths,
                        p.values.get("temperature"),
                        p.values.get("salinity"),
                        _observed_density(p),
                    ]
                )
                for p in in_region
            },
        )

    manifest = {
        "generated": datetime.now(timezone.utc).isoformat(),
        "region": asdict(DEMO_REGION),
        # Each source carries its own role and endpoint, so the provenance page can list them
        # without a hardcoded table beside it. That page's whole claim is that every figure on it
        # comes out of this manifest; a two-entry array in its script would have quietly made
        # that false the moment a third source arrived.
        "sources": [
            {
                "name": model.name,
                "attribution": model.attribution,
                "role": "Gridded model field",
                "endpoint": "erddap.incois.gov.in/erddap/griddap/incois_argo_10d_VAM",
            },
            {
                "name": observations.name,
                "attribution": observations.attribution,
                "role": "In-situ profiles",
                "endpoint": "erddap.ifremer.fr/erddap/tabledap/ArgoFloats",
            },
        ]
        # Only listed when they actually contributed. A provenance line naming a source that
        # returned nothing is the same class of claim as a legend for a band nothing lands in.
        + (
            [
                {
                    "name": biogeochemical.name,
                    "attribution": biogeochemical.attribution,
                    "role": "Chlorophyll profiles",
                    "endpoint": "erddap.ifremer.fr/erddap/tabledap/ArgoFloats-synthetic-BGC",
                }
            ]
            if with_chlorophyll
            else []
        )
        + (
            [
                {
                    "name": moored.name,
                    "attribution": moored.attribution,
                    "role": "Moored buoy profiles",
                    "endpoint": "erddap.aoml.noaa.gov/gdp/erddap/tabledap/OSMC_RealTime",
                }
            ]
            if moorings
            else []
        )
        + (
            [
                {
                    "name": "Copernicus Marine (WMTS)",
                    "attribution": CURRENTS_ATTRIBUTION,
                    "role": "Surface current image",
                    "endpoint": "wmts.marine.copernicus.eu/teroWmts",
                }
            ]
            if currents
            else []
        ),
        "fields": [
            asdict(f) | {"range": list(ranges[f.key])}
            for f in (*volume_fields, COVERAGE_FIELD)
        ],
        "coverage": {
            "bands": list(BANDS),
            "labels": list(BAND_LABELS),
            "windowDays": COVERAGE_WINDOW_DAYS,
            "radiusKm": round(RADIUS_DEGREES * METRES_PER_DEGREE / 1000),
        },
        "anomalyFeatures": {
            "field": ANOMALY_FIELD.key,
            "zThreshold": Z_THRESHOLD,
            "valueThreshold": DEGREES_THRESHOLD,
            "minCells": MIN_CELLS,
            "isothermValue": ISOTHERM_VALUE,
        },
        "timesteps": [t.isoformat() for t in wanted],
        "volume": {
            "width": len(sample.longitudes),
            "height": len(sample.latitudes),
            "depth": DEPTH_SAMPLES,
            "depthAxisMetres": [round(float(d), 2) for d in warp.sample_depths(DEPTH_SAMPLES)],
            "surfaceMetres": SURFACE_METRES,
            "floorMetres": FLOOR_METRES,
            "west": float(sample.longitudes[0]),
            "east": float(sample.longitudes[-1]),
            "south": float(sample.latitudes[0]),
            "north": float(sample.latitudes[-1]),
        },
        "volumeFiles": volume_files,
        "palettes": all_tables()
        | {
            # Built here, not in palettes.py, because the band edges have to be expressed in the
            # encoded range this bake actually produced. A table built against a different range
            # would draw its steps in the wrong places.
            "coverage": banded_table(BANDS, *ranges[COVERAGE_FIELD.key])
        },
        "floatCount": len(floats),
        # Absent entirely when the bake could not fetch them, so the frontend has one thing to
        # check rather than a block full of empty lists.
        **({"currents": currents} if currents else {}),
        # What the Instruments panel and the map key need to name what is on the water.
        "instruments": {
            "floats": sum(1 for f in floats if f.get("kind", "float") == "float"),
            "moorings": sum(1 for f in floats if f.get("kind") == "mooring"),
            "withChlorophyll": sum(1 for f in floats if f.get("bgc")),
        },
        "observedOnly": [
            {"key": key, "label": label, "units": units}
            for key, label, units in OBSERVED_ONLY_CHANNELS
        ],
    }
    (output_dir / "manifest.json").write_text(json.dumps(manifest), encoding="utf-8")
    print(f"[bake] wrote manifest to {output_dir}")


def _bake_currents(output_dir, timesteps):
    """One Copernicus current overlay per Timestep, or nothing at all.

    A picture, deliberately. See `samudra/currents.py` for why the numbers behind it are not
    available to us and why that is the right trade rather than a compromise.

    Not fatal. Currents are an addition; the demo's spine is the comparison, and if Copernicus
    is unreachable at bake time the manifest simply carries no currents block and the frontend
    does not offer the layer.
    """
    directory = output_dir / "currents"
    directory.mkdir(exist_ok=True)
    for stale in directory.glob("*.png"):
        stale.unlink()

    paths = []
    try:
        legend = fetch_legend()
        for index, stamp in enumerate(timesteps):
            overlay = fetch_overlay(
                DEMO_REGION.west, DEMO_REGION.east, DEMO_REGION.south, DEMO_REGION.north, stamp
            )
            name = f"currents/{index:03d}.png"
            overlay.save(output_dir / name, optimize=True)
            paths.append(name)
            print(f"[bake]   currents {stamp:%Y-%m-%d}: {overlay.size[0]}x{overlay.size[1]}")
    except Exception as error:  # noqa: BLE001 - one upstream, many ways to be down
        print(f"[bake] WARNING: currents unavailable ({error}); continuing without them")
        for stale in directory.glob("*.png"):
            stale.unlink()
        return None

    total = sum((output_dir / p).stat().st_size for p in paths)
    print(f"[bake] currents: {len(paths)} overlays, {total / 1e6:.1f} MB")
    return {
        "files": paths,
        "layer": CURRENTS_LAYER,
        "attribution": CURRENTS_ATTRIBUTION,
        "legend": legend,
        # The box the images cover, which is the region exactly - the crop in currents.py
        # exists to make this true, because a half-degree error here draws the Somali Current
        # over Somalia.
        "west": DEMO_REGION.west,
        "east": DEMO_REGION.east,
        "south": DEMO_REGION.south,
        "north": DEMO_REGION.north,
        "depthMetres": 0.5,
    }


def _try_fetch(what, source, bbox, start, end):
    """Fetch from one instrument provider, and survive it being down.

    The demo's spine is the Argo comparison and the model field behind it. Chlorophyll and the
    moored buoys are additions, and a server in Brest or Miami being unreachable at bake time
    must cost us those additions rather than the whole bake. What is missing is printed rather
    than swallowed, because a silently short bake is worse than a loud one.
    """
    try:
        return list(source.fetch_profiles(bbox, start, end))
    except Exception as error:  # noqa: BLE001 - upstream fails in many ways, all the same to us
        print(f"[bake] WARNING: {what} unavailable ({error}); continuing without it")
        return []


def _bake_coverage(output_dir, profiles, grids, timesteps, mask_field_key, warp):
    """Write one Observation Coverage Volume per Timestep, and return the paths and range.

    The model's own missing-data mask is reused, so coverage is absent exactly where the ocean
    is absent. Marking land as "zero observations" would be true but useless, and it would put
    a solid band of the "no data" colour over every coastline and the whole sea floor.
    """
    paths: list[str] = []
    fields: list[np.ndarray] = []

    for index, stamp in enumerate(timesteps):
        window = [
            profile
            for profile in profiles
            if abs((profile.time - stamp).total_seconds()) <= COVERAGE_WINDOW_DAYS * 86400
        ]
        grid = grids[(mask_field_key, index)]
        mask = np.isnan(_warp_to_volume(grid, warp))
        field = observation_coverage(
            window, grid.latitudes, grid.longitudes, warp, DEPTH_SAMPLES, mask
        )
        fields.append(field.counts)
        print(
            f"[bake]   coverage {stamp:%Y-%m-%d}: {len(window)} casts, "
            f"{field.observed_fraction:.0%} of the ocean has a cast behind it"
        )

    # One range across every step, for the same reason the model Fields share one: a per-frame
    # range would make the bands breathe during playback and read as a real change in sampling.
    finite = np.concatenate([f[np.isfinite(f)].ravel() for f in fields])
    top = float(np.percentile(finite, 99.5)) if finite.size else COVERAGE_FIELD.display_max
    encoding_range = (0.0, max(top, float(BANDS[-1]) * 1.5))

    for index, counts in enumerate(fields):
        encoded = encode_volume(counts, vmin=encoding_range[0], vmax=encoding_range[1])
        name = f"volumes/{COVERAGE_FIELD.key}_{index:03d}.bin"
        (output_dir / name).write_bytes(encoded.data)
        paths.append(name)

    print(
        f"[bake] {COVERAGE_FIELD.key}: {len(paths)} volumes, "
        f"range {encoding_range[0]:.0f}..{encoding_range[1]:.0f} casts"
    )
    return paths, encoding_range, fields


def _warp_to_volume(grid: Grid, warp: DepthWarp) -> np.ndarray:
    """Native Levels -> the Volume's evenly spaced depth axis, column by column."""
    _, rows, columns = grid.values.shape
    block = np.empty((DEPTH_SAMPLES, rows, columns))
    for row in range(rows):
        for column in range(columns):
            block[:, row, column] = warp.resample(
                grid.levels, grid.values[:, row, column], DEPTH_SAMPLES
            )
    return block


def _encoding_range(grids: list[Grid], field) -> tuple[float, float]:
    """Percentile-clipped, so one anomalous cell cannot flatten the whole colour scale."""
    stacked = np.concatenate([g.values[np.isfinite(g.values)].ravel() for g in grids])
    if stacked.size == 0:
        return field.display_min, field.display_max
    return float(np.percentile(stacked, 0.5)), float(np.percentile(stacked, 99.5))


def _observed_density(profile):
    """Sigma-theta down one cast, or all-NaN if it did not report both ingredients."""
    temperature = profile.values.get("temperature")
    salinity = profile.values.get("salinity")
    if temperature is None or salinity is None:
        return np.full(len(profile.depths), np.nan)
    return profile_density(
        profile.latitude, profile.longitude, profile.depths, temperature, salinity
    )


def _build_anomaly_features(anomalies, grids, timesteps, coverage_counts, warp):
    """Find each Timestep's Anomaly Features and attach what is known about them.

    Finding a blob is the easy half. A coloured patch tells a user *that* something departed and
    nothing about what it is, so every entry here carries the four things that make it readable,
    and every one of them is measured rather than interpreted:

    Every one of them is read at the feature's **centre** cell, which is where the ring is drawn,
    because a user clicking a ring is asking about the water under it.

    - **Why.** Where the 20 degC isotherm sits at this exact cell, against its own average over
      the series. Across this bake that departure correlates +0.63 with the temperature anomaly
      at 100 m, so for a feature in the thermocline it is the cause rather than a coincidence.
      `isothermExplains` says whether the isotherm actually swept through this water, which is
      what separates an explanation from a nearby fact.
    - **What kind.** What salinity and density did in the same cell. Warm and fresh is a river
      lens; warm and salty is water that came from somewhere else. The frontend words it, but
      the numbers decide.
    - **Whether to believe it.** How many Argo casts stand behind that cell. A large anomaly in
      water with no observations is the model interpolating, and that is the single most valuable
      line on the panel.
    - **Who else saw it.** The nearest Float reporting at this Timestep, and how far off the
      model was against it.
    """
    isotherms = [
        isotherm_depth(grids[("temperature", i)], ISOTHERM_VALUE) for i in range(len(timesteps))
    ]
    # Land is NaN at every Timestep, so nanmean over it is an all-NaN slice. That is the
    # right answer and not worth a warning.
    with np.errstate(invalid="ignore"):
        with warnings.catch_warnings():
            warnings.simplefilter("ignore", RuntimeWarning)
            isotherm_mean = np.nanmean(np.stack(isotherms), axis=0)

    # Salinity and density departures are computed for the description only. They are not
    # rendered, so they are never encoded or written as Volumes.
    salinity_anomaly = anomaly_series([grids[("salinity", i)] for i in range(len(timesteps))])
    density_anomaly = anomaly_series(
        [grids[(DENSITY_FIELD.key, i)] for i in range(len(timesteps))]
    )

    found = find_anomaly_features(anomalies)
    out = []
    for index, step in enumerate(found):
        entries = []
        for feature in step:
            level, row, column = feature.centre_index
            here = isotherms[index][row, column]
            usually = isotherm_mean[row, column]
            slab = int(np.argmin(np.abs(warp.sample_depths(DEPTH_SAMPLES) - feature.depth_metres)))
            casts = coverage_counts[index][slab, row, column]

            entries.append(
                {
                    "sign": feature.sign,
                    "peakValue": round(feature.peak_value, 3),
                    "peakZ": round(feature.peak_z, 2),
                    "lat": feature.latitude,
                    "lon": feature.longitude,
                    "depth": feature.depth_metres,
                    "topMetres": feature.top_metres,
                    "bottomMetres": feature.bottom_metres,
                    "south": feature.south,
                    "north": feature.north,
                    "west": feature.west,
                    "east": feature.east,
                    "cells": feature.cell_count,
                    "footprintKm2": round(feature.footprint_km2),
                    "isothermDepth": _json_number(here),
                    "isothermDeparture": _json_number(here - usually),
                    # Only a cause if the isotherm actually moved through this water. See
                    # thermocline.swept_through for why containment is the wrong test.
                    "isothermExplains": swept_through(
                        here, usually, feature.top_metres, feature.bottom_metres
                    ),
                    "salinityDeparture": _json_number(
                        salinity_anomaly[index].values[level, row, column]
                    ),
                    "densityDeparture": _json_number(
                        density_anomaly[index].values[level, row, column]
                    ),
                    "casts": _json_number(casts),
                }
            )
        out.append(entries)
    return out


def _collocate_cast(cast, grids, index, fields):
    """One cast against one analysis step, as the `fields` dict the frontend reads.

    Pulled out of `_build_observations` because a mooring needs it twelve times - once per
    Timestep - and a Float needs it once. Returns {} when nothing compared, which the caller
    treats as "no entry" rather than writing an empty chart.
    """
    observed_for = dict(cast.values)
    observed_for[DENSITY_FIELD.key] = _observed_density(cast)

    out: dict[str, dict] = {}
    for field in fields:
        observed = observed_for.get(field.key)
        if observed is None or not np.isfinite(observed).any():
            continue
        try:
            result = collocate(
                grids[(field.key, index)],
                latitude=cast.latitude,
                longitude=cast.longitude,
                depths=cast.depths,
                observed=observed,
            )
        except ValueError:
            continue  # outside the baked region
        out[field.key] = {
            "depths": [round(float(d), 1) for d in result.depths],
            "observed": _json_numbers(result.observed),
            "modelled": _json_numbers(result.modelled),
            "residual": _json_numbers(result.residual),
            "matched": result.matched_count,
            # Measurements above the model's shallowest Level. The panel says so rather than
            # letting a reader assume the cast began where the model does.
            "aboveModel": result.above_model_count,
            "meanResidual": _json_number(result.mean_residual),
            "rmsResidual": _json_number(result.rms_residual),
        }
    return out


def _observed_only(cast) -> dict:
    """Channels a Float measured that the model has no counterpart for.

    Chlorophyll is the one that exists today. There is no gridded chlorophyll on this timeline -
    INCOIS's own ocean colour stops at 2020-05-01 - so it is an observation with nothing to be
    held against, and it is written somewhere the Collocation panel cannot mistake for a
    comparison. Drawing a second curve out of nowhere is the failure this shape prevents.
    """
    out: dict[str, dict] = {}
    for key, label, units in OBSERVED_ONLY_CHANNELS:
        values = cast.values.get(key)
        if values is None or not np.isfinite(values).any():
            continue
        keep = np.isfinite(values)
        out[key] = {
            "label": label,
            "units": units,
            "depths": [round(float(d), 1) for d in cast.depths[keep]],
            "observed": _json_numbers(values[keep]),
        }
    return out


def _build_observations(profiles, grids, timesteps, fields, extra=(), moorings=()):
    """Group Profiles into instruments, and pre-compute a Collocation for each.

    Which cast a Float's Collocation uses is a decision, not a default - see
    `collocation.choose_cast`. The Fixes drawn on screen come from every cast; only the chart
    comes from one.

    A mooring is different in the one way that matters: it does not move. So it gets a
    Collocation at **every** Timestep rather than one at the step nearest its cast, and the panel
    can follow the timeline. An Argo float cannot do that - by the next analysis it is somewhere
    else, and comparing its April cast against the July grid would be comparing two different
    pieces of water.
    """
    by_float: dict[str, list] = {}
    for profile in profiles:
        by_float.setdefault(profile.platform_id, []).append(profile)

    # BGC casts, indexed for lookup. They come from a sister dataset covering the same floats,
    # so they are matched by platform and time rather than merged blindly.
    by_bgc: dict[str, list] = {}
    for profile in extra:
        by_bgc.setdefault(profile.platform_id, []).append(profile)
    for casts in by_bgc.values():
        casts.sort(key=lambda p: p.time)

    floats = []
    collocations = {}
    for platform_id, casts in sorted(by_float.items()):
        casts.sort(key=lambda p: p.time)
        floats.append(
            {
                "id": platform_id,
                "kind": "float",
                # Every Fix carries how deep that cast went, not just the latest one. The panel
                # describes the Float at the moment on screen, so reading the newest cast's
                # depth against an April marker would report a dive that had not happened yet.
                "track": [
                    {
                        "lat": round(c.latitude, 4),
                        "lon": round(c.longitude, 4),
                        "time": c.time.isoformat(),
                        "depthMax": round(float(c.depths.max()), 1),
                    }
                    for c in casts
                ],
                "latest": {
                    "lat": round(casts[-1].latitude, 4),
                    "lon": round(casts[-1].longitude, 4),
                    "time": casts[-1].time.isoformat(),
                    "depthMax": round(float(casts[-1].depths.max()), 1),
                },
                "profileCount": len(casts),
            }
        )

        # Which cast to compare. The newest, unless the newest one compares against nothing -
        # see collocation.choose_cast for the measurement that made this a rule rather than
        # `casts[-1]`.
        primary = fields[0].key

        def matched_depths(cast, _id=platform_id) -> int:
            observed = cast.values.get(primary)
            if observed is None or not np.isfinite(observed).any():
                return 0
            try:
                return collocate(
                    grids[(primary, _nearest_timestep(cast.time, timesteps))],
                    latitude=cast.latitude,
                    longitude=cast.longitude,
                    depths=cast.depths,
                    observed=observed,
                ).matched_count
            except ValueError:
                return 0  # drifted outside the baked region

        chosen = casts[choose_cast(casts, matched_depths)]
        index = _nearest_timestep(chosen.time, timesteps)
        entry = {
            "kind": "float",
            "timestepIndex": index,
            "time": chosen.time.isoformat(),
            "fields": _collocate_cast(chosen, grids, index, fields),
        }

        # Chlorophyll, where this float carries a fluorometer. Taken from the BGC cast nearest
        # the one being charted rather than from the newest, so the two describe the same dive.
        bgc = by_bgc.get(platform_id)
        if bgc:
            nearest = min(bgc, key=lambda c: abs((c.time - chosen.time).total_seconds()))
            apart = abs((nearest.time - chosen.time).total_seconds())
            if apart <= BGC_MATCH_DAYS * 86400:
                observed_only = _observed_only(nearest)
                if observed_only:
                    entry["observedOnly"] = observed_only
                    entry["observedOnlyTime"] = nearest.time.isoformat()
                    # Under half a day is the same surfacing. Anything else is this float's
                    # neighbouring dive, and the panel says so rather than letting a reader
                    # assume both curves came off one cast.
                    entry["observedOnlySameDive"] = apart <= 43200
                    floats[-1]["bgc"] = True

        if entry["fields"] or entry.get("observedOnly"):
            collocations[platform_id] = entry

    # ---- moorings ----------------------------------------------------------------------
    #
    # Anchored, so there is no Track to draw and no reason to settle for one Timestep. Each one
    # gets a Collocation at every step, from the report nearest that step's analysis date.
    by_mooring: dict[str, list] = {}
    for profile in moorings:
        by_mooring.setdefault(profile.platform_id, []).append(profile)

    for platform_id, reports in sorted(by_mooring.items()):
        reports.sort(key=lambda p: p.time)
        anchor = reports[-1]

        steps: dict[str, dict] = {}
        for index, stamp in enumerate(timesteps):
            near = min(reports, key=lambda r: abs((r.time - stamp).total_seconds()))
            if abs((near.time - stamp).total_seconds()) > COVERAGE_WINDOW_DAYS * 86400:
                continue  # it was not reporting anywhere near this analysis
            got = _collocate_cast(near, grids, index, fields)
            if got:
                steps[str(index)] = {"time": near.time.isoformat(), "fields": got}
        if not steps:
            continue

        newest = max(int(k) for k in steps)
        floats.append(
            {
                "id": platform_id,
                "kind": "mooring",
                "country": anchor.country,
                # A mooring's "track" is one point repeated, which is the honest shape: it is
                # where the instrument is at every Timestep. The renderer uses it to place the
                # marker and draws no line, because a drift track for an anchored buoy would be
                # a measurement claim about a current that was never measured.
                "track": [
                    {
                        "lat": round(r.latitude, 4),
                        "lon": round(r.longitude, 4),
                        "time": r.time.isoformat(),
                        "depthMax": round(float(r.depths.max()), 1),
                    }
                    for r in reports
                ],
                "latest": {
                    "lat": round(anchor.latitude, 4),
                    "lon": round(anchor.longitude, 4),
                    "time": anchor.time.isoformat(),
                    "depthMax": round(float(anchor.depths.max()), 1),
                },
                "profileCount": len(reports),
            }
        )
        collocations[platform_id] = {
            "kind": "mooring",
            "timestepIndex": newest,
            "time": steps[str(newest)]["time"],
            "fields": steps[str(newest)]["fields"],
            # The part a Float cannot have: the same water column against every analysis in the
            # bake, from an instrument that never moved.
            "steps": steps,
        }

    return floats, collocations


def _nearest_timestep(when: datetime, timesteps) -> int:
    return int(np.argmin([abs((when - t).total_seconds()) for t in timesteps]))


def _json_numbers(values) -> list:
    return [_json_number(v) for v in values]


def _json_number(value):
    """JSON has no NaN. Missing is null, which the frontend renders as a gap, not a zero."""
    value = float(value)
    return None if not np.isfinite(value) else round(value, 4)


def main() -> None:
    parser = argparse.ArgumentParser(description="Bake INCOIS + Argo data into static assets.")
    parser.add_argument("--output", type=Path, default=Path("../web/public/data"))
    parser.add_argument("--timesteps", type=int, default=12, help="most recent N (10-day) steps")
    # Matched to the Timestep span on purpose. Floats are drawn at where they actually were at
    # the moment on screen, so a shorter profile window leaves the early frames with no
    # instruments at all - which reads as "the tool is broken" rather than "no data".
    parser.add_argument("--profile-days", type=int, default=130)
    parser.add_argument(
        "--grids",
        type=Path,
        default=Path("../data/grids"),
        help="where to keep native Grids for the API to answer with",
    )
    args = parser.parse_args()
    bake(args.output.resolve(), args.timesteps, args.profile_days, args.grids.resolve())


if __name__ == "__main__":
    main()
