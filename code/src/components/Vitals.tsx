import type { CSSProperties } from 'react';
import { abilityMod, fmt, profBonus, speedNow, speedOf, zeroSpeedBy } from '../logic';
import { useSheet } from '../sheet';
import type { SpeedKind } from '../types';
import { BoltIcon, BootIcon, ChevronDown, MedalIcon, ShieldIcon, Step } from './ui';

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
    <section aria-label="Combat vitals" className="row wrap gap-12 vitals" style={{ alignItems: 'stretch' }}>
      <div className="vital"><ShieldIcon size={22} /><div className="vital-value">{c.ac}</div><div className="vital-label">ARMOR CLASS</div></div>
      <div className="vital"><BoltIcon size={22} /><div className="vital-value">{fmt(abilityMod(c, 'dex') + c.initMisc)}</div><div className="vital-label">INITIATIVE</div></div>
      <button type="button" className="vital" style={{ borderColor: c.speedOpen ? 'var(--accent)' : undefined }}
        onClick={() => update({ speedOpen: !c.speedOpen })} aria-expanded={c.speedOpen} aria-controls="speed-panel">
        <BootIcon size={22} />
        <span className="vital-value" style={{ color: zeroBy.length ? 'var(--orange)' : undefined }}>{speedNow(c)}<span style={{ fontSize: 15, color: 'var(--muted)' }}> ft</span></span>
        <span className="vital-label">SPEED</span>
        <span className="row gap-4 vital-hint" style={{ fontSize: 12, color: 'var(--accent)' }}>{hint}<ChevronDown size={12} style={{ transform: c.speedOpen ? 'rotate(180deg)' : undefined }} /></span>
      </button>
      <div className="vital"><MedalIcon size={22} /><div className="vital-value">+{profBonus(c.level)}</div><div className="vital-label">PROFICIENCY</div></div>

      {c.speedOpen && (
        <div id="speed-panel" className="card gap-8" style={{ flex: '1 1 100%' }}>
          <div className="row wrap between gap-6">
            <span className="caps">MOVEMENT</span>
            <span className="muted">{note}</span>
          </div>
          <div className="grid speed-grid" style={edit ? { '--min': '150px' } as CSSProperties : undefined}>
            {SPEEDS.map(([k, label]) => {
              const base = k === 'walk' ? c.speedBase : c.speeds[k] || 0;
              const set = (v: number) => update((p) => (k === 'walk' ? { speedBase: v } : { speeds: { ...p.speeds, [k]: v } }));
              return (
                <div key={k} className="tile">
                  <span className="muted">{label}</span>
                  <span className="speed-value" style={{ color: base ? (exhCut || zeroBy.length ? 'var(--orange)' : 'var(--text)') : 'var(--dim)' }}>
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
