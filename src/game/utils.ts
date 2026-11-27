/** Math / misc helpers. */

export const clamp = (v: number, lo: number, hi: number): number =>
  v < lo ? lo : v > hi ? hi : v;

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

export const damp = (a: number, b: number, lambda: number, dt: number): number =>
  lerp(a, b, 1 - Math.exp(-lambda * dt));

export const randRange = (lo: number, hi: number): number => lo + Math.random() * (hi - lo);

export const randInt = (lo: number, hi: number): number => Math.floor(randRange(lo, hi + 1));

export const pick = <T>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)];

export const TAU = Math.PI * 2;

/** Angle helpers (XZ plane: angle 0 = +X, positive = toward -Z). */
export const angleTo = (fromX: number, fromZ: number, toX: number, toZ: number): number =>
  Math.atan2(-(toZ - fromZ), toX - fromX);

export const dist2D = (ax: number, az: number, bx: number, bz: number): number => {
  const dx = ax - bx;
  const dz = az - bz;
  return Math.sqrt(dx * dx + dz * dz);
};

export const dist2DSq = (ax: number, az: number, bx: number, bz: number): number => {
  const dx = ax - bx;
  const dz = az - bz;
  return dx * dx + dz * dz;
};

/** Deterministic-ish value noise for shaders is done in GLSL; this is for geometry jitter. */
export const hash3 = (x: number, y: number, z: number): number => {
  let h = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return h - Math.floor(h);
};

export const smoothstep = (edge0: number, edge1: number, x: number): number => {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
};
