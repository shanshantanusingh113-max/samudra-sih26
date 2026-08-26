# The features not built yet

Assessed against what the data can actually support. Both have a version that is honest and a
version that is not, and the difference is recorded here because it is the part that gets lost.

Last reconciled against the tree: 2026-08-25.

---

## 1. Rank the Residuals, so the disagreement is findable

**Half of this shipped.** The automatic anomaly scan was scoped as one feature covering two
different questions, and only one of them is built:

| Question | Status |
| --- | --- |
| Where did the *field* depart from its own average? | **Done.** `find_anomaly_features()` labels every connected departure, `bake.py` attaches why it is there and what stands behind it, and the frontend rings each one and explains it on click. 111 features across the twelve Timesteps |
| Where does the *model* most disagree with the *floats*? | **Not built.** Every number it needs is already in `collocations.json` |
| Fronts and sharp gradients | Not built. Already computed as the gradient channel in every Volume, so it is free |
| Unusual currents | Not possible. No current data exists in the project, and deriving it was measured and rejected - ADR 0010 |

**Do not call it AI.** This is the single most puncturable claim available. A z-score is not a
model, and "Confidence: 91%" is a fabricated number unless it derives from something real. An
INCOIS judge will ask "trained on what?" and there is no answer. `CONTEXT.md` records machine
learning as an extension point, not an implementation, and that should stay true. The shipped
half already follows this: it reports a z-score with the threshold it had to clear, never a
confidence.

### What the remaining half looks like

The residual ranking is the strongest item left, because it *is* the project's thesis. Float
2902306 at -2.16 degC across 119 depths would be item one on that list today, and it is a real
upwelling signal rather than a curiosity.

- **Pipeline:** rank the entries already in `collocations.json` by RMS or by mean residual,
  capped at maybe 20, and write the ranking alongside them.
- **Frontend:** a list panel. Clicking an entry sets `selectedFloatId`, `timestepIndex` and calls
  `focusOn(lon, lat)` - all of which already exist and are store-driven. The Collocation panel
  then does the rest of the work unchanged.
- **Guide entry required.** An unexplained control is worse than no control.

**One thing to fix first.** The verdict thresholds are temperature thresholds applied to every
Field, so salinity and density both read "Close agreement" for 82 of 85 floats. Ranking a list by
a number whose verdict is a constant would put a meaningless column next to it. See
`docs/BUGS.md` item 2.

**Cost:** 2-3 hours. **Risk:** low technically, high rhetorically if the word "AI" survives.

### While you are in there: a Collocation per Timestep

Every Float's chart is currently the comparison for its **latest** cast, and 81 of 88 of those
sit at step 10 or 11 of 12. The panel now says so plainly rather than letting a scrubbed timeline
imply a chart that moved, so it is no longer a defect - but it is still a missing feature.

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

**3D streamlines remain cut** - a project in themselves, and `CONTEXT.md` says so.

---

## If there is one day

1. **Fix the Tier 1 items in [`docs/BUGS.md`](../BUGS.md)** (2 h) - five defects that say
   something false in plain English, four of them in a single file. Two are one line each. Do
   this before adding anything, because a new feature sitting next to a sentence with its sign
   backwards costs more than it earns
2. **TCHP / D26 field** (3 h) - makes the cyclone story physical, uses data already held, and
   half of it exists in `samudra/thermocline.py`
3. **Rank the Residuals** (2-3 h) - the other half of the anomaly scan, over numbers already
   computed

"Ask the Ocean" is the most impressive-sounding and the most likely to misfire live. Build it
last, or not this cycle.
