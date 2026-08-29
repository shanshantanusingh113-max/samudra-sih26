# Known defects

**All seventeen are fixed.** Found by an independent survey on 2026-08-27 and closed the same
day; each was re-verified the way it was found - by measurement in the running app or under
test, not by reading the diff. They are kept here rather than deleted because the measurements
are the useful part and several are the kind of thing that comes back.

The ranking is the one this file has always used:

1. **Tells a user something false.** A wrong sentence on screen costs more than a missing feature.
2. **Data quietly discarded.** Silence about what was dropped is the same fault one level down.
3. **Labels and presentation.** Cheap to fix, and "cosmetic" is worth measuring before believing.

Every figure below was measured against the shipped bake or the running app, not estimated. Tick
an item only after it has been re-verified the same way it was found.

---

## Fixed

- [x] **1. Render settings leak between Variables, and silently kill the thermocline.**
      `store.ts` - `selectField()` applies a Field's render hints only when that Field declares
      them, so a Field with none inherits the last one's. Measured walking the row: temperature
      0.85 -> coverage **0.00** -> back to temperature **0.00** -> anomaly 0.55 -> temperature
      **0.55** -> salinity **0.55** -> density **0.55**. Visit Observation Coverage once and
      Temperature renders as an opaque warm lid with no thermocline, while the guide entry for
      Feature emphasis still tells the reader to look for one.

- [x] **2. The app credits INCOIS with three things INCOIS did not make.**
      `guide.ts` - `describeView()` is one sentence reused for all five Fields. Verbatim on
      screen: *"You are looking at observation coverage across India's exclusive economic zone,
      as INCOIS analysed it on 30 July 2026."* Density and the anomaly are computed here.
      Observation Coverage is not the model at all, and separating evidence from model is the
      platform's headline idea. This is the rule in `CLAUDE.md` about per-Field wording, broken.

- [x] **3. The Float count on screen is 20% higher than the number of Floats drawn.**
      `Chrome.tsx` and `guide.ts` both read `manifest.floatCount`, which is every Float in the
      bake. The app's own rule is that a Float is not drawn when its nearest cast is more than
      `windowDays` from the Timestep on screen. Measured, Floats actually drawn per step:
      210, 209, 206, 208, 210, 206, 203, 199, 203, 200, 202, **184**. The app opens on the last.

- [x] **4. Six Floats open an empty comparison and say nothing about why.**
      `ProfilePanel.tsx` - a chart with one line, a legend promising two more, "0 depths
      compared", two dashes, no verdict. Measured: **6 of 212** collocated Floats have zero
      matched depths in every Field - 1902660, 1902681, 2903955, 5907082, 6990611, 6990700.
      Five sit beside a Masked node, so `column_at` correctly refuses to blend a sea temperature
      out of open-ocean neighbours; the sixth reported only from 1300 m down. The `outsideGrid`
      message never fires because an entry does exist, it is just empty. About 1 click in 35.

- [x] **5. At 1366x768, 43% of the control panel is invisible - including the Isosurface.**
      `styles.css` `.panel` scrolls but shows no affordance against the dark ground, and the
      content stops mid-label. Measured content below the fold: 1600x900 **30%** (Rendering,
      Isosurface, Instruments), 1366x768 **43%** (same three), 1280x720 **48%** (Depth slice as
      well). Isosurface extraction is a named clause of PS 26067.

- [x] **6. The colourbar note invents an oceanographic convention that does not exist.**
      `Controls.tsx` - one template for every Field. Verbatim: *"Observation coverage,
      sequential. The conventional oceanographic scale for observation coverage."* That palette
      was invented here - the guide entry two clicks away says so - and a four-band step
      function is not sequential.

- [x] **7. The demo depends on Google's font servers.**
      `app.html`, `index.html`, `provenance.html`. The README badge says "network calls at demo
      time: 0" and `CLAUDE.md` states it as a rule. Measured: `css2?family=Chivo...` 1 KB plus
      three woff2 at 33.2, 14.7 and 14.9 KB. About **63 KB** over the network on every load.

- [x] **8. Seventeen seconds of blank screen on a slow link, and 73% of it is a file nobody has
      asked for yet.** `App.tsx` waits on five files before anything draws, one of which is every
      matched depth for all 212 Floats. Measured on the production build: **3.29 MB**
      transferred, of which `collocations.json` is **2.42 MB** (9.08 MB raw). Time to the first
      picture: **0.7 s** unthrottled, **6.8 s** at 4 Mbit, **17.1 s** at 1.5 Mbit. Without that
      one file the payload is **0.87 MB**. Already named as the first thing to trim in
      `docs/plan/01-cut-features.md`.

- [x] **9. The Observation Coverage key stops being ordered for red-green colour deficiency.**
      `palettes.py` `COVERAGE_BANDS`. Vienot simulation, RGB distance: normal, 1 cast (199,84,61)
      against 4+ (79,176,107) is **158**; deuteranopia (132,132,53) against (155,155,110) is
      **66**, and 2-3 casts (190,190,49) becomes the *brightest* band. Under protanopia the
      perceived order is 1 cast < 4+ < 2-3 casts. The ranking inverts on the one Field the
      platform singles out as its honesty feature.

- [x] **10. The honest sentences are set at 11 px, and the smallest text is 8.5 px.**
      `styles.css`. Contrast is fine - measured 5.21:1 to 14.8:1 in both themes, past WCAG AA.
      Size is not: 8.5 px timeline note, 9 px map-key and stamp labels, 9.5 px attribution and
      depth ruler, 10 px group headings, **11 px every explanatory note**, 13 px guide body. The
      `.note` paragraphs carry the caveats that make this platform trustworthy.

- [x] **11. No slider has a name a screen reader can read, and the 3D view cannot be reached by
      keyboard.** Every slider's visible label sits in a sibling `div`. Measured: **9 of 9**
      range inputs have neither `aria-label` nor a wrapping `label`; canvas `tabIndex` is **-1**;
      22 focusable elements in total. Selecting a Float is mouse-only.

- [x] **12. The map key sits on top of the depth-ruler caption at every window size.**
      The caption reads "depth axis stretched - see the uneven spacing"; its first third is
      behind the key, so a viewer reads "...xis stretched - see the uneven spacing". Measured at
      1600x900, 1366x768 and 1280x720: key right edge 700 px, caption left edge 494-654 px.
      Overlaps in all three. That caption exists to stop somebody reading proportional depths off
      a warped axis.

- [x] **13. "Isolate a single water mass" is printed under the Observation Coverage colourbar.**
      `Controls.tsx`. There is no water mass in a cast count, and none in a departure either, so
      the same static note is wrong under two of the five Fields.

- [x] **14. The baked Collocation always uses the newest cast, which is sometimes that Float's
      worst.** `bake.py` `_build_observations`. Measured: **24 of 212** Floats have a newest cast
      more than 500 m shallower than their own deepest; **10 of 212** give a chart with 20
      compared depths or fewer; **7** newest casts never report shallower than 200 m and **8**
      never reach 500 m. Float 6990611 has 13 casts and its newest reported only from 1300 m
      down, so its chart is empty. `/api/collocation` can already ask for any cast; the demo
      cannot.

- [x] **15. The Profile chart still has a "0 m" depth tick.**
      `ProfilePanel.tsx` `DEPTH_TICKS`. The depth ruler was fixed for exactly this - there is no
      data above 5 m and a ruler is a measurement claim - and the chart's own tick list was not
      updated, so it labels a gridline "0" and draws it where 5 m goes.

- [x] **16. The opening frame is the least informative picture in the app.**
      `store.ts` opens the Globe at `surfaceLevel: 0`, which is 5 m, where the whole region sits
      at 28-30 degC on a scale running 2.61-30.02 degC. Everything lands in the top few per cent
      of the palette and the study area reads as a flat yellow cut-out with no structure.

- [x] **17. The strongest objection to the whole platform is not pre-empted on screen.**
      INCOIS's VAM analysis is *derived from* Argo profiles, so a Collocation is partly the
      analysis being graded against its own input. `sources/incois.py` says this well;
      `ProfilePanel.tsx` says nothing. The check is not degenerate - temperature 150 close / 52
      moderate / 4 large, median RMS 0.464 degC; salinity 122 / 65 / 11, median 0.063 PSU;
      density 140 / 50 / 8, median 0.122 kg/m3 - which is exactly why the caveat can be stated
      without weakening anything.

---

## Decided, no longer open

**Default water opacity is 0.03.** This file previously left it as an open question because it is
a judgement about the opening picture of a demo. Settled 2026-08-27 on the measurement that was
already recorded here: pixel difference between Feature emphasis 0% and 85% inside the Volume is
2.10 at opacity 0.050 and 4.07 at 0.030, and the share of pixels visibly changed goes from 17.4%
to 35.6%. The water still reads as a solid body at 0.03.

---

## Known and stated, not a defect

**The edges of Observation Coverage are sparser, and it is geography.** Measured 2026-08-27:
20 floats between 55-60 E against 64 between 80-90 E, and mean surface coverage of 2.53 casts at
the western edge against 4.05 in the interior. But the *eastern* edge is 1.73, lower still, so
this is not a western problem. Both edges run into land and shelf - Somalia at 51 E, Sumatra at
100 E - and Argo floats do not drift onto continents. Signal, not artefact.

**Most vivid anomaly colour carries no ring, and that is correct.** The anomaly Field is painted
in degrees and the Feature detector selects on a z-score, so the two disagree by construction. Of
163 cells past 3 degC of departure in the last step, 99 carry no ring; those cells swing 2.07 degC
routinely, against a z of 1.71 where 2.0 is needed. They are the thermocline band at 50-100 m,
large in degrees and unremarkable for that water. The rule is stated in the guide entry and on the
Feature panel rather than left for a viewer to trip over.

**A see-through panel over the Volume is a software-rendering artefact, not a defect.** Reported
during the 2026-08-27 survey and dismissed on measurement: `--panel-bg` is 97% opaque, and the
transparency only appears under SwiftShader, which composites `backdrop-filter` incorrectly. On
any real GPU the panel is solid. Recorded so it is not re-filed.


---

## Second round, found by the author testing the running app (2026-08-27)

Four things the automated checks could not have found, because three of them are judgements
about what a picture communicates and one is a sentence that is only wrong on a page the tests
never opened.

- [x] **18. The Observation Coverage colourbar was three quarters one colour.**
      The gradient bar is drawn across the *encoded range*, and the bands sit at 0.5, 1.5 and
      3.5 casts out of a range running to 14 - so 75% of the swatch was the single "4 or more"
      green, and the palette read as "mostly green" when the block plainly is not. The
      proportions were honest about the range and dishonest about the bands, and the bands are
      what a reader is looking for. A banded Field now shows no gradient bar at all: the band
      key does that job properly and has become the control.

- [x] **19. The assimilation caveat was wrong on a moored buoy, and understated the result.**
      "INCOIS's analysis assimilates Argo, so this float may be one of the observations that
      went into it" is true of an Argo float and false of a buoy - and it buries the better
      story. A mooring is *not* in that assimilation stream, so its comparison is the more
      independent of the two the platform can show. That is now what the panel says, and it is
      the reason the buoys were worth wiring up at all.

- [x] **20. Nothing said a float carried chlorophyll until you had scrolled to the bottom.**
      The chlorophyll chart is the last thing in a long panel and there was no hint above it
      that there was anything to scroll to. A `+ chlorophyll` chip now sits beside the
      Reporting pill at the top.

- [x] **21. Temperature and Salinity had no guide entry of their own.**
      Three of the five Fields explained themselves and two fell back to the generic sentence
      about the selector - which is the documented fallback, but it means the two Fields a
      first-time reader clicks first are the two that explain themselves least.

### And one feature that came out of the same session

**Isolating an Anomaly Feature.** A coloured blob inside a solid block tells a viewer *that*
water departed and almost nothing about its shape - where it begins, how deep it runs, whether
it is one body or three. Every sentence on the Feature panel is measured over one box of water
that a reader could not actually see. "Show only this body of water" clears the rest of the
block away and swings the camera onto it. The rendering needed two things beyond the clip: the
remaining body has to be drawn about four times denser, because the ray no longer accumulates
anything on its way through and at the full-block opacity a single feature is a faint smudge;
and the camera has to move, because a Feature can be anywhere in a 45-degree block and a button
that hides everything without moving the view reads as a button that did nothing.

---

## Third round, found by the author testing the running app (2026-08-29)

Four things, reported from screenshots. Two were real defects in code written the day before,
one was a sentence, and one was a question about wording - which is its own kind of defect,
because a control nobody understands is a control nobody uses.

- [x] **22. "Show only this body of water" isolated the wrong water.**
      The clip box was built north-referenced and the shader reads latitude south-referenced.
      `toTexture` computes `(uBoxMax.z - p.z) / span.z`, and world z is *minus* latitude, so
      that expands to `(lat - south) / (north - south)`: y = 0 is the southern edge, not the
      northern one. Written the other way round it mirrored the box about the region's centre
      line. Measured on the Oman feature, 12.5N to 20.5N: the shipped clip showed **-5.0N to
      4.0N**, about 1800 km from the ring that was pointing at it, which is exactly why the
      surviving blob and its own marker were in different places on screen.
      Measured after the fix, on the same feature: the water that survives spans x 495-598 and
      y 272-379 in a 1600x900 frame, against a feature footprint projecting to x 501-588,
      y 304-331 - inside it, and spread vertically because the body runs 30 m to 100 m.

- [x] **23. The model curve was drawn straight out of the bottom of the Profile chart.**
      The depth axis is trimmed to the depth the *instrument* reached, which is right - a buoy
      whose deepest sensor is 180 m should not be squashed into the top of a 2000 m axis. But
      both curves were still drawn at every depth they had a value for, and the model has values
      far below the deepest sensor. On buoy 5300005's density chart the observations stop at
      60 m, because density needs temperature and salinity together, while the model runs to
      500 m. Eight series across the bake did this. Everything drawn is now clipped to the axis,
      which loses nothing: below the last measurement there is nothing to compare against, and
      comparing is the only thing the chart is for. Extending the axis instead was tried and
      rejected - it drops the measured part of the worst case from 69% of the plot to 30%.
      Verified by walking all 227 instruments across all three Fields, 681 charts: **0 draw
      outside the plot box**.

- [x] **24. "the top 1 measurement of this cast have nothing to compare against."**
      And "This float was not surfacing anywhere near ..." on a moored buoy, which is anchored
      and does not surface. Both now agree with what they are describing.

- [x] **25. The surface-currents note was written for someone who already knew what it meant.**
      "Somebody else's picture, at 0.5 m" is accurate and explains nothing to a first-time
      reader, and nothing on screen said what the colour of an arrow meant. The note now says
      what the arrows show, that pale is slow and dark green is fast, and *then* that the layer
      is a ready-made map image from Copernicus Marine rather than our data - which is why it
      is the one layer with nothing to click.

---

## Found while fixing, and fixed

**A temporal-dead-zone crash that would have broken every float click.** Introduced while
trimming the Profile chart's depth axis to the depth an instrument actually reached: `y()` read
a `const` declared further down the function, and `ribbon` calls `y()` during render. TypeScript
compiled it, the typecheck passed, and the production build was clean - it only appeared as
`Cannot access 'C' before initialization` in the browser, on the first click of a Float.

Worth recording for two reasons. It is invisible to every static check this project runs, and it
was caught only because the verification walked the guided tour end to end and noticed the tour
stopped advancing at step 3. A pass that had stopped at "typecheck and build are clean" would
have shipped it.

---

## Verified after the fixes, on the shipped bake

| | Before | After |
| --- | --- | --- |
| Render hints leaking between Variables | coverage -> temperature left emphasis at 0.00 | every Field returns to 0.85 / 0.03 |
| Instruments claimed on the opening card | 230, every one in the bake | **189 to 216** depending on the Timestep, split into floats and buoys |
| Collocations with nothing to draw | 6 of 212 | **1 of 227**, and it now says why |
| Floats with a thin chart (<= 20 depths) | 10 of 212 | **5 of 221** |
| Panel below the fold at 1366x768 | 43%, three groups hidden | **0%**, every group name on screen |
| Panel below the fold at 1280x720 | 48% | **2%** |
| First picture on a 1.5 Mbit link | 17.1 s | **4.0 s** |
| First-load payload | 3.29 MB | **0.87 MB** |
| External network requests at demo time | 3 (Google Fonts, ~63 KB) | **0** |
| Coverage band luminance ordering | not monotonic even for normal vision | monotonic under normal, deuteranopia, protanopia and tritanopia, lifted and unlifted |
| Smallest text on screen | 8.5 px | 10.5 px; explanatory notes 11 px -> 13 px |
| Sliders with no accessible name | 9 of 9 | **0 of 9**; the 3D view is keyboard-navigable |
| Map key over the depth-ruler caption | at all three sizes | clear at all three |
