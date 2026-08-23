"""Source Adapter for Argo Profiles, via the Coriolis GDAC ERDDAP mirror at Ifremer.

Two things this adapter is responsible for beyond fetching:

Pressure is not depth. Argo reports pressure in decibars. In the upper ocean the two are
numerically close enough that people are casual about it, but they are not the same quantity,
and the platform's whole premise is putting an observation at the right depth inside a model.
So we convert properly rather than pretending 1 dbar == 1 m.

Floats go wrong. Real GDAC data contains sensors that have drifted or failed - this region
currently has a float reporting ~20 PSU at the surface, which is fresher than the Baltic and
impossible in the open Bay of Bengal. Left alone it renders as a wild spike on the
Collocation chart and looks like our bug. Implausible values are dropped per channel, so a
cast with a failed salinity sensor still contributes its perfectly good temperature.
"""

from __future__ import annotations

import csv
import io
from collections import defaultdict
from datetime import datetime, timezone
from typing import Sequence

import numpy as np
import requests

from .base import BoundingBox, Profile

_SERVER = "https://erddap.ifremer.fr/erddap/tabledap/ArgoFloats.csv"
_TIMEOUT = 180

# Temperature uses Argo's global gross range check (QC Manual, test 4).
#
# Salinity does NOT. Argo's global floor is 2 PSU, which is meant to pass brackish marginal
# seas, and the failed float in this region reports ~20 PSU — comfortably inside it. So this
# floor is a deliberately regional one, stricter than the Argo standard, and it is a judgement
# call rather than a published threshold.
#
# 25 PSU is the floor rather than something tighter because the northern Bay of Bengal really
# is that fresh: the Ganges-Brahmaputra discharge drives monsoon surface salinity down to
# roughly 28 PSU, and clamping at, say, 33 would delete one of the most scientifically
# interesting features in India's own EEZ as though it were instrument error.
_PLAUSIBLE = {
    "temperature": (-2.5, 40.0),
    "salinity": (25.0, 41.0),
}

# A cast with fewer points than this is not worth drawing as a Profile.
_MIN_POINTS = 5


class ArgoErddapSource:
    """Reads in-situ Profiles from the Argo Global Data Assembly Centre."""

    name = "Argo GDAC (Coriolis/Ifremer ERDDAP)"
    attribution = (
        "Argo float data collected and made freely available by the International Argo "
        "Program and the national programmes that contribute to it (https://argo.ucsd.edu). "
        "The Argo Program is part of the Global Ocean Observing System."
    )

    def fetch_profiles(
        self, bbox: BoundingBox, start: datetime, end: datetime
    ) -> Sequence[Profile]:
        selector = (
            "platform_number,time,latitude,longitude,"
            "pres_adjusted,temp_adjusted,psal_adjusted"
            f"&time>={start.strftime('%Y-%m-%dT%H:%M:%SZ')}"
            f"&time<={end.strftime('%Y-%m-%dT%H:%M:%SZ')}"
            f"&latitude>={bbox.south}&latitude<={bbox.north}"
            f"&longitude>={bbox.west}&longitude<={bbox.east}"
        )
        response = requests.get(f"{_SERVER}?{selector}", timeout=_TIMEOUT)
        response.raise_for_status()
        return parse_profiles(response.text)


def parse_profiles(csv_text: str) -> list[Profile]:
    """Turn ERDDAP's flat CSV into Profiles.

    ERDDAP returns one row per measurement, with the cast identified only by the repetition of
    platform number and time - there is no profile id column. Grouping on that pair is what
    reconstitutes the casts.
    """
    reader = csv.reader(io.StringIO(csv_text))
    header = next(reader, None)
    if header is None:
        return []
    next(reader, None)  # ERDDAP's units row

    column = {name: index for index, name in enumerate(header)}
    casts: dict[tuple[str, str], list[tuple[float, float, float]]] = defaultdict(list)
    positions: dict[tuple[str, str], tuple[float, float]] = {}

    for row in reader:
        try:
            key = (row[column["platform_number"]], row[column["time"]])
            positions[key] = (
                float(row[column["latitude"]]),
                float(row[column["longitude"]]),
            )
            casts[key].append(
                (
                    _to_float(row[column["pres_adjusted"]]),
                    _to_float(row[column["temp_adjusted"]]),
                    _to_float(row[column["psal_adjusted"]]),
                )
            )
        except (KeyError, IndexError, ValueError):
            continue  # a malformed row is not a reason to lose the whole download

    profiles: list[Profile] = []
    for (platform_id, stamp), rows in casts.items():
        pressure, temperature, salinity = (np.array(c, dtype=float) for c in zip(*rows))

        latitude, longitude = positions[(platform_id, stamp)]
        depths = pressure_to_depth(pressure, latitude)

        temperature = _reject_implausible(temperature, "temperature")
        salinity = _reject_implausible(salinity, "salinity")

        usable = np.isfinite(depths) & (np.isfinite(temperature) | np.isfinite(salinity))
        if usable.sum() < _MIN_POINTS:
            continue

        order = np.argsort(depths[usable])
        profiles.append(
            Profile(
                platform_id=platform_id,
                latitude=latitude,
                longitude=longitude,
                time=datetime.strptime(stamp, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc),
                depths=depths[usable][order],
                values={
                    "temperature": temperature[usable][order],
                    "salinity": salinity[usable][order],
                },
            )
        )

    profiles.sort(key=lambda p: (p.platform_id, p.time))
    return profiles


def pressure_to_depth(pressure_dbar, latitude: float):
    """Convert Argo's pressure to depth in metres (Saunders & Fofonoff, as used by UNESCO).

    Gravity varies with latitude, so the same pressure sits at a slightly different depth in
    the Arabian Sea than off Antarctica. Over 2000 m the correction is several metres - small,
    but this is the axis the whole Collocation is aligned on, so it is worth being right.
    """
    pressure = np.asarray(pressure_dbar, dtype=float)
    sin2 = np.sin(np.radians(latitude)) ** 2
    gravity = 9.780318 * (1.0 + 5.2788e-3 * sin2 + 2.36e-5 * sin2**2) + 1.092e-6 * pressure
    numerator = (
        (((-1.82e-15 * pressure + 2.279e-10) * pressure - 2.2512e-5) * pressure + 9.72659)
        * pressure
    )
    return numerator / gravity


def _reject_implausible(values: np.ndarray, quantity: str) -> np.ndarray:
    low, high = _PLAUSIBLE[quantity]
    return np.where((values >= low) & (values <= high), values, np.nan)


def _to_float(raw: str) -> float:
    return float(raw) if raw not in ("", "NaN") else float("nan")
