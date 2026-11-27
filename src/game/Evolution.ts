/**
 * Pure evolution logic: DNA bookkeeping, evolution levels and combo weapons.
 * Kept free of rendering so it can be unit-tested in Node.
 */
import { DNA_THRESHOLDS } from './constants';
import type { ComboKind, DNACounts, DNAKind } from './types';

export interface EvolutionState {
  dna: DNACounts;
  total: number;
  level: number;
  effects: DNAKind[];
  combo: ComboKind | null;
}

export const emptyDNA = (): DNACounts => ({ fire: 0, plasma: 0, ice: 0, electric: 0 });

export function createEvolutionState(): EvolutionState {
  return { dna: emptyDNA(), total: 0, level: 1, effects: [], combo: null };
}

export function levelForTotal(total: number): number {
  const lv = DNA_THRESHOLDS.LEVELS.filter((t) => total >= t).length;
  return Math.max(1, lv);
}

export function evoProgress(state: EvolutionState): number {
  const lv = state.level;
  const lo = DNA_THRESHOLDS.LEVELS[Math.min(lv - 1, DNA_THRESHOLDS.LEVELS.length - 1)];
  const hi =
    lv < DNA_THRESHOLDS.LEVELS.length
      ? DNA_THRESHOLDS.LEVELS[lv]
      : lo + 16; // beyond max level, keep a soft bar
  return Math.min(1, Math.max(0, (state.total - lo) / (hi - lo)));
}

/** Weapon effects currently active (single-type, threshold-based). */
export function activeEffects(dna: DNACounts): DNAKind[] {
  const out: DNAKind[] = [];
  if (dna.fire >= DNA_THRESHOLDS.WEAPON_EFFECT) out.push('fire');
  if (dna.plasma >= DNA_THRESHOLDS.WEAPON_EFFECT) out.push('plasma');
  if (dna.ice >= DNA_THRESHOLDS.WEAPON_EFFECT) out.push('ice');
  if (dna.electric >= DNA_THRESHOLDS.WEAPON_EFFECT) out.push('electric');
  return out;
}

/** Combo weapon: two DNA types both at threshold. */
export function activeCombo(dna: DNACounts): ComboKind | null {
  const fe = dna.fire >= DNA_THRESHOLDS.COMBO && dna.electric >= DNA_THRESHOLDS.COMBO;
  const ip = dna.ice >= DNA_THRESHOLDS.COMBO && dna.plasma >= DNA_THRESHOLDS.COMBO;
  if (fe && ip) return Math.max(dna.fire, dna.electric) >= Math.max(dna.ice, dna.plasma) ? 'chain_nova' : 'cryo_lance';
  if (fe) return 'chain_nova';
  if (ip) return 'cryo_lance';
  return null;
}

/** Apply a DNA pickup. Returns true if the evolution level increased. */
export function addDNA(state: EvolutionState, kind: DNAKind, amount = 1): boolean {
  const prevLevel = state.level;
  state.dna[kind] = Math.min(DNA_THRESHOLDS.MAX_PER_TYPE, state.dna[kind] + amount);
  state.total += amount;
  state.level = levelForTotal(state.total);
  state.effects = activeEffects(state.dna);
  state.combo = activeCombo(state.dna);
  return state.level > prevLevel;
}

/** Damage multiplier from plasma DNA and level. */
export function damageMultiplier(state: EvolutionState): number {
  let m = 1 + (state.level - 1) * 0.18;
  if (state.dna.plasma >= DNA_THRESHOLDS.WEAPON_EFFECT) m += 0.25 + state.dna.plasma * 0.02;
  return m;
}

/** Fire-rate multiplier (shots per second scaling). */
export function fireRateMultiplier(state: EvolutionState): number {
  return 1 + (state.level - 1) * 0.1 + Math.min(0.4, state.dna.plasma * 0.03);
}

/** Number of projectiles fired per volley at the current level. */
export function volleySize(state: EvolutionState): number {
  if (state.level >= 4) return 3;
  if (state.level >= 2) return 2;
  return 1;
}
