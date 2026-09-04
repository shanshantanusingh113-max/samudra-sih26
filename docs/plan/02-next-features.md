# The features not built yet

Assessed against what the data can actually support. Both have a version that is honest and a
version that is not, and the difference is recorded here because it is the part that gets lost.

Last reconciled against the tree: 2026-08-25.

---

## 1. Rank the Residuals - **built**

Both halves of the automatic scan now exist.

| Question | Status |
| --- | --- |
| Where did the *field* depart from its own average? | **Done.** `find_anomaly_features()`, 121 features across the twelve Timesteps |
| Where does the *model* most disagree with the *floats*? | **Done.** `pipeline/samudra/residuals.py` ranks and bins them; the "Model vs instruments" group in the left panel is the map and the list |
| Fronts and sharp gradients | Not built. Already computed as the gradient channel in every Volume, so it is free. Idea A6 in [`05-coverage-audit-and-ideas.md`](05-coverage-audit-and-ideas.md) |
| Unusual currents | Superseded. Currents are real numbers now - ADR 0013 - so this is reopenable, but nothing is built |

**The word "AI" survived nowhere**, which was the risk recorded here. There is no model, no
training set and no confidence score: `residuals.json` carries the mean and the RMS of residuals
`bake.py` had already written, and the ranking is on the RMS as a fraction of each Field's own
encoded range so a degree and a PSU can share one list. The verdict thresholds this section said
to fix first were fixed a round earlier and now live in `web/src/agreement.ts`, read by both the
Collocation panel and the bias map so the two cannot contradict each other.

Re-measured on 2026-09-03, after two fixes that moved every figure in this table. A float's
comparison is now refused below **20 matched depths** - an Argo cast reports at a median 221 of
this model's levels - and a moored buoy is exempt, because a buoy's 3 to 9 sensors are the whole
instrument rather than a truncated dive. Measured: of the 12 temperature rows below 20 depths, 9
were buoys and 3 were truncated casts, at 10, 13 and 14. Nine rows dropped in all, three per
Field. Every ranked row now prints the depths behind it.

| Field | Instruments | Mean bias | Typical gap | 5 degree boxes with 3+ instruments |
| --- | --- | --- | --- | --- |
| Temperature | 230 | +0.021 degC | 0.190 degC | 35 |
| Salinity | 221 | -0.006 PSU | 0.034 PSU | 34 |
| Density | 221 | -0.007 kg/m3 | 0.049 kg/m3 | 34 |

**The pooled figure is largely the model agreeing with itself.** INCOIS assimilate Argo, so a
float's residual measures the analysis against an observation it was fed. The nine moored buoys
are not assimilated, and split out they disagree several times as much:

| Field | 9 moorings | Floats | ratio |
| --- | --- | --- | --- |
| Temperature | **0.748 degC** | 0.167 degC (221) | 4.5x |
| Salinity | **0.144 PSU** | 0.029 PSU (212) | 4.9x |
| Density | **0.257 kg/m3** | 0.040 kg/m3 (212) | 6.4x |

The panel prints both, and the second is the number a forecaster wants: how far the analysis
sits from water nobody told it about.

The regional finding survives: the northern Bay of Bengal, **15-20 N 85-90 E**, is in the worst
three boxes for all three Fields - worst for salinity at 0.184 PSU, second for density at
0.167 kg/m3, third for temperature at 0.686 degC - against basin-wide figures four to five times
smaller. That is the Ganges-Brahmaputra freshwater plume, and it is the one place a 1 degree
analysis of this region would be expected to struggle. Temperature's two worst boxes are now
elsewhere and both rest on the minimum three instruments, which is worth knowing before quoting
either of them.

### Still not built: a Collocation per Timestep

Every Float's chart is the comparison for its **latest** cast, and 81 of 88 of those sit at step
10 or 11 of 12. The panel says so plainly rather than letting a scrubbed timeline imply a chart
that moved, so it is no longer a defect - but it is still a missing feature.

Doing it properly was measured rather than estimated, and it is not cheap:

| Approach | Size of `collocations.json` |
| --- | --- |
| Today: the latest cast only | 4.8 MB |
| Every cast, chart series capped at 150 depths | **14.1 MB** |
| Every cast, full resolution | **63.6 MB** |

The float median is 511 levels and the ninetieth percentile is 1000, so the full-resolution
version is dominated by depth arrays no chart can draw. If this is built, cap the *plotted*
series and keep the statistics at full resolution - the residual numbers must not be computed
from a decimated profile.

---

## 2. "Ask the Ocean" natural-language query

**Build it as a grammar, not an LLM.** An LLM needs a network call and an API key, which breaks
the zero-network-calls-at-demo-time property the whole bake exists to protect. A dead venue
network would kill the feature in front of judges. Not worth it.

### What a rule-based parser handles

A small vocabulary covers most of what would be demonstrated:

- **Fields:** temperature, salinity, coverage, plus synonyms (warm, salty, evidence)
- **Places:** a gazetteer of ~30 entries with lat/lon - Chennai, Kochi, Bay of Bengal, Arabian
  Sea, Lakshadweep, off Oman, Andamans
- **Depths:** "surface", "thermocline", "below 500 m", "the top 200 metres"
- **Time:** "latest", "April", "the last three steps"

Each maps to store `setState` plus a camera move. Fully offline, deterministic, and it cannot
hallucinate a place that is not in the gazetteer.

### The honesty constraint that must not be lost

**"Show me the last 3 days" cannot be answered truthfully.** The analysis is a **10-day** product
and the demo holds 12 steps spanning April to July 2026. There is no daily resolution anywhere in
the system. The parser must snap time phrases onto 10-day steps and say on screen which step it
chose, or the feature invents precision the data does not have.

Pick demo queries that match the data:

- *"show me the thermocline off Oman"*
- *"where is the model warmest against the floats"*
- *"salinity in the northern Bay of Bengal"*
- *"where is there no observation coverage"*

### Failure behaviour

An unparsed query must say **"I did not understand that - try naming a variable and a place"**
rather than guessing. A wrong silent answer is far worse than a refusal, and a judge will type
something out of vocabulary within three attempts.

**Cost:** 4-6 hours, most of it the gazetteer. **Risk:** medium, all of it in overclaiming.

---

## Two more worth knowing about

Assessed at the same time, recorded so nobody re-asks.

**Cyclone simulation: no.** There is no wind field, no atmospheric model and no forecast track in
the pipeline. Simulating one means fabricating data, and the demo Q&A currently says "nothing is
simulated or synthesised". Breaking that for a flashy feature is a bad trade.

The honest substitute is better anyway: **Tropical Cyclone Heat Potential / D26**, heat integrated
from the surface to the 26 °C isotherm. Computable from the temperature Grid already held, it is
the actual physical quantity that governs rapid intensification, and INCOIS publish it as an
operational product. A derived field, not a simulation. **2-3 hours**, and it makes the cyclone
argument physical rather than rhetorical. If anything is built next, build this.

**Ocean currents: settled, and the answer is no.** Both routes were assessed and the derived one
was actually built before being rejected. Thermal wind from the density field gives 0.16 m/s for
the Somali Current at the height of the southwest monsoon against a real 1.5-2.5 m/s, and puts
the fastest water in the block on the equator, where geostrophy does not hold. Finite, plausible
and inverted, which is worse than absent. INCOIS's own `GEO_U`/`GEO_V` are properly derived but
stop at 2019-03 and cannot share this timeline. Full numbers in ADR 0010.

**Direction, as opposed to speed, is a weaker claim and may survive** - smoothing a density field
barely rotates its gradient even where it flattens the magnitude - but it would have to be
validated against the Argo parking-depth drift before anything is drawn. That drift is already on
screen as the Track of every Float, and it is a direct measurement of the current at 1000 m,
which is worth saying out loud in the demo whether or not arrows are ever added.

**3D streamlines remain cut** - and the line between them and what shipped is the vertical. A
sheet of moving dots on the chosen Level is built (ADR 0017) and runs the drift model's own step
rule; advection through the *block* needs a vertical velocity neither provider publishes.

---

## If there is one day

The Tier 1 bugs, the TCHP / D26 Field and Rank the Residuals were all on this list and are all
built. What is left in this document is the Collocation-per-Timestep question in section 1 and
"Ask the Ocean" in section 2. Everything else moved to
[`05-coverage-audit-and-ideas.md`](05-coverage-audit-and-ideas.md), which is the current list.

"Ask the Ocean" is the most impressive-sounding and the most likely to misfire live. Build it
last, or not this cycle.
