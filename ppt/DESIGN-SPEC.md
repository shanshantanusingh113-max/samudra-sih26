# Samudra 3D - SIH 2026 idea deck: the design specification

**This file describes exactly what the deck and every picture in it must look like.**
It is written so that a person, or an AI given only this file and `DECK.md`, can build the deck
without asking a single follow-up question.

`DECK.md` is the other half: the exact words for each slide, and the exact prompt for each
picture. Read this file for **how it looks**, read `DECK.md` for **what it says**.

- **Team:** Sigmoid &middot; Team ID `<FILL IN>`
- **Problem Statement:** 26067, Ministry of Earth Sciences / INCOIS
- **Theme:** Disaster Management &middot; **Category:** Software
- **Live prototype:** https://rak2315.github.io/samudra-sih26/
- **Repository:** https://github.com/RAK2315/samudra-sih26

---

## 1. The rules that cannot be broken

These come from the SIH portal itself. Breaking any one of them can get the submission rejected
before anybody reads it.

| Rule | What it means here |
| --- | --- |
| **Six slides maximum, including the title slide** | Six. Not seven with an appendix. Not six plus a backup. |
| **Use only the provided template. Do not change the idea-detail pointers** | The white body, the header band, the footer band and the section headings stay exactly as the template ships them. We add content inside the body area and nowhere else. |
| **Avoid paragraphs. Use points, diagrams, infographics, pictures** | This is why most of this deck is rendered infographics rather than bullet lists. |
| **Precise and easy to understand** | Short sentences. One idea each. A number wherever one exists. |
| **The idea must be unique and novel** | Slide 2 carries four specific differentiators, each with a measured number attached. |
| **Save as PDF and upload the PDF** | The portal takes nothing else. Not .pptx, not .docx. |

### The mandated section headings, word for word

Keep the template's own headings. Do not reword them, do not translate them, do not shorten them.

1. *(title slide, the template's own field table)*
2. **Proposed Solution (Describe your Idea/Solution/Prototype)** - covering: detailed explanation
   of the proposed solution; how it addresses the problem; innovation and uniqueness of the
   solution
3. **TECHNICAL APPROACH** - covering: technologies to be used; methodology and process for
   implementation (flow charts / images / working prototype)
4. **FEASIBILITY AND VIABILITY** - covering: analysis of the feasibility of the idea; potential
   challenges and risks; strategies for overcoming these challenges
5. **IMPACT AND BENEFITS** - covering: potential impact on the target audience; benefits of the
   solution (social, economic, environmental, etc.)
6. **RESEARCH AND REFERENCES** - covering: details and links of the reference and research work

---

## 2. What the judges are actually doing

Researched, not assumed. Sources are listed at the end of this section.

- **Screening is fast.** Evaluators move through decks in minutes, so the first thing a slide
  does has to be the most important thing on it.
- **They score innovation, feasibility and impact.** In that order of prominence, and feasibility
  is where most decks are weakest because most decks are describing something that does not
  exist yet.
- **They ask deployment questions.** Cost to run, who hosts it, does the team understand their
  own numbers, what happens at scale.
- **Visual beats verbal.** Charts, flow diagrams and infographics are explicitly encouraged by the
  submission instructions and by every finalist write-up.
- **The two failure modes that sink decks:** paragraphs of text, and a list of twenty features
  standing in for a strategy.

### What that means for this specific deck

We have an unusual advantage and the deck must spend it: **the thing is built, public and
measured.** Most idea-stage submissions are a concept. So:

- Every claim on every slide carries a number that was measured against the running build.
- Slide 4 is written in the past tense. It is a record of risks that were hit and resolved, not
  a forecast of risks that might occur.
- The live URL appears on the title slide and again on slide 3.
- The word **"working prototype"** appears once, in green, where the eye lands on slide 3.

Sources: [SIH PPT round guide](https://www.scribd.com/document/899483721/Smart-India-Hackathon-SIH-PPT-Round-a-Complete-Guide-1) &middot;
[SIH 2025 template and structure guide](https://www.lets-code.co.in/blogs/sih-2025-complete-guide-ppt-template/) &middot;
[SIH winners guide](https://apnijanta.com/trending/sih-winners-guide.html) &middot;
[Preparation and judging criteria](https://www.placementpreparation.io/blog/smart-india-hackathon-guide/)

---

## 3. The story the six slides tell

Every slide has one job. If a slide is doing two jobs, something is on the wrong slide.

| Slide | The question it answers | The one thing it must land |
| --- | --- | --- |
| 1 | Who are you and what problem | The live URL. A judge can open the thing during the pitch. |
| 2 | What is it, and why is it different | Model and measurement in one 3D picture, with the disagreement as a number. |
| 3 | How does it work | Five open sources, one adapter seam, and the Grid/Volume split. |
| 4 | Can it actually work | It already does. Here are five risks we hit, measured, and resolved. |
| 5 | Who benefits and by how much | Five existing INCOIS mandates, and what changes for each. |
| 6 | Is any of this real | Named datasets with endpoints, standards, DOIs, and a live provenance page. |

**The single sentence the whole deck is built to deliver:**

> INCOIS's own ocean model and the floats measured in the same water, in one browser tab, in 3D,
> with the gap between them measured in degrees.

---

## 4. The canvas

### Slide size

16:9, **13.333 in x 7.5 in** (33.87 cm x 19.05 cm). This is the PowerPoint "Widescreen" default
and what the SIH template ships as.

### The safe body area

The template puts a band at the top (the SIH logos and the slide title) and a band at the bottom
(the "SMART INDIA HACKATHON 2026" strip). **Nothing we add may touch either band.**

```
0                                                          13.333 in
+-----------------------------------------------------------+ 0
|  [SIH logo]        SLIDE TITLE            [team/PS logo]   |
+-----------------------------------------------------------+ ~1.05 in
|                                                           |
|   <-------------- SAFE BODY AREA: 12.4 x 5.4 in ------->  |
|   left margin 0.47 in                right margin 0.47 in |
|                                                           |
+-----------------------------------------------------------+ ~6.45 in
|              SMART INDIA HACKATHON 2026                   |
+-----------------------------------------------------------+ 7.5 in
```

**Measure the real template once before you place anything.** Open the provided .pptx, click the
footer band, and read its top edge off the Size panel. If the body area turns out taller than
5.4 in, everything below still works: the images are specified by aspect ratio, so they scale.

### The grid

A **12-column grid** across the 12.4 in body area. One column is 0.94 in, one gutter is 0.16 in.
Everything snaps to it. The layouts used in this deck are:

| Split | Columns | Inches | Used on |
| --- | --- | --- | --- |
| Third / two-thirds | 4 / 8 | 3.85 / 8.30 | Slide 4 |
| Two-fifths / three-fifths | 5 / 7 | 4.85 / 7.30 | Slide 2 |
| Quarter / three-quarters | 3 / 9 | 2.95 / 9.20 | Slide 3 |
| Half / half | 6 / 6 | 6.10 / 6.10 | Slide 5, slide 6 |

Vertical gutter between stacked blocks: **0.16 in**. Never less.

---

## 5. Palette

The template is white. Our app is dark. The deck resolves that by staying light and letting the
dark screenshots be the only dark objects on the page - which makes them read as windows into
the software rather than as decoration.

| Role | Hex | Where it is allowed |
| --- | --- | --- |
| Paper | `#FFFFFF` | The slide body. Never tint it. |
| Panel fill | `#F3F8FB` | Inside every box. A whisper of blue, not a colour. |
| Panel fill, emphasis | `#E8F1F6` | The one box on a slide that matters most. |
| Border | `#CBDCE6` | 1 pt, every box. |
| Border, emphasis | `#8FBACD` | 1.5 pt, the core boxes in the architecture only. |
| Ink | `#0E1B26` | Headings, bold lead-ins. |
| Body | `#33505F` | Sentences. |
| Faint | `#6E8898` | Captions, mono labels, source lines. |
| **Teal** | `#0B6E7F` | The primary accent. Section labels, rules, step numbers, arrows. |
| Cyan | `#1291A6` | The board sub-line only. Never body text. |
| **Amber** | `#B26A0C` | The single most important number on a slide. **Maximum two per slide.** |
| Coral | `#BE3B26` | Problems and risks only. Never anything positive. |
| Green | `#12704A` | Solved, verified, "working prototype". Never anything unresolved. |
| Risk tint | `#FDF2F0` | The left half of a risk row. |
| Resolved tint | `#F1F8F4` | The right half of a risk row. |
| Amber tint | `#FDF6EA` | The closing line of a board. |

**Why these are darker than the app's own colours.** The app uses `#3FB8C4` cyan and `#F5B841`
amber on a near-black ground. Those same values on white fail contrast and vanish on a projector
with the lights up. Every colour above clears WCAG AA against white.

**Never introduce a colour that is not in this table.** Not for a new icon, not for a highlight,
not because a stock graphic came with one.

---

## 6. Type

| Role | Font | Size | Setting |
| --- | --- | --- | --- |
| Slide title | Chivo Black, or Arial Black | 28-32 pt | ALL CAPS, `#0E1B26`, letter-spacing -1% |
| Board title (inside an image) | Chivo Black | 20 px at render scale | ALL CAPS |
| Section label | IBM Plex Mono Medium, or Consolas | 10-11 pt | ALL CAPS, letter-spacing 9%, teal |
| Box heading | Chivo Bold, or Arial Bold | 14-15 pt | Sentence case |
| Body | Chivo Regular, or Calibri | 11-13 pt | Line spacing 1.5 |
| Caption under a screenshot | Chivo Regular | 9-10 pt | `#6E8898`, one line |
| Numbers, dataset IDs, URLs | IBM Plex Mono | 10-12 pt | Never in a proportional font |

The two typefaces are in the repository at `web/public/fonts/` (Chivo and IBM Plex Mono, both
open licence). The rendered boards already use them. **If PowerPoint does not have Chivo
installed, use Arial** - the boards are images and keep their own type, so only the native slide
text changes, and Arial next to Chivo is close enough not to jar.

**Minimum size anywhere on a slide: 10 pt.** If text has to go below that, the slide has too much
on it and something must be cut.

---

## 7. Component recipes

Build these once as PowerPoint shapes and copy them. Consistency is most of what makes a deck
look professional.

### The box

Rounded rectangle, corner radius 0.06 in. Fill `#F3F8FB`. Line `#CBDCE6`, 1 pt. Inner margin
0.13 in all round. **No shadow. No gradient. No 3D effect.** A shadow on a white slide reads as
a 2009 template.

### The section label

A mono ALL-CAPS line in teal, 10 pt, sitting **above** its box with 0.06 in of clearance.
Example: `THE PROBLEM` / `WHAT WE BUILT` / `WHAT IS NEW`.

### The screenshot frame

1 pt `#CBDCE6` border, no radius, no shadow. A one-line caption directly beneath in
`#6E8898`, 9 pt. **Every screenshot gets a caption and the caption says what you are looking
at**, not what the feature is called.

### The number callout

The figure in IBM Plex Mono Medium, amber `#B26A0C`, 20-28 pt. Its label beneath in mono, 9 pt,
`#6E8898`, ALL CAPS. Two per slide at most: a third one means none of them is the important one.

### The status pill

A rounded rectangle with a 1.5 pt `#12704A` border and `#EAF6F0` fill. Text in `#12704A`, bold.
Used exactly once in the deck, on slide 3, for **"Working prototype, on live INCOIS data."**

---

## 8. Pictures: the three classes, and which tool makes each

This is the most important section in the file. Getting it wrong is how decks lose credibility.

### Class A - Rendered infographics. **Nine of them. Already made.**

`ppt/images/S*.png`. Drawn as HTML in `scripts/ppt_diagrams.html` and rendered to PNG at 2x by
`web/render-diagrams.mjs` through a real browser.

**These are rendered rather than generated for one reason: every label in them is a fact.** An
image model cannot spell `incois_argo_10d_VAM`, cannot be trusted to put "0.72 °C" in the box
that is about the temperature gap, and will happily draw an arrow from the wrong node. A diagram
with a wrong label in it is worse than no diagram, because it tells a judge that nobody checked.

To change one: edit `scripts/ppt_diagrams.html`, then

```bash
cd web && node render-diagrams.mjs
```

`DECK.md` also carries a Gemini prompt for each of these, so you can generate an alternative and
compare. **If you use a generated one, delete every word from inside it and re-add the text as
native PowerPoint text boxes on top.** No exceptions.

### Class B - Screenshots of the running software. **Seven of them. Already made.**

`ppt/images/S1-globe.jpg`, `S2-app.jpg`, `S4-coverage.jpg`, `S5-anomaly.jpg`, and three spares.

These are the deck's proof and they cannot be faked, generated or recreated. Regenerate them
with a preview server running:

```bash
cd web && npx vite preview   # then, in another terminal
cd web && node capture.mjs
```

**Never retouch a screenshot.** Not the numbers, not the colours, not to hide a control you do
not like. Cropping to remove the browser chrome is fine; cropping to remove a value is not.

### Class C - Generated decoration. **Zero of them, and that is deliberate.**

There is no stock photo of a wave, no glowing globe, no AI-rendered ocean in this deck. Every
picture is either a diagram of the real architecture or a photograph of the real software. That
is itself an argument: this team had real screenshots and did not need mood imagery.

If you decide you want one anyway, the only defensible place is a small watermark-weight
background on the title slide, and `DECK.md` carries a prompt for it. Keep it under 8% opacity
and behind everything.

### Rules for any generated image, if you use one

1. **No text inside it. Ever.** Not a label, not a number, not a heading, not a watermark.
2. No people. No faces. No hands. No flags. No maps of India with borders on them.
3. No logos, real or invented. Nothing that could read as an INCOIS or MoES mark.
4. Match the palette above or convert the result to a single-hue teal wash.
5. Aspect ratio stated up front in the prompt, then re-cropped by hand to the exact box.

---

## 9. The nine rendered boards, one by one

Every board is described here as it actually is, so that a person who never opens the PNG can
tell whether the one they are looking at is the right one. Dimensions are the CSS pixels the
board is authored at; the PNG is exactly twice that.

---

### `S2-gapmap.png` &middot; 620 x 757 px &middot; **portrait, ratio 0.82**

**Goes:** slide 2, left column, 4.85 in wide by 5.35 in tall.

A vertical stack of five identical cards on white. Each card is a rounded panel filled
`#F3F8FB` with a 1 pt border and a **3 pt coral left edge**, and holds three things stacked:

1. A mono ALL-CAPS coral label, `GAP 1` through `GAP 5`.
2. The gap **in the problem statement's own words**, in quotation marks, `#33505F`, 13 px.
3. Beneath it, indented behind a **green right-arrow**, what we built, in ink, with the key
   figure set in amber mono.

The coral edge and the green arrow are the whole idea of the picture: a judge scanning it sees a
column of red problems each answered by a green arrow, without reading a word.

Above the stack: the title `THE FIVE GAPS PS 26067 NAMES` in black caps, and a cyan mono sub-line
`THEIR WORDS, THEN WHAT IS BUILT AND RUNNING`.

---

### `S2-uniqueness.png` &middot; 1220 x 391 px &middot; **wide ribbon, ratio 3.12**

**Goes:** optional. Use it only if you drop the native "Innovation and uniqueness" text box on
slide 2 and give the ribbon the full 12.4 in width instead.

Four equal cards side by side, each with a **3 pt teal top edge**. Each card holds a small teal
mono kicker (`01 · QUANTIFIED`, `02 · HONEST`, `03 · AUTOMATIC`, `04 · DISCIPLINED`), a bold
15 px headline, and three or four lines of body with the numbers in bold.

Beneath the four, a full-width amber-edged strip on `#FDF6EA` carrying the "and it refuses to
invent" line. That strip is the most quoted sentence in the deck and it should not be cut.

---

### `S3-architecture.png` &middot; 1700 x 625 px &middot; **wide, ratio 2.72**

**Goes:** slide 3, right column, 9.2 in wide by 3.38 in tall.

The centrepiece of the deck. Four labelled zones left to right, separated by three large
`&rarr;` arrows in `#8FBACD`, each zone under a mono header rule reading
`ZONE 1  SOURCES · OPEN, ANONYMOUS, DATED` and so on.

| Zone | Cards | Edge colour |
| --- | --- | --- |
| 1 Sources | 5: INCOIS ERDDAP, Argo GDAC Ifremer, Argo BGC synthetic, NOAA OSMC real-time, Copernicus Marine | 3 pt amber left edge |
| 2 Adapter seam | 4: GridSource/ProfileSource, column layout as data, two layers of QC, land masked | 1.5 pt full border in `#8FBACD`, fill `#E8F1F6` |
| 3 Two representations | 2: **GRID** (green edge, green-tinted fill) and **VOLUME** (cyan edge) | see left |
| 4 Delivery | 4: Browser, REST API, Open standards, Static bake | 3 pt teal left edge |

Each card has three lines: a bold name, a mono technical identifier in faint grey (the real
dataset ID, the real file path, the real byte count), and a plain-English sentence in body grey.

**The visual argument is the zone-3 split.** GRID is the only green-tinted object in the picture
and VOLUME is the only cyan one, and every zone-4 card names which of the two it draws from.

Under the whole diagram, a full-width green-edged strip on `#F1F8F4`: *"The rule that governs all
of it. Every number a human or a machine reads comes from the Grid. The Volume is only ever a
picture."*

---

### `S3-stack.png` &middot; 460 x 679 px &middot; **portrait, ratio 0.68**

**Goes:** slide 3, left column, 2.95 in wide by 4.35 in tall.

Five stacked panels, each a teal mono ALL-CAPS group label over a single line of
middot-separated technology names in ink. The groups are: Data and science; Backend; Frontend;
Open standards spoken; Quality and delivery. The standards group marks each entry `(read)`,
`(served)` or `(read and served)` in faint grey, which is the honest distinction and one a judge
who knows the domain will look for.

Closing amber-edged strip: *"No paid service, no API key, no login, no GPU cluster."*

**Do not add logos.** A row of framework logos looks like every other deck and says less than the
words do. If you want them anyway, they must all be the same single teal, all the same height as
a capital letter, and any that crowd the column get dropped rather than shrunk.

---

### `S3-methodology.png` &middot; 1700 x 315 px &middot; **very wide, ratio 5.40**

**Goes:** slide 3, right column, under the architecture. 9.2 in wide by 1.70 in tall.

A five-step chevron ribbon: five equal panels butted together, each with a rotated square notch
on its right edge so the row reads as arrows pointing right. Each panel holds a large faint mono
step number (`01`-`05`), an ALL-CAPS bold stage name, and two or three lines of body.

Stages: **Fetch &rarr; Check &rarr; Derive &rarr; Bake &rarr; Render and compare.**

Beneath the ribbon, a green-bordered four-cell status strip. The first cell is filled `#EAF6F0`
and reads **"Working prototype, on live INCOIS data"** in green bold. The other three carry the
public URL, `230` tests passing, and `0` network calls at demo time, each under a mono caption.

**That first green cell is the single most important object on slide 3.** Most submissions at
this stage are concepts.

---

### `S4-feasibility.png` &middot; 540 x 724 px &middot; **portrait, ratio 0.75**

**Goes:** slide 4, left column, 3.85 in wide by 5.15 in tall.

Three stacked boxes, each with a **3 pt teal top edge**, a bold heading, a teal mono sub-label,
and exactly three bullets. The headings are deliberately conversational because the sub-labels
carry the formal word:

| Heading | Sub-label |
| --- | --- |
| It already runs | TECHNICAL |
| It costs nothing to keep | VIABILITY |
| INCOIS can host it | DEPLOYMENT |

Every bullet opens with a bold lead-in and then one short sentence of evidence. No bullet is
longer than two lines.

---

### `S4-risks.png` &middot; 1120 x 702 px &middot; **landscape, ratio 1.60**

**Goes:** slide 4, right column, 8.30 in wide by 5.19 in tall.

Five rows. Each row is four things across:

1. A solid **teal square** with the row number in white mono, radius on the left corners only.
2. The **risk**, on a `#FDF2F0` pink-tinted panel, with a coral mono kicker
   (`RISK · THE DATA DISAPPEARS`) over a bold lead-in and one sentence.
3. A green **&rarr;** on white, between the halves.
4. The **resolution**, on a `#F1F8F4` green-tinted panel, with a green mono `RESOLVED` kicker
   over a bold lead-in and one sentence carrying the measurement.

Under the five rows, an amber-edged strip: *"Every risk above was met during the build and
resolved... This is a record, not a forecast."*

The reason this is a picture rather than a table is the **colour block**: five red panels each
answered by a green one, readable in half a second from the back of the room.

---

### `S5-audience.png` &middot; 660 x 636 px &middot; **near-square, ratio 1.04**

**Goes:** slide 5, left column, 6.10 in wide by 5.20 in tall.

A hub over five spokes. The hub is a single wide box with a 1.5 pt teal border and `#E8F1F6`
fill: **"INCOIS · Ocean Valley, Hyderabad"** in teal, with *"Ministry of Earth Sciences. One tab
instead of three programs."* beneath.

Under it, five rows. Each row is a **solid teal number tile** (`01`-`05`) flush against a panel
holding a bold audience name and two or three lines saying what specifically changes for them.

The audiences, in this order, because the theme is Disaster Management:

1. Cyclone and hazard forecasters
2. Search and rescue
3. Fisheries advisories
4. Climate and ocean-state monitoring
5. Students, the public, and policy

---

### `S5-benefits.png` &middot; 760 x 590 px &middot; **landscape, ratio 1.29**

**Goes:** slide 5, right column, 6.10 in wide by 4.74 in tall.

Three stacked cards, distinguished only by the colour of a **4 pt left edge**: teal for **SOCIAL**,
amber for **ECONOMIC**, green for **ENVIRONMENTAL**. Each carries a mono kicker in its own colour
and one dense paragraph with the figures in bold.

Beneath them, an amber-bordered box on `#FDF6EA` holding the deck's headline result:

> What changes for the person doing the work: **"the model looks off"** becomes
> **0.72 °C warm across 522 depths, RMS 1.72 °C** - Argo 1902681, its 11 July 2026 cast against
> the 10 July analysis.

---

## 10. The seven screenshots

All are 1200 x 675 (16:9), taken from the live build on 27 August 2026.

| File | What it shows | Where |
| --- | --- | --- |
| `S1-globe.jpg` | The globe view: India's EEZ with the temperature field draped on it, float markers and drift tracks | Slide 1, small, right |
| **`S2-app.jpg`** | **The whole app.** The ray-marched water column, floats on top, the control panel left, and the comparison chart right showing 522 / -0.72 / 1.72 | **Slide 2, hero** |
| `S4-coverage.jpg` | Observation Coverage: the block coloured by how many Argo casts stand behind each point, with the four-step key | Slide 4, optional inset |
| `S5-anomaly.jpg` | The Temperature Anomaly field with the anomaly-feature rings marked on the water | Slide 5, optional |
| `spare-volume.jpg` | The volume with no comparison panel open, cleanest view of the block | Spare |
| `spare-isosurface.jpg` | The 20 °C isotherm drawn as a solid surface | Spare, good for the cyclone point |
| `spare-density.jpg` | The density field | Spare |

**`S2-app.jpg` is the most valuable single asset in this project.** It shows, in one frame, the
3D model field, the in-situ instruments inside it, and the quantified comparison. That is the
entire problem statement answered in a picture. Give it room; do not shrink it below 6 in wide.

### Cropping

The screenshots are 16:9 and most slots are wider than that. Crop from the **top**: the app's
title bar is the least informative band in the frame. Never crop the bottom - the source
attribution strip along the bottom edge names INCOIS, Argo, NOAA and Copernicus, and a judge
noticing it is worth more than the pixels cost.

---

## 11. Assembly order

Do it in this order. Each step is quick and each catches an error the next step would bake in.

1. Open the provided template. **Measure the safe body area.** Write the number down.
2. Fill the title slide's field table. Team ID, Team Name `Sigmoid`, Theme `Disaster Management`,
   Category `Software`, PS ID `26067`.
3. Place the images first, on all five content slides, sized by the ratios in section 9.
4. Add the native text around them, from `DECK.md`.
5. Check every image is at 100% of its natural aspect ratio. **A stretched diagram is the most
   visible possible error and PowerPoint makes it easy to do by accident.** Right-click, Size,
   confirm the height and width scale percentages match.
6. Turn off the projector, stand back three metres from the screen, and read each slide. Anything
   you cannot read is too small and has to be cut, not shrunk further.
7. Export to PDF at high quality.
8. Open the PDF and check the mono type survived. The dataset IDs (`incois_argo_10d_VAM`) are the
   giveaway: if they render in a proportional font, the export dropped IBM Plex Mono.

---

## 12. Pre-upload checklist

- [ ] Exactly six slides
- [ ] Team ID filled in (this is the only blank in the whole deck)
- [ ] Team name reads **Sigmoid**, theme reads **Disaster Management**, category reads **Software**
- [ ] Problem Statement ID reads **26067** and the title matches the portal word for word
- [ ] All five mandated section headings present and unchanged
- [ ] No paragraph anywhere on a content slide
- [ ] Every image at its natural aspect ratio, none stretched
- [ ] Every screenshot has a one-line caption
- [ ] No text baked into any *generated* image (rendered boards are fine)
- [ ] The live URL is on slide 1 and slide 3
- [ ] "Working prototype" appears once, in green, on slide 3
- [ ] Every DOI and every URL on slide 6 clicked and confirmed to resolve
- [ ] Nothing overlaps the template's header or footer band
- [ ] Exported as **PDF**, and the PDF opened and checked

---

## 13. Prompt to hand another AI

Paste the block below into NotebookLM, Gemini or any deck-building tool, and attach this file,
`DECK.md`, and the `images/` folder.

```
You are producing a six-slide idea-submission deck for Smart India Hackathon 2026,
Problem Statement 26067 (Ministry of Earth Sciences / INCOIS), theme Disaster
Management, for team Sigmoid. The project is Samudra 3D, a browser-based 3D ocean
visualisation platform that is already built, public and measured.

I am giving you two files and a folder of images:
  DESIGN-SPEC.md  - how the deck and every picture must look
  DECK.md         - the exact words for each slide and where each image goes
  images/         - nine rendered infographics and seven screenshots

Follow both files precisely. Do not invent facts, features, figures or references.
Every number in DECK.md was measured against a running build; anything you add will
be wrong, and a wrong number on this deck costs more than a missing one.

HARD RULES
- Exactly 6 slides including the title. Never 7.
- Use the provided SIH template unchanged: white body, its header band, its footer
  band, its section headings word for word.
- No paragraphs on a content slide. Points, boxes, diagrams and images only.
- Nothing may overlap the template's header or footer band.
- Final output is a PDF.

IMAGES
- The files in images/ are finished assets. Place them, do not redraw them.
- Every image goes in at its natural aspect ratio. Never stretch one to fill a box.
- images/S2-app.jpg is the most important picture in the deck. Give it at least
  6 inches of width on slide 2.
- If you generate any image of your own, it must contain no text of any kind.

TEXT
- Slide titles, the title-slide field table, and any caption are native slide text.
- The rendered boards already contain their own text; do not retype it beside them.
- Keep every sentence from DECK.md as written. They are short on purpose and each
  one has been checked against the build.

THE THING TO GET RIGHT
Most submissions at this stage describe something that does not exist. This one runs
at https://rak2315.github.io/samudra-sih26/ on live INCOIS data, with 230 automated
tests. Slide 3 carries a green "Working prototype, on live INCOIS data" status cell.
Make it prominent. That, and the live URL, are what separate this deck from the pile.

Now produce the six slides.
```

---

## 14. If you have to cut

Space runs out on slide 3 first, then slide 2. Cut in this order and stop as soon as it fits:

1. `S3-stack.png` &rarr; retype as four short native lines. The architecture diagram is slide 3's
   argument; the technology list is not.
2. The optional insets: `S4-coverage.jpg`, `S5-anomaly.jpg`.
3. `S1-globe.jpg`. The title slide is fine as a field table.
4. The fifth bullet of anything. Four is the limit; a fifth means the box is doing two jobs.

**Never cut:** `S2-app.jpg`, `S3-architecture.png`, `S4-risks.png`, the green status cell, or the
live URL.
