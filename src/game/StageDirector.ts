/**
 * StageDirector — scripted wave timelines for the three stages plus the
 * mini-boss and final boss encounters. Emits spawn requests over time.
 */
import type { EnemyKind } from './types';

export type WaveAction =
  | { t: number; type: 'formation'; enemy: EnemyKind; count: number; pattern: 'vee' | 'line' | 'column' | 'flanks'; x?: number }
  | { t: number; type: 'solo'; enemy: EnemyKind; x: number; z?: number }
  | { t: number; type: 'eggRain'; count: number }
  | { t: number; type: 'miniboss' }
  | { t: number; type: 'boss' }
  | { t: number; type: 'message'; text: string };

export interface StageDef {
  name: string;
  subtitle: string;
  duration: number; // scripted timeline length in seconds
  actions: WaveAction[];
}

export const STAGES: StageDef[] = [
  {
    name: 'Earth Orbit',
    subtitle: 'They came from beyond the sky',
    duration: 118,
    actions: [
      { t: 2, type: 'message', text: 'Hostiles inbound — clear the orbit!' },
      { t: 3, type: 'formation', enemy: 'chicken', count: 5, pattern: 'vee' },
      { t: 11, type: 'formation', enemy: 'chicken', count: 6, pattern: 'line' },
      { t: 20, type: 'formation', enemy: 'chicken', count: 4, pattern: 'flanks' },
      { t: 27, type: 'message', text: 'DNA fragments detected — absorb them!' },
      { t: 29, type: 'formation', enemy: 'chicken', count: 7, pattern: 'vee' },
      { t: 38, type: 'solo', enemy: 'chicken', x: -12 },
      { t: 39, type: 'solo', enemy: 'chicken', x: 12 },
      { t: 42, type: 'formation', enemy: 'chicken', count: 6, pattern: 'column' },
      { t: 52, type: 'formation', enemy: 'chicken', count: 8, pattern: 'line' },
      { t: 61, type: 'formation', enemy: 'chicken', count: 5, pattern: 'flanks' },
      { t: 68, type: 'formation', enemy: 'chicken', count: 8, pattern: 'vee' },
      { t: 78, type: 'formation', enemy: 'chicken', count: 6, pattern: 'column' },
      { t: 86, type: 'solo', enemy: 'egg', x: -8, z: -6 },
      { t: 88, type: 'message', text: 'Alien egg! Destroy it before it hatches!' },
      { t: 92, type: 'formation', enemy: 'chicken', count: 7, pattern: 'line' },
      { t: 102, type: 'formation', enemy: 'chicken', count: 6, pattern: 'flanks' },
      { t: 112, type: 'message', text: 'WARNING — heavy signature approaching' },
      { t: 116, type: 'miniboss' },
    ],
  },
  {
    name: 'The Nebula',
    subtitle: 'Something is hatching in the clouds',
    duration: 138,
    actions: [
      { t: 2, type: 'message', text: 'The nebula is alive with wings' },
      { t: 3, type: 'formation', enemy: 'chicken', count: 6, pattern: 'vee' },
      { t: 12, type: 'formation', enemy: 'duck', count: 2, pattern: 'flanks' },
      { t: 20, type: 'message', text: 'Armored ducks! Break their armor!' },
      { t: 22, type: 'formation', enemy: 'chicken', count: 7, pattern: 'line' },
      { t: 32, type: 'formation', enemy: 'rocket', count: 3, pattern: 'line' },
      { t: 40, type: 'formation', enemy: 'duck', count: 2, pattern: 'line' },
      { t: 46, type: 'formation', enemy: 'chicken', count: 8, pattern: 'vee' },
      { t: 55, type: 'eggRain', count: 2 },
      { t: 56, type: 'message', text: 'Eggs incoming — do NOT let them hatch!' },
      { t: 64, type: 'formation', enemy: 'rocket', count: 4, pattern: 'flanks' },
      { t: 72, type: 'formation', enemy: 'duck', count: 3, pattern: 'column' },
      { t: 82, type: 'formation', enemy: 'chicken', count: 9, pattern: 'line' },
      { t: 92, type: 'eggRain', count: 3 },
      { t: 96, type: 'formation', enemy: 'rocket', count: 4, pattern: 'line' },
      { t: 106, type: 'formation', enemy: 'duck', count: 3, pattern: 'flanks' },
      { t: 112, type: 'formation', enemy: 'chicken', count: 10, pattern: 'vee' },
      { t: 124, type: 'eggRain', count: 2 },
      { t: 128, type: 'formation', enemy: 'rocket', count: 5, pattern: 'flanks' },
      { t: 134, type: 'message', text: 'The armada is massing beyond the clouds…' },
    ],
  },
  {
    name: 'The Chicken Armada',
    subtitle: 'Break the fleet. Face the Overlord.',
    duration: 108,
    actions: [
      { t: 2, type: 'message', text: 'All hands — this is the big one' },
      { t: 3, type: 'formation', enemy: 'chicken', count: 8, pattern: 'vee' },
      { t: 11, type: 'formation', enemy: 'duck', count: 3, pattern: 'line' },
      { t: 20, type: 'formation', enemy: 'rocket', count: 5, pattern: 'flanks' },
      { t: 28, type: 'formation', enemy: 'chicken', count: 10, pattern: 'line' },
      { t: 36, type: 'eggRain', count: 3 },
      { t: 42, type: 'formation', enemy: 'duck', count: 3, pattern: 'flanks' },
      { t: 50, type: 'formation', enemy: 'rocket', count: 5, pattern: 'column' },
      { t: 58, type: 'formation', enemy: 'chicken', count: 10, pattern: 'vee' },
      { t: 66, type: 'formation', enemy: 'duck', count: 4, pattern: 'line' },
      { t: 76, type: 'eggRain', count: 3 },
      { t: 82, type: 'formation', enemy: 'rocket', count: 6, pattern: 'flanks' },
      { t: 90, type: 'formation', enemy: 'chicken', count: 10, pattern: 'column' },
      { t: 98, type: 'message', text: 'THE CHICKEN OVERLORD APPROACHES' },
      { t: 104, type: 'boss' },
    ],
  },
];

export class StageDirector {
  private actionIndex = 0;
  private time = 0;
  stageIndex = 0;

  start(stageIndex: number): void {
    this.stageIndex = stageIndex;
    this.actionIndex = 0;
    this.time = 0;
  }

  get current(): StageDef {
    return STAGES[Math.min(this.stageIndex, STAGES.length - 1)];
  }

  get elapsed(): number {
    return this.time;
  }

  /** Advance time and emit due actions. */
  update(dt: number, emit: (action: WaveAction) => void): void {
    this.time += dt;
    const actions = this.current.actions;
    while (this.actionIndex < actions.length && actions[this.actionIndex].t <= this.time) {
      emit(actions[this.actionIndex]);
      this.actionIndex++;
    }
  }

  get timelineDone(): boolean {
    return this.actionIndex >= this.current.actions.length;
  }
}
