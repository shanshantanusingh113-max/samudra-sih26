"""Observation Coverage: how much real measurement stands behind each part of the ocean.

The Volume answers "what does the model say here". This answers the question underneath it:
"how much did anyone actually measure here". They are different questions, and conflating them
is the mistake this module exists to prevent. A model field is defined everywhere it has a grid
cell; that is a property of the grid, not of the evidence.

What is counted, and why it is casts rather than measurements

One Profile contributes **one** to every depth slab it actually sampled. The obvious
alternative - counting individual measurements - was tried and abandoned, because it measures
the wrong thing on this data.

We checked before committing to it: across the 1107 casts in the current bake the median
vertical gap is 2.0 m in every depth band from 5 m to 2000 m, and the median cast carries 511
levels. These are full-resolution delayed-mode profiles. So "measurements per slab" would have
reported *more* evidence in the abyss than at the surface, purely because the Depth Warp gives a
deep slab more metres to collect from. That is an artefact of our own rendering axis, dressed up
as a fact about the ocean. Counting casts is immune to it.

What the field therefore shows

- **Horizontally**, a real and large signal: measured over the current bake, 81% of ocean
  voxels have at least one cast within `RADIUS_DEGREES` and 19% have none at all, so the
  analysis in that fifth of the block is interpolation rather than observation.
- **Vertically**, a real but modest one: 99.7% of casts reach 200 m and 92.6% reach 1900 m, so
  deep water is slightly less constrained because some floats turn around early.
- **Below 2000 m**, nothing, everywhere. That is the floats' parking depth. The Volume stops
  there, so it cannot be drawn - it has to be said.

Coverage is counted in a *neighbourhood*, not per voxel. At the Volume's native resolution a
region with 92 floats leaves almost every cell empty, and a field that is 99% zero is a picture
of where floats happen to be, not an answer to "is there evidence near here". The radius is a
judgement call and it is stated rather than hidden: `RADIUS_DEGREES` below.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from .depth_warp import DepthWarp

# How far from a voxel a Profile still counts as evidence for it. One degree is the Grid's own
# horizontal resolution, so three degrees is "within a few grid cells" - close enough that an
# analysis at this voxel really was informed by that cast.
RADIUS_DEGREES = 3.0

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

BAND_LABELS = ("No casts", "Sparse: 1", "Moderate: 2-3", "Good: 4+")


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

        # Horizontal reach. Longitude degrees shrink with latitude, so the window is widened by
        # 1/cos(lat) - otherwise a float near the equator would claim a wider box in kilometres
        # than one in the northern Bay of Bengal, for no physical reason.
        scale = max(np.cos(np.radians(profile.latitude)), 0.2)
        rows = np.where(np.abs(latitudes - profile.latitude) <= RADIUS_DEGREES)[0]
        columns = np.where(np.abs(longitudes - profile.longitude) <= RADIUS_DEGREES / scale)[0]
        if rows.size == 0 or columns.size == 0:
            continue

        # One vote per slab this cast actually sampled. `histogram` counts measurements per
        # slab; we only care whether there was at least one, which is what makes the result a
        # count of casts rather than a count of bottle levels.
        sampled, _ = np.histogram(depths, bins=edges)
        reached = (sampled > 0).astype(float)
        if not reached.any():
            continue

        counts[np.ix_(np.arange(samples), rows, columns)] += reached[:, None, None]

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
