import { useCallback, useEffect, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { Leva, useControls, folder } from 'leva';
import * as THREE from 'three';

import Bolt from './components/Bolt';
import { Ground, SoftBox } from './components/Room';
import { CONTROLS, roomFromBackground } from './lib/params';

/* The two grounds the site actually uses.  The room the glass stands in is
   derived from the page colour by roomFromBackground(), which is the same
   function the Webflow embed calls -- so what is tuned here is what ships, and
   a colour dialled in on one cannot drift from the other. */
const THEMES = {
  black: { ...roomFromBackground('#171717'), page: '#171717', ink: 'rgba(238,240,245,0.52)' },
  white: { ...roomFromBackground('#F5F5F5'), page: '#F5F5F5', ink: 'rgba(20,22,27,0.52)' },
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
    ...Object.fromEntries(Object.entries(CONTROLS).map(([name, group]) => [name, folder(group)])),
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
