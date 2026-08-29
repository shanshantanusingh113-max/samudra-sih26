"""Source Adapter for moored buoys, from NOAA's real-time GTS feed.

PS 26067 asks that the design extend to CTDs, moorings, HF-radar and ADCP. The seam was real and
tested and nothing was plugged into it, which is a weaker claim than it reads as. This wires up
the one class of instrument that is both reachable on an open endpoint and *Indian*.

The Observing System Monitoring Center flattens the whole Global Telecommunication System into
one ERDDAP table. It is CC0, needs no login, and speaks the same tabledap protocol as the Argo
adapter next door. Measured over `DEMO_REGION` for a single ten-day window, 20-30 Jul 2026:
100,405 rows, of which 94,653 carry subsurface temperature, from 169 profiling floats, 13 generic
moored buoys, 2 tropical moored buoys, 122 ships and 14 drifters.

Five of those moorings report a real water column:

    23459    India    14.0 N 87.0 E   Bay of Bengal    10 levels, 0-500 m
    23451    India    14.9 N 69.1 E   Arabian Sea       9 levels, 0-500 m
    23452      -      12.3 N 68.2 E   Arabian Sea      10 levels, 0-500 m
    2300009  RAMA     15.0 N 89.0 E                    11 levels, 0-500 m
    2300019  RAMA      3.9 S 65.0 E                     9 levels, 0-500 m

The 23xxx buoys are India's OMNI network, run by NIOT with INCOIS as the data centre. The
2300xxx pair are RAMA, the joint MoES-NOAA array. Across the bake's whole window there are
consistently six or seven of them with subsurface profiles.

Why this is a real test of the seam rather than a second Argo

Everything superficial is different, and all of it is absorbed here:

- **Depth, not pressure.** Argo reports decibars and `argo.py` converts properly. This feed
  reports metres already, and converting again would move a 500 m level by about 12 m.
- **One row per level.** A cast is the repetition of (platform, time), the same trick the Argo
  parser uses, but the level is a column rather than a row's position.
- **The surface lives somewhere else.** At 0 m the subsurface columns are empty and the reading
  is in `sst`/`sss`. Ignoring that would drop the level a fisheries or cyclone reader looks at
  first from every mooring in the feed.
- **No quality flags at all.** Argo's own flags are the first of this project's two QC layers
  and there is no equivalent here, so the regional plausible range is the only layer there is.
  That is a fact about the provider and is stated rather than papered over.
- **It never moves.** Which is the thing that makes it worth having: a mooring can be compared
  against the model at every Timestep, and an Argo float cannot, because it has drifted
  somewhere else by the next one.

What is deliberately not read

`uo` and `vo` are in this table and **no row in this region populates them**, measured over the
bake's window - even though OMNI buoys do measure currents. Declaring the channel would be
declaring a capability the feed does not deliver here. See `docs/plan/03-requirement-gaps.md`.
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

_TIMEOUT = 300

_SERVER = "https://erddap.aoml.noaa.gov/gdp/erddap/tabledap/OSMC_RealTime.csv"

_COLUMNS = (
    "platform_code",
    "platform_type",
    "country",
    "time",
    "latitude",
    "longitude",
    "observation_depth",
    "ztmp",
    "zsal",
    "sst",
    "sss",
)

# Which platform types are moorings. The feed's vocabulary is loose - India's OMNI buoys come
# through as "MOORED BUOYS (GENERIC)" and RAMA as "TROPICAL MOORED BUOYS" - so the test is a
# substring rather than a set of exact strings that a provider is free to change.
_MOORED = "MOORED"

# A cast with fewer levels than this is a surface measurement, not a water column. About ten
# coastal Indian buoys report at 0 m only; they are real and they are not Profiles, because
# there is nothing to draw on a depth axis.
MIN_PROFILE_LEVELS = 4

# The same regional ranges the Argo adapter uses, for the same reasons - see ADR 0008. Here they
# carry more weight, because this feed publishes no quality flags of its own for them to back up.
_PLAUSIBLE = {
    "temperature": (-2.5, 40.0),
    "salinity": (25.0, 41.0),
}


def _to_float(raw: str) -> float:
    raw = raw.strip()
    return float(raw) if raw not in ("", "NaN", "nan") else float("nan")


def _reject_implausible(values: np.ndarray, quantity: str) -> np.ndarray:
    low, high = _PLAUSIBLE[quantity]
    return np.where((values >= low) & (values <= high), values, np.nan)


def parse_osmc(csv_text: str) -> list[Profile]:
    """Turn the GTS feed's flat CSV into Profiles, one per moored report."""
    reader = csv.reader(io.StringIO(csv_text))
    header = next(reader, None)
    if header is None:
        return []
    next(reader, None)  # ERDDAP's units row

    index = {name: position for position, name in enumerate(header)}
    try:
        at = {name: index[name] for name in _COLUMNS}
    except KeyError:
        return []  # not a layout this adapter understands

    levels: dict[tuple[str, str], list[tuple[float, float, float]]] = defaultdict(list)
    about: dict[tuple[str, str], tuple[float, float, str]] = {}

    for row in reader:
        try:
            if _MOORED not in row[at["platform_type"]].upper():
                continue
            key = (row[at["platform_code"]], row[at["time"]])
            latitude = float(row[at["latitude"]])
            longitude = float(row[at["longitude"]])
            depth = _to_float(row[at["observation_depth"]])
            # At the surface the subsurface columns are empty and the reading is in sst/sss.
            # Prefer the subsurface column where it has something, so a feed that one day fills
            # both does not silently switch behaviour.
            temperature = _to_float(row[at["ztmp"]])
            salinity = _to_float(row[at["zsal"]])
            if not np.isfinite(temperature):
                temperature = _to_float(row[at["sst"]])
            if not np.isfinite(salinity):
                salinity = _to_float(row[at["sss"]])
            country = row[at["country"]].strip()
        except (IndexError, ValueError):
            continue  # a malformed row is not a reason to lose the whole download

        if not np.isfinite(depth):
            continue
        # Parsed before stored, so a row that fails halfway cannot leave an empty cast behind.
        about[key] = (latitude, longitude, country)
        levels[key].append((depth, temperature, salinity))

    profiles: list[Profile] = []
    for (platform_id, stamp), rows in levels.items():
        depths, temperature, salinity = (np.array(c, dtype=float) for c in zip(*rows))
        temperature = _reject_implausible(temperature, "temperature")
        salinity = _reject_implausible(salinity, "salinity")

        usable = np.isfinite(depths) & (np.isfinite(temperature) | np.isfinite(salinity))
        if usable.sum() < MIN_PROFILE_LEVELS:
            continue

        latitude, longitude, country = about[(platform_id, stamp)]
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
                kind="mooring",
                country=country or None,
            )
        )

    profiles.sort(key=lambda p: (p.platform_id, p.time))
    return profiles


def thin_to_one_per_day(profiles: Sequence[Profile]) -> list[Profile]:
    """Keep the richest report each instrument made each day.

    A moored buoy reports every three hours, so a ten-day Timestep window holds about eighty
    casts per instrument that all describe the same water column. That is a fact about telemetry
    and not about the ocean - the same trap `coverage.py` records for counting levels instead of
    casts - and keeping all of them would make a mooring look like eighty times the evidence it
    is, as well as making `collocations.json` enormous.

    Richest rather than first, because a report can drop a level or two.
    """
    best: dict[tuple[str, str], Profile] = {}
    for profile in profiles:
        key = (profile.platform_id, profile.time.strftime("%Y-%m-%d"))
        current = best.get(key)
        if current is None or len(profile) > len(current):
            best[key] = profile
    return sorted(best.values(), key=lambda p: (p.platform_id, p.time))


class OsmcSource:
    """Moored buoys reporting into the GTS, as seen by NOAA's OSMC feed."""

    name = "NOAA OSMC real-time (GTS)"
    attribution = (
        "Moored buoy observations from the Global Telecommunication System, republished by "
        "NOAA's Observing System Monitoring Center. Public domain (CC0 1.0). Indian buoys are "
        "the NIOT/INCOIS OMNI network; the RAMA array is a joint MoES-NOAA programme."
    )
    endpoint = _SERVER

    @property
    def requested(self) -> str:
        return ",".join(_COLUMNS)

    def fetch_profiles(
        self, bbox: BoundingBox, start: datetime, end: datetime
    ) -> Sequence[Profile]:
        selector = (
            f"{self.requested}"
            f"&time>={start.strftime('%Y-%m-%dT%H:%M:%SZ')}"
            f"&time<={end.strftime('%Y-%m-%dT%H:%M:%SZ')}"
            f"&latitude>={bbox.south}&latitude<={bbox.north}"
            f"&longitude>={bbox.west}&longitude<={bbox.east}"
            # Ask the server to do the filtering. Without it this is a hundred thousand rows of
            # which four thousand are moorings, over a link to Miami.
            '&platform_type=~".*MOORED.*"'
        )
        response = requests.get(f"{self.endpoint}?{selector}", timeout=_TIMEOUT)
        if response.status_code == 404:
            return []  # ERDDAP's "your query produced no matching results"
        response.raise_for_status()
        return thin_to_one_per_day(parse_osmc(response.text))
