import { useEffect, useRef } from 'react';
import { getEngine } from '../App';
import { useGameStore } from '../state';

/**
 * Touch controls: dynamic virtual joystick visual (left) + MEGA BURST button.
 * The actual joystick logic lives in the engine's InputManager; this mirrors it.
 */
export function TouchControls() {
  const knobRef = useRef<HTMLDivElement>(null);
  const joyRef = useRef<HTMLDivElement>(null);
  const megaEnergy = useGameStore((s) => s.hud.megaEnergy);
  const phase = useGameStore((s) => s.phase);

  useEffect(() => {
    // mark touch mode once a touch happens
    const mark = () => {
      document.body.classList.add('touch-mode');
      window.removeEventListener('touchstart', mark);
    };
    window.addEventListener('touchstart', mark, { passive: true });
    return () => window.removeEventListener('touchstart', mark);
  }, []);

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const engine = getEngine();
      if (!engine) return;
      const input = engine.input;
      const joy = joyRef.current;
      const knob = knobRef.current;
      if (!joy || !knob) return;
      if (input.joyActive) {
        const rect = joy.parentElement!.getBoundingClientRect();
        joy.style.left = `${input.joyBaseX * rect.width * 0.5 + rect.width * 0.5 - 59}px`;
        joy.style.top = `${-input.joyBaseY * rect.height * 0.5 + rect.height * 0.5 - 59}px`;
        joy.style.opacity = '1';
        knob.style.transform = `translate(${input.joyX * 33}px, ${-input.joyY * 33}px)`;
      } else {
        joy.style.opacity = '0';
        knob.style.transform = 'translate(0, 0)';
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  if (phase !== 'playing' && phase !== 'transition') return null;

  return (
    <div className="touch-layer">
      <div ref={joyRef} className="joystick" style={{ opacity: 0, transition: 'opacity 0.25s ease' }}>
        <div ref={knobRef} className="knob" />
      </div>
      <button
        className={`mega-button ${megaEnergy >= 100 ? 'ready' : ''}`}
        onPointerDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
          getEngine()?.triggerMegaBurst();
        }}
      >
        Mega
        <br />
        Burst
      </button>
    </div>
  );
}
