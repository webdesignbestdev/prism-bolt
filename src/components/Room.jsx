import { forwardRef, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

import vertexShader from '../shaders/room.vert.glsl?raw';
import fragmentShader from '../shaders/room.frag.glsl?raw';

/* Two planes, same shader.

   Ground is what the page shows: one flat colour, nothing on it.  SoftBox is
   the light the glass sees -- a smooth luminance field sitting just in front,
   switched on only while the frame buffer passes run.  So the glass has
   something with a gradient in it to bend, while the page behind stays plain.

   Both are billboarded onto the camera rather than parked at a fixed z.  With
   orbit controls the camera swings around the mark, and a plane pinned in world
   space would swing into view edge-on and take the room with it. */

const tmpDir = new THREE.Vector3();

function useBillboard(ref, offset) {
  const { camera, size } = useThree();

  useFrame(() => {
    const mesh = ref.current;
    if (!mesh) return;

    // always behind the mark, whatever the orbit distance
    const dist = camera.position.length() + 4.5 + offset;
    camera.getWorldDirection(tmpDir);
    mesh.position.copy(camera.position).addScaledVector(tmpDir, dist);
    mesh.quaternion.copy(camera.quaternion);

    const h = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * dist;
    mesh.scale.set(h * (size.width / size.height) * 1.05, h * 1.05, 1);
  });
}

function useRoomUniforms(theme, bars) {
  const { size } = useThree();
  const uniforms = useMemo(
    () => ({
      uGround: { value: new THREE.Color() },
      uBoxLo:  { value: new THREE.Color() },
      uBoxHi:  { value: new THREE.Color() },
      uBars:   { value: bars },
      uTime:   { value: 0 },
      uAspect: { value: 1 },
    }),
    [bars]
  );

  useFrame(({ clock }) => {
    const u = uniforms;
    u.uTime.value = clock.elapsedTime;
    u.uAspect.value = size.width / size.height;
    u.uGround.value.set(theme.ground);
    u.uBoxLo.value.set(theme.boxLo);
    u.uBoxHi.value.set(theme.boxHi);
  });

  return uniforms;
}

export function Ground({ theme }) {
  const ref = useRef();
  const uniforms = useRoomUniforms(theme, 0);
  useBillboard(ref, 0.5);
  return (
    <mesh ref={ref}>
      <planeGeometry args={[1, 1]} />
      <shaderMaterial
        key="ground"
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
        toneMapped={false}
        depthWrite={false}
      />
    </mesh>
  );
}

export const SoftBox = forwardRef(function SoftBox({ theme }, ref) {
  const uniforms = useRoomUniforms(theme, 1);
  useBillboard(ref, 0);
  return (
    <mesh ref={ref} visible={false}>
      <planeGeometry args={[1, 1]} />
      <shaderMaterial
        key="softbox"
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
        toneMapped={false}
        depthWrite={false}
      />
    </mesh>
  );
});
