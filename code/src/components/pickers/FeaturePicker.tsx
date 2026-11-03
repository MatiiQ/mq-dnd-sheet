import { useState } from 'react';
import { classIdOf, featureCandidates, matchId, subclassIdOf, type FeatureType } from '../../catalog/copy';
import { entriesOf, type Catalog } from '../../catalog/merge';
import type { Entry, FeatEntry } from '../../catalog/schema';
import { useCatalog } from '../../catalog/useCatalog';
import { useSheet } from '../../sheet';
import type { Character } from '../../types';
import { ChoiceFlow } from './ChoiceFlow';
import { PickerResult } from './PickerResult';
import { firstNew, PickerFrame, scrollToEntry, usePickerFlow } from './usePicker';

const TYPES: [FeatureType, string][] = [['class', 'Class'], ['sub', 'Subclass'], ['feat', 'Feat'], ['species', 'Species'], ['background', 'Background'], ['other', 'Custom']];
const FEAT_CATS: [FeatEntry['cat'], string][] = [['origin', 'Origin'], ['general', 'General'], ['style', 'Fighting Style'], ['boon', 'Epic Boon']];

// Features by type: the character's class and subclass features, feats by category, species traits (or the whole
// species), backgrounds; Custom opens the hand form. Adding goes through ChoiceFlow and addFromCatalog.
export function FeaturePicker({ onClose, onCustom }: { onClose: () => void; onCustom: () => void }) {
  const state = useCatalog(true);
  const pf = usePickerFlow();
  return (
    <PickerFrame title="Add a feature or trait" state={state} msg={pf.msg} onClose={onClose}>
      {(cat) => <>
        {pf.flow && <ChoiceFlow entry={pf.flow.entry} cat={cat} onCancel={pf.cancel} onDone={(ans) => {
          const r = pf.finish(cat, ans);
          if (!r) return;
          const added = firstNew(r.before.feats, r.next.feats);
          onClose();
          if (added) scrollToEntry('feat-' + added.id);
        }} />}
        {/* Kept mounted while a flow is open, so Cancel returns to the same type, category and choices. */}
        <div hidden={!!pf.flow}><FeatureList cat={cat} onAdd={pf.start} onCustom={onCustom} /></div>
      </>}
    </PickerFrame>
  );
}

function FeatureList({ cat, onAdd, onCustom }: { cat: Catalog; onAdd: (e: Entry) => void; onCustom: () => void }) {
  const { c } = useSheet();
  const [type, setType] = useState<FeatureType | null>(null);
  const [featCat, setFeatCat] = useState<FeatEntry['cat']>('origin');
  // A class, subclass or species chosen here when the sheet's text matches none in the catalog.
  const [cls, setCls] = useState('');
  const [sub, setSub] = useState('');
  const [species, setSpecies] = useState('');
  const ownCls = classIdOf(cat, c), ownSub = subclassIdOf(cat, c), ownSpecies = matchId(cat, 'species', c.ch.species);
  const clsId = ownCls || cls;
  const speciesId = ownSpecies || species;
  const speciesName = cat.byId.get(speciesId)?.name ?? '';
  // The character as the lists see it: with the class, subclass or species chosen here.
  const seen: Character = { ...c, ch: { ...c.ch, clsId, subId: ownSub || sub, species: ownSpecies ? c.ch.species : speciesName } };
  const select = (label: string, value: string, set: (v: string) => void, options: { id: string; name: string }[]) => (
    <label className="field">{label}
      <select className="input" value={value} onChange={(e) => set(e.target.value)}>
        <option value="">Choose…</option>
        {options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
      </select>
    </label>
  );

  let head = null;
  if (type === 'class' && !ownCls) head = select('Class', cls, setCls, entriesOf(cat, 'class'));
  if (type === 'sub') head = <>
    {!ownCls && select('Class', cls, (v) => { setCls(v); setSub(''); }, entriesOf(cat, 'class'))}
    {!ownSub && clsId && select('Subclass', sub, setSub, entriesOf(cat, 'subclass').filter((s) => s.cls === clsId.split('/')[1]))}
  </>;
  if (type === 'species') head = <>
    {!ownSpecies && select('Species', species, setSpecies, entriesOf(cat, 'species'))}
    {speciesId && <button type="button" className="btn btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => onAdd(cat.byId.get(speciesId)!)}>Add the whole species ({speciesName})</button>}
  </>;
  if (type === 'feat') head = (
    <div role="group" aria-label="Feat category" className="row wrap gap-4">
      {FEAT_CATS.map(([k, label]) => <button key={k} type="button" className="filter-btn" aria-pressed={featCat === k} onClick={() => setFeatCat(k)}>{label}</button>)}
    </div>
  );
  const rows = type && type !== 'other' ? featureCandidates(cat, seen, type, type === 'feat' ? featCat : undefined) : [];
  return (
    <div className="col gap-8">
      <div role="group" aria-label="Kind of feature" className="row wrap gap-4">
        {TYPES.map(([k, label]) => (
          <button key={k} type="button" className="filter-btn" aria-pressed={type === k} onClick={() => (k === 'other' ? onCustom() : setType(k))}>{label}</button>
        ))}
      </div>
      {head}
      {type && rows.length === 0 && <span className="muted">Nothing to list yet.</span>}
      <div className="col gap-6 picker-results">
        {rows.map((r) => (
          <PickerResult key={r.entry.id} entry={r.entry} taken={r.taken} note={r.note} marked={!r.ok}
            disabled={type === 'feat' && r.taken} onAdd={() => onAdd(r.entry)} />
        ))}
      </div>
    </div>
  );
}
