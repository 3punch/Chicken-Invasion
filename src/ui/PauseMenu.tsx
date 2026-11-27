import { useGameStore } from '../state';
import { getEngine } from '../App';

export function PauseMenu() {
  const setPhase = useGameStore((s) => s.setPhase);

  return (
    <div className="overlay">
      <h2 className="overlay-title">Paused</h2>
      <p className="overlay-sub">The invasion waits for no one</p>
      <div className="menu-buttons" style={{ marginTop: 12 }}>
        <button className="btn btn-primary" onClick={() => getEngine()?.resume()}>
          Resume
        </button>
        <div className="menu-row">
          <button
            className="btn"
            onClick={() => {
              getEngine()?.audio.uiClick();
              setPhase('settings');
            }}
          >
            Settings
          </button>
          <button
            className="btn"
            onClick={() => {
              getEngine()?.audio.uiClick();
              setPhase('help');
            }}
          >
            Controls
          </button>
        </div>
        <button className="btn btn-danger" onClick={() => getEngine()?.quitToMenu()}>
          Quit to Menu
        </button>
      </div>
    </div>
  );
}
