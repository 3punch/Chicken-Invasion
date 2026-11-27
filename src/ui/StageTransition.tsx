import { useGameStore } from '../state';

export function StageTransition() {
  const t = useGameStore((s) => s.stageTransition);
  if (!t) return null;

  return (
    <div className="stage-transition" key={t.stage}>
      <div className="scan-lines" />
      <div className="big-num">STAGE {t.stage}</div>
      <div className="st-name">{t.name}</div>
      <div className="st-sub">{t.subtitle}</div>
    </div>
  );
}
