"""Retarget the deck: dark native slides, screenshots as the only pasted images."""

from pathlib import Path

ART = '''# ART DIRECTION

## The one decision that shapes everything

**The slides are dark, and all text is native slide text - never text inside a picture.**

Boards `06`-`10` in `images/` are *design references*, not assets to paste. They show exactly
what each slide should look like; rebuild them as real boxes and real text in PowerPoint. Text
baked into an image cannot be edited, softens under PDF compression, and blurs on a projector.

The only images that get **pasted** are the ones that genuinely cannot be recreated as text:
screenshots of the running software.

> **On the host's "use the provided template" rule.** It says you may not change the *idea
> details pointers* - the mandated section headings. Keep every one of them exactly:
> IDEA TITLE, TECHNICAL APPROACH, FEASIBILITY AND VIABILITY, IMPACT AND BENEFITS,
> RESEARCH AND REFERENCES, and the title-slide fields. Several past winning decks used
> custom visual designs while keeping those headings intact. If your team would rather not
> take that latitude, the same content works on the plain template - set the boxes on white,
> swap the body text to `#1B2733`, and keep the screenshots exactly as they are.

## Palette

| Role | Hex | Use |
| --- | --- | --- |
| Slide ground | `#071420` | Every slide. Deep blue-black, never pure black |
| Box fill | `#0C1F2E` | Content boxes |
| Box fill (emphasis) | `#102737` | The one box you want read first |
| Box border | `#4A6B80` | 1 pt, all boxes |
| Heading text | `#E4EEF6` | Slide titles, box titles |
| Body text | `#B9CDDC` | Bullets |
| Muted | `#6D8598` | Captions, units, footnotes |
| **Cyan - accent** | `#3FB8C4` | Box labels, arrows, diagram lines, rules |
| **Amber - highlight** | `#F5B841` | The single most important number on a slide. Max 2 |
| Coral - problem | `#F2765F` | "Today", risks, the residual |
| Green - resolved | `#5FD68A` | "Working prototype", "solved", verified |

Cyan is the accent. Amber marks the one number that matters. Coral only ever marks a problem,
green only ever marks something resolved. Never decorate with them.

## Type

| Role | Font | Setting |
| --- | --- | --- |
| Slide title | Chivo Black, or Arial Black | 34-40 pt, ALL CAPS, letter-spacing −2% |
| Box label | Consolas Bold | 11-12 pt, ALL CAPS, +12% tracking, cyan |
| Box heading | Chivo Bold / Arial Bold | 16-18 pt |
| Bullets | Calibri or Arial | 13-15 pt, line spacing 1.4 |
| Bold lead-in | same, **bold**, heading colour | the phrase before each colon |
| Figures, IDs, URLs | Consolas | 11-12 pt |

Chivo is free from Google Fonts. If you cannot install it, Arial Black + Calibri + Consolas
gives the same structure.

## Layout rules

- **6 slides maximum, including the title.** Hard limit from the host.
- Everything sits in a bordered box - two side by side, or a 2×2 grid. Very little loose text.
- **Every box gets a small cyan ALL-CAPS label above it**: `IDEA / SOLUTION`,
  `TECHNOLOGIES TO BE USED`, `FEASIBILITY`, `POTENTIAL CHALLENGES AND RISKS`, and so on.
- **Every bullet is "bold lead-in: short explanation."** Never a bare sentence - the bold
  phrase is what a skimming judge actually reads.
- Maximum ~6 bullets per box.
- Screenshots get a 1 pt `#4A6B80` border and a one-line muted caption beneath.
- Consistent 40 px margins. Slide number bottom-right in Consolas, muted.

## Diagrams must be drawn, not described

Two slides carry real diagrams, and both must be **drawn as shapes and connectors on the
slide**, not written as bullet lists:

- **Architecture (Slide 3)** - a genuine left-to-right flow: source boxes → adapter box →
  Grid/Volume boxes → output boxes, joined by cyan arrows, with the adapter seam called out.
  Use `images/07-architecture.png` as the exact reference for structure, wording and colour.
- **Methodology (Slide 3)** - five numbered stages left to right with connectors between them.
  Reference: `images/08-methodology.png`.

Where space allows, put a **small monochrome icon beside each technology** in the stack list
(Python, FastAPI, React, TypeScript, Three.js/WebGL, NetCDF, pytest). Tint them cyan so they
read as one set. Skip them entirely rather than cramming - a clean list beats a crowded one.

## What to avoid

Text baked into images. Clip art. Stock ocean photography. Gradient text. Drop shadows.
Bare sentences with no bold lead-in. Rotated or skewed screenshots. More than two accent
colours on one slide. Emoji as bullet markers.

---

'''

INVENTORY = '''## Image inventory

**Paste these** - real screenshots of the running software, which is what makes the deck
credible. They cannot be recreated as text.

| File | What it shows | Use on |
| --- | --- | --- |
| `02-volume-clean.png` | The water column, no UI panels | **Slide 1 hero** |
| `01-volume-full.png` | Full application with all controls visible | **Slide 3** - proves it is a real app |
| `03-globe-full.png` | Globe, EEZ temperature field, 88 floats | **Slide 2** |
| `04-collocation-panel.png` | The comparison chart and its statistics | **Slide 5 evidence** |
| `11-isosurface.png` | The 20 °C isotherm surface | **Slide 2 or 4** |
| `12-watermass.png` | Colourbar narrowed to isolate one water mass | **Slide 2 or 5** - visually the strongest |
| `13-salinity.png` | Salinity field, haline palette | **Slide 3** - shows multi-variable support |
| `05-collocation-full.png` | Float selected, plumb line through the volume | Spare |

**Rebuild these as native slide content** - they are layout references, not assets:

| File | Rebuild as |
| --- | --- |
| `06-gap-2d-vs-3d.png` | Two side-by-side boxes, "Today" vs "Samudra 3D" |
| `07-architecture.png` | A drawn flow diagram with shapes and connectors |
| `08-methodology.png` | Five connected stage boxes plus a proof-point row |
| `09-feasibility-risk.png` | A native table: Risk / What happened / Resolution / State |
| `10-impact.png` | Four audience boxes plus before→after rows |
'''

path = Path(__file__).resolve().parent.parent / "ppt" / "SLIDES.md"
text = path.read_text(encoding="utf-8")
text = text[: text.index("# ART DIRECTION")] + ART + text[text.index("# SLIDE 1 - TITLE") :]
text = text[: text.index("## Image inventory")] + INVENTORY
path.write_text(text, encoding="utf-8")
print("SLIDES.md retargeted to dark native slides")
