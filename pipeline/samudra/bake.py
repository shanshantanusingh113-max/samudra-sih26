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
from .climatology import climatological_anomaly, month_of
from .collocation import choose_cast, collocate
from .coverage import (
    BANDS,
    BAND_LABELS,
    METRES_PER_DEGREE,
    RADIUS_DEGREES,
    observation_coverage,
)
from .density import potential_density, profile_density
from .drift import (
    DEFAULT_STEP_HOURS,
    PARKING_DEPTH_METRES,
    CurrentSeries,
    DriftStep,
    separation_km,
    track_against_drift,
)
from .depth_warp import DepthWarp
from .grid import Grid
from .hazard import (
    barrier_layer_thickness,
    depth_of_26,
    heat_potential,
    isothermal_layer_depth,
    mixed_layer_depth,
)
from .palettes import all_tables, banded_table
from .residuals import bias_grid, field_bias, positions_from, rank_residuals
from .thermocline import isotherm_depth, swept_through
from .sources.argo import ArgoErddapSource, BgcArgoSource
from .sources.base import BoundingBox, FieldSpec
from .sources.copernicus import CopernicusCurrentsSource, speed as current_speed
from .sources.glider import GliderSource
from .sources.incois import IncoisErddapSource, IncoisMcCrearySource
from .sources.osmc import OsmcSource
from .sources.woa import WoaClimatologySource
from .volume import encode_volume

# India's EEZ and the surrounding seas a forecaster actually works in: the Arabian Sea, the
# Bay of Bengal, the Lakshadweep and Andaman groups, and enough equatorial water to show the
# thermocline doming that drives monsoon forecasts.
#
# The western edge is 45 E rather than 55 E because the Somali Current core sits at 50 to 52 E.
# At 55 E the block showed only its eastern flank - about 1.2 m/s against the 3.00 m/s measured
# at 9.50 N, 51.58 E on 2026-07-30 - so the most dramatic current in the Indian Ocean fell just
# off the edge of the picture. INCOIS's grid runs 30.5 to 119.5 E, so 45 E is well inside the
# source. Widening it moves every derived number in the repository; they are re-measured from a
# bake, never adjusted by arithmetic.
DEMO_REGION = BoundingBox(south=-10.0, north=25.0, west=45.0, east=100.0)

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
    group="evidence",
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
    group="state",
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
    group="change",
    description=(
        "Departure of each cell from its own average across the twelve Timesteps in this bake, "
        "roughly April to July 2026. A seasonal swing, not a climatological normal: there is no "
        "thirty-year reference series in this build."
    ),
)

# Departure from a real thirty-year normal, rather than from four months of its own.
#
# The Field above is a *seasonal swing* and says so. This one is what a forecaster means by
# "warmer than usual": the 2026 analysis minus the World Ocean Atlas 2023 1991-2020 mean for
# that Timestep's own calendar month. One degree, monthly, on exactly the node centres INCOIS
# use, which is the whole reason it fits - see `sources/woa.py`.
#
# Two caveats travel with it and are printed on the panel rather than buried here: the atlas is
# monthly and the bake is ten-daily, so three Timesteps in a month share one baseline; and the
# atlas stops at 1500 m while the analysis runs to 2000 m, so the deepest Levels are Mask.
NORMAL_ANOMALY_FIELD = FieldSpec(
    key="temperature_normal_anomaly",
    label="Temperature vs Normal",
    units="°C",
    palette="balance",
    display_min=-3.0,
    display_max=3.0,
    emphasis=0.55,
    opacity=0.05,
    group="change",
    description=(
        "Departure from the World Ocean Atlas 2023 mean for the same calendar month, averaged "
        "over 1991-2020. This is a climatological normal: the Temperature Anomaly beside it is "
        "a departure from this bake's own four months. Below 1500 m the atlas has no normal."
    ),
)

# The second analysis of the same floats, minus the first.
#
# INCOIS publish two independent analyses of one set of Argo profiles - the Variational Analysis
# Methodology this platform already reads, and Kessler-McCreary. Where two careful analyses of
# the same observations disagree is a real uncertainty signal, and it costs no new source, no
# account and no new science. Signed, because the sign says which analysis is the warmer one.
SPREAD_FIELD = FieldSpec(
    key="analysis_spread",
    label="Analysis Spread",
    units="°C",
    palette="balance",
    display_min=-2.0,
    display_max=2.0,
    emphasis=0.4,
    opacity=0.05,
    group="evidence",
    description=(
        "INCOIS analyse the same Argo floats twice, by two different methods. This is the "
        "difference between them: their Variational Analysis minus their Kessler-McCreary "
        "analysis. Where it is near zero, two independent methods agree about the water. Where "
        "it is large, neither of them really knows - and that is usually where nothing measured."
    ),
)

# Order is the order of the buttons in the Variable selector. Fetched Fields first, then the
# ones derived from them, then the evidence behind all of it.
DERIVED_FIELDS = (DENSITY_FIELD, ANOMALY_FIELD)


# ---------------------------------------------------------------------------------------------
# The disaster-management Fields.
#
# PS 26067's theme became Disaster Management in September 2026 and the platform had no Field a
# cyclone forecaster would name. These five are the ones they would. All five come out of the
# temperature and salinity already in the Grid - see `samudra/hazard.py` for the definitions and
# for the vertical-resolution limit each of them inherits.
#
# **None of them is a Volume**, and that is the point rather than a compromise. Three of them ARE
# a depth, so they are drawn as a warped sheet sitting inside the block at that depth - you watch
# the 26 degC isotherm dome up and collapse across four months with the Floats sitting on it, and
# no flat map can do that. Two of them are a whole-column total, so they are draped on the sea
# surface, which is honestly where a column total lives.
#
# Because they are not Volumes they are never byte-quantised and never depth-warped: they ship as
# float32 on the Grid's own horizontal axes. That is the first rule, not an optimisation - a
# reader reads a depth in metres off these.
# ---------------------------------------------------------------------------------------------
HAZARD_FIELDS = (
    FieldSpec(
        key="heat_potential",
        label="Cyclone Heat Potential",
        units="kJ/cm²",
        palette="amp",
        display_min=0.0,
        display_max=150.0,
        isosurface=False,
        render="column",
        group="hazard",
        description=(
            "How much heat is stored in the water warm enough to feed a tropical cyclone: the "
            "heat above 26 °C, from the surface down to where the water drops through it. "
            "This is the number that separates a storm that intensifies from one that does not, "
            "because a cyclone stirs the column and a thin warm skin cools itself out. Above "
            "about 60 kJ/cm² is the conventional threshold for rapid intensification."
        ),
    ),
    FieldSpec(
        key="d26",
        label="Depth of 26 °C",
        units="m",
        palette="deep",
        display_min=0.0,
        display_max=150.0,
        isosurface=False,
        render="depth",
        group="hazard",
        description=(
            "How deep the water warm enough to feed a cyclone runs. Drawn as a sheet inside the "
            "block, at the depth it actually sits: pale where it is near the surface, dark where "
            "it runs deep. Watch it dome up and collapse as the Timestep advances."
        ),
    ),
    FieldSpec(
        key="mixed_layer_depth",
        label="Mixed Layer Depth",
        units="m",
        palette="deep",
        display_min=0.0,
        display_max=120.0,
        isosurface=False,
        render="depth",
        group="hazard",
        description=(
            "How deep the wind and the waves have stirred the water into one uniform body, by "
            "density. Below it the ocean is layered and still. A shallow mixed layer warms "
            "quickly and cools quickly; a deep one resists both."
        ),
    ),
    FieldSpec(
        key="isothermal_layer_depth",
        label="Isothermal Layer Depth",
        units="m",
        palette="deep",
        display_min=0.0,
        display_max=150.0,
        isosurface=False,
        render="depth",
        group="hazard",
        description=(
            "How deep the water is all one temperature. Where fresh water sits on top, this runs "
            "deeper than the Mixed Layer Depth, and the gap between them is the barrier layer."
        ),
    ),
    FieldSpec(
        key="barrier_layer",
        label="Barrier Layer Thickness",
        units="m",
        palette="balance",
        display_min=-40.0,
        display_max=40.0,
        isosurface=False,
        render="column",
        group="hazard",
        description=(
            "Isothermal Layer Depth minus Mixed Layer Depth. Where river water floats on top of "
            "warm salty water, a cyclone cannot stir cold water up into its own path, so the sea "
            "surface stays warm and the storm keeps its fuel. The Bay of Bengal has the strongest "
            "barrier layers in the world ocean and takes the storms to match. Negative means the "
            "opposite: salinity is stratifying water the temperature says is mixed."
        ),
    ),
)

# Which hazard Field comes from which computation. Kept beside the specs so adding a sixth is one
# entry in each and nothing else.
HAZARD_FIELD_KEYS = tuple(f.key for f in HAZARD_FIELDS)


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


# The bias map's cell, in degrees, and how many instruments a cell needs before it is drawn.
#
# 5 degrees is about 550 km, which is roughly four times the model's own 1 degree cell and is
# the coarsest thing that still separates the Arabian Sea from the Bay of Bengal. Finer than
# that and most cells hold one float; coarser and the map has nothing to say about *where*.
#
# Three instruments is the smallest number that can disagree with itself. A one-float cell is a
# measurement of one float, and painting it in the same colours as a twelve-float cell would
# claim the two are equally well known - the same refusal `MIN_CELLS` makes for an Anomaly
# Feature. Cells below the threshold are not drawn at all rather than drawn faintly.
RESIDUAL_CELL_DEGREES = 5.0
RESIDUAL_MIN_COUNT = 3

# How many matched depths a comparison must rest on before it is ranked, **per kind**.
#
# An Argo cast reports at a median 221 of this model's depths, so one that matched 10 is a
# truncated dive rather than a finding - and before this, a float with three matched depths
# ranked fifth worst in the Indian Ocean, in a list that printed the gap and never printed what
# it rested on. A moored buoy carries a handful of sensors down a wire, 3 to 9 here, and that is
# the whole instrument working normally. One flat threshold either keeps the truncated casts or
# deletes every buoy, and the buoys are the only instruments in this bake that INCOIS's analysis
# did not assimilate. See `residuals.rank_residuals`.
RESIDUAL_MIN_MATCHED = {"float": 20, "mooring": 1}


# How often the baked drift trajectory is sampled for drawing, in hours.
#
# The integration runs at six hours; this is only how finely the *line* is written out. One day
# is about 86 km at 1 m/s, well inside the 110 km grid cell the current field is on, so a daily
# polyline is smooth against the data behind it and a quarter of the size of a six-hourly one.
DRIFT_SAMPLE_HOURS = 24.0

# The horizons the summary reports separation at. Ten days is one Argo cycle - one surfacing to
# the next - and ninety is most of this bake's window.
DRIFT_HORIZON_DAYS = (10.0, 30.0, 60.0, 90.0)


# Which Fields ship their **native Grid** to the browser as well as their Volume.
#
# A Volume is a rendering artefact: quantised to a byte, depth-warped, back-filled across land.
# The vertical section is a chart with metres down one axis and a value read off the colour, so
# it cannot come from one - the first rule in `CLAUDE.md`. These three are what an instrument
# measures and what the section offers.
#
# 24 levels x 36 x 56 x 4 bytes is 194 KB a file, 6.97 MB for three Fields across twelve steps,
# against 58.8 MB of baked data already. That is the price of the section working **on the
# static deployment and with the network unplugged**, rather than only when somebody remembers
# to start uvicorn - and the live site at rak2315.github.io has no API at all.
SECTION_FIELD_KEYS = ("temperature", "salinity", "density")


def bake(output_dir: Path, timesteps: int, profile_days: int, grid_dir: Path | None = None) -> None:
    if timesteps < 1:
        raise ValueError(f"need at least one timestep, got {timesteps}")

    output_dir.mkdir(parents=True, exist_ok=True)
    (output_dir / "volumes").mkdir(exist_ok=True)
    # Clear the generated directories first. The Field set changes between rounds - the current
    # overlay used to be a dozen PNGs here and is now vector data - and a file nobody rewrites is
    # a file the browser can still fetch. A stale artefact from a previous shape of the platform
    # is worse than a missing one, because it looks current.
    for stale in (output_dir / "volumes").glob("*.bin"):
        stale.unlink()
    for folder in ("currents", "surfaces", "grids"):
        if (output_dir / folder).exists():
            for stale in (output_dir / folder).iterdir():
                if stale.is_file():
                    stale.unlink()
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
    # Three more Source Adapters, added in the September 2026 round and behind the same two
    # protocols as the four before them. None is on the critical path.
    second_analysis = IncoisMcCrearySource()
    copernicus = CopernicusCurrentsSource()
    climatology = WoaClimatologySource()
    gliders = GliderSource(index_lines=_glider_index())
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

    # ---- the climatological normal ----------------------------------------------------------
    #
    # Not fatal. A bake that cannot reach NOAA keeps every other Field and simply does not offer
    # this one, exactly as a bake without Copernicus keeps everything but the currents.
    normal_anomalies, normal_stats = _build_normal_anomaly(climatology, grids, wanted)
    if normal_anomalies:
        for index, grid in enumerate(normal_anomalies):
            grids[(NORMAL_ANOMALY_FIELD.key, index)] = grid
        volume_fields = [*volume_fields, NORMAL_ANOMALY_FIELD]

    # ---- INCOIS's second analysis of the same floats ----------------------------------------
    #
    # Same host, same protocol, same request builder. What it brings is the provider's own
    # observation count, the provider's own error estimate, and a second independent analysis to
    # difference against the first. Not fatal: if their server is down we lose three evidence
    # Fields and keep the platform.
    evidence_fields: list[FieldSpec] = []
    if _fetch_second_analysis(second_analysis, grids, wanted):
        for index in range(len(wanted)):
            first = grids[("temperature", index)]
            other = grids[("mccreary_temperature", index)]
            grids[(SPREAD_FIELD.key, index)] = Grid(
                levels=first.levels,
                latitudes=first.latitudes,
                longitudes=first.longitudes,
                values=first.values - other.values,
            )
        evidence_fields = [*second_analysis.fields(), SPREAD_FIELD]
        volume_fields = [*volume_fields, *evidence_fields]

    # ---- currents, as numbers --------------------------------------------------------------
    #
    # Supersedes the rendered-image overlay this platform used to carry. See ADR 0013 and
    # `samudra/sources/copernicus.py`; the short version is that the numbers pass the same test
    # that killed our own derived geostrophic field. Not fatal either: Copernicus needs a
    # credential, and a bake on a machine without one keeps everything else.
    vectors = _fetch_currents(copernicus, grids, wanted, sample_axes=grids[("temperature", 0)])
    current_fields = list(copernicus.fields()) if vectors else []
    volume_fields = [*volume_fields, *current_fields]

    # ---- the disaster-management Fields ----------------------------------------------------
    #
    # Computed here from Grids already in hand, exactly as density is. Two dimensions rather than
    # three, so they never touch the Volume encoder.
    surfaces = _build_hazard_fields(grids, wanted)
    print(f"[bake] hazard fields: {', '.join(HAZARD_FIELD_KEYS)}")

    # One encoding range per Field across every Timestep. If each frame were scaled to its own
    # min/max the colours would breathe as the animation ran and a viewer would read that
    # shimmer as a real seasonal signal.
    ranges = {
        field.key: _encoding_range(
            [grids[(field.key, i)] for i in range(len(wanted))], field
        )
        for field in volume_fields
    }
    # Except the diverging Fields, whose ranges have to be symmetric or the palette's midpoint
    # stops meaning "no departure". See samudra/anomaly.py.
    ranges[ANOMALY_FIELD.key] = symmetric_encoding_range(anomalies)
    if normal_anomalies:
        ranges[NORMAL_ANOMALY_FIELD.key] = symmetric_encoding_range(normal_anomalies)
    if SPREAD_FIELD.key in ranges:
        ranges[SPREAD_FIELD.key] = symmetric_encoding_range(
            [grids[(SPREAD_FIELD.key, i)] for i in range(len(wanted))]
        )

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

    # Gliders. PS 26067 names them three times, so the archive it names is read - and what comes
    # back is the finding, not the casts. See samudra/sources/glider.py.
    _try_fetch("gliders", gliders, DEMO_REGION, start, end)
    glider_finding = gliders.last_finding
    if glider_finding:
        print(
            f"[bake] gliders: {glider_finding['castsInRegion']} casts in the region from "
            f"{glider_finding['gliders']} glider(s), newest {glider_finding['newestCast']}, "
            f"{glider_finding['castsInWindow']} inside this bake's window"
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

    surface_files = _write_surfaces(output_dir, surfaces, wanted)
    surface_ranges = {key: _surface_range(surfaces[key], key) for key in HAZARD_FIELD_KEYS}
    ranges.update(surface_ranges)
    for key, (low, high) in surface_ranges.items():
        print(f"[bake] {key}: {len(wanted)} surfaces, range {low:.2f}..{high:.2f}")

    vector_files = _write_vectors(output_dir, vectors, wanted) if vectors else None
    grid_files = _write_native_grids(
        output_dir, grids, wanted, [k for k in SECTION_FIELD_KEYS if (k, 0) in grids]
    )

    coverage_paths, coverage_range, coverage_fields, coverage_empty = _bake_coverage(
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

    drift = _build_drift(floats, vectors, wanted)
    if drift:
        (output_dir / "drift.json").write_text(json.dumps(drift), encoding="utf-8")
        for horizon in drift["summary"]["horizons"]:
            print(
                f"[bake] drift at {horizon['days']:.0f} days "f"(median {horizon['medianDaysUsed']:.1f} used): {horizon['floats']} floats, median "
                f"separation {horizon['medianSeparationKm']:.0f} km against "
                f"{horizon['medianTravelledKm']:.0f} km actually travelled"
            )
        cycle = drift["summary"].get("cycle")
        if cycle:
            print(
                f"[bake] drift over one Argo cycle: {cycle['count']} cycles, median "
                f"{cycle['medianKm']:.0f} km, ninetieth percentile {cycle['p90Km']:.0f} km"
            )
    else:
        print("[bake] no currents, so no drift comparison")

    residuals = _build_residuals(collocations, floats, collocated, ranges)
    (output_dir / "residuals.json").write_text(json.dumps(residuals), encoding="utf-8")
    for key, block in residuals["fields"].items():
        summary = block["summary"]
        print(
            f"[bake] {key} bias: {summary['count']} instruments, mean "
            f"{summary['meanBias']:+.3f}, RMS {summary['rms']:.3f}, "
            f"{len(block['cells'])} map cells with {RESIDUAL_MIN_COUNT}+ behind them"
        )

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
                    "name": climatology.name,
                    "attribution": climatology.attribution,
                    "role": "Climatological normal (1991-2020)",
                    "endpoint": climatology.endpoint,
                }
            ]
            if normal_anomalies
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
                    "name": second_analysis.name,
                    "attribution": second_analysis.attribution,
                    "role": "Second gridded analysis, and the provider's own evidence channels",
                    "endpoint": second_analysis.endpoint,
                }
            ]
            if evidence_fields
            else []
        )
        + (
            [
                {
                    "name": copernicus.name,
                    "attribution": copernicus.attribution,
                    "role": "Current vectors",
                    "endpoint": copernicus.endpoint,
                }
            ]
            if vectors
            else []
        )
        + (
            [
                {
                    "name": gliders.name,
                    "attribution": gliders.attribution,
                    "role": "Glider profiles - read, and empty for a reason worth reading",
                    "endpoint": gliders.endpoint,
                }
            ]
            if glider_finding
            else []
        ),
        # Order here is the order of the Variable selector, within each group. `group` is what
        # splits it: thirteen Fields cannot be a flat list of buttons, and a forecaster looks for
        # a hazard quantity under HAZARD rather than under "the fourth one along".
        "fields": [
            asdict(f) | {"range": list(ranges[f.key])}
            for f in (*volume_fields, COVERAGE_FIELD, *HAZARD_FIELDS)
        ],
        # What each group is called, in the order the panel shows them.
        "fieldGroups": [
            {"key": "state", "label": "Ocean state"},
            {"key": "hazard", "label": "Hazard"},
            {"key": "circulation", "label": "Circulation"},
            {"key": "evidence", "label": "Evidence"},
            {"key": "change", "label": "Change"},
        ],
        "coverage": {
            "bands": list(BANDS),
            "labels": list(BAND_LABELS),
            "windowDays": COVERAGE_WINDOW_DAYS,
            "radiusKm": round(RADIUS_DEGREES * METRES_PER_DEGREE / 1000),
            # How much of the block has no cast behind it at all. Measured here rather than
            # written into the guide panel, because it moves on every bake and a hardcoded
            # copy of it was stale for a month without anybody noticing.
            "emptyFraction": _json_number(coverage_empty),
        },
        # What the climatological Field is, measured. Absent when NOAA could not be reached,
        # which is the same shape every other optional block in this manifest has.
        **({"normalAnomaly": normal_stats} if normal_stats else {}),
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
            # The model's own Levels, unwarped. Needed by anything reading a native-grid file
            # rather than a Volume - the current vectors are indexed on these.
            "levelMetres": [round(float(d), 2) for d in sample.levels],
            "surfaceMetres": SURFACE_METRES,
            "floorMetres": FLOOR_METRES,
            "west": float(sample.longitudes[0]),
            "east": float(sample.longitudes[-1]),
            "south": float(sample.latitudes[0]),
            "north": float(sample.latitudes[-1]),
        },
        "volumeFiles": volume_files,
        # The native Grid, float32, for the Fields a vertical section can be cut through. Not a
        # Volume: a section is a chart somebody reads metres and degrees off, and the first rule
        # here is that a scientific question is never answered from a Volume.
        "gridFiles": grid_files,
        # The Fields that are not Volumes: float32 on the Grid's own horizontal axes, one file
        # per Field per Timestep, row 0 southernmost and column 0 westernmost. NaN is Mask.
        "surfaceFiles": surface_files,
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
        **(
            {
                "currents": {
                    "files": vector_files,
                    "field": current_fields[0].key if current_fields else None,
                    "attribution": copernicus.attribution,
                    "dataset": copernicus.dataset,
                    # float32 pairs, [level][lat][lon][u, v], on `volume.levelMetres`.
                    "levels": len(sample.levels),
                    "width": len(sample.longitudes),
                    "height": len(sample.latitudes),
                }
            }
            if vectors
            else {}
        ),
        # The glider answer. Present whether or not a single cast came back, because "we read
        # the archive the PS names and this is what is in it" is the finding.
        **({"gliders": glider_finding} if glider_finding else {}),
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
        # Where the model most disagrees with the instruments. A separate file because
        # collocations.json is 10.5 MB and is deliberately fetched after first paint, and this
        # is about 200 KB - so the bias map is on screen while the charts behind it are still
        # arriving. See samudra/residuals.py.
        "residuals": {
            "file": "residuals.json",
            "cellDegrees": RESIDUAL_CELL_DEGREES,
            "minCount": RESIDUAL_MIN_COUNT,
            "minMatched": dict(RESIDUAL_MIN_MATCHED),
        },
        # The drift check. Absent when the bake could not reach Copernicus, in which case there
        # is no current field to integrate and the panel says so rather than drawing nothing.
        **(
            {
                "drift": {
                    "file": "drift.json",
                    "parkingDepthMetres": PARKING_DEPTH_METRES,
                    "stepHours": DEFAULT_STEP_HOURS,
                    "floats": drift["summary"]["floats"],
                    "horizons": drift["summary"]["horizons"],
                    "cycle": drift["summary"]["cycle"],
                }
            }
            if drift
            else {}
        ),
    }
    (output_dir / "manifest.json").write_text(json.dumps(manifest), encoding="utf-8")
    print(f"[bake] wrote manifest to {output_dir}")


def _glider_index():
    """The regional extract of the EGO glider index, if it is on disk.

    The complete index is 248 MB and no bake should download it. `data/glider/` holds the 2,876
    rows that fall inside DEMO_REGION, cut from the real thing on 2026-09-01 with the archive's
    own header kept, so the finding is reproducible in every bake for 1.4 MB. Missing, the
    adapter falls back to the FTP the PS names.
    """
    path = Path(__file__).resolve().parents[2] / "data" / "glider" / "glider_prof_index_region.txt"
    if not path.exists():
        return None
    return path.read_text(encoding="utf-8").splitlines()


def _fetch_second_analysis(source, grids, timesteps) -> bool:
    """INCOIS's Kessler-McCreary analysis and its evidence channels, or nothing at all.

    Returns whether it landed. Not fatal: these three Fields are the credibility layer, and
    losing them to an unreachable server must not cost the comparison the platform is built on.
    """
    keys = [f.key for f in source.fields()] + ["mccreary_temperature"]
    try:
        for key in keys:
            for index, stamp in enumerate(timesteps):
                grids[(key, index)] = source.fetch_grid(key, stamp, DEMO_REGION)
            print(f"[bake]   {key} x{len(timesteps)}")
    except Exception as error:  # noqa: BLE001 - one upstream, many ways to be down
        print(f"[bake] WARNING: second analysis unavailable ({error}); continuing without it")
        for key in keys:
            for index in range(len(timesteps)):
                grids.pop((key, index), None)
        return False
    return True


def _fetch_currents(source, grids, timesteps, sample_axes):
    """Current vectors on the model's own axes, one (u, v) pair per Timestep, or None.

    Also puts the speed into `grids` as a Field, because a magnitude is the only part of a
    vector a scalar Volume can honestly carry - the direction is drawn as arrows from the
    components and nowhere else.

    Not fatal. Copernicus needs a credential, and a bake on a machine that has not run
    `copernicusmarine login` keeps every other Field.
    """
    pairs = []
    try:
        for index, stamp in enumerate(timesteps):
            u, v = source.fetch_on_axes(
                stamp,
                DEMO_REGION,
                sample_axes.levels,
                sample_axes.latitudes,
                sample_axes.longitudes,
            )
            pairs.append((u, v))
            grids[("current_speed", index)] = current_speed(u, v)
            surface = np.hypot(u.values[0], v.values[0])
            fastest = float(np.nanmax(surface)) if np.isfinite(surface).any() else float("nan")
            print(f"[bake]   currents {stamp:%Y-%m-%d}: fastest surface water {fastest:.2f} m/s")
    except Exception as error:  # noqa: BLE001 - credentials, network, upstream, all the same
        print(f"[bake] WARNING: currents unavailable ({error}); continuing without them")
        for index in range(len(timesteps)):
            grids.pop(("current_speed", index), None)
        return None
    return pairs


def _build_hazard_fields(grids, timesteps) -> dict[str, list[np.ndarray]]:
    """The five disaster-management Fields, one (lat, lon) array per Timestep each.

    Two dimensions, so they never reach the Volume encoder and are never depth-warped. See
    `samudra/hazard.py` for what each one is and for the vertical-resolution limit they inherit
    from the Levels.
    """
    out: dict[str, list[np.ndarray]] = {key: [] for key in HAZARD_FIELD_KEYS}
    for index in range(len(timesteps)):
        temperature = grids[("temperature", index)]
        density = grids[(DENSITY_FIELD.key, index)]

        mixed = mixed_layer_depth(density)
        isothermal = isothermal_layer_depth(temperature)

        out["heat_potential"].append(heat_potential(temperature))
        out["d26"].append(depth_of_26(temperature))
        out["mixed_layer_depth"].append(mixed)
        out["isothermal_layer_depth"].append(isothermal)
        out["barrier_layer"].append(barrier_layer_thickness(isothermal, mixed))
    return out


def _write_surfaces(output_dir: Path, surfaces, timesteps) -> dict[str, list[str]]:
    """One float32 file per hazard Field per Timestep, on the Grid's own horizontal axes.

    **Not encoded.** These are not Volumes: a reader reads a depth in metres straight off them,
    so quantising them to bytes would break the project's first rule in the one place a user
    would never see it. float32 costs 8 KB a file here, which is not worth a compromise.

    Layout is row-major with row 0 the southernmost latitude and column 0 the westernmost
    longitude - the Grid's own order, and the same way round as the Volume texture's v axis.
    NaN is Mask, and the frontend must draw it as absent rather than as zero.
    """
    directory = output_dir / "surfaces"
    directory.mkdir(exist_ok=True)
    for stale in directory.glob("*.bin"):
        stale.unlink()

    files: dict[str, list[str]] = {}
    for key, steps in surfaces.items():
        paths = []
        for index in range(len(timesteps)):
            name = f"surfaces/{key}_{index:03d}.bin"
            (output_dir / name).write_bytes(
                np.asarray(steps[index], dtype="<f4").tobytes(order="C")
            )
            paths.append(name)
        files[key] = paths
    return files


def _surface_range(steps, key: str) -> tuple[float, float]:
    """Percentile-clipped across every Timestep, and symmetric where the palette diverges."""
    stacked = np.concatenate([s[np.isfinite(s)].ravel() for s in steps])
    if stacked.size == 0:
        return 0.0, 1.0
    if key == "barrier_layer":
        # A diverging palette whose midpoint does not sit on zero says the wrong thing about
        # every cell at once. Same rule as the anomaly Field.
        limit = float(np.percentile(np.abs(stacked), 99.0)) or 1.0
        return -limit, limit
    return float(np.percentile(stacked, 0.5)), float(np.percentile(stacked, 99.5))


def _write_native_grids(output_dir: Path, grids, timesteps, fields) -> dict[str, list[str]]:
    """The native Grid as float32, for the Fields a vertical section can be cut through.

    Row 0 is the southernmost latitude and column 0 the westernmost longitude - the same way
    round as the vector files and the hazard surfaces, and the same way round as the Volume
    texture's v axis, which this project had to learn once the hard way.

    NaN is Mask and stays NaN: the browser's section has to show a gap where the model has no
    ocean, and a zero there would draw 0 degC water against a coast.
    """
    directory = output_dir / "grids"
    directory.mkdir(exist_ok=True)
    for stale in directory.glob("*"):
        stale.unlink()

    out: dict[str, list[str]] = {}
    for field in fields:
        paths = []
        for index in range(len(timesteps)):
            grid = grids[(field, index)]
            name = f"grids/{field}_{index:03d}.bin"
            (output_dir / name).write_bytes(grid.values.astype("<f4").tobytes(order="C"))
            paths.append(name)
        out[field] = paths

    total = sum((output_dir / path).stat().st_size for paths in out.values() for path in paths)
    print(f"[bake] native grids: {len(out)} fields, {total / 1e6:.1f} MB")
    return out


def _write_vectors(output_dir: Path, pairs, timesteps) -> list[str]:
    """Current components as float32, on the model's own Levels and horizontal axes.

    Interleaved (u, v) per cell, indexed [level][lat][lon][component], row 0 southernmost. Like
    the hazard surfaces these are the Grid rather than a Volume - the speed under the cursor and
    the length of every arrow are read off these, and both are measurements.

    387 KB per Timestep, fetched only when somebody selects the Field.
    """
    directory = output_dir / "currents"
    directory.mkdir(exist_ok=True)
    for stale in directory.glob("*"):
        stale.unlink()

    paths = []
    for index in range(len(timesteps)):
        u, v = pairs[index]
        interleaved = np.stack([u.values, v.values], axis=-1).astype("<f4")
        name = f"currents/vectors_{index:03d}.bin"
        (output_dir / name).write_bytes(interleaved.tobytes(order="C"))
        paths.append(name)

    total = sum((output_dir / path).stat().st_size for path in paths)
    print(f"[bake] currents: {len(paths)} vector fields, {total / 1e6:.1f} MB")
    return paths


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

    # Pooled over every Timestep, not averaged over the twelve per-step figures: a step whose
    # mask leaves more ocean has more voxels to be empty in, and averaging percentages would
    # weight a small step and a large one the same. This is the figure the guide panel quotes,
    # so it goes into the manifest rather than into a sentence somebody has to keep in step.
    stacked = np.concatenate([f.ravel() for f in fields])
    ocean = np.isfinite(stacked)
    empty_fraction = (
        float((stacked[ocean] < BANDS[0]).mean()) if ocean.any() else 0.0
    )

    print(
        f"[bake] {COVERAGE_FIELD.key}: {len(paths)} volumes, "
        f"range {encoding_range[0]:.0f}..{encoding_range[1]:.0f} casts, "
        f"{empty_fraction:.1%} of the block with no cast behind it"
    )
    return paths, encoding_range, fields, empty_fraction


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


def _build_normal_anomaly(climatology, grids, timesteps) -> tuple[list, dict | None]:
    """The analysis minus the 1991-2020 normal for each Timestep's own calendar month.

    One fetch per **month**, not per Timestep: April to July is four files rather than twelve,
    and three ten-day steps inside a month share one baseline - which is a limitation of the
    atlas rather than a shortcut, and the panel says so.

    Returns ([], None) and prints why if NOAA cannot be reached. That is the same treatment
    Copernicus and the moorings get: a source being down costs this Field, not the bake.

    The second half of the return is what the guide panel says about this Field. It was three
    figures written by hand into `guide.ts`, which a re-bake turns into three lies.
    """
    months = sorted({month_of(when) for when in timesteps})
    # The box is the analysis's **own node bounds**, not DEMO_REGION. DEMO_REGION is the request
    # sent to INCOIS and their nodes sit half a degree inside it - 45.5 to 100.5, -9.5 to 25.5 -
    # so asking WOA for DEMO_REGION returns a grid one row and one column short and the
    # difference cannot be taken at all. Taking the bounds from the data guarantees the two line
    # up rather than assuming they do; `climatological_anomaly` still refuses if they do not.
    sample = grids[("temperature", 0)]
    box = BoundingBox(
        south=float(sample.latitudes[0]),
        north=float(sample.latitudes[-1]),
        west=float(sample.longitudes[0]),
        east=float(sample.longitudes[-1]),
    )
    normals = {}
    for month in months:
        try:
            normals[month] = climatology.fetch_grid("temperature", month, box)
        except Exception as error:  # noqa: BLE001 - upstream fails many ways, all the same here
            print(f"[bake] WARNING: World Ocean Atlas unavailable ({error}); no normal anomaly")
            return [], None

    out = []
    for index, when in enumerate(timesteps):
        out.append(climatological_anomaly(grids[("temperature", index)], normals[month_of(when)]))

    finite = np.concatenate([g.values[np.isfinite(g.values)].ravel() for g in out])
    stats = {
        "months": len(months),
        "cells": int(finite.size),
        "meanDegC": _json_number(float(np.mean(finite))),
        "p95AbsDegC": _json_number(float(np.percentile(np.abs(finite), 95))),
    }
    print(
        f"[bake] normal anomaly: {len(months)} monthly normals ({', '.join(str(m) for m in months)}"
        f"), {finite.size} cells, {np.nanmean(finite):+.3f} degC mean, "
        f"{np.nanpercentile(np.abs(finite), 95):.3f} degC at the 95th percentile"
    )
    return out, stats


def _build_drift(floats, vectors, timesteps) -> dict | None:
    """Every drifting Float's own track against the drift the analysed currents imply.

    PS 26067 names **search-and-rescue support** and nothing in this build answered it. A
    trajectory through the baked current field is the answer, and the reason it is worth
    shipping rather than being a toy is that this platform can check it: an Argo float's track
    between surfacings **is** measured drift at its parking depth, so the same integrator run
    from the float's own first Fix produces a prediction with a measurement already beside it.

    What is written here is the check. The live "drop a pin" trajectory is integrated in the
    browser from the same files; `web/probe-drift.mjs` runs the browser's integrator from these
    same start points and compares it against these numbers, which is what keeps the two honest.

    Moorings are skipped: an anchored buoy has no drift to predict, and its "track" is one
    position repeated.
    """
    if not vectors:
        return None

    series = CurrentSeries(
        times=list(timesteps),
        u=[pair[0] for pair in vectors],
        v=[pair[1] for pair in vectors],
    )

    out: dict[str, dict] = {}
    for item in floats:
        if item.get("kind") == "mooring":
            continue
        fixes = [
            (datetime.fromisoformat(fix["time"]), float(fix["lon"]), float(fix["lat"]))
            for fix in item.get("track", [])
        ]
        comparison = track_against_drift(
            series, fixes, depth_metres=PARKING_DEPTH_METRES, step_hours=DEFAULT_STEP_HOURS
        )
        if comparison is None:
            continue

        # The drawn line, sampled daily out of the six-hourly integration.
        start = comparison.predicted[0].time
        hours = (comparison.predicted[-1].time - start).total_seconds() / 3600.0
        path = _resample_drift(series, comparison, hours)

        out[item["id"]] = {
            # Consumed by `_drift_summary` below and dropped before the file is written. It was
            # shipped for a round - 2,431 numbers, about 20 KB - with nothing in the browser
            # reading a single one of them, which is a payload that can only go stale.
            "cycleKm": _cycle_separations(series, fixes),
            # Where and when the comparison actually starts.
            #
            # Not the float's first Fix: fixes outside the analysed period are refused, because
            # scoring them holds the first analysis constant over days it was not measured on.
            # `web/probe-drift.mjs` runs the browser's integrator from exactly this point, so it
            # has to be shipped rather than re-derived - a probe that re-implements the rule is
            # a probe that can agree with itself while both halves are wrong.
            "startTime": comparison.predicted[0].time.isoformat(),
            "days": [round(d, 3) for d in comparison.days],
            "observed": [[round(p.longitude, 3), round(p.latitude, 3)] for p in comparison.observed],
            "predicted": [
                [round(p.longitude, 3), round(p.latitude, 3)] for p in comparison.predicted
            ],
            "observedKm": [round(k, 1) for k in comparison.observed_km],
            "predictedKm": [round(k, 1) for k in comparison.predicted_km],
            "separationKm": [round(k, 1) for k in comparison.separations_km],
            "path": path,
            "ended": comparison.ended,
        }

    if not out:
        return None

    summary = _drift_summary(out)
    for entry in out.values():
        del entry["cycleKm"]

    return {
        "parkingDepthMetres": PARKING_DEPTH_METRES,
        "stepHours": DEFAULT_STEP_HOURS,
        "sampleHours": DRIFT_SAMPLE_HOURS,
        "floats": out,
        "summary": summary,
    }


def _cycle_separations(series, fixes) -> list[float]:
    """One Argo cycle at a time: restart at each Fix, integrate to the next, measure the gap.

    The cumulative figures above answer "if this had been let go four months ago"; this answers
    the question a search actually asks, which is "it was here ten days ago, where is it now".
    They are different numbers and the second one is the fairer test of the current field,
    because it never carries an error forward.
    """
    from .drift import integrate_drift

    out = []
    # Both ends inside the analysed period. A cycle that starts before the first analysis is
    # scored against a field held constant from a date it was not measured on, and there is
    # nothing on screen that could tell it from a real one. See `CurrentSeries.covers`.
    ordered = [fix for fix in sorted(fixes, key=lambda f: f[0]) if series.covers(fix[0])]
    for (t0, lon0, lat0), (t1, lon1, lat1) in zip(ordered, ordered[1:]):
        hours = (t1 - t0).total_seconds() / 3600.0
        if hours <= 0:
            continue
        path = integrate_drift(
            series,
            longitude=lon0,
            latitude=lat0,
            start_time=t0,
            depth_metres=PARKING_DEPTH_METRES,
            hours=hours,
            step_hours=DEFAULT_STEP_HOURS,
        )
        if path.ended != "finished":
            continue  # it ran out of ocean, so there is no prediction to score
        here = DriftStep(time=t1, longitude=lon1, latitude=lat1)
        out.append(round(separation_km(here, path.steps[-1]), 1))
    return out


def _resample_drift(series, comparison, hours) -> list[list[float]]:
    """The predicted trajectory as a daily polyline, for drawing.

    Re-integrated at the sampling interval rather than decimated from the six-hourly run,
    because decimating would draw a line that is not the line the numbers came from - the
    corners would be cut, and in a jet that is a visible difference.
    """
    from .drift import integrate_drift

    first = comparison.predicted[0]
    path = integrate_drift(
        series,
        longitude=first.longitude,
        latitude=first.latitude,
        start_time=first.time,
        depth_metres=PARKING_DEPTH_METRES,
        hours=hours,
        step_hours=DEFAULT_STEP_HOURS,
    )
    every = max(int(round(DRIFT_SAMPLE_HOURS / DEFAULT_STEP_HOURS)), 1)
    sampled = path.steps[::every]
    if sampled[-1] is not path.steps[-1]:
        sampled.append(path.steps[-1])
    return [[round(p.longitude, 3), round(p.latitude, 3)] for p in sampled]


def _drift_summary(entries: dict) -> dict:
    """How far the current field alone gets you, in kilometres, across every Float that has one.

    Reported as the **median**, and beside the median distance the floats actually travelled over
    the same span. A separation of 300 km means one thing next to 200 km of travel and another
    next to 2,000 km, and quoting the first figure without the second is the kind of number that
    reads as a result and is not one.

    Each horizon reports the median *day* it actually used, and that is not decoration. The
    first version took the first Fix at or past the horizon, and an Argo cycle here measures
    9.9985 days - so every float fell through the 10-day bucket into its second cycle and a
    figure labelled "10 days" was a median of 18. It read as a result, it was plausible, and it
    was 77% too long. A Fix is now matched to the horizon nearest it, within a quarter of the
    horizon, and the median day used is written down beside the answer.
    """
    horizons = []
    for horizon in DRIFT_HORIZON_DAYS:
        separations, travelled, used = [], [], []
        tolerance = horizon * 0.25
        for entry in entries.values():
            best = None
            for day, gap, moved in zip(entry["days"], entry["separationKm"], entry["observedKm"]):
                if day <= 0:
                    continue
                if abs(day - horizon) > tolerance:
                    continue
                if best is None or abs(day - horizon) < abs(best[0] - horizon):
                    best = (day, gap, moved)
            if best is not None:
                used.append(best[0])
                separations.append(best[1])
                travelled.append(best[2])
        if len(separations) < 5:
            continue  # too few Floats reached this horizon to report a median of anything
        horizons.append(
            {
                "days": horizon,
                "medianDaysUsed": round(float(np.median(used)), 1),
                "floats": len(separations),
                "medianSeparationKm": round(float(np.median(separations)), 1),
                "medianTravelledKm": round(float(np.median(travelled)), 1),
            }
        )

    cycles = [gap for entry in entries.values() for gap in entry["cycleKm"]]
    return {
        "floats": len(entries),
        "horizons": horizons,
        # The fair test, and the one a search would use: from a position known ten days ago.
        "cycle": (
            {
                "count": len(cycles),
                "medianKm": round(float(np.median(cycles)), 1),
                "p90Km": round(float(np.percentile(cycles, 90)), 1),
            }
            if len(cycles) >= 20
            else None
        ),
    }


def _build_residuals(collocations, floats, fields, ranges) -> dict:
    """Where the model most disagrees with the instruments, ranked and binned.

    Every number this writes is already in `collocations.json`; nothing here fetches, models or
    predicts anything. It exists as its own file because `collocations.json` is 10.5 MB and is
    deliberately fetched after first paint, and because a user should not have to click 234
    instruments to find the three the analysis struggled with.

    See `samudra/residuals.py` for why the ranking is on a fraction of each Field's own range
    rather than on degrees and PSU side by side.
    """
    positions = positions_from(floats, collocations)
    entries = rank_residuals(
        collocations,
        positions,
        {f.key: ranges[f.key] for f in fields if f.key in ranges},
        min_matched=RESIDUAL_MIN_MATCHED,
    )

    out: dict[str, dict] = {}
    for field in fields:
        summary = field_bias(entries, field.key)
        if summary is None:
            continue
        # Split by kind, because the two kinds are answering different questions. INCOIS
        # assimilate Argo: a float's residual is largely the analysis agreeing with an
        # observation it was fed, and the moored buoys are the only independent check in the
        # bake. Pooled, the nine of them disappear into 224 floats and the headline becomes a
        # statement about self-consistency. See `residuals.py`.
        by_kind = {
            kind: field_bias(entries, field.key, kind=kind)
            for kind in sorted({e.kind for e in entries if e.field == field.key})
        }
        cells = bias_grid(
            entries,
            field.key,
            DEMO_REGION,
            cell_degrees=RESIDUAL_CELL_DEGREES,
            min_count=RESIDUAL_MIN_COUNT,
        )
        out[field.key] = {
            "summary": {
                "count": summary.count,
                "meanBias": _json_number(summary.mean_bias),
                "meanAbsBias": _json_number(summary.mean_abs_bias),
                "rms": _json_number(summary.rms),
                # Where the bias map's colour scale saturates. See `FieldBias.p90_scaled_abs`.
                "p90ScaledAbs": _json_number(summary.p90_scaled_abs),
            },
            "byKind": {
                kind: {
                    "count": bias.count,
                    "meanBias": _json_number(bias.mean_bias),
                    "meanAbsBias": _json_number(bias.mean_abs_bias),
                    "rms": _json_number(bias.rms),
                }
                for kind, bias in by_kind.items()
                if bias is not None
            },
            "cells": [
                {
                    "south": cell.south,
                    "west": cell.west,
                    "count": cell.count,
                    "meanBias": _json_number(cell.mean_bias),
                    "meanAbsBias": _json_number(cell.mean_abs_bias),
                    "rms": _json_number(cell.rms),
                }
                for cell in cells
            ],
            "instruments": [
                {
                    "id": e.platform_id,
                    "kind": e.kind,
                    "lon": round(e.longitude, 4),
                    "lat": round(e.latitude, 4),
                    "step": e.timestep_index,
                    "time": e.time,
                    "bias": _json_number(e.mean_residual),
                    "rms": _json_number(e.rms_residual),
                    "matched": e.matched,
                    # The fraction of the Field's own range, which is what the list is ordered
                    # on and what lets a temperature row and a salinity row share one ranking.
                    "scaledBias": _json_number(e.scaled_bias),
                    "scaledRms": _json_number(e.scaled_rms),
                }
                for e in entries
                if e.field == field.key
            ],
        }

    return {
        "cellDegrees": RESIDUAL_CELL_DEGREES,
        "minCount": RESIDUAL_MIN_COUNT,
        "minMatched": dict(RESIDUAL_MIN_MATCHED),
        "fields": out,
    }


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
