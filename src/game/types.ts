/** Shared game types. */

export type DNAKind = 'fire' | 'plasma' | 'ice' | 'electric';

export type ComboKind = 'chain_nova' | 'cryo_lance';

export type EnemyKind = 'chicken' | 'duck' | 'rocket' | 'egg' | 'miniboss' | 'boss';

export type GamePhase =
  | 'menu'
  | 'playing'
  | 'paused'
  | 'gameover'
  | 'victory'
  | 'transition'
  | 'settings'
  | 'help';

export interface DNACounts {
  fire: number;
  plasma: number;
  ice: number;
  electric: number;
}

export interface HUDState {
  hp: number;
  maxHp: number;
  score: number;
  stage: number;
  stageName: string;
  evoLevel: number;
  evoProgress: number; // 0..1 toward next level
  dna: DNACounts;
  megaEnergy: number; // 0..100
  activeEffects: DNAKind[];
  activeCombo: ComboKind | null;
  bossActive: boolean;
  bossHp: number;
  bossMaxHp: number;
  bossPhase: number;
  bossName: string;
  bestScore: number;
  stageTime: number;
  comboTimer: number;
  fps: number;
}

export interface Settings {
  masterVolume: number;
  musicVolume: number;
  sfxVolume: number;
  muted: boolean;
  screenShake: boolean;
  particles: 'high' | 'low';
  showFps: boolean;
}
