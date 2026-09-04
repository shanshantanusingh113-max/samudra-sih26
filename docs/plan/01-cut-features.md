# Cut features - the add-back list

What was scoped and not built, so the decisions stay visible and reversible. Ordered by how much
each would add to the submission per hour of work, best first.

Anything that has since been built is removed from this list rather than left here marked done -
`CLAUDE.md` describes what exists, the ADRs record why, and `docs/BUGS.md` tracks what is wrong
with it. This file is only for what is still missing.

Last reconciled against the tree: 2026-09-02.

## Worth adding back if there is time

| # | Feature | Why it is not built | Rough cost | What it would add |
| --- | --- | --- | --- | --- |
| 1 | **Thermal fronts - the horizontal gradient of temperature at the chosen Level** | Time. **Every Volume already carries a gradient channel** - it is what Feature emphasis weights - so the quantity is computed and shipped and simply has no button | 3-5 h | The last cheap answer to a named operational mandate: fronts are one of the two inputs INCOIS's own Potential Fishing Zone advisory is built from. It must never be captioned as a PFZ advisory - see idea A6 in `05-coverage-audit-and-ideas.md` |
| 2 | **Depth against time at one point** | Time | 6-9 h | The second standard figure of physical oceanography, after the vertical section which is now built. `/api/section` proves the pattern and the native Grids are already in the browser |
| 3 | **Close the loop from an Anomaly Feature to the cast that checked it** | Time. Both ends exist and the wire between them does not | 3-4 h | The shortest path from "the model departed" to "and here is whether anyone was there to see it". Ten of the 121 features have no cast at all and should say so |
| 4 | **Frontend reads the live API instead of the static files, with fallback** | Deliberate: a dead venue network must not be able to kill the demo | 1-2 h | Lets you show live data being pulled during the demo, with the static bundle as the safety net |

**Moorings, chlorophyll, OPeNDAP, CF NetCDF, WMS and the guided tour have since been built**,
and so has everything that used to be items 1 to 4 of the list above: cyclone heat potential and
the four other hazard Fields (ADR 0014), the residual ranking and the bias map, the depth Fields
drawn as Sheets, and - in the round after that - the drift check (ADR 0015), the NetCDF drop
target, the vertical section and a real 1991-2020 climatological baseline (ADR 0016).
`docs/plan/03-requirement-gaps.md` carries the research behind the earlier ones, and ADRs 0011
and 0012 the two decisions that reversed earlier positions.

**And in the September 2026 round, three more of the rejections below were reopened and settled
on new measurements** - see `docs/plan/04-ps-update-2026-09.md` and ADRs 0013 and 0014. Nothing
was reversed by changing our minds; each was reversed by a fact that was not true before.

## Investigated and rejected

Not "no time" - measured, and found wanting.

| Idea | Why not |
| --- | --- |
| **Geostrophic current speed by thermal wind** | Prototyped against the density field, integrated from a reference level of no motion at 1000 dbar, and measured before being believed. On 2026-07-30, at the height of the southwest monsoon, it gives a maximum of **0.16 m/s** for the Somali Current against a real 1.5-2.5 m/s, and puts the fastest water in the block (1.90 m/s) on the equator, where geostrophy does not hold. Finite, plausible and inverted. ADR 0010 |
| **Geostrophic current vectors from INCOIS GEO_U/GEO_V** | Real and properly validated, but the series stops at 2019-03 against an analysis running to 2026-07-30. It cannot share this timeline. **Still true, and now moot**: currents arrived from Copernicus Marine instead, as real numbers, held to the same test that killed the thermal-wind version and passing it - 2.94 m/s at 9.5 N, 51.5 E on 2026-07-30. ADR 0013 |
| **Chlorophyll and dissolved oxygen as gridded Fields** | Still right, and chlorophyll arrived by another route: not as a Field but as an *observation* from 49 BGC-Argo floats, drawn on its own because no gridded chlorophyll shares this timeline. INCOIS's own ocean-colour products end 2006-03-21 and 2020-05-01. Oxygen remains out - measured, **zero** BGC casts in this window carry usable oxygen under the project's own QC rules |
| **Gliders** | Reachable, and empty. **Reopened in September 2026 and measured properly** against the FTP archive PS 26067 names rather than through ERDDAP: the two archives disagree, and the FTP index holds **one** glider in this box, not seven, in two deployments and 2,876 casts, newest **2022-10-14**. The adapter is now built and reads it; the casts are still not drawn, because putting a 2022 instrument beside a 2026 analysis is what ADR 0009 refuses for INCOIS's own Argo archive. The finding ships instead |
| **Ship CTD sections** | GO-SHIP has 6 cruises here since 2000, newest **Apr 2025**. It has an honest home, since the analysis runs back to 2004 - just a lower return than the moorings for the same work. Cheaper now than it was: a visitor can drop a CTD NetCDF straight onto the platform and see it rendered, which covers the demonstration without an adapter |
| **HF-radar and ADCP** | India runs five HF-radar pairs and its OMNI buoys measure currents. `services.incois.gov.in` has no route from here at all, and **zero rows** in the public GTS feed carry current components for this region. A data-policy fact, not an architecture gap |
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
| Volumetric current streamlines | **Still cut, and the reason is now written down.** Advection through the block needs a vertical velocity `w`; Copernicus publish `uo` and `vo` and no `w`, and INCOIS publish neither, so a 3-D particle claims a motion nobody measured. A sheet of dots on the chosen Level claims nothing beyond the two components that exist, and **that half is built** - ADR 0017 |

## Known rough edges

What is imperfect in what we *did* build. Defects live in `docs/BUGS.md`; these are accepted
trade-offs rather than mistakes.

- **`collocations.json` is 10.5 MB.** It was 3.1 MB, went to 4.8 when density joined temperature
  and salinity as a third collocated Field, and reached 8.6 when honouring Argo's quality flags
  meant also fetching the raw columns and the float count went from 93 to 221. The September 2026
  region widening to 45 E took it the rest of the way. It carries every matched depth for all 234
  collocated instruments. It gzips to roughly a fifth of that over the wire, so this is
  a load-time cost rather than a demo risk, but it is the first thing to trim - see the capped
  series note in `02-next-features.md`. `anomalies.json`, by contrast, is 40 KB.
- The region boundary on the globe is feathered over 3.5 degrees, so the study area still reads
  slightly rectangular at its southern edge.
- Software-rendered WebGL - a machine with no GPU driver - runs the ray march at a few frames per
  second. On real hardware, including the Intel UHD target, it is fine.
- 60 of the 121 Anomaly Features span a single Level, so they are sheets rather than bodies. That
  is a consequence of the Grid's uneven Levels, not of the detector.
