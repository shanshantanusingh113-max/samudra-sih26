"""Drift: where the ocean analysis alone says a thing in the water would go.

PS 26067 lists **search-and-rescue support** among the mandates a missing 3D platform impedes,
and this is the only one of the four with no coverage anywhere else in the build. The input is
already here: Copernicus Marine's current vectors at 24 Levels, on the model's own axes, as
float32 - ADR 0013 - so a trajectory is an integration and nothing more.

**Say the caveat first, because it is the whole difference between this and a fake search box.**
A real search-and-rescue drift product needs surface wind, Stokes drift from the wave field, and
a leeway coefficient for the specific object being looked for - a life raft, a hull, a person in
the water all drift differently in the same current. **This carries none of them.** It is why
INCOIS run SARAT (https://sarat.incois.gov.in/) and why this is not SARAT. What this shows is
the drift **the ocean analysis alone implies**, which is one term of several.

What makes it worth shipping anyway is the second half, and it is a thing no other build of this
shape can do: **an Argo float's track is measured drift at its parking depth.** So the same
integrator can be run from a float's own first Fix and the answer laid beside where the float
actually went. The result is not a claim; it is a measurement of how far the current field alone
gets you, on 228 instruments, in this water, over this season. `track_against_drift` is that.

Numerically it is a midpoint (RK2) scheme on a field bilinear in space, linear in time between
the ten-day analyses, and nearest in depth. Nearest in depth is the same rule the adapter used
landing Copernicus's 1/12 degree data on this grid: a blend across 5 m and 1000 m would report a
current that exists at neither depth. Bilinear in space **refuses to blend across land**, exactly
as `Grid.column_at` does, so a trajectory stops at a coast rather than being carried through it
by an averaged-in open-ocean value.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Sequence

import numpy as np

from .grid import Grid

# The same figure `coverage.py` and `anomaly.py` use, so every distance in this project comes
# from one constant. One degree of latitude, in metres.
METRES_PER_DEGREE = 111_320.0

#: How long an integration step is by default. Six hours against a ten-day analysis is forty
#: sub-steps per analysis interval, which is far finer than the field it is reading and costs
#: nothing; the point is that the step is a property of the integrator and not of the data.
DEFAULT_STEP_HOURS = 6.0

#: Where an Argo float spends the ten days between surfacings, and therefore the depth at which
#: its track is a measurement of the current. The Argo programme's own standard.
PARKING_DEPTH_METRES = 1000.0


@dataclass(frozen=True)
class DriftStep:
    """One position on a trajectory."""

    time: datetime
    longitude: float
    latitude: float


@dataclass(frozen=True)
class DriftPath:
    steps: list[DriftStep]
    #: Why the integration stopped. A trajectory that ran out of ocean has to say so: a line
    #: that simply ends looks identical to one that finished, and they mean opposite things.
    ended: str


@dataclass(frozen=True)
class DriftComparison:
    """A float's own track against the trajectory the analysed currents imply from its first Fix.

    `observed_km` and `predicted_km` are distances travelled from the start; `separations_km` is
    the distance between the two positions at the same instant, which is the number that matters
    and the one a search would care about.
    """

    days: list[float]
    observed: list[DriftStep]
    predicted: list[DriftStep]
    observed_km: list[float]
    predicted_km: list[float]
    separations_km: list[float]
    #: Why the predicted trajectory stopped, if it did before the last Fix.
    ended: str


@dataclass(frozen=True)
class CurrentSeries:
    """The baked current field: u and v as Grids, one pair per Timestep.

    `u` and `v` are eastward and northward velocity in m/s on the model's own Levels and
    horizontal axes - the Grid, never a Volume. Every step of an integration is a measurement,
    and a Volume is quantised, depth-warped and back-filled across land for the GPU's benefit.
    """

    times: list[datetime]
    u: list[Grid]
    v: list[Grid]

    def __post_init__(self) -> None:
        if not self.times:
            raise ValueError("a current series needs at least one Timestep")
        if not (len(self.times) == len(self.u) == len(self.v)):
            raise ValueError("times, u and v must be the same length")

    def velocity_at(
        self, when: datetime, depth_metres: float, latitude: float, longitude: float
    ) -> tuple[float, float] | None:
        """Eastward and northward velocity in m/s, or None where there is no ocean to read.

        None covers both "outside the region" and "on land", and the caller treats them the
        same way - the trajectory stops. They are different facts, but neither of them is a
        velocity, and returning a zero for either would draw a float sitting patiently against a
        coastline as though the water there were still.
        """
        before, after, weight = self._bracket_time(when)
        first = self._sample(self.u[before], self.v[before], depth_metres, latitude, longitude)
        if first is None:
            return None
        if weight == 0.0 or after == before:
            return first
        second = self._sample(self.u[after], self.v[after], depth_metres, latitude, longitude)
        if second is None:
            return None
        return (
            first[0] + weight * (second[0] - first[0]),
            first[1] + weight * (second[1] - first[1]),
        )

    def covers(self, when: datetime) -> bool:
        """Is this instant inside the analysed period at all?

        `_bracket_time` deliberately **holds** the first and the last analysis rather than
        extrapolating, because an extrapolated current is a forecast and this platform does not
        make them. That is the right behaviour for drawing a line and the wrong behaviour for
        scoring one: a comparison that starts nineteen days before the first analysis is scored
        against a field that was not measured then, and it looks exactly like a comparison that
        was. Measured before this existed: the earliest Fix in the bake was 2026-03-22 against a
        first analysis of 2026-04-10, and 199 of 202 baked comparisons started before it.

        So anything that produces a *score* asks this first, and anything that draws a line does
        not. `choose_cast` and the Float markers already make the same refusal.
        """
        return self.times[0] <= when <= self.times[-1]

    def _bracket_time(self, when: datetime) -> tuple[int, int, float]:
        """The two analyses either side of an instant, and how far between them it sits.

        Before the first and after the last, the end is held rather than extrapolated. A current
        extrapolated past the end of the data is a forecast, and this platform does not make
        forecasts; holding the last analysed field is at least a stated assumption.
        """
        if when <= self.times[0]:
            return 0, 0, 0.0
        if when >= self.times[-1]:
            last = len(self.times) - 1
            return last, last, 0.0
        for index in range(len(self.times) - 1):
            start, end = self.times[index], self.times[index + 1]
            if start <= when <= end:
                span = (end - start).total_seconds()
                return index, index + 1, (when - start).total_seconds() / span
        last = len(self.times) - 1
        return last, last, 0.0

    @staticmethod
    def _sample(
        u: Grid, v: Grid, depth_metres: float, latitude: float, longitude: float
    ) -> tuple[float, float] | None:
        level = int(np.argmin(np.abs(u.levels - depth_metres)))
        try:
            row, row_weight = u.bracket(u.latitudes, latitude, "latitude")
            col, col_weight = u.bracket(u.longitudes, longitude, "longitude")
        except ValueError:
            return None  # outside the region entirely

        weights = np.array(
            [
                [(1 - row_weight) * (1 - col_weight), (1 - row_weight) * col_weight],
                [row_weight * (1 - col_weight), row_weight * col_weight],
            ]
        )
        east = u.values[level, row : row + 2, col : col + 2]
        north = v.values[level, row : row + 2, col : col + 2]
        # Any masked corner refuses the whole lookup. Same rule as `Grid.column_at`: near a
        # coast the corners that do carry data are the open ocean, and blending them in
        # manufactures a current for a point that is on land.
        if not (np.isfinite(east).all() and np.isfinite(north).all()):
            return None
        return float((east * weights).sum()), float((north * weights).sum())


def integrate_drift(
    series: CurrentSeries,
    longitude: float,
    latitude: float,
    start_time: datetime,
    depth_metres: float,
    hours: float,
    step_hours: float = DEFAULT_STEP_HOURS,
) -> DriftPath:
    """Follow the analysed current forward from one point, and return the trajectory.

    Midpoint rule: the velocity used for a whole step is the one halfway along it, which is what
    lets a trajectory turn *inside* a step rather than a step late. Plain Euler carries a float
    straight through a current that changes along its own path, and in a western boundary
    current that is not a small error.
    """
    steps = [DriftStep(time=start_time, longitude=longitude, latitude=latitude)]
    dt = step_hours * 3600.0
    count = max(int(round(hours / step_hours)), 0)
    outside = "left the area with current data"

    here_lon, here_lat, now = longitude, latitude, start_time
    current = series.velocity_at(now, depth_metres, here_lat, here_lon)
    if current is None:
        return DriftPath(steps=steps, ended=outside)

    for _ in range(count):
        mid_lon, mid_lat = _advance(here_lon, here_lat, current, dt / 2)
        mid_time = now + timedelta(seconds=dt / 2)
        middle = series.velocity_at(mid_time, depth_metres, mid_lat, mid_lon)
        if middle is None:
            return DriftPath(steps=steps, ended=outside)

        next_lon, next_lat = _advance(here_lon, here_lat, middle, dt)
        next_time = now + timedelta(seconds=dt)
        # The new position is checked BEFORE it is appended, not on the next pass. A trajectory
        # is a line somebody reads a position off, and a line whose last point sits outside the
        # data is claiming a drift the analysis never carried. The lookup is not wasted: it is
        # the one the next step starts from.
        ahead = series.velocity_at(next_time, depth_metres, next_lat, next_lon)
        if ahead is None:
            return DriftPath(steps=steps, ended=outside)

        here_lon, here_lat, now, current = next_lon, next_lat, next_time, ahead
        steps.append(DriftStep(time=now, longitude=here_lon, latitude=here_lat))

    return DriftPath(steps=steps, ended="finished")


def _advance(
    longitude: float, latitude: float, velocity: tuple[float, float], seconds: float
) -> tuple[float, float]:
    """One step, in degrees.

    The cosine on the longitude axis is the constant this file exists to get right. A degree of
    longitude at 20 N is 94% of a degree at the equator, so without it every trajectory in the
    Arabian Sea is 6% short - smoothly, plausibly and invisibly.
    """
    east, north = velocity
    new_lat = latitude + (north * seconds) / METRES_PER_DEGREE
    scale = max(math.cos(math.radians(latitude)), 1e-6)
    new_lon = longitude + (east * seconds) / (METRES_PER_DEGREE * scale)
    return new_lon, new_lat


def separation_km(a: DriftStep, b: DriftStep) -> float:
    """Great-circle distance between two positions, in kilometres."""
    radius_km = METRES_PER_DEGREE * 180.0 / math.pi / 1000.0
    lat1, lat2 = math.radians(a.latitude), math.radians(b.latitude)
    dlat = lat2 - lat1
    dlon = math.radians(b.longitude - a.longitude)
    h = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    return 2 * radius_km * math.asin(min(1.0, math.sqrt(h)))


def track_against_drift(
    series: CurrentSeries,
    fixes: Sequence[tuple[datetime, float, float]],
    depth_metres: float = PARKING_DEPTH_METRES,
    step_hours: float = DEFAULT_STEP_HOURS,
) -> DriftComparison | None:
    """The float's own track against the drift the analysed currents imply from its first Fix.

    This is the part that makes the feature honest. Every other drift demo asks to be believed;
    this one is checked, against an instrument that was in the same water at the same time, and
    it reports the separation in kilometres rather than a verdict.

    Returns None where there is nothing to compare: fewer than two Fixes, or a start position
    the current field does not cover. Refusing is the right answer to both - a comparison drawn
    from one point is a point, and a trajectory started outside the data is a guess.

    **Fixes outside the analysed period are dropped before anything else happens.** Outside it
    `_bracket_time` holds the nearest analysis, which is a stated assumption for drawing and a
    silent one for scoring: the separation would be measured against a current field that was
    not measured on that day. See `CurrentSeries.covers`.
    """
    ordered = [fix for fix in sorted(fixes, key=lambda f: f[0]) if series.covers(fix[0])]
    if len(ordered) < 2:
        return None

    start_time, start_lon, start_lat = ordered[0]
    if series.velocity_at(start_time, depth_metres, start_lat, start_lon) is None:
        return None

    total_hours = (ordered[-1][0] - start_time).total_seconds() / 3600.0
    path = integrate_drift(
        series,
        longitude=start_lon,
        latitude=start_lat,
        start_time=start_time,
        depth_metres=depth_metres,
        hours=total_hours,
        step_hours=step_hours,
    )

    days, observed, predicted = [], [], []
    observed_km, predicted_km, separations = [], [], []
    for when, lon, lat in ordered:
        if when > path.steps[-1].time:
            break  # the trajectory stopped before this Fix; the comparison stops with it
        here = DriftStep(time=when, longitude=lon, latitude=lat)
        there = _at_time(path, when)
        days.append((when - start_time).total_seconds() / 86400.0)
        observed.append(here)
        predicted.append(there)
        observed_km.append(separation_km(observed[0], here))
        predicted_km.append(separation_km(predicted[0], there))
        separations.append(separation_km(here, there))

    if len(days) < 2:
        return None

    return DriftComparison(
        days=days,
        observed=observed,
        predicted=predicted,
        observed_km=observed_km,
        predicted_km=predicted_km,
        separations_km=separations,
        ended=path.ended,
    )


def _at_time(path: DriftPath, when: datetime) -> DriftStep:
    """The trajectory's position at an arbitrary instant, interpolated between its own steps.

    A Fix does not land on an integration step, and snapping it to the nearest one would put up
    to three hours of drift into the separation figure - which at 1 m/s is 10 km of error in a
    number the whole feature is judged on.
    """
    steps = path.steps
    if when <= steps[0].time:
        return steps[0]
    if when >= steps[-1].time:
        return steps[-1]
    for index in range(len(steps) - 1):
        a, b = steps[index], steps[index + 1]
        if a.time <= when <= b.time:
            span = (b.time - a.time).total_seconds()
            t = (when - a.time).total_seconds() / span if span else 0.0
            return DriftStep(
                time=when,
                longitude=a.longitude + t * (b.longitude - a.longitude),
                latitude=a.latitude + t * (b.latitude - a.latitude),
            )
    return steps[-1]
