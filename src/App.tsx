/**
 * App shell — owns the GameEngine lifecycle and renders UI overlays
 * on top of the WebGL canvas. Engine updates flow into the zustand store.
 */
import { useEffect, useRef } from 'react';
import { GameEngine } from './game/GameEngine';
import { useGameStore } from './state';
import { MainMenu } from './ui/MainMenu';
import { HUD } from './ui/HUD';
import { PauseMenu } from './ui/PauseMenu';
import { GameOverScreen } from './ui/GameOverScreen';
import { VictoryScreen } from './ui/VictoryScreen';
import { StageTransition } from './ui/StageTransition';
import { SettingsPanel } from './ui/SettingsPanel';
import { HelpScreen } from './ui/HelpScreen';
import { TouchControls } from './ui/TouchControls';
import type { GamePhase } from './game/types';

let engineInstance: GameEngine | null = null;
export const getEngine = (): GameEngine | null => engineInstance;

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<GameEngine | null>(null);
  const phase = useGameStore((s) => s.phase);
  const settings = useGameStore((s) => s.settings);
  const toast = useGameStore((s) => s.toast);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const store = useGameStore.getState();
    const engine = new GameEngine(canvas, store.settings);
    engineInstance = engine;
    engineRef.current = engine;
    engine.attach(canvas.parentElement as HTMLElement, canvas);
    engine.applySettings(store.settings);
    engine.start();

    // unlock audio on first user gesture
    const unlock = () => {
      engine.audio.unlock();
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);

    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
      engine.dispose();
      engineInstance = null;
      engineRef.current = null;
    };
  }, []);

  useEffect(() => {
    engineRef.current?.applySettings(settings);
  }, [settings]);

  const inGame: GamePhase[] = ['playing', 'paused', 'transition', 'gameover', 'victory'];
  const showHUD = inGame.includes(phase);

  return (
    <div className="game-shell">
      <canvas ref={canvasRef} className="game-canvas" tabIndex={0} />

      {showHUD && <HUD />}
      {phase === 'menu' && <MainMenu />}
      {phase === 'paused' && <PauseMenu />}
      {phase === 'gameover' && <GameOverScreen />}
      {phase === 'victory' && <VictoryScreen />}
      {phase === 'transition' && <StageTransition />}
      {phase === 'settings' && <SettingsPanel />}
      {phase === 'help' && <HelpScreen />}
      <TouchControls />

      {toast && (phase === 'playing' || phase === 'transition') && (
        <div key={toast.id} className="toast">
          {toast.text}
        </div>
      )}

      <div className="vignette" />
    </div>
  );
}
