import { Bloom, EffectComposer, SMAA, Vignette } from '@react-three/postprocessing';
import { useGame } from '../store/game';

/** SMAA + subtle bloom (emissives only: threshold above 1) + light vignette. Dropped entirely when FPS falls. */
export function Effects() {
  const quality = useGame((s) => s.ui.quality);
  if (quality === 'low') return null;
  return (
    <EffectComposer multisampling={0} enableNormalPass={false}>
      <SMAA />
      <Bloom mipmapBlur luminanceThreshold={1.0} luminanceSmoothing={0.1} intensity={0.55} radius={0.6} />
      <Vignette offset={0.32} darkness={0.55} />
    </EffectComposer>
  );
}
