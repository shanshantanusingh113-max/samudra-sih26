# The two features not built yet

Three were scoped. **Observation Coverage shipped** (`pipeline/samudra/coverage.py`, and a third
entry in the Variable selector). These two did not, and this is what a new session needs to build
them without re-deriving the reasoning.

Both were assessed against what the data can actually support. Neither is blocked; both have a
version that is honest and a version that is not, and the difference is recorded here because it
is the part that gets lost.

---

## 1. Automatic anomaly scan

**Do not call it AI.** This is the single most puncturable claim available. A z-score is not a
model, and "Confidence: 91%" is a fabricated number unless it derives from something real. An
INCOIS judge will ask "trained on what?" and there is no answer. `CONTEXT.md` already records
machine learning as an extension point, not an implementation, and that should stay true.

Call it an **automatic anomaly scan**, and make the number a percentile or a z-score with its
supporting sample size - "3.1σ, 119 depths matched" - rather than a confidence.

### What is computable from data already held

| Anomaly | Source | Effort |
| --- | --- | --- |
| Model-vs-observation outliers | `collocations.json`, per-depth residuals | **Already computed. Just rank them.** |
| Fronts and sharp gradients | The gradient channel in every Volume | **Already computed. Free.** |
| Temporal warm/cold anomalies | Departure from the 12-timestep mean | A few lines of numpy |
| Zonal anomalies | Departure from the along-latitude mean at each depth | Same |
| Unusual currents | Nothing. No current data exists in the project | **Not possible** |

The residual one is strongest because it *is* the project's thesis. Float 2902306 at -2.16 °C
across 119 depths would be item one on that list today, and it is a real upwelling signal rather
than a curiosity.

### Shape

- **Pipeline:** compute in `bake.py`, write `anomalies.json` alongside the collocations. Ranked,
  capped at maybe 20 entries, each with location, depth range, field, value, z-score and the
  supporting count.
- **Frontend:** a list panel. Clicking an entry sets `fieldKey`, `depthFrom`/`depthTo` and calls
  `focusOn(lon, lat)` - all of which already exist and are store-driven.
- **Guide entry required.** An unexplained control is worse than no control.

**Cost:** 4-5 hours. **Risk:** low technically, high rhetorically if the word "AI" survives.

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

**Ocean currents: two routes.**

- *Cheap and awkward:* `incois_valueadded_products_datasets` has `GEO_U`/`GEO_V` ready, but the
  series **ends 2019-03** and cannot share a timeline with the 2026 temperature field without a
  caveat on screen. 2-3 hours.
- *Harder and better:* derive geostrophic currents from the density field via thermal wind from T
  and S. Real oceanography, shares the timeline, no stale-data caveat. Needs TEOS-10 density and
  a reference-level assumption. About a day.

2D arrows on a depth slice are straightforward once U and V exist. **3D streamlines remain cut** -
they are a project in themselves, and `CONTEXT.md` says so.

---

## If there is one day

1. **TCHP / D26 field** (3 h) - makes the cyclone story real, uses data already held
2. **Anomaly scan, honestly named** (5 h) - ranks what is already computed
3. **Fix the Tier 1 items in [`docs/BUGS.md`](../BUGS.md)** (2 h) - all four are in one file and
   all four say something false in plain English

"Ask the Ocean" is the most impressive-sounding and the most likely to misfire live. Build it
last, or not this cycle.
