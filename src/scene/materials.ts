import * as THREE from 'three';

/** Shared material library — one instance per look, reused everywhere (material sharing budget). */
const std = (color: string, roughness: number, metalness = 0, extra: THREE.MeshStandardMaterialParameters = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra });

export const MAT = {
  floor: std('#1A1C1F', 0.55, 0.0),
  wall: std('#2A2D31', 0.85),
  wallDark: std('#202326', 0.9),
  steelDark: std('#2b2f34', 0.45, 0.8),
  steel: std('#7d848c', 0.35, 0.9),
  aluminium: std('#b9bec4', 0.3, 0.95),
  chrome: std('#e8ebee', 0.08, 1),
  gunmetal: std('#3b3f45', 0.3, 0.9),
  rubber: std('#141516', 0.85, 0),
  tread: std('#0f1011', 0.95, 0),
  plastic: std('#18191b', 0.6, 0),
  plasticGrey: std('#3c4046', 0.55, 0),
  leather: std('#1c1b1a', 0.7, 0),
  suede: std('#262422', 0.95, 0),
  carbon: std('#151617', 0.25, 0.4),
  engineBlock: std('#5c6168', 0.5, 0.7),
  engineCover: std('#a3271c', 0.35, 0.3),
  hvOrange: std('#ff6a13', 0.45, 0),
  battery: std('#22262b', 0.5, 0.5),
  copper: std('#b06a3b', 0.35, 0.9),
  safety: std('#F2C230', 0.5, 0.1),
  red: std('#c0281b', 0.45, 0.2),
  blue: std('#1f5fa8', 0.45, 0.2),
  white: std('#d8d9d6', 0.5, 0),
  wood: std('#7a5a3a', 0.8, 0),
  glass: new THREE.MeshPhysicalMaterial({
    color: '#0b0e12', roughness: 0.04, metalness: 0, transmission: 0, transparent: true, opacity: 0.45,
    clearcoat: 1, clearcoatRoughness: 0.02, envMapIntensity: 1.6, depthWrite: false,
  }),
  lensClear: new THREE.MeshPhysicalMaterial({ color: '#dfe7ef', roughness: 0.05, transparent: true, opacity: 0.35, clearcoat: 1, depthWrite: false }),
  headlight: std('#ffffff', 0.2, 0, { emissive: new THREE.Color('#e8f1ff'), emissiveIntensity: 2.2 }),
  taillight: std('#5a0b07', 0.25, 0, { emissive: new THREE.Color('#ff1a0a'), emissiveIntensity: 1.6 }),
  screen: std('#05070a', 0.3, 0, { emissive: new THREE.Color('#2a5aa8'), emissiveIntensity: 0.6 }),
  ledPanel: std('#ffffff', 0.4, 0, { emissive: new THREE.Color('#f4f7ff'), emissiveIntensity: 3.0 }),
  warmLamp: std('#ffffff', 0.4, 0, { emissive: new THREE.Color('#ffc58a'), emissiveIntensity: 4 }),
  boothLight: std('#ffffff', 0.4, 0, { emissive: new THREE.Color('#ffffff'), emissiveIntensity: 2.4 }),
  accent: std('#FF5A1F', 0.4, 0, { emissive: new THREE.Color('#FF5A1F'), emissiveIntensity: 1.5 }),
  ghostOk: new THREE.MeshBasicMaterial({ color: '#4ade80', transparent: true, opacity: 0.32, depthWrite: false }),
  ghostBad: new THREE.MeshBasicMaterial({ color: '#ff3b30', transparent: true, opacity: 0.32, depthWrite: false }),
  hover: new THREE.MeshBasicMaterial({ color: '#FF5A1F', transparent: true, opacity: 0.18, depthWrite: false }),
};

const caliperCache = new Map<string, THREE.MeshStandardMaterial>();
export function caliperMat(color = '#2b2f34') {
  let m = caliperCache.get(color);
  if (!m) caliperCache.set(color, (m = std(color, 0.35, 0.4)));
  return m;
}

/** Procedural metallic-flake normal map (tiny, generated once). */
let flakeTex: THREE.DataTexture | null = null;
export function flakeNormalMap() {
  if (flakeTex) return flakeTex;
  const size = 128;
  const data = new Uint8Array(size * size * 4);
  let s = 7;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < size * size; i++) {
    const nx = (rnd() - 0.5) * 0.6, ny = (rnd() - 0.5) * 0.6;
    data[i * 4] = (nx * 0.5 + 0.5) * 255;
    data[i * 4 + 1] = (ny * 0.5 + 0.5) * 255;
    data[i * 4 + 2] = 255;
    data[i * 4 + 3] = 255;
  }
  flakeTex = new THREE.DataTexture(data, size, size);
  flakeTex.wrapS = flakeTex.wrapT = THREE.RepeatWrapping;
  flakeTex.repeat.set(24, 24);
  flakeTex.needsUpdate = true;
  return flakeTex;
}

export function makePaintMaterial() {
  return new THREE.MeshPhysicalMaterial({
    color: '#8a1c1c', metalness: 0.75, roughness: 0.35, clearcoat: 1, clearcoatRoughness: 0.08, envMapIntensity: 1.2,
  });
}

/** Dedupe identical materials across loaded GLB props (keyed by look). */
const dedupe = new Map<string, THREE.Material>();
export function dedupeMaterial(m: THREE.Material): THREE.Material {
  const sm = m as THREE.MeshStandardMaterial;
  const key = [m.type, sm.color?.getHexString(), sm.roughness?.toFixed(2), sm.metalness?.toFixed(2), sm.map?.source?.uuid ?? '', sm.normalMap?.source?.uuid ?? '', m.transparent].join('|');
  const hit = dedupe.get(key);
  if (hit) return hit;
  dedupe.set(key, m);
  return m;
}
