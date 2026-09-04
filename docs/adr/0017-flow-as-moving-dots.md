# Currents are drawn as moving dots, and that is not the volumetric streamlines we refused

`CONTEXT.md` has said since the first round that streamlines and particle advection through the
block are "a project in themselves", and `docs/plan/01-cut-features.md` lists volumetric current
streamlines under what was cut. Both are still right. This record exists because **they were
answering a different question** from the one the platform now answers, and the distinction was
nowhere in writing - so the next person to read either line would reasonably have concluded that
what is now on screen had already been refused.

## The two things, and why only one of them is a lie

**Volumetric streamlines** follow the water in three dimensions. Doing that needs a vertical
velocity, `w`. The Copernicus product this platform reads publishes `uo` and `vo` and no `w`, and
INCOIS's own analysis publishes neither. A three-dimensional particle drawn from two components
is a particle that is claiming a vertical motion nobody measured, in the one dimension this whole
project exists to take seriously. That stays refused, and the reason is now written down rather
than filed under "a project in itself".

**A sheet of dots on one Level** is a different object. It uses exactly the two components that
exist, on exactly the horizontal plane the current arrows already sit on, and makes no claim
about any depth other than the one it is drawn at. It is what the Copernicus MyOcean Pro viewer
calls "Particles" and what earth.nullschool.net has drawn for a decade, and it is honest for the
same reason an arrow is honest: it encodes the two numbers the file carries and nothing else.

## What was built

A `ParticleFlow` of 2,400 dots, each carrying a 20-segment trail whose alpha falls off towards
the tail. It sits on the depth the Current arrows group already chooses, is filtered by the same `colourOf`
and `transfer` the colourbar uses, and is drawn with the **arrows' own shader** - which already
takes a per-vertex tint with an alpha, so the two styles of this layer share a material. It is
**inked rather than tinted**; see the amendment below for why that is the one exception in this
platform to colouring a mark by its own value.

`store.currentStyle` chooses between them. Dots are the default because a viewer who has never
read a vector plot reads them anyway, which is the audience PS 26067 names in its own words;
arrows are one click away because they are the mark the problem statement asks for by name and
the one that survives a screenshot.

## The rule that makes it defensible: it is the drift model

The temptation with a decorative layer is to give it a cheap integrator, because nobody reads a
number off it. This project has been bitten by exactly that shape of decision once - a second
copy of the Scale silently disagreed with the first and the log scale had to be cut - so the
animation and the scored drift model share their arithmetic:

- `sample()` in `drift.ts` is the bilinear lookup, refusing a cell any of whose four corners are
  masked, exactly as `Grid.column_at` does in the pipeline.
- `midpointStep()` in `drift.ts` is the step rule, and it is now the **only** place that rule is
  written. `integrateDrift` was refactored onto it in the same change.

So every dot on screen is running the integrator whose error is published: median **38.5 km**
over one Argo cycle across 195 floats, 1,908 cycles, at 1000 m. No other build of this shape can
say that about its animation, because none of them has the observations sitting in the same file.

**Measured, `web/probe-particles.mjs`:** a particle advanced 60 frames and an `integrateDrift`
path over the same elapsed ocean time from the same start point end up **0.002 km apart after
724 km of travel**. The layer covers **1.83%** of the frame against a **0.001%** baseline with it
hidden, and **0 of 2,400** dots sit where the field has no current.

## Amended the same day: the trail is inked, not tinted

The first version coloured each trail by its own speed, through the palette, like the arrows. It
is the obvious thing and it makes the layer illegible, for a reason that is structural rather
than aesthetic: **the dot sits directly on water coloured by the same number through the same
palette.** Where the current is slow the water is pale and the dot on top of it is pale, so it
has zero contrast against exactly the background it is drawn on - over most of the basin, on both
themes. What read at all was the fast water, and only because motion supplied the edge that
colour did not.

So the trail carries **direction** and nothing else, in one ink: near-white on the dark console,
near-black on the light one. The speed is still carried three ways, all of which work: the water
underneath, how far a dot travels per frame, and the real number under the cursor. Colouring the
trail by speed was a fourth copy of one fact and it was the copy that cost the picture.

This is the only mark in the platform not coloured by its own value, so it is the only place the
legend has to say so. The map key now reads *"Current, dots carried along the flow. The water's
colour is the speed"*, and the guide entry says the trails carry direction only. Nothing on
screen claims the trail's colour means anything. Copernicus's MyOcean Pro and earth.nullschool
both draw white particles over a coloured scalar field for the same reason.

**The window still filters.** A dot whose speed falls outside the Transfer Function window is
dropped rather than inked, so narrowing the range stays analytical for this layer exactly as it
is for the water. Measured after the change: the layer covers **1.83%** of the frame against
**1.33%** when it was tinted.

**And a panel bug came out of the same screenshot.** Current Speed declares `render: "vector"`
but *also* carries a Volume, and `OceanScene` hides the volume mesh only for a sheet or a drape -
so the currents drew a block of water while `Controls.tsx` hid Water opacity, Ray steps and Show
volume, because it gated them on `render === "volume"`. A reader was being shown a layer with no
control over it, and the one thing that would have fixed their legibility problem in one click
was not on screen. The panel's predicate is now the scene's: not a sheet, not a drape.

## What it deliberately does not show

**Eddies.** The field is INCOIS's 1 degree lattice - about 110 km a cell - sampled at the nearest
node from Copernicus's 1/12 degree product. Every swirl in a 1/12 degree rendering of this water
is smaller than one of our cells. The dots draw the Somali Current, the monsoon gyre and the
equatorial jets correctly and draw no eddies at all, and the guide entry says so as a fact about
resolution rather than as an apology.

Baking a finer current field purely for the animation was considered and refused. Estimated at
1/12 degree over the region it is about 2.2 MB a Timestep and 27 MB for twelve, which is
affordable - and it would make the picture finer than **every number the platform reports**, in
the one place a viewer would never think to check. That is ADR 0011's mistake with a different
subject, and ADR 0013 is the record of walking it back.

**Time.** A dot moves through **one** analysis, frozen at the Timestep on screen. It is the flow
at that instant, not a trajectory over days, and the guide entry says which is which in its
second bullet. The clock is sped up - a current is too slow to see otherwise, which is true of
every particle animation ever drawn - and the constant lives in one place in `particles.ts` so the
probe and the prose read it rather than quoting it.

## Consequences

- `CONTEXT.md` and `README.md` both carried a sentence saying particle advection is a project in
  itself. Both now say which half is built and which half is still refused, and why.
- `probe-hazard.mjs` measured the arrows with no style set. It now sets `currentStyle: "arrows"`
  first, because the default changed underneath it.
- The map key, the guide entry, the depth group's title and `describeView` all name what is
  actually drawn rather than saying "arrows" whichever style is on.
