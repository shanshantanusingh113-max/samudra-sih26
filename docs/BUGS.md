# Known defects and open suspicions

**Worked through 2026-09-03, revisited four times on 2026-09-04. Two items are open; 100 are
fixed.** The fixed ones are summarised rather than listed, which is this file's own convention: a
defect whose measurement has been folded into `CLAUDE.md`, an ADR or a probe does not need a
paragraph here, and a file that is 90% solved problems is a file nobody opens to find the two
that are not.

The ranking is the one this file has always used:

1. **Tells a user something false.** A wrong sentence on screen costs more than a missing feature.
2. **Data quietly discarded, or quietly invented.** Silence about what was dropped, or about what
   was assumed, is the same fault one level down.
3. **Labels, presentation and performance.** Cheap to fix, and "cosmetic" is worth measuring
   before believing.

---

## Still open

- [ ] **44. Nothing checks that a caption still describes its picture.**
      Every landing-page and README picture carries written prose beside it, and some of it names
      colours - *"warm yellow at the sea surface fading through orange to deep violet at 2000
      metres"*. A theme change, a re-capture or a chosen frame makes that false and nothing
      notices.

      **The frames and the pipeline are solved; the prose is not.** Every picture was re-chosen
      on 2026-09-04 and every caption beside one was rewritten against the frame it now sits next
      to - but that was a person reading, not a probe. `probe-landing.mjs` checks a picture
      *exists*, *loads*, and *follows the theme*; it cannot check that the sentence under it is
      true. **This stays open on purpose**: it is a judgement about prose, and a probe that
      guessed at it would be worse than none.

      **The fourth pass found two instances and fixed both, and the fix is the mitigation this
      entry asked for: describe the role, not the colour.** The README's lead picture was cropped
      so hard that the comparison panel was sliced off at the right edge - "Argo 790..." and a
      fragment of "99[6] DEPTHS COMP..." - under a caption promising "on the right a panel
      comparing one float's measured temperature against the model's at 996 depths". And
      `scripts/dossier.html`, `docs/demo/script.md` and `docs/demo/beats.md` all said *"green is
      the instrument, dashed blue is the model"* when `styles.css` paints `--observed` teal
      (`#00666e` light, `#64d7e3` dark), `--model` grey and dashed, and the difference band pale
      red. All four now say *solid line*, *dashed line* and *the band between them*, which is
      true in both themes and survives a re-capture. **A caption that names a colour is a caption
      with a shelf life.**

- [ ] **47. Two control groups open scrolls the left panel.**
      Measured 2026-09-04 at 1366x768, where the panel starts 74 px down and has **678 px**:
      all groups closed **408 px**, Variable alone **527 px**, Variable and Colourbar together
      **722 px**, everything open **2,664 px**. The rules file used to claim "every reasonable
      working set fits", on figures (264 / 383 / 578) taken before the panel grew.

      **The numbers are corrected in `CLAUDE.md` and `web/CLAUDE.md`; the panel is not.** It
      scrolls, and it has a scroll cue at both edges that says so. **It is not the scrollbar
      gutter**: measured both ways, three open sets each, `stable both-edges` costs **no height
      at all** against `stable` - 408, 527 and 722 either way. It costs 11 px of content width,
      and buys a panel that is not lopsided.

---

## Suspected, not confirmed

- **`coverage.py`'s band calibration may be measured against a bake that is gone.**
  `pipeline/samudra/coverage.py:80-84` says *"over 695,088 ocean voxels the median is 2 casts and
  the **maximum is 10**"*, and that the 1/2/4 bands split the block 19/23/36/22.
  `manifest.fields[coverage].range` is now `[0, 14]`, so the maximum has moved. **What could not
  be checked**: the split, which needs the twelve coverage Volumes decoded and de-quantised, and
  there is no native coverage Grid in `data/grids/` to do it from honestly. The argument the
  comment supports - that thresholds of 1/3/10 would leave the top band empty - survives either
  way, which is why this is not in the list above.

- **6 of the 25 rows in `provenance.html`'s test table say nothing.** `test_collocation.py`,
  `test_coverage.py`, `test_volume.py`, `test_argo.py`, `test_depth_warp.py` and `test_grid.py`
  have no module docstring, so `collect_tests.py:55` falls back to *"Covered by this module."*
  under a column headed *"What it defends"*. Confirmed as a fact; left here because whether a
  deliberate fallback printing an empty answer counts as a defect is a judgement rather than a
  measurement.

---

## Fixed, in summary

**100 defects across four rounds.** Every measurement that was worth keeping is now in one of
four places, which is why they are not repeated here: a rule in `CLAUDE.md`, a decision record in
`docs/adr/`, a probe that fails if it comes back, or a test.

| Round | What it was | Where the detail lives |
| --- | --- | --- |
| **2026-09-03**, 51 items | The September survey. The bias map pooling assimilated floats with unassimilated buoys; the drift score measured on days the current field does not cover; casts drawn on a section they were not in; a corridor measured against a rhumb line where the drawn line is a great circle; a masked corner refusing a whole column; render hints leaking between Fields; the log scale offered where it means nothing | ADRs 0015-0017, and the rules block in `CLAUDE.md` |
| **2026-09-04**, first pass, 12 items | The isosurface sharing the haze's coverage floor and putting sheets over India; current trails coloured by the value they sit on; a capture borrowing kiosk mode; volume controls hidden on a Field that draws a volume; `getBoundingClientRect()` on a hidden panel returning zeros | New rules in `CLAUDE.md`; `probe-hazard.mjs`, `probe-guide.mjs`, `probe-bias.mjs` |
| **2026-09-04**, second pass, 8 items | Two landing cards with alt text over an empty panel; a hero unreadable on light at 1.27:1; five hazard variables that all opened the same way; a heading claiming sixteen cards over fourteen; the deck two rounds stale | `probe-landing.mjs`, and three more rules in `CLAUDE.md` |
| **2026-09-04**, third pass, 8 items | Four folders holding overlapping copies of the same pictures; a publish silently replacing thirteen dark images with light ones; pictures that did not follow the theme toggle; `probe-upload.mjs` unable to run from a clone; the deck's numbers with nothing to check them against | `assets/screenshots/` as the single source; `pipeline/scripts/collect_facts.py` and `ppt/FACTS.md` |
| **2026-09-04**, fourth pass, 21 items | **The prose sweep.** `provenance.html` printing the superseded "currents are an image" line with `undefined m` in it; two requirements links labelled *Open a float comparison* that started the guided tour; the demo script reading numbers off the screen that the screen contradicts, and claiming all three variables share a worst 5-degree box; a landing tile pairing a median RMS with a mean absolute bias under a caption saying they were the same distribution; the retired 202-float drift score; 3,718 Argo casts that are 3,077; `longitude = 46` hardcoded on the page whose banner says nothing is; **four of the thirteen probes that could not go red**; `render-dossier.mjs` writing a PDF with three broken images | `CLAUDE.md`'s Commands block, the four probes' own assertions, and the rules below |

**Three of those are worth remembering as classes rather than as bugs**, because each came back
in a new costume: *a figure typed into prose cannot be checked by anything*; *a picture published
by a map with a hole in it fails silently*; and *"cosmetic" is a claim, so measure it before
believing it*.

---

## Things that look artificial and are not

Each has been queried once, and "that looks made up" is the correct first reaction to all of them.

- **The drift pin does not move and the line does not animate.** The line is the whole trip at
  once, and it starts at the date on screen, which is why scrubbing redraws it.
- **Markers move when the bias map is switched on, and there are more of them.** A residual
  belongs to the cast it was measured at, not to the date on screen. The map key says so.
- **The worst eight rows in the bias list share two colours.** The scale saturates at the ninetieth
  percentile (0.39 degC) and all eight are past it. The real gap is on the same row.
- **Hollow ringed markers** never measured that variable. Giving them the palette's midpoint would
  claim agreement with nothing.
- **A blank column in the vertical section** is land or sea floor, one grid cell wide because
  `Grid.column_at` refuses to blend across a Masked node. It is the data, not an artefact.
- **The deepest water in Temperature vs Normal is blank.** The atlas stops at 1500 m; the analysis
  runs to 2000 m. There is no normal to depart from.
- **Mean bias is almost exactly zero on all three Fields.** That is what an assimilating analysis
  does to floats it assimilated, which is why the nine unassimilated buoys are printed separately.
- **Drift separation reaches the distance travelled by 30 days**, 99 km against 103 km. A current
  field alone stops carrying information about a particular float quickly. Saying so is the feature.

---

## Not defects, and the reasons are worth keeping

- **`drift.ts` and `section.ts` duplicate science that also lives in Python.** Deliberate, and
  the only two. Held to the pipeline by `probe-drift.mjs` and `probe-section.mjs` - median
  0.331 km over 101 days, worst gap 5.07e-5 degC over 1,102 values. ADR 0015. **Do not add a
  third without the same harness.**
- **The bias map is not AI and has no confidence score.** It is the mean and RMS of residuals the
  bake already computed.
- **The upload is the only network call the frontend can make**, and only when a user drops a
  file.
- **The WOA climatology is a baseline and never a value.** Not in the Variable selector. ADR 0016.
- **The particle layer's share of the frame is a range, not a point** (1.83% and 2.47% on one
  unchanged build). The population is seeded with `Math.random()`; the probe asserts a floor.

---

## How to check any of this

The full command list is `CLAUDE.md`'s own Commands block. The short version, with a preview
server on 4173 and the API on 8000:

```bash
cd pipeline && ../.venv/Scripts/python -m pytest -q     # 377 tests
cd web && npm run typecheck && npx vite build
cd web && for p in landing guide tour controls hazard bias particles isolate                    outreach requirements drift section upload; do node probe-$p.mjs; done
```

`probe-section` and `probe-upload` need the API; the other eleven do not. **All thirteen were
green on 2026-09-04**, along with 377 tests, the typecheck and the build.

**And all thirteen can now go red.** Four of them - `requirements`, `controls`, `hazard`,
`isolate` - used to collect what they measured, print it and exit 0 regardless, which is why
"green" meant nothing for those four and why the two requirements links that opened the guided
tour survived a run that followed them both. They assert now: `probe-requirements` derives each
link's expectation from its own query string, `probe-controls` fails on its six rules,
`probe-hazard` fails on a leaked isosurface and on a colourbar that does not bend with the
shader, and `probe-isolate` reads the clip box back in degrees and compares it with the
Feature's own. The loop above is the complete list, and so is `CLAUDE.md`'s Commands block.
