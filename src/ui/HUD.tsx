import { useGameStore } from '../state';
import { getEngine } from '../App';
import type { DNAKind } from '../game/types';

const DNA_META: { kind: DNAKind; label: string; cls: string }[] = [
  { kind: 'fire', label: 'Fire', cls: 'dna-fire' },
  { kind: 'plasma', label: 'Plasma', cls: 'dna-plasma' },
  { kind: 'ice', label: 'Ice', cls: 'dna-ice' },
  { kind: 'electric', label: 'Volt', cls: 'dna-electric' },
];

export function HUD() {
  const hud = useGameStore((s) => s.hud);
  const settings = useGameStore((s) => s.settings);

  return (
    <div className="hud">
      <div className="hud-top-left">
        <div className="hull-row">
          {Array.from({ length: hud.maxHp }).map((_, i) => (
            <div key={i} className={`hull ${i < hud.hp ? '' : 'lost'}`} />
          ))}
        </div>
        <div className="panel score-chip">
          <span className="score-label">Score</span>
          <span className="score-value">{hud.score.toLocaleString()}</span>
        </div>
        <div className="panel stage-chip">
          Stage {hud.stage} · {hud.stageName}
        </div>
      </div>

      <div className="hud-top-right">
        <button className="icon-btn" onClick={() => getEngine()?.pause()} aria-label="Pause">
          ❚❚
        </button>
        {settings.showFps && <div className="fps-chip">{Math.round(hud.fps)} FPS</div>}
      </div>

      {hud.bossActive && (
        <div className="boss-wrap">
          <div className="boss-name">{hud.bossName}</div>
          <div className="boss-bar">
            <div className="boss-fill" style={{ width: `${Math.max(0, (hud.bossHp / hud.bossMaxHp) * 100)}%` }} />
          </div>
          {hud.bossName === 'THE CHICKEN OVERLORD' && (
            <div className="boss-phases">
              {[1, 2, 3].map((p) => (
                <div key={p} className={`boss-pip ${hud.bossPhase >= p ? 'on' : ''}`} />
              ))}
            </div>
          )}
        </div>
      )}

      <div className="hud-bottom-left">
        <div className="panel dna-panel">
          <div className="dna-row">
            {DNA_META.map(({ kind, label, cls }) => (
              <div key={kind} className={`dna-chip ${cls} ${hud.activeEffects.includes(kind) ? 'active' : ''}`}>
                <span className="count">{hud.dna[kind]}</span>
                <span className="name">{label}</span>
              </div>
            ))}
          </div>
          <div className="evo-row">
            <span className="evo-level">Evolution LV.{hud.evoLevel}</span>
            <div className="evo-bar">
              <div className="evo-fill" style={{ width: `${Math.round(hud.evoProgress * 100)}%` }} />
            </div>
          </div>
          {hud.activeCombo && (
            <div className={`combo-badge ${hud.activeCombo === 'chain_nova' ? 'combo-chain' : 'combo-cryo'}`}>
              {hud.activeCombo === 'chain_nova' ? '⚡ Chain Nova — Explosive Arcs' : '❄ Cryo Lance — Piercing Beam'}
            </div>
          )}
        </div>
      </div>

      <div className="hud-bottom-right">
        <div className="mega-wrap">
          <span className="mega-label">Mega Burst</span>
          <div className="mega-bar">
            <div
              className={`mega-fill ${hud.megaEnergy >= 100 ? 'ready' : ''}`}
              style={{ width: `${Math.min(100, hud.megaEnergy)}%` }}
            />
          </div>
          {hud.megaEnergy >= 100 && <span className="mega-ready-text">Burst Ready!</span>}
        </div>
      </div>
    </div>
  );
}
