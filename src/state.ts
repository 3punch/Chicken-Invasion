/**
 * UI state store (zustand) + localStorage persistence for scores and settings.
 */
import { create } from 'zustand';
import type { GamePhase, HUDState, Settings } from './game/types';

const SETTINGS_KEY = 'ci_settings_v1';
const SCORE_KEY = 'ci_best_v1';

export const defaultSettings: Settings = {
  masterVolume: 0.8,
  musicVolume: 0.55,
  sfxVolume: 0.8,
  muted: false,
  screenShake: true,
  particles: 'high',
  showFps: false,
};

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) return { ...defaultSettings, ...(JSON.parse(raw) as Partial<Settings>) };
  } catch {
    /* ignore */
  }
  return { ...defaultSettings };
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

export function loadBestScore(): number {
  try {
    return Number(localStorage.getItem(SCORE_KEY) ?? '0') || 0;
  } catch {
    return 0;
  }
}

export function saveBestScore(score: number): void {
  try {
    localStorage.setItem(SCORE_KEY, String(score));
  } catch {
    /* ignore */
  }
}

export const emptyHUD = (bestScore = 0): HUDState => ({
  hp: 3,
  maxHp: 3,
  score: 0,
  stage: 1,
  stageName: 'Earth Orbit',
  evoLevel: 1,
  evoProgress: 0,
  dna: { fire: 0, plasma: 0, ice: 0, electric: 0 },
  megaEnergy: 100,
  activeEffects: [],
  activeCombo: null,
  bossActive: false,
  bossHp: 0,
  bossMaxHp: 1,
  bossPhase: 0,
  bossName: '',
  bestScore,
  stageTime: 0,
  comboTimer: 0,
  fps: 0,
});

export interface GameStore {
  phase: GamePhase;
  prevPhase: GamePhase;
  hud: HUDState;
  settings: Settings;
  stageTransition: { stage: number; name: string; subtitle: string } | null;
  toast: { text: string; id: number } | null;
  setPhase: (p: GamePhase) => void;
  setHud: (h: Partial<HUDState>) => void;
  setSettings: (s: Partial<Settings>) => void;
  setStageTransition: (t: GameStore['stageTransition']) => void;
  showToast: (text: string) => void;
}

export const useGameStore = create<GameStore>((set) => ({
  phase: 'menu',
  prevPhase: 'menu',
  hud: emptyHUD(loadBestScore()),
  settings: loadSettings(),
  stageTransition: null,
  toast: null,
  setPhase: (p) => set((st) => ({ phase: p, prevPhase: st.phase })),
  setHud: (h) => set((st) => ({ hud: { ...st.hud, ...h } })),
  setSettings: (s) =>
    set((st) => {
      const next = { ...st.settings, ...s };
      saveSettings(next);
      return { settings: next };
    }),
  setStageTransition: (t) => set({ stageTransition: t }),
  showToast: (text) => set({ toast: { text, id: Date.now() + Math.random() } }),
}));
