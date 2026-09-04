<div align="center">

# Samudra 3D

**Fly into the Indian Ocean and see, in one picture, what the model predicted
and what the instruments in the water actually measured.**

[![Live platform](https://img.shields.io/badge/Live-Launch%20the%20platform-0f766e?style=for-the-badge&logo=googleearth&logoColor=white)](https://rak2315.github.io/samudra-sih26/app.html)
[![Landing page](https://img.shields.io/badge/Landing-samudra--sih26-0891b2?style=for-the-badge)](https://rak2315.github.io/samudra-sih26/)
[![Data provenance](https://img.shields.io/badge/Provenance-every%20figure%20live-155e75?style=for-the-badge)](https://rak2315.github.io/samudra-sih26/provenance.html)

[![SIH 2026](https://img.shields.io/badge/Smart%20India%20Hackathon-2026-ff9933)](https://sih.gov.in/)
[![PS 26067](https://img.shields.io/badge/Problem%20Statement-26067-138808)](https://sih.gov.in/)
[![MoES / INCOIS](https://img.shields.io/badge/MoES-INCOIS-000080)](https://incois.gov.in/)
![Tests](https://img.shields.io/badge/tests-377%20passing-2ea043)
![Probes](https://img.shields.io/badge/browser%20probes-13%20green-2ea043)
![Network calls at demo time](https://img.shields.io/badge/network%20calls%20at%20demo%20time-0-2ea043)

![Python](https://img.shields.io/badge/Python-3.10+-3776AB?logo=python&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)
![Three.js](https://img.shields.io/badge/three.js-WebGL2-000000?logo=threedotjs&logoColor=white)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)
![FastAPI](https://img.shields.io/badge/FastAPI-REST-009688?logo=fastapi&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-multi--page-646CFF?logo=vite&logoColor=white)

<img src="docs/images/hero.jpg" width="880" alt="A three-dimensional block of Indian Ocean water seen from above and to one side, warm at the sea surface fading through orange to deep violet at 2000 metres, with Argo float markers and their drift tracks across the top.">

*Temperature from 5 m to 2000 m over the Arabian Sea and the Bay of Bengal.
The orange band is the thermocline. Every number is INCOIS's own published analysis.*

</div>

---

### In one paragraph, for anyone

India runs computer models of the ocean around it, and India also has robot floats drifting in
that same water taking real measurements. Until now you could not look at the two together: the
model lives in one desktop program, the measurements in another, and both draw flat maps one
depth at a time. **This is a website that draws the ocean as a solid block of water you can fly
inside, from the surface down to two kilometres, with the robot floats sitting in it where they
actually were. Click a float and it shows you what that instrument measured against what the
model predicted at the same spot on the same day, and tells you how far apart they were.** It
opens in a browser, needs no account, and works with the internet unplugged.

---

Built for **Smart India Hackathon 2026**, Problem Statement **26067**
(Ministry of Earth Sciences → INCOIS). Category: Software. Theme: Disaster Management.

**Live:** [landing page](https://rak2315.github.io/samudra-sih26/) ·
[the platform](https://rak2315.github.io/samudra-sih26/app.html) ·
[data provenance](https://rak2315.github.io/samudra-sih26/provenance.html)

## What it looks like

*Every picture below is the running build, captured on 4 September 2026. Nothing is a mockup and
nothing is retouched. The originals live in `assets/screenshots/`, which is the one place any of
them is edited; the copies in `docs/`, `web/public/` and `ppt/` are published from there by
`cd web && node capture.mjs --publish-only --publish`.*

| | |
| --- | --- |
| <img src="docs/images/globe.jpg" alt="The Indian Ocean on a globe with a warm temperature field over India's exclusive economic zone and float drift tracks across it."> | <img src="docs/images/collocation.jpg" alt="The ocean block with one float highlighted, and a panel comparing what it measured against what the model said at 996 depths."> |
| **Globe view.** The colour on the sea is the field you are about to fly into. One continuous motion unrolls the globe into the study region. | **Click a float.** What the instrument measured on the way down against what the model said at that exact place and time. Here: **996 depths compared, 0.17 °C average gap, 0.47 °C RMS.** |
| <img src="docs/images/volume.jpg" alt="The ocean block seen from the side, warm yellow at the surface fading through orange to deep violet at 2000 metres."> | <img src="docs/images/isosurface.jpg" alt="A shaded three-dimensional surface showing the undulating 17.7 degree Celsius isotherm inside the water."> |
| **The water column.** 5 m to 2000 m as one solid, see-through body, ray-marched on your GPU. The depth axis is stretched 1800 times so the column is readable, and a ruler keeps the real metres honest. | **Isosurface.** A surface of one constant value, visibly doming. The depth of an isotherm like this is what drives cyclone-intensity forecasts. |
| <img src="docs/images/density.jpg" alt="The ocean block drawn in the density palette, pale at the surface and deep purple below."> | <img src="docs/images/salinity.jpg" alt="The ocean block in the salinity palette, with the fresh Bay of Bengal in dark blue against the salty Arabian Sea in yellow."> |
| **Density**, computed here from temperature and salinity via TEOS-10. The Bay of Bengal is 0.8 °C *warmer* than the Arabian Sea and still 3.0 kg/m³ *lighter*, because the rivers make it fresher. | **Salinity.** The same two seas, and the reason for that density: the Ganges and Brahmaputra make the northern Bay 3.6 PSU fresher than the Arabian Sea. |
| <img src="docs/images/bias.jpg" alt="Instrument markers recoloured by how far the analysis sat from each one, with a ranked list of the worst beside them."> | <img src="docs/images/coverage.jpg" alt="The ocean block drawn as observation coverage, in four flat colour bands from grey through red and amber to green."> |
| **The bias map.** Every dot stops meaning "an instrument" and starts meaning "how wrong the analysis was here", ranked worst first. INCOIS assimilate Argo, so the **9 moored buoys are the independent check: 0.75 °C typical gap against 0.17 °C across 221 floats.** | **Observation coverage.** Not the model - the *evidence* for it. **9.9%** of the block has no Argo cast behind it, and the picture shows exactly where. |
| <img src="docs/images/anomaly.jpg" alt="The ocean block as a temperature anomaly, red and blue, with rings marking each body of water that departed."> | <img src="docs/images/normal.jpg" alt="Departure from the thirty-year normal drawn through the water column, with warm red patches and cool blue ones."> |
| **Anomaly features.** Every body of water that departed from its own average gets a ring. Click one and it tells you why it is there, and whether anything measured it. | **Against a thirty-year normal.** The other question, and the difference is the point: this is NOAA's 1991-2020 mean for the same calendar month, which is what a forecaster means by "warmer than usual". |
| <img src="docs/images/hazard.jpg" alt="Cyclone heat potential draped on the sea surface, deep red over the Bay of Bengal."> | <img src="docs/images/d26.jpg" alt="The depth of the 26 degree Celsius isotherm drawn as an undulating sheet suspended inside the block."> |
| **Cyclone heat potential.** The heat stored above 26 °C down the whole column, which is what a storm actually runs on. **Above 60 kJ/cm² is the usual threshold for rapid intensification.** | **Depth of 26 °C.** The same fuel asked the other way: not how much, but how far down. A sheet suspended at its own depth inside the block, and it is not flat. |
| <img src="docs/images/flow.jpg" alt="Thousands of fine trails streaming across the Indian Ocean, drawing the shape of the currents."> | <img src="docs/images/arrows.jpg" alt="The same current field drawn as arrows on one depth, each coloured and sized by speed."> |
| **The current, moving.** A few thousand dots carried by the water at the depth you have sliced to. Drag the depth slider and the whole basin changes direction. | **Or as arrows**, one click away, when you want to read a direction off a place rather than watch the shape of the whole basin. |
| <img src="docs/images/section.jpg" alt="A vertical section cut through the ocean, with Argo casts drawn down it on the same axes."> | <img src="docs/images/spread.jpg" alt="The difference between INCOIS's two independent analyses of the same floats, in red and blue."> |
| **Vertical section.** Draw a line and the platform cuts the ocean open along it, with **every float cast within 150 km of the line** on the same axes. | **Analysis spread.** INCOIS publish two independent analyses of the same floats. Where they disagree is an uncertainty signal that needed no new data at all. |
| <img src="docs/images/explore.jpg" alt="A grid of question cards, each with a short explanation and a caveat underneath."> | <img src="docs/images/kiosk.jpg" alt="The exhibition screen: no panels, one large caption over the water."> |
| **Explore.** The same platform as eight plain questions, for a school class, a stall or a policymaker. Every question carries the caveat its simplification costs. | **Kiosk mode.** `?kiosk=1` hides everything, plays the questions on a loop, and resets a minute after the last visitor walks away. *The one picture here that is deliberately dark: an exhibition screen is a dark screen wherever it stands.* |

<img src="docs/images/drift.jpg" width="880" alt="A drift pin dropped in the water with the track the analysed currents imply running away from it, and the panel reporting the distance, the bearing and the method's own measured error.">

**Drift, with a score.** Drop a pin and the analysed current carries it forward - here 438 km on
a bearing of 208° over 30 days. The first line of the panel says what it is **not**: no wind, no
waves, no leeway, so not a search forecast. What makes it worth shipping is the second half. An
Argo float's track *is* measured drift at its parking depth, so the same integrator was run from
**195 real floats' own positions** and the answer published rather than assumed: **a median
38.5 km out over one Argo cycle**, 87 km at the ninetieth percentile, across 1,908 cycles.

---

## 1. What problem are we solving?

India's ocean territory is enormous. INCOIS (the Indian National Centre for Ocean Information
Services, in Hyderabad) runs computer models of that ocean and also collects real measurements
from robot instruments floating in it. Both are valuable. Both already exist.

The problem is that **nobody can look at them together.**

Today an ocean forecaster has to:

- open one desktop program to see the model's temperature map,
- open a *different* program to see what a floating robot measured,
- flip between them, and work out in their head whether the two agree.

And almost every tool only draws **flat maps** - one depth at a time. The ocean is not flat. It
is 4 kilometres deep, and the interesting things happen *in the vertical*.

The problem statement lists the gaps directly:

| Gap INCOIS identified | What that means in plain words |
| --- | --- |
| No web-based 3D view of ocean model data | You need to install software, and you still only get flat maps |
| No way to show float data next to model data | Model and reality live in separate windows |
| No interactive controls | You cannot change depth, time, or colours while looking |
| Cannot add new data without re-engineering | Every new instrument means rewriting the tool |
| Hard to understand 3D ocean phenomena quickly | Slows down cyclone warnings, search-and-rescue, fishing advisories |

## 2. What we built

A website. You open a link - nothing to install.

1. **You start on a globe.** India's ocean territory is coloured with INCOIS's real temperature
   data. Little markers are the robot floats currently reporting.
2. **You press "Dive into the water".** The globe unrolls into a flat map and the ocean opens
   into a solid, see-through 3D block of water. You are looking at temperature at every depth
   from 5 m down to 2000 m, all at once.
3. **You click a float.** A chart appears showing what that float actually measured going down,
   drawn on top of what the model said at the same place and time. The gap between the two lines
   is shaded, and we show you the average disagreement as a number.

That third step is the thing that does not exist today.

4. **You switch to Density, and the picture changes.** Density is not downloaded; it is worked
   out here from the temperature and salinity analyses using TEOS-10. The northern Bay of Bengal
   turns out to be 0.8 degrees *warmer* than the Arabian Sea and still 3.0 kg/m3 *lighter*,
   because the Ganges and Brahmaputra make it 3.6 PSU fresher. No temperature map can show you
   that, and it is why a cyclone crossing the Bay meets water that will not mix away beneath it.

5. **You switch to Temperature Anomaly, and click a blob.** Every body of water that departed
   from its own average is ringed. Click one and the panel tells you where it is, how unusual it
   is, *why* it is there - usually because the 20 °C line swept up or down through that water -
   what salinity and density did, and how many Argo casts stand behind it. Ten of the 121 have
   nothing behind them at all.

6. **You switch to Observation Coverage.** The model disappears and the evidence takes its
   place: how many Argo casts were actually taken near each point. 9.9% of the block
   turns out to have none at all, which means the analysis there is interpolation rather than
   observation. A model has a value everywhere whether or not anyone measured; this separates
   the two.

7. **You open Drift and drop a pin.** The current field is integrated forward from wherever you
   clicked and the trajectory is drawn - and the first line of the panel says what it is not: a
   real search needs surface wind, wave drift and the object's own leeway, and this has none of
   them. What it does have is a score. An Argo float's track *is* measured drift at 1000 m, so
   the same maths was run from **195** drifting floats' own positions, over the days the
   current field actually covers: from a position known one Argo cycle ago it lands a median
   **38 km** from where the float went, 87 km at the ninetieth percentile, across 1,908 cycles.
   No other drift demo tells you that, because
   none of them has the observations in the same file.

8. **You drag your own NetCDF file onto the panel.** Its variables appear in the Variable
   selector under a tab called YOURS, and behave exactly like the built-in ones - same
   colourbar, same depth slice, same isosurface, same 3D water. If the file cannot be read, it
   says **which axis** it could not find rather than drawing something: a file with no longitude,
   a sigma-level vertical coordinate, an ensemble dimension or an ocean somewhere else are all
   refused by name. This is the one clause in the problem statement every team will claim and
   almost nobody can have falsified in front of them.

9. **You draw a line across the Bay of Bengal.** The platform cuts a vertical section along it -
   depth down, distance across, temperature as colour - and puts every Argo cast within 150 km of
   that line on the same axes, each drawn down to the depth it actually reached. This is the
   standard figure of physical oceanography, the one in every textbook and every INCOIS report,
   and it is cut **live from the model's own grid** rather than from the rendered block. It works
   with the network unplugged: the three collocated variables ship their native full-precision
   grids in the build, 7.0 MB for all three across all twelve analyses.

10. **You switch to "Temperature vs Normal".** The other Change variable is a departure from
    this bake's own four months, which is a seasonal swing and says so. This one is a departure
    from NOAA's **World Ocean Atlas 2023 1991-2020** mean for the same calendar month - what a
    forecaster actually means by "warmer than usual". Across 349,692 cells the mean departure is
    -0.01 °C and the 95th percentile of the magnitude is 2.10 °C. Below 1500 m the atlas has no
    normal, so the deepest water is blank rather than zero.

11. **You open "Model vs instruments" and tick one box.** Every instrument is recoloured by how
   far the analysis sat from what it actually measured - blue where the model reads low, red
   where it reads high - and a ranked list names the worst eight. Click one and its comparison
   opens. This is step 3 done 230 times at once, and the northern Bay of Bengal - **15-20 N,
   85-90 E**, where the Ganges and Brahmaputra plume is - is in the worst three 5 degree boxes
   for all three variables: worst for salinity, second for density, third for temperature. The
   typical temperature gap there is **0.69 degC** against 0.19 degC across the whole basin.

   The panel splits the two kinds of instrument, because they are not answering the same
   question. INCOIS **assimilate Argo**, so a float's residual is largely the analysis agreeing
   with an observation it was fed; the nine moored buoys are not assimilated. Measured: the
   typical temperature gap is **0.17 degC** across 221 floats and **0.75 degC** across the 9
   buoys, and pooled into one number the buoys disappear.

12. **You switch to Currents.** A few thousand dots stream across the basin, carried by the
    analysed current at whatever depth you have sliced to, each with a fading trail behind it.
    Drag the depth slider from 5 m to 1000 m and the whole basin changes direction. It is one
    click back to arrows, which is the mark the problem statement names and the one that survives
    a screenshot.

    The dots are not decoration and they are not a forecast. They run **the same integrator as
    the drift model** - `midpointStep` and `sample` in `drift.ts`, the two functions whose error
    is published above - so this is the only current animation anywhere that comes with a
    measured skill attached. Measured against a drift pin from the same start point over the
    same elapsed ocean time: **0.002 km apart after 724 km of travel**.

    The trails are drawn in one ink - near-white on the dark console, near-black on the light
    one - and carry **direction only**. That is the single mark in this platform not coloured by
    its own value, and it is deliberate: a trail tinted by speed sits on water coloured by the
    same speed through the same palette, so over slow water it is pale on pale and disappears.
    The speed is still carried by the water underneath, by how far a dot travels per frame, and
    by the real number under your cursor, and the map key says which is which.

    The honest limit is said out loud in the guide entry: INCOIS's grid is 1 degree, about
    110 km a cell, so this draws the Somali Current, the monsoon gyre and the equatorial jets and draws **no eddies at
    all** - every swirl in a 1/12 degree rendering of this water is smaller than one of our cells.

### Two more doors, for the half of the problem statement that is not about forecasters

The problem statement gives Public Outreach and Science Communication its own section and names
five audiences and three settings by hand: school and college students, the general public at
awareness campaigns, policymakers, outreach events, exhibitions and e-learning. Fifteen variables
in five groups is the right toolkit for a forecaster and the wrong first minute for any of those.
So there are two more ways in, and **the control panel gained nothing**.

- **Show me around.** A guided walk in **six chapters and 21 steps** that visits **every one of
  the 43 controls the platform explains**. Each step drives the scene, opens the group the
  control lives in on the left, and opens its explanation on the right. `probe-tour.mjs` fails if
  a control ever has no step, so "it covers everything" is a measurement and not a promise.
- **Explore.** The same platform as **eight questions**: *Where could a cyclone get stronger?
  Where is the model guessing? How far is the model from the instruments? Has this ocean changed?
  Where would something adrift go? Why are India's two seas so different? What does one robot
  float actually do? How deep is the ocean, really?* Press one and the whole scene is set up.
  Every question carries the caveat its simplification costs, beside the answer and never after
  it - the cyclone one says in as many words that it is a map of conditions and not a forecast.
- **`?kiosk=1`.** The exhibition screen: no panels, type at reading-from-across-a-room size, the
  questions on a loop, and a **reset 60 seconds after the last visitor walks away**, so the next
  one does not arrive at a broken view. The depth ruler grows a second line there - 1000 m
  becomes *a sperm whale hunting*. Escape puts the console back.
- **Copy this view.** The link button on the top bar writes whatever is on screen - the variable,
  the date, the depth, the pin, the section line - into a URL. A teacher's worksheet is six links.

### Fifteen variables, thirteen of them computed or fetched here

INCOIS publish exactly two of them. Everything else is worked out in the bake from what they
publish, or read from a second provider through an adapter of its own - which is the problem
statement's "additional model variables with minimal code change" demonstrated rather than
asserted. They are grouped the way a forecaster thinks rather than the way the data arrived.

| Group | Variable | Where it comes from |
| --- | --- | --- |
| Ocean state | **Temperature** | INCOIS 10-day gridded Argo analysis, 24 levels |
| Ocean state | **Salinity** | the same analysis |
| Ocean state | **Density** | TEOS-10 sigma-theta from the two above, at each cell's own pressure |
| Change | **Temperature anomaly** | departure from the mean of the 12 baked timesteps - a seasonal swing, *not* a climatological normal, and the app says so |
| Change | **Temperature vs normal** | departure from NOAA's World Ocean Atlas 2023 **1991-2020** mean for the same calendar month. The climatological one. `docs/adr/0016` |
| Evidence | **Observation coverage** | Argo casts within 334 km whose dive passed through each depth. Ours |
| Evidence | **INCOIS cast count** | INCOIS's own count, from their second (Kessler-McCreary) analysis |
| Evidence | **INCOIS error estimate** | INCOIS's own RMSE, from the same analysis |
| Evidence | **Analysis spread** | the difference between INCOIS's two independent analyses of the same floats - an uncertainty signal that needed no new data |
| Circulation | **Current speed** | Copernicus Marine's 1/12 degree analysis, landed on the model's axes. ADR 0013 |
| Hazard | **Cyclone heat potential** | heat above 26 degC integrated over the whole column. ADR 0014 |
| Hazard | **Depth of 26 degC** | where the 26 degC isotherm sits |
| Hazard | **Mixed layer depth** | from the density profile |
| Hazard | **Isothermal layer depth** | from the temperature profile |
| Hazard | **Barrier layer thickness** | the difference between the two above |

The five Hazard variables are the quantities INCOIS published operationally until 2019-03-30 and
then stopped. Three of them *are* a depth, so they are drawn as a sheet inside the block rather
than as a block; two are a total for the whole column, so they are draped on the sea surface.

One more quantity is on screen and is deliberately *not* a variable, because it did not go
through this pipeline:

| Layer | What it is |
| --- | --- |
| **Chlorophyll** | Measured by 52 Argo floats that carry a fluorometer. Drawn on its own, because no gridded chlorophyll shares this timeline - INCOIS's own ocean-colour products end in 2006 and 2020 - so there is nothing to compare it against |


### Three kinds of instrument in the water

| Instrument | Count | What it gives |
| --- | --- | --- |
| **Argo floats** | 228, of which 52 carry chlorophyll | A cast every ten days, drifting; 3,718 casts across the window |
| **Moored buoys** | 9 - four from India's OMNI network, three RAMA | A water column at a *fixed point*, every few hours. Because they never move, their comparison follows the timeline: you watch one patch of ocean through the whole season, which an Argo float cannot show you |

The buoys arrive through NOAA's public GTS feed in a format that shares nothing with Argo's -
depth instead of pressure, one row per level, the surface reading in a different column, no
quality flags at all. Absorbing that cost one class behind the same interface, which is the
extensibility claim demonstrated on somebody else's format rather than on a second copy of ours.

### It runs on INCOIS's real data

This is not a mock-up with invented numbers. It reads:

- **INCOIS's own public data server** for the model field - their 10-day gridded Argo analysis,
  temperature and salinity on 24 depth levels, updated continuously. Our demo data goes up to
  **30 July 2026**.
- **The global Argo float network** for the real measurements - 228 floats and 3,718 casts
  across the Arabian Sea, Bay of Bengal and equatorial Indian Ocean, of which 225 carry a
  full model-versus-instrument comparison in all three collocated Fields. Argo's own quality flags are honoured per channel, so
  a float whose salinity sensor has failed still contributes its good temperature.

## 3. Requirement coverage, clause by clause

Every line of Problem Statement 26067 below, marked honestly. The gaps are listed as plainly
as the wins, because a reviewer will find them anyway and it is better they hear it from us.
Where something is *not* built, the row says what we measured before deciding: a dead endpoint, a
date that cannot share this timeline, or a judgement that building it badly would be worse than
leaving it.

**The same table is served as a page you can click through**, at
[`/requirements.html`](https://rak2315.github.io/samudra-sih26/requirements.html): every clause
word for word, the measured figure read live from the build's own manifest, and a link beside
each one that opens the platform with the control that answers it already set.

### The five gaps INCOIS identified

| Gap in the problem statement | Status | What we built, or what is missing | Where |
| --- | --- | --- | --- |
| Web-based, platform-independent 3D rendering with depth-resolved volumetric views | **Met** | GPU ray-marched water column, 5 m to 2000 m, in any WebGL2 browser. No install, no plugin | `web/src/scene/volumeShader.ts` |
| Unified display of Argo **and Glider** profiles (lat, lon, depth, time, temperature, salinity, chlorophyll) alongside model fields | **Argo met, gliders answered** | Argo fully, including **chlorophyll** from 52 BGC floats, plus 9 moored buoys. **Gliders now have an adapter of their own**, reading the exact FTP archive the problem statement names. What it finds is the answer rather than an excuse: every one of the **824,641** lines of the global index was scanned and this box holds **1 glider, 2 deployments, 2,876 casts**, newest **2022-10-14**, and nothing at all since. The gap is India's glider programme | `pipeline/samudra/sources/glider.py` |
| Interactive controls: variable selection, depth-slice navigation, time-step animation, customisable colourbars | **Met** | All four, live | `web/src/ui/Controls.tsx`, `Timeline.tsx` |
| Ingest new data streams or model variables without significant re-engineering | **Met** | One adapter class per provider. Proven rather than asserted, twice over: two Argo providers that disagree about every column name share one parser, and the September 2026 round added **three more providers** - INCOIS's second analysis, Copernicus Marine and the EGO glider archive - touching no renderer, no API endpoint and no UI file | `pipeline/samudra/sources/base.py` |
| Tools for intuitive, rapid understanding of 3D phenomena | **Met** | Every control explains itself in plain language, and says whether it changed the science or only the picture | `web/src/guide.ts` |

### The six core functional requirements

| Requirement | Status | Detail | Where |
| --- | --- | --- | --- |
| **3D volumetric rendering** across the full water column | **Met** | Temperature and salinity, ray-marched | `volumeShader.ts` |
| ...with depth-slice views | **Met** | Two sliders cut the block to any depth range | `Controls.tsx` |
| ...with isosurface extraction | **Met** | Draws the surface at one chosen value, e.g. the 20 °C isotherm | `volumeShader.ts` |
| ...with time-step animation | **Met** | Play button, 12 analyses over 4 months | `Timeline.tsx` |
| ...using WebGL / Three.js or Cesium.js | **Met** | Three.js and WebGL2. Why not Cesium: `docs/adr/0001` | `OceanScene.ts` |
| ...of **current vectors** | **Met** | Copernicus Marine's own analysis at 1/12 degree - twelve times finer than the INCOIS grid - read as **numbers** and baked as float32 on the model's own axes. Arrows sit on the depth you have sliced to, coloured by speed, with a real value under the cursor. This was a rendered image until a free Copernicus account was registered; the credential lives in the bake and never in the browser. Held to the same test that killed our own derived field and passing it: **2.94 m/s at 9.5 N, 51.5 E** on the last Timestep, which is the Somali Current core in the month it peaks, against 0.16 m/s in the wrong place from the derivation. `docs/adr/0013` | `pipeline/samudra/sources/copernicus.py` |
| **Instrument overlay** with geospatially accurate markers | **Met** | Floats drawn at the position they held at the moment on screen, with drift tracks | `OceanScene.ts` |
| ...click a float to inspect a depth-vs-variable profile chart with timestamps | **Met** | Observed against modelled on one axis, gap shaded, cast and analysis dates named | `ProfilePanel.tsx` |
| ...of **Glider, CTD and BGC** data | **BGC met, gliders read, CTD refused** | **BGC is wired up**: chlorophyll from 52 Argo floats, live in this window. **Gliders now have an adapter** and it reads the archive the PS names; the newest cast in this box is 2022-10-14, so the finding ships rather than a 2022 instrument drawn at a 2026 analysis. Ship CTD stays out on a measurement: the newest GO-SHIP section here is Apr 2025 | `sources/glider.py`, `docs/plan/03-requirement-gaps.md` |
| **Multi-format ingestion**: NetCDF via xarray backend | **Met, and demonstrable** | `xarray` + `netCDF4`; PyNIO is deprecated upstream and xarray is its sanctioned replacement. Beyond reading providers' NetCDF, **a visitor can drop their own file on the page** and see its variables in the same selector: `POST /api/netcdf` reads it through `sources/netcdf.py`, a Source Adapter behind the same protocol as every provider. The refusals are the point - a missing longitude, a sigma coordinate, an ensemble dimension or an ocean elsewhere in the world are each refused **by name**, with nothing drawn | `sources/netcdf.py`, `api/upload.py` |
| ...and delimited text formats | **Met** | The Argo CSV parser, with the column layout stored as data rather than code | `sources/argo.py` |
| ...modular, new sources with minimal code change | **Met** | See the gap table above. Nine adapters now, and the ninth reads a file that did not exist when the code was written | `sources/base.py` |
| **Colourbar editor**: palette, min/max range, log/linear | **Met** | Both range handles, and the range is analytical rather than cosmetic - water outside it is not drawn at all. **The log/linear toggle now works**: it was cut because the shader bent the water while the colourbar stayed straight, which was a bug rather than a reason. There is now exactly one curve, in one file, exported as a function for the colourbar and as the identical GLSL for the ray marcher. Still no palette chooser: each variable carries the cmocean scale designed for its quantity, because a chooser let you put an oxygen scale on temperature. `docs/adr/0010` | `web/src/transfer.ts` |
| **Variable selector** | **Met** | **15**, in five groups the way a forecaster thinks rather than the way the data arrived: **Ocean state** 3 &middot; **Change** 2 &middot; **Evidence** 4 &middot; **Circulation** 1 &middot; **Hazard** 5, plus a **Yours** tab whenever a visitor has dropped a file in. INCOIS publish two of them; the rest are computed here or read from a second provider, which is the extensibility claim made visible rather than argued | `Controls.tsx` |
| **Layer opacity control** | **Met** | Water opacity, plus a feature-emphasis slider | `Controls.tsx` |
| **Vertical exaggeration slider** | **Met** | 200x to 3500x, with the real depths labelled on the flank | `Controls.tsx`, `DepthRuler.tsx` |
| **Modern JS frontend** | **Met** | TypeScript, React 19, Vite | `web/` |
| **Lightweight REST API backend** | **Met** | FastAPI, including live collocation for any float, a vertical section along any line, and the NetCDF upload | `api/main.py` |
| ...**OPeNDAP** API backend | **Met** | DAP2 over the native grids: `.das`, `.dds`, `.dods` with constraint expressions. Verified by opening our own endpoint with `xarray` + `pydap` in the test suite. (ERDDAP's griddap *is* DAP2, so we always consumed OPeNDAP; what was missing was serving it) | `api/dap.py` |
| **Deployable on INCOIS infrastructure with no client-side dependencies** | **Met** | Static site plus one Python service. No tokens, no accounts, no plugins | `web/`, `api/` |
| **Extensible design** for CTDs, moorings, HF-radar, ADCP | **Met for moorings and gliders** | Moored buoys are wired up through NOAA's public GTS feed - a genuinely different format (depth not pressure, one row per level, no quality flags) absorbed behind the same protocol - and the glider archive has its own adapter reading a 248 MB directory index. 9 buoys were reporting when this build was baked. HF-radar and ADCP stay unmet because India's are behind a login, not because the seam cannot carry them | `sources/osmc.py`, `sources/glider.py` |
| **Vertical section** along a line you draw | **Met, and not asked for** | The standard figure of physical oceanography, cut live from the native grid along a great circle between two points you click, with every cast within a corridor of the line on the same axes and drawn to the depth it reached. Reads the model's own 24 levels, never the depth-warped rendering volume. The three collocated variables ship their full-precision grids in the build - 7.0 MB - so it works offline and on the static site, and `/api/section` serves the same cut to anything else. The browser's answer is checked against the pipeline's value by value: 1,102 values, worst gap **5.07e-5 °C** | `samudra/section.py`, `web/src/section.ts` |
| **Search-and-rescue support**, named in the PS's own list of impeded mandates | **Built, and scored** | Drop a pin; the Copernicus current field is integrated forward from it at the depth you have sliced to. **Never labelled a search forecast**: a real one needs surface wind, Stokes drift and object-specific leeway, and this carries none of them, which is why INCOIS run SARAT. The reason it ships anyway is that it checks itself - an Argo track is measured drift at the parking depth, so the same integrator was run from **202** floats' own positions and the result published: median **39 km** out over one Argo cycle, 88 km at the ninetieth percentile, and by 30 days the separation is the same size as the distance travelled. `docs/adr/0015` | `pipeline/samudra/drift.py` |
| **Where the model disagrees**, found automatically | **Met, and not asked for** | Two scans, over two different questions. *Where did the field depart from its own average* is the Anomaly Features: 121 connected bodies across the twelve steps, each ringed and explained. *Where does the model depart from the instruments* is the bias map: every collocated instrument coloured by its gap and ranked worst first, with the region binned onto 5 degree boxes so a regional bias is distinguishable from scatter. **Neither is AI and neither is captioned as one** - there is no model, no training set and no confidence score, only the mean and the RMS of residuals already measured | `samudra/anomaly.py`, `samudra/residuals.py` |
| ...and **machine-learning derived products** | **Not met** | Named as an extension point. Inventing one would be inventing a requirement | - |

### Standards and outreach

| Clause | Status | Detail |
| --- | --- | --- |
| **CF Conventions for NetCDF** | **Met** | We read INCOIS's CF-1.6 and now write CF-1.8: `/api/netcdf/{field}/{index}` serves a self-describing file with real standard names. Fields with no standard name - the anomaly, coverage - carry a `long_name` and no invented one |
| **OGC WMS / WCS** | **Partly** | WMS 1.3.0 is served, with both axis orders handled and tested. It publishes the fields that exist nowhere else - density and the anomaly - because INCOIS's own ERDDAP already serves WMS for their temperature, so re-serving that is re-publishing. **WCS is not built**, deliberately: no maintained Python server, and the numbers are already on OPeNDAP |
| **Interoperability with data portals** | **Partly** | We read **8** independent sources through open APIs - INCOIS, Ifremer Coriolis, NOAA AOML, EMODnet Physics, Copernicus Marine, NOAA NCEI - each behind one adapter, plus a ninth that reads a NetCDF file a visitor supplies, and expose OPeNDAP and WMS so a sixth system could read us back. We are not listed in anybody's catalogue, which a prototype should not be |
| **Climate monitoring**, named in the PS's own list of impeded mandates | **Met** | Two Change variables, and the difference between them is the point. The Temperature Anomaly is a departure from this bake's own four months and says so. **Temperature vs Normal** is a departure from NOAA's World Ocean Atlas 2023 1991-2020 mean for the same calendar month, which is what a forecaster means by "warmer than usual". Read anonymously over OPeNDAP at bake time - no account at any point. Measured across 349,692 cells: mean -0.014 °C, 95th percentile of the magnitude 2.104 °C. Below 1500 m the atlas has no normal and the field is blank rather than zero. `docs/adr/0016` |
| **Public outreach and science communication** | **Partly** | The problem statement gives this its own section and names five audiences and three settings. Against them: **Show me around**, a guided walk in six chapters and 21 steps that visits all **43** explained controls, with a probe that fails if one is ever missed; **Explore**, the platform as eight questions each of which sets the whole scene up and each of which carries the caveat its simplification costs; **`?kiosk=1`**, an exhibition screen with no panels, the questions on a loop and a reset 60 seconds after the last visitor leaves; and **copy this view**, which writes what is on screen into a link a teacher can put on a slide. Still **Partly**, for two stated reasons: there is no printable one-page brief for the policymaker row, and the app has one media query, at 1180 px, so laptops are fine and phones are not |

### The honest summary

Everything about **rendering, overlaying, controlling and comparing** is built and working, and
so is everything about **serving it back out**: OPeNDAP, CF-1.8 NetCDF and OGC WMS all run over
the native analysis grids, never over the rendering volume.

The September 2026 round closed the three clauses that were open, and each of them closed on a
measurement rather than on effort:

- **Current numbers.** They are numbers now. A free Copernicus Marine account was registered, the
  credential lives on the machine that bakes and never in the browser, and the field was held to
  the same test that killed our own derived one: **2.94 m/s at 9.5 N,
  51.5 E** on the last Timestep against 0.16 m/s in the wrong place. The one honest
  cost is one sentence: no account to view or use this platform, one free account to rebuild its
  data. ADR 0013.
- **The log scale.** Built, and the reason it was cut turned out on rereading to be a bug report:
  the shader applied a curve and the colourbar beside it did not. One curve now, in one file,
  used by both. ADR 0010, amended.
- **Gliders.** The adapter is built and it reads `ftp.ifremer.fr/ifremer/glider/v2/`, which is the
  archive PS 26067 names. The finding is the deliverable: **1 glider,
  2 deployments, 2,876 casts** in
  this box, newest **2022-10-14**, nothing since. Drawing a 2022
  instrument at a 2026 analysis would claim an observation that does not exist, so the casts stay
  off the map and the measurement goes on the requirements page. **The gap is India's glider
  programme, not our adapter.**

And it added the thing the revised problem statement is actually about. The theme is now
**Disaster Management**, and INCOIS used to publish exactly the quantities a cyclone forecaster
asks for - depth of the 26 degC isotherm, heat content, mixed layer depth, isothermal layer depth.
**That series stopped on 2019-03-30**, measured twice and independently. All five are computed
here from the temperature and salinity already in the grid, so this fills a gap INCOIS has rather
than duplicating something they ship. ADR 0014.

What is still missing is **ship CTD** - newest section here April 2025, which cannot share this
timeline - and **HF-radar and ADCP**, which are behind a login that does not resolve. Both are
data-policy facts rather than architecture gaps.

The one clause we chose not to build at all is **ML-derived products**, and that refusal is
worth more than the feature. We already built the thing ML would be used for and built it
better: the anomaly detector reports a z-score against a stated threshold and says how many
observations stand behind each departure. Relabelling that as AI would replace a defensible
number with an indefensible one, and "trained on what?" has no answer when the series is twelve
steps long. Worse, the obvious application - filling the gaps - would paint smooth, believable
temperature over the 9.9% of the block where nobody measured, which is the one honest
hole this platform is proudest of. See
[`docs/plan/03-requirement-gaps.md`](docs/plan/03-requirement-gaps.md).

### Two things we are proud of that were not asked for

- **The dive is one continuous motion.** The globe genuinely unrolls into the map - every
  coastline point slides from its position on a sphere to its position on a flat map. It is not
  a cut or a fade between two different screens.
- **Featureless water is transparent; interesting water is solid.** We precompute how fast
  temperature is *changing* at each point, and make the still water see-through. So the
  thermocline - the sharp boundary that matters most for cyclones - is the thing you actually
  see, instead of a wall of warm surface water hiding everything.

## 4. How to run it

You need Python 3.10+ and Node 20+.

```bash
# 1. install
python -m venv .venv
.venv/Scripts/pip install -r requirements.txt      # Linux/macOS: .venv/bin/pip
cd web && npm install && cd ..

# 2. get the data (a few minutes; INCOIS, Argo, BGC-Argo, NOAA's buoy feed and Copernicus)
cd pipeline && ../.venv/Scripts/python -m samudra.bake && cd ..

# 3. run the website
cd web && npm run dev            # then open http://localhost:5173

# 4. (optional) run the API too
.venv/Scripts/python -m uvicorn api.main:app --port 8000
```

The API serves the REST endpoints the app cannot precompute, and three open standards over the
same analysis grids:

```bash
# OPeNDAP - open our own endpoint from Python, no download
python -c "import xarray as xr; print(xr.open_dataset(
  'http://localhost:8000/opendap/temperature/11', engine='pydap'))"

# CF-1.8 NetCDF
curl -O http://localhost:8000/api/netcdf/density/11

# OGC WMS 1.3.0
curl 'http://localhost:8000/wms?service=WMS&request=GetCapabilities'
curl -o map.png 'http://localhost:8000/wms?service=WMS&version=1.3.0&request=GetMap&layers=density&crs=CRS:84&bbox=55,-10,100,25&width=800&height=622&format=image/png'
```

If you skip step 2, the data is already committed, so the website still works.

**Tests:** `cd pipeline && ../.venv/Scripts/python -m pytest` - 377 tests covering the depth
warp, volume encoding, grid interpolation, collocation maths, the Argo parser, observation
coverage, the TEOS-10 density chain, the anomaly baseline and the features found in it, the
isotherm depth, the adapter seam that lets four providers with incompatible layouts share one
protocol, the colour-vision ordering of the coverage bands, the current-tile arithmetic, and the
OPeNDAP and WMS endpoints - the DAP2 one checked by opening it with a real `pydap` client rather
than by asserting on our own bytes.

**And thirteen probes**, which are a different thing from tests: they drive the built app in a
real browser and measure what reaches the screen, because every bad bug in this project's history
looked like a shader bug and was not. They check that the browser's drift integrator and vertical
section agree with the pipeline's; that every control has an explanation and every figure in one
came from the bake; that the moving flow is the drift model and puts no dot on land; that the
guided walk visits all 43 controls and survives every step; that each Explore question sets up
its own answer and the exhibition screen advances with nobody standing at it; and that the
landing page names no picture that is not there and keeps its headline readable in both themes.

## 5. Architecture

<img src="docs/images/architecture.png" width="900" alt="The architecture in four zones: eight open sources, one source-adapter seam in Python, two representations of the same data - the Grid which is the scientific truth and the Volume which is a picture for the GPU - and four ways the data leaves: the browser, the static bake, the REST API and the open standards.">

*Rendered from [`scripts/ppt_diagrams.html`](scripts/ppt_diagrams.html) by
`cd web && node render-diagrams.mjs`, the same way every picture in the deck is made. There is
one drawing of this system and both documents show it, because two drawings drift apart and
nothing notices.*

### The shape of it, in one paragraph

**Nine adapters read nine formats and hand back one thing: a `Grid`.** Everything
after that point is written against the `Grid` and has never heard of ERDDAP, of FTP, or of
NetCDF.
A build step called the **bake** reads the `Grid`, works out the fifteen `Field`s, and writes a
folder of static files. The browser downloads that folder and draws it, and never asks a server
for anything. A small Python service answers the questions a folder of files cannot answer, and
speaks three open standards so other software can read the same numbers back out.

### Three layers, and the seam between each pair

| Layer | What it is responsible for | The seam below it |
| --- | --- | --- |
| **`pipeline/`** &middot; Python | Reading every provider, quality-controlling every observation, computing every derived `Field`, and writing the bake. **All the tested logic in the project lives here** - 377 tests | `samudra/sources/base.py`. A provider is one class implementing `GridSource` or `ProfileSource`. Nothing above this file knows a provider exists |
| **`api/`** &middot; FastAPI | Answering what a static folder cannot: a collocation for an instrument the bake did not precompute, an arbitrary column, an arbitrary section line, and a NetCDF file a visitor uploads. Also serves OPeNDAP, CF-1.8 NetCDF and OGC WMS | `data/grids/*.npz`, the native `Grid` saved server-side. **Every endpoint reads the `Grid`. None of them can reach a `Volume`** |
| **`web/`** &middot; React + TypeScript + Three.js | One WebGL scene for both the globe and the ray-marched block, every control, every panel, and the two pieces of science that have to run offline | `web/public/data/`, the bake. The browser reads files, not endpoints - the only exception is a file the user themselves drops on the page |

They are genuinely separable. The pipeline runs with no browser, the browser runs with no API,
and the API runs with no browser. That is not tidiness for its own sake: **the demo has to
survive a dead venue network**, and the public deployment at `rak2315.github.io` has no API
behind it at all.

### The data path, end to end

**Path one - the one the demo runs on.** Nothing here happens at demo time.

1. **Provider.** Eight public endpoints, every one tested and dated in
   [`docs/plan/00-data-sources-verified.md`](docs/plan/00-data-sources-verified.md). INCOIS's
   ERDDAP for two gridded analyses, Ifremer for Argo profiles and chlorophyll, NOAA's OSMC feed
   for moored buoys, Copernicus Marine for current vectors, Ifremer's FTP archive for gliders,
   and NOAA NCEI for the 1991-2020 climatological normal.
2. **Source Adapter.** One class per provider, subsetting at the *server* so we download one
   region and one window rather than a global file. Argo's own quality flags are read per
   channel, then a regional salinity floor catches what the global standard lets past. Land is
   masked and never filled with a number.
3. **Grid.** `time x depth x latitude x longitude`, float64, on INCOIS's own 1&deg; mesh and 24
   uneven levels from 5 m to 2000 m. Land is `NaN`, not zero. **This is the scientific truth**,
   and everything below is derived from it.
4. **Derive.** Density through TEOS-10, the five cyclone-hazard fields INCOIS stopped publishing
   on 2019-03-30, the anomaly and its 121 automatically-found bodies of water, observation
   coverage, the bias map, and the drift score. Fifteen `Field`s in five groups.
5. **Bake.** For each `Field` and each of the twelve 10-day analyses, write what that `Field`
   actually is. A value at every depth becomes a **`Volume`**: resampled onto an even lattice
   and quantised to four bytes a voxel, because a GPU 3D texture cannot have uneven levels. A
   `Field` whose value *is* a depth, or a total for the whole column, ships as **float32 on the
   `Grid`'s own axes** instead, because a reader reads metres and kJ/cm&sup2; off those. Total,
   **71.1 MB**, committed to the repository.
6. **Browser.** `fetch` the manifest, then the files. Build GPU textures. Ray-march the
   `Volume`. Draw the instruments where they actually were. **Zero network calls to anything
   outside the build**, including the fonts, and CI fails the push if that stops being true.

**Path two - the API, for the questions a folder of files cannot answer.** Live, on demand.

- `data/grids/*.npz` holds the same native `Grid` server-side.
- **14 REST routes** - `/api/collocation/{id}`, `/api/column`, `/api/section`, `/api/floats` and
  the rest - each one interpolating the `Grid` at a position the bake never precomputed.
- **`POST /api/netcdf`** is the only endpoint on the service that accepts anything. A visitor's
  own CF-conventions NetCDF file, as the raw body, parsed by the ninth adapter, held in memory
  for the life of the process and never stored. The platform stays read-only.

### The one rule that governs all of it

> **Never answer a scientific question from the `Volume`.**

The `Volume` is quantised to bytes, warped onto an even depth axis, and back-filled across land
so the GPU has something harmless to blend against. It is a *picture*. Every collocation, every
tooltip, every number in a panel, every API response and every byte served over OPeNDAP, WMS or
NetCDF comes from the `Grid` instead. **This matters most at the API**, because a consumer
pulling a NetCDF file over the wire has no way to see that they have been handed an
approximation. It is why `data/grids/` exists at all.

### The two modules that are deliberately written twice

The standing rule is one implementation in one file. The colour Scale is in
`web/src/transfer.ts` and nowhere else, as a TypeScript function *and* as the identical GLSL
string the shader inlines, because a second copy of it is exactly what got the log scale cut the
first time round - the shader bent the water while the colourbar stayed straight.

**Two things break that rule on purpose**, and both are interactive, and both have to work where
the user is - with the API off on stage, and on a static deployment that has no API at all:

| Written twice | Python | Browser | How the two are held together |
| --- | --- | --- | --- |
| The drift integrator | `pipeline/samudra/drift.py` | `web/src/drift.ts` | `web/probe-drift.mjs` runs the **shipped browser module** from the baked start points. Measured: median **0.331 km**, worst **1.573 km**, over 101 days |
| The vertical section | `pipeline/samudra/section.py` | `web/src/section.ts` | `web/probe-section.mjs` runs the shipped module against `/api/section` value by value. Measured: **1,102** values, worst gap **5.07e-5 &deg;C** |

Do not add a third without the same harness. The current animation is *not* a third: it runs
`midpointStep` and `sample` out of `drift.ts` itself, and `probe-particles.mjs` checks that a
moving dot and a dropped drift pin from the same start point end **0.002 km apart after 724 km**
of travel.

### What goes back out, and to whom

| Consumer | Interface | Reads |
| --- | --- | --- |
| A person with a browser | `app.html`, no install, no plugin, no account | The bake |
| A Python or R user | **OPeNDAP DAP2** with constraint expressions - `.das`, `.dds`, `.dods` | The `Grid` |
| Anything that wants a file | **CF-1.8 NetCDF**, self-describing, real standard names | The `Grid` |
| A GIS | **OGC WMS 1.3.0** `GetCapabilities` and `GetMap` | The `Grid` |
| Another program | 14 REST routes, JSON | The `Grid` |
| Someone with their own data | `POST /api/netcdf`, and the drop target on the page | Their file, through the ninth adapter |

The OPeNDAP endpoint is tested by *opening it with a real `pydap` client*
(`pipeline/tests/test_dap.py`) rather than by asserting on our own bytes, because science
leaving the building is still science.

### The architecture in numbers

| | |
| --- | --- |
| Source Adapters | **9** - 8 providers, plus one that reads a file a visitor drops on the page |
| `Field`s | **15**, in 5 groups, plus a **Yours** tab when a file is dropped |
| Render kinds | **4** - a `Volume`, a depth `Sheet`, a column `Drape`, a `vector` field |
| Analyses baked | **12** Timesteps, 10 days apart, 2026-04-10 to 2026-07-30 |
| Volume lattice | **56 x 36 x 48**, 4 bytes a voxel |
| Instruments | **237** - 228 Argo floats and 9 moored buoys, 52 of them carrying chlorophyll |
| Static bake | **71.1 MB**, committed, **0** network calls to run |
| HTTP routes on the API | **20** - 14 REST and 6 that speak an open standard |
| Tests | **377**, all on the science and on what we serve |
| Browser probes | **13**, measuring what actually reaches the screen |

### The parts a reader is most likely to want to find

| Where | What |
| --- | --- |
| `pipeline/samudra/grid.py` | The scientific truth. Everything that reads a value goes through it |
| `pipeline/samudra/sources/base.py` | The adapter seam. A new provider is one class here and nothing else |
| `pipeline/samudra/bake.py` | The build step: `Grid` in, `web/public/data/` out |
| `api/main.py` | The REST half, and `GRID_SOURCES` / `PROFILE_SOURCES`, the adapter registry |
| `api/standards.py` | OPeNDAP, CF-1.8 NetCDF and OGC WMS, all three off the native `Grid` |
| `web/src/scene/OceanScene.ts` | The renderer: the volume, the sheets, the markers, the draw order |
| `web/src/transfer.ts` | The colour Scale. One curve, one file, two languages |
| `web/src/drift.ts` | The drift integrator, and the step rule the current animation shares with it |
| `web/src/particles.ts` | The moving flow: 2,400 dots with fading trails, on the chosen depth |
| `web/src/guide.ts` | Plain-language explanation of every control. 43 entries, and a probe fails if one is missing |
| `web/src/explore.ts` | The eight questions, and the depth landmarks the exhibition screen shows |
| `web/src/ui/Tour.tsx` | The guided walk: 21 steps, 6 chapters, every control covered |

The design decisions, including the ones that were hard-won, are written up in
[`docs/adr/`](docs/adr/) - seventeen of them. The shared vocabulary and the deliberate scope
limits are in [`CONTEXT.md`](CONTEXT.md).

**Other documents**

| File | What it is |
| --- | --- |
| [`docs/Samudra3D-Dossier.pdf`](docs/Samudra3D-Dossier.pdf) | The full project dossier - problem, solution, every feature, feasibility, impact, and an anticipated-questions section written for non-specialist judges |
| [`docs/demo/script.md`](docs/demo/script.md) | The demo script: 4 minutes of deck, 4 minutes of live demo |
| [`docs/demo/technical-approach.md`](docs/demo/technical-approach.md) | The spoken version of the Technical Approach slide, about 70 seconds |
| [`docs/research/operational-stakes.md`](docs/research/operational-stakes.md) | Sourced figures for the pitch: cyclones, upwelling, the Argo programme |
| [`docs/BUGS.md`](docs/BUGS.md) | Known defects, ranked, with file and line |
| [`ppt/README.md`](ppt/README.md) | **The submission deck folder**: what is in it, the order to use it, and how the pictures and the figures are regenerated |
| [`ppt/DESIGN-SPEC.md`](ppt/DESIGN-SPEC.md) | How the SIH submission deck and every picture in it must look |
| [`ppt/DECK.md`](ppt/DECK.md) | The exact words for each of the six slides, plus an image-generation prompt for every diagram |
| [`ppt/FACTS.md`](ppt/FACTS.md) | Every figure the deck may use, **generated from the build** by `pipeline/scripts/collect_facts.py`. Diff it after a bake |
| [`design/STITCH.md`](design/STITCH.md) | Per-screen prompts for Google Stitch |
| [`docs/plan/01-cut-features.md`](docs/plan/01-cut-features.md) | What was deliberately not built, and what is worth adding back |
| [`CLAUDE.md`](CLAUDE.md) | Orientation for anyone picking this up: a map of every file, the commands, and the rules that matter |
| [`docs/plan/03-requirement-gaps.md`](docs/plan/03-requirement-gaps.md) | Every clause of the problem statement that was unmet, researched endpoint by endpoint, with what was built and what was deliberately not |
| [`docs/plan/00-data-sources-verified.md`](docs/plan/00-data-sources-verified.md) | Every endpoint tested from this machine, live and dead, with dates and row counts |

## 6. What we deliberately did **not** build

Being explicit so nobody assumes we forgot. The full list with reasons is in `CONTEXT.md`.

- Connecting to INCOIS's **internal** archive - that needs credentials we do not have. Our
  Source Adapter is the exact place it would plug in.
- **OGC WCS.** WMS is served; WCS is not. There is no maintained pure-Python WCS server, and the
  numbers are already on OPeNDAP, which is what this community actually uses.
- User accounts, saved sessions, mobile layout, WebGPU, machine-learning products.
- **Flow through the block.** Currents are drawn as moving dots on the depth you have sliced to,
  or as arrows. Advection through the whole *volume* is refused: it needs a vertical velocity and
  neither provider publishes one, so a 3-D particle would claim a motion nobody measured. ADR 0017.
- **Glider casts on the map, and ship CTD.** The glider adapter is built and reads the archive
  the problem statement names; neither source can share this timeline, because the newest glider
  cast in this basin is Oct 2022 and the newest GO-SHIP section is Apr 2025. The glider *finding*
  ships instead of the casts.
- **India's HF-radar and ADCP currents.** Behind a login that does not resolve, and no row in the
  public GTS feed carries a current component for this region.

---

## Table 1 - Acronyms

| Acronym | Full form |
| --- | --- |
| ADCP | Acoustic Doppler Current Profiler |
| Argo | Global array of profiling floats (not an acronym; a programme name) |
| BGC | Bio-Geo-Chemical |
| CF | Climate and Forecast (metadata conventions) |
| CTD | Conductivity, Temperature, Depth (instrument) |
| EEZ | Exclusive Economic Zone |
| ERDDAP | Environmental Research Division Data Access Program |
| GDAC | Global Data Assembly Centre |
| GLSL | OpenGL Shading Language |
| HF-radar | High Frequency radar |
| INCOIS | Indian National Centre for Ocean Information Services |
| MoES | Ministry of Earth Sciences |
| NetCDF | Network Common Data Form |
| OGC | Open Geospatial Consortium |
| OPeNDAP | Open-source Project for a Network Data Access Protocol |
| PSU | Practical Salinity Unit |
| REST | Representational State Transfer |
| RMS | Root Mean Square |
| SIH | Smart India Hackathon |
| SST | Sea Surface Temperature |
| VAM | Variational Analysis Methodology |
| WCS | Web Coverage Service |
| WebGL | Web Graphics Library |
| WMO | World Meteorological Organization |
| WMS | Web Map Service |

## Table 2 - Datasets used

The problem statement's "Dataset Link" field was left blank, so we located the sources
ourselves. Every link below was verified working from the build machine.

| # | Dataset | Provider | What we use it for | Link |
| --- | --- | --- | --- | --- |
| 1 | `incois_argo_10d_VAM` - 10-day gridded Argo analysis, Variational Analysis Methodology | **INCOIS**, MoES | The 3D model field: temperature and salinity, 24 levels (5-2000 m), 1°, 30-120°E / 30°S-30°N, current to 2026-07-30 | https://erddap.incois.gov.in/erddap/griddap/incois_argo_10d_VAM.html |
| 2 | `incois_argo_10day_McCreary` - 10-day gridded analysis, Kessler-McCreary | **INCOIS**, MoES | **A second independent analysis of the same Argo floats**, on exactly the same grid and to the same last step, carrying INCOIS's own observation count, standard deviation and RMSE | https://erddap.incois.gov.in/erddap/griddap/incois_argo_10day_McCreary.html |
| 3 | `incois_valueadded_products_datasets` - value-added products | **INCOIS**, MoES | Mixed-layer depth, D20/D26 isotherm depth, heat content, geostrophic currents (GEO_U/GEO_V). *Note: this series ends 2019-03.* | https://erddap.incois.gov.in/erddap/griddap/incois_valueadded_products_datasets.html |
| 4 | `ArgoFloats` - Argo float profiles | Coriolis GDAC / Ifremer | The in-situ observations: pressure, temperature, salinity per cast | https://erddap.ifremer.fr/erddap/tabledap/ArgoFloats.html |
| 4b | `ArgoFloats-synthetic-BGC` - BGC-Argo profiles | Coriolis GDAC / Ifremer | **Chlorophyll**: 52 floats in this window carry a fluorometer, with per-value quality flags | https://erddap.ifremer.fr/erddap/tabledap/ArgoFloats-synthetic-BGC.html |
| 4c | `OSMC_RealTime` - the GTS, flattened | NOAA OSMC / AOML | **Moored buoys**: India's OMNI network and the RAMA array, 9-11 depths to 500 m. Public domain (CC0) | https://erddap.aoml.noaa.gov/gdp/erddap/tabledap/OSMC_RealTime.html |
| 4d | `cmems_mod_glo_phy-cur_anfc_0.083deg_P1D-m` - current velocity | E.U. Copernicus Marine Service | **Current vectors as numbers**: eastward and northward velocity at 1/12 degree, 50 levels, daily. Read with a free account at bake time; no account is needed to view or use the platform | https://data.marine.copernicus.eu/product/GLOBAL_ANALYSISFORECAST_PHY_001_024 |
| 4e | `glider_prof_index.txt` - EGO glider directory | Ifremer / EGO GDAC | **The glider archive PS 26067 names.** Read in full and reported: one glider, two deployments, 2,876 casts in this box, newest 2022-10-14 | ftp://ftp.ifremer.fr/ifremer/glider/v2/ |
| 5 | Natural Earth 1:50m coastlines | Natural Earth (public domain) | Coastline geometry for the globe and map | https://github.com/nvkelso/natural-earth-vector |
| 6 | cmocean colour palettes | Thyng et al. (2016) | Perceptually-uniform oceanographic colour scales | https://matplotlib.org/cmocean/ |

### Data credits

Argo data are collected and made freely available by the International Argo Program and the
national programmes that contribute to it (https://argo.ucsd.edu). The Argo Program is part of
the Global Ocean Observing System.

Gridded analysis products are produced and published by the Indian National Centre for Ocean
Information Services (INCOIS), Ministry of Earth Sciences, Government of India.

Moored buoy observations reach us through the Global Telecommunication System, republished by
NOAA's Observing System Monitoring Center. The Indian buoys are the NIOT/INCOIS OMNI network;
RAMA is a joint MoES-NOAA programme.

The current vectors are E.U. Copernicus Marine Service Information, from the Global Ocean
Physics Analysis and Forecast product. They are Copernicus's own model output, read with a free
account when the data is baked and attributed on screen - not a field this platform computed.
