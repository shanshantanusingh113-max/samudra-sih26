# Known defects

Every item was found by reading the code and checking it against the baked data or the running
app, and every claim here is measured rather than asserted.

**All fourteen are fixed.** They were worked through in order on 2026-08-27: each was first
re-verified against the tree, then fixed, then checked in the running app or under test, and only
then moved to the closed table below. Two of them changed the data the platform ships - honouring
Argo's quality flags, and fetching the raw columns the fallback chain had always declared and
never asked for - and the figures they invalidated were corrected across the README, the landing
page, the guide panel and the deck.

The three tier headings are kept empty rather than deleted, because the ordering they encode -
*tells a user something false* above *data quietly discarded* above *labels and presentation* - is
the thing to sort the next batch by.

---

## Tier 1 - tells a user something false

**Empty.** All five are fixed and listed in the closed table at the bottom.

## Tier 2 - data quietly discarded

**Empty.** All three are fixed and listed in the closed table at the bottom.

## Tier 3 - labels and presentation

**Empty.** All six are fixed and listed in the closed table below.

---

## Closed since the first review

| Was | Now |
| --- | --- |
| `-0.00` rendered as a negative zero | 46 field/float pairs in the current bake have a bias between -0.005 and 0, and every one printed "-0.00". The value is rounded before it is formatted, so anything that rounds to nothing prints "0.00" unsigned |
| The bias chip's colour class inverted the physics | It took class `cool` when `bias < 0`, and `bias < 0` is the model reading *high*. The classes are `model-high` and `model-low` now, which is what the number underneath them means and is not a claim about temperature on a salinity or density comparison. A bias under 0.005 takes no class at all |
| "Typical gap" was RMS | RMS is the quadratic mean and is always at least the mean absolute deviation, so "typical" named the wrong quantity to anyone who would check. The label reads "RMS gap" |
| The depth ruler labelled the top of the box "0 m" | The tick filter allowed anything within 5 m of the surface and the shallowest Level is 5 m. The first figure is now the model's own top Level, because a ruler is a measurement claim |
| Depth ruler labels tucked under the left panel | Not cosmetic once measured: nine of the ten figures were behind the panel at 1500 px, because the Volume is wider than the gap between the two panels and both of its vertical edges are covered. The figures sit in the clear strip past the panel now - only their horizontal position moved, the depth each marks is unchanged - and the map key was moved clear of them. Verified at 1180, 1280, 1500, 1920 and 2560 px |
| The shallowest Argo measurements were dropped without saying so | The model's top Level is 5 m and 88% of casts report above it, so on most comparisons the very surface had nothing behind it and the panel did not mention it. `above_model_count` is computed in the Collocation and the panel now names how many points were skipped and why they are not extrapolated into. 174 of 212 collocations report some, median 2 and up to 8 |
| Argo's own QC flags were never read | The request asked for values and never for the `_qc` column beside them, so a sensor the Argo programme had already condemned arrived looking like a good one. Flags 3, 4 and 9 are now refused per channel and per variant. The two floats with failed salinity sensors lost their salinity and density series and kept their temperature, and the worst density RMS in the bake fell from 6.16 to 0.73 kg/m3 |
| The adapter's fallback chain could not fire for the provider it protects | `ProfileColumns` declared `pressure=("pres_adjusted", "pres")` while a hand-written `requested` string asked only for the adjusted columns, so the chain had one link. It is derived from the layout now, which is what "the column layout is data, not code" was supposed to mean. **This more than doubled the observations: 93 floats and 1,154 casts became 221 floats and 2,955 casts**, because every real-time profile with an empty `*_ADJUSTED` column had been dropped whole. Ocean voxels with no cast behind them fell from ~20% to 6% |
| The profile header described a different place and time from the dot you clicked | It read the Float's newest report whatever the timeline said. At the first Timestep that was a position a median 247 km from the marker just clicked and 1157 km at worst, and "Centre the view on this float" flew the camera to it. Header, dive depth and the focus button all resolve at the moment on screen now; `floats.json` carries a `depthMax` per Fix so "that cast reached" is the cast being described |
| The "Reporting" pill was a hard-coded string | Derived from the same `positionAt` the scene uses. A Float that was not surfacing near this step reads "Not reporting", and the panel says which report the figures come from instead |
| A drifted collocation was disclosed in the smallest text on the panel, below the verdict and the statistics | 81 of 88 collocations sit at step 10 or 11 of 12, so a user scrubbing the timeline saw a static comparison presented as though it had responded. The disclosure now leads the section, above the chart, and says "Scrubbing does not move this chart" in as many words when the step does not match |
| The verdict thresholds were degrees Celsius applied to every field | 0.6 PSU is a sixth of the whole salinity range, so 82 of 85 floats read "Close agreement" and the headline carried no information; density landed in the same place. They are now the fraction of each Field's own encoded range that temperature's numbers always implied, so temperature is unchanged (56/28/3) and salinity reads 48/28/11 and density 56/23/8. One formula, no per-Field constant to keep in step |
| The salinity verdict had its sign backwards | `residual = observed - modelled`, so a positive bias means the float read more salt and the model is *fresher*. The panel said "more saline". Verified against float 5907083 - float 34.44 PSU, model 34.68 - which now reads "0.24 PSU more saline than the instrument measured", and against 1901898, where the model is fresher and the sentence now says so |
| Log scale warped the water while the colourbar stayed linear, making the legend disagree with the water | Removed end to end - control, store field, uniform, both shader branches, guide entry |
| The palette selector offered nine cmocean palettes with no hint eight were designed for other quantities | **Deleted entirely.** The derivable ones became Variables (density, temperature anomaly); `delta`, `algae`, `oxy`, `deep` and `speed` were removed. Every Field now carries its own palette in its `FieldSpec`, so there is no pairing left to get wrong. ADR 0010 |
| The guide panel was hidden entirely on the globe | Appears once a control is touched, taking the cue card's slot |
| Selecting Observation Coverage made every float report "no usable data" | Falls back to a field the float carries, and says why. The reason is now per-Field: one sentence covered coverage but was false of density, which is both predicted and measured, and of the anomaly, which is neither. Density is collocated properly instead, since a Float measures both of its ingredients |
| Five floats reported "no usable data" with no reason given | They drifted past the grid edge, and the panel now says that instead of blaming the instrument |
| Landing page claimed 88 floats / 0.46 across 84 | 93 floats / 0.48 across 88, matching the bake |
| README and CONTEXT claimed geostrophic currents were drawn as 2D vectors | There is no current code anywhere; both now say so with the reason |
| Feature emphasis appeared to do nothing at the default water opacity | Diagnosed: at 0.05 the ray saturates in ~20 steps. Still open as a **default**, see below |
| Observation Coverage showed a false "no observations" rim at the region edges | The profile fetch stopped at the region boundary, so an edge voxel could only be reached from one side. Measured: 0.00 casts at the eastern edge against 2.71 in the interior. The fetch now takes a 3 degree halo and counts it, while Floats and Collocations stay inside the region |
| An isosurface on Observation Coverage drew black slabs and towers | Not a shader fault: a cast count is a step function, so the "surface" is the boundary between whole numbers and its shading normal is degenerate. `FieldSpec.isosurface` now marks the operation inapplicable and the control is replaced by an explanation |
| The Anomaly Feature ring sat on the body's hottest cell rather than on the body | Measured: a median 222 km from the middle of its own feature, 451 km at the ninetieth percentile, 1063 km at worst - so a ring could sit on pale water at one end of a long body while the panel described conditions at the other. Marker and every reported fact now come from the cell nearest the centre; the peak survives as "at its strongest". Now 56 / 166 / 300 km |
| An Anomaly Feature's size was the span of its bounding box | A diagonal or curved band inflates that badly: one reported 3228 km "across" from 705 cells. It is a horizontal area now, each column counted once however deep it runs |
| The palette dropdown offered nine flat options with no statement of what each encodes | Superseded: there is no dropdown. The one-line note under the colourbar stays, saying what the Field's own scale encodes |
| Observation Coverage undercounted casts wherever a slab was thinner than Argo's reporting interval | The rule asked whether a level fell *inside* a slab, which near the surface is a question about our depth axis. Measured: slab 3 (19 m) reached by 76.6% of casts against 98.9% at 25 m, 23.1% of voxels in the wrong band there, and 15 of 16 "float sitting on no casts" cases had a cast from that float at that position inside the window. A cast now counts for every slab between its shallowest and deepest good level |
| A voxel with exactly one cast was painted with the "no casts" colour | The band edges sat exactly on the thresholds, and the byte encoder rounded a count of 1 to the wrong side of one at a range of 0..7. The red band was unreachable and the whole sparse tier was invisible. Edges now sit half a count below their threshold, and `test_palettes.py` checks the round trip at seven plausible ranges. It had worked at 0..8 by luck |
| The Float markers and the coverage window used different clocks | `MAX_REPORT_GAP_DAYS = 12` against the bake's `COVERAGE_WINDOW_DAYS = 5`, so 2% of drawn markers were instruments no coverage window had counted. The window ships in the manifest and the frontend adopts it |
| The coverage neighbourhood was a square described as a radius | `abs(dlat) <= 3` and `abs(dlon) <= 3/cos(lat)` reaches 1.41 times further diagonally than it claims, and every cast painting an identical rectangle gave the field right-angled edges that read as ocean structure. It is a circle, and the guide says 330 km because that is what it now is |
| The coverage band key showed different colours from the water beside it | The key read the raw palette while the colourbar and the shader read the display-lifted one. On the dark console "no casts" was drawn at (102, 112, 118) and swatched at (58, 68, 74). ADR 0007 applies to the key too |
| The band labels graded the evidence, so a lone float looked like an error | "Sparse: 1" under a white marker reads as a contradiction. The labels are plain counts now, and the key says the float you can see is itself the cast being counted |
| The guide explanation timed out after 14 seconds | It now stays until another control is touched or it is closed |
| The left panel needed a horizontal scrollbar | Widened to 344 px. The Variable selector is now a two-column grid that wraps, which is what lets it hold five Fields with labels as long as "Observation Coverage"; the palette select that used to force the panel wider no longer exists |

---

## Known and stated, not a defect

**The western edge of Observation Coverage is sparser, and it is geography.** Recorded because it
will be asked about. Re-measured 2026-08-27, after honouring Argo's QC flags more than doubled the
float count: 20 floats between 55-60 E against 64 between 80-90 E, and mean surface coverage of
2.53 casts at the western edge against 4.05 in the interior. But the *eastern* edge is 1.73, lower
still - so this is not a western problem. Both edges run into land and shelf, Somalia at 51 E and
Sumatra at 100 E, and Argo floats do not drift onto continents. Signal, not artefact.

**Most vivid anomaly colour carries no ring, and that is correct.** The anomaly Field is painted
in degrees and the Feature detector selects on a z-score, so the two disagree by construction.
Measured on the last step: of 163 cells past 3 degC of departure, 99 carry no ring, and those
cells swing 2.07 degC routinely against a z of 1.71 where 2.0 is needed. They sit at 50-100 m -
the thermocline band, which is large in degrees and unremarkable for that water. The detector is
right and the picture is the misleading half, so the rule is now stated in the guide entry and
on the Feature panel itself rather than left for a viewer to trip over.

Lowering the threshold to 1.75 would catch them and roughly double the marker count for cases
that genuinely are borderline. Explaining the rule beats blurring it.

## Open question, not a bug

**How dense should the water be by default?**

`web/src/store.ts` ships `opacity: 0.05`. `volumeShader.ts` accumulates
`uOpacity * coverage * inWindow * emphasis` and breaks once alpha passes 0.995, so a high opacity
saturates the ray in the first slab of water it meets and the Feature emphasis weighting - the
thing that makes the thermocline the solid object in the picture - stops mattering.

Re-measured 2026-08-27 against the current build, as pixel difference between emphasis 0% and
85% inside the Volume:

| Water opacity | Mean pixel difference | Pixels visibly changed |
| --- | --- | --- |
| 0.005 | 13.63 | 77.0% |
| 0.012 | 10.76 | 76.1% |
| 0.030 | 4.07 | 35.6% |
| **0.050 (default)** | 2.10 | **17.4%** |

An earlier version of this table reported 2.2% at the default and 21.2% at 0.012. Those figures
predate the derived Fields and the render changes that came with them; the effect at the shipped
default is now roughly eight times stronger than it was, and is genuinely visible.

**Recommendation: 0.03.** It doubles the visible effect against the default while keeping the
water solid enough to read as a body rather than a mist. But this is a judgement about the
opening picture of a demo, so it is the author's call and not a defect to be fixed unilaterally.
