# Every figure the deck may use, read off the build

**Generated 2026-09-04 by `pipeline/scripts/collect_facts.py`. Do not edit by
hand.** Re-run it after a bake and diff this file: a figure that moved shows up as a line.

`ppt/DECK.md` is written by a person and quotes these numbers. This file is the source it quotes
*from*, so "do not adjust a number by arithmetic" has somewhere to point.
Every row names where the figure comes from, so a judge's question can be answered by opening a
file rather than by remembering.

**One figure on the deck is not here, on purpose.** The share of the frame a rendered layer
covers is measured by a probe against a randomly seeded particle population, so it is a range and
not a point - see `CLAUDE.md`.

## The build

| | | Where it comes from |
| --- | --- | --- |
| Fields, selectable | **15** in 5 groups | `manifest.fields` |
| Source Adapters | **9** - 8 providers plus one for a file a visitor drops | `manifest.sources`, plus `sources/netcdf.py` |
| Analyses baked | **12** Timesteps, 10 Apr 2026 to 30 Jul 2026 | `manifest.timesteps` |
| Region | 45-100 E, 10 S-25 N | `manifest.region` |
| Volume lattice | **56 x 36 x 48**, 4 bytes a voxel | `manifest.volume` |
| Depth range | 5 m to 2000 m over 24 uneven levels | `manifest.volume.levelMetres` |
| Static bake | **71.1 MB**, committed, **0** network calls to run | `du web/public/data` |
| HTTP routes on the API | **20** | `api/*.py` |
| Tests | **377** | `web/public/data/tests.json` |
| Browser probes | **13** | the allowlist in `.gitignore` |

## Instruments

| | | Where it comes from |
| --- | --- | --- |
| Instruments in the water | **237** = 228 Argo floats + 9 moored buoys | `manifest.instruments` |
| Carrying chlorophyll | **52** floats | `manifest.instruments.withChlorophyll` |
| Drawn at any one Timestep | between 192 and 220 floats and 5 to 9 buoys | `reportingByKind()`, measured across the twelve steps |

## How far the model sits from the instruments

| | | Where it comes from |
| --- | --- | --- |
| Compared | **230** instruments | `residuals.fields.temperature.summary` |
| Typical gap, all instruments | **0.19 degC** | `summary.meanAbsBias` |
| Typical gap, Argo floats | **0.17 degC** across 221 | `byKind.float` |
| Typical gap, moored buoys | **0.75 degC** across 9 | `byKind.mooring` |
| Worst instrument | **5300005** (mooring), model warmer by 1.66 degC over 9 depths | `residuals` ranked on `scaledRms` |

## Drift, and its score

| | | Where it comes from |
| --- | --- | --- |
| Scored on | **195** Argo floats at **1000 m** | `manifest.drift` |
| Over one Argo cycle | median **38.5 km** out, p90 87.3 km, across **1,908** cycles | `manifest.drift.cycle` |
| Over 10 days | median **43.6 km** out on 192 floats, against 46.1 km travelled | `manifest.drift.horizons` |
| Over 30 days | median **99.1 km** out on 186 floats, against 102.8 km travelled | `manifest.drift.horizons` |
| Over 60 days | median **143.1 km** out on 181 floats, against 149.8 km travelled | `manifest.drift.horizons` |
| Over 90 days | median **207.9 km** out on 174 floats, against 204.3 km travelled | `manifest.drift.horizons` |

## Evidence and change

| | | Where it comes from |
| --- | --- | --- |
| Block with no cast behind it | **9.9%** | `manifest.coverage.emptyFraction` |
| Coverage radius | casts within **334 km** and 5 days either side of the analysis | `manifest.coverage` |
| Anomaly features found | **121** bodies of water across 12 analyses | `anomalies.json` |
| A feature is marked only past | **0.5 degC** and 2.0 standard deviations | `manifest.anomalyFeatures` |
| Against the 1991-2020 normal | across **349,692** cells: mean -0.01 degC, 95th percentile of the magnitude 2.10 degC | `manifest.normalAnomaly` |

## The glider finding

| | | Where it comes from |
| --- | --- | --- |
| Archive read | `ftp.ifremer.fr/ifremer/glider/v2` | the archive PS 26067 names |
| Casts in this box | **2,876** from 1 glider, 2 deployments | `manifest.gliders` |
| Newest cast | **14 Oct 2022**, and nothing since | `manifest.gliders.newestCast` |
| Casts inside this build's window | **0** | which is why none are drawn |

