import { useCallback, useEffect, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { Leva, useControls, folder } from 'leva';
import * as THREE from 'three';

import Bolt from './components/Bolt';
import { Ground, SoftBox } from './components/Room';

/* The page is one flat colour.  The soft box the glass actually sees is a
   separate, smooth field -- see Room.jsx.

   boxLo/boxHi have to track the ground.  They are the room the glass is
   standing in, so if they stay pale while the page goes black the mark keeps
   reading as a milky white object lit by a studio that is not there, instead of
   showing the dark background through itself.  On black the room is dark and
   the only bright things left are the specular highlights and the dispersion
   riding on them.

   Near neutral is not fussiness either: sat() compounds through the sampling
   loop and cannot tell the room's chroma from the dispersion's, so a tinted
   room gets amplified into a flat cast over the whole mark. */
const THEMES = {
  black: {
    ground: '#05060a',
    boxLo:  '#05060a',
    boxHi:  '#2b2e33',
    page:   '#05060a',
    ink:    'rgba(238,240,245,0.52)',
  },
  white: {
    ground: '#eeedea',
    boxLo:  '#a3a6aa',
    boxHi:  '#fafbfc',
    page:   '#eeedea',
    ink:    'rgba(20,22,27,0.52)',
  },
};

/* Full-resolution still to ./shots, via the dev server's /_shot middleware. */
function saveShot(name) {
  const canvas = document.querySelector('canvas');
  if (!canvas) return;
  const file = name || 'bolt-' + Date.now() + '.png';
  fetch('/_shot?name=' + encodeURIComponent(file), {
    method: 'POST',
    body: canvas.toDataURL('image/png'),
  }).catch(() => {});
}

export default function App() {
  const softBoxRef = useRef();
  const dragging = useRef(false);
  const [panel, setPanel] = useState(true);

  /* Function form, so leva owns the values and hands back a setter.  With the
     object form the schema is rebuilt every render, and the ground lived in
     React state alongside leva's own copy -- press the key and the two drift
     apart, after which picking the option leva already thinks is selected fires
     no change at all and the toggle appears dead. */
  const [c, set] = useControls(() => ({
    ground: folder({
      background: { value: 'black', options: ['black', 'white'] },
    }),
    dispersion: folder({
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
    }),
    light: folder({
      uShininess:    { value: 26, min: 1, max: 200, step: 1 },
      // broad, so it lifts the flat body as a constant the background cannot
      // touch -- kept low for that reason
      uDiffuseness:  { value: 0.04, min: 0, max: 1, step: 0.01 },
      uSpecular:     { value: 0.42, min: 0, max: 2, step: 0.01 },
      uFresnelPower: { value: 5.0, min: 1, max: 20, step: 0.1 },
      uFresnel:      { value: 0.26, min: 0, max: 1.5, step: 0.01 },
      uLightA:       { value: [-1.0, 1.0, 1.0] },
      uLightB:       { value: [1.0, -0.6, 0.8] },
    }),
    prism: folder({
      uPrism:       { value: 0.85, min: 0, max: 2, step: 0.01 },
      uPrismChroma: { value: 0.44, min: 0, max: 1, step: 0.005 },
      uMilk:        { value: 0.16, min: 0, max: 0.6, step: 0.005 },
      uWash:        { value: 0.18, min: 0, max: 1, step: 0.01 },
      uPrismSpread: { value: 0.8, min: 0, max: 3, step: 0.01 },
      uPrismShift:  { value: 0.28, min: 0, max: 1, step: 0.01 },
      uPrismHueArc: { value: 0.34, min: 0, max: 2, step: 0.01 },
      uBandWidth:   { value: 0.4, min: 0.1, max: 4, step: 0.05 },
      uSpecTint:    { value: 0.4, min: 0, max: 1, step: 0.01 },
    }),
    alongTheBolt: folder({
      uArcAmount: { value: 0.55, min: 0, max: 1, step: 0.01 },
      uArcFreq:   { value: 2.0, min: 0.5, max: 8, step: 0.1 },
      uArcPhase:  { value: 0.0, min: 0, max: 6.28, step: 0.01 },
      arcSpeed:   { value: 0.12, min: 0, max: 1, step: 0.01 },
    }),
    body: folder({
      uAbsorption: { value: 0.0, min: 0, max: 1, step: 0.01 },
      uRolloff:    { value: 0.16, min: 0, max: 2, step: 0.01 },
      uFinalSat:   { value: 0.86, min: 0.5, max: 2, step: 0.01 },
    }),
    form: folder({
      depth:     { value: 0.62, min: 0.1, max: 2, step: 0.01 },
      rim:       { value: 0.15, min: 0.01, max: 0.4, step: 0.005 },
      edgeAngle: { value: 22, min: 2, max: 70, step: 1 },
      wallShape: { value: 1.0, min: 0.3, max: 3, step: 0.05 },
      capShape:  { value: 1.6, min: 0.3, max: 4, step: 0.05 },
      scale:     { value: 1.0, min: 0.3, max: 2.5, step: 0.01 },
      // off by default: the mark loads square and only turns when dragged
      idle:      { value: false },
      spin:      { value: 0.0, min: -0.5, max: 0.5, step: 0.01 },
    }),
  }));

  const ground = c.background;
  const theme = THEMES[ground] ?? THEMES.black;

  const toggleGround = useCallback(() => {
    set({ background: ground === 'black' ? 'white' : 'black' });
  }, [set, ground]);

  useEffect(() => {
    document.body.style.background = theme.page;
    document.body.style.setProperty('--ink', theme.ink);
  }, [theme]);

  useEffect(() => {
    window.__shot = saveShot;
    const key = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.isContentEditable) return;
      if (e.key === 'h') setPanel((v) => !v);
      if (e.key === 'g') toggleGround();
      if (e.key === 's') saveShot();
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [toggleGround]);

  const { depth, rim, edgeAngle, wallShape, capShape, scale, idle, spin, arcSpeed, ...uniforms } = c;
  delete uniforms.background;

  const params = { depth, rim, edgeAngle, wallShape, capShape, scale, idle, spin, arcSpeed, uniforms };

  return (
    <>
      <Leva collapsed hidden={!panel} />
      <Canvas
        /* Every material here is a raw ShaderMaterial, and three only adds its
           output colour-space conversion to its own built-in shaders.  Left on,
           colour management converts each hex from sRGB to linear on the way in
           with nothing converting back on the way out, so values land about 8%
           dark and nothing in THEMES means what it says.  Off, the pipeline is
           display-referred all the way through, frame buffers included. */
        legacy
        dpr={[1, 2]}
        camera={{ position: [0, 0, 7.4], fov: 32, near: 0.1, far: 60 }}
        gl={{
          antialias: true,
          alpha: false,
          toneMapping: THREE.NoToneMapping,
          preserveDrawingBuffer: true,
        }}
      >
        <color attach="background" args={[theme.ground]} />
        <Ground theme={theme} />
        <SoftBox ref={softBoxRef} theme={theme} />
        <Bolt params={params} dragging={dragging} softBoxRef={softBoxRef} />
        <OrbitControls
          makeDefault
          enablePan={false}
          enableDamping
          dampingFactor={0.08}
          rotateSpeed={0.8}
          minDistance={3.5}
          maxDistance={16}
          onStart={() => { dragging.current = true; }}
          onEnd={() => { dragging.current = false; }}
        />
      </Canvas>

      <div className="lab tl">Prism Bolt — refraction / dispersion</div>
      <div className="lab bl">
        drag to orbit &nbsp;·&nbsp; scroll to zoom &nbsp;·&nbsp; h — panel &nbsp;·&nbsp; g — ground
        &nbsp;·&nbsp; s — still
      </div>
    </>
  );
}
