import { matchId } from '../catalog/copy';
import { entriesOf, type Catalog } from '../catalog/merge';
import { useCatalog } from '../catalog/useCatalog';
import { CAST_NAMES, clamp, hasHistory, newId, setBaseRows, SIZES } from '../logic';
import { useSheet } from '../sheet';
import type { CastAbility, Character, ClassRow, Details, Die, Size } from '../types';
import { NumInput, RemoveButton, TextField, TypeInNumber, useArmed } from './ui';

type TextKey = keyof Details;
const TEXT_FIELDS: [string, TextKey][] = [['Name', 'name'], ['Species', 'species'], ['Alignment', 'align']];
const uniq = (xs: string[]) => [...new Set(xs)].sort((a, b) => a.localeCompare(b));
// Catalog names offered while typing: species and their lineage options.
function suggestions(cat: Catalog): Partial<Record<TextKey, string[]>> {
  return {
    species: uniq([...entriesOf(cat, 'species').map((e) => e.name), ...entriesOf(cat, 'trait').filter((t) => t.of && t.of.endsWith('-lineage')).map((t) => t.name)])
  };
}
// A row's typed class or subclass stores the catalog id it matches ('' for none); a new class matches the subclass
// again within it. Nothing else changes: this is not a levelling flow.
function withIds(cat: Catalog | null, r: ClassRow): ClassRow {
  if (!cat) return { ...r, clsId: '', subId: '' };
  const clsId = matchId(cat, 'class', r.name);
  return { ...r, clsId, subId: matchId(cat, 'subclass', r.sub, clsId) };
}
const rowLabel = (r: ClassRow, i: number) => r.name || 'class ' + (i + 1);

// The class rows: name, subclass and hit die always (a changed die moves the row between Hit Dice pools); while no
// level was gained through the app, the level too, Add class and remove (never the first row, the starting class).
function ClassRows({ cat }: { cat: Catalog | null }) {
  const { c, update } = useSheet();
  const hand = !hasHistory(c);
  const setRow = (id: string, f: (r: ClassRow) => ClassRow) => update((p) => ({ classes: p.classes.map((r) => (r.id === id ? f(r) : r)) }));
  const setRows = (f: (rows: ClassRow[]) => ClassRow[]) => update((p: Character) => setBaseRows(p, f(p.classes)));
  const classes = cat ? [...new Set(entriesOf(cat, 'class').map((e) => e.name))] : [];
  return (
    <div className="col gap-8">
      {c.classes.map((r, i) => (
        <div key={r.id} className="row wrap gap-8" style={{ alignItems: 'flex-end' }}>
          <label className="field">Class
            <input type="text" className="input" aria-label={'Class name, ' + rowLabel(r, i)} value={r.name} list={classes.length ? 'details-classes' : undefined}
              onChange={(e) => setRow(r.id, (x) => withIds(cat, { ...x, name: e.target.value }))} />
          </label>
          <label className="field">Subclass
            <input type="text" className="input" aria-label={'Subclass, ' + rowLabel(r, i)} value={r.sub}
              onChange={(e) => setRow(r.id, (x) => withIds(cat, { ...x, sub: e.target.value }))} />
          </label>
          {hand && (
            <label className="field">Level
              <TypeInNumber className="input input-num" aria-label={'Level, ' + rowLabel(r, i)} value={r.lvl}
                onCommit={(v) => setRows((rows) => rows.map((x) => (x.id === r.id ? { ...x, lvl: clamp(v, 1, 20) } : x)))} />
            </label>
          )}
          <label className="field">Hit die
            <select className="input" aria-label={'Hit die, ' + rowLabel(r, i)} value={String(r.hd)} onChange={(e) => setRow(r.id, (x) => ({ ...x, hd: Number(e.target.value) as Die }))}>
              <option value="6">d6</option><option value="8">d8</option><option value="10">d10</option><option value="12">d12</option>
            </select>
          </label>
          {hand && i > 0 && <RemoveButton name={'class ' + rowLabel(r, i)} onRemove={() => setRows((rows) => rows.filter((x) => x.id !== r.id))} />}
        </div>
      ))}
      {classes.length > 0 && <datalist id="details-classes">{classes.map((n) => <option key={n} value={n} />)}</datalist>}
      {hand && <button type="button" className="btn btn-add" style={{ alignSelf: 'flex-start', fontSize: 14, padding: '0 12px' }}
        onClick={() => setRows((rows) => [...rows, { id: newId(), name: '', clsId: '', sub: '', subId: '', lvl: 1, hd: 8, prep: 0 }])}>+ Add class</button>}
      {!hand && <span className="muted">Levels change through Level up and Undo level.</span>}
    </div>
  );
}

const NUM_FIELDS: [string, 'speedBase' | 'initMisc', number, number][] = [
  ['Base speed (ft)', 'speedBase', 0, 200], ['Initiative bonus (extra)', 'initMisc', -20, 20]
];

export function EditDetails({ onReset }: { onReset: () => void }) {
  const { c, update } = useSheet();
  const [resetArmed, tapReset] = useArmed();
  const state = useCatalog(true);
  const cat = state.status === 'ready' ? state.cat : null;
  const lists = cat ? suggestions(cat) : {};
  return (
    <section aria-label="Edit character" className="block edit-details">
      <div className="row wrap between gap-8">
        <h2 className="block-title">Editing character <span className="muted" style={{ fontFamily: 'var(--sans)', fontWeight: 400 }}>· changes save automatically</span></h2>
        <button type="button" className={'btn btn-danger' + (resetArmed ? ' armed' : '')} style={{ fontSize: 14, padding: '0 14px' }} onClick={() => tapReset(onReset)}>
          {resetArmed ? 'Tap again to clear everything' : 'Clear this character'}
        </button>
      </div>
      <ClassRows cat={cat} />
      <div className="grid">
        {TEXT_FIELDS.map(([label, key]) => (
          <TextField key={key} label={label} value={c.ch[key]} list={lists[key] ? 'details-' + key : undefined}
            onChange={(v) => update((p) => ({ ch: { ...p.ch, [key]: v } }))} />
        ))}
        {Object.entries(lists).map(([key, names]) => (
          <datalist key={key} id={'details-' + key}>{names.map((n) => <option key={n} value={n} />)}</datalist>
        ))}
        {NUM_FIELDS.map(([label, key, min, max]) => (
          <label key={key} className="field">{label}
            <NumInput className="input" value={c[key]} min={min} max={max}
              onCommit={(v) => update({ [key]: v })} />
          </label>
        ))}
        <label className="field">Spellcasting ability
          <select className="input" value={c.castAb} onChange={(e) => update({ castAb: e.target.value as CastAbility })}>
            {Object.entries(CAST_NAMES).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
          </select>
        </label>
        <label className="field">Size
          <select className="input" value={c.size} onChange={(e) => update({ size: e.target.value as Size })}>
            {SIZES.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
          </select>
        </label>
        <label className="check"><input type="checkbox" checked={c.carryUp} onChange={(e) => update({ carryUp: e.target.checked })} />Counts as one size larger for carrying</label>
      </div>
      <div className="muted">Max HP, ability scores, proficiencies and speeds are edited in their own blocks below; spell slots in the Spells tab. Pencil buttons edit existing entries.</div>
    </section>
  );
}
