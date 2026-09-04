precision highp float;

/* Two roles, switched by uBars.

   uBars = 0 is the page the viewer sees: one flat colour and nothing else.

   uBars = 1 is the light the glass sees, and it is only ever rendered into the
   frame buffer.  A soft box -- a broad, smooth luminance field with no edge
   anywhere in it.

   An earlier version put a lattice of narrow high-contrast bars here.  That
   gave the dispersion plenty to bite on, but a bar is a hard edge, and hard
   edges survive refraction: they printed straight through the body of the mark
   as pale diagonal streaks.  A field this smooth cannot leave a mark of its
   own.  What comes through it is a gentle gradient, and a gentle gradient
   sampled six times at six slightly different offsets is exactly what a wide,
   blended wash of colour is made of. */

uniform vec3  uGround;
uniform vec3  uBoxLo;
uniform vec3  uBoxHi;
uniform float uBars;
uniform float uTime;
uniform float uAspect;

varying vec2 vUv;

void main() {
  if (uBars < 0.5) {
    gl_FragColor = vec4(uGround, 1.0);
    return;
  }

  vec2 p = (vUv - 0.5) * vec2(uAspect, 1.0);
  float t = uTime * 0.05;

  /* One gentle gradient and one very broad centre lift -- nothing else.  Any
     term localised enough to have a shape of its own comes back out through
     the glass as a band lying across the body, so there is deliberately not a
     single feature in here for the refraction to find. */
  float k = 0.5 + p.y * 0.98 + p.x * 0.30 + 0.04 * sin(t);
  k += 0.20 * exp(-dot(p, p) * 1.1);
  k = clamp(k, 0.0, 1.0);
  k = k * k * (3.0 - 2.0 * k);

  gl_FragColor = vec4(mix(uBoxLo, uBoxHi, k), 1.0);
}
