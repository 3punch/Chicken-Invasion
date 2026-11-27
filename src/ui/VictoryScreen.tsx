import { useGameStore } from '../state';
import { getEngine } from '../App';

export function VictoryScreen() {
  const hud = useGameStore((s) => s.hud);
  const rank =
    hud.score >= 60000 ? 'S — GALAXY LEGEND' : hud.score >= 35000 ? 'A — ACE PILOT' : hud.score >= 18000 ? 'B — VETERAN' : 'C — ROOKIE';

  return (
    <div className="overlay">
      <h2 className="overlay-title win">Victory</h2>
      <p className="overlay-sub">The Chicken Overlord has fallen — the galaxy is safe… for now</p>

      <div className="stat-grid">
        <div className="panel stat-card">
          <div className="k">Final Score</div>
          <div className="v">{hud.score.toLocaleString()}</div>
        </div>
        <div className="panel stat-card">
          <div className="k">Best</div>
          <div className="v">{hud.bestScore.toLocaleString()}</div>
        </div>
        <div className="panel stat-card">
          <div className="k">Rank</div>
          <div className="v" style={{ fontSize: 17 }}>
            {rank}
          </div>
        </div>
      </div>

      <div className="menu-buttons" style={{ marginTop: 10 }}>
        <button className="btn btn-primary" onClick={() => getEngine()?.startGame()}>
          Play Again
        </button>
        <button className="btn" onClick={() => getEngine()?.quitToMenu()}>
          Main Menu
        </button>
      </div>
    </div>
  );
}
