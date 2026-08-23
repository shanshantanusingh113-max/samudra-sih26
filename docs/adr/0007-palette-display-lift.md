# cmocean palettes get a display lift, applied to the palette itself

Every perceptually-uniform ocean palette runs to near-black at its cold end, because that is
what makes it perceptually uniform on a white page. In a dark 3D scene it is a disaster: water
at 3 degC encodes to a colour within a couple of levels of the background, so the bottom of the
water column renders correctly and is invisible.

We apply a gamma lift (0.62). It is monotonic, so colder still reads darker than warmer, and the
ordering a viewer infers from the image is never wrong.

The important part is *where*. The lift is applied to the palette, in one place, so the colourbar
drawn in the control panel and the water drawn in the scene are the same numbers. Applying it
only in the shader - the first thing we tried - would have quietly made the legend a lie.

We keep cmocean rather than inventing a palette: thermal, haline and the rest are the convention
in oceanography, and any oceanographer on a judging panel will recognise them.
