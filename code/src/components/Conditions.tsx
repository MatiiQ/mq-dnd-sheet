import { hasActiveEffect, LINKED_LISTS, parseLink, sourceLabel, sourceOf } from '../links';
import { activeAuras, CONDITIONS, CONDITION_RULES, setExhaustion, toggleCondition } from '../logic';
import { useSheet } from '../sheet';
import type { Character, Feature, Linked, Spell } from '../types';
import { revealOf } from './nav';
import { EffectSwitch, Step } from './ui';

// What rides on a feature's aura: the sources of the entries and grants whose needAura names its catalog id (Aura of
// Courage, oath auras), once each, in sheet order, leaving out the aura's own feature.
function ridersOf(c: Character, from: string): string[] {
  const src = sourceOf(c, from), cid = parseLink(from)?.kind === 'feature' ? (src as Feature | null)?.cid : undefined;
  if (!cid) return [];
  const names = LINKED_LISTS.flatMap((k) => (c[k] as Linked[]).filter((x) => x.needAura === cid && x.from && x.from !== from)
    .map((x) => sourceOf(c, x.from)?.name).filter((n): n is string => !!n));
  return [...new Set(names)];
}

export function Conditions() {
  const { c, update } = useSheet();
  const rules = CONDITIONS.filter((n) => c.conds[n]).map((n) => ({ name: n, text: CONDITION_RULES[n], dead: false }));
  if (c.exh >= 6) rules.push({ name: 'Exhaustion 6', text: 'The character dies.', dead: true });
  else if (c.exh > 0) rules.push({
    name: 'Exhaustion ' + c.exh, dead: false,
    text: 'Subtract ' + c.exh * 2 + ' from every D20 Test (attack rolls, ability checks, saving throws). Speed −' + c.exh * 5 + ' ft, already applied. A Long Rest removes 1 level.'
  });

  return (
    <section id="sec-conditions" aria-label="Conditions" className="block section">
      <h2 className="block-title area-title">Conditions</h2>
      <div className="row wrap gap-8">
        {CONDITIONS.map((n) => (
          <button key={n} type="button" className="chip" aria-pressed={!!c.conds[n]} onClick={() => update((p) => toggleCondition(p, n))}>{n}</button>
        ))}
        <div className="row amount" style={{ marginLeft: 'auto', paddingLeft: 14 }}>
          <span style={{ fontSize: 14, color: 'var(--text-2)' }}>Exhaustion <strong style={{ color: 'var(--accent)' }}>{c.exh}</strong> / 6</span>
          <Step label="Decrease exhaustion" onClick={() => update((p) => setExhaustion(p, p.exh - 1))}>−</Step>
          <Step label="Increase exhaustion" onClick={() => update((p) => setExhaustion(p, p.exh + 1))}>+</Step>
        </div>
      </div>
      {rules.length > 0 && (
        <ul aria-label="Active condition effects" className="col gap-6" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {rules.map((r) => (
            <li key={r.name} className="notice" style={{ background: r.dead ? 'var(--dead-bg)' : 'var(--cond-bg)', color: r.dead ? 'var(--dead-fg)' : 'var(--cond-fg)' }}>
              <strong>{r.name}</strong> · {r.text}
            </li>
          ))}
        </ul>
      )}
      <ActiveEffects />
    </section>
  );
}

// Auras that run (or are stopped only by Incapacitated, greyed), then every other switched-on effect, each with its
// source and switch. Concentration stays in the top bar. Hidden when empty.
function ActiveEffects() {
  const { c, reveal } = useSheet();
  const auras = activeAuras(c), shown = new Set(auras.map((a) => a.g.from));
  const others = c.effectsOn.filter((l) => !shown.has(l) && sourceOf(c, l));
  if (!auras.length && !others.length) return null;
  // A Concentration spell's effect is on while concentrating: no switch of its own.
  const switchable = (from: string) => hasActiveEffect(c, from) && !(parseLink(from)?.kind === 'spell' && (sourceOf(c, from) as Spell | null)?.c);
  return (
    <ul aria-label="Active effects" className="col gap-6" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
      {auras.map(({ g, range, why }) => {
        const to = revealOf(c, g.from), src = sourceLabel(c, g), riders = ridersOf(c, g.from);
        return (
          <li key={g.id} className={'well col gap-4 effect-row' + (why ? ' inactive' : '')}>
            <span className="row wrap gap-8" style={{ alignItems: 'center' }}>
              <strong className="grow">{g.name}</strong>
              <span className="muted">{range}-ft Emanation</span>
              {switchable(g.from) && <EffectSwitch link={g.from} name={sourceOf(c, g.from)!.name} />}
            </span>
            {why && <span className="small">{why}</span>}
            {g.note && <span className="small">{g.note}</span>}
            {riders.length > 0 && <span className="small">With: {riders.join(', ')}</span>}
            {src && (to ? <button type="button" className="link-btn go-link" onClick={() => reveal(to)}>Source: {src}</button> : <span className="muted">Source: {src}</span>)}
          </li>
        );
      })}
      {others.map((l) => {
        const name = sourceOf(c, l)!.name, to = revealOf(c, l);
        return (
          <li key={l} className="well row wrap gap-8 effect-row" style={{ alignItems: 'center' }}>
            {to ? <button type="button" className="link-btn go-link grow" onClick={() => reveal(to)}>{name}</button> : <strong className="grow">{name}</strong>}
            <EffectSwitch link={l} name={name} />
          </li>
        );
      })}
    </ul>
  );
}
