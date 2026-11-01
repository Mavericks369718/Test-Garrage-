/** Per-frame mutable animation state shared between scene components (kept out of React state on purpose). */
export const anim = {
  /** wheel angular velocity (rad/s) — driven by the dyno */
  wheelOmega: 0,
  wheelAngle: 0,
  /** scissor lift height (m) */
  liftH: 0,
  /** engine hoist arm (0 = down, 1 = up) */
  hoist: 0,
  /** camera is inside the paint booth */
  inBooth: false,
};

export const STATION_POS: Record<string, [number, number, number]> = {
  lift: [-9, 0.14, -4],
  build: [-3, 0.42, -4],
  booth: [8.5, 0, -5],
  dyno: [2.5, 0, -4.5],
};

export const LIFT_MAX = 1.6;
export const LIFT_SPEED = LIFT_MAX / 2.5; // 2.5 s full travel, linear

export const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
export const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const easeOutQuad = (t: number) => 1 - (1 - t) * (1 - t);
export const easeInOutQuad = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

/** Critically-under-damped spring step (stiffness 400, damping 30 → small overshoot, settles ≈ 220 ms). */
export function springStep(x: number, v: number, target: number, dt: number, k = 400, c = 30) {
  const a = -k * (x - target) - c * v;
  v += a * dt;
  x += v * dt;
  return [x, v] as const;
}
