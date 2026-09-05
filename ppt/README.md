# `ppt/` - what you need to build the SIH deck

Six slides. **PS 26067** (MoES / INCOIS), theme **Disaster Management**, category **Software**,
team **Sigmoid**.

Three things in here:

| | |
| --- | --- |
| [`DECK.md`](DECK.md) | **The slide content.** What goes on each of the six slides, which screenshot goes with it, and prompts for the two diagrams if you want them. Suggested, not a script - say it better if you can. |
| [`FACTS.md`](FACTS.md) | **Every number the deck uses**, read off the build. Generated, so do not edit it. `cd pipeline && ../.venv/Scripts/python scripts/collect_facts.py` |
| [`images/`](images/) | **Sixteen screenshots of the running software.** Nothing else. |

---

## The rule about pictures

**Only screenshots go on a slide as images.** Everything else is typed as native PowerPoint text.

This deck used to carry nine "infographic boards" that were pictures of text - a table, a list of
technologies, five risk rows, rendered to PNG. They were unsearchable, uncopyable, unfixable on
the day, and a single wrong word meant re-rendering an image. They are gone. **If a thing is
words, type the words.**

The exception is a real diagram, where boxes and arrows carry an argument a list does not. There
are two of those, and `DECK.md` Part 2 has a prompt for each. Generate the *shape* only and put
the words on top yourself - no image tool spells `incois_argo_10d_VAM` correctly.

## The pictures you have

All light theme, because the SIH template is a white page. `spare-kiosk.jpg` is the exception: an
exhibition screen is dark wherever it stands.

| Placed | |
| --- | --- |
| `S1-globe.jpg` | The globe: India's EEZ with the temperature field on it, floats and drift tracks |
| `S2-app.jpg` | **The whole app.** The block, the instruments inside it, and the comparison panel with its verdict and its three numbers. The most valuable single picture here - give it 6 in of width. **1600x857, not 16:9** |
| `S4-coverage.jpg` | Observation coverage, four bands, with its key |
| `S5-anomaly.jpg` | The temperature anomaly with the automatic feature rings |

| Spare, if a slide feels bare | |
| --- | --- |
| `spare-bias.jpg` | The bias map and its ranked list. The strongest evidence picture in the set |
| `spare-hazard.jpg` | Cyclone heat potential over the Bay of Bengal. The theme in one frame |
| `spare-d26.jpg` | The 26 °C isotherm as a sheet inside the block, visibly not flat |
| `spare-flow.jpg` | The current as moving dots with trails |
| `spare-drift.jpg` | A drift pin, its track, and the panel's own caveat and score |
| `spare-section.jpg` | A vertical section with the casts near the line on the same axes |
| `spare-normal.jpg` | Departure from the 1991-2020 normal |
| `spare-explore.jpg` | The eight plain-word questions |
| `spare-kiosk.jpg` | The exhibition screen. Dark, deliberately |
| `spare-volume.jpg` | The block, no panels |
| `spare-isosurface.jpg` | An isotherm as a solid surface |
| `spare-density.jpg` | The density field |

**Never retouch one.** Cropping the browser chrome away is fine; cropping a value away is not.

To replace one: grab the frame from a real browser, then

```bash
# both from the repository root
.venv/Scripts/python scripts/normalise_screenshot.py <file.png> light <name>
cd web && node capture.mjs --publish-only --publish
```

Add `--no-crop` when the frame is wider than 16:9 and its subject is on the right: the crop keeps
the **left**, so on a shot with the comparison panel down the right-hand side it would throw the
subject away. `S2-app.jpg` and `spare-drift.jpg` are both `--no-crop`, so they are 1600x857 and
1600x669 rather than 1600x900. Place them at their own ratio; do not stretch either to 16:9.

## Before you upload

- **Exactly six slides.** Never seven.
- **The five mandated section headings, word for word.**
- **No paragraphs on a content slide.** Points, boxes, tables and images only.
- **Nothing overlapping the template's header or footer band.**
- Every image at its natural aspect ratio. A stretched picture is the most visible possible error.
- Export as PDF, open it, and check the mono type survived.

One blank: **Team ID**, `<FILL IN>` in `DECK.md`. Leave it visible until you have it.
