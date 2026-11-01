import { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react';
import * as THREE from 'three';
import { flakeNormalMap, makePaintMaterial } from '../scene/materials';
import { useGame } from '../store/game';

const PaintCtx = createContext<THREE.MeshPhysicalMaterial | null>(null);

/** One paint material per car, shared by every painted panel. Spray coverage lerps old → new colour. */
export function PaintProvider({ children }: { children: ReactNode }) {
  const mat = useMemo(() => makePaintMaterial(), []);
  const paint = useGame((s) => s.car.paint);
  const spray = useGame((s) => s.spray);
  useEffect(() => {
    const target = new THREE.Color(paint.color);
    const from = new THREE.Color(spray.from);
    mat.color.copy(from.lerp(target, spray.coverage));
    mat.metalness = paint.metallic;
    mat.roughness = paint.roughness;
    mat.clearcoat = paint.clearcoat;
    mat.clearcoatRoughness = paint.clearcoatRoughness;
    const wantFlake = paint.flake && paint.metallic > 0.3;
    if (wantFlake !== !!mat.normalMap) {
      mat.normalMap = wantFlake ? flakeNormalMap() : null;
      mat.normalScale.set(0.15, 0.15);
      mat.needsUpdate = true;
    }
  }, [mat, paint, spray]);
  return <PaintCtx.Provider value={mat}>{children}</PaintCtx.Provider>;
}

export function usePaintMaterial(): THREE.MeshPhysicalMaterial {
  const m = useContext(PaintCtx);
  if (!m) throw new Error('usePaintMaterial outside PaintProvider');
  return m;
}
