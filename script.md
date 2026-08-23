# Demo script

**Normal text is what you say. _Grey italic text is what you do._**

Roughly 4 minutes at a comfortable pace. Cuts for a 2-minute slot are marked. Rehearse the dive
at least twice; it is the moment that lands.

> _Before you start: open **https://rak2315.github.io/samudra-sih26/**, click "Launch the
> platform", and let it finish loading. Leave it on the globe. Full screen, F11._

---

## 0:00 — The problem, in one breath

> _Stand still. Do not touch anything yet._

"INCOIS runs ocean models, and INCOIS collects real measurements from robot floats in the water.
Both already exist. The problem is that nobody can look at them **together** — and almost every
tool only draws flat maps, one depth at a time."

"The ocean is four kilometres deep. The interesting things happen in the vertical."

---

## 0:20 — The globe

> _Point at the coloured region over the Indian Ocean._

"This is India's exclusive economic zone, coloured with INCOIS's own temperature analysis. Their
public data server, real data, current to the 30th of July."

> _Point at the white dots._

"Every white dot is an Argo float — a robot instrument that sinks to two kilometres, drifts for
ten days, then rises while measuring temperature and salinity the whole way up. Ninety-two of
them reported here."

> _Point at the key in the bottom-left corner._

"There's a key in the corner so nothing on screen is unexplained."

---

## 0:45 — The dive **← the moment**

> _Click **Dive into the water**. Then say nothing for the two and a half seconds it takes._

"The globe just unrolled into a map, and the ocean opened up. That's one continuous piece of
geometry — nothing switched, nothing faded. And this is now a solid block of water: every depth
from five metres to two kilometres, all rendered at once."

> _Point at the orange band roughly a third of the way down._

"Warm at the top, and this orange band is the thermocline — the sharp temperature boundary that
controls how much energy a cyclone can pull out of the ocean. It is the single most important
structure in this picture, and on a flat map you cannot see it at all."

> _Point at the depth labels down the left side._

"Real depths down the side. Notice the spacing is uneven — we deliberately stretch the top of
the ocean, because that's where everything happens. We say so on screen rather than letting you
assume it's proportional."

---

## 1:20 — Why you can see anything *(cut this for a 2-minute slot)*

> _Grab the **Feature emphasis** slider and drag it slowly from 85% down to 0, then back up._

"Watch this. Ocean temperature just decreases with depth, so if you render it naively you get an
opaque warm lid and a black void underneath."

> _At 0%: the block goes flat and featureless. Drag back to 85%._

"We precompute how fast the temperature is *changing* at every point, and make the still water
transparent. So the water that's actually doing something is the water you see."

> _Point at the right-hand panel, which is now explaining that slider._

"And every control explains itself. It tells you what changed, what it means physically, what to
look for — and whether you just changed the science or only the picture. That distinction
matters."

---

## 1:45 — The comparison **← the actual contribution**

> _Click any white float marker. If you can find it, use **2902306** — Arabian Sea, off Oman.
> Otherwise any float works; the panel opens for all of them._

"Now I click a float. Green is what the instrument actually measured on the way down. Blue
dashed is what the model said at that exact position and time. The shaded gap between them is
the disagreement."

> _Point at the verdict line._

"And it tells you straight out whether that's good or bad."

> _Point at the three numbers._

"A hundred and nineteen depths compared. The model is running two degrees warm here."

Then the payoff:

"That is **not** a bug — that's the tool working. This float is at 21 north, 60 east, off Oman,
in July. That's the Arabian Sea upwelling season: cold water is being driven up from below, and a
one-degree gridded analysis smooths it away. A forecaster would want to know that before issuing
an advisory."

"**This is the comparison the problem statement says no existing tool can do.**"

> _Optional: close this float and click a different one to show a "Close agreement" verdict, so
> they see the tool distinguishes good from bad._

---

## 2:30 — Controls, quickly

> _Three actions, about fifteen seconds each. Do them briskly._

**1.**
> _Drag the **Range min** slider up to about 17 °C, then **Range max** down to about 24 °C._

"Water outside the colour range disappears, so narrowing it isolates a single water mass. That
floating layer is a body of water with its own history."

**2.**
> _Reset the range. Untick **Show volume**, tick **Draw isosurface**, set the value near 20 °C._

"That's the 20 °C isotherm — the standard marker for thermocline depth. Where it bulges downward
there's a deep pool of warm water, which is fuel for a storm. That spike is an eddy."

**3.**
> _Re-tick **Show volume**, untick the isosurface. Press **play** on the timeline._

"Twelve analyses over four months. April to July — you're watching the monsoon arrive. And watch
the floats: they drift with the current, so their tracks are themselves a measurement."

---

## 3:15 — Extensibility and honesty

> _Stop the animation. Stand still._

"Adding a new instrument — a mooring, an ADCP, HF radar — means writing one adapter class.
Nothing downstream knows what an ERDDAP is. We proved that by adding a second Argo provider that
names every column differently: it cost one small class and no new parsing code."

"And to be straight with you: we use INCOIS's **public** server. The internal operational archive
needs credentials we don't have, and the adapter is exactly where it would attach."

> _That last sentence is worth saying. It pre-empts the obvious question and shows you understood
> the integration point._

---

## 3:45 — Close

"Browser-native. No install, no plugins, no account. Real INCOIS data, real Argo observations, in
one view — and it's live on the internet right now."

> _If they want the link: **rak2315.github.io/samudra-sih26**_

---

# If something breaks

| Problem | What to do |
| --- | --- |
| Venue wifi dies | Nothing happens. Every byte is baked into the page; the demo makes zero network calls. |
| Rendering is sluggish | Drop **Ray steps** to 64. It stays perfectly readable and changes nothing scientific. |
| Cannot find a float to click | Any marker works. Every float has a profile. |
| Lost in 3D | Press **Return to globe**, then dive again. |
| The whole page misbehaves | Refresh. It reloads in a few seconds from cache. |
| Asked something you do not know | "That's in our decision records — we wrote up why." `docs/adr/` genuinely has nine. |

---

# Questions to expect

| Question | Answer |
| --- | --- |
| "Is this real INCOIS data?" | Yes. `erddap.incois.gov.in`, their 10-day gridded Argo analysis, current to 30 July 2026. The date is on screen, top right. |
| "What are the white dots and red lines?" | Argo floats and their drift tracks. There is a key in the bottom-left corner. |
| "Why does the graph look almost flat / almost identical?" | Because for that float the model got it right. The verdict line says so. Click a different float to see a disagreement. |
| "Why not Cesium?" | It needs an access token, which is a dependency that can fail live, and compositing a ray-marched volume into its pipeline was the riskiest integration available. One Three.js scene makes the dive a genuinely continuous motion. ADR 0001. |
| "How would you add our internal data?" | One Source Adapter class. `pipeline/samudra/sources/base.py` is the whole interface. |
| "Is the depth axis to scale?" | No, deliberately. It is stretched so the top 300 m gets half the axis instead of 15%, because that is where the thermocline is. Stretched depth axes are standard in oceanography, and the profile chart uses the same stretch so the two agree. ADR 0004. |
| "Why 1800× vertical exaggeration?" | The region is about 4000 times wider than it is deep. At true scale it would be an invisible film. |
| "What resolution is the data?" | One degree, because that is what INCOIS publishes. We do not upsample — that would invent structure the instruments never measured. |
| "Does it work offline?" | Yes. That is why it is baked. |
| "Did you use AI to generate the data?" | No. Every number comes from INCOIS's server or the Argo programme. Nothing is simulated or synthesised. |
| "What is the accuracy?" | Across 84 floats the median typical gap between model and instrument is 0.46 °C. That is the analysis's own accuracy, which is what we are measuring. |
| "How long did this take?" | Built for this hackathon. 54 automated tests on the scientific logic, nine architecture decision records. |
