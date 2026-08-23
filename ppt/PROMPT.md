# Prompt for generating the deck with an AI

Paste the fenced block below into your AI tool. Attach alongside it:

1. **`SLIDES.md`** (this folder) - the exact content for every slide
2. **The images from `images/`** - the screenshots to paste, and boards `06`-`10` as
   *design references* for slides the AI should draw natively

If the tool cannot take attachments, paste `SLIDES.md` inline after the prompt.

---

```
You are producing a 6-slide idea-submission deck for Smart India Hackathon 2026,
Problem Statement 26067 (Ministry of Earth Sciences / INCOIS). The project is
Samudra 3D - a browser-based 3D ocean visualisation platform.

I am giving you SLIDES.md, which holds the exact content and layout for every
slide, plus a folder of images. Follow SLIDES.md precisely. Do not invent facts,
features or statistics. Every number in that file was measured against a working
prototype; anything you add will be wrong.

=== HARD RULES ===
- Exactly 6 slides including the title. Never more.
- Keep the mandated section headings word for word: IDEA TITLE, TECHNICAL
  APPROACH, FEASIBILITY AND VIABILITY, IMPACT AND BENEFITS, RESEARCH AND
  REFERENCES, plus the title-slide fields.
- No paragraphs. Points, boxes and diagrams only.
- Final output is a PDF.

=== THE MOST IMPORTANT INSTRUCTION ===
ALL TEXT MUST BE NATIVE SLIDE TEXT. Never place text inside a picture.

Images 06, 07, 08, 09 and 10 are DESIGN REFERENCES, not assets to paste. They
show what each slide should look like. REBUILD them as real shapes, real text
boxes and real connectors:
  06-gap-2d-vs-3d.png      -> two side-by-side boxes, "Today" vs "Samudra 3D"
  07-architecture.png      -> a drawn architecture diagram (see below)
  08-methodology.png       -> five connected stage boxes + a proof-point row
  09-feasibility-risk.png  -> a native table: Risk / What happened / Resolution
  10-impact.png            -> four audience boxes + before-to-after rows

Only paste images that are screenshots of the running software. Those are what
make the deck credible and cannot be recreated as text.

=== THE ARCHITECTURE DIAGRAM (slide 3) - DRAW IT PROPERLY ===
This must be an actual architecture diagram made of shapes and arrows, laid out
left to right as a flow. Not a bullet list describing an architecture.

Structure, following 07-architecture.png exactly:

  [INCOIS ERDDAP]  ─┐
   incois_argo_10d_VAM │
   NetCDF · CF-1.6      ├──> [SOURCE ADAPTERS] ──> [GRID]  ──> [BROWSER · Three.js]
   24 levels            │     one class per          scientific    ray-marched volume
                        │     provider; the only     truth         globe <-> map morph
  [ARGO GDAC]      ─┘   │     code that knows
   float profiles       │     what an ERDDAP is  ──> [VOLUME] ──> [FastAPI]
   CSV · QC flags                                     GPU artifact   /api/collocation
                                                      4 bytes/voxel  /api/column

- Two source boxes on the left merge into one adapter box.
- The adapter box fans out to Grid and Volume, which fan out to Browser and API.
- Rounded rectangles, 1 pt borders, dark fill, cyan #3FB8C4 connector arrows.
- Source boxes get an amber #F5B841 border; the adapter and Grid boxes get a
  brighter cyan border to mark them as the core.
- Beneath the diagram, a callout with an amber left rule:
  "The extensibility seam. Adding a mooring, ADCP or HF-radar feed means writing
   one adapter. The renderer, the API and the UI have never heard of ERDDAP."

=== TECH STACK ICONS (slide 3) ===
In the "Technologies to be Used" list, put a small monochrome icon beside each
technology where space allows - Python, FastAPI, React, TypeScript, Three.js /
WebGL, NetCDF, pytest. Tint every icon the same cyan #3FB8C4 so they read as one
set, and keep them small (about the height of a capital letter). If they crowd
the column, drop the icons entirely - a clean list beats a cramped one.

=== VISUAL STYLE ===
Dark slides. Ground #071420 (deep blue-black, never pure black).

  Box fill      #0C1F2E     Box border   #4A6B80 (1 pt)
  Headings      #E4EEF6     Body text    #B9CDDC     Muted #6D8598
  Cyan accent   #3FB8C4     box labels, arrows, diagram lines
  Amber         #F5B841     the single most important number, max 2 per slide
  Coral         #F2765F     problems and risks only
  Green         #5FD68A     "working prototype", solved, verified

Type: Chivo Black or Arial Black for titles (ALL CAPS, 34-40 pt). Consolas Bold
ALL CAPS for box labels in cyan. Calibri or Arial for bullets, 13-15 pt.
Consolas for dataset IDs, URLs and figures.

Layout for every content slide:
- Everything inside bordered boxes - two side by side, or a 2x2 grid.
- Every box gets a small cyan ALL-CAPS label above it.
- Every bullet reads "**Bold lead-in**: short explanation." Never a bare
  sentence. Max ~6 bullets per box.
- Screenshots get a 1 pt border and a one-line muted caption.

=== SCREENSHOTS TO PASTE ===
  02-volume-clean.png       Slide 1, hero
  03-globe-full.png         Slide 2
  12-watermass.png          Slide 2 or 5 - visually the strongest image we have
  11-isosurface.png         Slide 2 or 4
  01-volume-full.png        Slide 3 - proves it is a real application
  13-salinity.png           Slide 3 - shows multi-variable support
  04-collocation-panel.png  Slide 5 - the evidence crop
  05-collocation-full.png   spare

=== TWO THINGS TO GET RIGHT ===
1. Slide 3 carries a "Product Status" strip. Reproduce it prominently and set
   "working prototype" in the green. Most submissions at this stage are
   concepts; this one runs on live data at
   https://rak2315.github.io/samudra-sih26/ - put that URL on slide 1 or 3.
2. Slide 1 has two blanks: Team ID and Team Name. Leave them as visible
   placeholders. Do not invent values.

=== TONE ===
Plain language a non-technical judge can follow, with the technical proof
carried by the diagrams. Specific over clever. Every claim in SLIDES.md is
verifiable against the build - keep them exactly as written rather than making
them sound grander.

Now produce the 6 slides.
```

---

## Building it by hand instead

Work straight from `SLIDES.md`; it holds the same information organised for a human. Read the
art-direction section at the top before placing anything.

## Checklist before uploading

- [ ] Exactly 6 slides
- [ ] Team ID and Team Name filled in
- [ ] All five mandated section headings present and unchanged
- [ ] **No text baked into any image** - boards 06-10 rebuilt as native shapes
- [ ] Architecture drawn as a real flow diagram, not a bullet list
- [ ] Every bullet has a bold lead-in
- [ ] "Product Status: working prototype" is on slide 3 and legible
- [ ] Live URL somewhere on the deck
- [ ] Exported as **PDF** (the portal rejects .pptx and .docx)
- [ ] Screenshots still sharp after export
