# Cut features — the add-back list

Kept so scope decisions stay visible and reversible. Ordered by how much each would add to the
submission per hour of work, best first.

## Done since the first cut

| Feature | Outcome |
| --- | --- |
| **A third Source Adapter, actually implemented** | Done. `IncoisArgoSource` reads INCOIS's own `Indian_ARGO_Floats`. Adding it forced the column layout to become data rather than code, so the new provider cost a subclass with four attributes and no new parsing. `/api/sources` reports both. |
| **Depth ruler with real metre labels in the 3-D view** | Done. Real depths down the flank of the box, with visibly uneven spacing and a note saying the axis is stretched. |

## Investigated and rejected

| Idea | Why not |
| --- | --- |
| **Source the demo's observations from INCOIS instead of Ifremer** | Measured: INCOIS's Argo archive ends 2025-04-23, their gridded analysis runs to 2026-07-30. Collocating across a 15-month gap compares two different oceans. The adapter exists and is registered; the demo reads the current GDAC mirror. See ADR 0009. |

## Worth adding back if there is time

| # | Feature | Why it was cut | Rough cost | What it would add |
| --- | --- | --- | --- | --- |
| 1 | **Geostrophic current vectors on the globe** | `incois_valueadded_products_datasets` has GEO_U/GEO_V ready to go, but the series stops at 2019-03, so it cannot share the timeline with the temperature field without an awkward caveat on screen | 2–3 h | Directly answers "current vectors" in the problem statement; visually strong |
| 2 | **Mixed-layer depth / D20 surface as a second isosurface** | Same dataset, same date problem | 1–2 h | Operationally the most-used INCOIS product; strong with an oceanographer judge |
| 4 | **Frontend reads the live API instead of static files, with fallback** | Deliberate: a dead venue network must not kill the demo | 1–2 h | Lets you show live data being pulled during the demo, with the static bundle as the safety net |
| 5 | **Bias map — residual at every float, coloured on the globe** | Time | 2–3 h | One screen showing where the analysis is warm and where it is cold across the whole EEZ. Genuinely novel |
| 7 | **Glider / CTD / mooring adapters** | No reachable public source found for Indian-Ocean gliders in the time available | unknown | Problem statement names gliders explicitly. Currently covered by the `Float` abstraction and the adapter seam, but not demonstrated |

## Cut on purpose — do not add back

These are recorded in `CONTEXT.md` as out of scope, with reasons.

| Feature | Reason |
| --- | --- |
| OGC WMS/WCS server | We consume open standards; re-serving them is a checkbox nobody will click |
| INCOIS internal archive | Needs credentials we do not have; the Source Adapter is where it attaches |
| User accounts, saved sessions | No auth of any kind is needed for a read-only viewer |
| Mobile layout | A forecaster's console is a desktop |
| WebGPU | WebGL2 is universal today; noted as a migration path, not taken |
| ML-derived products | Named as an extension point, not implemented — inventing one would be inventing a requirement |
| Volumetric current streamlines | A project in itself, not a feature |

## Known rough edges

Honest list of what is imperfect in what we *did* build.

- The region boundary on the globe is feathered over 3.5°, so the study area still reads
  slightly rectangular at its southern edge.
- `collocations.json` is 3.1 MB because it carries every matched depth for all 85 floats. Fine
  over a local network, worth trimming before a bandwidth-limited deployment.
- Software-rendered WebGL (a machine with no GPU driver) runs the ray march at a few frames per
  second. On real hardware, including the Intel UHD target, it is fine.
