/** Global gameplay tuning constants. World units ≈ 1 unit = 22px at 1080p. */

export const WORLD = {
  /** Ortho camera view height baseline (world units). */
  VIEW_HEIGHT: 50,
  VIEW_HEIGHT_MIN: 36,
  VIEW_WIDTH_MIN: 30,
  VIEW_WIDTH_MAX: 74,
  /** Playfield padding from camera edges. */
  PAD_X: 2.5,
  PAD_TOP: 2.0,
  PAD_BOTTOM: 1.5,
  /** Enemies spawn slightly above the top edge. */
  SPAWN_Z: -28,
} as const;

export const PLAYER = {
  SPEED: 26,
  ACCEL: 180,
  DRAG: 12,
  HIT_RADIUS: 1.05,
  MAX_HP: 3,
  INVULN_TIME: 1.6,
  FIRE_INTERVAL: 0.19,
  BULLET_SPEED: 62,
  BULLET_DAMAGE: 1.2,
  MEGA_MAX: 100,
  MEGA_REGEN: 3.2, // per second
  MEGA_KILL_GAIN: 3.5,
  BURST_RADIUS: 13,
  BURST_DAMAGE: 8,
} as const;

export const DNA_THRESHOLDS = {
  /** Evolution level boundaries by total DNA collected. */
  LEVELS: [0, 8, 20, 36], // level 1..4 (index+1)
  /** DNA count needed for a single-type weapon effect. */
  WEAPON_EFFECT: 3,
  /** DNA count (of each type) needed to unlock a combo weapon. */
  COMBO: 7,
  MAX_PER_TYPE: 99,
} as const;

export const SCORE = {
  KILL_CHICKEN: 100,
  KILL_DUCK: 260,
  KILL_ROCKET: 180,
  KILL_EGG: 140,
  KILL_MINIBOSS: 1500,
  KILL_BOSS: 8000,
  DNA_PICKUP: 25,
  SURVIVAL_TICK: 5,
  STAGE_CLEAR: 1000,
  COMBO_MULT: 1.5,
} as const;

export const STAGE_DURATION_TARGET = 130; // seconds of scripted timeline per stage (before boss)
