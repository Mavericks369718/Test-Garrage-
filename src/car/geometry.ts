import * as THREE from 'three';

const cache = new Map<string, THREE.BufferGeometry>();
export function cached<T extends THREE.BufferGeometry>(key: string, make: () => T): T {
  let g = cache.get(key) as T | undefined;
  if (!g) {
    g = make();
    cache.set(key, g);
  }
  return g;
}

/** A box bent into a crowned panel (hood, roof, trunk). Crown is the rise at the centreline. */
export function crownedPanel(w: number, l: number, t: number, crown: number, sweep = 0) {
  return cached(`crown:${w}:${l}:${t}:${crown}:${sweep}`, () => {
    const g = new THREE.BoxGeometry(w, t, l, 16, 1, 16);
    const p = g.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i) / (w / 2);
      const z = p.getZ(i) / (l / 2);
      p.setY(i, p.getY(i) + crown * (1 - x * x) * (1 - 0.35 * z * z) + sweep * z);
    }
    g.computeVertexNormals();
    return g;
  });
}

/**
 * Side-profile extrusion: `pts` are (z, y) pairs in car space relative to the socket; extruded along X by `depth`,
 * centred on x = 0. Bevelled for soft edges. Optional circular arch cut-outs along the bottom edge.
 */
export function sideExtrude(key: string, build: (s: THREE.Shape) => void, depth: number, bevel = 0.018) {
  return cached(`side:${key}:${depth}:${bevel}`, () => {
    const s = new THREE.Shape();
    build(s);
    const g = new THREE.ExtrudeGeometry(s, {
      depth: Math.max(0.001, depth - bevel * 2), bevelEnabled: bevel > 0, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 3, curveSegments: 24,
    });
    // shape (u, v) → car (z, y); extrusion → car x
    g.rotateY(-Math.PI / 2);
    g.translate((depth - bevel * 2) / 2, 0, 0);
    g.computeVertexNormals();
    return g;
  });
}

/** Front-view extrusion: shape (x, y), extruded along Z. */
export function frontExtrude(key: string, build: (s: THREE.Shape) => void, depth: number, bevel = 0.015) {
  return cached(`front:${key}:${depth}:${bevel}`, () => {
    const s = new THREE.Shape();
    build(s);
    const g = new THREE.ExtrudeGeometry(s, { depth: Math.max(0.001, depth - bevel * 2), bevelEnabled: bevel > 0, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 3, curveSegments: 16 });
    g.translate(0, 0, -(depth - bevel * 2) / 2);
    g.computeVertexNormals();
    return g;
  });
}

export function roundedRectShape(s: THREE.Shape, x0: number, y0: number, x1: number, y1: number, r: number) {
  s.moveTo(x0 + r, y0);
  s.lineTo(x1 - r, y0);
  s.quadraticCurveTo(x1, y0, x1, y0 + r);
  s.lineTo(x1, y1 - r);
  s.quadraticCurveTo(x1, y1, x1 - r, y1);
  s.lineTo(x0 + r, y1);
  s.quadraticCurveTo(x0, y1, x0, y1 - r);
  s.lineTo(x0, y0 + r);
  s.quadraticCurveTo(x0, y0, x0 + r, y0);
}

/** Tyre cross-section revolved around X. */
export function tyreGeometry(outer: number, inner: number, width: number, profile: 'street' | 'sport' | 'slick' | 'gravel') {
  return cached(`tyre:${outer}:${inner}:${width}:${profile}`, () => {
    const pts: THREE.Vector2[] = [];
    const hw = width / 2;
    const shoulder = profile === 'slick' ? 0.02 : profile === 'gravel' ? 0.045 : 0.03;
    const N = 10;
    pts.push(new THREE.Vector2(inner, -hw * 0.92));
    pts.push(new THREE.Vector2(inner + (outer - inner) * 0.55, -hw));
    for (let i = 0; i <= N; i++) {
      const a = (i / N) * Math.PI;
      const zz = -Math.cos(a) * hw;
      const bulge = Math.sin(a) * shoulder;
      pts.push(new THREE.Vector2(outer - shoulder + bulge, zz * (1 - 0.06 * Math.sin(a))));
    }
    pts.push(new THREE.Vector2(inner + (outer - inner) * 0.55, hw));
    pts.push(new THREE.Vector2(inner, hw * 0.92));
    // Lathe revolves around Y with x as radius; we want axle along X.
    const g = new THREE.LatheGeometry(pts.map((p) => new THREE.Vector2(p.x, p.y)), 48);
    g.rotateZ(Math.PI / 2);
    return g;
  });
}

/** Coil spring along Y. */
export function springGeometry(radius: number, height: number, turns: number, wire: number) {
  return cached(`spring:${radius}:${height}:${turns}:${wire}`, () => {
    const pts: THREE.Vector3[] = [];
    const n = turns * 24;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const a = t * turns * Math.PI * 2;
      pts.push(new THREE.Vector3(Math.cos(a) * radius, t * height - height / 2, Math.sin(a) * radius));
    }
    return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), n, wire, 6, false);
  });
}

/** Tube along a polyline (exhaust pipes). */
export function pipeGeometry(key: string, points: [number, number, number][], radius: number) {
  return cached(`pipe:${key}:${radius}`, () => {
    const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)), false, 'catmullrom', 0.1);
    return new THREE.TubeGeometry(curve, points.length * 16, radius, 10, false);
  });
}

/** Orient a unit-height cylinder between two points (for pillars, struts, beams). */
export function beamTransform(a: THREE.Vector3Tuple, b: THREE.Vector3Tuple) {
  const va = new THREE.Vector3(...a), vb = new THREE.Vector3(...b);
  const mid = va.clone().add(vb).multiplyScalar(0.5);
  const dir = vb.clone().sub(va);
  const len = dir.length();
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  return { position: mid.toArray() as THREE.Vector3Tuple, quaternion: q, length: len };
}
