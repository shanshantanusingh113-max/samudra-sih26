"""The Source Adapter seam.

The problem statement asks that new observational streams and new model variables be added
"without significant re-engineering". That promise is only worth anything if there is a single,
narrow place where a provider's format stops and the rest of the system begins. This is it.

Everything upstream of this module knows about ERDDAP, CSV quirks, unit conventions and QC
flags. Everything downstream knows only about Grids and Profiles. Adding a mooring, an ADCP or
an HF-radar feed means writing one class here and registering it - no renderer, no API and no
UI code changes, because none of them have ever heard of ERDDAP.
"""

from __future__ import annotations

from dataclasses import dataclass, field as dataclass_field
from datetime import datetime
from typing import Protocol, Sequence, runtime_checkable

import numpy as np

from ..grid import Grid


@dataclass(frozen=True)
class BoundingBox:
    """A geographic window. Latitudes in degrees north, longitudes in degrees east."""

    south: float
    north: float
    west: float
    east: float

    def contains(self, latitude: float, longitude: float) -> bool:
        return self.south <= latitude <= self.north and self.west <= longitude <= self.east


@dataclass(frozen=True)
class FieldSpec:
    """A Field a source can serve, and how it should be presented."""

    key: str            # stable identifier used in URLs and filenames
    label: str          # what a human reads in the variable selector
    units: str
    palette: str        # cmocean palette name
    display_min: float  # sensible default Transfer Function range for the Indian Ocean
    display_max: float


@dataclass(frozen=True)
class Profile:
    """One vertical cast by one Float."""

    platform_id: str
    latitude: float
    longitude: float
    time: datetime
    depths: np.ndarray
    values: dict[str, np.ndarray] = dataclass_field(default_factory=dict)

    def __len__(self) -> int:
        return len(self.depths)


@runtime_checkable
class GridSource(Protocol):
    """A provider of gridded model Fields."""

    name: str
    attribution: str

    def fields(self) -> Sequence[FieldSpec]: ...

    def timesteps(self) -> Sequence[datetime]: ...

    def fetch_grid(self, field_key: str, timestep: datetime, bbox: BoundingBox) -> Grid: ...


@runtime_checkable
class ProfileSource(Protocol):
    """A provider of in-situ Profiles."""

    name: str
    attribution: str

    def fetch_profiles(
        self, bbox: BoundingBox, start: datetime, end: datetime
    ) -> Sequence[Profile]: ...
