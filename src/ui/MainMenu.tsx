import { useGameStore } from '../state';
import { getEngine } from '../App';

export function MainMenu() {
  const bestScore = useGameStore((s) => s.hud.bestScore);
  const setPhase = useGameStore((s) => s.setPhase);

  return (
    <div className="main-menu">
      <h1 className="game-title">
        <span className="top">Chicken Invasion</span>
        <span className="sub">The Hatch</span>
      </h1>
      <p className="tagline">They didn&apos;t just invade Earth. They&apos;re evolving across the galaxy.</p>

      <div className="menu-buttons">
        <button className="btn btn-primary" onClick={() => getEngine()?.startGame()}>
          Play
        </button>
        <div className="menu-row">
          <button
            className="btn"
            onClick={() => {
              getEngine()?.audio.unlock();
              getEngine()?.audio.uiClick();
              setPhase('settings');
            }}
          >
            Settings
          </button>
          <button
            className="btn"
            onClick={() => {
              getEngine()?.audio.unlock();
              getEngine()?.audio.uiClick();
              setPhase('help');
            }}
          >
            How to Play
          </button>
        </div>
      </div>

      <div className="best-score">Best Score — {bestScore.toLocaleString()}</div>
      <div className="menu-foot">A living-ship arcade shooter · Keyboard · Touch · Auto-fire</div>
    </div>
  );
}
