# Drift, and the decision to publish its own score

PS 26067 names four operational mandates a missing 3D platform impedes: hazard assessment,
**search-and-rescue support**, fishery advisories and climate monitoring. Search and rescue had
zero coverage in this build - not a Field, not a view, not a sentence - and it was the largest
single gap against the problem statement's own list of what INCOIS does.

## What was built

Drop a pin in the water. The platform integrates the baked Copernicus current field forward from
that point, at the depth the Depth slice is set to, and draws the trajectory the analysis
implies. `pipeline/samudra/drift.py` is the integrator: midpoint (RK2), bilinear in space,
linear in time between the ten-day analyses, nearest in depth.

## The three decisions

### 1. Say what it is not, in the first sentence on the panel

A real search-and-rescue drift product needs surface wind, Stokes drift from the wave field, and
a leeway coefficient for the specific object - a life raft, a hull and a person in the water all
drift differently in the same current. This carries none of them. INCOIS run
[SARAT](https://sarat.incois.gov.in/sarat/home.jsp) for exactly this, over 60 object types, with
output in the local language of every coastal state.

So the caution is the first line of the panel and it is styled as a caution rather than as small
print. This is the same rule ADR 0010 applied to geostrophic currents: **never ship something
plausible and wrong**. The difference is that a current field alone is not wrong, it is
*incomplete*, and naming the missing terms is what makes it usable.

### 2. Publish the score, and let it be unflattering

This platform holds 228 Argo float tracks, and an Argo track **is** measured drift at the
parking depth. So the same integrator was run from every drifting float's own first Fix and the
answer written into the bake. Re-measured on 2026-09-03, across **195 floats**:

| Question | Answer |
| --- | --- |
| From a position known one Argo cycle ago, how far out is the current field alone? | median **38 km**, ninetieth percentile **87 km**, over **1,908** cycles |
| Let go and left for ~10 days | median separation **44 km**, against **46 km** the float itself travelled |
| ~30 days | **99 km** against **103 km** travelled |
| ~60 days | **143 km** against **150 km** travelled |
| ~90 days | **208 km** against **204 km** travelled |

**Only the days the current field covers are scored.** `CurrentSeries._bracket_time` holds the
first analysis rather than extrapolating before it, which is the right choice for drawing a line
and a silent assumption inside a number: a comparison starting before the first analysis is
scored against a field that was not measured then, and it looks exactly like one that was.
Measured before this was fixed: the earliest Fix in the bake was **2026-03-22** against a first
analysis of **2026-04-10**, and **199 of the 202** baked comparisons started inside that 19-day
hole, with 184 of them finishing before the analysed period began. `CurrentSeries.covers` refuses
them - the same refusal `choose_cast` and the Float markers already make - and the table above is
what is left. The figures moved by 1 to 8 km and the count of scored floats by 7, so the finding
did not change; what changed is that it is now a measurement of the analysed period.

Read plainly: over one cycle the analysis is useful and imprecise, and past a month the
separation is the same size as the distance travelled, which means the trajectory has stopped
carrying information about *this* float. That is the honest answer and it is the one on screen.
It is also the argument for SARAT rather than against this: it shows exactly how much of the
problem a current field solves on its own.

Two figures had to be got right for that table to mean anything:

- **The horizon labels.** The first version took the first Fix at or past each horizon. An Argo
  cycle here measures **9.9985 days**, so every float fell through the 10-day bucket into its
  second cycle and a number labelled "10 days" was a median of **18**. Plausible, smooth and 77%
  too long. A Fix is now matched to the nearest horizon within a quarter of it, and the median
  day actually used is written down beside the answer.
- **The distance travelled.** A separation of 300 km means one thing next to 200 km of travel
  and another next to 2,000 km. Both are reported, always.

### 3. One second implementation, and it is measured rather than assumed

This project's standing rule is one curve in one file - `web/src/transfer.ts` exists because a
second copy of the Scale silently disagreed with the first and the log scale had to be cut.

Drift breaks that rule once, deliberately. The pin is interactive, so the integration has to run
where the user is: in the browser. The alternative was an API endpoint, and the demo runs with
the API off and the static deployment at `rak2315.github.io` has no API at all - so an API-only
drift would be dead on stage and dead on the link a judge opens.

The rule is kept in the only way that survives contact: `web/src/drift.ts` is **not trusted**.
`web/probe-drift.mjs` runs the shipped browser module from the same start points as the baked
trajectories and compares the two in kilometres. Measured over 40 trajectories, some running
101 days: **median 0.331 km, worst 1.573 km**. The tolerance is 2 km, which the float32 files
and three-decimal baked positions account for; a sign error, a missing `cos(latitude)` or a
swapped axis is tens to hundreds of kilometres and fails immediately.

The panel's numbers still come from the baked file, never from the browser's integration, and
the selected float's predicted line is the baked polyline vertex for vertex - checked to
1.9e-6 degrees by the same probe. The browser integrates only what the pipeline never could: a
pin somebody just dropped.

## What was rejected

**Baking a grid of launch points** instead of integrating live. It would have kept the one-copy
rule, and it would have made "drop a pin" into "pick the nearest of 280 pre-computed pins",
which is a different and worse feature.

**Adding wind and leeway.** There is no wind field in this pipeline. Inventing one would be
fabricating data, which the demo's own Q&A explicitly promises not to do.

**Calling it search and rescue.** It is called Drift, in the panel, in the guide and in
`CONTEXT.md`, and the clause it answers is named on the requirements page with the limit stated
in the same sentence.
