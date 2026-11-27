import { describe, expect, it } from 'vitest';
import { STAGES, StageDirector, type WaveAction } from '../src/game/StageDirector';

describe('StageDirector', () => {
  it('defines three stages with sensible timeline lengths', () => {
    expect(STAGES.length).toBe(3);
    for (const s of STAGES) {
      expect(s.duration).toBeGreaterThan(90);
      expect(s.actions.length).toBeGreaterThan(10);
    }
  });

  it('emits actions in chronological order exactly once', () => {
    const d = new StageDirector();
    d.start(0);
    const seen: WaveAction[] = [];
    // simulate 4 minutes at 60fps
    for (let i = 0; i < 60 * 240; i++) d.update(1 / 60, (a) => seen.push(a));
    expect(seen.length).toBe(STAGES[0].actions.length);
    const times = STAGES[0].actions.map((a) => a.t);
    for (let i = 1; i < times.length; i++) expect(times[i]).toBeGreaterThanOrEqual(times[i - 1]);
    expect(d.timelineDone).toBe(true);
  });

  it('ends stage 1 with a mini-boss and stage 3 with the boss', () => {
    const last1 = STAGES[0].actions[STAGES[0].actions.length - 1];
    expect(last1.type).toBe('miniboss');
    const hasBoss = STAGES[2].actions.some((a) => a.type === 'boss');
    expect(hasBoss).toBe(true);
  });

  it('stage 2 introduces eggs (hatching mechanic)', () => {
    const hasEggs = STAGES[1].actions.some((a) => a.type === 'eggRain');
    expect(hasEggs).toBe(true);
  });

  it('tracks elapsed time', () => {
    const d = new StageDirector();
    d.start(1);
    d.update(5, () => undefined);
    expect(d.elapsed).toBeCloseTo(5, 6);
    expect(d.current.name).toBe('The Nebula');
  });
});
