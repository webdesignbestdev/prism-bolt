import { buildBoltGeometry } from '../src/lib/boltGeometry.js';

const g = buildBoltGeometry({});
const pos = g.getAttribute('position');
const nrm = g.getAttribute('normal');
const idx = g.index.array;

// Walls come first: 6 edges x wallRows(26) x 2 verts = 312 vertices,
// 6 x 25 x 2 = 300 triangles.
const groups = [
  ['walls',        0, 300],
  ['cap rims',   300, 300 + 2 * 6 * 21 * 2],
  ['cap interior', 300 + 2 * 6 * 21 * 2, idx.length / 3],
];

const v = (i) => [pos.getX(i), pos.getY(i), pos.getZ(i)];
const n = (i) => [nrm.getX(i), nrm.getY(i), nrm.getZ(i)];
const sub = (a, b) => [a[0]-b[0], a[1]-b[1], a[2]-b[2]];
const cross = (a, b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
const dot = (a, b) => a[0]*b[0] + a[1]*b[1] + a[2]*b[2];

for (const [name, t0, t1] of groups) {
  let agree = 0, disagree = 0;
  for (let t = t0; t < t1; t++) {
    const [i0, i1, i2] = [idx[t*3], idx[t*3+1], idx[t*3+2]];
    const geo = cross(sub(v(i1), v(i0)), sub(v(i2), v(i0)));
    // average shading normal of the three corners
    const sh = [0,1,2].map(k => n([i0,i1,i2][k])).reduce((a,b) => [a[0]+b[0],a[1]+b[1],a[2]+b[2]]);
    if (dot(geo, sh) > 0) agree++; else disagree++;
  }
  console.log(`${name.padEnd(14)} triangles=${t1-t0}  outward=${agree}  INWARD=${disagree}`);
}
