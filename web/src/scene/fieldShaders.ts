/**
 * The two render types that are not a ray march.
 *
 * `CONTEXT.md` used to have one way of drawing a Field, because there was one kind of Field:
 * a value at every depth. The September 2026 hazard Fields are not that. Three of them **are a
 * depth** - the 26 °C isotherm, the mixed layer, the isothermal layer - and two are one number
 * for the whole column. Drawing either as a Volume would be drawing a picture of the wrong
 * thing.
 *
 * So a depth Field is drawn as a **sheet**: a surface inside the block, sitting at the depth it
 * reports, with the Floats suspended around it. You watch the 26 °C isotherm dome up and
 * collapse across four months, inside the water. That is the one picture in this project that no
 * flat map can produce, and it costs one mesh that three Fields share.
 *
 * Both shaders here take their colour **per vertex, computed on the CPU** by `palette.ts`, so
 * the sheet, the drape on the sea surface and the swatch in the control panel go through exactly
 * the same `liftedPalette` and `transfer` calls. This is the discipline ADR 0007 set for the
 * colourbar, extended to everything that is not the ray marcher: no shader here knows a unit, a
 * range or a scale, so none of them can drift out of step with the legend.
 *
 * Both also morph, using the same sphere/plane mix as `earthShader.ts`. A sheet has no meaning
 * on the globe, so it fades out there rather than hanging off the limb; arrows do have meaning
 * on the globe, so they follow it round.
 */

export const EARTH_RADIUS = 180 / Math.PI;

const morphChunk = /* glsl */ `
uniform float uMorph;
const float PI = 3.141592653589793;
const float SPHERE_RADIUS = ${(180 / Math.PI).toFixed(6)};

vec3 spherePosition(vec2 lonLat, float lift) {
  float phi = radians(lonLat.x);
  float theta = radians(lonLat.y);
  float r = SPHERE_RADIUS + lift;
  return vec3(r * cos(theta) * sin(phi), r * sin(theta), r * cos(theta) * cos(phi));
}
`;

/**
 * A Field drawn as a surface: either at the depth it reports, or draped on the sea surface.
 *
 * `depthY` is already in world units - the Depth Warp inverted through `geography.ts` on the CPU
 * - because re-deriving the warp in GLSL is exactly the mistake `CLAUDE.md` says has already been
 * made once here.
 */
export const sheetVertexShader = /* glsl */ `
in vec2 lonLat;
in float depthY;
in vec4 tint;
${morphChunk}
out vec4 vTint;
out vec3 vWorld;

void main() {
  vTint = tint;
  // Named plane and not flat. GLSL reserves flat as an interpolation qualifier, and using it as
  // an identifier is a syntax error the compiler reports at the line AFTER the declaration.
  vec3 plane = vec3(lonLat.x, depthY, -lonLat.y);
  vec3 world = mix(spherePosition(lonLat, 0.2), plane, uMorph);
  vWorld = world;
  gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
}
`;

export const sheetFragmentShader = /* glsl */ `
precision highp float;
uniform float uOpacity;
uniform float uFade;   // 0 on the globe, 1 in the Volume View
in vec4 vTint;
out vec4 fragColor;

void main() {
  float alpha = vTint.a * uOpacity * uFade;
  if (alpha < 0.004) discard;
  fragColor = vec4(vTint.rgb, alpha);
}
`;

/**
 * Current arrows.
 *
 * Line segments rather than instanced cones: a shaft and two barbs read correctly at every zoom
 * this scene reaches, cost nothing on integrated graphics, and stay legible over a ray-marched
 * volume in a way a solid glyph does not.
 *
 * Every arrow is coloured by its own speed through the Field's palette, so the arrows and the
 * colourbar say the same thing - and unlike the rendered overlay this replaced, there is a real
 * number behind each one.
 */
export const arrowVertexShader = /* glsl */ `
in vec2 lonLat;
in float depthY;
in vec4 tint;
${morphChunk}
out vec4 vTint;

void main() {
  vTint = tint;
  vec3 plane = vec3(lonLat.x, depthY, -lonLat.y);
  vec3 world = mix(spherePosition(lonLat, 0.22), plane, uMorph);
  gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
}
`;

export const arrowFragmentShader = /* glsl */ `
precision highp float;
uniform float uOpacity;
in vec4 vTint;
out vec4 fragColor;

void main() {
  fragColor = vec4(vTint.rgb, vTint.a * uOpacity);
}
`;
