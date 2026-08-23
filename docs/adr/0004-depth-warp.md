# The Volume's vertical axis is warped, not linear in metres

INCOIS publishes 24 unevenly spaced levels - 5 m apart near the surface, 200 m apart in the
abyss - because that is where the physics is. A GPU 3D texture samples on an evenly spaced
lattice. Something has to reconcile the two.

Resampling linearly in metres would spend about 85% of the texture on the featureless deep
ocean and crush the thermocline - the one structure a forecaster actually looks at - into three
voxels. So the third axis is a warped coordinate, dense near the surface and sparse at depth:
the top 300 m gets roughly half the axis instead of 15%.

The cost is that the vertical axis is not proportional to depth, which is a real perceptual
claim to make carelessly about a "block of water". Two things keep it honest: a stretched depth
axis is ordinary practice in oceanography, and the profile chart uses the *same* warp, so the
3D view and the chart agree about where the thermocline is.

The inverse mapping is shipped in the manifest as the sampled axis (depthAxisMetres) and read
back by the frontend, rather than the warp formula being reimplemented in a second language
where it could silently drift out of step with the pipeline.
