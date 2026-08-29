/**
 * The ray-marching Volume shader.
 *
 * Rendered on the *back* faces of the bounding box so the volume survives the camera moving
 * inside it - a front-face pass would be culled the moment you fly into the water, which is
 * exactly what the Drill-down does.
 *
 * The march happens in world space against an axis-aligned box rather than in the unit cube.
 * That costs nothing (the box never rotates; only the Vertical Exaggeration scales it) and it
 * removes a matrix inverse per fragment, which is not free on integrated graphics.
 */

export const volumeVertexShader = /* glsl */ `
out vec3 vWorldPosition;

void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorldPosition = world.xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

export const volumeFragmentShader = /* glsl */ `
precision highp float;
precision highp sampler3D;

uniform sampler3D uVolume;    // R = value, G = coverage, B = gradient magnitude
uniform sampler2D uPalette;   // 256 x 1 transfer function
uniform vec3  uBoxMin;
uniform vec3  uBoxMax;
uniform float uWindowMin;     // Transfer Function window, normalised into the encoded range
uniform float uWindowMax;
uniform float uOpacity;
uniform float uSteps;
uniform float uDepthFrom;     // depth-slice gate, 0 = surface, 1 = floor
uniform float uDepthTo;
// Isolating one Anomaly Feature: the box it occupies, in texture coordinates, and how hard to
// hide everything else. A coloured blob inside a solid block tells you that water departed and
// almost nothing about its shape - you cannot see where it starts, how deep it runs or whether
// it is one body or three. Clearing the rest away is the only way to actually look at it.
uniform vec3  uFocusMin;
uniform vec3  uFocusMax;
uniform float uFocusStrength; // 0 = draw everything, 1 = draw only the Feature
uniform float uIsoValue;      // normalised; ignored unless uIsoEnabled
uniform float uIsoEnabled;
uniform float uVolumeEnabled;
uniform float uEmphasis;   // how hard to favour where the field is changing
uniform vec3  uLightDirection;
uniform float uTime;

in vec3 vWorldPosition;
out vec4 fragColor;

const int MAX_STEPS = 384;

vec2 intersectBox(vec3 origin, vec3 direction) {
  vec3 inverseDir = 1.0 / direction;
  vec3 a = (uBoxMin - origin) * inverseDir;
  vec3 b = (uBoxMax - origin) * inverseDir;
  vec3 near = min(a, b);
  vec3 far  = max(a, b);
  return vec2(max(max(near.x, near.y), near.z), min(min(far.x, far.y), far.z));
}

/** World point -> texture coordinate. Latitude and depth both run opposite to the world axes. */
vec3 toTexture(vec3 p) {
  vec3 span = uBoxMax - uBoxMin;
  vec3 fraction = vec3(
    (p.x - uBoxMin.x) / span.x,          // longitude, west to east
    (uBoxMax.z - p.z) / span.z,          // latitude, south to north
    (uBoxMax.y - p.y) / span.y           // depth, surface downwards
  );

  // The box corners are grid *node centres*, not texel edges: INCOIS publishes values AT
  // 55.5E, 56.5E and so on, and a texel's centre sits at (i + 0.5) / N. Mapping the corners
  // straight to 0 and 1 stretches the field by N/(N-1) about the region centre and displaces
  // it by up to half a grid cell - about 55 km here. In a tool whose whole purpose is
  // comparing a model value against an observation *at a position*, that is not cosmetic.
  vec3 size = vec3(textureSize(uVolume, 0));
  return (fraction * (size - 1.0) + 0.5) / size;
}

/** Value -> position along the Transfer Function, honouring the window and the scale. */
float shape(float raw) {
  float t = (raw - uWindowMin) / max(uWindowMax - uWindowMin, 1e-5);
  return clamp(t, 0.0, 1.0);
}

/** Cheap hash, to dither the ray start and break up the wood-grain banding. */
float hash(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

vec3 gradientAt(vec3 tc, vec3 texel) {
  return normalize(vec3(
    texture(uVolume, tc + vec3(texel.x, 0.0, 0.0)).r - texture(uVolume, tc - vec3(texel.x, 0.0, 0.0)).r,
    texture(uVolume, tc + vec3(0.0, texel.y, 0.0)).r - texture(uVolume, tc - vec3(0.0, texel.y, 0.0)).r,
    texture(uVolume, tc + vec3(0.0, 0.0, texel.z)).r - texture(uVolume, tc - vec3(0.0, 0.0, texel.z)).r
  ) + vec3(1e-6));
}

void main() {
  vec3 origin = cameraPosition;
  vec3 direction = normalize(vWorldPosition - origin);

  vec2 hit = intersectBox(origin, direction);
  hit.x = max(hit.x, 0.0);
  if (hit.x > hit.y) discard;

  float span = hit.y - hit.x;
  float steps = clamp(uSteps, 24.0, float(MAX_STEPS));
  float stepSize = span / steps;

  vec3 texel = 1.0 / vec3(textureSize(uVolume, 0));

  // Opacity correction: the accumulated alpha must not depend on how finely we happened to
  // sample. Without this, dragging the quality slider visibly changes how dense the water looks.
  float reference = span / 256.0;

  vec4 accumulated = vec4(0.0);
  float t = hit.x + stepSize * hash(gl_FragCoord.xy + uTime);
  float previousIso = 0.0;
  bool haveIso = false;

  for (int i = 0; i < MAX_STEPS; i++) {
    if (t > hit.y || accumulated.a > 0.995) break;

    vec3 point = origin + direction * t;
    vec3 tc = toTexture(point);

    if (tc.z >= uDepthFrom && tc.z <= uDepthTo) {
      vec3 sampled = texture(uVolume, tc).rgb;
      float coverage = sampled.g;

      if (coverage > 0.02) {
        float shaped = shape(sampled.r);

        // How far inside the focused box this sample is. Smoothed over a small margin rather
        // than a hard cut, so the isolated body has an edge you can read as a shape instead of
        // a staircase of voxels.
        float inside = 1.0;
        if (uFocusStrength > 0.001) {
          vec3 margin = vec3(0.012, 0.012, 0.010);
          vec3 low  = smoothstep(uFocusMin - margin, uFocusMin + margin, tc);
          vec3 high = 1.0 - smoothstep(uFocusMax - margin, uFocusMax + margin, tc);
          float box = low.x * low.y * low.z * high.x * high.y * high.z;
          inside = mix(1.0, box, uFocusStrength);
        }

        if (uIsoEnabled > 0.5) {
          float signedDistance = sampled.r - uIsoValue;
          if (haveIso && previousIso * signedDistance < 0.0 && inside > 0.5) {
            vec3 normal = -gradientAt(tc, texel);
            float lambert = 0.35 + 0.65 * max(dot(normal, uLightDirection), 0.0);
            vec3 isoColour = texture(uPalette, vec2(shape(uIsoValue), 0.5)).rgb;
            vec3 lit = isoColour * lambert + vec3(0.25) * pow(max(dot(normal, uLightDirection), 0.0), 24.0);
            accumulated.rgb += (1.0 - accumulated.a) * lit * coverage;
            accumulated.a += (1.0 - accumulated.a) * coverage;
            break;
          }
          previousIso = signedDistance;
          haveIso = true;
        }

        if (uVolumeEnabled > 0.5) {
          // Values outside the window drop out entirely. That is what makes narrowing the
          // colourbar an analytical act and not just a recolouring: it isolates a water mass.
          float inWindow =
              smoothstep(0.0, 0.04, (sampled.r - uWindowMin) / max(uWindowMax - uWindowMin, 1e-5))
            * (1.0 - smoothstep(0.96, 1.0, (sampled.r - uWindowMin) / max(uWindowMax - uWindowMin, 1e-5)));

          // Featureless water fades out; the thermocline, haloclines and fronts stay solid.
          // Without this, a monotonic field is just an opaque warm lid over an invisible abyss.
          float emphasis = mix(1.0, 0.12 + 3.4 * sampled.b, uEmphasis);

          float alpha = uOpacity * coverage * inWindow * emphasis * inside;

          // Isolating one Feature removes everything the ray used to accumulate on the way
          // through, so the body left behind has to carry the whole picture by itself. At the
          // opacity that reads correctly for a full block it comes out as a faint smudge.
          alpha *= 1.0 + 3.0 * uFocusStrength;
          alpha = 1.0 - pow(max(1.0 - alpha, 0.0), stepSize / reference);

          vec3 colour = texture(uPalette, vec2(shaped, 0.5)).rgb;
          accumulated.rgb += (1.0 - accumulated.a) * colour * alpha;
          accumulated.a   += (1.0 - accumulated.a) * alpha;
        }
      }
    }

    t += stepSize;
  }

  if (accumulated.a < 0.003) discard;

  // The palette is already display-lifted (see palette.ts), so nothing is adjusted here and
  // the colourbar in the panel is exactly the colour scale the water is drawn with.
  fragColor = vec4(accumulated.rgb / max(accumulated.a, 1e-4), accumulated.a);
}
`;
