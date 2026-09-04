precision highp float;

/* The frame buffer holding everything behind the bolt.  On the front pass this
   is the backside pass, so the light sitting on the far walls is itself
   refracted and dispersed by the near face -- that is what carries colour
   through the middle of the mark instead of leaving a white outline. */
uniform sampler2D uTexture;
uniform vec2  winResolution;

uniform float uRefractPower;
uniform float uChromaticAberration;
uniform float uSaturation;
uniform float uIorR;
uniform float uIorY;
uniform float uIorG;
uniform float uIorC;
uniform float uIorB;
uniform float uIorV;

uniform float uShininess;
uniform float uDiffuseness;
uniform float uSpecular;
uniform float uFresnelPower;
uniform float uFresnel;
uniform vec3  uLightA;
uniform vec3  uLightB;

uniform float uPrism;        // spectral tint carried by the walls themselves
uniform float uPrismChroma;  // how far off white the spectrum is allowed
uniform float uLoopSpread;   // how far the sampling loop walks; blurs the split
uniform float uMilk;         // final lift toward white
uniform float uWash;         // how much tint the flat interior keeps
uniform float uPrismSpread;
uniform float uPrismShift;
uniform float uPrismHueArc;
uniform float uBandWidth;
uniform float uSpecTint;

uniform float uDispFloor;    // how much split survives at normal incidence
uniform float uDispCurve;

uniform float uArcAmount;    // intensity varies along the bolt
uniform float uArcFreq;
uniform float uArcPhase;

uniform float uAbsorption;
uniform float uRolloff;
uniform float uFinalSat;
uniform float uOpacity;

varying vec3  vWorldNormal;
varying vec3  vViewNormal;
varying vec3  vEyeWorld;
varying vec3  vEyeView;
varying float vArc;
varying float vU;
varying float vWall;

#define LOOP 16

const vec3 LUMA = vec3(0.2125, 0.7154, 0.0721);

/* Without this the six-way split averages back out to something close to grey.
   Pulling away from the luminance axis is what keeps the bands readable. */
vec3 sat(vec3 rgb, float adjustment) {
  vec3 intensity = vec3(dot(rgb, LUMA));
  return mix(intensity, rgb, adjustment);
}

float specular(vec3 light, float shininess, float diffuseness) {
  vec3 normal       = vWorldNormal;
  vec3 lightVector  = normalize(-light);
  vec3 halfVector   = normalize(vEyeWorld + lightVector);

  float NdotL = dot(normal, lightVector);
  float NdotH = dot(normal, halfVector);
  float kDiffuse  = max(0.0, NdotL);
  float NdotH2    = NdotH * NdotH;
  float kSpecular = pow(NdotH2, shininess);

  return kSpecular + kDiffuse * diffuseness;
}

float fresnelFn(vec3 eyeVector, vec3 worldNormal, float power) {
  float f = abs(dot(eyeVector, worldNormal));
  return pow(1.0 - f, power);
}

/* A cosine spectrum, pulled back toward white by uPrismChroma so no hue ever
   reaches full saturation, then normalised to unit luminance.

   The normalisation is what makes it usable as a filter.  Multiplying by a
   hue normally darkens; dividing out its luminance first means the tint shifts
   colour without touching brightness, which is the whole trick to a pale
   surface that still has mint, aqua, periwinkle, lavender, blush and cream
   moving across it. */
vec3 spectrum(float t) {
  vec3 hue = 0.5 + 0.5 * cos(6.28318530718 * (t + vec3(0.0, 0.33, 0.67)));
  hue = mix(vec3(1.0), hue, uPrismChroma);
  return hue / max(dot(hue, LUMA), 1e-3);
}

void main() {
  vec2 uv = gl_FragCoord.xy / winResolution.xy;

  vec3 normal = vViewNormal;
  vec3 eye    = vEyeView;

  /* Two out-of-phase waves along the arc length so the strength of the
     dispersion travels along the bolt instead of sitting flat. */
  float arcMod = 1.0 + uArcAmount * (
      0.62 * sin(vArc * 6.28318 * uArcFreq + uArcPhase) +
      0.38 * sin(vArc * 6.28318 * uArcFreq * 2.37 + uArcPhase * 1.7 + 1.1));
  arcMod = max(arcMod, 0.05);

  /* A prism splits nothing at normal incidence and splits hardest at a
     glancing one.  Tying the spread to the incidence angle is what keeps the
     flat caps calm and concentrates the spectrum on the swept walls and the
     silhouette, instead of smearing an oil slick over the whole mark. */
  float incidence = 1.0 - abs(dot(eye, normal));
  float disperse  = mix(uDispFloor, 1.0, pow(clamp(incidence, 0.0, 1.0), uDispCurve));

  float refractPower = uRefractPower * arcMod;
  float aberration   = uChromaticAberration * arcMod * disperse;

  /* One refraction vector per band.  These do not depend on the loop index --
     only the distance walked along them does -- so they are computed once
     rather than sixteen times. */
  vec2 dirR = refract(eye, normal, 1.0 / uIorR).xy;
  vec2 dirY = refract(eye, normal, 1.0 / uIorY).xy;
  vec2 dirG = refract(eye, normal, 1.0 / uIorG).xy;
  vec2 dirC = refract(eye, normal, 1.0 / uIorC).xy;
  vec2 dirB = refract(eye, normal, 1.0 / uIorB).xy;
  vec2 dirV = refract(eye, normal, 1.0 / uIorV).xy;

  vec3 color = vec3(0.0);

  /* Walking the offset out a little further on each pass, then averaging, is
     what keeps the split smooth: a single sample per band gives six hard
     fringes, this gives a continuous spectrum.  The further uLoopSpread walks,
     the wider the averaging window and the more each hue melts into the next,
     until there is no boundary between them left to see. */
  for (int i = 0; i < LOOP; i++) {
    float slide = float(i) / float(LOOP) * uLoopSpread;

    vec4 sR = texture2D(uTexture, uv + dirR * (refractPower + slide * 1.0) * aberration);
    vec4 sY = texture2D(uTexture, uv + dirY * (refractPower + slide * 1.0) * aberration);
    vec4 sG = texture2D(uTexture, uv + dirG * (refractPower + slide * 2.0) * aberration);
    vec4 sC = texture2D(uTexture, uv + dirC * (refractPower + slide * 2.5) * aberration);
    vec4 sB = texture2D(uTexture, uv + dirB * (refractPower + slide * 3.0) * aberration);
    vec4 sV = texture2D(uTexture, uv + dirV * (refractPower + slide * 3.0) * aberration);

    // RGB -> RYGCBV, so yellow, cyan and violet each get their own index of
    // refraction and can be pulled apart independently of the primaries.
    float r = sR.r * 0.5;
    float y = (sY.r * 2.0 + sY.g * 2.0 - sY.b) / 6.0;
    float g = sG.g * 0.5;
    float c = (sC.g * 2.0 + sC.b * 2.0 - sC.r) / 6.0;
    float b = sB.b * 0.5;
    float v = (sV.b * 2.0 + sV.r * 2.0 - sV.g) / 6.0;

    // ... and back again
    float R = r + (2.0 * v + 2.0 * y - c) / 3.0;
    float G = g + (2.0 * y + 2.0 * c - v) / 3.0;
    float B = b + (2.0 * c + 2.0 * v - y) / 3.0;

    color.r += R;
    color.g += G;
    color.b += B;

    color = sat(color, uSaturation);
  }

  color /= float(LOOP);

  /* Beer-Lambert-ish body absorption: the shallow, face-on parts stay clear,
     the thick grazing parts pick up a little density so the mark still has a
     body on a white ground. */
  float f = fresnelFn(vEyeWorld, vWorldNormal, uFresnelPower);
  color *= mix(1.0, 1.0 - uAbsorption, 1.0 - f);

  /* Where am I across the width of this wall?  0 and 1 are the two cap
     junctions, 0.5 is the middle, where the swept normal points straight out.
     t sets the hue, so the spectrum lies out across the full width of the wall
     rather than tracing its edge.

     What sets the strength is the incidence angle, not the position: the part
     of a wall that happens to be grazing is the part that throws colour, and
     which part that is changes as the mark turns.  Pinning the band to the
     middle of the wall instead would freeze it there through every pose. */
  float t = vU * 0.5 + 0.5;

  /* The flat interior keeps a fraction of the tint rather than none, so the
     colour reads as a wash over the whole surface instead of an edge treatment
     that stops dead at the cap. */
  float band = mix(uWash, 1.0, vWall) * pow(clamp(incidence, 0.0, 1.0), uBandWidth);

  vec3 prism = spectrum(t * uPrismSpread + uPrismShift + vArc * uPrismHueArc);

  float specLight = specular(uLightA, uShininess, uDiffuseness) * uSpecular
                  + specular(uLightB, uShininess * 0.6, uDiffuseness) * uSpecular * 0.55;

  /* Tinting the highlight with the same spectrum is what stops the walls
     clipping to flat white where the specular is strongest.  Masked by the
     band, so the caps keep a clean white highlight and only the walls take
     colour -- otherwise a single hue washes over the whole mark. */
  vec3 specColor = mix(vec3(1.0), prism, uSpecTint * band);

  color += specLight * specColor;
  color += f * uFresnel * specColor;

  /* Roll the highlights off along the luminance axis rather than per channel,
     so a hot band gets brighter without sliding towards white. */
  float L = dot(color, LUMA);
  if (L > 0.0001) {
    color *= (L / (1.0 + L * uRolloff)) / L;
  }

  /* Tint as a filter, not as a glow.  Adding colour to a body this bright only
     washes it out -- the hue disappears into the white it is sitting on.
     Multiplying by the unit-luminance tint instead shifts the surface toward
     the hue while leaving its brightness alone, so the pastel survives on a
     pale body. */
  color *= mix(vec3(1.0), prism, clamp(uPrism * band * arcMod, 0.0, 1.0));

  color = sat(color, uFinalSat);

  /* Chalk, not glass-clear -- but scaled by how much light is actually there.

     An unconditional lift toward white is a constant the background has no say
     in: on a dark page it settles over the body as a milky haze and the glass
     stops following its surroundings, reading as a white object lit by a studio
     that is not in the scene.  Scaling by luminance keeps the chalky quality
     wherever there is light to make chalky, and adds nothing where there is
     none, so the body tracks the ground on both. */
  float lum = clamp(dot(color, LUMA), 0.0, 1.0);
  color = mix(color, vec3(1.0), uMilk * lum);

  gl_FragColor = vec4(color, uOpacity);
}
