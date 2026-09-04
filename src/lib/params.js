/* Single source of truth for the look.

   Both the tuning app and the embed build read this file, so a value dialled in
   locally is the same value that ships.  Each entry carries its leva metadata
   as well as its value: the app hands the whole object to leva, the embed takes
   `.value` and ignores the rest. */

export const CONTROLS = {
  dispersion: {
    uRefractPower:        { value: 0.16, min: 0, max: 0.6, step: 0.002 },
    uChromaticAberration: { value: 0.5, min: 0, max: 1.5, step: 0.005 },
    uLoopSpread:          { value: 0.22, min: 0.02, max: 0.8, step: 0.005 },
    uDispFloor:           { value: 0.22, min: 0, max: 1, step: 0.005 },
    uDispCurve:           { value: 0.85, min: 0.1, max: 3, step: 0.01 },
    // compounds once per loop pass, so 1.10 is already ~4.6x over the 16
    uSaturation:          { value: 1.028, min: 1, max: 1.4, step: 0.002 },
    uIorR:                { value: 1.14, min: 1, max: 2.0, step: 0.005 },
    uIorY:                { value: 1.17, min: 1, max: 2.0, step: 0.005 },
    uIorG:                { value: 1.20, min: 1, max: 2.0, step: 0.005 },
    uIorC:                { value: 1.24, min: 1, max: 2.0, step: 0.005 },
    uIorB:                { value: 1.28, min: 1, max: 2.0, step: 0.005 },
    uIorV:                { value: 1.33, min: 1, max: 2.0, step: 0.005 },
  },
  light: {
    uShininess:    { value: 26, min: 1, max: 200, step: 1 },
    // broad, so it lifts the flat body as a constant the background cannot
    // touch -- kept low for that reason
    uDiffuseness:  { value: 0.04, min: 0, max: 1, step: 0.01 },
    uSpecular:     { value: 0.42, min: 0, max: 2, step: 0.01 },
    uFresnelPower: { value: 5.0, min: 1, max: 20, step: 0.1 },
    uFresnel:      { value: 0.26, min: 0, max: 1.5, step: 0.01 },
    uLightA:       { value: [-1.0, 1.0, 1.0] },
    uLightB:       { value: [1.0, -0.6, 0.8] },
  },
  prism: {
    uPrism:       { value: 0.85, min: 0, max: 2, step: 0.01 },
    uPrismChroma: { value: 0.44, min: 0, max: 1, step: 0.005 },
    uMilk:        { value: 0.16, min: 0, max: 0.6, step: 0.005 },
    uWash:        { value: 0.18, min: 0, max: 1, step: 0.01 },
    uPrismSpread: { value: 0.8, min: 0, max: 3, step: 0.01 },
    uPrismShift:  { value: 0.28, min: 0, max: 1, step: 0.01 },
    uPrismHueArc: { value: 0.34, min: 0, max: 2, step: 0.01 },
    uBandWidth:   { value: 0.4, min: 0.1, max: 4, step: 0.05 },
    uSpecTint:    { value: 0.4, min: 0, max: 1, step: 0.01 },
  },
  alongTheBolt: {
    uArcAmount: { value: 0.55, min: 0, max: 1, step: 0.01 },
    uArcFreq:   { value: 2.0, min: 0.5, max: 8, step: 0.1 },
    uArcPhase:  { value: 0.0, min: 0, max: 6.28, step: 0.01 },
    arcSpeed:   { value: 0.12, min: 0, max: 1, step: 0.01 },
  },
  body: {
    uAbsorption: { value: 0.0, min: 0, max: 1, step: 0.01 },
    uRolloff:    { value: 0.16, min: 0, max: 2, step: 0.01 },
    uFinalSat:   { value: 0.86, min: 0.5, max: 2, step: 0.01 },
  },
  form: {
    depth:     { value: 0.62, min: 0.1, max: 2, step: 0.01 },
    rim:       { value: 0.15, min: 0.01, max: 0.4, step: 0.005 },
    edgeAngle: { value: 22, min: 2, max: 70, step: 1 },
    wallShape: { value: 1.0, min: 0.3, max: 3, step: 0.05 },
    capShape:  { value: 1.6, min: 0.3, max: 4, step: 0.05 },
    scale:     { value: 1.0, min: 0.3, max: 2.5, step: 0.01 },
    idle:      { value: false },
    spin:      { value: 0.0, min: -0.5, max: 0.5, step: 0.01 },
  },
};

/* Flattened { name: value }, which is what the embed actually wants. */
export const DEFAULTS = Object.values(CONTROLS).reduce((out, group) => {
  for (const [k, v] of Object.entries(group)) out[k] = v.value;
  return out;
}, {});

/* The camera the mark was framed and tuned against. */
export const CAMERA = { z: 7.4, fov: 32, near: 0.1, far: 60 };

/* ---------------------------------------------------------------------------
   The room, derived from whatever colour sits behind the mark.

   boxLo/boxHi are the soft box the glass stands in, and they have to track the
   page.  Leave them fixed while the background changes and the mark reads as an
   object lit by a studio that is not in the scene -- pale and glowing on a dark
   page, or muddy on a light one.  Deriving them means a caller only ever has to
   name the background.

   The two sides are deliberately asymmetric: down is a shadow, up is a
   highlight, and a highlight that lifts as far as the shadow drops washes the
   whole thing out.  These two constants reproduce the pair that was tuned by
   hand on both grounds.
--------------------------------------------------------------------------- */
const SHADOW = 0.30;
const HIGHLIGHT = 0.16;

function hexToRgb(hex) {
  const h = String(hex).trim().replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const toHex = (rgb) =>
  '#' + rgb.map((c) => Math.round(Math.min(255, Math.max(0, c))).toString(16).padStart(2, '0')).join('');

export function roomFromBackground(background) {
  const bg = hexToRgb(background);
  return {
    ground: toHex(bg),
    boxLo: toHex(bg.map((c) => c * (1 - SHADOW))),
    boxHi: toHex(bg.map((c) => c + (255 - c) * HIGHLIGHT)),
  };
}
