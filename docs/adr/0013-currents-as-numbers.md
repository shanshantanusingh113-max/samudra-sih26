# Currents become a Field with numbers in it

**Supersedes ADR 0011.** That record made currents a rendered image, deliberately and for a
stated reason, and closed with the condition under which it should be reversed. The condition is
now met, so this replaces it rather than quietly breaking it.

## What ADR 0011 said, and what has changed

ADR 0011 carried arrows as a Copernicus WMTS image because their **values** were not anonymous:
measured, the Zarr store answered 200 for `.zmetadata` and every coordinate array and **403**
for `uo` and `vo`. A picture cannot give a reader a number, which is exactly why a picture was
the safe way to carry a field this platform could not verify itself.

What changed is one thing: a Copernicus Marine account is free, and now exists. The credential
is stored on the bake machine, is in `.gitignore`, and never reaches the browser.

**So the cost of this decision is one sentence, and it is stated rather than buried: no account
is needed to view or use this platform; one free account is needed to rebuild its data.**

## The measurement that settles it

ADR 0010 killed a derived geostrophic current Field on measurement, and set the bar every later
attempt has to clear. The new source was held to the same test.

| Source | Date | Fastest surface water | Where |
| --- | --- | --- | --- |
| Our own geostrophic field, rejected | - | 0.16 m/s | on the equator, where geostrophy does not hold |
| Copernicus reanalysis `001_030` | 2026-06-20 | 2.58 m/s | 7.50 N, 50.33 E |
| **Near-real-time, what ships** | **2026-07-30** | **2.94 m/s** | **9.5 N, 51.5 E** |

Right place - that is the Somali Current core - right magnitude against a real 1.5 to 2.5 m/s,
and faster in late July than in June because that is when the monsoon peaks. Measured again from
the baked file after the rebake, through the platform's own loader, and again from the cursor
readout in the running app: 2.69 m/s at 9.33 N, 51.59 E, heading 45 degrees.

## Which product, and why not the one the problem statement names

The PS names `GLOBAL_MULTIYEAR_PHY_001_030`, the reanalysis. It **ends 2026-06-23** and would
leave four of this bake's twelve Timesteps with no currents at all. The near-real-time analysis
and forecast product covers the whole window, and it is the same product family that was already
behind the baked picture - so nothing becomes inconsistent by switching. The reanalysis stays the
right choice for historical work, 1993 to 2026.

## Putting a 1/12 degree product on a 1 degree grid

Copernicus publish twelve times finer than INCOIS. The adapter takes the value at the **nearest
source node** to each model node rather than averaging the twelve-by-twelve block around it.

Averaging is the obvious choice and it is wrong here. A western boundary current is a jet about
two degrees wide; box-averaging it reports a speed that is real nowhere and would have put us
back within a factor of two of the geostrophic field this ADR exists to beat. Nearest gives a
value the source actually published, at a place 0.04 degrees away.

Depth is nearest too, and worth writing down: the model's 5 m Level carries Copernicus's 5.08 m
value and its 50 m Level carries 47.37 m. Both are inside the vertical resolution of either
product.

## The picture is deleted, not kept beside the numbers

`pipeline/samudra/currents.py` and its tests are gone, and the WMTS overlay with them. Keeping
both would have left two renderings of the same quantity on screen, one of which says on its own
panel that it cannot be measured. One truth per quantity. The tile arithmetic is recorded in the
git history and the WMTS route is written up in `docs/plan/`, if an anonymous fallback is ever
wanted.

## What this changes downstream, all of which had to move with it

- Currents are now a `FieldSpec` with `render: "vector"`, an entry in the Variable selector under
  CIRCULATION, and a palette of their own - cmocean's `speed`, which is built for the quantity.
- The vectors ship as **float32 on the model's own Levels and horizontal axes**, one file per
  Timestep, 387 KB each, fetched only when the Field is selected. That is the Grid, not a Volume:
  every arrow's length and the number under the cursor are read off it, and the project's first
  rule says a measurement never comes from a Volume.
- The speed is *also* baked as a Volume, so the Somali Current can be ray-marched as a body of
  water. That Volume colours pixels and answers no question.
- Every sentence that said currents carry no numbers is changed: `CONTEXT.md`'s cut line, the
  README compliance table, the map key, the guide entry, and the deck's claim that every source
  is anonymous.
