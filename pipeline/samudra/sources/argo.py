"""Source Adapters for Argo Profiles.

Two providers serve the same international programme, and they do not agree on how.

Ifremer's Coriolis GDAC mirror uses lower-case column names and populates the delayed-mode
`*_adjusted` fields. INCOIS's own archive uses upper-case names and ships those adjusted
columns entirely empty, filling the raw ones instead. An adapter that preferred adjusted
blindly would read INCOIS as a table of nothing.

So the column layout is data, not code: a `ProfileColumns` says what a provider calls each
quantity and in what order to prefer its variants, and one parser serves both. That is the
extensibility claim made concrete - a third provider is a new `ProfileColumns` and a small
class, and nothing downstream of `Profile` changes.

Two responsibilities beyond fetching:

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
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Sequence

import numpy as np
import requests

from ..tls import ca_bundle
from .base import BoundingBox, Profile

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


@dataclass(frozen=True)
class ProfileColumns:
    """What one provider calls each quantity, and which variant to trust first."""

    platform: str
    time: str
    latitude: str
    longitude: str
    pressure: tuple[str, ...]
    temperature: tuple[str, ...]
    salinity: tuple[str, ...]


# Ifremer/Coriolis: delayed-mode adjusted values are present and are the better science.
GDAC_COLUMNS = ProfileColumns(
    platform="platform_number",
    time="time",
    latitude="latitude",
    longitude="longitude",
    pressure=("pres_adjusted", "pres"),
    temperature=("temp_adjusted", "temp"),
    salinity=("psal_adjusted", "psal"),
)

# INCOIS: upper case, and the adjusted columns are served empty — raw carries everything.
INCOIS_COLUMNS = ProfileColumns(
    platform="PLATFORM_NUMBER",
    time="time",
    latitude="latitude",
    longitude="longitude",
    pressure=("PRES_ADJUSTED", "PRES"),
    temperature=("TEMP_ADJUSTED", "TEMP"),
    salinity=("PSAL_ADJUSTED", "PSAL"),
)


class ArgoErddapSource:
    """In-situ Profiles from the Argo Global Data Assembly Centre (Coriolis/Ifremer)."""

    name = "Argo GDAC (Coriolis/Ifremer ERDDAP)"
    attribution = (
        "Argo float data collected and made freely available by the International Argo "
        "Program and the national programmes that contribute to it (https://argo.ucsd.edu). "
        "The Argo Program is part of the Global Ocean Observing System."
    )
    columns = GDAC_COLUMNS
    endpoint = "https://erddap.ifremer.fr/erddap/tabledap/ArgoFloats.csv"
    requested = (
        "platform_number,time,latitude,longitude,pres_adjusted,temp_adjusted,psal_adjusted"
    )

    def certificates(self) -> str | bool:
        return True

    def fetch_profiles(
        self, bbox: BoundingBox, start: datetime, end: datetime
    ) -> Sequence[Profile]:
        selector = (
            f"{self.requested}"
            f"&time>={start.strftime('%Y-%m-%dT%H:%M:%SZ')}"
            f"&time<={end.strftime('%Y-%m-%dT%H:%M:%SZ')}"
            f"&latitude>={bbox.south}&latitude<={bbox.north}"
            f"&longitude>={bbox.west}&longitude<={bbox.east}"
        )
        response = requests.get(
            f"{self.endpoint}?{selector}", timeout=_TIMEOUT, verify=self.certificates()
        )
        response.raise_for_status()
        return parse_profiles(response.text, self.columns)


class IncoisArgoSource(ArgoErddapSource):
    """The same Profiles, from INCOIS's own archive.

    Present to demonstrate that the adapter seam is real rather than asserted: this provider
    names every column differently and inverts which variant carries the data, and absorbing
    both differences costs a subclass with four attributes and no new parsing code.

    It is deliberately NOT the demo's observation source. INCOIS's Argo archive ends
    2025-04-23 while their gridded analysis runs to 2026-07-30, and collocating a July 2026
    analysis against observations more than a year older would be comparing two different
    oceans. The Ifremer GDAC mirror is current, so that is what the demo uses.
    """

    name = "INCOIS Argo archive"
    attribution = (
        "Indian National Centre for Ocean Information Services (INCOIS), Ministry of Earth "
        "Sciences — INDIAN ARGO Floats Data. Historical archive; coverage ends 2025-04-23."
    )
    columns = INCOIS_COLUMNS
    endpoint = "https://erddap.incois.gov.in/erddap/tabledap/Indian_ARGO_Floats.csv"
    requested = (
        "PLATFORM_NUMBER,time,latitude,longitude,PRES,TEMP,PSAL,"
        "PRES_ADJUSTED,TEMP_ADJUSTED,PSAL_ADJUSTED"
    )
    coverage_ends = datetime(2025, 4, 23, tzinfo=timezone.utc)

    def certificates(self) -> str | bool:
        return ca_bundle()  # INCOIS omits an intermediate certificate; see tls.py


def parse_profiles(csv_text: str, columns: ProfileColumns = GDAC_COLUMNS) -> list[Profile]:
    """Turn one provider's flat CSV into Profiles.

    ERDDAP returns one row per measurement, with the cast identified only by the repetition of
    platform number and time - there is no profile id column. Grouping on that pair is what
    reconstitutes the casts.
    """
    reader = csv.reader(io.StringIO(csv_text))
    header = next(reader, None)
    if header is None:
        return []
    next(reader, None)  # ERDDAP's units row

    index = {name: position for position, name in enumerate(header)}
    try:
        platform_at = index[columns.platform]
        time_at = index[columns.time]
        latitude_at = index[columns.latitude]
        longitude_at = index[columns.longitude]
    except KeyError:
        return []  # not a layout this adapter understands

    # Only the variants this provider actually served, in the order we trust them.
    pressure_at = [index[name] for name in columns.pressure if name in index]
    temperature_at = [index[name] for name in columns.temperature if name in index]
    salinity_at = [index[name] for name in columns.salinity if name in index]
    if not pressure_at:
        return []

    casts: dict[tuple[str, str], list[tuple[float, float, float]]] = defaultdict(list)
    positions: dict[tuple[str, str], tuple[float, float]] = {}

    for row in reader:
        try:
            key = (row[platform_at], row[time_at])
            latitude = float(row[latitude_at])
            longitude = float(row[longitude_at])
            measurement = (
                _first_present(row, pressure_at),
                _first_present(row, temperature_at),
                _first_present(row, salinity_at),
            )
        except (IndexError, ValueError):
            continue  # a malformed row is not a reason to lose the whole download

        # Everything is parsed before anything is stored. Touching `casts[key]` first would
        # have a defaultdict create the entry, and a row that then failed to parse would leave
        # an empty cast behind — which `zip(*rows)` below cannot unpack, taking down the entire
        # download over one truncated line.
        positions[key] = (latitude, longitude)
        casts[key].append(measurement)

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


def _first_present(row: list[str], candidates: list[int]) -> float:
    """The first variant that actually carries a number — adjusted if served, else raw."""
    for position in candidates:
        value = _to_float(row[position])
        if np.isfinite(value):
            return value
    return float("nan")


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
