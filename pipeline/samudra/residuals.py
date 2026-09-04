"""Where the model most disagrees with the instruments, ranked and mapped.

The platform already answers "where did the *field* depart from its own average" - that is
`anomaly.find_anomaly_features`. This answers the other half of the same question, and it is
the one the whole project is actually about: **where does the *model* most disagree with the
*floats*?**

Every number here is already computed. `bake._collocate_cast` writes a mean and an RMS residual
per instrument per Field into `collocations.json`, and nothing has ever sorted them. So a user
who wanted to know where the analysis is weakest had to click 234 instruments one at a time.

Three things happen here, and they are separate because they answer three different questions.

**`rank_residuals`** - which instruments disagree most. Ranked on the RMS residual expressed as
a fraction of the Field's own encoded range, because 0.9 PSU and 0.9 degC are the same number
and nothing like the same finding: 0.9 PSU is a quarter of the salinity the region holds and
0.9 degC is a thirtieth of its temperature. That is the same scaling the Collocation verdict
already uses, so a float the list calls worst is a float the panel calls "Large disagreement".

**`bias_grid`** - whether the disagreement is a region or a scatter. Instruments are binned onto
a coarse lat/lon grid and each cell reports the mean of its instruments' biases, one vote each.
A cell with fewer than `min_count` instruments behind it is **not emitted at all** rather than
drawn from one float, which is the same refusal `find_anomaly_features` makes with `minCells`.

**`field_bias`** - the one-line summary. What the model does on average across the whole basin,
and **split by kind of instrument**, which is the difference between a measurement and a
tautology. INCOIS's analysis assimilates Argo, so a float's residual is largely the model
agreeing with an observation it was fed. The nine moored buoys are not assimilated. Measured
over this bake the moorings disagree 4.3x more on temperature (0.748 degC against 0.174), 3.8x
on salinity and 5.2x on density, and pooled into one basin-wide figure they vanish into 224
floats. The number a forecaster wants - how far the analysis sits from water nobody told it
about - is the mooring one, and it is now reported beside the pooled one rather than instead of
it, because 9 instruments is a small sample and saying so is part of the answer.

Nothing here is a model, a prediction or a confidence. It is arithmetic over measurements that
already exist, and the words on screen have to stay that side of the line: `02-next-features.md`
is right that "Confidence: 91%" is a fabricated number and that an INCOIS judge will ask what it
was trained on.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

from .sources.base import BoundingBox


@dataclass(frozen=True)
class ResidualEntry:
    """One instrument against the model, for one Field, at the cast that was compared."""

    platform_id: str
    kind: str
    field: str
    longitude: float
    latitude: float
    timestep_index: int
    time: str
    #: Observed minus modelled, averaged over the depths that matched. Signed: the sign is the
    #: finding, and it is what says which way round the model read.
    mean_residual: float
    rms_residual: float
    #: How many depths stood behind the two numbers above.
    matched: int
    #: The same two numbers as a fraction of the Field's own encoded range, which is the only
    #: form in which a temperature and a salinity can be put in one list.
    scaled_bias: float
    scaled_rms: float


@dataclass(frozen=True)
class BiasCell:
    """One box of the bias map, and everything it averaged."""

    south: float
    west: float
    cell_degrees: float
    count: int
    mean_bias: float
    #: The mean of the *magnitudes*. A cell reading zero because nothing disagreed and one
    #: reading zero because two large disagreements cancelled are different findings.
    mean_abs_bias: float
    rms: float

    @property
    def north(self) -> float:
        return self.south + self.cell_degrees

    @property
    def east(self) -> float:
        return self.west + self.cell_degrees


@dataclass(frozen=True)
class FieldBias:
    """What the model does against the instruments across the whole region, for one Field."""

    field: str
    #: Which kind of instrument this covers, or None for all of them pooled.
    kind: str | None
    count: int
    mean_bias: float
    mean_abs_bias: float
    rms: float
    #: The 90th percentile of the magnitude, as a fraction of the Field's own range.
    #:
    #: This is what the map's colour scale saturates at, and it exists because the obvious
    #: choice did not work. Saturating at the "large disagreement" threshold - 1.5 degC on
    #: temperature - put the median instrument, off by 0.02 degC, at 2% of the way to the end of
    #: the palette: measured, 90% of the markers landed within a quarter-step of the pale
    #: midpoint and the whole map read as white. A scale nobody can read is a scale that is
    #: honest about nothing.
    p90_scaled_abs: float


def positions_from(floats: list[dict], collocations: dict[str, dict]) -> dict[str, tuple[float, float]]:
    """Where each collocated instrument was **for the cast that was actually compared**.

    Not its newest Fix. `collocation.choose_cast` deliberately picks the newest cast that
    compares against something, which is not always the last dive, and an Argo float moves a
    long way between dives - so putting the comparison at the newest Fix would draw a residual
    measured in one place at a position hundreds of kilometres away.

    The Fix is matched by its timestamp, which is exactly how the two files are already tied
    together. Where no Fix carries that stamp the anchor position is used **for a mooring and
    only for a mooring**: a moored buoy's entry is stamped with the report nearest the analysis
    rather than with a Fix, and it never moved, so its anchor is the same place. A drifting
    float is refused instead. It moves 40 km in a typical cycle, so substituting its newest Fix
    would put a residual measured in one place at a position hundreds of kilometres away, in a
    feature whose whole point is "the model was wrong *here*".

    Measured over the shipped bake the fallback fires 0 times in 234, so this is latent - which
    is the reason to write the rule down rather than the reason not to.
    """
    by_id = {item["id"]: item for item in floats}
    out: dict[str, tuple[float, float]] = {}
    for platform_id, entry in collocations.items():
        item = by_id.get(platform_id)
        if item is None:
            continue
        fix = None
        for candidate in item.get("track", []):
            if candidate.get("time") == entry.get("time"):
                fix = candidate
                break
        if fix is None and str(entry.get("kind") or item.get("kind") or "float") == "mooring":
            fix = item.get("latest")
        if fix is None:
            continue
        out[platform_id] = (float(fix["lon"]), float(fix["lat"]))
    return out


def rank_residuals(
    collocations: dict[str, dict],
    positions: dict[str, tuple[float, float]],
    ranges: dict[str, tuple[float, float]],
    limit: int | None = None,
    min_matched: dict[str, int] | None = None,
) -> list[ResidualEntry]:
    """Every instrument-and-Field pair the bake compared, worst disagreement first.

    Skipped rather than guessed at: a Field with no encoded range (chlorophyll, which has no
    model side at all), an entry where nothing matched, a null statistic, and an instrument with
    no position. Each of those is "we cannot say", and a zero would read as "the model was
    perfect".

    `min_matched` is how many depths a comparison must rest on, **per kind of instrument**, and
    it has to be per kind because the same number means opposite things. An Argo cast reports at
    a median 221 of this model's depths; one that matched 10 is a truncated dive, and it was
    ranking fifth worst in the Indian Ocean on three. A moored buoy carries a handful of sensors
    on a wire - 3 to 9 here - and that is the whole instrument working normally. One flat
    threshold either keeps the truncated casts or deletes every buoy, and the buoys are the only
    instruments in this bake the analysis did not assimilate.

    This is the discipline `bias_grid` already applies one level up, where a cell with fewer
    than three instruments is not drawn at all.
    """
    out: list[ResidualEntry] = []
    for platform_id, entry in collocations.items():
        position = positions.get(platform_id)
        if position is None:
            continue
        longitude, latitude = position
        for field, series in (entry.get("fields") or {}).items():
            bounds = ranges.get(field)
            if bounds is None:
                continue
            span = abs(bounds[1] - bounds[0])
            if span <= 0:
                continue
            mean = series.get("meanResidual")
            rms = series.get("rmsResidual")
            matched = int(series.get("matched") or 0)
            if mean is None or rms is None or matched <= 0:
                continue
            kind = str(entry.get("kind") or "float")
            if matched < (min_matched or {}).get(kind, 1):
                continue
            out.append(
                ResidualEntry(
                    platform_id=platform_id,
                    kind=kind,
                    field=field,
                    longitude=longitude,
                    latitude=latitude,
                    timestep_index=int(entry.get("timestepIndex") or 0),
                    time=str(entry.get("time") or ""),
                    mean_residual=float(mean),
                    rms_residual=float(rms),
                    matched=matched,
                    scaled_bias=float(mean) / span,
                    scaled_rms=float(rms) / span,
                )
            )

    # Worst first, and the platform id breaks a tie so a bake is reproducible byte for byte.
    out.sort(key=lambda e: (-e.scaled_rms, e.platform_id, e.field))
    return out[:limit] if limit is not None else out


def bias_grid(
    entries: list[ResidualEntry],
    field: str,
    box: BoundingBox,
    cell_degrees: float = 5.0,
    min_count: int = 3,
) -> list[BiasCell]:
    """The bias map: one cell per box of ocean, worst first.

    One vote per instrument. Weighting by how many depths a cast reported would let a single
    float that sampled every 2 dbar to 2000 m outvote forty shallow ones, which is a statement
    about Argo's sampling rather than about the model.

    A cell with fewer than `min_count` instruments is not emitted. A one-float cell is a
    measurement of one float, and drawing it in the same colours as a twelve-float cell would
    say the two are equally well known.
    """
    buckets: dict[tuple[float, float], list[float]] = {}
    for e in entries:
        if e.field != field:
            continue
        if not box.contains(e.latitude, e.longitude):
            continue
        # The north and east edges belong to the last cell rather than to a cell of their own -
        # 25 N is the region's own edge, and a naive floor() puts it in a row 5 degrees tall
        # holding a single line of ocean.
        south = min(
            box.south + math.floor((e.latitude - box.south) / cell_degrees) * cell_degrees,
            box.north - cell_degrees,
        )
        west = min(
            box.west + math.floor((e.longitude - box.west) / cell_degrees) * cell_degrees,
            box.east - cell_degrees,
        )
        buckets.setdefault((south, west), []).append(e.mean_residual)

    cells: list[BiasCell] = []
    for (south, west), biases in buckets.items():
        if len(biases) < min_count:
            continue
        cells.append(
            BiasCell(
                south=south,
                west=west,
                cell_degrees=cell_degrees,
                count=len(biases),
                mean_bias=sum(biases) / len(biases),
                mean_abs_bias=sum(abs(b) for b in biases) / len(biases),
                rms=math.sqrt(sum(b * b for b in biases) / len(biases)),
            )
        )

    cells.sort(key=lambda c: (-c.mean_abs_bias, c.south, c.west))
    return cells


def field_bias(
    entries: list[ResidualEntry], field: str, kind: str | None = None
) -> FieldBias | None:
    """What the model does against the instruments across the whole region.

    `kind` narrows it to one kind of instrument, which is the only way to ask the question that
    matters. INCOIS assimilate Argo, so a summary over floats is largely a measurement of the
    analysis agreeing with itself; the moorings are independent of it. See the module docstring.

    None when nothing was compared, because a summary of nothing is a sentence with no
    measurement in it.
    """
    rows = [e for e in entries if e.field == field and (kind is None or e.kind == kind)]
    if not rows:
        return None
    biases = [e.mean_residual for e in rows]
    scaled = sorted(abs(e.scaled_bias) for e in rows)
    # Nearest-rank, so the answer is always a value some instrument actually has rather than an
    # interpolation between two of them.
    rank = max(int(math.ceil(0.9 * len(scaled))) - 1, 0)
    return FieldBias(
        field=field,
        kind=kind,
        count=len(biases),
        mean_bias=sum(biases) / len(biases),
        mean_abs_bias=sum(abs(b) for b in biases) / len(biases),
        rms=math.sqrt(sum(b * b for b in biases) / len(biases)),
        p90_scaled_abs=scaled[rank],
    )
