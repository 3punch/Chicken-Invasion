import { describe, expect, it } from 'vitest';
import {
  activeCombo,
  activeEffects,
  addDNA,
  createEvolutionState,
  damageMultiplier,
  evoProgress,
  fireRateMultiplier,
  levelForTotal,
  volleySize,
} from '../src/game/Evolution';
import { clamp, damp, dist2D, dist2DSq, lerp, smoothstep } from '../src/game/utils';
import { DNA_THRESHOLDS } from '../src/game/constants';

describe('Evolution', () => {
  it('starts at level 1 with no DNA', () => {
    const st = createEvolutionState();
    expect(st.level).toBe(1);
    expect(st.total).toBe(0);
    expect(st.effects).toEqual([]);
    expect(st.combo).toBeNull();
  });

  it('maps totals to evolution levels at thresholds', () => {
    expect(levelForTotal(0)).toBe(1);
    expect(levelForTotal(DNA_THRESHOLDS.LEVELS[1] - 1)).toBe(1);
    expect(levelForTotal(DNA_THRESHOLDS.LEVELS[1])).toBe(2);
    expect(levelForTotal(DNA_THRESHOLDS.LEVELS[2])).toBe(3);
    expect(levelForTotal(DNA_THRESHOLDS.LEVELS[3])).toBe(4);
    expect(levelForTotal(1000)).toBe(4);
  });

  it('reports level-up events exactly once per threshold crossing', () => {
    const st = createEvolutionState();
    const ups: boolean[] = [];
    for (let i = 0; i < DNA_THRESHOLDS.LEVELS[1]; i++) ups.push(addDNA(st, 'fire'));
    expect(ups.filter(Boolean).length).toBe(1);
    expect(st.level).toBe(2);
  });

  it('unlocks single-type weapon effects at the threshold', () => {
    const st = createEvolutionState();
    addDNA(st, 'ice', DNA_THRESHOLDS.WEAPON_EFFECT - 1);
    expect(activeEffects(st.dna)).toEqual([]);
    addDNA(st, 'ice', 1);
    expect(activeEffects(st.dna)).toContain('ice');
  });

  it('unlocks Chain Nova with fire + electric and Cryo Lance with ice + plasma', () => {
    const fe = createEvolutionState();
    addDNA(fe, 'fire', DNA_THRESHOLDS.COMBO);
    addDNA(fe, 'electric', DNA_THRESHOLDS.COMBO);
    expect(activeCombo(fe.dna)).toBe('chain_nova');

    const ip = createEvolutionState();
    addDNA(ip, 'ice', DNA_THRESHOLDS.COMBO);
    addDNA(ip, 'plasma', DNA_THRESHOLDS.COMBO);
    expect(activeCombo(ip.dna)).toBe('cryo_lance');

    const none = createEvolutionState();
    addDNA(none, 'fire', DNA_THRESHOLDS.COMBO);
    expect(activeCombo(none.dna)).toBeNull();
  });

  it('caps per-type DNA but keeps counting totals for levels', () => {
    const st = createEvolutionState();
    addDNA(st, 'fire', DNA_THRESHOLDS.MAX_PER_TYPE + 20);
    expect(st.dna.fire).toBe(DNA_THRESHOLDS.MAX_PER_TYPE);
    expect(st.total).toBe(DNA_THRESHOLDS.MAX_PER_TYPE + 20);
  });

  it('scales damage, fire rate and volley with level/DNA', () => {
    const st = createEvolutionState();
    const baseDmg = damageMultiplier(st);
    const baseRate = fireRateMultiplier(st);
    expect(volleySize(st)).toBe(1);
    addDNA(st, 'plasma', 40);
    expect(damageMultiplier(st)).toBeGreaterThan(baseDmg);
    expect(fireRateMultiplier(st)).toBeGreaterThan(baseRate);
    expect(volleySize(st)).toBe(3);
  });

  it('reports progress within [0,1]', () => {
    const st = createEvolutionState();
    expect(evoProgress(st)).toBeGreaterThanOrEqual(0);
    expect(evoProgress(st)).toBeLessThanOrEqual(1);
    addDNA(st, 'fire', 500);
    expect(evoProgress(st)).toBeGreaterThanOrEqual(0);
    expect(evoProgress(st)).toBeLessThanOrEqual(1);
  });
});

describe('utils', () => {
  it('clamp/lerp/damp behave', () => {
    expect(clamp(5, 0, 3)).toBe(3);
    expect(clamp(-5, 0, 3)).toBe(0);
    expect(lerp(0, 10, 0.5)).toBe(5);
    const d = damp(0, 10, 5, 0.1);
    expect(d).toBeGreaterThan(0);
    expect(d).toBeLessThan(10);
  });

  it('distance helpers agree', () => {
    expect(dist2D(0, 0, 3, 4)).toBe(5);
    expect(dist2DSq(0, 0, 3, 4)).toBe(25);
    expect(dist2D(-2, 1, -2, 1)).toBe(0);
  });

  it('smoothstep is clamped and monotonic', () => {
    expect(smoothstep(0, 1, -1)).toBe(0);
    expect(smoothstep(0, 1, 2)).toBe(1);
    expect(smoothstep(0, 1, 0.5)).toBeCloseTo(0.5, 5);
  });
});
