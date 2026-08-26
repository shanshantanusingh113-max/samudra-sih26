# Cut features - the add-back list

What was scoped and not built, so the decisions stay visible and reversible. Ordered by how much
each would add to the submission per hour of work, best first.

Anything that has since been built is removed from this list rather than left here marked done -
`CLAUDE.md` describes what exists, the ADRs record why, and `docs/BUGS.md` tracks what is wrong
with it. This file is only for what is still missing.

Last reconciled against the tree: 2026-08-25.

## Worth adding back if there is time

| # | Feature | Why it is not built | Rough cost | What it would add |
| --- | --- | --- | --- | --- |
| 1 | **TCHP - heat integrated to the 26 degC isotherm** | It is a column integral rather than a Volume, so it needs a rendering decision the other derived Fields did not. Half of it already exists: `samudra/thermocline.py` finds an isotherm's depth | 2-3 h | Exact, uses only the temperature Grid already on disk, and it is the quantity that governs cyclone rapid intensification. The best candidate for a sixth Variable |
| 2 | **Rank the Collocation Residuals as findable anomalies** | The Anomaly Feature panel does this for departures *in the field*; the same treatment for model-versus-float disagreement is not wired up, though every number it needs is already in `collocations.json` | 2-3 h | It is the project's own thesis made clickable: "the model is most wrong here, and here". See `02-next-features.md` |
| 3 | **Bias map - Residual at every Float, coloured on the globe** | Time | 2-3 h | One screen showing where the analysis runs warm and where it runs cold across the whole EEZ |
| 4 | **D20 or mixed-layer depth drawn as a surface** | `isotherm_depth()` computes it already and the bake uses it to explain Anomaly Features, but nothing draws it. INCOIS's own published version stops at 2019-03 and cannot share the timeline, so it would have to be ours | 1-2 h | Operationally the most-used INCOIS product, and strong with an oceanographer judge |
| 5 | **Frontend reads the live API instead of the static files, with fallback** | Deliberate: a dead venue network must not be able to kill the demo | 1-2 h | Lets you show live data being pulled during the demo, with the static bundle as the safety net |
| 6 | **Glider / CTD / mooring adapters** | No reachable public source found for Indian-Ocean gliders in the time available | unknown | The problem statement names gliders explicitly. Covered in principle by the `Float` abstraction and the adapter seam, but not demonstrated |

## Investigated and rejected

Not "no time" - measured, and found wanting.

| Idea | Why not |
| --- | --- |
| **Geostrophic current speed by thermal wind** | Prototyped against the density field, integrated from a reference level of no motion at 1000 dbar, and measured before being believed. On 2026-07-30, at the height of the southwest monsoon, it gives a maximum of **0.16 m/s** for the Somali Current against a real 1.5-2.5 m/s, and puts the fastest water in the block (1.90 m/s) on the equator, where geostrophy does not hold. Finite, plausible and inverted. ADR 0010 |
| **Geostrophic current vectors from INCOIS GEO_U/GEO_V** | Real and properly validated, but the series stops at 2019-03 against an analysis running to 2026-07-30. It cannot share this timeline. It remains the right source if currents are ever added, on their own clearly dated view |
| **Chlorophyll and dissolved oxygen as Fields** | Chlorophyll is satellite ocean colour - a 2-D surface layer, cloud-gapped, never a Volume. The only complete gridded oxygen field for this region is a decadal climatology with no date, which cannot animate on a ten-day timeline. Deriving oxygen from T/S regressions would be inventing data. ADR 0010 |
| **Source the demo's observations from INCOIS instead of Ifremer** | INCOIS's Argo archive ends 2025-04-23; their gridded analysis runs to 2026-07-30. Collocating across a 15-month gap compares two different oceans. The adapter exists and is registered; the demo reads the current GDAC mirror. ADR 0009 |

## Cut on purpose - do not add back

Recorded in `CONTEXT.md` as out of scope, with reasons.

| Feature | Reason |
| --- | --- |
| OGC WMS/WCS server | We consume open standards; re-serving them is a checkbox nobody will click |
| INCOIS internal archive | Needs credentials we do not have; the Source Adapter is where it would attach |
| User accounts, saved sessions | No auth of any kind is needed for a read-only viewer |
| Mobile layout | A forecaster's console is a desktop |
| WebGPU | WebGL2 is universal today; noted as a migration path, not taken |
| ML-derived products | Named as an extension point, not implemented - inventing one would be inventing a requirement |
| Volumetric current streamlines | A project in itself, not a feature |

## Known rough edges

What is imperfect in what we *did* build. Defects live in `docs/BUGS.md`; these are accepted
trade-offs rather than mistakes.

- **`collocations.json` is 4.8 MB**, up from 3.1 MB when density joined temperature and salinity
  as a third collocated Field. It carries every matched depth for all 88 floats. Fine over a
  local network, worth trimming before a bandwidth-limited deployment. `anomalies.json`, by
  contrast, is 40 KB.
- The region boundary on the globe is feathered over 3.5 degrees, so the study area still reads
  slightly rectangular at its southern edge.
- Software-rendered WebGL - a machine with no GPU driver - runs the ray march at a few frames per
  second. On real hardware, including the Intel UHD target, it is fine.
- 51 of the 111 Anomaly Features span a single Level, so they are sheets rather than bodies. That
  is a consequence of the Grid's uneven Levels, not of the detector.
