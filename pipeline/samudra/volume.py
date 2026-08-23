"""Encoding a Volume for the GPU.

Four bytes per voxel: a value, a coverage, a gradient and a spare.

The value is quantised over the Field's range. One part in 255 of a 2-31 degC span is 0.11 degC,
comfortably finer than the analysis error INCOIS publishes alongside the field, so the
quantisation is not the limiting factor in anything a user reads off the screen.

Coverage is the interesting one, and it exists because of how GPUs filter. The obvious design
is a single channel with a reserved "no data" value, but the texture unit interpolates
trilinearly *before* the shader ever sees a voxel, so a sentinel gets averaged with the ocean
next to it. On a temperature field that paints a cold fringe along every coastline, which does
not look like a bug - it looks like upwelling, which is a real phenomenon a forecaster would
act on. Fabricating one is far worse than rendering a blocky coast.

So: masked cells are back-filled from their nearest valid neighbour, which makes them
harmless to interpolate against, and a separate coverage channel carries the truth about where
the ocean actually is. Filtering coverage is not merely safe, it is desirable - it turns a 1
degree stair-stepped coast into a smooth edge without inventing a single temperature.

The third channel is gradient magnitude, and it is what makes the water legible. Ocean
temperature is monotonic with depth, so a plain ray march is dominated by the warm surface and
everything below it disappears into a dark, low-alpha haze. Weighting opacity by how fast the
field is *changing* inverts that: featureless water - the deep, the mixed layer - turns
transparent, and the thermocline, the haloclines and the frontal boundaries become the solid
things in the picture. Those are also the features an oceanographer is actually looking for.

It is precomputed rather than sampled in the shader because doing it live costs six extra
texture fetches at every one of ~128 ray steps, which integrated graphics will not absorb.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from scipy import ndimage

OCEAN = 255
LAND = 0

# Gradients are normalised against this percentile rather than the maximum, so one sharp
# frontal cell cannot wash out every other feature in the volume.
_GRADIENT_REFERENCE_PERCENTILE = 99.0


@dataclass(frozen=True)
class EncodedVolume:
    """One Field at one Timestep, ready to become a WebGL2 RGBA 3D texture."""

    width: int   # longitude, varies fastest
    height: int  # latitude
    depth: int   # warped depth axis
    vmin: float
    vmax: float
    data: bytes  # interleaved value, coverage, gradient, spare

    @property
    def masked_fraction(self) -> float:
        coverage = np.frombuffer(self.data, np.uint8)[1::4]
        return float((coverage == LAND).mean())


def encode_volume(field, vmin: float, vmax: float) -> EncodedVolume:
    """Quantise a (depth, lat, lon) float array into interleaved RGBA bytes."""
    if not vmax > vmin:
        raise ValueError(f"need vmax > vmin, got vmin={vmin}, vmax={vmax}")

    field = np.asarray(field, dtype=float)
    if field.ndim != 3:
        raise ValueError(f"expected a 3-D (depth, lat, lon) array, got shape {field.shape}")

    masked = np.isnan(field)
    filled = _fill_from_nearest(field, masked)

    normalised = np.clip((filled - vmin) / (vmax - vmin), 0.0, 1.0)
    values = np.rint(normalised * 255).astype(np.uint8)
    coverage = np.where(masked, LAND, OCEAN).astype(np.uint8)

    interleaved = np.empty(field.shape + (4,), dtype=np.uint8)
    interleaved[..., 0] = values
    interleaved[..., 1] = coverage
    interleaved[..., 2] = _gradient_magnitude(normalised, masked)
    interleaved[..., 3] = 255

    depth, height, width = field.shape
    return EncodedVolume(
        width=width,
        height=height,
        depth=depth,
        vmin=float(vmin),
        vmax=float(vmax),
        data=interleaved.tobytes(),  # C order: lon fastest, then lat, then depth
    )


def _gradient_magnitude(normalised: np.ndarray, masked: np.ndarray) -> np.ndarray:
    """How fast the field changes here, as a byte. Computed on the already-normalised field so
    it is comparable between Fields with wildly different units."""
    # Only differentiate along axes that have room for it. A Volume one cell thick in some
    # direction is degenerate but legitimate, and np.gradient raises rather than ignoring it.
    axes = [axis for axis, size in enumerate(normalised.shape) if size >= 2]
    if not axes:
        return np.zeros(normalised.shape, dtype=np.uint8)

    gradients = np.gradient(normalised, axis=axes)
    if len(axes) == 1:
        gradients = [gradients]
    magnitude = np.sqrt(sum(np.square(g) for g in gradients))
    magnitude[masked] = 0.0

    usable = magnitude[~masked]
    reference = np.percentile(usable, _GRADIENT_REFERENCE_PERCENTILE) if usable.size else 0.0
    if reference <= 0:
        return np.zeros(normalised.shape, dtype=np.uint8)
    return np.rint(np.clip(magnitude / reference, 0.0, 1.0) * 255).astype(np.uint8)


def _fill_from_nearest(field: np.ndarray, masked: np.ndarray) -> np.ndarray:
    """Give every masked cell its nearest real neighbour's value, so blending stays physical."""
    if not masked.any():
        return field
    if masked.all():
        return np.zeros_like(field)
    _, nearest = ndimage.distance_transform_edt(masked, return_indices=True)
    return field[tuple(nearest)]
