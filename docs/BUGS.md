# Known defects

**None open.** All fourteen from the first review were fixed on 2026-08-26, worst first: each was
re-verified against the tree, fixed, checked in the running app or under test, and then removed
from this file. What they were and what the numbers behind them looked like is in the commit
`Fix every defect in docs/BUGS.md, worst first`; the traps worth not repeating were promoted into
rules in `CLAUDE.md`, module docstrings, and ADRs 0008 and 0010 rather than left here.

Two of them changed the data the platform ships rather than how it looks. Honouring Argo's own
quality flags, and fetching the raw columns the fallback chain had always declared and never
asked for, took the bake from 93 floats and 1,154 casts to **221 floats and 2,955 casts** and
dropped the ocean with no observation behind it from about 20% to 6%. `CLAUDE.md` records that
under known upstream quirks, because it is the kind of thing a reader will otherwise re-derive.

When the next batch is found, sort it by these three, in this order:

1. **Tells a user something false.** A wrong sentence on screen costs more than a missing feature.
2. **Data quietly discarded.** Silence about what was dropped is the same fault one level down.
3. **Labels and presentation.** Cheap to fix, and "cosmetic" is worth measuring before believing -
   the depth ruler was filed that way and turned out to be hiding nine of its ten figures.

---

## Known and stated, not a defect

**The edges of Observation Coverage are sparser, and it is geography.** Recorded because it will
be asked about. Measured 2026-08-27: 20 floats between 55-60 E against 64 between 80-90 E, and
mean surface coverage of 2.53 casts at the western edge against 4.05 in the interior. But the
*eastern* edge is 1.73, lower still, so this is not a western problem. Both edges run into land
and shelf - Somalia at 51 E, Sumatra at 100 E - and Argo floats do not drift onto continents.
Signal, not artefact.

**Most vivid anomaly colour carries no ring, and that is correct.** The anomaly Field is painted
in degrees and the Feature detector selects on a z-score, so the two disagree by construction. Of
163 cells past 3 degC of departure in the last step, 99 carry no ring; those cells swing 2.07 degC
routinely, against a z of 1.71 where 2.0 is needed. They are the thermocline band at 50-100 m,
large in degrees and unremarkable for that water. The rule is stated in the guide entry and on the
Feature panel rather than left for a viewer to trip over.

---

## Open question

**How dense should the water be by default?** `store.ts` ships `opacity: 0.05`. The shader breaks
once accumulated alpha passes 0.995, so a high opacity saturates the ray in the first slab and the
Feature emphasis weighting stops mattering. Pixel difference between emphasis 0% and 85% inside
the Volume, re-measured 2026-08-27:

| Water opacity | Mean pixel difference | Pixels visibly changed |
| --- | --- | --- |
| 0.005 | 13.63 | 77.0% |
| 0.012 | 10.76 | 76.1% |
| 0.030 | 4.07 | 35.6% |
| **0.050 (default)** | 2.10 | **17.4%** |

0.03 would double the visible effect while keeping the water solid enough to read as a body. This
is a judgement about the opening picture of a demo, so it is the author's call rather than a
defect to be fixed unilaterally.
