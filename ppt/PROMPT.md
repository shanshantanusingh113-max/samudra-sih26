# Prompt for generating the deck with an AI

Paste the text in the fenced block below into your AI tool. Attach alongside it:

1. **`SLIDES.md`** (this folder) — the exact content for every slide
2. **All images from `images/`** — or at least the eight named in the prompt
3. **The official SIH template file**, if you have the `.pptx` from the portal

If the tool cannot take file attachments, paste `SLIDES.md` inline after the prompt.

---

```
You are producing a 6-slide idea-submission deck for Smart India Hackathon 2026,
Problem Statement 26067 (Ministry of Earth Sciences / INCOIS). The project is
called Samudra 3D.

I am giving you two things: SLIDES.md, which contains the exact content and
layout for every slide, and a folder of images. Follow SLIDES.md precisely.
Do not invent facts, features, statistics or claims that are not in it — every
number in that file was measured against a working prototype, and anything you
add will be wrong.

=== HARD RULES FROM THE HOST ===
- Exactly 6 slides maximum, including the title slide. Never more.
- Use the official SIH-provided template. Do NOT design your own background,
  do NOT change the template's title styling, footer bar, logo placement or
  slide numbering.
- No paragraphs. Content must be points, boxes, diagrams and infographics.
- Keep the section headings the template mandates: IDEA TITLE, TECHNICAL
  APPROACH, FEASIBILITY AND VIABILITY, IMPACT AND BENEFITS, RESEARCH AND
  REFERENCES.
- Final output must be a PDF.

=== VISUAL STYLE ===
The slides are LIGHT (the SIH template is white with a blue footer bar). The
images I am giving you are dark. That contrast is intentional — place each dark
image inside a thin 1 pt border on the white slide. This is exactly what winning
SIH decks do with their diagrams.

Layout pattern for every content slide:
- Team name in a thin oval outline, top-left. SIH logo top-right (template).
- Centred serif ALL-CAPS title, as the template styles it.
- All content inside bordered boxes — two side by side, or a 2x2 grid. Very
  little loose text on the slide.
- Every box gets a small BOLD COLOURED LABEL HEADER above it, e.g.
  "IDEA / SOLUTION :", "Technologies to be Used:", "Feasibility:",
  "Potential challenges and risks:". Use blue #1E6FB8 or green #2E8B57.
- Every bullet uses the pattern: **Bold lead-in phrase**: short explanation.
  Never a bare sentence. The bold phrase is what a skimming judge reads.
- Maximum ~7 bullets per box.

Colours (on the template's white):
  Box border   #B8C4CE   1 pt
  Box label    #1E6FB8   blue, bold, small
  Box label 2  #2E8B57   green, for contrast between boxes
  Body text    #1B2733
  Accent       #0E6E7A   deep teal — our figures and the team badge
  Highlight    #D98324   orange — the single most important number on a slide,
                         at most two per slide
  Positive     #1E7F4F   green — "working prototype", "verified", resolved items

Type: use the template's serif for titles. Calibri or Arial for box labels and
bullets (labels bold, 14-16 pt; bullets 12-14 pt). Consolas for dataset IDs,
URLs and numbers.

Do NOT use: dark slide backgrounds, clip art, stock ocean photography, gradient
text, drop shadows on text, emoji as bullet markers, or centre-aligned body text.

=== IMAGES AND WHERE THEY GO ===
  02-volume-clean.png       Slide 1, hero, right half
  06-gap-2d-vs-3d.png       Slide 2, bottom-right box
  07-architecture.png       Slide 3, right column, upper
  08-methodology.png        Slide 3, right column, lower
  09-feasibility-risk.png   Slide 4, top, full width
  10-impact.png             Slide 5, top, full width
  04-collocation-panel.png  Slide 5, bottom-right, small
  03-globe-full.png         Slide 6, optional background at 20-25% opacity

Give every image a thin border and a one-line caption beneath in small grey
text. Never rotate, skew, drop-shadow or add a glow to an image.

Spare images, if you need to fill space or swap something out:
  11-isosurface.png   the 20 C isotherm surface
  12-watermass.png    colourbar narrowed to isolate one water mass
  13-salinity.png     salinity field, haline palette
  01-volume-full.png / 05-collocation-full.png   full UI screenshots

=== TWO THINGS TO GET RIGHT ===
1. On Slide 3 there is a "Product Status" strip. Reproduce it prominently and
   set the words "working prototype" in the positive green. Most submissions at
   this stage are concepts; ours runs. That line is the deck's strongest claim.
2. Slide 1 has two blanks: Team ID and Team Name. Leave them as clearly visible
   placeholders — do not invent values.

=== TONE ===
Plain language that a non-technical judge can follow, with technical proof
carried by the diagrams rather than by jargon in the text. Specific over clever.
Every claim in SLIDES.md is verifiable against the build; keep them exactly as
written rather than making them sound grander.

Now produce the 6 slides.
```

---

## If you are building it by hand instead

Ignore the block above and work straight from `SLIDES.md` — it has the same
information organised for a human. The art-direction section at the top of that
file is the part to read before you place anything.

## Checklist before uploading

- [ ] Exactly 6 slides
- [ ] Team ID and Team Name filled in on slide 1
- [ ] Official SIH template intact — footer bar, logo, slide numbers
- [ ] Every image has a border and a caption
- [ ] No paragraphs anywhere; every bullet has a bold lead-in
- [ ] "Product Status: working prototype" is on slide 3 and legible
- [ ] Exported as **PDF** (the portal rejects .pptx and .docx)
- [ ] Dataset IDs still render in a monospaced font after export
