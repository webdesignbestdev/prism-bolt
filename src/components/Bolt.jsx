import { useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useFBO } from '@react-three/drei';
import * as THREE from 'three';

import { buildBoltGeometry } from '../lib/boltGeometry';
import vertexShader from '../shaders/bolt.vert.glsl?raw';
import fragmentShader from '../shaders/bolt.frag.glsl?raw';

/* Spring, per the motion spec: stiffness 300, damping 30, mass 1. */
function step(state, target, dt, k = 300, c = 30) {
  const a = -k * (state.v0 - target) - c * state.vel;
  state.vel += a * dt;
  state.v0 += state.vel * dt;
}

/* The render targets do not survive a hot update -- the material comes back
   sampling a disposed texture and the mark goes black -- so take the reload. */
if (import.meta.hot) import.meta.hot.accept(() => window.location.reload());

export default function Bolt({ params, dragging, softBoxRef }) {
  const mesh = useRef();
  const mat = useRef();
  const { size, viewport } = useThree();

  const dpr = Math.min(viewport.dpr, 2);
  const mainTarget = useFBO(size.width * dpr, size.height * dpr);
  const backTarget = useFBO(size.width * dpr, size.height * dpr);

  const geometry = useMemo(
    () =>
      buildBoltGeometry({
        depth: params.depth,
        rim: params.rim,
        edgeAngle: params.edgeAngle,
        wallShape: params.wallShape,
        capShape: params.capShape,
      }),
    [params.depth, params.rim, params.edgeAngle, params.wallShape, params.capShape]
  );

  const uniforms = useMemo(
    () => ({
      uTexture:             { value: null },
      winResolution:        { value: new THREE.Vector2() },
      uRefractPower:        { value: 0.3 },
      uChromaticAberration: { value: 0.6 },
      uSaturation:          { value: 1.4 },
      uIorR:                { value: 1.15 },
      uIorY:                { value: 1.16 },
      uIorG:                { value: 1.18 },
      uIorC:                { value: 1.22 },
      uIorB:                { value: 1.26 },
      uIorV:                { value: 1.30 },
      uShininess:           { value: 40 },
      uDiffuseness:         { value: 0.2 },
      uSpecular:            { value: 0.5 },
      uFresnelPower:        { value: 8 },
      uFresnel:             { value: 0.2 },
      uLightA:              { value: new THREE.Vector3(-1, 1, 1) },
      uLightB:              { value: new THREE.Vector3(1, -0.6, 0.8) },
      uPrism:               { value: 0.5 },
      uPrismChroma:         { value: 0.3 },
      uLoopSpread:          { value: 0.22 },
      uMilk:                { value: 0.1 },
      uWash:                { value: 0.35 },
      uPrismSpread:         { value: 1 },
      uPrismShift:          { value: 0 },
      uPrismHueArc:         { value: 0.3 },
      uBandWidth:           { value: 0.6 },
      uSpecTint:            { value: 0.5 },
      uDispFloor:           { value: 0.12 },
      uDispCurve:           { value: 0.7 },
      uArcAmount:           { value: 0.5 },
      uArcFreq:             { value: 2 },
      uArcPhase:            { value: 0 },
      uAbsorption:          { value: 0.1 },
      uRolloff:             { value: 0.35 },
      uFinalSat:            { value: 1.15 },
      uOpacity:             { value: 1 },
    }),
    []
  );

  // square to the camera at load: no rotation on any axis until something asks
  const rx = useRef({ v0: 0, vel: 0 });
  const ry = useRef({ v0: 0, vel: 0 });
  const idleT = useRef(0);

  useFrame((state, delta) => {
    const { gl, scene, camera, clock } = state;
    const u = mat.current.uniforms;
    const dt = Math.min(delta, 1 / 60);
    const t = clock.elapsedTime;

    /* ---- motion ----------------------------------------------------------
       The mark itself is square to the camera and stays there.  Turning it is
       the orbit controls' job, and nothing else moves it unless the optional
       idle drift is switched on.

       Every term is a bare sine with no phase offset, so the drift is exactly
       zero at t = 0 and eases out of square rather than starting part way
       through its travel.  Its clock only advances while nobody is dragging:
       freezing the phase rather than the output means inspection is not
       fighting a moving target, and letting go resumes from where it stopped.
    --------------------------------------------------------------------- */
    const drifting = params.idle && !(dragging && dragging.current);
    if (drifting) idleT.current += dt;
    const it = params.idle ? idleT.current : 0;

    const idleX = Math.sin(it * 0.21) * 0.11 + Math.sin(it * 0.13) * 0.05;
    const idleY = Math.sin(it * 0.17) * 0.46 + Math.sin(it * 0.09) * 0.16
                + it * params.spin;

    step(rx.current, idleX, dt);
    step(ry.current, idleY, dt);

    mesh.current.rotation.x = rx.current.v0;
    mesh.current.rotation.y = ry.current.v0;

    // inspection hook: window.__bolt.rotation is the ground truth for the pose
    if (typeof window !== 'undefined') window.__bolt = mesh.current;

    // tuning hook: window.__rot = { x, y } pins the pose so shots stay comparable
    if (typeof window !== 'undefined' && window.__rot) {
      mesh.current.rotation.x = window.__rot.x;
      mesh.current.rotation.y = window.__rot.y;
    }

    /* ---- uniforms ------------------------------------------------------- */
    u.winResolution.value.set(size.width * dpr, size.height * dpr);
    for (const [k, v] of Object.entries(params.uniforms)) {
      if (u[k] === undefined) continue;
      if (u[k].value instanceof THREE.Vector3) u[k].value.set(...v);
      else u[k].value = v;
    }
    u.uArcPhase.value = params.uniforms.uArcPhase + t * params.arcSpeed;

    // tuning hook: window.__ov = { uPrism: 0 } overrides any uniform live
    if (typeof window !== 'undefined' && window.__ov) {
      for (const [k, v] of Object.entries(window.__ov)) {
        if (u[k] === undefined) continue;
        if (u[k].value instanceof THREE.Vector3) u[k].value.set(...v);
        else u[k].value = v;
      }
    }

    /* ---- the two passes -------------------------------------------------
       1. the room, soft box and all, minus the bolt, into the main buffer
       2. the bolt's BACK faces, sampling that buffer
       3. the bolt's FRONT faces on screen, sampling the backside buffer

       Because pass 3 samples pass 2, the specular and dispersion sitting on
       the far walls are themselves refracted and split by the near face.  That
       is what puts readable colour inside the mark head-on rather than leaving
       a bright outline around an empty middle.
    --------------------------------------------------------------------- */
    const softBox = softBoxRef.current;
    if (softBox) softBox.visible = true;

    mesh.current.visible = false;
    gl.setRenderTarget(mainTarget);
    gl.render(scene, camera);

    u.uTexture.value = mainTarget.texture;
    mat.current.side = THREE.BackSide;
    mesh.current.visible = true;

    gl.setRenderTarget(backTarget);
    gl.render(scene, camera);

    u.uTexture.value = backTarget.texture;
    mat.current.side = THREE.FrontSide;

    gl.setRenderTarget(null);
    // hidden again before R3F's own render, so it never reaches the screen
    if (softBox) softBox.visible = false;
  });

  return (
    <mesh ref={mesh} geometry={geometry} scale={params.scale}>
      <shaderMaterial
        ref={mat}
        key={vertexShader + fragmentShader}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
        toneMapped={false}
        transparent={false}
      />
    </mesh>
  );
}
