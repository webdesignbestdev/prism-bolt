import * as THREE from 'three';

import { buildBoltGeometry } from '../lib/boltGeometry.js';
import { DEFAULTS, CAMERA, roomFromBackground } from '../lib/params.js';

import boltVert from '../shaders/bolt.vert.glsl?raw';
import boltFrag from '../shaders/bolt.frag.glsl?raw';
import roomVert from '../shaders/room.vert.glsl?raw';
import roomFrag from '../shaders/room.frag.glsl?raw';

const tmpDir = new THREE.Vector3();

/* Spring, per the motion spec: stiffness 300, damping 30, mass 1. */
function spring(state, target, dt, k = 300, c = 30) {
  const a = -k * (state.v - target) - c * state.vel;
  state.vel += a * dt;
  state.v += state.vel * dt;
}

export function createScene(canvas, opts) {
  const room = roomFromBackground(opts.background);

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    powerPreference: 'high-performance',
  });
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.setClearColor(0x000000, 0);

  /* Colour management off, deliberately.  Every material here is a raw
     ShaderMaterial and three only adds its output colour-space conversion to
     its own built-in shaders, so left on, each hex would be converted sRGB ->
     linear on the way in with nothing converting back on the way out and every
     value would land about 8% dark. */
  THREE.ColorManagement.enabled = false;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(CAMERA.fov, 1, CAMERA.near, CAMERA.far);
  camera.position.set(0, 0, CAMERA.z);

  /* ---- the room ---------------------------------------------------------
     Two planes on the same shader: the ground the glass refracts, and the soft
     box that puts a gradient in it.  Both are billboarded onto the camera, and
     both are hidden for the on-screen pass -- the canvas is transparent, so
     what the page shows through is Webflow's own background, while the glass
     still has a room to bend.  See README: the mark's body follows whatever
     colour this room is, which is why it is derived from `background`.
  --------------------------------------------------------------------- */
  const roomUniforms = (bars) => ({
    uGround: { value: new THREE.Color(room.ground) },
    uBoxLo:  { value: new THREE.Color(room.boxLo) },
    uBoxHi:  { value: new THREE.Color(room.boxHi) },
    uBars:   { value: bars },
    uTime:   { value: 0 },
    uAspect: { value: 1 },
  });

  const makePlane = (bars) => {
    const uniforms = roomUniforms(bars);
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.ShaderMaterial({
        vertexShader: roomVert,
        fragmentShader: roomFrag,
        uniforms,
        toneMapped: false,
        depthWrite: false,
      })
    );
    mesh.frustumCulled = false;
    scene.add(mesh);
    return mesh;
  };

  const ground = makePlane(0);
  const softBox = makePlane(1);

  /* ---- the mark ---------------------------------------------------------- */
  const geometry = buildBoltGeometry({
    depth: DEFAULTS.depth,
    rim: DEFAULTS.rim,
    edgeAngle: DEFAULTS.edgeAngle,
    wallShape: DEFAULTS.wallShape,
    capShape: DEFAULTS.capShape,
  });

  const uniforms = {
    uTexture:      { value: null },
    winResolution: { value: new THREE.Vector2() },
    uLightA:       { value: new THREE.Vector3(...DEFAULTS.uLightA) },
    uLightB:       { value: new THREE.Vector3(...DEFAULTS.uLightB) },
  };
  for (const [k, v] of Object.entries(DEFAULTS)) {
    if (!k.startsWith('u') || uniforms[k]) continue;
    uniforms[k] = { value: v };
  }
  uniforms.uOpacity = { value: 1 };

  const material = new THREE.ShaderMaterial({
    vertexShader: boltVert,
    fragmentShader: boltFrag,
    uniforms,
    toneMapped: false,
  });

  const bolt = new THREE.Mesh(geometry, material);
  bolt.frustumCulled = false;
  scene.add(bolt);

  /* How much of the canvas the mark fills.  Fitting to the frustum rather than
     hard-coding a scale means a tall narrow div and a wide short one both get
     the same proportion of mark to margin, instead of the mark shrinking to a
     speck on one and overflowing the other.

     The fit is measured against the square pose, which is the widest the
     silhouette ever gets -- turning it only foreshortens -- so nothing clips
     part way through the scroll. */
  geometry.computeBoundingBox();
  const bb = geometry.boundingBox;
  const markW = bb.max.x - bb.min.x;
  const markH = bb.max.y - bb.min.y;
  const markD = bb.max.z - bb.min.z;
  const MARGIN = 0.86;

  /* Turning the mark foreshortens it, but it also swings the mark's own depth
     into the silhouette -- a 15 degree tilt adds depth * sin(15) to the height.
     Fitting to the flat outline alone therefore under-measures the pose it is
     about to animate through, and on a 16:9 canvas that ate all but 5% of the
     vertical margin.  Sampling the travel and taking the largest extent on each
     axis keeps the fit honest for whatever angles get dialled in. */
  function fittedExtent() {
    const { from, to } = opts;
    let w = 0, h = 0;
    for (const t of [0, 0.5, 1]) {
      const rx = Math.abs(from.x + (to.x - from.x) * t);
      const ry = Math.abs(from.y + (to.y - from.y) * t);
      w = Math.max(w, markW * Math.cos(ry) + markD * Math.sin(ry));
      h = Math.max(h, markH * Math.cos(rx) + markD * Math.sin(rx));
    }
    return { w, h };
  }

  let mainTarget = null;
  let backTarget = null;
  let width = 0;
  let height = 0;
  let dpr = 1;

  function resize(w, h) {
    if (w === width && h === height) return;
    width = w;
    height = h;
    dpr = Math.min(window.devicePixelRatio || 1, 2);

    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();

    const visibleH = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * camera.position.z;
    const visibleW = visibleH * camera.aspect;
    const ext = fittedExtent();
    const fit = Math.min(visibleW / ext.w, visibleH / ext.h) * MARGIN;
    bolt.scale.setScalar(fit * opts.scale);

    const pw = Math.max(1, Math.floor(w * dpr));
    const ph = Math.max(1, Math.floor(h * dpr));
    mainTarget?.dispose();
    backTarget?.dispose();
    mainTarget = new THREE.WebGLRenderTarget(pw, ph);
    backTarget = new THREE.WebGLRenderTarget(pw, ph);
    uniforms.winResolution.value.set(pw, ph);
  }

  function billboardPlanes() {
    for (const [mesh, offset] of [[ground, 0.5], [softBox, 0]]) {
      const dist = camera.position.length() + 4.5 + offset;
      camera.getWorldDirection(tmpDir);
      mesh.position.copy(camera.position).addScaledVector(tmpDir, dist);
      mesh.quaternion.copy(camera.quaternion);
      const h = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * dist;
      mesh.scale.set(h * (width / height) * 1.05, h * 1.05, 1);
      mesh.material.uniforms.uAspect.value = width / height;
    }
  }

  const rx = { v: 0, vel: 0 };
  const ry = { v: 0, vel: 0 };
  let idleT = 0;

  function render(dt, elapsed, target) {
    if (!mainTarget) return;

    billboardPlanes();
    ground.material.uniforms.uTime.value = elapsed;
    softBox.material.uniforms.uTime.value = elapsed;
    uniforms.uArcPhase.value = DEFAULTS.uArcPhase + elapsed * DEFAULTS.arcSpeed;

    // scroll sets the target; the spring is what stops it feeling mechanical
    if (opts.idle) idleT += dt;
    const driftX = opts.idle ? Math.sin(idleT * 0.21) * 0.11 : 0;
    const driftY = opts.idle ? Math.sin(idleT * 0.17) * 0.46 : 0;

    spring(rx, target.x + driftX, dt);
    spring(ry, target.y + driftY, dt);
    bolt.rotation.set(rx.v, ry.v, 0);

    /* Three passes.  The room is visible for the first two so the glass has
       something to refract, and hidden for the third so the canvas comes out
       transparent everywhere the mark is not. */
    renderer.setClearColor(new THREE.Color(room.ground), 1);

    ground.visible = true;
    softBox.visible = true;
    bolt.visible = false;
    renderer.setRenderTarget(mainTarget);
    renderer.render(scene, camera);

    uniforms.uTexture.value = mainTarget.texture;
    material.side = THREE.BackSide;
    bolt.visible = true;
    renderer.setRenderTarget(backTarget);
    renderer.render(scene, camera);

    uniforms.uTexture.value = backTarget.texture;
    material.side = THREE.FrontSide;
    ground.visible = false;
    softBox.visible = false;
    renderer.setClearColor(0x000000, 0);
    renderer.setRenderTarget(null);
    renderer.render(scene, camera);
  }

  function setBackground(hex) {
    const next = roomFromBackground(hex);
    room.ground = next.ground;
    room.boxLo = next.boxLo;
    room.boxHi = next.boxHi;
    for (const mesh of [ground, softBox]) {
      mesh.material.uniforms.uGround.value.set(next.ground);
      mesh.material.uniforms.uBoxLo.value.set(next.boxLo);
      mesh.material.uniforms.uBoxHi.value.set(next.boxHi);
    }
  }

  function setUniform(name, value) {
    const u = uniforms[name];
    if (!u) return;
    if (u.value && u.value.isVector3) u.value.set(...value);
    else if (u.value && u.value.isColor) u.value.set(value);
    else u.value = value;
  }

  function dispose() {
    mainTarget?.dispose();
    backTarget?.dispose();
    geometry.dispose();
    material.dispose();
    for (const mesh of [ground, softBox]) {
      mesh.geometry.dispose();
      mesh.material.dispose();
    }
    renderer.dispose();
  }

  const getPose = () => ({
    x: bolt.rotation.x, y: bolt.rotation.y, z: bolt.rotation.z,
    scale: bolt.scale.x, canvas: [width, height],
  });

  return { renderer, scene, camera, bolt, resize, render, setBackground, setUniform, getPose, dispose };
}
