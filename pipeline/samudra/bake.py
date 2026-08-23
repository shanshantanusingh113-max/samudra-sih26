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

from .collocation import collocate
from .depth_warp import DepthWarp
from .grid import Grid
from .palettes import all_tables
from .sources.argo import ArgoErddapSource
from .sources.base import BoundingBox
from .sources.incois import IncoisErddapSource
from .volume import encode_volume

# India's EEZ and the surrounding seas a forecaster actually works in: the Arabian Sea, the
# Bay of Bengal, the Lakshadweep and Andaman groups, and enough equatorial water to show the
# thermocline doming that drives monsoon forecasts.
DEMO_REGION = BoundingBox(south=-10.0, north=25.0, west=55.0, east=100.0)

SURFACE_METRES = 5.0
FLOOR_METRES = 2000.0
DEPTH_SAMPLES = 48


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

    # One encoding range per Field across every Timestep. If each frame were scaled to its own
    # min/max the colours would breathe as the animation ran and a viewer would read that
    # shimmer as a real seasonal signal.
    ranges = {
        field.key: _encoding_range(
            [grids[(field.key, i)] for i in range(len(wanted))], field
        )
        for field in model.fields()
    }

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
                    "fields": [f.key for f in model.fields()],
                    "timesteps": [t.isoformat() for t in wanted],
                }
            ),
            encoding="utf-8",
        )
        print(f"[bake] wrote {len(grids)} native grids to {grid_dir}")

    sample = grids[(model.fields()[0].key, 0)]
    volume_files: dict[str, list[str]] = {}

    for field in model.fields():
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

    end = wanted[-1]
    start = end - timedelta(days=profile_days)
    profiles = list(observations.fetch_profiles(DEMO_REGION, start, end))
    print(f"[bake] {len(profiles)} Argo profiles from {len(set(p.platform_id for p in profiles))} floats")

    floats, collocations = _build_observations(profiles, grids, wanted, model)
    (output_dir / "floats.json").write_text(json.dumps(floats), encoding="utf-8")
    (output_dir / "collocations.json").write_text(json.dumps(collocations), encoding="utf-8")

    if grid_dir:
        np.savez_compressed(
            grid_dir / "profiles.npz",
            **{
                f"{p.platform_id}|{p.time.isoformat()}|{p.latitude}|{p.longitude}": np.vstack(
                    [p.depths, p.values.get("temperature"), p.values.get("salinity")]
                )
                for p in profiles
            },
        )

    manifest = {
        "generated": datetime.now(timezone.utc).isoformat(),
        "region": asdict(DEMO_REGION),
        "sources": [
            {"name": model.name, "attribution": model.attribution},
            {"name": observations.name, "attribution": observations.attribution},
        ],
        "fields": [asdict(f) | {"range": list(ranges[f.key])} for f in model.fields()],
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
        "palettes": all_tables(),
        "floatCount": len(floats),
    }
    (output_dir / "manifest.json").write_text(json.dumps(manifest), encoding="utf-8")
    print(f"[bake] wrote manifest to {output_dir}")


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


def _build_observations(profiles, grids, timesteps, model):
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
        for field in model.fields():
            grid = grids[(field.key, index)]
            observed = latest.values.get(field.key)
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
