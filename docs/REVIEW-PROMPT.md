# Review brief

Paste everything below the line into a fresh session opened in this repository.

---

You are reviewing a Smart India Hackathon 2026 submission end to end. It is a working, deployed
prototype, not a concept. Your job is to find what is wrong with it, what is missing, and what
we could truthfully say about it that we are not currently saying.

Be blunt. Praise is not useful to me. A finding I disagree with is more valuable than a
compliment I already believe.

## Orientation

Start with `CLAUDE.md` - it has a complete map of every file and what each one does. Then
`CONTEXT.md` for the domain vocabulary, then `docs/adr/` for the nine decisions already made and
their reasoning. Do not re-litigate a decision an ADR already justifies unless you think the ADR
is actually wrong, in which case say so directly.

Live: https://rak2315.github.io/samudra-sih26/ and `/app.html`
Run it locally: `cd web && npm run dev`. Tests: `cd pipeline && ../.venv/Scripts/python -m pytest -q`

---

## The problem statement, word for word

> **Problem Statement ID** 26067
>
> **Problem Statement Title** Develop a web-based interactive 3D visualization platform that
> integrates numerical ocean model outputs and in-situ observations.
>
> **Description**
>
> - Background India's vast Exclusive Economic Zone (EEZ) and coastline demand continuous,
> high-resolution monitoring of ocean state variables. INCOIS routinely generates and archives
> large volumes of ocean model outputs - including three-dimensional fields of temperature,
> salinity, current vectors, chlorophyll, etc. - as well as real-time and delayed-mode
> observations from autonomous instruments such as Argo profiling floats and underwater Gliders.
> These datasets are stored in NetCDF and ASCII/text formats and span multiple depth levels,
> spatial grids, and time steps. Despite the richness of this data, no integrated, web-based 3D
> visualization platform currently exists that can simultaneously render model fields and in-situ
> instrument observations in a single interactive environment. Existing tools are either
> desktop-bound, support only 2D plan views, or lack the ability to co-visualize model outputs
> alongside instrument profiles. Operational oceanographers and forecasters are therefore forced
> to toggle between disparate software packages, making it difficult to rapidly correlate model
> predictions with observational evidence.
>
> Key gaps identified include:
>
> - No web-based, platform-independent 3D rendering of ocean model data (temperature, salinity,
> currents, etc.) with depth-resolved volumetric views.
>
> - No unified display of Argo float and Glider profile data (latitude, longitude, depth, time,
> temperature, salinity, chlorophyll) alongside model fields.
>
> - Absence of interactive controls for variable selection, depth-slice navigation, time-step
> animation, and customizable color bars.
>
> - Inability to ingest new observational data streams or additional model variables without
> significant re-engineering.
>
> - Lack of tools to support intuitive, rapid understanding of complex 3D ocean phenomena for
> operational decision-making. The absence of such a system impedes timely hazard assessment,
> search-and-rescue support, fishery advisories, climate monitoring, etc. - all operational
> mandates of INCOIS.
>
> **Expected Solution** The proposed solution is a web-based, browser-native 3D Ocean Data
> Visualization System that integrates ocean model outputs with observational data on a single
> interactive platform.
>
> Core functional requirements:
>
> - **3D Volumetric Rendering:** Interactive visualization of ocean model fields (temperature,
> salinity, current vectors) across the full water column, with support for depth-slice views,
> isosurface extraction, and time-step animation using WebGL / Three.js or Cesium.js.
>
> - **Instrument Data Overlay:** Co-display of Argo float, Glider profile, CTD and BGC data using
> geospatially accurate markers; users can click a float/glider to inspect a depth-vs-variable
> profile chart with timestamps.
>
> - **Multi-format Data Ingestion:** Automated parsers for NetCDF (via PyNIO / xarray backend)
> and delimited text formats, with a modular architecture that allows new variables or data
> sources to be added with minimal code change.
>
> - **Customizable Colorbar & Variable Controls:** Dynamic color bar editor (color palette,
> min/max range, log/linear scale), variable selector, layer opacity controls, and vertical
> exaggeration slider for intuitive depth perception.
>
> - **Web-based, Scalable Architecture:** Frontend built on modern JavaScript frameworks with a
> lightweight REST/OPeNDAP API backend, enabling Deployable on INCOIS infrastructure without any
> client-side dependencies.
>
> - **Extensible Design:** Plugin-style module for future integration of additional sensors (e.g,
> CTDs, moorings, HF-radar, Acoustic doppler current profiler (ADCP), etc.), new ocean model
> variables, and machine-learning derived products.
>
> The system will follow open standards (OGC WMS/WCS, CF Conventions for NetCDF), enabling
> interoperability with national and international ocean data portals. The end product will
> empower INCOIS forecasters to perform rapid, intuitive analysis of complex 3D ocean phenomena -
> significantly improving the speed and accuracy of operational advisories, in the same way that
> 3D meteorological visualization has transformed weather forecasting workflows. Public Outreach
> & Science Communication: Beyond operational use, the platform will serve as a powerful science
> communication tool. Complex numerical ocean model outputs - which are typically inaccessible to
> non-specialists - can be transformed into visually intuitive, interactive 3D experiences. This
> makes the tool valuable for educating school and college students about ocean dynamics,
> engaging the general public during awareness campaigns, and supporting policymakers in
> understanding marine environmental conditions. INCOIS can use the platform for outreach events,
> exhibitions, and e-learning initiatives, bridging the gap between cutting-edge ocean science and
> the common person.
>
> Insert 2 tables (Acronyms and Dataset Link) here-
>
> **Organization** Ministry of Earth Sciences (MoES)
> **Department** Indian National Centre for Ocean Information Services (INCOIS) Ocean Valley
> **Category** Software
> **Theme** Smart Automation

---

## What I want from you, in five passes

### Pass 1 - Requirement coverage, honestly

Go through the problem statement clause by clause and mark each **met / partly met / not met**,
with the file and line that implements it. Where something is only partly met, say exactly what
is missing.

Be sceptical of our own claims. For example we say the design is extensible; verify that by
actually tracing what a third data source would require. We say we follow CF conventions and open
standards; check whether that is true or just asserted. The statement asks for currents,
chlorophyll, gliders, CTD and BGC data, OGC WMS/WCS and ML-derived products. Several of those are
genuinely absent. I would rather know precisely which, and how expensive each would be, than be
told the coverage is good.

### Pass 2 - Bugs, in this order of importance

**Logic and correctness bugs that would mislead a user.** These matter most. The class of bug
I care about is best shown by one we already found and fixed:

> Every Argo float was drawn at its most recent position, permanently, regardless of which time
> step was being displayed. So the ocean animated while the instruments sat frozen on top of it.
> That is both wrong and confusing, and it threw away the best thing about the animation, which
> is that the floats genuinely drift and their tracks are themselves a measurement of the
> current. Separately, nothing on screen said what the white dots or red lines even were - no
> legend, no label.

That is the standard. Something that renders without error, passes tests, and still tells the
user something false or unintelligible. Hunt specifically for:

- Values displayed with the wrong units, wrong sign, or wrong time association
- Interpolation or averaging that crosses a boundary it should not
- Anything on screen that is unlabelled, unexplained, or that a first-time viewer would misread
- State that does not update when something it depends on changes (the float bug's whole family)
- Statistics whose meaning is not what the label claims
- Colour or scale that implies a difference that is not in the data, or hides one that is

**Then ordinary correctness bugs**, then performance, then code quality. Note that the target
hardware is Intel integrated graphics with 2 GB shared memory.

For each finding give me: the file and line, what happens, why it is wrong, and how a user would
be misled. Verify before reporting - run it, measure it, read the data. `OceanScene.debug()`,
`window.__scene` and `window.__store` are exposed for exactly this, and `web/capture.mjs`
screenshots the app.

### Pass 3 - The demo and the story

Read `docs/demo/script.md`, `ppt/SLIDES.md` and `docs/Samudra3D-Dossier.pdf`, then actually use the live
app as a judge would.

- Where would a non-specialist get lost or draw the wrong conclusion?
- What claim do we make that a sceptical judge could puncture?
- What is genuinely impressive that we currently fail to mention?
- Is anything in the script, deck or dossier overstated, or no longer true of the code?

Assume the judges are not oceanographers. They will ask things like "is the ocean actually
yellow", "why is it a box", "if the model and the float disagree, is the model wrong". Find the
places where an obvious naive question has no good answer ready.

### Pass 4 - Research, with `/research`

**Use the `/research` skill.** Find real, citable, verifiable material that would strengthen the
presentation and that we are not currently using. I want specifics with sources, not general
encouragement. Look for:

- **Operational stakes.** Real figures on Indian Ocean cyclones, the role of ocean heat content
  and thermocline depth in rapid intensification, INCOIS's actual advisory mandate and how many
  people depend on it. Concrete recent cases, ideally in the Arabian Sea or Bay of Bengal.
- **Whether our specific claim of novelty holds.** We assert no existing tool co-visualises a 3D
  model field with in-situ profiles in a browser. Try hard to disprove that. Check what INCOIS
  already publishes, what Copernicus, NOAA, ESA and Euro-Argo offer, and any recent papers or
  products. If something similar exists, I need to know now rather than from a judge.
- **Validation context.** Is our median residual of about 0.46 C between the analysis and the
  floats good, bad, or typical? Find published accuracy figures for comparable objective
  analyses so we can say where we sit.
- **The Arabian Sea upwelling story** we lead the demo with, for float 2902306 off Oman in July.
  Confirm it is textbook, and find a citation.
- **Bay of Bengal freshwater**, which our salinity view shows plainly. Real numbers on
  Ganges-Brahmaputra discharge and its effect on stratification and cyclones.
- **Anything about the Argo programme** worth quoting: fleet size, India's contribution,
  cost per float, how the data is used.

For everything you find, tell me **where it should go**: which slide, which line of the script,
which section of the dossier. Flag anything we currently say that the research contradicts.

### Pass 5 - What you would do next

Given roughly a day of work, ranked by value per hour, what would most improve this submission?
Weigh it against `docs/plan/01-cut-features.md`, which already lists what was deliberately cut and
why. Tell me if anything on that cut list should be reinstated.

---

## Ground rules

- **Verify before asserting.** Run the tests, load the app, query the endpoints, read the data.
  If you cannot verify something, say so explicitly rather than guessing.
- **Do not change any code in this pass.** Report first. I will decide what to act on.
- **No em dashes** in anything you write. Plain hyphens.
- Every number you quote should be traceable to the running system or a cited source.
- If you think something we built is wrong-headed rather than merely buggy, say that plainly.
  That is the most useful thing you can tell me.

Finish with a single prioritised list: the things that would most damage us if a judge found
them, first.
