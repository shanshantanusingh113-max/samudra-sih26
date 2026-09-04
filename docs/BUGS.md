# Known defects and open suspicions

**Worked through 2026-09-03, revisited three times on 2026-09-04. Two items are open; 79 are
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
      guessed at it would be worse than none. What would help is narrowing the exposure - a
      caption that describes *what the variable means* survives a re-capture; one that describes
      *what this frame looks like* does not.

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

## Fixed, in summary

**79 defects across three rounds.** Every measurement that was worth keeping is now in one of
four places, which is why they are not repeated here: a rule in `CLAUDE.md`, a decision record in
`docs/adr/`, a probe that fails if it comes back, or a test.

| Round | What it was | Where the detail lives |
| --- | --- | --- |
| **2026-09-03**, 51 items | The September survey. The bias map pooling assimilated floats with unassimilated buoys; the drift score measured on days the current field does not cover; casts drawn on a section they were not in; a corridor measured against a rhumb line where the drawn line is a great circle; a masked corner refusing a whole column; render hints leaking between Fields; the log scale offered where it means nothing | ADRs 0015-0017, and the rules block in `CLAUDE.md` |
| **2026-09-04**, first pass, 12 items | The isosurface sharing the haze's coverage floor and putting sheets over India; current trails coloured by the value they sit on; a capture borrowing kiosk mode; volume controls hidden on a Field that draws a volume; `getBoundingClientRect()` on a hidden panel returning zeros | New rules in `CLAUDE.md`; `probe-hazard.mjs`, `probe-guide.mjs`, `probe-bias.mjs` |
| **2026-09-04**, second pass, 8 items | Two landing cards with alt text over an empty panel; a hero unreadable on light at 1.27:1; five hazard variables that all opened the same way; a heading claiming sixteen cards over fourteen; the deck two rounds stale | `probe-landing.mjs`, and three more rules in `CLAUDE.md` |
| **2026-09-04**, third pass, 8 items | Four folders holding overlapping copies of the same pictures; a publish silently replacing thirteen dark images with light ones; pictures that did not follow the theme toggle; `probe-upload.mjs` unable to run from a clone; the deck's numbers with nothing to check them against | `assets/screenshots/` as the single source; `pipeline/scripts/collect_facts.py` and `ppt/FACTS.md` |

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
