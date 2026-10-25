import type { CSSProperties } from 'react';
import { fmt, initiative, profBonus, speedNow, speedOf, zeroSpeedBy } from '../logic';
import { useSheet } from '../sheet';
import type { SpeedKind } from '../types';
import { ChevronDown, Step } from './ui';

const SPEEDS: ['walk' | SpeedKind, string][] = [['walk', 'Walk'], ['climb', 'Climb'], ['swim', 'Swim'], ['fly', 'Fly'], ['burrow', 'Burrow']];

export function Vitals() {
  const { c, update, edit } = useSheet();
  const zeroBy = zeroSpeedBy(c);
  const exhCut = 5 * c.exh;
  const extraCount = SPEEDS.filter(([k]) => k !== 'walk' && c.speeds[k]).length;
  const hint = c.speedOpen ? 'Hide' : zeroBy.length ? 'Speed 0 · ' + zeroBy[0] : extraCount ? '+' + extraCount + ' more' : 'Climb · Swim · Fly';
  const note = (zeroBy.length ? 'Speed 0 while ' + zeroBy.join(', ') + '. ' : '') +
    (exhCut ? 'Exhaustion: −' + exhCut + ' ft applied to every speed. ' : '') +
    (edit ? 'Use − / + to set each base speed.' : 'Without a climb or swim speed, each foot costs 1 extra foot.');

  return (
    <section id="sec-vitals" aria-label="Combat vitals" className="vitals section">
      <div className="card stat-bar">
        <div className="stat"><span className="stat-value">{c.ac}</span><span className="stat-label">Armor class</span></div>
        <div className="stat"><span className="stat-value">{fmt(initiative(c))}</span><span className="stat-label">Initiative</span></div>
        <button type="button" className={'stat' + (c.speedOpen ? ' open' : '')} onClick={() => update({ speedOpen: !c.speedOpen })} aria-expanded={c.speedOpen} aria-controls="speed-panel">
          <span className="stat-value" style={{ color: zeroBy.length ? 'var(--danger)' : undefined }}>{speedNow(c)}<span className="stat-unit"> ft</span></span>
          <span className="row gap-4 stat-label">Speed<ChevronDown size={12} style={{ transform: c.speedOpen ? 'rotate(180deg)' : undefined }} /></span>
          <span className="stat-hint" style={{ color: zeroBy.length ? 'var(--danger)' : undefined }}>{hint}</span>
        </button>
        <div className="stat"><span className="stat-value">+{profBonus(c.level)}</span><span className="stat-label">Proficiency</span></div>
      </div>

      {c.speedOpen && (
        <div id="speed-panel" className="block">
          <div className="row wrap between gap-6">
            <h2 className="block-title">Movement</h2>
            <span className="muted">{note}</span>
          </div>
          <div className="grid speed-grid" style={edit ? { '--min': '150px' } as CSSProperties : undefined}>
            {SPEEDS.map(([k, label]) => {
              const base = k === 'walk' ? c.speedBase : c.speeds[k] || 0;
              const set = (v: number) => update((p) => (k === 'walk' ? { speedBase: v } : { speeds: { ...p.speeds, [k]: v } }));
              return (
                <div key={k} className="tile">
                  <span className="muted">{label}</span>
                  <span className="speed-value" style={{ color: base ? (exhCut || zeroBy.length ? 'var(--danger)' : 'var(--text)') : 'var(--dim)' }}>
                    {base ? speedOf(c, base) + ' ft' : k === 'climb' || k === 'swim' ? 'Walk ×½' : '—'}
                  </span>
                  {edit && (
                    <div className="row gap-6">
                      <Step label={'Lower ' + label.toLowerCase() + ' speed'} onClick={() => set(Math.max(0, base - 5))}>−</Step>
                      <span className="muted">base {base} ft</span>
                      <Step label={'Raise ' + label.toLowerCase() + ' speed'} onClick={() => set(Math.min(200, base + 5))}>+</Step>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
