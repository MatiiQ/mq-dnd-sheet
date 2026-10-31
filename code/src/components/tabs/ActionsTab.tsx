import { useState, type ReactNode } from 'react';
import {
  attacksPerAction, extraDamage, extraText, featureActions, lightExtra, masterySlots, spellActions, unarmedStrike, weaponAttacks,
  type SpellAction, type WeaponAttack
} from '../../actions';
import { entriesOf, useCatalog } from '../../catalog/useCatalog';
import { isWeapon, putAway, putInHand, twoHanded, versatile, weaponKind, weaponsHeld } from '../../hands';
import { linkOf, sourceLabel } from '../../links';
import { castFree, castSpell, COMBAT_ACTIONS, fmt, freeCastsOf, removeRef, slotsLeft, spellUsable, toggleEffect, type AcPart } from '../../logic';
import { patchEntry, removeEntry, saveEntry, useEntryForm, useSheet } from '../../sheet';
import type { Attack, Character, Econ, Item, Rider, Spell } from '../../types';
import { AddButton, ChevronDown, DieBadge, EntryForm, EntryRow, Step, TextField } from '../ui';

const ECON: Record<Econ, string> = { action: 'Action', bonus: 'Bonus Action', reaction: 'Reaction', free: 'Free', other: 'Other' };
type Filter = 'all' | 'action' | 'bonus' | 'reaction';
const FILTERS: [Filter, string][] = [['all', 'All'], ['action', 'Action'], ['bonus', 'Bonus'], ['reaction', 'Reaction']];
const ORDINAL = ['Cantrip', '1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th'];
const USE_LABEL: Record<WeaponAttack['use'], string> = { melee: '', thrown: 'thrown', ranged: '', 'two-handed': 'two hands' };
const title = (s: string) => s.split(/[-\s]/).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
const propsText = (p: string) => p.split(',').filter(Boolean).map((x) => x.replace(/(^|-)([a-z])/g, (m) => m.toUpperCase())).join(', ');
const NO_SHIELD = 'Take off the Shield first';

const ATTACK_BLANK = { name: '', hit: '', dmg: '', info: '', mastery: '', econ: 'action' as Econ, group: 'other' as 'weapon' | 'other' };
const RIDER_BLANK = { name: '', dice: '' };
// A typed action's timing: an old one without econ counts as an Action (typed attacks were attacks).
const econOfAttack = (a: Attack): Econ => a.econ ?? 'action';

function EconTag({ econ }: { econ: Econ }) {
  return <span className={'econ-tag econ-' + econ}>{ECON[econ]}</span>;
}
function Parts({ label, parts }: { label: string; parts: AcPart[] }) {
  return <span className="muted">{label}: {parts.map((p) => p.label + ' ' + fmt(p.value)).join(' · ') || 'none'}</span>;
}
// One computed row: taps open its details; `side` holds its numbers and buttons, `extra` lines under it.
function ActRow({ name, sub, econ, side, body, extra }: { name: ReactNode; sub?: ReactNode; econ?: Econ; side?: ReactNode; body?: ReactNode; extra?: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="well entry">
      <div className="entry-row">
        <button type="button" className="entry-head" aria-expanded={open} onClick={() => setOpen(!open)}>
          <span className="row wrap gap-6" style={{ alignItems: 'baseline' }}><strong>{name}</strong>{econ && <EconTag econ={econ} />}</span>
          {sub && <span className="muted">{sub}</span>}
        </button>
        {side}
      </div>
      {extra && <div className="entry-extra">{extra}</div>}
      {open && body && <div className="entry-body">{body}</div>}
    </div>
  );
}
export function Section({ title, children, aside }: { title: string; children: ReactNode[]; aside?: ReactNode }) {
  const rows = children.filter(Boolean);
  // Hidden when the filter left no rows: its header lines (aside) alone don't make it show.
  if (!rows.length) return null;
  return (
    <section className="block col gap-6">
      <h3 className="block-title">{title}</h3>
      {aside}
      {rows}
    </section>
  );
}

export function ActionsTab() {
  const { c, update } = useSheet();
  const [filter, setFilter] = useState<Filter>('all');
  const [away, setAway] = useState<{ id: string; text: string } | null>(null);
  const [othersOpen, setOthersOpen] = useState(false);
  const [masteryOpen, setMasteryOpen] = useState(false);
  const [rulesWanted, setRulesWanted] = useState(false);
  const catState = useCatalog(masteryOpen || rulesWanted);
  const cat = catState.status === 'ready' ? catState.cat : null;
  const fa = useEntryForm('attack', ATTACK_BLANK, 'attack', 'Add an attack');
  const fr = useEntryForm('rider', RIDER_BLANK, 'extra damage', 'Add extra damage');
  const shows = (econ: Econ) => filter === 'all' || econ === filter;
  const act = (next: (p: Character) => Character) => { setAway(null); update(next); };

  // ---- hands ----
  const shieldOn = c.inv.some((i) => i.eq && i.armor === 'shield');
  const take = (it: Item, two = false) => {
    const r = putInHand(c, it.id, two);
    if (r.blocked) return;
    setAway(r.away.length ? { id: it.id, text: 'Put away: ' + r.away.join(', ') } : null);
    update(() => r.c);
  };
  const handButtons = (it: Item) => {
    const n = c.hands.filter((x) => x === it.id).length;
    const btn = (label: string, pressed: boolean, onClick: () => void, blocked = false, aria?: string) => (
      <button key={label} type="button" className="btn btn-sm hand-btn" aria-pressed={pressed} aria-disabled={blocked || undefined}
        aria-label={aria ?? label + ': ' + it.name} title={blocked ? NO_SHIELD : undefined} onClick={() => { if (!blocked) onClick(); }}>{label}</button>
    );
    const buttons = versatile(it) ? [
      btn('1 hand', n === 1, () => (n === 1 ? act((p) => putAway(p, it.id)) : take(it))),
      btn('2 hands', n === 2, () => (n === 2 ? act((p) => putAway(p, it.id)) : take(it, true)), shieldOn && n !== 2)
    ] : [
      btn('In hand', n > 0, () => (n > 0 ? act((p) => putAway(p, it.id)) : take(it)), twoHanded(it) && shieldOn && n === 0),
      ...(n === 1 && it.qty >= 2 && !twoHanded(it) ? [btn('Other hand too', false, () => take(it), false, 'Take a second ' + it.name + ' in the other hand')] : [])
    ];
    const blockedHint = shieldOn && (twoHanded(it) || versatile(it)) && n < 2;
    return (
      <div className="row wrap gap-6" role="group" aria-label={'Hands for ' + it.name}>
        {buttons}
        {blockedHint && <span className="small">{NO_SHIELD} to use it in two hands</span>}
        {!it.eq && <span className="small">Carried: taking it equips it</span>}
        {away?.id === it.id && <span role="status" className="small">{away.text}</span>}
      </div>
    );
  };
  const weaponRow = (it: Item, a: WeaponAttack, controls: boolean) => shows(a.econ) && (
    <ActRow key={it.id + a.use} econ={a.econ}
      name={a.name + (USE_LABEL[a.use] ? ' · ' + USE_LABEL[a.use] : '')}
      sub={[a.range, propsText(a.props), a.mastery && 'Mastery: ' + title(a.mastery)].filter(Boolean).join(' · ')}
      side={<div className="row wrap gap-10 act-nums">
        <span className="sr-only">To hit</span><DieBadge value={fmt(a.hit)} />
        <span className="sr-only">Damage</span><span className="act-dmg">{a.dmg} {a.dtype}</span>
      </div>}
      extra={controls ? handButtons(it) : undefined}
      body={<>
        <Parts label="To hit" parts={a.hitParts} />
        <Parts label="Damage" parts={a.dmgParts} />
        {it.desc && <span className="entry-desc">{it.desc}</span>}
      </>} />
  );

  // Weapon uses in hand: a Versatile weapon shows its one-handed or two-handed use as it is held.
  const heldIds = [...new Set(weaponsHeld(c).map((w) => w.id))];
  const heldRows = heldIds.flatMap((id) => {
    const it = c.inv.find((i) => i.id === id);
    if (!it) return [];
    const two = c.hands.filter((x) => x === id).length >= 2;
    const uses = weaponAttacks(c, it).filter((a) => (versatile(it) ? (a.use === 'two-handed') === two || a.use === 'thrown' : true));
    return uses.map((a, i) => weaponRow(it, a, i === 0));
  });
  const others = c.inv.filter((i) => isWeapon(i) && !c.hands.includes(i.id)).sort((a, b) => Number(b.eq) - Number(a.eq));
  const unarmed = unarmedStrike(c);
  const extra = lightExtra(c);
  const perAction = attacksPerAction(c);

  // ---- mastery ----
  const slots = masterySlots(c);
  const kindName = (kind: string) => c.inv.find((i) => isWeapon(i) && weaponKind(i) === kind)?.name
    ?? (cat ? entriesOf(cat, 'item').find((e) => e.id === 'item/' + kind)?.name : undefined) ?? title(kind);
  const kindMastery = (kind: string) => c.inv.find((i) => isWeapon(i) && weaponKind(i) === kind && i.mastery)?.mastery
    ?? (cat ? entriesOf(cat, 'item').find((e) => e.id === 'item/' + kind)?.mastery : undefined);
  const counted = c.mastery.slice(0, slots);
  const masteryLine = counted.map((k) => kindName(k) + (kindMastery(k) ? ' (' + title(kindMastery(k)!) + ')' : '')).join(', ');
  const options = [...new Set([
    ...(cat ? entriesOf(cat, 'item').filter((e) => e.cat === 'weapon' && e.mastery).map((e) => e.id.split('/').pop()!) : []),
    ...c.inv.filter((i) => isWeapon(i) && i.mastery).map(weaponKind), ...c.mastery
  ])].sort((a, b) => kindName(a).localeCompare(kindName(b)));
  const toggleMastery = (kind: string) => update((p) => ({ mastery: p.mastery.includes(kind) ? p.mastery.filter((k) => k !== kind) : [...p.mastery, kind] }));
  const masteryBox = (slots > 0 || c.mastery.length > 0) && (
    <div className="col gap-6">
      <div className="row wrap gap-8">
        <span className="muted grow">Mastery: {masteryLine || 'none chosen'}</span>
        <button type="button" className="btn btn-sm row gap-4" aria-expanded={masteryOpen} onClick={() => setMasteryOpen(!masteryOpen)}>
          Choose<ChevronDown size={12} style={{ transform: masteryOpen ? 'rotate(180deg)' : undefined }} />
        </button>
      </div>
      {masteryOpen && (
        <div className="col gap-6 dashed-box">
          <span className="muted">{Math.min(c.mastery.length, slots)} of {slots} chosen. Change these when you finish a Long Rest.</span>
          {catState.status === 'loading' && <span className="small">Loading the weapon list…</span>}
          <div className="row wrap gap-6" role="group" aria-label="Weapon mastery kinds">
            {options.map((k) => {
              const i = c.mastery.indexOf(k), on = i >= 0;
              return (
                <button key={k} type="button" className="filter-btn tall" aria-pressed={on} onClick={() => toggleMastery(k)}>
                  {kindName(k)}{kindMastery(k) ? ' (' + title(kindMastery(k)!) + ')' : ''}{on && i >= slots ? ' · not counting' : ''}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );

  // ---- manual actions ----
  const saveAttack = () => {
    const d = fa.draft, name = d.name.trim();
    if (!name) return;
    let hit = d.hit.trim();
    if (/^\d+$/.test(hit)) hit = '+' + hit;
    act((p) => ({ ...p, attacks: saveEntry<Attack>(p.attacks, { name, hit, dmg: d.dmg.trim(), info: d.info.trim(), mastery: d.mastery.trim(), econ: d.econ, group: d.group }, fa.editingId) }));
    fa.close();
  };
  const saveRider = () => {
    const name = fr.draft.name.trim();
    if (!name) return;
    update((p) => ({ riders: saveEntry<Rider>(p.riders, { name, dice: fr.draft.dice.trim() }, fr.editingId) }));
    fr.close();
  };
  const attackForm = fa.isOpen && (
    <EntryForm kind="attack" title={fa.title} saveLabel={fa.saveLabel} onSave={saveAttack} onCancel={fa.close}>
      <div className="grid">
        <TextField label="Name" value={fa.draft.name} placeholder="e.g. Dagger" onChange={(v) => fa.set({ name: v })} />
        <TextField label="To hit bonus" value={fa.draft.hit} placeholder="e.g. +7" onChange={(v) => fa.set({ hit: v })} />
        <TextField label="Damage" value={fa.draft.dmg} placeholder="e.g. 1d4 +4 Piercing" onChange={(v) => fa.set({ dmg: v })} />
        <TextField label="Range & properties" value={fa.draft.info} placeholder="e.g. 20/60 ft · Finesse, Light" onChange={(v) => fa.set({ info: v })} />
        <TextField label="Mastery (optional)" value={fa.draft.mastery} placeholder="e.g. Nick: extra Light attack" onChange={(v) => fa.set({ mastery: v })} />
        <label className="field">Timing
          <select className="input" value={fa.draft.econ} onChange={(e) => fa.set({ econ: e.target.value as Econ })}>
            {(Object.keys(ECON) as Econ[]).map((k) => <option key={k} value={k}>{ECON[k]}</option>)}
          </select>
        </label>
        <label className="field">Section
          <select className="input" value={fa.draft.group} onChange={(e) => fa.set({ group: e.target.value as 'weapon' | 'other' })}>
            <option value="weapon">Weapon attacks</option><option value="other">Other</option>
          </select>
        </label>
      </div>
    </EntryForm>
  );
  const manualRow = (a: Attack) => shows(econOfAttack(a)) && (fa.editingId === a.id ? <div key={a.id}>{attackForm}</div> : (
    <EntryRow key={a.id} name={a.name}
      head={<>
        <span className="row wrap gap-6" style={{ alignItems: 'baseline' }}><strong>{a.name}</strong><EconTag econ={econOfAttack(a)} /></span>
        {a.info && <span className="muted">{a.info}</span>}
        {a.mastery && <span className="muted"><strong style={{ color: 'var(--accent)' }}>Mastery</strong> · {a.mastery}</span>}
      </>}
      side={<div className="row wrap gap-10 act-nums">
        <span className="sr-only">To hit</span><DieBadge value={a.hit} />
        <span className="sr-only">Damage</span><span className="act-dmg">{a.dmg || '—'}</span>
      </div>}
      body={sourceLabel(c, a) ? <span className="muted">Source: {sourceLabel(c, a)}</span> : undefined}
      onEdit={() => fa.openEdit(a.id, { name: a.name, hit: a.hit || '', dmg: a.dmg || '', info: a.info || '', mastery: a.mastery || '', econ: econOfAttack(a), group: a.group ?? 'other' })}
      onRemove={() => act((p) => removeRef(p, { kind: 'attack', id: a.id }))} />
  ));

  // ---- spells ----
  const spellRow = (x: SpellAction) => {
    const sp = c.spells.find((s) => s.id === x.spellId)!;
    return shows(x.econ) && (
      <ActRow key={x.spellId} econ={x.econ} name={x.name}
        sub={[sp.lvl ? ORDINAL[sp.lvl] + ' level' : 'Cantrip', x.range, x.note].filter(Boolean).join(' · ')}
        side={<div className="row wrap gap-8 act-nums">
          {x.hit !== undefined && <><span className="sr-only">Spell attack</span><DieBadge value={fmt(x.hit)} /></>}
          {x.dc !== undefined && <span className="act-dc">DC {x.dc}{x.save ? ' ' + x.save.toUpperCase() : ''}</span>}
          {x.dice && <span className="act-dmg">{x.dice}{x.dtype ? ' ' + x.dtype : ''}</span>}
          <CastButtons sp={sp} effect={!!x.effect} />
        </div>}
        body={<>
          {sp.desc && <span className="entry-desc">{sp.desc}</span>}
          {x.upcast && <span className="muted">At higher levels: {x.upcast}</span>}
          {(sp.comp || sp.dur) && <span className="muted">{[sp.comp, sp.dur].filter(Boolean).join(' · ')}</span>}
          {x.source && <span className="muted">Source: {x.source}</span>}
        </>} />
    );
  };
  const spells = spellActions(c);

  // ---- features ----
  const features = featureActions(c).map((f) => {
    const r = f.resId ? c.res.find((x) => x.id === f.resId) : undefined;
    return shows(f.econ) && (
      <ActRow key={f.grantId} econ={f.econ} name={f.name} sub={[f.dice, f.note].filter(Boolean).join(' · ') || undefined}
        side={r && <div className="row gap-4">
          <Step label={'Use ' + r.name} onClick={() => update((p) => ({ res: patchEntry(p.res, r.id, (x) => ({ count: Math.max(0, x.count - 1) })) }))}>−</Step>
          <span style={{ fontWeight: 700, minWidth: 36, textAlign: 'center' }} aria-label={r.name + ' uses left'}>{r.count}</span>
          <Step label={'Restore ' + r.name} onClick={() => update((p) => ({ res: patchEntry(p.res, r.id, (x) => ({ count: x.count + 1 })) }))}>+</Step>
        </div>}
        body={(f.source || r) ? <>
          {f.source && <span className="muted">Source: {f.source}</span>}
          {r && <span className="muted">Uses {r.name}{r.note ? ' · ' + r.note : ''}</span>}
        </> : undefined} />
    );
  });

  // ---- combat actions ----
  const rules = cat ? entriesOf(cat, 'rule').filter((e) => e.cat === 'action') : [];
  const combat: [string, Econ][] = [...COMBAT_ACTIONS.map((n): [string, Econ] => [n, 'action']), ['Opportunity Attack', 'reaction']];

  return (
    <div className="col gap-12">
      <div role="group" aria-label="Show actions by timing" className="row wrap gap-6">
        {FILTERS.map(([k, label]) => <button key={k} type="button" className="filter-btn tall" aria-pressed={filter === k} onClick={() => setFilter(k)}>{label}</button>)}
      </div>

      <Section title="Weapon attacks" aside={<>
        {shows('action') && <span className="muted"><strong>Attack</strong> · {perAction} {perAction === 1 ? 'attack' : 'attacks'}</span>}
        {masteryBox}
      </>}>
        {[...heldRows,
          shows('action') && (
            <ActRow key="unarmed" econ="action" name="Unarmed Strike" sub={unarmed.range}
              side={<div className="row wrap gap-10 act-nums">
                <span className="sr-only">To hit</span><DieBadge value={fmt(unarmed.hit)} />
                <span className="act-dmg">{unarmed.dmg} {unarmed.dtype}</span>
              </div>}
              body={<>
                <Parts label="To hit" parts={unarmed.hitParts} />
                <Parts label="Damage" parts={unarmed.dmgParts} />
                <span className="muted">Grapple or Shove: the target makes a Strength or Dexterity save (its choice), DC {unarmed.dc}.</span>
              </>} />
          ),
          extra && shows(extra.econ) && (
            <ActRow key="light" econ={extra.econ} name={'Light extra attack · ' + extra.name} sub={extra.note}
              side={<div className="row wrap gap-10 act-nums">
                <span className="sr-only">To hit</span><DieBadge value={fmt(extra.hit)} />
                <span className="act-dmg">{extra.dmg} {extra.dtype}</span>
              </div>}
              body={<Parts label="Damage" parts={extra.dmgParts} />} />
          ),
          others.length > 0 && filter !== 'bonus' && filter !== 'reaction' && (
            <div key="others" className="col gap-6">
              <button type="button" className="btn btn-sm row gap-4" style={{ alignSelf: 'flex-start' }} aria-expanded={othersOpen} onClick={() => setOthersOpen(!othersOpen)}>
                Other weapons ({others.length})<ChevronDown size={12} style={{ transform: othersOpen ? 'rotate(180deg)' : undefined }} />
              </button>
              {othersOpen && others.map((it) => weaponRow(it, weaponAttacks(c, it)[0], true))}
            </div>
          ),
          ...c.attacks.filter((a) => a.group === 'weapon').map(manualRow)]}
      </Section>

      <Section title="Spells · damage">{spells.filter((x) => x.group === 'damage').map(spellRow)}</Section>
      <Section title="Spells · save">{spells.filter((x) => x.group === 'save').map(spellRow)}</Section>
      <Section title="Spells · healing">{spells.filter((x) => x.group === 'healing').map(spellRow)}</Section>
      <Section title="Other">{[...features, ...c.attacks.filter((a) => a.group !== 'weapon').map(manualRow)]}</Section>
      {!fa.isOpen && <AddButton onClick={fa.openAdd}>+ Add attack</AddButton>}
      {fa.isOpen && !fa.editingId && attackForm}

      <section className="block col gap-6">
        <h3 className="block-title">Extra damage on a hit</h3>
        {extraDamage(c).filter((x) => !x.manual).map((x) => (
          <ActRow key={x.key} name={x.name} sub={x.when || undefined} side={<strong className="act-dmg">+{extraText(x)}</strong>}
            body={x.source ? <span className="muted">Source: {x.source}</span> : undefined} />
        ))}
        {c.riders.map((r) => (fr.editingId === r.id ? <div key={r.id}>{riderForm(fr, saveRider)}</div> : (
          <EntryRow key={r.id} name={r.name} head={<span>{r.name}</span>} side={<strong style={{ marginRight: 4 }}>{r.dice}</strong>}
            onEdit={() => fr.openEdit(r.id, { name: r.name, dice: r.dice || '' })}
            onRemove={() => update((p) => ({ riders: removeEntry(p.riders, r.id) }))} />
        )))}
        {!fr.isOpen && <AddButton onClick={fr.openAdd}>+ Add extra damage</AddButton>}
        {fr.isOpen && !fr.editingId && riderForm(fr, saveRider)}
      </section>

      <Section title="Actions in combat">
        {combat.filter(([, e]) => shows(e)).map(([n, e]) => {
          const rule = rules.find((r) => r.name === n);
          return (
            <div key={n} onClickCapture={() => setRulesWanted(true)}>
              <ActRow name={n} econ={e} body={rule ? <span className="entry-desc">{rule.desc}</span>
                : <span className="small">{catState.status === 'error' ? 'The rules text couldn’t load.' : 'Loading the rules text…'}</span>} />
            </div>
          );
        })}
      </Section>
    </div>
  );
}

function riderForm(fr: ReturnType<typeof useEntryForm<typeof RIDER_BLANK>>, onSave: () => void) {
  return (
    <EntryForm kind="rider" inline title={fr.title} saveLabel={fr.saveLabel} onSave={onSave} onCancel={fr.close}>
      <div className="row wrap gap-6">
        <input type="text" className="input" style={{ flex: '2 1 180px', width: 180, padding: '0 10px' }} aria-label="Extra damage source"
          placeholder="Source, e.g. Sneak Attack" value={fr.draft.name} onChange={(e) => fr.set({ name: e.target.value })} />
        <input type="text" className="input" style={{ flex: '1 1 110px', width: 110, padding: '0 10px' }} aria-label="Extra damage dice"
          placeholder="Dice, e.g. +3d6" value={fr.draft.dice} onChange={(e) => fr.set({ dice: e.target.value })} />
      </div>
    </EntryForm>
  );
}

// A spell's Cast button (its lowest level with a slot left), its free casts, or an effect's On/Off switch, as in the
// Spells tab.
function CastButtons({ sp, effect }: { sp: Spell; effect: boolean }) {
  const { c, update } = useSheet();
  const link = linkOf('spell', sp.id);
  if (effect && !sp.c) {
    const on = c.effectsOn.includes(link);
    return (
      <button type="button" aria-pressed={on} aria-label={(on ? 'Switch off ' : 'Switch on ') + sp.name} className={'btn btn-sm toggle-btn' + (on ? ' on' : '')}
        onClick={() => update((p) => toggleEffect(p, link))}>{on ? 'On' : 'Off'}</button>
    );
  }
  const lvl = sp.lvl || 0;
  const first = lvl > 0 && spellUsable(c, sp) ? [lvl, 2, 3, 4, 5, 6, 7, 8, 9].filter((l) => l >= lvl).find((l) => c.slotMax[l] && slotsLeft(c, l) > 0) : undefined;
  return <>
    {freeCastsOf(c, sp.id).map((r) => {
      const used = r.count <= 0;
      return (
        <button key={r.id} type="button" aria-pressed={used} className={'btn btn-sm toggle-btn' + (used ? ' used' : '')}
          aria-label={used ? 'Free casts of ' + sp.name + ' (' + r.name + ') used up; tap to give one back' : 'Use a free cast of ' + sp.name + ' (' + r.name + '), ' + r.count + ' left'}
          onClick={() => update((p) => castFree(p, sp, r.id))}>{used ? 'Free used' : 'Free · ' + r.count}</button>
      );
    })}
    {first !== undefined && (
      <button type="button" className="btn btn-sm toggle-btn" aria-label={'Cast ' + sp.name + ' with a level ' + first + ' slot, ' + slotsLeft(c, first) + ' left'}
        onClick={() => update((p) => castSpell(p, sp, first))}>Cast {ORDINAL[first]}</button>
    )}
  </>;
}
