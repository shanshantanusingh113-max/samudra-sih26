"""Observation Coverage: how much real measurement stands behind each part of the ocean.

The Volume answers "what does the model say here". This answers the question underneath it:
"how much did anyone actually measure here". They are different questions, and conflating them
is the mistake this module exists to prevent. A model field is defined everywhere it has a grid
cell; that is a property of the grid, not of the evidence.

What is counted, and why it is casts rather than measurements

One Profile contributes **one** to every depth slab its dive passed through. Two other rules
were tried first and both turned out to be measuring our own depth axis rather than the ocean.

*Measurements per slab* was the first. Across the casts in the current bake the median vertical
gap is 2.0 m from 5 m to 2000 m and the median cast carries 511 levels, so counting levels would
have reported *more* evidence in the abyss than at the surface purely because the Depth Warp
gives a deep slab more metres to collect from. Counting casts is immune to that.

*Levels falling inside the slab* was the second, and it survived longer because it looks
obviously right. It is not. Argo reports every 2 dbar in delayed mode but at round depths in
real time, and 31% of the casts here are the latter. Near the surface a slab is thinner than the
gap between two round depths - the top one is 2.16 m thick against a 48-slab axis - so a
real-time cast reporting at 10 m and 20 m has no level inside the slab at 19 m and was recorded
as not having been there. Measured over the shipped bake, the damage was a sawtooth in depth:

    slab  3 (19 m)    76.6% of casts "reached" it
    slab  4 (25 m)    98.9%
    slab  5 (31 m)    78.3%
    slab  6 (37 m)    99.9%
    slab  9 (60 m)    79.4%
    slabs 10-21       99.8% and up

23.1% of voxels at 19 m were in the wrong band, and of the sixteen places where a Float marker
sat on "no casts", fifteen had a cast from that same float, at that position, inside the window.
The worst of them: float 1902196's cast of 2026-04-26 reports 4.71 m then 9.1 m, and the top
slab spans 5.00 to 7.16 m, so the float measured that water and the picture said nobody had.

So the rule is *overlap*: a cast is evidence for every slab between its shallowest and its
deepest good level. It cannot be gamed by how finely a float chose to report, and it stays
honest at the top, where a float that only starts reporting at 25 m must not claim the surface.

What the field therefore shows

- **Horizontally**, a real and large signal: a substantial share of ocean voxels have no cast
  within `RADIUS_DEGREES` at all, so the analysis there is interpolation rather than
  observation. `observed_fraction` reports the figure for a given bake rather than this
  docstring pretending to know it.
- **Vertically**, a real but modest one: 99.7% of casts reach 200 m and 92.6% reach 1900 m, so
  deep water is slightly less constrained because some floats turn around early. With the
  overlap rule that is the *only* vertical structure left, which is the point.
- **Below 2000 m**, nothing, everywhere. That is the floats' parking depth. The Volume stops
  there, so it cannot be drawn - it has to be said.

Coverage is counted in a *neighbourhood*, not per voxel. At the Volume's native resolution a
region with 92 floats leaves almost every cell empty, and a field that is 99% zero is a picture
of where floats happen to be, not an answer to "is there evidence near here". The radius is a
judgement call and it is stated rather than hidden: `RADIUS_DEGREES` below.

The neighbourhood is a *circle*. It was a square in degrees, which is cheaper and was wrong in
two ways at once: it reached 1.41 times further diagonally than it claimed, and because every
cast painted an identical rectangle the field acquired hard right-angled edges that a viewer
reads as structure in the ocean.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from .depth_warp import DepthWarp

# How far from a voxel a Profile still counts as evidence for it. One degree is the Grid's own
# horizontal resolution, so three degrees is "within a few grid cells" - close enough that an
# analysis at this voxel really was informed by that cast. It is a true radius, about 330 km in
# every direction, and the guide panel quotes that figure.
RADIUS_DEGREES = 3.0
METRES_PER_DEGREE = 111_320.0

# Casts in a neighbourhood that separate the four bands a user reads.
#
# Calibrated against the distribution this bake actually produces rather than guessed: over
# 695,088 ocean voxels the median is 2 casts and the maximum is 10, so thresholds of 1/3/10
# would have left the top band permanently empty and the legend would have been advertising a
# quality nothing in the data can reach. At 1/2/4 the bands split the block roughly 19/23/36/22,
# which is what a band is for.
#
# A presentation choice, not a published standard, and it is tied to the ten-day window: a float
# surfaces about once per window, so "4 casts nearby" means roughly four different floats.
BANDS = (1, 2, 4)

# Plain counts, not a verdict. The labels used to read "Sparse" and "Good", which turned the
# commonest honest case - one float, alone, exactly where you are looking - into what looked
# like an error: a white marker sitting on a red patch. The float you can see is itself the one
# cast being counted, and the key now says so instead of grading it.
BAND_LABELS = ("No casts", "1 cast", "2 to 3 casts", "4 or more casts")


@dataclass(frozen=True)
class CoverageField:
    """Cast counts on the Volume's own lattice, plus what the bands mean."""

    counts: np.ndarray  # (depth, lat, lon), float; NaN where there is no ocean
    radius_degrees: float
    bands: tuple[int, ...]
    labels: tuple[str, ...]

    @property
    def observed_fraction(self) -> float:
        """How much of the ocean in this block has any cast behind it."""
        ocean = np.isfinite(self.counts)
        if not ocean.any():
            return 0.0
        return float((self.counts[ocean] >= self.bands[0]).mean())


def slab_edges(warp: DepthWarp, samples: int) -> np.ndarray:
    """Depth in metres of the boundaries between the Volume's evenly spaced slabs.

    A slab is centred on its sampled depth and reaches halfway to its neighbours, so the slabs
    tile the column without gaps or overlap. Computed in warped space and converted back, which
    is what makes a shallow slab a few metres thick and a deep one over a hundred.
    """
    axis = np.linspace(0.0, 1.0, samples)
    midpoints = (axis[:-1] + axis[1:]) / 2.0
    inner = warp.to_depth(midpoints)
    return np.concatenate([[warp.top], np.atleast_1d(inner), [warp.bottom]])


def observation_coverage(
    profiles,
    latitudes: np.ndarray,
    longitudes: np.ndarray,
    warp: DepthWarp,
    samples: int,
    mask: np.ndarray | None = None,
) -> CoverageField:
    """Count casts in the neighbourhood of every voxel of the Volume lattice.

    `mask` is the model's own missing-data mask, shaped like the output. Where the model has no
    ocean - land, or sea floor - coverage is meaningless rather than zero, so those cells come
    back missing and the renderer drops them exactly as it drops land in any other Field.
    """
    latitudes = np.asarray(latitudes, dtype=float)
    longitudes = np.asarray(longitudes, dtype=float)
    counts = np.zeros((samples, len(latitudes), len(longitudes)), dtype=float)
    edges = slab_edges(warp, samples)

    for profile in profiles:
        depths = np.asarray(profile.depths, dtype=float)
        depths = depths[np.isfinite(depths)]
        if depths.size == 0:
            continue

        # One vote per slab the dive passed through: every slab that overlaps the span between
        # the cast's shallowest and deepest good level. Asking instead whether a level happened
        # to land *inside* the slab makes the answer depend on how finely the float chose to
        # report, which is a fact about Argo's telemetry and not about the ocean. See the module
        # docstring for the measurement that forced this.
        reached = (
            (edges[1:] > depths.min()) & (edges[:-1] < depths.max())
        ).astype(float)
        if not reached.any():
            continue

        # Horizontal reach, as a circle. Longitude degrees shrink with latitude, so a degree of
        # longitude is scaled by cos(lat) before the distance is taken - otherwise a float near
        # the equator would claim a wider neighbourhood in kilometres than one in the northern
        # Bay of Bengal, for no physical reason.
        scale = max(np.cos(np.radians(profile.latitude)), 0.2)
        northward = latitudes - profile.latitude
        eastward = (longitudes - profile.longitude) * scale
        near = (northward[:, None] ** 2 + eastward[None, :] ** 2) <= RADIUS_DEGREES**2
        if not near.any():
            continue

        counts += reached[:, None, None] * near[None, :, :]

    if mask is not None:
        counts = np.where(mask, np.nan, counts)

    return CoverageField(
        counts=counts, radius_degrees=RADIUS_DEGREES, bands=BANDS, labels=BAND_LABELS
    )


def band_of(count: float) -> int:
    """Which of the four bands a raw cast count falls in. 0 = none, 3 = good."""
    if not np.isfinite(count):
        return 0
    return int(np.searchsorted(np.asarray(BANDS, dtype=float), float(count), side="right"))
