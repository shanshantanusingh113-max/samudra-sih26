# Known defects and open suspicions

**Worked through on 2026-09-03, revisited three times on 2026-09-04. Two items are open; 72
are fixed and compressed below.** That compression is this file's own convention: a defect that is fixed and whose
measurement has been folded into `CLAUDE.md`, an ADR or a probe does not need its own paragraph
here, and 700 lines of solved problems is a file nobody reads. Twenty-five defects from the
August rounds were removed the same way when the September survey replaced them.

**What replaced the paragraphs.** Six new rules in `CLAUDE.md`; the coastline measurement in
ADR 0016; the drift-window measurement in ADR 0015; the per-kind bias table in
`docs/plan/02-next-features.md`; and three checks in the harness that did not exist -
`probe-guide.mjs` (new: every control has an explanation, every figure in one is live),
`probe-bias.mjs` (marker positions and marker counts), and `probe-hazard.mjs` (pixels rather
than compressed bytes). The second pass on 2026-09-04 added a fourth, `probe-landing.mjs`:
nothing in this project compiles HTML against the files it names, and that is how two cards on
the landing page shipped a whole round with alt text over an empty panel.

The ranking is the one this file has always used:

1. **Tells a user something false.** A wrong sentence on screen costs more than a missing feature.
2. **Data quietly discarded, or quietly invented.** Silence about what was dropped, or about what
   was assumed, is the same fault one level down.
3. **Labels, presentation and performance.** Cheap to fix, and "cosmetic" is worth measuring
   before believing.

---

## Still open

- [ ] **44. Every hero image on the landing page is a hand-picked screenshot with a written
      caption.** `volume.jpg`, `collocation.jpg` and the rest, with captions describing what is
      in them - *"warm yellow at the sea surface fading through orange to deep violet at 2000
      metres"*. Nothing regenerates them and nothing checks the caption still describes the
      picture.

      **The frames are chosen and the pipeline is one command; the captions are still not
      checked.** See 42 and V. Every picture was re-chosen on 2026-09-04 and every caption beside
      one was rewritten against the frame it now sits next to - but that was a person reading,
      not a probe. `probe-landing.mjs` checks that a picture *exists* and *loads*; nothing checks
      that the sentence under it is still true. That stays open on purpose: it is a judgement
      about prose. The failure it guards against is real and cheap to hit - a caption saying
      "warm yellow at the sea surface fading through orange to deep violet" survives a theme
      change that makes it false.

- [ ] **47. Two control groups open now scrolls the left panel, and `CLAUDE.md` said it fitted.**
      Re-measured 2026-09-04 at 1366x768, where the panel starts 74 px down and has **678 px**:
      all groups closed **408 px**, Variable alone **527 px**, Variable and Colourbar together
      **722 px**, everything open **2,664 px**. The figures the rules file carried - 264 / 383 /
      578 - were from before the panel grew, and the claim "every reasonable working set fits" is
      now false for two groups.

      **The numbers are corrected in `CLAUDE.md` and `web/CLAUDE.md`; the panel is not.** It
      scrolls, and it has a scroll cue at both edges that says so. **It is not the scrollbar
      gutter**: that was measured both ways, three open sets each, and `stable both-edges` costs
      **no height at all** against `stable` - 408, 527 and 722 either way. What it costs is 11 px
      of content width, and what it buys is a panel that is not lopsided.

---

## Fixed on 2026-09-04

| # | What was wrong | What it is now |
| --- | --- | --- |
| **A** | The Anomaly Feature panel was the last prose in the app: four paragraphs and three notes, **243 words** in a 348 px column, longest block 40 words, no bullets, against a guide-panel rule of about 70 words of bullets | Bullets, in the five generating functions and not in markup. Every measured number survives; the connective prose and two defensive sentences went. Measured across all nine Features: the four labelled blocks are a median **86 words**, longest 100, always eight bullets; the whole panel including notes is a median **151** |
| **B** | `scrollbar-gutter: stable` reserves the track on the scrolling edge only, so the panel's contents sat **1 px from the left and 11 px from the right**, permanently, on the panel a judge looks at first | `both-edges`. Measured 11 px each side, and it costs no height - see 47 |
| **C** | The "Your own data" panel printed `http://localhost:8000` to a room that cannot reach it, which was also the last line in the panel about the implementation rather than about the file | Deleted. The claim it carried - that nothing else on the page needs the API - is still made in `guide.ts`'s `upload` entry and on `requirements.html`, where it is a statement about the platform rather than a URL |
| **D** | Nothing in the repo converted a screenshot to the JPEG the documents load, or copied it into them. `web/shots/` held PNGs from today beside JPEGs from 23 August | `capture.mjs --theme light --publish`. See 42 |
| **E** | The current layer's default became moving dots and `probe-hazard.mjs` went on printing `arrowVertices: 0` and a `share` of **3.33%** that was the animation moving between its two frames rather than the arrows being drawn. It passed, because it asserted on neither | It sets `currentStyle: "arrows"` before measuring arrows, hides **both** styles for the off-frame, and fails on a vector Field that builds no arrow geometry. Correctly paired: **0.59%** of the frame, which is the figure this project has quoted all along |
| **I** | The isosurface used the ray marcher's own coverage floor of 0.02, so near the coast it kept drawing for almost a full cell past the shoreline out of a neighbouring cell's back-filled value - the sheets over India and Sri Lanka the user photographed | A surface asserts a position and haze does not, so they no longer share a floor: a crossing needs `coverage > 0.6`, ramped to 0.9. Measured: 16.5% of ocean voxels touch land horizontally; on screen the surface went from **23.20%** of the frame to **22.86%**, against 22.60% at an extreme floor of 0.97 |
| **J** | `capture.mjs` hid the panels for its hero shot by turning **kiosk mode** on, which also mounts the component that plays the Explore questions on a loop. The hero came back as the currents, with a drift pin in it | Bare shots inject a stylesheet and touch nothing else. The hero is now the temperature block, shot with no chrome at all, and the landing page opens on it full bleed |
| **K** | The landing page held everything in a 1140 px column, so on any modern display the whole product sat in the middle third with two empty margins. The hero was a shrunken screenshot of a working console, which is a picture of unreadable panels rather than of the ocean | Rebuilt: 1320 px shell, a full-bleed hero on a chrome-free image, a snapping rail of **16 feature cards** each opening a dialog with its own measurement, a scroll-progress hairline, staggered reveals, and every feature of the September round on the page. Both themes painted explicitly |
| **L** | In the nav, `a[href$=".html"]` is more specific than `.cta`, so the **Launch** button's label was painted in the muted nav colour on a saturated cyan pill: the one button that has to be legible was the least legible thing on the page | `:not(.cta)` on that selector |
| **G** | The current trails took their colour from the palette and sat on water coloured by the same speed through the same palette, so over slow water - most of the basin, both themes - a pale dot landed on pale water with **zero contrast against exactly the background it was drawn on**. Reported by the user with a screenshot | Inked, one colour per theme, carrying direction only. The map key and the guide entry now say the water's colour is the speed, which makes this the one mark in the platform not coloured by its own value and the one place that is stated. The window still drops a dot outside it rather than inking it. Measured: the layer went from **1.33%** of the frame to **1.83%**, one sample each - the population is randomly seeded and a re-run of the same build gave 2.47%, so the pair sizes the change and does not pin it |
| **H** | Current Speed draws a Volume *and* dots, but `Controls.tsx` gated Water opacity, Ray steps and Show volume on `render === "volume"` - so the water was on screen with **no control over it**, and the one click that would have fixed the legibility problem above was not there. The rule about hiding a control, running the other way | The panel's predicate is the scene's: not a sheet, not a drape. Verified on Current Speed, all five Rendering controls present and "Show volume" turns the water off |
| **F** | `getBoundingClientRect()` on the hidden control panel returned all zeros, so every depth-ruler figure on the exhibition screen was placed at 70 px and its landmark ran off the left edge | Width decides, not presence. A landmark that wrapped to two lines also ran into the tick below it, so they are short enough not to wrap |
| **M** | `PUBLISH_MAP` sent `07-anomaly` into `docs/images/` and not into `web/public/images/`, so the landing page's **Anomaly features** and **Against a thirty-year normal** cards both asked for `./images/anomaly.jpg` and drew alt text over an empty panel. `06-density` had the same gap. Reported by the user with two screenshots | Both added to the site half of the map, and both published from a fresh **dark** capture, because the rest of the site set is dark and the shots left in `web/shots/` were the light run. `probe-landing.mjs` is new and fails on the reference: the file has to be in `web/public/images/` **and** decode in the browser out of `web/dist/`, which are two copies and two ways to lose one |
| **N** | **"Show me around"** and **"Explore by question"** were cards 12 and 13 of the feature rail *and* two of the four cards in *For everyone, not just forecasters* a section later, where they are covered properly beside kiosk mode and the copied link. The heading said "Sixteen things you can do with it" | Both removed from the rail; the heading, the two source comments and `web/CLAUDE.md` all say fourteen. `probe-landing.mjs` reads the heading, turns its number word back into a number and counts the cards - which is how the malformed markup left behind by the first removal was caught, four minutes after it was written: 14 buttons in the file, **12** surviving the parser |
| **O** | **The hero was unreadable in light mode.** The photograph is the same dark render in both themes on purpose, but the *type* followed the page: on light `--ink` is `#0d1b22`, so "Fly into the" was near-black over the darkest part of the picture. Measured against the rendered ground under it, with the hero's own words taken away: headline **3.66:1** at 1600 px and **3.97:1** at 1280, cyan accent **1.27:1** and **1.31:1**, sub-paragraph **3.55:1**. Reported by the user with a screenshot | `.hero` re-declares the dark palette for everything inside it and keeps its scrim dark to its own bottom edge, so the hero is one dark band at the top of a light page. Measured after: headline **6.49** and **6.15**, accent **3.46** and **3.50**, sub **6.38** and **6.28**, and **light and dark agree to two decimal places at both widths**. `probe-landing.mjs` fails under 3:1 and fails if the two themes ever separate |
| **P** | **The five hazard variables all sounded like each other.** Read in panel order, four of the five are "a depth to do with warm water", and every entry opened with its own definition rather than with what it asks that its neighbour does not. Reported by the user | They are one chain and the entries now say so: the first bullet of each names its neighbour. Nothing measured was cut - barrier layer's level-spacing caveat moved from `means` into `look`. Measured by `probe-guide.mjs`: median **113 words**, unmoved; longest 150; no list over 4 bullets; longest bullet 20 words against a limit of 24 |
| **46** | `ppt/DECK.md` and `ppt/DESIGN-SPEC.md` described a build two rounds old, and `ppt/images/` was rendered against those figures. Open for three rounds | Both rewritten against the running build. Every rendered board re-rendered: the architecture board carries seven sources in two columns, the third representation (the Fields that ship unquantised on the Grid) and the two deliberate duplications; the stack, methodology and feasibility boards carry 377 tests, 13 probes and 71.1 MB; the gap map carries 15 variables, 8 adapters and the 21-step tour. `DECK.md` slide 6 gained the three sources it never listed and lost the sentence saying currents are a picture, which ADR 0013 made the opposite of true. The screenshots were August too; see Q |
| **Q** | `PUBLISH_MAP` in `capture.mjs` had a `docs` half and a `site` half and **no `ppt` half at all**, so the deck's screenshots were whatever had last been copied there by hand: 27 August, seven of them, 1200 x 675, predating the flow, the section, the hazard sheets, Explore and kiosk. The deck talked about all five and had a picture of none | Twelve entries added, and the deck's set published from the 4 September light run - light because the SIH template is a white page, except the exhibition screen, which is dark wherever it stands. `--publish-only` is new: it copies what `shots/` already holds and opens no browser, because a capture is forty minutes on this machine and "the shots are right, I just want them in another document" was the common case. It prints the date of every file it copies, so a stale shot cannot reach a document silently |
| **R** | **A sign error in the deck.** `DECK.md` slide 2 said the model reads "**1.64 °C cool**" on float 6903088. The residual is observed minus modelled and it is **-1.6364**, so the model is the *warmer* of the two - which is what the app's own panel says in the screenshot on the same slide | "1.64 °C warmer than the instrument", with the float, the cast date and the analysis it was compared against. The rendered boards had the sign right the whole time; only the words beside them were wrong, which is the failure mode a rendered board exists to prevent and a native text box reintroduces |
| **42** | The landing page's pictures were a UI two rounds old, and the missing step - shoot, encode, copy - was never written down. Open for four rounds | Written, then rebuilt around one committed source: see V. **And the choosing happened**, which was always the half a script could not do: nineteen light frames and four dark ones were grabbed from a real browser on 2026-09-04, because the harness shoots one camera angle per state and cannot tell that its own flow shot has no Somali Current in it |
| **X** | **The landing page's pictures did not follow its own theme toggle.** An `<img src>` is not a CSS property, so switching to light repainted every colour and left a dozen dark screenshots sitting in it as holes. It could not have been fixed before now for a duller reason: there was no light copy of the site set to swap *to* | Each twinned picture carries `data-light` and the toggle rewrites `src`; the shared dialog carries both paths and repaints when it opens. `<picture>` with `prefers-color-scheme` was rejected - it follows the operating system, and the master here is this page's own button, shared with the platform through one localStorage key. Measured by `probe-landing.mjs`: **12 pictures swap, 3 deliberately do not** - the hero, which is a dark band in both themes by design, and the exhibition screen, where the darkness is the subject. A picture with no twin and no reason on record now fails |
| **Y** | **`probe-upload.mjs` could not run from a clone.** Its fixtures defaulted to a scratchpad path belonging to a Claude session that no longer existed, so it exited 2 with "no fixtures" for anybody but the machine that wrote it - a committed probe that had quietly stopped being runnable | Defaults to `ncfixtures/`, which is committed beside it. Verified by running it: the good file is read, `sea_temp` appears under the **yours** tab, and the sigma-coordinate file is refused by name |
| **Z** | Every figure in `ppt/DECK.md` was typed in by hand under a warning that said *do not adjust a number by arithmetic*, with nothing to check them against. Two were wrong: 246 tests against a real 377, and a sign the wrong way round on the float in the deck's own hero screenshot | `pipeline/scripts/collect_facts.py` writes `ppt/FACTS.md` - 33 figures across 6 sections, each naming where it came from. Run it after a bake and diff the file. It deliberately does **not** edit the deck: a figure moving sometimes means a sentence has to be rewritten rather than a digit swapped |
| **V** | **Four folders held overlapping copies of the same pictures, in two themes, and one set was from August.** `docs/images/`, `web/public/images/`, `ppt/images/` and `web/handpicked/`, each named by the document rather than by what the picture shows, so the same frame was `hero.jpg`, `volume.jpg` and `S2-app.jpg` and nothing could say which of the three was current | One home: `assets/screenshots/{light,dark}/`, named by subject. The three document folders are **outputs**, filled by `node capture.mjs --publish-only --publish` in about a second. `shots/` stays scratch and nothing references it; `--ingest` promotes a shot into the committed set and is opt-in, refusing to overwrite a hand-picked frame without `--force`. Pruned: `density.jpg` and `explore.jpg` from the site set, which nothing had referenced since the rail lost two cards |
| **W** | **The deck's hero screenshot and the words beside it were about different floats**, again - the light re-capture landed on Argo 7902384 while slide 2 and the uniqueness ribbon still quoted 6903088 | Both quote the float in the picture: **0.17 °C over 996 depths, RMS 0.47**. That float *agrees*, which is not the weaker claim it looks like - the card now says the platform puts a number on the comparison either way and names the worst instrument in the basin, a moored buoy at **1.66 °C**, in the same breath. `spare-bias.jpg` is the picture of that list, and it is new |
| **T** | **A publish overwrote the landing page's whole dark image set with light ones**, in under a second, printing thirteen `published` lines while it did it. Recoverable only because `web/dist/images/` still held the previous build's copy of `public/`; the six files tracked in git were from an August commit. The same run also let `08-coverage` land on top of a hand-picked `coverage.jpg`, because two map entries named one file and the later one won | `WANTS_THEME` names what each document's pictures are: `docs` and `ppt` light, `site` dark. A capture stamps `shots/.theme` before its first shot, and a mismatch is refused **per file**. It needed a per-entry override within minutes - the exhibition screen is dark in all three documents, and a light `--target ppt` run passed the per-document check and quietly replaced it. The duplicate coverage entry is gone. Tested both ways: a light `--target site` refuses 11 files and lets the 4 hand-picked ones through |
| **U** | Two landing cards a section apart showed **the same picture under two different claims** - "Anomaly features" and "Against a thirty-year normal" both pointed at `anomaly.jpg` - and the "Drift, with a score" card illustrated itself with `globe.jpg`, which shows no drift, no pin and no track | `drift.jpg` and `normal.jpg` are their own files, from frames the user chose. New files rather than overwrites, because `globe.jpg` and `anomaly.jpg` are legitimately shared by four other cards. `web/handpicked/` holds the originals so a re-capture cannot undo the choice |
| **S** | The `S2-uniqueness.png` ribbon quoted float **1902681** (0.72 °C, 522 depths) and sits on the same slide as `S2-app.jpg`, which is float **6903088** (1.64 °C, 667 depths). Both real, and a judge reading one and then looking at the other sees two sets of numbers with nothing connecting them | The ribbon quotes the float in the picture beside it, and says so. `S5-benefits.png` still uses 1902681 and names it, on a slide with no float picture on it |

---

## Fixed on 2026-09-03

Fifty-one items. Each row is what was wrong and the measurement that says it is not any more.
Every figure was taken **after** the fix.

### Tier 1 - said something false on screen

| # | What was wrong | What it is now |
| --- | --- | --- |
| **1** | The bias map pooled 9 unassimilated moored buoys with 224 Argo floats INCOIS's analysis had already been fed, so the headline was largely the model agreeing with itself | `field_bias` takes a `kind`, the bake writes `byKind`, the panel prints both. Typical gap, floats against buoys: temperature **0.167 vs 0.748 degC** (4.5x), salinity 0.029 vs 0.144 (4.9x), density 0.040 vs 0.257 (6.4x) |
| **2** | The drift score was measured mostly on days the current field does not cover: earliest Fix 2026-03-22, first analysis 2026-04-10, and **199 of 202** comparisons started inside that hole | `CurrentSeries.covers` refuses them, with three tests. Re-measured: **195 floats**, median **38.5 km** over one Argo cycle, p90 **87.3 km**, **1,908 cycles**; 10 days is 43.6 km against 46.1 km travelled. ADR 0015 |
| **3** | The panel scored a 1000 m answer beside a 5 m line | Reads "Scored at 1000 m", from the manifest, and adds a clause when the drawn line is at another depth |
| **4** | The section drew every cast in the corridor whatever its date: **127 on one Bay of Bengal line, 98 of them March to June**, under a caption saying 150 km | Both copies take the bake's own coverage window, the rule `positionAt` already applies to markers. Same line: **8 casts, all July 2026** |
| **5** | The climatological anomaly's contour opened at **0.135 degC**, a quarter of what the detector calls a departure | The 0.5 degC floor belongs to the quantity, not to one Field. Measured fresh per Field: seasonal 0.50, climatological 0.50, analysis spread 0.50 degC; barrier layer keeps the generic floor at 2.33 m |
| **6** | A float could rank worst in the ocean on three matched depths | Per kind, because 9 of the 12 low rows are buoys whose 8 or 9 sensors are the whole instrument and only 3 are truncated casts (10, 13, 14 depths against a float median of 221). `RESIDUAL_MIN_MATCHED` drops **9 rows, 3 per Field**; every row now prints its depth count |
| **6b** | A comment said markers are drawn at the compared cast; the line under it used `positionAt` | Position travels with the number. `probe-bias.mjs`: **worst marker 0.00 km from its own cast**, at steps 0, 5 and 11 |
| **6c** | "233 instruments" beside **196 to 224** drawn | Bias mode draws every comparison regardless of Timestep. **230 of 230 at every step** |
| **6d** | The map mixes twelve dates and nothing said so | The panel says it, the map key says it, the guide entry says it |
| **7** | Four measured figures hard-coded into `guide.ts`; the anomaly ones had been stale since August | Entries write `{token}`, `guideFigures()` fills from the manifest, and a token with nothing behind it removes its bullet. The bake gained `coverage.emptyFraction` and `normalAnomaly`. `probe-guide.mjs` fails on an unfilled token |
| **8** | Four hazard Fields state a depth in metres with nothing about its precision, while two documents claimed otherwise | All five carry it with the figure: D26 and heat potential "levels 25 m apart near 70 m", MLD "only three levels between 10 and 30 m", ILD "10 m apart near the surface", barrier layer "two depths subtracted" |
| **9** | An uploaded variable borrowed a palette whose note named a quantity it is not - ADR 0010's own failure through a door the ADR did not close | `describePalette` has an uploaded branch: what the scale is, that it came from the file's `standard_name`, and to read the bar rather than the convention |
| **10** | `README.md` said "six per cent" in one place and 9.9% in four others | 9.9% everywhere. Re-measured over the shipped coverage Volumes: **80,551 of 813,876 ocean voxels, 9.90%** |
| **11** | An uploaded 2D field is a skin on slab 0, so it drew as nothing at all under a depth slice | The response marks it `surfaceOnly` and `selectField` opens the slice back to the top. Two tests |

### Tier 2 - quietly discarded or quietly invented

| # | What was wrong | What it is now |
| --- | --- | --- |
| **12** | The API cached the manifest and every Grid for the life of the process, so a re-bake left it serving the old field list for ever | Caches drop on the manifest's modification time; `/api/health` reports the bake's `generated` stamp |
| **13** | Unverified: the two Change Fields have different coastlines | **Verified, and real.** 70.1% vs 60.2% ocean voxels. At 5 m the climatological Field loses **79 of 1,537** cells and **gains 0** - at every one of the 24 Levels - so the atlas is never the more generous mask. The 79 are the Andamans, the Gulf of Mannar and the Somali shelf. Said in the guide entry, measured in ADR 0016 |
| **14** | `positions_from` silently fell back to the newest Fix | Only for a mooring, which never moved. A drifting float with no matching Fix is refused. Still fires 0 times in 234 |
| **15** | `biasPosition` defaulted to the scale that made the map read as white | No default. No measured scale, no colour: the marker draws hollow and the key drops its bias legend |
| **16** | A null statistic was drawn as agreement | "No RMS" in grey, a hollow swatch, and "nothing summarised" instead of "0.00 degC cooler than them on average" |
| **17** | An uploaded file's colour range was the whole file, not the part drawn | `NetcdfFileSource` takes the region at construction. Tested with a global file holding 1000 outside the block and 20 inside: the range comes back at 20 |
| **18** | Every uploaded variable was offered an isosurface, including 2D ones | Only with a vertical axis carrying two distinct levels. Two tests |
| **19** | An uploaded file's timeline could do nothing and never say so | `timelineMoves()` asks whether the mapping is degenerate, which covers a clock that misses as well as no clock at all |
| **20** | Claimed: a partly readable file is refused whole | **Not true** - `data_variables` already dropped the bad variable and offered the good one. What was missing is that the dropped ones vanished silently. `skipped()` names each with its reason, and the panel prints it. Tested on a mixed file |
| **21** | `drift.json` shipped 2,431 numbers nothing reads | Computed, consumed by the summary, deleted before writing. **469 KB** |
| **22** | The section's corridor was a flat projection about a rhumb line, while the figure is cut along a great circle | Ground-truthed by minimising over 20,001 points of the drawn line: the offset was wrong by up to **179 km** and the along-track distance by **12 km**, against a corridor 150 km wide. Both copies use the spherical cross-track and along-track pair. A test that asserted the flat answer was corrected: a cast at 65 E 5 N is **2.115 km** off a line between two points at 5 N |
| **23** | `drift.py` reached into `Grid._bracket` | `Grid.bracket`, documented as a seam with both callers named |
| **24** | A section line survived onto a Field that cannot have one | `selectField` clears it when the new Field ships no Grid |

### Tier 3 - presentation, performance and hygiene

| # | What was wrong | What it is now |
| --- | --- | --- |
| **25** | The section figure stayed on screen for a Field whose control had vanished | The panel's own "wrong Field" branch is gone; 24 makes the state unreachable |
| **26** | Selecting a bias row hid the explanation of the control just used | The right panel answers whichever question was asked last. Selecting an instrument clears `touched`, so the comparison still wins on a click; touching a control after that shows the guide over it, and its close button hands the space back. The bug was wider than the item: touching *any* control while a comparison was open produced nothing |
| **27** | The section recomputed 121x24 values and 237 instruments on every React render, and repainted the canvas with them | Both behind `useMemo`. Not quoted in milliseconds: the fix removes the work, so the only figure to quote would be the old one |
| **28** | `/api/section` rebuilt 3,718 `Profile` objects per request | `lru_cache`, cleared by the same re-bake check as `native_grid` |
| **29** | The upload endpoint buffered the whole request before checking its size | The declared length is refused before a byte is read, and the stream is capped as it arrives. Tested |
| **30** | One empty temporary directory per upload, for the life of the machine | `Session.close` removes it |
| **31** | CORS allowed POST and DELETE from any origin | **Decided.** Reads keep the wildcard - that is what lets a notebook pull a Grid. Writes check `Origin` against `UPLOAD_ORIGINS`, default the two dev ports and the deployed site, overridable with `SAMUDRA_UPLOAD_ORIGINS`. A script or curl sends no `Origin` and is not checked. Three tests |
| **32** | The section canvas had no role, no label and no text alternative | `role="img"` and a label carrying the variable, the length, the depth and the cast count |
| **33** | Two `Remove` buttons shared one accessible name | Named. And the layout bug underneath: `.mode-switch` is `width: 100%`, and a flex item's `auto` basis falls back to `width`, so `flex: 0 0 auto` meant "exactly the whole row, never shrink". Measured after: **220 px and 74 px, one line each** at 1600, 1366 and 1280 |
| **34** | The section panel was `min(720px, 100vw - 640px)`, which fitted 1366 px by 6 px on paper and overlapped both panels in a browser, and went negative below 960 px | `clamp(320px, 100vw - 760px, 720px)`. Measured clear of both side panels at 1600, 1366, 1280 and 1024 |
| **35** | Unverified: the map key might overflow in bias mode | **Measured: it does not.** 9 rows, 234 px of content in 234 px of box at 1366x768 with bias mode, a pin and a section. Capped and scrollable anyway, so a shorter window degrades instead of overflowing. It is also foldable now |
| **36** | `probe-hazard.mjs` counted differing bytes of two compressed PNGs, which `CLAUDE.md` forbids for a magnitude | Uses `probe-pixels.mjs` and counts pixels |
| **37** | `probe-fixups.mjs` was a gitignored throwaway carrying a check nothing else had | The colour-spread check is in `probe-bias.mjs`, part of the harness. Measured there: the red channel spans **0.83** of its range. The throwaway is deleted |
| **38** | Nothing checked that every control has a guide entry | `probe-guide.mjs`, in the harness. **It found three with no entry at all**: `rendering`, `currents` and `instruments`. All three written. It also fails on an unfilled figure token, a list over four bullets and a bullet over about two lines |
| **39** | `probe-counts.mjs` waited a fixed six seconds | Waits on the store like every other probe |
| **40** | Three exported functions with no caller | `liftFor`, `greatCirclePoints`, `columnAt` and `isBandedPalette` are module-private. Each is still used inside its own file |
| **41** | `agreement.ts` divided by 27.42 while temperature's range is 27.397, so a judgement read like a stale measurement | `REFERENCE_SPAN_DEGC = 27.4`, documented as the width of field the words were chosen against. The verdicts are unchanged |

### Documents

| # | What was wrong | What it is now |
| --- | --- | --- |
| **43** | The landing page hard-coded every figure it shows | Fetches the manifest and `residuals.json` for five. Verified in a browser: *30 Jul 2026, 237 instruments, 5-2000 m, 230 compared, median RMS 0.47 degC, typical gap 0.19 degC, 0.75 degC against 9 moored buoys*, and `EXTERNAL []` |
| **44b** | The page whose whole claim is that its figures are live hand-wrote its test ones: "67 passed", 11 modules, 123 tests | `pipeline/scripts/collect_tests.py` writes `tests.json` from pytest's own collector and each module's docstring; `provenance.html` reads it. Verified: **377** and **25 module rows** |
| **45** | `collocations.json` called "the largest single asset" | The largest single *file* at 10.5 MB; the largest thing on disk is `volumes/` at 46.5 MB, then `grids/` at 7.0 MB |
| **47** | The dossier PDF was not regenerated | Regenerated, after correcting five stale test counts (246, 230 and 54 in three places, "nine decision records") and a stale worked example: float 2902306 now reads **994 depths compared, the model 0.50 degC warmer, RMS 0.63 degC** at 21.6 N 60.9 E |
| **48** | `web/shots/*.png` predate five features | Regenerated. They are gitignored, so nothing shipped was ever wrong |
| **49** | `docs/plan/03` and `04` were not reviewed this round | Both carry a dated review: the CTD clause has a partial answer (a judge can drop their own CTD NetCDF in, which is the parser the clause asks for and explicitly not a CTD ingestion), and climate monitoring is answered by the World Ocean Atlas baseline |
| **50** | The test count had two homes and no check | One number in `CLAUDE.md`; the public page reads `tests.json`. The command is in `CLAUDE.md`'s Commands block |

---

## Things that look artificial and are not

Written down because each has been queried once already, and because "that looks made up" is the
correct first reaction to every one.

- **The drift pin does not move and the line does not animate.** The pin marks where it was
  dropped; the line is the whole trip drawn at once. Scrubbing the timeline redraws the line
  because the trip *starts* at the date on screen. It is in the guide entry.
- **The markers move when the bias map is switched on, and there are more of them.** Both are
  deliberate and both are item 6b and 6c above: a residual belongs to the cast it was measured
  at, so every instrument is drawn where its own comparison was taken and none of them is
  hidden for having surfaced on the wrong date. The map key says so in bias mode.
- **The eight worst rows in the bias list share two colours.** The scale saturates at the
  Field's ninetieth percentile - 0.39 degC on temperature - and every row in the top eight is
  past it, so the swatch shows which way the model read and not how far. The gap in the Field's
  own units is printed on the same row, and the note under the list says the scale ran out.
- **Hollow ringed markers on the bias map** are instruments that never measured that variable.
  They are deliberately not given the palette's midpoint, which would say the model agreed with
  something nothing compared.
- **A blank column in the vertical section** is land or sea floor. `Grid.column_at` refuses to
  blend across a Masked node, so the gap is a grid cell wide rather than a pixel wide - it looks
  like a rendering artefact and it is the data.
- **The deepest water in Temperature vs Normal is blank.** The World Ocean Atlas stops at 1500 m
  and the analysis runs to 2000 m. There is no normal to depart from.
- **The mean bias is almost exactly zero on all three Fields** (+0.021 degC, -0.006 PSU,
  -0.007 kg/m3). That is what an assimilating analysis is supposed to do to the floats it
  assimilated - which is why the panel also prints the figure against the nine buoys it did not
  assimilate, and why the map colours by the ninetieth percentile rather than by the mean.
- **Drift separation grows to about the distance travelled by 30 days.** Measured: 99 km
  separation against 103 km travelled. A current field alone stops carrying information about a
  particular float quickly, and saying so is the feature.

---

## Not defects, and the reasons are worth keeping

- **`drift.ts` and `section.ts` duplicate science that also lives in Python.** Deliberate, and
  the only two. Both are measured against the pipeline by `probe-drift.mjs` and
  `probe-section.mjs` - median 0.331 km over 101 days, and a worst gap of 5.07e-5 degC over
  1,102 values. ADR 0015 records why an API-only version was rejected. **Do not add a third
  without the same harness.**
- **The bias map is not AI and has no confidence score.** It is the mean and the RMS of
  residuals the bake already computed. `02-next-features.md` is emphatic about this.
- **The upload is the only network call the frontend can make**, and only when a user drops a
  file. `probe-requirements.mjs` reported `EXTERNAL REQUESTS []` on the last run.
- **The WOA climatology is a baseline and never a value.** It is not in the Variable selector.
  ADR 0016 records why that is a different decision from ADR 0010's refusal of oxygen.

---

## How to check any of this

```bash
cd pipeline && ../.venv/Scripts/python -m pytest -q            # 377 tests
cd pipeline && ../.venv/Scripts/python scripts/collect_tests.py  # after adding or removing one
cd web && npm run typecheck && npx vite build
cd web && npx vite preview --port 4173                         # what every probe drives
.venv/Scripts/python -m uvicorn api.main:app --port 8000       # two probes and items 12, 28-31

cd web && node probe-guide.mjs         # every control explained, every figure in one live
cd web && node probe-controls.mjs      # every Field against its log and isosurface controls
cd web && node probe-hazard.mjs        # the sheet, the drape, the arrows
cd web && node probe-bias.mjs          # marker colours, marker positions, marker counts
cd web && node probe-drift.mjs         # the browser's integrator against the pipeline's
cd web && node probe-section.mjs       # the browser's cut against /api/section
cd web && node probe-upload.mjs        # drop a NetCDF in, and refuse one
cd web && node probe-requirements.mjs  # every deep link, every figure, external requests
```
