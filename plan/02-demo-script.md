# Demo script

Written to be *said out loud*. Roughly 4 minutes at a normal pace; the cuts for a 2-minute slot
are marked. Practise the dive at least twice - it is the moment that lands.

Before you start: open the site, let it finish loading, and leave it on the globe.

---

## 0:00 - The problem, in one breath

> "INCOIS runs ocean models, and INCOIS collects real measurements from robot floats in the
> water. Both already exist. The problem is that nobody can look at them **together** - and
> almost every tool only draws flat maps, one depth at a time. The ocean is four kilometres
> deep. The interesting things happen in the vertical."

## 0:20 - The globe

Point at the coloured region.

> "This is India's ocean territory, coloured with INCOIS's own temperature analysis - their
> public ERDDAP server, real data, current to the 30th of July. Every marker is an Argo float
> that reported in the last 60 days. Eighty-eight of them."

*If a judge asks whether the data is real, this is the moment: the date and the source name are
on screen, top right and bottom left.*

## 0:45 - The dive  ← the moment

Press **Dive into the water**. Say nothing for the two and a half seconds it takes.

> "The globe just unrolled into a map, and the ocean opened up. That is one continuous piece of
> geometry - nothing switched, nothing faded. And this is now a solid block of water: every
> depth from 5 metres to 2 kilometres, rendered at once."

Point at the colour bands.

> "Warm at the top, and this orange band is the thermocline - the sharp temperature boundary
> that controls how much energy a cyclone can pull out of the ocean. It is the single most
> important structure in this picture, and on a flat map you cannot see it at all."

## 1:20 - Why you can see anything

> "One thing worth mentioning. Ocean temperature just decreases with depth, so if you render it
> naively you get an opaque warm lid and a black void underneath. We precompute how fast the
> temperature is *changing* at every point, and make the still water transparent. So the water
> that is doing something is the water you see."

*(Cut this section for a 2-minute slot.)*

## 1:45 - The comparison  ← the actual contribution

Click a float. Use **2902306** if you can find it - Arabian Sea, off Oman.

> "Now I click a float. Green is what the instrument actually measured on the way down. Blue
> dashed is what the model said at that exact position and time. The shaded gap between them is
> the disagreement."

Point at the numbers.

> "119 depth levels matched. The model is running two degrees warm here, RMS 2.3."

Then the payoff:

> "And that is not a bug - that is the tool working. This float is at 21 north, 60 east, off
> Oman, in July. That is the Arabian Sea upwelling season: cold water is being driven up from
> below, and a one-degree gridded analysis smooths it away. A forecaster would want to know
> that before issuing an advisory. **This is the comparison the problem statement says no
> existing tool can do.**"

## 2:30 - Controls, quickly

Do these fast - three actions, about fifteen seconds each.

1. **Narrow the colourbar range.** "Water outside the range disappears, so narrowing it isolates
   a single water mass."
2. **Turn on the isosurface.** "That is the 20 °C isotherm - the standard thermocline proxy. You
   can see it doming, and that spike is an eddy."
3. **Press play.** "Twelve analyses over four months. April to July - you are watching the
   monsoon arrive."

## 3:15 - Extensibility and honesty

> "Adding a new instrument - a mooring, an ADCP, HF radar - means writing one adapter class.
> Nothing downstream knows what an ERDDAP is. And to be straight with you: we use INCOIS's
> **public** server. The internal operational archive needs credentials we do not have, and the
> adapter is exactly where it would attach."

That last sentence is worth saying. It pre-empts the obvious question and shows you understood
the integration point.

## 3:45 - Close

> "Browser-native, no install, no plugins, no account. Real INCOIS data, real Argo observations,
> in one view."

---

## If something breaks

- **Everything is baked into the page.** There is no network call on the demo path. If the venue
  wifi dies, nothing happens.
- **Rendering slow?** Drop "Ray steps" to 64. It stays perfectly readable.
- **Can't find a float to click?** The panel opens for any marker; you do not need a specific
  one. Every float has a profile.
- **Lost in 3D?** Press *Return to globe* and dive again.
- **Asked something you don't know?** "That's in our decision records - we wrote up why."
  `docs/adr/` genuinely has eight of them.

## Questions you should expect

| Question | Answer |
| --- | --- |
| "Is this real INCOIS data?" | Yes - `erddap.incois.gov.in`, their 10-day gridded Argo analysis, current to 30 July 2026. Shown top-right. |
| "Why not Cesium?" | It needs an ion token - an external dependency that can fail live - and compositing a ray-marched volume into its pipeline was the riskiest integration available. One Three.js scene makes the dive a real continuous motion. ADR 0001. |
| "How would you add our internal data?" | One Source Adapter class. `pipeline/samudra/sources/base.py` is the whole interface. |
| "Is the depth axis to scale?" | No, and deliberately - it is warped so the top 300 m gets half the axis instead of 15%, because that is where the thermocline is. Stretched depth axes are standard in oceanography, and the profile chart uses the same warp so the two agree. ADR 0004. |
| "Why is vertical exaggeration 1800×?" | The ocean is ~4000 times wider than it is deep. At true scale it is an invisible film. |
| "What is the resolution?" | 1°, because that is what INCOIS publishes. We do not upsample - that would invent structure the instruments never measured. |
| "Does it work offline?" | Yes. That is why it is baked. |
