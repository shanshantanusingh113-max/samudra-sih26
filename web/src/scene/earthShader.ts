/**
 * The globe-to-map morph.
 *
 * Every vertex carries its own longitude and latitude and computes *both* of its possible
 * positions - one on a sphere, one on a flat equirectangular map - then mixes between them on
 * a single uniform. So the Drill-down is one continuous deformation of one piece of geometry,
 * not a cross-fade between two scenes that happen to look similar.
 *
 * The sphere's radius is 180/PI, which is the radius whose circumference is exactly the width
 * of the flat map. The world therefore unrolls at constant scale: nothing stretches, nothing
 * pops, and the coastlines stay the same length throughout.
 *
 * The sea surface samples the very same Volume texture the ray-marcher uses, at whichever
 * Level is selected. That is deliberate - the field a viewer sees painted on the ocean from
 * orbit is numerically the same data they are about to fly into, so the Drill-down never has
 * to argue that the two views agree.
 */

export const EARTH_RADIUS = 180 / Math.PI;

/** Shared by every morphing object: turns (lon, lat) into a world position. */
const morphChunk = /* glsl */ `
uniform float uMorph;
const float PI = 3.141592653589793;
const float EARTH_RADIUS = ${(180 / Math.PI).toFixed(6)};

vec3 spherePosition(vec2 lonLat, float lift) {
  float phi = radians(lonLat.x);
  float theta = radians(lonLat.y);
  float r = EARTH_RADIUS + lift;
  return vec3(r * cos(theta) * sin(phi), r * sin(theta), r * cos(theta) * cos(phi));
}

vec3 flatPosition(vec2 lonLat, float lift) {
  return vec3(lonLat.x, lift, -lonLat.y);
}

vec3 morphedPosition(vec2 lonLat, float lift) {
  return mix(spherePosition(lonLat, lift), flatPosition(lonLat, lift), uMorph);
}

vec3 morphedNormal(vec2 lonLat) {
  float phi = radians(lonLat.x);
  float theta = radians(lonLat.y);
  vec3 sphereNormal = vec3(cos(theta) * sin(phi), sin(theta), cos(theta) * cos(phi));
  return normalize(mix(sphereNormal, vec3(0.0, 1.0, 0.0), uMorph));
}
`;

export const coastlineVertexShader = /* glsl */ `
in vec2 lonLat;
${morphChunk}
void main() {
  vec3 world = morphedPosition(lonLat, 0.06);
  gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
}
`;

export const coastlineFragmentShader = /* glsl */ `
precision highp float;
uniform vec3 uColour;
uniform float uOpacity;
out vec4 fragColor;
void main() {
  fragColor = vec4(uColour, uOpacity);
}
`;

export const surfaceVertexShader = /* glsl */ `
in vec2 lonLat;
${morphChunk}
out vec2 vLonLat;
out vec3 vNormal;
out vec3 vWorld;
void main() {
  vLonLat = lonLat;
  vNormal = morphedNormal(lonLat);
  vec3 world = morphedPosition(lonLat, 0.0);
  vWorld = world;
  gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
}
`;

export const surfaceFragmentShader = /* glsl */ `
precision highp float;
precision highp sampler3D;

uniform sampler3D uVolume;
uniform sampler2D uPalette;
uniform vec4  uRegion;        // west, east, south, north
uniform float uDepthFraction; // which Level is painted on the sea surface
uniform float uWindowMin;
uniform float uWindowMax;
uniform float uFieldOpacity;
uniform vec3  uOceanColour;
uniform vec3  uLightDirection;
uniform float uMorph;
uniform float uRegionCutout;  // 1 = the study region is open, so you look into the water
uniform float uShadeFloor;    // how dark the unlit limb goes; higher keeps a pale globe pale
uniform float uRimStrength;   // 0 on the light console: an additive glow on white is a smudge
uniform vec3  uRimColour;

in vec2 vLonLat;
in vec3 vNormal;
in vec3 vWorld;
out vec4 fragColor;

void main() {
  vec3 base = uOceanColour;

  // How far inside the study region this fragment is, in degrees, so the field can fade out
  // at the edges instead of ending on a hard rectangle that reads as a rendering artefact.
  float insetLon = min(vLonLat.x - uRegion.x, uRegion.y - vLonLat.x);
  float insetLat = min(vLonLat.y - uRegion.z, uRegion.w - vLonLat.y);
  float inset = min(insetLon, insetLat);
  float regionMask = smoothstep(0.0, 3.5, inset);

  // Cut the sea surface away over the region once we are in the Volume View. Without this the
  // opaque surface sits on top of the water column and the ray-marched volume is never seen.
  float cutout = regionMask * uRegionCutout;
  if (cutout > 0.985) discard;

  float fieldAlpha = 0.0;
  vec3 fieldColour = base;

  if (inset > 0.0) {
    // Node centres, not texel edges - see the matching note in volumeShader.ts.
    vec3 fraction = vec3(
      (vLonLat.x - uRegion.x) / (uRegion.y - uRegion.x),
      (vLonLat.y - uRegion.z) / (uRegion.w - uRegion.z),
      uDepthFraction
    );
    vec3 size = vec3(textureSize(uVolume, 0));
    vec3 tc = (fraction * (size - 1.0) + 0.5) / size;
    vec3 sampled = texture(uVolume, tc).rgb;
    float t = clamp((sampled.r - uWindowMin) / max(uWindowMax - uWindowMin, 1e-5), 0.0, 1.0);
    fieldColour = texture(uPalette, vec2(t, 0.5)).rgb;
    fieldAlpha = sampled.g * uFieldOpacity * regionMask;
  }

  vec3 colour = mix(base, fieldColour, fieldAlpha);

  // Gentle shading so the globe reads as a sphere, fading out as it flattens into a map.
  float lambert = uShadeFloor +
    (1.0 - uShadeFloor) * max(dot(normalize(vNormal), normalize(uLightDirection)), 0.0);
  colour *= mix(lambert, 1.0, uMorph * 0.75);

  // A rim light that only exists while there is a limb to catch it.
  vec3 viewDirection = normalize(cameraPosition - vWorld);
  float fresnel = pow(1.0 - max(dot(normalize(vNormal), viewDirection), 0.0), 3.0);
  colour += uRimColour * fresnel * (1.0 - uMorph) * uRimStrength;

  fragColor = vec4(colour, 1.0 - cutout);
}
`;
