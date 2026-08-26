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

> _Point at Box 2._

"So we built a block of water you can fly into. INCOIS's own model, five metres down to two
kilometres, all rendered at once. Think of it as an MRI of the sea rather than a photograph of
it.

The floats sit inside that water at their real positions, with the paths they drifted. And when
you click one, it draws what the instrument measured against what the model predicted, at the
same place and the same time, and tells you the size of the gap."

> _Point at Box 3, and pick just one item. Do not read all four._

"The part I would point at is this: still water becomes invisible. We fade out water that is not
changing, so the layers show through. Without that you get a warm lid and a black void
underneath, which is what a naive 3D render of the ocean actually looks like."

---

## A1:15 - Slide 3, technical approach (75 seconds)

> _Trace the vertical diagram top to bottom with a finger or pointer._

"Read this top to bottom. Two providers come in at the top: INCOIS for the model, the Argo data
centre for the floats.

They both go through one box, the source adapter. That is the only code in the whole system that
knows what an ERDDAP is."

> _Point at the split._

"Then it splits two ways, and this is our most important decision.

The **Grid** on the left is the truth: real numbers on the provider's own grid. Every figure a
user reads comes from there.

The **Volume** on the right is a picture: the same field squeezed to four bytes per point so a
graphics card can draw it. We never answer a scientific question from the picture."

> _Point back at the adapter box._

"And that single box is what makes extensibility real rather than a slogan. Adding a mooring, an
ADCP or HF radar means writing one class there. The renderer, the API and the screen never
change. We proved it by adding a second Argo provider that names every column differently: it
cost one small class and no new parsing code."

> _Point at the status strip. Slow down for this line._

"Status: working prototype on real INCOIS data. Ingestion, rendering, overlay and comparison are
all built and tested. Fifty-four automated tests on the science. What is left is deployment and
more variables, not core capability."

---

## A2:30 - Slide 4, feasibility (45 seconds)

"The point of this slide is that nothing on it is a projection. Every risk here we actually hit,
and every solution we actually shipped.

Two of the obvious data hosts were unreachable from our network, so the obvious plan died on day
one. We went looking and found something better: INCOIS's own public server, which makes the demo
end-to-end INCOIS instead of a substitute.

Real instruments fail. One float in this region reports twenty PSU, which is fresher than the
Baltic and impossible here. So our quality checks run per channel: a float with a broken salinity
sensor still gives us its perfectly good temperature.

And missing data can lie. If you blend 'no data' with the sea you paint a fake cold strip along
every coastline, and it looks exactly like real upwelling. So we track where the ocean actually
is in a separate channel, and land can never contribute a value."

---

## A3:15 - Slide 5, impact (35 seconds)

"Who this helps. Cyclone forecasters first: the warm water below the surface is what lets a storm
explode overnight. Ockhi in 2017 went from a depression to a cyclone in about nine hours over
exactly that kind of water.

Then search and rescue, then fisheries advisories, which INCOIS already sends to lakhs of
fishermen and which depend on the structure this makes visible.

And the change is simple: disagreement stops being an impression and becomes a number."

> _Point at the evidence caption._

"That is real output. Float 2902306, an INCOIS float off Oman. A hundred and nineteen depths
compared, model running two point one six degrees warm."

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
| 3 minutes of demo | The three controls at B2:55, and the emphasis slider at B2:20 |
| 2 minutes of demo | Everything except the dive and the comparison. Those two are the whole idea |

**Never cut:** the dive, and clicking a float.

---

# IF SOMETHING BREAKS

| Problem | What to do |
| --- | --- |
| Venue wifi dies | Nothing happens. Every byte is baked into the page; the demo makes zero network calls. |
| Rendering is sluggish | Drop **Ray steps** to 64. Still readable, changes nothing scientific. |
| Cannot find a float to click | Any marker works. Eighty-nine of the ninety-two have a comparison. |
| Lost in 3D | Press **Return to globe**, then dive again. |
| The page misbehaves | Refresh. It reloads in seconds from cache. |
| Asked something you do not know | "That is in our decision records, we wrote up why." `docs/adr/` genuinely has nine. |

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
| "What is the accuracy?" | Across 206 floats the median typical gap between model and instrument is 0.46 °C. That is the analysis's own accuracy, which is what we are measuring. |
| "Has nobody built this before?" | Say it narrowly: we have not found a browser tool that renders a 3D model volume and lets you click an in-situ float to get a quantified comparison. Do not say "nobody has done this" - Argovis, Copernicus MyOcean and the EU Digital Twin Ocean are close neighbours and we have not finished checking them. |
| "How long did this take?" | Built for this hackathon. Fifty-four automated tests on the scientific logic, nine architecture decision records. |
