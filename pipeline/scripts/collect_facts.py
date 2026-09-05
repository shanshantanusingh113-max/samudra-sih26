"""Write `ppt/FACTS.md`: every number that may appear on a slide, read off the build.

`ppt/DECK.md` opens with the same warning it has opened with for three rounds - *do not adjust a
number by arithmetic, read it off a bake* - and then carries forty figures typed in by hand.
Every one of them moves when the region, the window or the source list changes, and the deck has
been wrong twice: once with 246 tests against a suite of 377, once with a sign the wrong way
round on the float in its own hero screenshot.

A number typed into a slide cannot be checked by anything. A number in this file can, because
this file is generated: run it, diff it, and any figure that moved shows up as a line. It is the
same pattern `collect_tests.py` uses for `provenance.html`, one document along.

    cd pipeline && ../.venv/Scripts/python scripts/collect_facts.py

**This does not edit the deck.** It tells you what the deck should say. Changing a slide is still
a person's job, because a figure moving sometimes means a sentence has to be rewritten rather
than a digit swapped.
"""

from __future__ import annotations

import json
from datetime import date
from pathlib import Path

PIPELINE = Path(__file__).resolve().parent.parent
ROOT = PIPELINE.parent
DATA = ROOT / "web" / "public" / "data"
OUT = ROOT / "ppt" / "FACTS.md"


def load(name: str):
    return json.loads((DATA / name).read_text(encoding="utf-8"))


def megabytes(folder: Path) -> float:
    total = sum(f.stat().st_size for f in folder.rglob("*") if f.is_file())
    return round(total / 1e6, 1)


def day(stamp: str) -> str:
    """`2026-07-30T00:00:00+00:00` -> `30 Jul 2026`."""
    return date.fromisoformat(stamp[:10]).strftime("%d %b %Y").lstrip("0")


#: Every verb the API actually decorates a handler with. `delete` was missing for a round, so
#: this said 20 against a real 21 and the README and the deck both repeated it. FastAPI's own
#: router is the check: `len([r for r in app.routes if hasattr(r, "methods")])`.
VERBS = ("get", "post", "put", "patch", "delete")


def routes() -> int:
    """Every HTTP route the API declares, counted rather than remembered."""
    found = 0
    for name in ("main.py", "standards.py", "upload.py"):
        text = (ROOT / "api" / name).read_text(encoding="utf-8")
        found += sum(text.count(f"@app.{verb}(") for verb in VERBS)
    return found


def tests() -> int:
    return load("tests.json")["total"]


def probes() -> int:
    """The committed probes, read off `.gitignore`'s own allowlist.

    Counting `web/probe-*.mjs` on disk gives 20, because most of that wildcard is throwaway
    measurement scripts that answered one question once and were never deleted. The allowlist is
    the list of files that actually survive a clone, and it is maintained anyway.
    `probe-pixels.mjs` is on it and is not a probe - it is the PNG decoder the probes measure
    with - so it comes off the count.
    """
    ignore = (ROOT / ".gitignore").read_text(encoding="utf-8").splitlines()
    kept = [line[1:] for line in ignore if line.startswith("!web/probe-")]
    return len([name for name in kept if not name.endswith("probe-pixels.mjs")])


def worst_instrument(residuals: dict, field: str = "temperature") -> dict:
    rows = residuals["fields"][field]["instruments"]
    return max(rows, key=lambda r: abs(r["scaledRms"]))


def main() -> None:
    manifest = load("manifest.json")
    residuals = load("residuals.json")
    anomalies = load("anomalies.json")

    temperature = residuals["fields"]["temperature"]
    floats = temperature["byKind"]["float"]
    moorings = temperature["byKind"]["mooring"]
    worst = worst_instrument(residuals)
    drift = manifest["drift"]
    cycle = drift["cycle"]
    gliders = manifest["gliders"]
    instruments = manifest["instruments"]
    volume = manifest["volume"]
    steps = manifest["timesteps"]
    normal = manifest["normalAnomaly"]

    rows = [
        ("The build", [
            ("Fields, selectable", f"**{len(manifest['fields'])}** in {len(manifest['fieldGroups'])} groups", "`manifest.fields`"),
            ("Source Adapters", f"**{len(manifest['sources']) + 1}** - {len(manifest['sources'])} providers plus one for a file a visitor drops", "`manifest.sources`, plus `sources/netcdf.py`"),
            ("Analyses baked", f"**{len(steps)}** Timesteps, {day(steps[0])} to {day(steps[-1])}", "`manifest.timesteps`"),
            ("Region", f"{manifest['region']['west']:.0f}-{manifest['region']['east']:.0f} E, {abs(manifest['region']['south']):.0f} S-{manifest['region']['north']:.0f} N", "`manifest.region`"),
            ("Volume lattice", f"**{volume['width']} x {volume['height']} x {volume['depth']}**, 4 bytes a voxel", "`manifest.volume`"),
            ("Depth range", f"{volume['surfaceMetres']:.0f} m to {volume['floorMetres']:.0f} m over {len(volume['levelMetres'])} uneven levels", "`manifest.volume.levelMetres`"),
            ("Static bake", f"**{megabytes(DATA)} MB**, committed, **0** network calls to run", "`du web/public/data`"),
            ("HTTP routes on the API", f"**{routes()}**", "`api/*.py`"),
            ("Tests", f"**{tests()}**", "`web/public/data/tests.json`"),
            ("Browser probes", f"**{probes()}**", "the allowlist in `.gitignore`"),
        ]),
        ("Instruments", [
            ("Instruments in the water", f"**{manifest['floatCount']}** = {instruments['floats']} Argo floats + {instruments['moorings']} moored buoys", "`manifest.instruments`"),
            ("Carrying chlorophyll", f"**{instruments['withChlorophyll']}** floats", "`manifest.instruments.withChlorophyll`"),
            ("Drawn at any one Timestep", "between 192 and 220 floats and 5 to 9 buoys", "`reportingByKind()`, measured across the twelve steps"),
        ]),
        ("How far the model sits from the instruments", [
            ("Compared", f"**{temperature['summary']['count']}** instruments", "`residuals.fields.temperature.summary`"),
            ("Typical gap, all instruments", f"**{temperature['summary']['meanAbsBias']:.2f} degC**", "`summary.meanAbsBias`"),
            ("Typical gap, Argo floats", f"**{floats['meanAbsBias']:.2f} degC** across {floats['count']}", "`byKind.float`"),
            ("Typical gap, moored buoys", f"**{moorings['meanAbsBias']:.2f} degC** across {moorings['count']}", "`byKind.mooring`"),
            ("Worst instrument", f"**{worst['id']}** ({worst['kind']}), model {'warmer' if worst['bias'] < 0 else 'cooler'} by {abs(worst['bias']):.2f} degC over {worst['matched']} depths", "`residuals` ranked on `scaledRms`"),
        ]),
        ("Drift, and its score", [
            ("Scored on", f"**{drift['floats']}** Argo floats at **{drift['parkingDepthMetres']:.0f} m**", "`manifest.drift`"),
            ("Over one Argo cycle", f"median **{cycle['medianKm']} km** out, p90 {cycle['p90Km']} km, across **{cycle['count']:,}** cycles", "`manifest.drift.cycle`"),
        ] + [
            (f"Over {h['days']:.0f} days", f"median **{h['medianSeparationKm']} km** out on {h['floats']} floats, against {h['medianTravelledKm']} km travelled", "`manifest.drift.horizons`")
            for h in drift["horizons"]
        ]),
        ("Evidence and change", [
            ("Block with no cast behind it", f"**{manifest['coverage']['emptyFraction'] * 100:.1f}%**", "`manifest.coverage.emptyFraction`"),
            ("Coverage radius", f"casts within **{manifest['coverage']['radiusKm']} km** and {manifest['coverage']['windowDays']:.0f} days either side of the analysis", "`manifest.coverage`"),
            ("Anomaly features found", f"**{sum(len(step) for step in anomalies)}** bodies of water across {len(anomalies)} analyses", "`anomalies.json`"),
            ("A feature is marked only past", f"**{manifest['anomalyFeatures']['valueThreshold']} degC** and {manifest['anomalyFeatures']['zThreshold']} standard deviations", "`manifest.anomalyFeatures`"),
            ("Against the 1991-2020 normal", f"across **{normal['cells']:,}** cells: mean {normal['meanDegC']:+.2f} degC, 95th percentile of the magnitude {normal['p95AbsDegC']:.2f} degC", "`manifest.normalAnomaly`"),
        ]),
        ("The glider finding", [
            ("Archive read", f"`{gliders['archive']}`", "the archive PS 26067 names"),
            ("Casts in this box", f"**{gliders['castsInRegion']:,}** from {gliders['gliders']} glider, {len(gliders['deployments'])} deployments", "`manifest.gliders`"),
            ("Newest cast", f"**{day(gliders['newestCast'])}**, and nothing since", "`manifest.gliders.newestCast`"),
            ("Casts inside this build's window", f"**{gliders['castsInWindow']}**", "which is why none are drawn"),
        ]),
    ]

    head = f"""# Every figure the deck may use, read off the build

**Generated {date.today().isoformat()} by `pipeline/scripts/collect_facts.py`. Do not edit by
hand.** Re-run it after a bake and diff this file: a figure that moved shows up as a line.

`ppt/DECK.md` is written by a person and quotes these numbers. This file is the source it quotes
*from*, so "do not adjust a number by arithmetic" has somewhere to point.
Every row names where the figure comes from, so a judge's question can be answered by opening a
file rather than by remembering.

**One figure on the deck is not here, on purpose.** The share of the frame a rendered layer
covers is measured by a probe against a randomly seeded particle population, so it is a range and
not a point - see `CLAUDE.md`.

"""

    body = []
    for title, entries in rows:
        body.append(f"## {title}\n")
        body.append("| | | Where it comes from |")
        body.append("| --- | --- | --- |")
        for label, value, where in entries:
            body.append(f"| {label} | {value} | {where} |")
        body.append("")

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(head + "\n".join(body) + "\n", encoding="utf-8")
    counted = sum(len(entries) for _, entries in rows)
    print(f"{counted} figures across {len(rows)} sections -> {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
