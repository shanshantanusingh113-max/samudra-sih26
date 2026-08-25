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
from dataclasses import asdict
from datetime import datetime, timedelta, timezone
from pathlib import Path

import numpy as np

from .anomaly import anomaly_series, symmetric_encoding_range
from .collocation import collocate
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
from .sources.argo import ArgoErddapSource
from .sources.base import BoundingBox, FieldSpec
from .sources.incois import IncoisErddapSource
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

    coverage_paths, coverage_range = _bake_coverage(
        output_dir, profiles, grids, wanted, model.fields()[0].key, warp
    )
    volume_files[COVERAGE_FIELD.key] = coverage_paths
    ranges[COVERAGE_FIELD.key] = coverage_range

    # Density joins the Collocation because a Float measures both of its ingredients, so both
    # sides of the comparison can be put through the same TEOS-10 chain. The anomaly cannot: a
    # single cast has no baseline of its own to depart from.
    collocated = [*model.fields(), DENSITY_FIELD]
    floats, collocations = _build_observations(in_region, grids, wanted, collocated)
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
        "sources": [
            {"name": model.name, "attribution": model.attribution},
            {"name": observations.name, "attribution": observations.attribution},
        ],
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
    }
    (output_dir / "manifest.json").write_text(json.dumps(manifest), encoding="utf-8")
    print(f"[bake] wrote manifest to {output_dir}")


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
    return paths, encoding_range


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


def _build_observations(profiles, grids, timesteps, fields):
    """Group Profiles into Floats, and pre-compute a Collocation for each latest cast."""
    by_float: dict[str, list] = {}
    for profile in profiles:
        by_float.setdefault(profile.platform_id, []).append(profile)

    floats = []
    collocations = {}
    for platform_id, casts in sorted(by_float.items()):
        casts.sort(key=lambda p: p.time)
        floats.append(
            {
                "id": platform_id,
                "track": [
                    {
                        "lat": round(c.latitude, 4),
                        "lon": round(c.longitude, 4),
                        "time": c.time.isoformat(),
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

        latest = casts[-1]
        index = _nearest_timestep(latest.time, timesteps)
        entry = {"timestepIndex": index, "time": latest.time.isoformat(), "fields": {}}
        observed_for = dict(latest.values)
        observed_for[DENSITY_FIELD.key] = _observed_density(latest)
        for field in fields:
            grid = grids[(field.key, index)]
            observed = observed_for.get(field.key)
            if observed is None or not np.isfinite(observed).any():
                continue
            try:
                result = collocate(
                    grid,
                    latitude=latest.latitude,
                    longitude=latest.longitude,
                    depths=latest.depths,
                    observed=observed,
                )
            except ValueError:
                continue  # the Float has drifted outside the baked region
            entry["fields"][field.key] = {
                "depths": [round(float(d), 1) for d in result.depths],
                "observed": _json_numbers(result.observed),
                "modelled": _json_numbers(result.modelled),
                "residual": _json_numbers(result.residual),
                "matched": result.matched_count,
                "meanResidual": _json_number(result.mean_residual),
                "rmsResidual": _json_number(result.rms_residual),
            }
        if entry["fields"]:
            collocations[platform_id] = entry

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
