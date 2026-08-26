# Known defects

Every item below was found by reading the code and checking it against the baked data or the
running app, and every one was re-verified against the current tree on 2026-08-25. File and line
numbers are live at that commit.

**Line numbers in Tier 1 predate the derived-fields work of 2026-08-25** (ADR 0010), which moved
code in `ProfilePanel.tsx`. The defects themselves were re-checked and all remain open unless
listed as closed below.

Ordered by how much damage each would do if a judge found it first.

**Nothing here is speculative.** Where a claim could not be verified it is marked as such rather
than asserted.

---

## Tier 1 - tells a user something false

### 1. The salinity verdict has its sign backwards

`web/src/ui/ProfilePanel.tsx:255-262`

`residual = observed - modelled` (`pipeline/samudra/collocation.py:71`), so `bias > 0` means the
float measured **more** than the model, i.e. the model is **fresher**.

The temperature branch gets this right (`bias > 0` maps to `"cooler than"`). The salinity branch
does the opposite (`bias > 0` maps to `"more saline than"`). Two contradictory conventions inside
one ternary, and salinity is the wrong one.

The sentence renders as *"The model reads on average 0.31 PSU more saline than the instrument
measured"* at the exact moment the model is 0.31 PSU fresher.

**Why it matters:** salinity bias sign is the whole point of a Bay of Bengal freshwater story. An
oceanographer reads that sentence and stops trusting the panel.

**Fix:** swap the salinity arms. One line.

---

### 2. Verdict thresholds are temperature thresholds applied to every field

`web/src/ui/ProfilePanel.tsx:271-273`

`rms < 0.6` = "Close agreement", `< 1.5` = "Moderate". Hard-coded, field-independent.

Measured over the baked collocations:

| Field | n | Median RMS | "Close" | "Moderate" | "Large" |
| --- | --- | --- | --- | --- | --- |
| temperature | 87 | 0.513 °C | 56 | 28 | 3 |
| salinity | 85 | 0.066 PSU | **82** | 1 | 2 |
| density | 85 | 0.141 kg/m³ | **82** | 1 | 2 |

0.6 PSU is 16% of the entire encoded salinity range (32.86-36.56). The salinity verdict is a
constant that says "Close agreement" 96% of the time. It is not a verdict, it is decoration, and
it sits on the screen the project calls its scientific core.

**Now two fields out of three.** Density was added as a collocated Field on 2026-08-25 and lands
in exactly the same place: 82 of 85 floats read "Close agreement" against a threshold set for
degrees Celsius. Adding a Field made this worse, and the *wording* half of the same function was
fixed at the time - it used to say the model read "cooler than" the instrument for density, which
is a sentence about density that means nothing - but the threshold half was left, because it is
this logged defect rather than part of that change.

**Fix:** per-field thresholds in the `FieldSpec`, which already carries optional hints.

---

### 3. The profile header describes a different place and time from the dot you clicked

`web/src/ui/ProfilePanel.tsx:69-77`

Position, Last surfaced and Deepest all read `chosen.latest` - the float's most recent fix. But
the marker is drawn at `positionAt(item, timeMs)`, the fix nearest the timestep on screen.

Baked tracks span 2026-04-06 to 2026-07-30 with ~13 fixes each. Scrub to April, click the dot,
and the panel confidently reports a July position several degrees away.

`ProfilePanel.tsx:107` compounds it: "Centre the view on this float" calls
`onFocus(chosen.latest.lon, chosen.latest.lat)`, so the button flies the camera **away** from the
marker just clicked.

**This is the same family as the frozen-float bug** that was already fixed once: the marker was
corrected and the readout was left behind.

**Fix:** resolve the fix at the current timestep and read from that; fall back to `latest` only
when the float is not reporting.

---

### 4. "Reporting" is a hard-coded string

`web/src/ui/ProfilePanel.tsx:57`

Every float, always. Select a float, scrub to a timestep where `positionAt` returns null: the
marker is parked off-screen by the vertex shader, the dot vanishes, and the panel stays open
saying "Reporting" with a full chart underneath.

**Fix:** derive it from the same `positionAt` call the scene uses.

---

### 5. The collocation is pinned to a timestep the user is usually not looking at

`pipeline/samudra/bake.py` - `_build_observations` collocates only `casts[-1]`.

Measured: **82 of 88 collocations sit at timestep index 10 or 11 of 12.** At any earlier step,
every profile chart is against an analysis the timeline is not showing.

Partly mitigated at `ProfilePanel.tsx:96-99`, which prints "(not the step above)". But that note
is the smallest text in the panel and sits *below* the headline verdict and the three large
statistics, none of which change. A judge scrubbing the timeline with the panel open sees a
static comparison presented as though it responded.

**Fix, cheap:** move the note above the numbers and grey them when drifted.
**Fix, real:** collocate every cast, not just the last, and select by timestep at render time.
Costs bake time and file size.

---

## Tier 2 - data quietly discarded

### 6. Argo QC flags are never read

`pipeline/samudra/sources/argo.py:113`

The request asks for `platform_number,time,latitude,longitude,pres_adjusted,temp_adjusted,
psal_adjusted`. No `*_qc` columns, no `data_mode`. The only quality control in the system is a
plausible-range check on values.

ADR 0008 frames the salinity floor as **stricter** than the Argo standard. True for gross range
test 4, and it quietly implies the other tests are running. They are not.

**Why it matters:** "do you honour the QC flags" is a question an INCOIS oceanographer will ask,
and the honest answer today is no.

**Measured evidence, 2026-08-25.** Two floats in the current bake carry a broken salinity sensor
and pass the range check because they sit just above the deliberate 25 PSU regional floor:

| Float | Salinity RMS | Observed salinity range | Density RMS |
| --- | --- | --- | --- |
| 1902198 | 7.75 PSU | 25.19-27.67 | 6.16 kg/m³ |
| 1902194 | 5.83 PSU | - | 4.56 kg/m³ |

Open Indian Ocean water is 33-37 PSU. Adding the density Field made this visible in two places
instead of one, which is the field working rather than failing - it propagates a bad instrument
faithfully. But it means the "click a float" story on Density can land on a broken sensor, and
these two are the only floats out of 85 whose density RMS exceeds 1 kg/m³. Reading the Argo QC
flags would almost certainly catch both.

**Fix:** add the `_qc` columns to the request and reject flags 3 and 4. Cheap.

---

### 7. The adapter's fallback chain cannot fire for the provider it protects

`pipeline/samudra/sources/argo.py:85-87` declares `pressure=("pres_adjusted", "pres")` and the
parser takes the first variant carrying a number. But `requested` never asks Ifremer for the raw
columns, so the fallback list has exactly one entry.

Any Ifremer profile in real-time mode with an empty `TEMP_ADJUSTED` is dropped whole. This is the
same failure mode ADR 0009 describes happening to INCOIS, now happening to the provider the demo
actually reads.

**Not quantified** - measuring it needs a live fetch with the raw columns included.

---

### 8. The shallowest Argo bin is never compared

`pipeline/samudra/collocation.py:84` returns NaN for any depth below `levels[0]` = 5 m.

Correct refusal to extrapolate, but it means the surface point - the one a fisheries or cyclone
judge cares most about - is systematically absent from every comparison.

**Fix:** say so on screen, or interpolate the model's 5 m value and label it.

---

## Tier 3 - labels and presentation

### 9. `-0.00` renders as a negative zero
`ProfilePanel.tsx:299`. A mean residual that rounds to zero from below prints "-0.00", which
reads as a bug to anyone looking carefully.

### 10. The bias chip's colour class inverts the physics
`ProfilePanel.tsx:297` takes class `cool` when `bias < 0`. But `bias < 0` means the model is too
**warm**. Whichever way the CSS paints it, the class name encodes the opposite, and it is
meaningless for salinity.

### 11. "Typical gap" is RMS
`ProfilePanel.tsx:305`. RMS is the quadratic mean and is always at least the mean absolute
deviation. Defensible as plain language, but it is not what "typical" means to a statistician.

### 12. The depth ruler labels the top of the box "0 m"
`geography.ts:54` returns axis 0 for anything at or above 5 m, and `depthTicks` starts at 0. The
shallowest data is 5 m. Small, but it is a measurement claim.

### 13. The western edge of Observation Coverage is genuinely sparse, and looks like a bug
Not a defect - recorded because it will be asked about. After the halo fix the eastern rim
recovered but the western one did not, because the western Arabian Sea really is less sampled:
**9 floats between 55-60 E against 27 between 80-90 E** in the current bake. The red rim there is
signal, not artefact. Worth saying out loud in the demo rather than being asked.

### 14. Depth ruler labels tuck under the left panel
Cosmetic. The ruler is anchored to the box's near-left edge, which sits behind the control panel
at the default camera. Scene geometry, not CSS.

---

## Closed since the first review

| Was | Now |
| --- | --- |
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

**The default water opacity hides the feature the project is proudest of.**

`web/src/store.ts` ships `opacity: 0.05`. Measured pixel difference between emphasis 0% and 85%
inside the volume:

| Water opacity | Mean pixel difference | Pixels visibly changed |
| --- | --- | --- |
| **0.050 (default)** | 0.91 | **2.2%** |
| 0.012 | 4.26 | 21.2% |
| 0.005 | 5.48 | 28.0% |

`volumeShader.ts:162` accumulates `uOpacity * coverage * inWindow * emphasis` and breaks once
alpha passes 0.995. At 0.05 the ray saturates after roughly twenty steps, so the picture is
decided by the first slab of water it meets and the emphasis weighting never matters.

The shader's own fallback uniform is 0.012, which suggests the default was raised later and the
emphasis demo was never re-checked against it.

**Decision needed:** change the default to ~0.012 so a judge exploring alone can see the effect,
or leave it and drag the opacity slider down during the demo. This is a judgement call about the
opening picture, not a defect.
