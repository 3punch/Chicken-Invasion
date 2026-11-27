import { useGameStore } from '../state';
import { getEngine } from '../App';

export function GameOverScreen() {
  const hud = useGameStore((s) => s.hud);

  return (
    <div className="overlay">
      <h2 className="overlay-title fail">Ship Destroyed</h2>
      <p className="overlay-sub">The flock grows stronger…</p>

      <div className="stat-grid">
        <div className="panel stat-card">
          <div className="k">Score</div>
          <div className="v">{hud.score.toLocaleString()}</div>
        </div>
        <div className="panel stat-card">
          <div className="k">Best</div>
          <div className="v">{hud.bestScore.toLocaleString()}</div>
        </div>
        <div className="panel stat-card">
          <div className="k">Reached</div>
          <div className="v">
            {hud.stage} · {hud.stageName}
          </div>
        </div>
      </div>

      <div className="menu-buttons" style={{ marginTop: 10 }}>
        <button className="btn btn-primary" onClick={() => getEngine()?.startGame()}>
          Try Again
        </button>
        <button className="btn" onClick={() => getEngine()?.quitToMenu()}>
          Main Menu
        </button>
      </div>
    </div>
  );
}
