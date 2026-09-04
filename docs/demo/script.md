# Presentation script - 4 minutes deck, 4 minutes demo

**Normal text is what you say. _Grey italic is what you do._**

Two halves, four minutes each. Practise them separately, then join them. The join is one
sentence: *"Rather than describe it, let me show you."*

> _Set up before you start: open **https://rak2315.github.io/samudra-sih26/**, click "Launch the
> platform", let it finish loading, leave it on the globe. Full screen, F11. Have the deck on a
> second window or a second machine. Rehearse the dive twice - it is the moment that lands._

---
---

# PART A - THE DECK (4 minutes)

> **Every figure spoken below is in [`ppt/FACTS.md`](../../ppt/FACTS.md), which is generated from
> the build.** If one of them has moved, re-run `collect_facts.py` and change the sentence here
> before you say it out loud. This part of the script was wrong for a round - it said fifty-four
> tests against a real 377, and named a float that had not been in the deck for two rounds.

## A0:00 - Slide 1, title (15 seconds)

"Samudra 3D. Problem statement 26067, for INCOIS.

It is a working prototype and it is live on the internet right now, so everything I am about to
claim, you can check yourself in a browser."

> _Do not linger. The title slide earns fifteen seconds, not forty._

---

## A0:15 - Slide 2, the idea (60 seconds)

"The problem in one sentence: INCOIS runs ocean models, INCOIS collects real measurements from
robot floats, and nobody can look at the two together.

Almost every tool draws flat maps, one depth at a time. But the ocean is four kilometres deep,
and the interesting things happen in the vertical. A cyclone does not feed on the surface. It
feeds on the warm water underneath it."

> _Point at the left-hand board. It quotes the five gaps the problem statement itself names, each
> answered by what is built. Do not read them - let it be seen._

"So we built a block of water you can fly into. INCOIS's own analysis, five metres down to two
kilometres, all rendered at once. Think of it as an MRI of the sea rather than a photograph of
it.

The floats sit inside that water at their real positions, with the paths they drifted. Click one
and it draws what the instrument measured against what the model predicted, at the same place and
the same time, and puts a number on the gap."

> _Point at the screenshot, then at one figure in it. One, not four._

"This float is the one in the picture. Nine hundred and ninety-six depths compared, and the
analysis sits within **0.17 of a degree** of it. That is close agreement, and saying so is the
point: the tool puts a number on the comparison whichever way it comes out.

Turn on the bias map and all two hundred and thirty instruments are ranked by that same figure.
The worst is a moored buoy, one point six six degrees out - and buoys matter here, because INCOIS
assimilate Argo. A float largely shows the model agreeing with data it was already given. The
nine buoys are the independent check, and we print the two separately rather than pooling them
into one flattering average."

---

## A1:15 - Slide 3, technical approach (75 seconds)

> _Read the architecture board left to right, in four moves._

"Four zones, left to right.

**Zone one, the sources.** Eight public endpoints, every one tested and dated. INCOIS's own
ERDDAP for two independent analyses. Ifremer for the Argo floats and their chlorophyll. NOAA's
real-time feed for the moored buoys. Copernicus Marine for the currents. The glider archive this
problem statement names by name. And the World Ocean Atlas for a real thirty-year normal.

**Zone two is one box, and it is the most important box on the slide.** The source adapter. That
is the only code in the whole system that has ever heard of an ERDDAP. Adding a provider means
writing one class there - and we can say that rather than claim it, because the September round
added four and touched no renderer, no endpoint and no interface file. There is a ninth adapter
that reads a **NetCDF file a judge drops on the page**, live, in front of you."

> _Point at the split in zone three. Slow down._

"**Zone three is our most important decision.** The **Grid** is the truth: real numbers on the
provider's own axes. The **Volume** is a picture: the same field squeezed to four bytes a point
so a graphics card can draw it. Every number a person reads comes from the Grid. We never answer
a scientific question from the picture.

**Zone four is what comes back out.** The browser. A REST API. And OPeNDAP, CF NetCDF and OGC
WMS, so anything that already speaks those standards can read our fields - including the five
cyclone products INCOIS themselves stopped publishing in 2019."

> _Point at the green status strip. Slow down for this line._

"Status: working prototype, on live INCOIS data. **Three hundred and seventy-seven automated
tests** on the science, and thirteen browser probes that drive the built application and measure
what actually reaches the screen. **Zero network calls at demo time** - the data is baked into
the build, so a dead venue network cannot kill this."

---

## A2:30 - Slide 4, feasibility (45 seconds)

"The point of this slide is that nothing on it is a projection. Every risk here we actually hit,
and every fix here we actually shipped. It is written in the past tense on purpose.

Two of the obvious data hosts were unreachable from our network, so the obvious plan died on day
one. We went looking and found something better: INCOIS's own public server, which makes this
end-to-end INCOIS rather than a substitute.

Real instruments fail. One float in this region reports twenty PSU, which is fresher than the
Baltic and impossible here, and the global quality standard let it through. So our checks run
per channel: a float with a dead salinity sensor still gives us its perfectly good temperature.

And a plausible wrong number is worse than no number. We built a derived current field, measured
it against reality, found it gave nought point one six metres per second for the Somali Current
in peak monsoon against a real one and a half to two and a half - and deleted it. The currents
you see are Copernicus's own analysis, held to the same test and passing it."

---

## A3:15 - Slide 5, impact (35 seconds)

"Who this helps. Cyclone forecasters first: the warm water below the surface is what lets a storm
explode overnight. Ockhi in 2017 went from a depression to a cyclone in about nine hours over
exactly that kind of water, and this computes the five quantities that describe it.

Then search and rescue - and there we do something unusual. Drop a pin and the currents carry it
forward. But an Argo float's own track **is** measured drift, so we ran the same maths from a
hundred and ninety-five real floats and published the error instead of assuming it: **a median
thirty-eight kilometres out over one float cycle.** The panel's first line says what it is not:
no wind, no waves, no leeway. Not a search forecast.

Then fisheries advisories, which INCOIS already sends to lakhs of fishermen.

And one thing nobody asks for: **nine point nine per cent of this block has no float cast behind
it at all**, and the tool draws that as its own variable rather than filling it in."

---

## A3:50 - The join (10 seconds)

"Rather than describe it any further, let me show you."

> _Switch to the browser. It is already loaded and sitting on the globe._

---
---

# PART B - THE LIVE DEMO (4 minutes)

## B0:00 - The globe (30 seconds)

> _Point at the coloured region._

"India's exclusive economic zone, coloured with INCOIS's own temperature analysis. Their public
server, real data, current to the thirtieth of July."

> _Point at the white dots._

"Every white dot is an Argo float. It sinks to two kilometres, drifts for ten days, then rises
while measuring temperature and salinity the whole way up. Ninety-two of them reported here."

> _Point at the key, bottom-left._

"There is a key in the corner, so nothing on screen is unexplained."

---

## B0:30 - The dive **← the moment** (40 seconds)

> _Click **Dive into the water**. Then say nothing for the two and a half seconds it takes._

"The globe just unrolled into a map and the ocean opened up. That is one continuous piece of
geometry. Nothing switched and nothing faded.

And this is now a solid block of water. Every depth from five metres to two kilometres, rendered
at once."

> _Point at the orange band about a third of the way down._

"Warm at the top. This orange band is the thermocline, the sharp temperature boundary that
controls how much energy a cyclone can pull out of the ocean. It is the most important structure
in this picture, and on a flat map you cannot see it at all."

> _Point at the depth labels down the left flank._

"Real depths down the side. The spacing is deliberately uneven, because we stretch the top of the
ocean where everything happens. We say so on screen rather than letting you assume it is
proportional."

---

## B1:10 - The comparison **← the actual contribution** (70 seconds)

> _Click a white float marker. Use **2902306** off Oman if you can find it. Any float works._

"Now I click a float.

Green is what the instrument actually measured on the way down. Blue dashed is what the model
said at that exact position and time. The shaded gap between them is the disagreement."

> _Point at the verdict line._

"And it tells you in plain words whether that is good or bad."

> _Point at the three numbers._

"A hundred and nineteen depths compared. The model is running about two degrees warm here."

> _Pause. This is the payoff. Do not rush it._

"That is not a bug. That is the tool working.

This float is at twenty-one north, sixty east, off Oman, in July. That is the Arabian Sea
upwelling season: the monsoon wind drags cold water up from below, and a one-degree gridded
analysis smooths it away. A forecaster would want to know that before issuing an advisory."

> _Optional, if you have the time: close it and click a different float to show a "Close
> agreement" verdict, so they see the tool distinguishes good from bad._

"This is the comparison the problem statement says no existing tool does in a browser."

---

## B2:20 - Why you can see anything (35 seconds)

> _Grab the **Feature emphasis** slider. Drag it slowly from 85% down to 0, then back up._

"Watch this. Ocean temperature just decreases with depth, so a naive render gives you an opaque
warm lid and a black void underneath."

> _At 0% the block goes flat and featureless. Drag back to 85%._

"We precompute how fast the temperature is changing at every point and make the still water
transparent. So the water that is actually doing something is the water you see."

> _Point at the right-hand panel, which is now explaining that slider._

"And every control explains itself: what changed, what it means physically, and whether you just
changed the science or only the picture."

---

## B2:40 - The water, moving (25 seconds)

**Do:** Variable > Circulation > Current Speed. Let the dots run for a beat before you say
anything.

**Say:** *"That is the current itself, at five metres. A few thousand dots carried by the
analysed flow, and I can drag them down through the water."*

**Do:** drag the Depth slice from 5 m towards 1000 m.

**Say:** *"The whole basin changes direction. That is the thing a flat map cannot show you, and
it is why a drifting object is hard to find. These dots run the same integrator as our drift
model, so unlike every other current animation, this one has a published error behind it:
thirty-eight kilometres over one Argo cycle, measured against a hundred and ninety-five real
floats."*

**If asked why there are no small swirls:** we draw INCOIS's grid, one degree, and every eddy on
a European viewer's screen is smaller than one of our cells. We do not upsample.

---

## B2:55 - Three controls, briskly (50 seconds)

**1.**
> _Drag **Range min** up to about 17 °C, then **Range max** down to about 24 °C._

"Water outside the colour range disappears, so narrowing it isolates a single water mass. That
floating layer is a body of water with its own history."

**2.**
> _Reset the range. Untick **Show volume**, tick **Draw isosurface**, set it near 20 °C._

"The twenty-degree isotherm, the standard marker for thermocline depth. Where it bulges downward
there is a deep pool of warm water, which is fuel for a storm. That spike is an eddy."

**3.**
> _Re-tick **Show volume**, untick the isosurface. Press **play** on the timeline._

"Twelve analyses over four months, April to July. You are watching the monsoon arrive. And watch
the floats: they drift with the current, so their tracks are themselves a measurement."

---

## Five things that are not in the timed run, and which one to reach for

The run above is three minutes fifty and it is the argument. These five are built, each answers a
clause of PS 26067 by name, and **none of them belongs in the timed demo** - they belong in the
questions afterwards, one per question. Reach for the one the question actually asks for.

### "How do you know the model is any good?"

> _Open **Model vs instruments** in the left panel and tick **Colour instruments by
> disagreement**._

"Every dot is now coloured by how far the analysis sat from what that instrument measured. Across
230 instruments it reads 0.02 degrees off on average, and the typical gap is 0.19 degrees. The
list underneath is worst-first - click one and its comparison opens. And all three variables put
their worst five-degree box in the same water: 15 to 20 north, 85 to 90 east, the northern Bay of
Bengal, where the Ganges and Brahmaputra come out. The gap there is 0.87 degrees against 0.20
across the basin. That is the one place a one-degree analysis of this region should struggle, and
it is where it does."

### "Could you use this for a search and rescue?"

> _Open **Drift**, press **Drop a pin**, click the water, and read the first line of the panel out
> loud before anything else._

"Not on its own, and the panel says so before it says anything else: a real search needs surface
wind, wave drift and the object's own leeway, and this has none of them. That is why INCOIS run
SARAT. What this shows is the drift the ocean analysis alone implies.

What makes it worth having is that we can score it. An Argo float's track **is** measured drift at
its parking depth, so we ran the same maths from 195 floats' own positions. Over one Argo cycle the
current field alone lands a median 39 kilometres from where the float actually went, 88 at the
ninetieth percentile. By thirty days the gap is the same size as the distance travelled. No other
drift demo will tell you that number, because none of them has the observations in the same file."

### "Can it read our data?"

> _Open **Your own data** and ask them for a NetCDF file. Drag it in._

"Everything else on this page is baked in. This is the one control that talks to a server, and it
only does when you drop a file. It goes through the same adapter interface as INCOIS, Argo and
Copernicus, and your variables appear in the selector under **Yours**, with the same colourbar,
the same depth slice, the same isosurface.

And if it cannot read your file it tells you which axis it could not find, rather than drawing
something. Try a file with sigma levels - it refuses by name."

### "Can I see a section?"

> _Open **Vertical section**, press **Draw a line**, click twice across the Bay of Bengal._

"Depth down, distance across, temperature as colour, and every Argo cast within 150 kilometres of
that line on the same axes, each drawn down to the depth it actually reached. That is the standard
figure of physical oceanography.

It is cut live from the model's own grid on its own 24 levels, not from the block you are looking
at - the block is quantised and depth-warped for the graphics card. And the grids are in the
build, so this works with the network unplugged."

### "Is that warm water actually unusual?"

> _Switch **Variable** to **Temperature vs Normal**, in the **Change** tab._

"The anomaly beside it is a departure from this build's own four months, which is a seasonal
swing, and the panel says so. This one is a departure from the World Ocean Atlas 1991 to 2020
normal for the same calendar month - which is what a forecaster means by warmer than usual. Below
1500 metres the atlas has no normal, so we draw nothing there rather than zero."

---

## Optional, only if you are ahead of the clock (25 seconds)

> _Switch **Variable** to **Temperature anomaly**, open **Anomaly Features**, click the top row,
> then **Show only this body of water**._

"Every one of those numbers is measured over one box of water. This is that box. The rest of the
block is cleared away and the camera pans onto it, so you can see how wide the thing is and how
deep it runs, rather than taking our word for it."

> _Cut this first. It is a good moment and it is not the argument. If the room is engaged and you
> are ahead of the clock, it lands; otherwise go straight to the close._

---

## B3:35 - The second door (20 seconds)

**Do:** press **Explore** on the top bar.

**Say:** *"The problem statement asks for a science communication tool in its own section, and
names school students, the public and policymakers. Fifteen variables in five groups is the
wrong first minute for any of them. So the same platform asks questions instead, and every one
of them carries its own caveat: this cyclone card says in as many words that it is a map of
conditions and not a forecast."*

**Do:** if there is time, open `?kiosk=1` in a second tab.

**Say:** *"And that is the exhibition screen. No panels, the questions on a loop, and it resets
a minute after the last visitor walks away, so a stall can leave it running all day."*

---

## B3:45 - Close (15 seconds)

> _Stop the animation. Stand still._

"Browser-native. No install, no plugin, no account. Real INCOIS data and real Argo observations in
one view, and it is live right now.

And to be straight with you: we use INCOIS's public server. The internal operational archive needs
credentials we do not have, and the adapter is exactly where it would attach."

> _That last sentence is worth saying. It pre-empts the obvious question and shows you understood
> the integration point._

---
---

# CUTS

| If you have | Drop |
| --- | --- |
| 3 minutes of deck | Slide 4 down to one sentence: "every risk on this slide we hit and solved during the build" |
| 3 minutes of demo | The optional beat first, then the three controls at B2:55, then the emphasis slider at B2:20 |
| 2 minutes of demo | Everything except the dive and the comparison. Those two are the whole idea |

**None of the five in "Five things that are not in the timed run" is ever cut, because none of
them is ever in.** They are answers to questions, one each, and reaching for the wrong one costs
more than not having it.

**Never cut:** the dive, and clicking a float.

---

# IF SOMETHING BREAKS

| Problem | What to do |
| --- | --- |
| Venue wifi dies | Nothing happens. Every byte is baked into the page - including the typefaces, the hazard fields and the current vectors - and the demo makes zero network calls. Verified: zero external requests on load. |
| Rendering is sluggish | Drop **Ray steps** to 64. Still readable, changes nothing scientific. |
| Cannot find a float to click | Almost any marker works: 227 of the 230 instruments carry a comparison. Squares are moored buoys, and those follow the timeline. |
| Lost in 3D | Press **Return to globe**, then dive again. |
| The page misbehaves | Refresh. It reloads in seconds from cache. |
| Asked something you do not know | "That is in our decision records, we wrote up why." `docs/adr/` genuinely has twelve. |

---

# QUESTIONS TO EXPECT

| Question | Answer |
| --- | --- |
| "Is this real INCOIS data?" | Yes. `erddap.incois.gov.in`, their 10-day gridded Argo analysis, current to 30 July 2026. The date is on screen, top right. There is also a provenance page that reads its figures from the build and prints the exact request, so you can fetch the same bytes yourself. |
| "Is the ocean actually yellow?" | No. Colour is a scale we chose, and the bar on the left says which temperature each colour means. We use the standard oceanographic palettes rather than a rainbow, because a rainbow invents boundaries that are not in the data. |
| "Why is it a box?" | Because that is the region we loaded, 55 to 100 east and 10 south to 25 north. The data is INCOIS's whole Indian Ocean grid; the box is the window onto it. |
| "If the model and the float disagree, is the model wrong?" | Not necessarily. The float measures one point; the model averages a one-degree square. Off Oman in July the float is inside an upwelling the grid cannot resolve, so the disagreement is real physics, not a mistake. The point of the tool is to show you where to look. |
| "What are the white dots and the lines?" | Argo floats and their drift tracks. There is a key in the bottom-left corner. |
| "Why does this graph look almost flat?" | Because for that float the model got it right. Click a different one to see a disagreement. |
| "Why not Cesium?" | It needs an access token, which is a dependency that can fail live, and compositing a ray-marched volume into its pipeline was the riskiest integration available. One Three.js scene makes the dive genuinely continuous. ADR 0001. |
| "How would you add our internal data?" | One source adapter class. `pipeline/samudra/sources/base.py` is the whole interface. |
| "Is the depth axis to scale?" | No, deliberately. The top 300 m gets half the axis instead of 15%, because that is where the thermocline is. Stretched depth axes are standard in oceanography, and the profile chart uses the same stretch so the two agree. ADR 0004. |
| "Why 1800x vertical exaggeration?" | The region is about four thousand times wider than it is deep. At true scale it would be an invisible film. |
| "What resolution is the data?" | One degree, because that is what INCOIS publishes. We do not upsample. That would invent structure the instruments never measured. |
| "Does it work offline?" | Yes. That is why it is baked. |
| "Did you generate or simulate any of this?" | No. Every number comes from INCOIS's server or the Argo programme. |
| "What is the accuracy?" | Across 206 floats the median RMS gap between model and instrument is 0.46 °C. That is the analysis's own accuracy, which is what we are measuring. Be careful with the word "typical": RMS is the quadratic mean, always at least the mean absolute deviation. |
| "Doesn't the analysis already use Argo? Aren't you comparing it with itself?" | Partly, and that is the operational question rather than a flaw - did the analysis reproduce the observation it was given, here, at this depth? It does not always: the disagreement runs from 0.00 to 1.98 °C. The panel says this on screen so you do not have to. |
| "Where do the currents come from?" | Copernicus Marine's own global analysis, at one twelfth of a degree - twelve times finer than the INCOIS grid. We read the actual eastward and northward velocity, not a picture of it, so there is a real speed under the cursor wherever you point. It needs a free Copernicus account **to rebuild the data**, and none at all to view or use the platform; the credential never leaves the machine that bakes. It was a picture until that account existed, and the change is written up in ADR 0013. |
| "Are those all Argo floats?" | No. Nine are moored buoys - four from India's own OMNI network, three from RAMA. They are drawn as squares, they have no drift track because they are anchored, and their comparison follows the timeline. |
| "Can we get the data out?" | Yes, three ways: OPeNDAP, CF-1.8 NetCDF and OGC WMS, all from the analysis grid rather than the rendering volume. Open our OPeNDAP URL in xarray on your own machine. ADR 0012. |
| "Has nobody built this before?" | Say it narrowly: **depth-resolved volumetric rendering in a browser, with the in-situ observations in the same water and the model scored against them.** Do not say "nobody has done this". Checked 2026-09-04: Copernicus **MyOcean Pro** is the reference and is a 2D map with a depth slider, no 3D at all; earth.nullschool is a 2D globe with surface currents; NOAA's Science on a Sphere is a physical globe; and browser volume rendering of ocean scalars exists as research (a WebGPU framework published March 2025, i4Ocean before it) but as prototypes, and none of them carries the observations. `docs/plan/05` Part 3. |
| "Those moving lines - are they a forecast?" | No, and say so before they ask twice. Every dot is the flow at **one** analysis, frozen; the drift pin is the one that runs time forward. They share the same integrator, which is the point: the animation runs the maths whose error we published at a median 38 km over an Argo cycle. Measured, a particle and a drift pin from the same start land **2 metres apart after 724 km**. |
| "Why are there no eddies, when the Copernicus viewer is full of them?" | Because we draw INCOIS's grid rather than upsampling it. Theirs is 1/12 degree, about 9 km; the analysis this platform reports every number from is 1 degree, about 110 km, so every swirl on their screen is smaller than one of our cells. We could bake a finer field just for the animation for about 27 MB and we refused: the picture would then be more detailed than every number on the platform, in the one place nobody would check. ADR 0017. |
| "How long did this take?" | Built for this hackathon. 230 automated tests on the scientific logic, twelve architecture decision records, and a defects file that lists what was wrong and what the numbers were. |
