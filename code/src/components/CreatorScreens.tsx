// The creator's screens, Class to Summary (spec 2026-11-08 §3): each renders one screen of creatorScreens and writes the
// answers through the pure writers in creator.ts. The level screens are LevelScreen (LevelUpWizard.tsx).
import { useState } from 'react';
import { choicesOf, equipText, nestedEntries, poolOptions } from '../catalog/copy';
import { choiceKey, type ChoiceStep, type FlowAnswers } from '../catalog/flow';
import { entriesOf, type Catalog } from '../catalog/merge';
import type { BackgroundEntry, ClassEntry, Entry, GrantSpec } from '../catalog/schema';
import {
  applyRolled, assignScore, assigned, bonusMode, chooseClass, classTileText, dropLowest, parseTotals, POINT_BUDGET, pointsSpent, scorePool,
  setBonusMode, setBonusPick, setMethod, setStart, type CreatorAnswers, type ReplaySteps
} from '../creator';
import { ABILITIES, armorClass, classLine, effScore, fmt, maxHpOf, skillLevel } from '../logic';
import { Sheet } from '../sheet';
import type { Ability, Character } from '../types';
import { ChoiceFlow } from './pickers/ChoiceFlow';
import { ChoiceTile, NumInput, Step } from './ui';

export interface ScreenProps { cat: Catalog; a: CreatorAnswers; set: (f: (x: CreatorAnswers) => CreatorAnswers) => void; r: ReplaySteps }

const ctxOf = (c: Character) => ({ c, update: () => {}, edit: false, form: null, setForm: () => {}, focus: null, reveal: () => {}, markFocusUsed: () => {} });
const classOf = (cat: Catalog, id: string) => { const e = cat.byId.get(id); return e?.kind === 'class' ? (e as ClassEntry) : undefined; };
const abName = (k: string) => ABILITIES.find(([x]) => x === k)?.[1] ?? k;
const mod = (v: number) => fmt(Math.floor((v - 10) / 2));
export function ClassTiles({ cat, a, set }: ScreenProps) {
  return (
    <div className="col gap-8">
      <h3 className="block-title">Class</h3>
      <div className="tile-grid">
        {entriesOf(cat, 'class').map((e) => {
          const t = classTileText(e);
          return <ChoiceTile key={e.id} title={e.name} meta={t.meta} body={t.body} selected={a.cls === e.id} onSelect={() => set((x) => chooseClass(x, cat, e.id))} />;
        })}
      </div>
    </div>
  );
}

export function StartLevel({ a, set }: ScreenProps) {
  return (
    <div className="col gap-8">
      <h3 className="block-title">Starting level</h3>
      <label className="row gap-8">Starting level
        <NumInput className="input input-num" aria-label="Starting level" value={a.start} min={1} max={20} onCommit={(v) => set((x) => setStart(x, v))} />
      </label>
    </div>
  );
}

// A background's line: its feat, skills and tool, from its `feat` and `prof` grants (never parsed from desc).
function backgroundBody(cat: Catalog, e: BackgroundEntry): string {
  const profs = (cat2: string) => (e.grants ?? []).filter((g): g is GrantSpec => g.kind === 'prof' && g.cat === cat2).map((g) => g.name);
  const feat = cat.byId.get(e.feat.split(':')[0]);
  const tool = profs('tool').concat((e.grants ?? []).filter((g) => g.kind === 'choice' && g.pool?.startsWith('tool:')).map((g) => g.name));
  return [feat && 'Feat: ' + feat.name, profs('skill').length && 'Skills: ' + profs('skill').join(', '), tool.length && 'Tool: ' + tool.join(', ')].filter(Boolean).join(' · ');
}

export function OriginTiles({ cat, a, set, kind }: ScreenProps & { kind: 'background' | 'species' }) {
  const id = kind === 'background' ? a.background : a.species;
  // A new pick clears its flow (its answers named the old entry's choices).
  const pick = (e: Entry) => set((x) => (kind === 'background' ? (x.background === e.id ? x : { ...x, background: e.id, bgFlow: {} }) : (x.species === e.id ? x : { ...x, species: e.id, spFlow: {} })));
  return (
    <div className="col gap-8">
      <h3 className="block-title">{kind === 'background' ? 'Background' : 'Species'}</h3>
      <div className="tile-grid">
        {entriesOf(cat, kind).map((e) => {
          if (e.kind === 'background') {
            const abil = choicesOf(e).find((ch) => ch.id === 'abil');
            const abs = [...new Set((abil?.options ?? []).map((o) => o.ab).filter(Boolean))].map((k) => (k as string).toUpperCase()).join(', ');
            const feat = cat.byId.get(e.feat.split(':')[0]);
            return <ChoiceTile key={e.id} title={e.name} meta={abs || undefined} body={backgroundBody(cat, e) || undefined} more={feat?.desc || undefined} selected={id === e.id} onSelect={() => pick(e)} />;
          }
          const traits = nestedEntries(cat, e, {}).map((n) => n.entry);
          const sp = e as Extract<Entry, { kind: 'species' }>;
          return <ChoiceTile key={e.id} title={e.name} meta={`${sp.sizes.split(',').map((s) => s[0].toUpperCase() + s.slice(1)).join(' or ')} · Speed ${sp.speed} ft`}
            body={traits.map((t) => t.name).join(', ') || undefined} more={traits.length ? traits.map((t) => t.name + ': ' + t.desc).join('\n\n') : undefined}
            selected={id === e.id} onSelect={() => pick(e)} />;
        })}
      </div>
    </div>
  );
}

// A background or species choice, one ChoiceFlow step on the character that screen reads (spec §2).
export function OriginChoice({ cat, a, set, source, step, c }: ScreenProps & { source: 'bg' | 'sp'; step: ChoiceStep; c: Character }) {
  const id = source === 'bg' ? a.background : a.species;
  const e = id ? cat.byId.get(id) : undefined;
  const cls = classOf(cat, a.cls);
  if (!e) return null;
  const answers = source === 'bg' ? a.bgFlow : a.spFlow;
  const onAnswers = (u: (cur: FlowAnswers) => FlowAnswers) => set((x) => (source === 'bg' ? { ...x, bgFlow: u(x.bgFlow) } : { ...x, spFlow: u(x.spFlow) }));
  return (
    <Sheet.Provider value={ctxOf(c)}>
      <ChoiceFlow entry={e} cat={cat} at={choiceKey(step)} answers={answers} onAnswers={onAnswers} onDone={() => {}} onCancel={() => {}}
        skipChoices={['abil']} noCounts noLinks noEquip {...(cls ? { ctx: { castAb: cls.castAb, className: cls.name } } : {})} />
    </Sheet.Provider>
  );
}

export function Languages({ cat, a, set }: ScreenProps) {
  const langs = entriesOf(cat, 'prof').filter((p) => p.cat === 'language' && p.name !== 'Common');
  const need = Math.min(2, langs.length);
  const toggle = (n: string) => set((x) => ({ ...x, languages: x.languages.includes(n) ? x.languages.filter((s) => s !== n) : x.languages.length < need ? [...x.languages, n] : x.languages }));
  return (
    <div className="col gap-8">
      <h3 className="block-title">Languages</h3>
      <span className="small">You know Common. Choose {need} more · {a.languages.length} of {need} chosen</span>
      <div className="tile-grid">
        {langs.map((l) => <ChoiceTile key={l.id} title={l.name} selected={a.languages.includes(l.name)} onSelect={() => toggle(l.name)} />)}
      </div>
    </div>
  );
}

export function ClassSkills({ cat, a, set, r }: ScreenProps) {
  const cls = classOf(cat, a.cls);
  if (!cls) return null;
  const c = r.originFor.full;
  // Where an origin skill comes from: the species' traits, else the background.
  const fromOf = (k: string) => (c.grants.find((x) => x.kind === 'prof' && x.cat === 'skill' && x.target === k)?.srcKind === 'species' ? 'species' : 'background');
  const opts = poolOptions(cat, c, cls.skills.pool ?? 'skill:any', {});
  const own = a.skills.filter((k) => skillLevel(c, k).level < 1);
  const toggle = (k: string, held: boolean) => set((x) => ({ ...x, skills: x.skills.includes(k) ? x.skills.filter((s) => s !== k) : !held && own.length < cls.skills.pick ? [...x.skills, k] : x.skills }));
  return (
    <Sheet.Provider value={ctxOf(c)}>
      <div className="col gap-8">
        <h3 className="block-title">{cls.name} skills</h3>
        <span className="small">Choose {cls.skills.pick} · {own.length} of {cls.skills.pick} chosen</span>
        <div className="tile-grid">
          {opts.map((o) => {
            const held = skillLevel(c, o.value).level >= 1;
            // A skill the origin now gives can still be dropped (after a background change), never picked.
            return <ChoiceTile key={o.value} title={o.label} meta={held ? 'From your ' + fromOf(o.value) : undefined} selected={a.skills.includes(o.value)}
              held={held} picked={a.skills.includes(o.value)} onSelect={() => toggle(o.value, held)} />;
          })}
        </div>
      </div>
    </Sheet.Provider>
  );
}

// Ability scores: Standard Array, Point Buy (27 points, PHB p.38) or Rolled (six totals of 4d6 drop the lowest). Each
// tile shows the base score and modifier, before the background bonus.
export function Scores({ cat, a, set }: ScreenProps) {
  const cls = classOf(cat, a.cls);
  const [dice, setDice] = useState<number[][]>(Array.from({ length: 6 }, () => [0, 0, 0, 0]));
  const [totals, setTotals] = useState('');
  const pool = scorePool(a);
  const spent = pointsSpent(a.scores);
  const diceFull = dice.every((d) => d.every((v) => v >= 1));
  const typed = (v: string) => {
    setTotals(v);
    const t = parseTotals(v);
    if (t) set((x) => applyRolled(x, t, cls));
  };
  const values = [...new Set(pool)].sort((x, y) => y - x);
  return (
    <div className="col gap-10">
      <h3 className="block-title">Ability scores</h3>
      <div className="tile-grid">
        {([['array', 'Standard Array', '15, 14, 13, 12, 10, 8 (PHB p.38)'], ['buy', 'Point Buy', '27 points (PHB p.38)'], ['rolled', 'Rolled', '4d6, drop the lowest, six times']] as const).map(([m, l, b]) => (
          <ChoiceTile key={m} title={l} body={b} selected={a.method === m} onSelect={() => a.method !== m && set((x) => setMethod(x, m, cls))} />
        ))}
      </div>
      {a.method === 'rolled' && (
        <div className="col gap-6">
          <span className="small">Type four dice for each set (the lowest is dropped), or the six totals.</span>
          {dice.map((d, i) => (
            <div key={i} className="row gap-4">
              {d.map((v, j) => <input key={j} type="text" inputMode="numeric" className="input input-num" aria-label={'Set ' + (i + 1) + ' die ' + (j + 1)} value={v || ''}
                onChange={(e) => { const n = Math.max(0, Math.min(6, Number(e.target.value) || 0)); setDice((ds) => ds.map((x, k) => (k === i ? x.map((y, l) => (l === j ? n : y)) : x))); }} />)}
              <span className="muted">= {dropLowest(d)}</span>
            </div>
          ))}
          <button type="button" className="btn" style={{ alignSelf: 'flex-start' }} aria-disabled={!diceFull} onClick={() => diceFull && set((x) => applyRolled(x, dice.map(dropLowest), cls))}>Use these sets</button>
          <label className="field">Six totals
            <input type="text" className="input" aria-label="Six totals" placeholder="15 14 13 12 10 8" value={totals} onChange={(e) => typed(e.target.value)} />
          </label>
          <span className="small" role={totals && !parseTotals(totals) ? 'status' : undefined}>Six totals from 3 to 18</span>
        </div>
      )}
      {a.method === 'buy' && <span style={{ color: spent > POINT_BUDGET ? 'var(--danger)' : undefined }}>Points: {spent} / {POINT_BUDGET}</span>}
      <span className="small">Base scores, before your background bonus</span>
      <div className="tile-grid">
        {ABILITIES.map(([k, label]) => {
          const v = a.scores[k];
          const shown = a.method === 'buy' ? v ?? 8 : assigned(a, k) ? v : undefined;
          return (
            <div key={k} className="tile">
              <div className="tile-static">
                <span className="tile-title">{label}</span>
                {a.method === 'buy' ? (
                  <div className="row gap-4" style={{ alignItems: 'center' }}>
                    <Step small label={'Lower ' + k.toUpperCase()} onClick={() => set((x) => ({ ...x, scores: { ...x.scores, [k]: Math.max(8, (x.scores[k] ?? 8) - 1) } }))}>−</Step>
                    <strong>{shown}</strong>
                    <Step small label={'Raise ' + k.toUpperCase()} onClick={() => set((x) => { const next = { ...x.scores, [k]: Math.min(15, (x.scores[k] ?? 8) + 1) }; return pointsSpent(next) > POINT_BUDGET ? x : { ...x, scores: next }; })}>+</Step>
                  </div>
                ) : (
                  <select className="input" aria-label={label + ' score'} value={shown === undefined ? '' : String(shown)} disabled={!pool.length}
                    onChange={(e) => e.target.value && set((x) => assignScore(x, k, Number(e.target.value)))}>
                    <option value="">—</option>
                    {values.map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                )}
                <span className="small">{shown === undefined ? 'Not assigned' : 'Modifier ' + mod(shown)} · before your background bonus</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// The background's ability bonus (PHB p.38): +2 and +1, or +1 to all three; final scores capped at 20. The final
// scores add the stored picks to the base scores here, never the preview's temporary +1s.
export function Bonus({ cat, a, set }: ScreenProps) {
  const bg = a.background ? cat.byId.get(a.background) : undefined;
  const ch = bg ? choicesOf(bg).find((x) => x.id === 'abil') : undefined;
  const picks = a.bgFlow['']?.picks.abil ?? [];
  const [local, setLocal] = useState<'two' | 'three' | null>(null);
  if (!bg || !ch) return null;
  const opts = (ch.options ?? []).filter((o) => o.ab);
  const mode = bonusMode(picks) ?? local;
  const plus = (ab: Ability) => picks.filter((p) => opts.find((o) => o.id === p)?.ab === ab).length;
  const cap = (ab: Ability) => opts.find((o) => o.ab === ab)?.cap ?? 20;
  const two = picks.find((x, i) => picks.indexOf(x) !== i), one = picks.find((x) => x !== two);
  return (
    <div className="col gap-10">
      <h3 className="block-title">Background bonus ({bg.name}: {opts.map((o) => o.ab!.toUpperCase()).join(', ')})</h3>
      <div className="tile-grid">
        <ChoiceTile title="+2 and +1" body="One score +2, another +1" selected={mode === 'two'} onSelect={() => { setLocal('two'); if (mode !== 'two') set((x) => setBonusMode(x, 'two', opts.map((o) => o.id))); }} />
        <ChoiceTile title="+1 to all three" body={opts.map((o) => abName(o.ab!)).join(', ')} selected={mode === 'three'} onSelect={() => { setLocal('three'); set((x) => setBonusMode(x, 'three', opts.map((o) => o.id))); }} />
      </div>
      {mode === 'two' && opts.map((o) => (
        <div key={o.id} className="row wrap gap-6" style={{ alignItems: 'center' }}>
          <span style={{ minWidth: 110 }}>{abName(o.ab!)}</span>
          <div className="tile-grid grow">
            <ChoiceTile title="+2" selected={two === o.id} onSelect={() => set((x) => setBonusPick(x, o.id, 2))} />
            <ChoiceTile title="+1" selected={one === o.id} onSelect={() => set((x) => setBonusPick(x, o.id, 1))} />
          </div>
        </div>
      ))}
      <span className="label">Final scores</span>
      <div className="row wrap gap-8">
        {ABILITIES.map(([k, label]) => {
          const base = a.scores[k];
          const v = base === undefined ? undefined : Math.min(Math.max(base, cap(k)), base + plus(k));
          return <span key={k} className="well col" style={{ minWidth: 100 }}><span className="small">{label}</span><strong>{v ?? '—'}</strong>{v !== undefined && <span className="small">{mod(v)}</span>}</span>;
        })}
      </div>
    </div>
  );
}

// The class's and the background's starting equipment, each Package A, its gold, or none (PHB p.36: you get both).
export function Equipment({ cat, a, set }: ScreenProps) {
  const cls = classOf(cat, a.cls);
  const bg = a.background ? cat.byId.get(a.background) : undefined;
  const groups: { title: string; src: ClassEntry | BackgroundEntry; cur?: 'A' | 'B' | 'none'; pick: (v: 'A' | 'B' | 'none') => void }[] = [];
  if (cls?.equipA !== undefined) groups.push({ title: cls.name + ' starting equipment', src: cls, cur: a.equip, pick: (v) => set((x) => ({ ...x, equip: v })) });
  if (bg?.kind === 'background' && bg.equipA !== undefined) groups.push({ title: bg.name + ' starting equipment', src: bg, cur: a.bgFlow['']?.equip,
    pick: (v) => set((x) => ({ ...x, bgFlow: { ...x.bgFlow, '': { ...(x.bgFlow[''] ?? { picks: {}, counted: {}, links: {} }), equip: v } } })) });
  return (
    <div className="col gap-10">
      <h3 className="block-title">Starting equipment</h3>
      {groups.length ? <span className="small">You get both: your class’s and your background’s (PHB p.36).</span> : <span className="muted">No starting equipment to choose.</span>}
      {groups.map((g) => (
        <div key={g.title} className="col gap-6" role="group" aria-label={g.title}>
          <span className="label">{g.title}</span>
          <div className="tile-grid">
            <ChoiceTile title="Package A" body={equipText(cat, g.src) + (g.src.gpA ? ` · ${g.src.gpA} GP` : '')} selected={g.cur === 'A'} onSelect={() => g.pick('A')} />
            <ChoiceTile title={`Gold only (${g.src.gpB ?? 0} GP)`} selected={g.cur === 'B'} onSelect={() => g.pick('B')} />
            <ChoiceTile title="None" body="Add no items or coins" selected={g.cur === 'none'} onSelect={() => g.pick('none')} />
          </div>
        </div>
      ))}
    </div>
  );
}

export function Details({ a, set }: ScreenProps) {
  const field = (k: keyof CreatorAnswers['details'], label: string, area = false) => (
    <label className="field">{label}
      {area ? <textarea className="input" value={a.details[k]} onChange={(e) => set((x) => ({ ...x, details: { ...x.details, [k]: e.target.value } }))} />
        : <input type="text" className="input" value={a.details[k]} onChange={(e) => set((x) => ({ ...x, details: { ...x.details, [k]: e.target.value } }))} />}
    </label>
  );
  return <div className="col gap-8"><h3 className="block-title">Details</h3>{field('name', 'Name')}{field('align', 'Alignment')}{field('appearance', 'Appearance', true)}{field('notes', 'Notes', true)}</div>;
}

// The character Create builds: name and class line, HP, AC, final scores, what each level added, items and coins.
export function Summary({ a, preview }: { a: CreatorAnswers; preview: Character | null }) {
  if (!preview) return <span className="muted">Pick a class first.</span>;
  const c = preview;
  const lists = { feature: c.feats, spell: c.spells, item: c.inv, sense: c.senses, defense: c.defenses, res: c.res, attack: c.attacks } as Record<string, { id: string; name: string }[]>;
  const nameOf = (ref: string) => { const i = ref.indexOf(':'); return lists[ref.slice(0, i)]?.find((e) => e.id === ref.slice(i + 1))?.name; };
  const coins = (['pp', 'gp', 'ep', 'sp', 'cp'] as const).filter((k) => c.coins[k]).map((k) => `${c.coins[k]} ${k.toUpperCase()}`).join(', ');
  return (
    <div className="col gap-6">
      <h3 className="block-title">{c.ch.name || 'Unnamed character'}</h3>
      <span>{[c.ch.species, classLine(c)].filter(Boolean).join(' · ')}</span>
      <span>HP {maxHpOf(c)} · AC {armorClass(c).total}</span>
      <div className="row wrap gap-8">
        {ABILITIES.map(([k, label]) => <span key={k} className="well col" style={{ minWidth: 100 }}><span className="small">{label}</span><strong>{effScore(c, k)}</strong><span className="small">{mod(effScore(c, k))}</span></span>)}
      </div>
      {c.levels.filter((l) => !l.base || l.added.length).map((l) => {
        const names = [...new Set(l.added.map(nameOf).filter((s): s is string => !!s))];
        return names.length ? <span key={l.n} className="small">Level {l.n}: {names.join(', ')}</span> : null;
      })}
      <span className="small">{c.inv.length} {c.inv.length === 1 ? 'item' : 'items'}{coins ? ' · ' + coins : ''}</span>
      {a.start > 1 && <span className="small">Starting above level 1: the Starting Equipment at Higher Levels table (PHB p.43) gives more gold and items; add them by hand.</span>}
    </div>
  );
}
