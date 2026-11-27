import { useGameStore } from '../state';
import { getEngine } from '../App';

export function HelpScreen() {
  const setPhase = useGameStore((s) => s.setPhase);
  const prevPhase = useGameStore((s) => s.prevPhase);

  return (
    <div className="overlay">
      <div className="panel help-panel">
        <h2>How to Play</h2>

        <div className="help-grid">
          <div className="help-card">
            <h3>Desktop Controls</h3>
            <ul>
              <li>
                <span className="kbd">W</span>
                <span className="kbd">A</span>
                <span className="kbd">S</span>
                <span className="kbd">D</span> / Arrows — move
              </li>
              <li>Mouse — optional aiming</li>
              <li>Weapons fire automatically</li>
              <li>
                <span className="kbd">Space</span> — Mega Burst
              </li>
              <li>
                <span className="kbd">Esc</span> — pause · <span className="kbd">M</span> — mute
              </li>
            </ul>
          </div>

          <div className="help-card">
            <h3>Mobile Controls</h3>
            <ul>
              <li>Left half of screen — drag to move</li>
              <li>Weapons fire automatically</li>
              <li>Mega Burst button — bottom right</li>
              <li>Tap the ❚❚ button to pause</li>
            </ul>
          </div>

          <div className="help-card">
            <h3>The Living Ship</h3>
            <p>
              Enemies drop <b style={{ color: '#d88aff' }}>DNA fragments</b>. Collect them to evolve your ship — new organic
              growths, stronger weapons and dramatic visual forms. Four DNA types:
            </p>
            <ul>
              <li>
                <b style={{ color: '#ff9a4a' }}>FIRE</b> — burning damage over time
              </li>
              <li>
                <b style={{ color: '#d88aff' }}>PLASMA</b> — raw weapon power
              </li>
              <li>
                <b style={{ color: '#8ad8ff' }}>ICE</b> — slows enemies on hit
              </li>
              <li>
                <b style={{ color: '#ffe23a' }}>ELECTRIC</b> — chain lightning between foes
              </li>
            </ul>
          </div>

          <div className="help-card">
            <h3>Combo Weapons</h3>
            <ul>
              <li>
                <b style={{ color: '#ffd23a' }}>Fire + Electric</b> → Chain Nova: explosive chain-lightning shots
              </li>
              <li>
                <b style={{ color: '#8ad8ff' }}>Ice + Plasma</b> → Cryo Lance: piercing freezing beam
              </li>
            </ul>
            <p>Each weapon type has its own projectile color and impact effects.</p>
            <p>Collect 7+ of each DNA type to trigger a combo.</p>
          </div>

          <div className="help-card">
            <h3>Alien Eggs</h3>
            <p>
              Eggs hatch into new enemies if ignored. Watch for the warning glow — destroy them quickly for bonus DNA, or
              deal with what crawls out.
            </p>
          </div>

          <div className="help-card">
            <h3>Mega Burst</h3>
            <p>
              Energy charges over time and through kills. Unleash it to blast everything nearby, erase enemy bullets and
              turn a desperate moment around.
            </p>
          </div>
        </div>

        <button
          className="btn btn-primary"
          onClick={() => {
            getEngine()?.audio.uiClick();
            setPhase(prevPhase === 'paused' ? 'paused' : 'menu');
          }}
        >
          Back
        </button>
      </div>
    </div>
  );
}
