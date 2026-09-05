"""The vertical section: depth against distance along a line somebody drew.

The hydrographic section is *the* figure of physical oceanography. It is what a crossing of the
Bay of Bengal looks like in every textbook and every INCOIS report, and it is the picture an
oceanographer on a panel will recognise before they have read a single label. What no web tool
offers is cutting one **live, from a line you draw, against a 3D block you can also fly
through** - which is what this makes possible.

**It reads the Grid and never a Volume.** A section is a chart with metres down one axis and
kilometres along the other, and a reader reads numbers off both. A Volume is quantised to bytes,
depth-warped and back-filled across land for the GPU's benefit; cutting a section from one would
put the thermocline at the wrong depth on a figure that looks exactly right.

Two things here produce a beautiful and false picture if they are got wrong, so both are held to
hand-computable cases in `tests/test_section.py`.

**The distance axis.** Every feature on the plot is positioned against it. A degree of longitude
at 20 N is 94% of one at the equator, so an east-west section drawn on plain degrees is 6% too
long and everything on it is in the wrong place by a growing amount.

**What happens at a coast.** `Grid.column_at` refuses to blend across a Masked node, and this
inherits that refusal rather than working around it: a section that runs onto land must show a
gap, because the alternative is a smooth wall of plausible water where there is rock.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from datetime import datetime

import numpy as np

from .grid import Grid
from .sources.base import Profile

#: The Earth's radius in kilometres, from the same 111.32 km per degree the rest of this project
#: uses - so a distance measured here and a distance measured in `drift.py` agree.
EARTH_RADIUS_KM = 111.320 * 180.0 / math.pi


@dataclass(frozen=True)
class Section:
    """One cut through the Grid: `values` is [level, point along the line]."""

    #: Distance from the start of the line, in kilometres, one per point.
    distances_km: np.ndarray
    longitudes: np.ndarray
    latitudes: np.ndarray
    #: The model's own Levels, in metres. Unwarped: this is a chart, not a texture.
    levels: np.ndarray
    values: np.ndarray


@dataclass(frozen=True)
class NearbyCast:
    """One Profile close enough to a line to be drawn on the same axes as the section."""

    profile: Profile
    #: Where along the line it sits, in kilometres from the start.
    distance_km: float
    #: How far off the line it actually was. A section implies a cast was *on* it; this is what
    #: lets the panel say how far that is from true.
    offset_km: float


def haversine_km(lon_a: float, lat_a: float, lon_b: float, lat_b: float) -> float:
    """Great-circle distance between two positions, in kilometres."""
    phi1, phi2 = math.radians(lat_a), math.radians(lat_b)
    dphi = phi2 - phi1
    dlambda = math.radians(lon_b - lon_a)
    h = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    return 2 * EARTH_RADIUS_KM * math.asin(min(1.0, math.sqrt(h)))


def great_circle_points(
    lon_a: float, lat_a: float, lon_b: float, lat_b: float, count: int
) -> tuple[np.ndarray, np.ndarray]:
    """`count` evenly spaced points along the great circle from A to B, inclusive of both.

    Spherical interpolation rather than a straight line in degrees. Over a few hundred
    kilometres the difference is small; over the width of this region it is not, and the
    distance axis is only honest if the points it measures are the points that were sampled.
    """
    if count < 2:
        return np.array([lon_a]), np.array([lat_a])

    phi1, lam1 = math.radians(lat_a), math.radians(lon_a)
    phi2, lam2 = math.radians(lat_b), math.radians(lon_b)
    x1, y1, z1 = _unit(phi1, lam1)
    x2, y2, z2 = _unit(phi2, lam2)

    dot = max(-1.0, min(1.0, x1 * x2 + y1 * y2 + z1 * z2))
    angle = math.acos(dot)
    fractions = np.linspace(0.0, 1.0, count)

    if angle < 1e-9:
        # The two ends are the same place. Interpolating would divide by sin(0).
        return np.full(count, lon_a), np.full(count, lat_a)

    a = np.sin((1 - fractions) * angle) / math.sin(angle)
    b = np.sin(fractions * angle) / math.sin(angle)
    x = a * x1 + b * x2
    y = a * y1 + b * y2
    z = a * z1 + b * z2

    latitudes = np.degrees(np.arctan2(z, np.sqrt(x * x + y * y)))
    longitudes = np.degrees(np.arctan2(y, x))
    return longitudes, latitudes


def _unit(phi: float, lam: float) -> tuple[float, float, float]:
    return math.cos(phi) * math.cos(lam), math.cos(phi) * math.sin(lam), math.sin(phi)


def section_along(
    grid: Grid, lon_a: float, lat_a: float, lon_b: float, lat_b: float, points: int = 121
) -> Section:
    """Cut the Grid along a line, and say how far along it each column sits.

    A point outside the Grid, or over a Masked node, comes back missing. **Half a section is a
    real answer**: refusing the whole line because one end left the model would throw away the
    half that is inside it, and a reader can see where it stopped.
    """
    longitudes, latitudes = great_circle_points(lon_a, lat_a, lon_b, lat_b, points)

    values = np.full((len(grid.levels), len(longitudes)), np.nan)
    distances = np.zeros(len(longitudes))
    for index, (lon, lat) in enumerate(zip(longitudes, latitudes)):
        distances[index] = haversine_km(lon_a, lat_a, float(lon), float(lat))
        try:
            values[:, index] = grid.column_at(float(lat), float(lon))
        except ValueError:
            continue  # off the Grid entirely; the column stays missing

    return Section(
        distances_km=distances,
        longitudes=longitudes,
        latitudes=latitudes,
        levels=np.asarray(grid.levels, dtype=float),
        values=values,
    )


def casts_near_line(
    profiles,
    lon_a: float,
    lat_a: float,
    lon_b: float,
    lat_b: float,
    corridor_km: float = 150.0,
    when: datetime | None = None,
    window_days: float | None = None,
) -> list[NearbyCast]:
    """Every Profile within `corridor_km` of the line, ordered from its start to its end.

    "Near the line" is not "near the line's direction": a cast 200 km past the eastern end is
    within a corridor's width of the line extended, and is not part of this section. The
    projection is clamped to the segment and anything falling outside it is dropped, so the
    plot never implies an observation somewhere the line does not go.

    **Near in time as well as in space.** A section is cut at one Timestep and a reader takes
    the casts drawn on it as observations of the water it cuts through. With no time filter this
    took every fix of every float: measured on a line from 80 E, 5 N to 90 E, 20 N at the last
    Timestep, 127 casts were drawn and 98 of them were from March to June, against 8 with the
    window on, all of them from July. `when` and
    `window_days` are the same refusal `floatTime.positionAt` already makes for the markers -
    a Float is not drawn when its nearest Fix is further away than the bake's own coverage
    window, because showing it would imply an observation that does not exist.

    **The corridor is measured against the great circle the section is actually cut along.**
    It used to be a flat projection with the longitude axis scaled by the cosine of the line's
    mean latitude, which is two approximations at once: the cosine is right at the middle of the
    line and wrong at both ends, and a straight line in scaled degrees is a rhumb line rather
    than the great circle `section_along` samples. Measured against a numeric minimisation over
    20,001 points of the drawn line, on a section from 45 E, 10 S to 100 E, 25 N: the reported
    offset was wrong by up to **179 km** and the along-track distance by up to 12 km. The
    corridor is 150 km wide, so casts were being included and excluded by more than the whole
    width of the thing.

    The replacement is the standard spherical cross-track and along-track pair, which is exact
    on a sphere and has no line length at which it stops being right.
    """
    limit = None if when is None or window_days is None else window_days * 86400.0
    length_km = haversine_km(lon_a, lat_a, lon_b, lat_b)
    course = _initial_bearing(lon_a, lat_a, lon_b, lat_b)

    out: list[NearbyCast] = []
    for profile in profiles:
        if limit is not None and abs((profile.time - when).total_seconds()) > limit:
            continue
        if length_km <= 0.0:
            offset = haversine_km(profile.longitude, profile.latitude, lon_a, lat_a)
            if offset > corridor_km:
                continue
            out.append(NearbyCast(profile=profile, distance_km=0.0, offset_km=offset))
            continue

        angle = haversine_km(lon_a, lat_a, profile.longitude, profile.latitude) / EARTH_RADIUS_KM
        turn = _initial_bearing(lon_a, lat_a, profile.longitude, profile.latitude) - course
        cross = math.asin(max(-1.0, min(1.0, math.sin(angle) * math.sin(turn))))
        offset = abs(cross) * EARTH_RADIUS_KM
        if offset > corridor_km:
            continue

        along = math.acos(max(-1.0, min(1.0, math.cos(angle) / math.cos(cross))))
        if math.cos(turn) < 0.0:
            along = -along
        along_km = along * EARTH_RADIUS_KM
        if along_km < 0.0 or along_km > length_km:
            continue  # beyond an end of the segment, not on the section

        out.append(NearbyCast(profile=profile, distance_km=along_km, offset_km=offset))

    out.sort(key=lambda c: c.distance_km)
    return out


def _initial_bearing(lon_a: float, lat_a: float, lon_b: float, lat_b: float) -> float:
    """The course from A to B where it leaves A, in radians. Great circles do not hold one."""
    phi1, phi2 = math.radians(lat_a), math.radians(lat_b)
    dlambda = math.radians(lon_b - lon_a)
    return math.atan2(
        math.sin(dlambda) * math.cos(phi2),
        math.cos(phi1) * math.sin(phi2) - math.sin(phi1) * math.cos(phi2) * math.cos(dlambda),
    )
