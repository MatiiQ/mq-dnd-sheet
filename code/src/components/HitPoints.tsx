import { useEffect, useState } from 'react';
import { applyDamage, applyHeal, applySetTemp, clearHpUndo, fmt, hdSpent, healHitDie, hitDieRoll, hpColor, hpRingStops, isDead, setMaxHp, spendHitDie, undoHp } from '../logic';
import { useWide } from '../layout';
import { useSheet } from '../sheet';
import type { Character } from '../types';
import { MarkPips, NumInput, Step, UsePips, XIcon } from './ui';

const HP_UNDO_MS = 5000;

export function HitPoints({ hdPrompt, setHdPrompt }: { hdPrompt: boolean; setHdPrompt: (on: boolean) => void }) {
  const { c, update, edit } = useSheet();
  const wide = useWide();
  // Bumping the key remounts the amount field, dropping whatever was half-typed.
  const [amtKey, setAmtKey] = useState(0);
  const ring = hpRingStops(c);
  const delta = c.maxHp - c.origHp;
  const hdUsed = hdSpent(c);
  const hdLeft = c.level - hdUsed;
  const dead = isDead(c);
  const canSpendHD = hdLeft > 0 && c.hp > 0 && !dead;
  const hdRoll = hitDieRoll(c);
  const deltaColor = delta < 0 ? 'var(--danger)' : delta > 0 ? 'var(--blue)' : 'var(--muted)';

  // The undo row hides itself after a few seconds; a newer HP action restarts the wait.
  useEffect(() => {
    const shown = c.hpUndo;
    if (!shown) return;
    const t = setTimeout(() => update((p) => clearHpUndo(p, shown)), HP_UNDO_MS);
    return () => clearTimeout(t);
  }, [c.hpUndo]);

  const act = (fn: (c: Character) => Character) => { update(fn); setAmtKey((k) => k + 1); setHdPrompt(false); };
  const setAmount = (v: number) => { update({ amount: v }); setAmtKey((k) => k + 1); };
  const spendHD = () => {
    if (!canSpendHD) return;
    update(spendHitDie);
    setHdPrompt(true);
    setAmtKey((k) => k + 1);
    setTimeout(() => {
      const el = document.getElementById('hp-amount');
      // In two columns the card is always in view, so scrolling would only jump the page.
      el?.focus({ preventScroll: wide });
      if (!wide) el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }, 60);
  };

  return (
    <section id="sec-hp" aria-label="Hit points" className="card section gap-10 hp-card">
      {c.restMsg && (
        <div role="status" className="row gap-8" style={{ alignItems: 'flex-start', borderRadius: 10, padding: '8px 4px 8px 12px', background: 'var(--warm-bg)', color: 'var(--warm-fg)' }}>
          <div className="col grow gap-4" style={{ paddingTop: 4, gap: 2 }}>
            <strong>{c.restMsg.title}</strong>
            <span style={{ fontSize: 14 }}>{c.restMsg.body}</span>
          </div>
          <button type="button" className="icon-btn" style={{ color: 'var(--warm-fg)' }} aria-label="Dismiss rest summary" onClick={() => update({ restMsg: null })}><XIcon /></button>
        </div>
      )}

      <div className="row gap-12">
        <div className="hp-ring" style={{ background: `conic-gradient(${hpColor(c)} 0 ${ring.hp}%, var(--blue) ${ring.hp}% ${ring.hp + ring.temp}%, var(--well) ${ring.hp + ring.temp}% 100%)` }}>
          <span className="hp-now" style={{ color: hpColor(c) }}>{c.hp}</span>
        </div>
        <div className="col grow" style={{ gap: 2 }}>
          <div className="block-title area-title">Hit points</div>
          <span className="hp-max">/ {c.maxHp}</span>
          {c.temp > 0 && <span style={{ color: 'var(--blue)', fontWeight: 600 }}>+{c.temp} temp</span>}
          {!edit && c.origOn && delta !== 0 && <span className="hp-delta" style={{ color: deltaColor }}>max {fmt(delta)} (original {c.origHp})</span>}
        </div>
      </div>

      <div className="row wrap gap-8">
        <div className="row amount">
          <button type="button" className="step" aria-label="Decrease amount" onClick={() => setAmount(Math.max(1, c.amount - 1))}>−</button>
          <label className="col" style={{ alignItems: 'center', width: 64, fontSize: 11, fontWeight: 600, color: 'var(--muted)' }}>Amount
            <NumInput key={amtKey} id="hp-amount" value={c.amount} min={0} max={999} initialDraft={hdPrompt && !c.amount ? '' : null} emptyValue={0} onCommit={(v) => update({ amount: v })}
              style={{ width: 56, font: '700 18px var(--sans)', textAlign: 'center', background: 'transparent', border: 'none', padding: 0 }} />
          </label>
          <button type="button" className="step" aria-label="Increase amount" onClick={() => setAmount(Math.min(999, c.amount + 1))}>+</button>
        </div>
        <button type="button" className="btn btn-act btn-primary" onClick={() => act(applyDamage)}>Damage</button>
        <button type="button" className="btn btn-act" aria-disabled={dead} onClick={() => act(hdPrompt ? healHitDie : applyHeal)}>Heal</button>
        <button type="button" className="btn btn-act" onClick={() => act(applySetTemp)}>Set Temp</button>
      </div>

      {c.hpUndo && (
        <div role="status" className="row wrap" style={{ gap: '8px 12px', borderRadius: 10, padding: '6px 6px 6px 12px', background: 'var(--raised)' }}>
          <span style={{ flex: '1 1 200px', fontSize: 14 }}>{c.hpUndo.text}</span>
          <button type="button" className="btn" style={{ color: 'var(--accent)', padding: '0 16px' }} onClick={() => update(undoHp)}>Undo</button>
        </div>
      )}
      {c.concCheck && <div role="status" className="notice notice-blue">{c.concCheck}</div>}

      {edit && (
        <div className="dashed-box">
          <div className="row gap-6">
            <span className="muted">Max HP</span>
            <Step label="Decrease max HP" onClick={() => update((p) => setMaxHp(p, p.maxHp - 1))}>−</Step>
            <span style={{ minWidth: 36, textAlign: 'center', fontSize: 18, fontWeight: 700 }}>{c.maxHp}</span>
            <Step label="Increase max HP" onClick={() => update((p) => setMaxHp(p, p.maxHp + 1))}>+</Step>
          </div>
          {!c.origOn && (
            <button type="button" className="btn btn-add" style={{ fontSize: 14, padding: '0 12px' }} onClick={() => update((p) => ({ origOn: true, origHp: p.maxHp }))}>+ Original max HP</button>
          )}
          {c.origOn && (
            <div className="row wrap gap-8">
              <label className="row gap-6 muted">Original max
                <NumInput className="input input-num" value={c.origHp} min={0} max={999} onCommit={(v) => update({ origHp: v })} />
              </label>
              <span style={{ fontSize: 13, fontWeight: 600, color: deltaColor }}>{delta === 0 ? 'Matches original' : fmt(delta) + ' from original'}</span>
              {delta !== 0 && (
                <button type="button" className="btn" style={{ fontSize: 14, padding: '0 12px' }}
                  onClick={() => update((p) => setMaxHp(p, p.origHp))}>Reset to original</button>
              )}
              <button type="button" className="icon-btn faint" aria-label="Hide original max HP field" onClick={() => update({ origOn: false })}><XIcon /></button>
            </div>
          )}
        </div>
      )}

      <div className="row wrap between" style={{ gap: '4px 12px' }}>
        <div className="row wrap">
          <span className="muted" style={{ marginRight: 2 }}>Hit Dice</span>
          <UsePips used={hdUsed} max={c.level} color="var(--accent)" size={16} width={40} noun="Hit Die" onChange={(n) => update({ hdUsed: n })} />
          <span style={{ fontSize: 13, color: 'var(--text-2)', marginLeft: 4 }}>{hdLeft} / {c.level}</span>
        </div>
        <button type="button" className="btn" style={{ fontSize: 14, padding: '0 12px' }} aria-disabled={!canSpendHD} onClick={spendHD}>Spend Hit Die · {hdRoll}</button>
      </div>
      {hdPrompt && <div role="status" className="notice notice-blue">Hit Die spent. Roll {hdRoll} (minimum 1), type the total in Amount above, then tap Heal.</div>}

      {c.hp === 0 && (
        <div className="col gap-6" style={{ borderTop: '1px solid var(--line)', paddingTop: 10 }}>
          <div className="row wrap" style={{ gap: '4px 12px' }}>
            <span className="label" style={{ color: 'var(--danger)' }}>Death saves</span>
            <span className="muted">Roll <strong style={{ color: 'var(--text)' }}>d20</strong> · 10+ success · 1 = two failures · 20 = regain 1 HP</span>
          </div>
          <div className="row wrap" style={{ gap: '4px 16px' }}>
            <div className="row">
              <span className="muted" style={{ marginRight: 2 }}>Successes</span>
              <MarkPips n={c.ds} color="var(--blue)" noun="success" onChange={(n) => update({ ds: n })} />
            </div>
            <div className="row">
              <span className="muted" style={{ marginRight: 2 }}>Failures</span>
              <MarkPips n={c.df} color="var(--danger)" noun="failure" onChange={(n) => update({ df: n })} />
            </div>
          </div>
          {c.ds >= 3 && c.df < 3 && !dead && <div role="status" className="notice notice-stable">Stable. Stop rolling death saves. You stay at 0 HP, unconscious, and regain 1 HP after 1d4 hours unless healed sooner.</div>}
          {/* At Exhaustion 6 with HP above 0, only the Conditions card shows the death. */}
          {dead && <div role="status" className="notice notice-dead">Dead. {c.exh >= 6 ? 'Exhaustion level 6.' : 'Three failed death saves.'} Only magic such as Revivify can bring the character back: {c.exh >= 6 ? 'lower Exhaustion' : 'clear the failures'}, then Heal.</div>}
        </div>
      )}
    </section>
  );
}
