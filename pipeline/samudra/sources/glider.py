"""Source Adapter for the EGO glider GDAC - the FTP archive PS 26067 names by hand.

    ftp://ftp.ifremer.fr/ifremer/glider/v2/

The PS names gliders three times: in the gaps it lists, in the core functional requirements, and
in the dataset links added in the September 2026 revision. "Not built" is the wrong answer to
give three times, so this is built - and then it publishes what the data actually says, which is
the more useful half.

What the archive holds for India's waters, measured
---------------------------------------------------
The complete global index was downloaded on 2026-09-01 and every record scanned:

    glider_prof_index.txt   248,440,873 bytes   824,641 lines   824,632 profile records

Against `DEMO_REGION`:

| | |
| --- | --- |
| Profiles in the region | **2,876** |
| Distinct gliders | **1** (WMO 2801950) |
| Deployments | **2** |
| By year | 2021: 500, 2022: 2,376, **2023 to 2026: zero** |

| Deployment | From | To | Casts | Max pressure |
| --- | --- | --- | --- | --- |
| `sea057/sea057_20220707` | 2022-07-05 | **2022-10-14** | 1,424 | 819 dbar |
| `sea057/sea057_20220128` | 2021-11-20 | 2022-03-26 | 1,452 | 818 dbar |

**The newest glider cast in India's waters is 2022-10-14**, three years and ten months before
this bake's window opens. So `fetch_profiles` over the demo window returns nothing, and it
returns a *finding* alongside the nothing - the count it scanned, the newest cast it found, and
the deployments it found them in. An adapter that answers an impossible question with a silent
empty list is how a dead data source gets mistaken for a working one, and this project has a
rule about that: a source that cannot share the demo's timeline is not a source.

**The gap is India's glider programme, not this adapter.**

Note the archives disagree with each other. The ERDDAP `OceanGlidersGDACTrajectories` dataset
reports five 2016 Bay of Bengal deployments - Humpback_504, Denebola_382, Bellatrix_368,
Marlin_505, Melonhead_506 - and **none of them appear in the v2 FTP index at all.** The FTP is
what the PS names, so the FTP is the answer of record.

Why the index is read and not walked
------------------------------------
The GDAC publishes one directory file describing every profile file it holds, which is how you
find out what is there without listing a quarter of a million directories. It is 248 MB, so the
bake never downloads it: the deployments are already known from the scan above, and the scan is
reproducible from `scan_index` against a copy of the index anyone can fetch.
"""

from __future__ import annotations

import io
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Iterable, Sequence
from urllib.request import urlopen

import numpy as np

from .base import BoundingBox, Profile

FTP_ROOT = "ftp://ftp.ifremer.fr/ifremer/glider/v2"
INDEX_URL = f"{FTP_ROOT}/glider_prof_index.txt"
_TIMEOUT = 300

# What the index calls the columns this adapter needs. Read from the file's own header line
# rather than by position: EGO declares its columns, and positional parsing would break the day
# they add one - as an empty ocean rather than as an error.
_REQUIRED = ("file", "wmo", "date", "latitude", "longitude")


@dataclass(frozen=True)
class IndexEntry:
    """One line of the GDAC directory file: one cast, and where its NetCDF lives."""

    path: str
    wmo: str
    time: datetime
    latitude: float
    longitude: float
    pressure_max: float
    levels: int
    parameters: tuple[str, ...]

    @property
    def deployment(self) -> str:
        """`sea057/sea057_20220707` - the glider and the mission, from the file path."""
        parts = self.path.strip("/").split("/")
        return "/".join(parts[:2]) if len(parts) >= 2 else self.path.strip("/")

    @property
    def url(self) -> str:
        return f"{FTP_ROOT}/{self.path.lstrip('/')}"


@dataclass(frozen=True)
class Deployment:
    """One glider mission inside the region, and what it measured."""

    name: str
    wmo: str
    casts: int
    first: datetime
    last: datetime
    max_pressure: float
    parameters: tuple[str, ...]


def parse_index(lines: Iterable[str]) -> list[IndexEntry]:
    """Every readable profile record in a GDAC directory file.

    Comment lines are skipped, the column header is found by looking for the names rather than by
    counting lines, and a row that cannot be read is dropped rather than raised. There are
    824,632 of them from somebody else's archive; one malformed row must not cost the finding.
    """
    columns: dict[str, int] | None = None
    out: list[IndexEntry] = []

    for line in lines:
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        cells = line.split(",")
        if columns is None:
            if all(name in cells for name in _REQUIRED):
                columns = {name: index for index, name in enumerate(cells)}
            continue
        entry = _entry(cells, columns)
        if entry is not None:
            out.append(entry)
    return out


def _entry(cells: list[str], columns: dict[str, int]) -> IndexEntry | None:
    def cell(name: str) -> str:
        index = columns.get(name, -1)
        return cells[index].strip() if 0 <= index < len(cells) else ""

    try:
        return IndexEntry(
            path=cell("file"),
            wmo=cell("wmo"),
            time=datetime.strptime(cell("date"), "%Y%m%d%H%M%S").replace(tzinfo=timezone.utc),
            latitude=float(cell("latitude")),
            longitude=float(cell("longitude")),
            pressure_max=float(cell("pressure_max") or "nan"),
            levels=int(cell("n_levels") or 0),
            parameters=tuple(p for p in cell("parameter").split("/") if p),
        )
    except (ValueError, IndexError):
        return None


def scan_index(lines: Iterable[str], bbox: BoundingBox) -> list[IndexEntry]:
    """Every cast the index holds inside one region, oldest first."""
    found = [e for e in parse_index(lines) if bbox.contains(e.latitude, e.longitude)]
    found.sort(key=lambda e: e.time)
    return found


def deployments_in(entries: Sequence[IndexEntry]) -> list[Deployment]:
    """Group casts into the missions that took them, named and dated."""
    grouped: dict[str, list[IndexEntry]] = {}
    for entry in entries:
        grouped.setdefault(entry.deployment, []).append(entry)

    out = []
    for name, casts in sorted(grouped.items()):
        casts.sort(key=lambda e: e.time)
        channels: set[str] = set()
        for cast in casts:
            channels.update(cast.parameters)
        pressures = [c.pressure_max for c in casts if np.isfinite(c.pressure_max)]
        out.append(
            Deployment(
                name=name,
                wmo=casts[0].wmo,
                casts=len(casts),
                first=casts[0].time,
                last=casts[-1].time,
                max_pressure=max(pressures) if pressures else float("nan"),
                parameters=tuple(sorted(channels)),
            )
        )
    return out


class GliderSource:
    """A ProfileSource over the EGO glider GDAC.

    `index_lines` exists so the scan can be run against a copy already on disk - the global index
    is 248 MB and no bake should download it twice. Left out, the index is fetched from the FTP
    the PS names.
    """

    name = "EGO glider GDAC (Ifremer)"
    attribution = (
        "EGO glider Global Data Assembly Centre, Ifremer - ftp.ifremer.fr/ifremer/glider/v2, "
        "the archive named in PS 26067"
    )
    endpoint = "ftp.ifremer.fr/ifremer/glider/v2"

    def __init__(self, index_lines: Sequence[str] | None = None) -> None:
        self._index_lines = index_lines
        # What the last scan found, whether or not it returned any Profile. Read by the bake so
        # the manifest can carry the finding rather than an unexplained absence.
        self.last_finding: dict | None = None

    def fetch_profiles(
        self, bbox: BoundingBox, start: datetime, end: datetime
    ) -> Sequence[Profile]:
        """Glider Profiles inside a region and a time window, and always a finding beside them."""
        found = scan_index(self._lines(), bbox)
        in_window = [e for e in found if start <= e.time <= end]
        missions = deployments_in(found)

        self.last_finding = {
            "archive": self.endpoint,
            "castsInRegion": len(found),
            "castsInWindow": len(in_window),
            "gliders": len({e.wmo for e in found}),
            "newestCast": found[-1].time.isoformat() if found else None,
            "deployments": [
                {
                    "name": d.name,
                    "wmo": d.wmo,
                    "casts": d.casts,
                    "from": d.first.isoformat(),
                    "to": d.last.isoformat(),
                    "maxPressureDbar": round(d.max_pressure, 1),
                    "channels": [c for c in d.parameters if c in ("TEMP", "PSAL", "CHLA", "DOXY")],
                }
                for d in missions
            ],
        }
        return [self._read(entry) for entry in in_window]

    def _lines(self) -> Sequence[str]:
        if self._index_lines is not None:
            return self._index_lines
        with urlopen(INDEX_URL, timeout=_TIMEOUT) as response:  # noqa: S310 - ftp:// by design
            return response.read().decode("utf-8", "replace").splitlines()

    @staticmethod
    def _read(entry: IndexEntry) -> Profile:
        """One EGO profile file as a Profile.

        EGO files carry PRES in decibars, which is what Argo does, so the same
        one-decibar-is-one-metre convention this project already uses applies unchanged: the
        error is under 1% over the top 1000 m and is smaller than the horizontal mismatch of
        comparing a drifting instrument against a 1 degree analysis.
        """
        import xarray as xr

        with urlopen(entry.url, timeout=_TIMEOUT) as response:  # noqa: S310 - ftp:// by design
            payload = response.read()

        with xr.open_dataset(io.BytesIO(payload)) as ds:
            depths = np.asarray(ds["PRES"].values, dtype=float).ravel()
            values = {}
            for channel, key in (("TEMP", "temperature"), ("PSAL", "salinity"), ("CHLA", "chlorophyll")):
                if channel in ds:
                    values[key] = np.asarray(ds[channel].values, dtype=float).ravel()

        return Profile(
            platform_id=entry.wmo,
            latitude=entry.latitude,
            longitude=entry.longitude,
            time=entry.time,
            depths=depths,
            values=values,
            kind="glider",
        )
