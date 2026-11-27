import { useGameStore } from '../state';
import { getEngine } from '../App';
import type { Settings } from '../game/types';

export function SettingsPanel() {
  const settings = useGameStore((s) => s.settings);
  const setSettings = useGameStore((s) => s.setSettings);
  const setPhase = useGameStore((s) => s.setPhase);
  const prevPhase = useGameStore((s) => s.prevPhase);

  const close = () => {
    getEngine()?.audio.uiClick();
    // if we came from pause, go back to pause; otherwise menu
    const back = prevPhase === 'paused' ? 'paused' : 'menu';
    setPhase(back);
  };

  const slider = (key: keyof Settings, label: string) => (
    <div className="setting-row">
      <label>{label}</label>
      <input
        type="range"
        min={0}
        max={100}
        value={Math.round((settings[key] as number) * 100)}
        onChange={(e) => {
          setSettings({ [key]: Number(e.target.value) / 100 } as Partial<Settings>);
          getEngine()?.audio.uiHover();
        }}
      />
    </div>
  );

  const toggle = (key: keyof Settings, label: string) => (
    <div className="setting-row">
      <label>{label}</label>
      <button
        className={`toggle ${settings[key] ? 'on' : ''}`}
        onClick={() => {
          setSettings({ [key]: !settings[key] } as Partial<Settings>);
          getEngine()?.audio.uiClick();
        }}
        aria-label={label}
      />
    </div>
  );

  return (
    <div className="overlay">
      <div className="panel settings-panel">
        <h2>Settings</h2>
        {slider('masterVolume', 'Master Volume')}
        {slider('musicVolume', 'Music Volume')}
        {slider('sfxVolume', 'SFX Volume')}
        {toggle('muted', 'Mute All')}
        {toggle('screenShake', 'Screen Shake')}
        <div className="setting-row">
          <label>Particles</label>
          <button
            className={`toggle ${settings.particles === 'high' ? 'on' : ''}`}
            onClick={() => {
              setSettings({ particles: settings.particles === 'high' ? 'low' : 'high' });
              getEngine()?.audio.uiClick();
            }}
            aria-label="Particle quality"
          />
        </div>
        {toggle('showFps', 'Show FPS')}
        <button className="btn btn-primary" onClick={close}>
          Done
        </button>
      </div>
    </div>
  );
}
