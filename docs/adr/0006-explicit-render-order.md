# Transparent passes are ordered explicitly

Three.js sorts transparent objects by distance to each object's **centroid**. That is a fine
heuristic for compact meshes and useless for ours: the sea surface spans the entire globe, so
its centroid sits at the origin while the part you are looking at is thousands of units away.

The symptom cost hours and is worth recording. The ray-marched volume rendered as a thin bright
sliver instead of a 32-unit-tall block. Every plausible cause was investigated and cleared by
measurement - the mesh transform was correct (45 x 32.3 x 35), the shader uniforms were correct,
the box projected to 844 px of a 900 px viewport, and the baked data had 69-78% coverage at
every depth with values falling smoothly from 248 to 13. The geometry rendered perfectly and was
then painted over by the opaque world sea surface, which the centroid sort had placed *after*
it. Disabling depthWrite did not help, because it was never a depth-test failure.

Draw order is now stated rather than inferred: surface 0, lines 5, volume 10, markers 20.

The general lesson, which applies to anything world-spanning we add later: centroid-based
sorting is meaningless for geometry whose extent dwarfs its centre, and the failure mode is
silent - it looks exactly like a broken shader.
