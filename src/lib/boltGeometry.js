import * as THREE from 'three';

/* ---------------------------------------------------------------------------
   Brandmark outline
   Traced from the supplied artwork (1190 x 676), centred and normalised so the
   bolt spans y = -1 .. 1.  Wound counter-clockwise, so the outward normal of an
   edge running (ex, ey) is (ey, -ex).
--------------------------------------------------------------------------- */
const A = 0.2663, B = 1.0, C = 1.7604, D1 = 0.1479, D2 = 0.1568;

export const OUTLINE = [
  [-A,  B ],  // 0  top tip
  [-A,  D2],  // 1  inner corner, upper-left notch
  [-C,  D2],  // 2  left tip
  [ A, -B ],  // 3  bottom tip
  [ A, -D1],  // 4  inner corner, lower-right notch
  [ C, -D1],  // 5  right tip
];

/* Ear clipping.  The outline, and its inward offset, are simple CCW polygons. */
function earClip(poly) {
  const n = poly.length;
  const idx = [...Array(n).keys()];
  const out = [];
  const area = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1]);
  const inside = (p, a, b, c) => {
    const d1 = area(p, a, b), d2 = area(p, b, c), d3 = area(p, c, a);
    return !(((d1 < 0) || (d2 < 0) || (d3 < 0)) && ((d1 > 0) || (d2 > 0) || (d3 > 0)));
  };

  let guard = 0;
  while (idx.length > 3 && guard++ < 500) {
    let clipped = false;
    for (let i = 0; i < idx.length; i++) {
      const i0 = idx[(i - 1 + idx.length) % idx.length];
      const i1 = idx[i];
      const i2 = idx[(i + 1) % idx.length];
      const a = poly[i0], b = poly[i1], c = poly[i2];
      if (area(a, b, c) <= 1e-9) continue;               // reflex vertex
      let ok = true;
      for (const j of idx) {
        if (j === i0 || j === i1 || j === i2) continue;
        if (inside(poly[j], a, b, c)) { ok = false; break; }
      }
      if (ok) { out.push([i0, i1, i2]); idx.splice(i, 1); clipped = true; break; }
    }
    if (!clipped) break;
  }
  if (idx.length === 3) out.push([idx[0], idx[1], idx[2]]);
  return out;
}

/* ---------------------------------------------------------------------------
   The prism.

   The silhouette stays a hard-edged extrusion, so the mark reads crisply and
   the tips stay as points.  The rounding lives entirely in the *shading*
   normal, swept along one continuous profile across the whole cross-section.
   Writing phi for the angle the normal makes with the face plane:

     wall           phi sweeps 0 at mid-depth -> edgeAngle at the cap junction
     cap rim        phi sweeps edgeAngle at the outline -> 90 deg going inward
     cap interior   phi = 90 deg, normal flat along +-z

   Pushing the sweep out onto the cap rather than keeping it all on the wall is
   what makes the head-on view work.  Seen from the front a wall is edge-on and
   covers almost no pixels, so a profile that keeps its grazing normals there
   has nowhere to put them, and the mark collapses to a coloured hairline.
   Carried onto the cap, those same grazing normals get a band of real width to
   sit in, and the spectrum stays readable straight on.

   phi reaches the shader as aU, normalised to -1 .. 1, so hue can be spread
   along the profile and arrives as bands lying across the width.
--------------------------------------------------------------------------- */
export function buildBoltGeometry({
  depth = 0.62,
  rim = 0.13,
  edgeAngle = 22,      // degrees, where the wall meets the cap rim
  wallRows = 26,
  rimRows = 22,
  wallShape = 1.0,     // > 1 holds the wall flatter for longer
  capShape = 1.6,      // > 1 widens the grazing band on the cap
  miterLimit = 4.0,
} = {}) {
  const poly = OUTLINE;
  const n = poly.length;
  const hz = depth * 0.5;
  const HALF_PI = Math.PI * 0.5;
  const phiEdge = THREE.MathUtils.degToRad(Math.min(Math.max(edgeAngle, 1), 88));

  // outward unit normal per edge
  const edgeN = [];
  for (let i = 0; i < n; i++) {
    const a = poly[i], b = poly[(i + 1) % n];
    const ex = b[0] - a[0], ey = b[1] - a[1];
    const L = Math.hypot(ex, ey);
    edgeN.push([ey / L, -ex / L]);
  }

  // miter direction per vertex, length-compensated and clamped, so the rim
  // strips of adjacent edges meet without a gap at the corners
  const mit = [];
  for (let i = 0; i < n; i++) {
    const p = edgeN[(i - 1 + n) % n], q = edgeN[i];
    let mx = p[0] + q[0], my = p[1] + q[1];
    const L = Math.hypot(mx, my);
    if (L < 1e-9) { mit.push([q[0], q[1]]); continue; }
    mx /= L; my /= L;
    const sinHalf = mx * q[0] + my * q[1];
    const sc = Math.min(1 / Math.max(Math.abs(sinHalf), 1e-3), miterLimit);
    mit.push([mx * sc, my * sc]);
  }

  const inner = poly.map((p, i) => [p[0] - mit[i][0] * rim, p[1] - mit[i][1] * rim]);

  // normalised arc length at each outline vertex -- drives the variation of
  // dispersion intensity along the bolt
  const cum = [0];
  let total = 0;
  for (let i = 0; i < n; i++) {
    const a = poly[i], b = poly[(i + 1) % n];
    total += Math.hypot(b[0] - a[0], b[1] - a[1]);
    cum.push(total);
  }

  const position = [], normal = [], aArc = [], aU = [], aWall = [], index = [];
  let base = 0;

  const push = (x, y, z, out2, phi, arc, wall) => {
    const c = Math.cos(phi), s = Math.sin(phi);
    position.push(x, y, z);
    normal.push(out2[0] * c, out2[1] * c, s);
    aArc.push(arc);
    aU.push(phi / HALF_PI);
    aWall.push(wall);
  };

  /* ---- walls: one strip per edge, so corners stay hard creases ---------- */
  for (let i = 0; i < n; i++) {
    const a = poly[i], b = poly[(i + 1) % n];
    const en = edgeN[i];
    const arcA = cum[i] / total, arcB = cum[i + 1] / total;

    for (let k = 0; k < wallRows; k++) {
      const u = (k / (wallRows - 1)) * 2 - 1;              // -1 .. 1 across depth
      const phi = Math.sign(u) * phiEdge * Math.pow(Math.abs(u), wallShape);
      push(a[0], a[1], hz * u, en, phi, arcA, 1);
      push(b[0], b[1], hz * u, en, phi, arcB, 1);
    }
    /* Wound outward.  Rows run back to front and each pair runs along the edge,
       so the order matters: (v0, v2, v1) puts the face normal at minus the edge
       normal, and every wall then gets back-face culled on the front pass --
       the extrusion reads as open along any side you can see into, while the
       cap rims carry on rendering and disguise it.  scripts/check-winding.mjs
       compares face normals against shading normals and catches exactly this. */
    for (let k = 0; k < wallRows - 1; k++) {
      const v0 = base + k * 2;
      index.push(v0, v0 + 1, v0 + 2, v0 + 1, v0 + 3, v0 + 2);
    }
    base += wallRows * 2;
  }

  /* ---- cap rims: the band that carries the spectrum head-on ------------- */
  for (const side of [1, -1]) {
    for (let i = 0; i < n; i++) {
      const i1 = (i + 1) % n;
      const en = edgeN[i];
      const arcA = cum[i] / total, arcB = cum[i + 1] / total;

      for (let k = 0; k < rimRows; k++) {
        const t = k / (rimRows - 1);                       // 0 at outline, 1 inside
        const phi = side * (phiEdge + (HALF_PI - phiEdge) * Math.pow(t, capShape));
        const ax = poly[i][0]  + (inner[i][0]  - poly[i][0])  * t;
        const ay = poly[i][1]  + (inner[i][1]  - poly[i][1])  * t;
        const bx = poly[i1][0] + (inner[i1][0] - poly[i1][0]) * t;
        const by = poly[i1][1] + (inner[i1][1] - poly[i1][1]) * t;
        push(ax, ay, hz * side, en, phi, arcA, 1 - t);
        push(bx, by, hz * side, en, phi, arcB, 1 - t);
      }
      for (let k = 0; k < rimRows - 1; k++) {
        const v0 = base + k * 2;
        if (side > 0) index.push(v0, v0 + 1, v0 + 2, v0 + 1, v0 + 3, v0 + 2);
        else index.push(v0, v0 + 2, v0 + 1, v0 + 1, v0 + 2, v0 + 3);
      }
      base += rimRows * 2;
    }
  }

  /* ---- cap interiors: flat, the only part with no sweep on it ----------- */
  const tris = earClip(inner);
  for (const side of [1, -1]) {
    for (let i = 0; i < n; i++) {
      push(inner[i][0], inner[i][1], hz * side, [0, 0], side * HALF_PI, cum[i] / total, 0);
    }
    for (const [i0, i1, i2] of tris) {
      if (side > 0) index.push(base + i0, base + i1, base + i2);
      else index.push(base + i0, base + i2, base + i1);
    }
    base += n;
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(normal, 3));
  g.setAttribute('aArc', new THREE.Float32BufferAttribute(aArc, 1));
  g.setAttribute('aU', new THREE.Float32BufferAttribute(aU, 1));
  g.setAttribute('aWall', new THREE.Float32BufferAttribute(aWall, 1));
  g.setIndex(index);
  g.computeBoundingSphere();
  return g;
}
