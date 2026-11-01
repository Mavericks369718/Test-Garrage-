import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { ContactShadows, Environment, Lightformer } from '@react-three/drei';
import * as THREE from 'three';
import { RectAreaLightUniformsLib } from 'three/examples/jsm/lights/RectAreaLightUniformsLib.js';
import { LED_POSITIONS } from './Shell';
import { STATION_POS, anim } from './anim';
import { useGame } from '../store/game';
import { isMobile } from './Zones';

RectAreaLightUniformsLib.init();

/** Late-evening workshop: low ambient env (0.35), cool rect-area LEDs, warm task light, ONE shadow-casting spot. */
export function Lighting() {
  const station = useGame((s) => s.car.station);
  const shadowVersion = useGame((s) => s.shadowVersion);
  const gl = useThree((s) => s.gl);
  const spot = useRef<THREE.SpotLight>(null);
  const mobile = isMobile();
  const lastLift = useRef(0);

  useEffect(() => {
    gl.shadowMap.autoUpdate = false;
    gl.shadowMap.needsUpdate = true;
  }, [gl]);

  // Shadows only re-render when something structural changes (part attached, lift moving, station change).
  useEffect(() => {
    gl.shadowMap.needsUpdate = true;
  }, [gl, shadowVersion, station]);

  useFrame(() => {
    if (Math.abs(anim.liftH - lastLift.current) > 1e-4 || anim.wheelOmega !== 0) gl.shadowMap.needsUpdate = true;
    lastLift.current = anim.liftH;
  });

  const p = STATION_POS[station];
  useEffect(() => {
    if (!spot.current) return;
    spot.current.position.set(p[0] + 1.2, 5.4, p[2] + 2.2);
    spot.current.target.position.set(p[0], 0.5, p[2]);
    spot.current.target.updateMatrixWorld();
    gl.shadowMap.needsUpdate = true;
  }, [p, gl]);

  return (
    <>
      <Environment resolution={128} environmentIntensity={0.35} background={false}>
        <Lightformer form="rect" intensity={2.2} color="#dfe8ff" position={[0, 5, 0]} rotation-x={Math.PI / 2} scale={[16, 6, 1]} />
        <Lightformer form="rect" intensity={1.2} color="#ffb070" position={[2, 2, 9]} scale={[5, 4, 1]} />
        <Lightformer form="rect" intensity={0.5} color="#9fb0c8" position={[-12, 2.5, 0]} rotation-y={Math.PI / 2} scale={[14, 3, 1]} />
        <Lightformer form="ring" intensity={1.5} color="#ffffff" position={[10, 4, -6]} scale={2} />
      </Environment>
      <hemisphereLight args={['#4a5566', '#0d0e10', 0.25]} />
      {LED_POSITIONS.map(([x, y, z]) => (
        <rectAreaLight key={`${x}${z}`} position={[x, y - 0.05, z]} rotation={[-Math.PI / 2, 0, 0]} width={1.6} height={1.6} intensity={mobile ? 2.2 : 3} color="#eef3ff" />
      ))}
      <pointLight position={[-11.2, 1.85, -7.0]} intensity={6} distance={7} decay={1.8} color="#ffbf80" />
      {!mobile && (
        <spotLight
          ref={spot}
          castShadow
          intensity={60}
          angle={0.62}
          penumbra={0.7}
          distance={14}
          decay={1.6}
          color="#fff4e6"
          shadow-mapSize={[2048, 2048]}
          shadow-bias={-0.0004}
          shadow-normalBias={0.02}
        />
      )}
      <ContactShadows position={[p[0], 0.005, p[2]]} scale={[3.4, 6.2]} resolution={512} blur={2.2} opacity={0.75} far={1.6} frames={1} key={`${station}-${shadowVersion}`} />
    </>
  );
}
