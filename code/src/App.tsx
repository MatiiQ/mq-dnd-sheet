import { useEffect, useState, type ReactNode } from 'react';
import { Abilities } from './components/Abilities';
import { Conditions } from './components/Conditions';
import { Defenses } from './components/Defenses';
import { EditDetails } from './components/EditDetails';
import { HitPoints } from './components/HitPoints';
import { Resources } from './components/Resources';
import { Senses } from './components/Senses';
import { SECTION_IDS, TopBar } from './components/TopBar';
import { Vitals } from './components/Vitals';
import { ActionsTab } from './components/tabs/ActionsTab';
import { FeaturesTab } from './components/tabs/FeaturesTab';
import { InventoryTab } from './components/tabs/InventoryTab';
import { NotesTab } from './components/tabs/NotesTab';
import { SpellsTab } from './components/tabs/SpellsTab';
import { useWide } from './layout';
import { RestPrompt } from './components/RestPrompt';
import { LevelUpWizard, UndoLevelPrompt } from './components/LevelUpWizard';
import { CreatorWizard } from './components/CreatorWizard';
import { Welcome } from './components/Welcome';
import { clearDraft, readDraft, type Draft } from './creator';
import { undoLevel } from './levelup';
import { TABS, dawn, longRest, restRolls, shortRest, type RestEvent, type RollAsk } from './logic';
import { revealPlace, type RevealTarget } from './components/nav';
import { formAfterTabChange, Sheet, type Focus, type FormState } from './sheet';
import { useCharacters, type CharacterStore } from './storage';
import type { Character } from './types';

export default function App() {
  const store = useCharacters();
  // Menu › Characters over an open sheet (UI only): the welcome screen with "Back to <name>".
  const [welcome, setWelcome] = useState(false);
  // The creator, full screen over either; from a draft or fresh.
  const [creating, setCreating] = useState<{ from?: Draft } | null>(null);
  // The creator's draft: read once on launch (a broken one is dropped with a notice); asked about before a new one.
  const [draftAsk, setDraftAsk] = useState<{ draft: Draft | null; notice?: string }>(() => readDraft());
  const openCreator = () => {
    const r = readDraft();
    if (r.draft) setDraftAsk(r);
    else setCreating({});
  };
  const draftUi = (
    <>
      {draftAsk.notice && (
        <div role="status" className="notice notice-blue row gap-8">
          <span className="grow">{draftAsk.notice}</span>
          <button type="button" className="btn" onClick={() => setDraftAsk((d) => ({ draft: d.draft }))}>OK</button>
        </div>
      )}
      {draftAsk.draft && (
        <div role="status" className="notice notice-blue row wrap gap-8">
          <span className="grow">Continue creating {draftAsk.draft.answers.details?.name || 'a character'} (step {draftAsk.draft.step + 1} of 6)?</span>
          <button type="button" className="btn" onClick={() => { setCreating({ from: draftAsk.draft! }); setDraftAsk({ draft: null }); }}>Continue</button>
          <button type="button" className="btn" onClick={() => { clearDraft(); setDraftAsk({ draft: null }); }}>Discard</button>
        </div>
      )}
    </>
  );
  const creator = creating && <CreatorWizard initial={creating.from} onClose={() => setCreating(null)}
    onCreate={(made) => { store.add(made); clearDraft(); setCreating(null); setWelcome(false); }} />;
  // Nothing open (no character of your own, no example open), or Menu › Characters: the welcome screen.
  if (!store.c || welcome) return (
    <>
      {creator}
      <Welcome store={store} draft={draftUi} onNew={openCreator} onImported={() => setWelcome(false)}
        onOpen={(id) => { store.switchTo(id); setWelcome(false); }} {...(store.c ? { onBack: () => setWelcome(false) } : {})} />
    </>
  );
  return (
    <>
      {creator}
      <SheetApp store={store as CharacterStore & { c: Character }} draftUi={draftUi} onCreate={openCreator} onCharacters={() => setWelcome(true)} />
    </>
  );
}

function SheetApp({ store, draftUi, onCreate, onCharacters }: { store: CharacterStore & { c: Character }; draftUi: ReactNode; onCreate: () => void; onCharacters: () => void }) {
  const { c, update } = store;
  const [edit, setEdit] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [form, setForm] = useState<FormState>(null);
  const [activeSec, setActiveSec] = useState('sec-hp');
  const [hdPrompt, setHdPrompt] = useState(false);
  // A full-screen wizard over the sheet (UI only, never saved).
  const [wizard, setWizard] = useState<'levelup' | null>(null);
  const [undoAsk, setUndoAsk] = useState(false);
  // A rest or Dawn waiting for die rolls (restRolls). UI state only, never saved.
  const [restAsk, setRestAsk] = useState<{ event: RestEvent; asks: RollAsk[] } | null>(null);
  // The row a shortcut opens (reveal). UI state only, never saved.
  const [focus, setFocus] = useState<Focus | null>(null);
  const wide = useWide();

  // A tab change the reveal did not make drops its focus.
  useEffect(() => {
    setForm(formAfterTabChange);
    setFocus((f) => (f && f.tab !== c.tab ? null : f));
  }, [c.tab]);

  // Switches tab (the row scrolls itself: no #sec-tabs scroll, two smooth scrolls in one tick race) or scrolls to the
  // section, then names the row to open.
  const reveal = (t: RevealTarget) => {
    const p = revealPlace(t);
    if (p.tab) update({ tab: p.tab });
    else if (p.sec) document.getElementById(p.sec)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setFocus((f) => ({ id: p.dom, n: (f?.n ?? 0) + 1, tab: p.tab, used: false }));
  };
  const markFocusUsed = (n: number) => setFocus((f) => (f && f.n === n ? { ...f, used: true } : f));

  // After switching character: drop per-character UI state.
  const onSwitched = (editOn = false, keepMenu = false) => {
    setEdit(editOn);
    setForm(null);
    setHdPrompt(false);
    setWizard(null);
    setUndoAsk(false);
    setRestAsk(null);
    setFocus(null);
    if (!keepMenu) { setMenuOpen(false); setActiveSec('sec-hp'); }
  };
  const runRest = (event: RestEvent, rolls?: Record<string, number>) => {
    update((p) => (event === 'long' ? longRest(p) : event === 'short' ? shortRest(p, rolls) : dawn(p, rolls)));
    setRestAsk(null);
  };
  // A counter that regains a die roll asks for the roll first; otherwise the rest runs at once.
  const onRest = (event: RestEvent) => {
    const asks = restRolls(c, event);
    if (asks.length) setRestAsk({ event, asks }); else runRest(event);
    setHdPrompt(false);
    setMenuOpen(false);
    setActiveSec('sec-hp');
  };

  // Highlight the section currently under the top bar. Not used in the two-column layout.
  useEffect(() => {
    if (wide) return;
    const visible: Record<string, boolean> = {};
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => { visible[e.target.id] = e.isIntersecting; });
      const first = SECTION_IDS.find((id) => visible[id]);
      if (first) setActiveSec(first);
    }, { rootMargin: '-140px 0px -55% 0px', threshold: 0 });
    SECTION_IDS.forEach((id) => { const el = document.getElementById(id); if (el) io.observe(el); });
    return () => io.disconnect();
  }, [wide]);

  // Two columns: HP sits above the tab in the right column, so it stays in view.
  const hitPoints = <HitPoints hdPrompt={hdPrompt} setHdPrompt={setHdPrompt} />;
  const tabTitle = TABS.find(([t]) => t === c.tab)![1];

  return (
    <Sheet.Provider value={{ c, update, edit, form, setForm, focus, reveal, markFocusUsed }}>
      {wizard === 'levelup' && <LevelUpWizard c={c} onApply={(next) => { update(() => next); setWizard(null); }} onClose={() => setWizard(null)} />}
      <div className={'sheet' + (wide ? ' wide' : '')}>
        <TopBar store={store} activeSec={activeSec} setActiveSec={setActiveSec} menuOpen={menuOpen} setMenuOpen={setMenuOpen}
          onToggleEdit={() => { setEdit(!edit); setForm(null); }} onSwitched={onSwitched} onRest={onRest}
          onLevelUp={() => setWizard('levelup')} onUndoLevel={() => setUndoAsk(true)} onCreate={onCreate} onCharacters={onCharacters} />
        <div className="sheet-body">
          <div className="sheet-left">
            {store.isExample && (
              <div className="notice notice-blue row gap-8">
                <span className="grow">Example character: changes reset when you open it again.</span>
                <button type="button" className="btn" onClick={() => { store.makeCopy(); onSwitched(); }}>Make my copy</button>
              </div>
            )}
            {draftUi}
            {undoAsk && <UndoLevelPrompt c={c} onConfirm={() => { update(undoLevel); setUndoAsk(false); }} onCancel={() => setUndoAsk(false)} />}
            {restAsk && <RestPrompt event={restAsk.event} asks={restAsk.asks} onDone={(r) => runRest(restAsk.event, r)} onCancel={() => setRestAsk(null)} />}
            {edit && <EditDetails onReset={() => { store.resetCurrent(); onSwitched(true); }} />}
            <Vitals />
            {!wide && hitPoints}
            <Abilities />
            <Senses />
            <Defenses />
            <Conditions />
            <Resources />
          </div>
          <div className="sheet-right">
            {wide && hitPoints}
            <section id="sec-tabs" aria-label={tabTitle} className="section col gap-12 tab-col">
              <h2 className="tab-title">{tabTitle}</h2>
              {c.tab === 'actions' && <ActionsTab />}
              {c.tab === 'spells' && <SpellsTab />}
              {c.tab === 'inventory' && <InventoryTab />}
              {c.tab === 'features' && <FeaturesTab />}
              {c.tab === 'notes' && <NotesTab />}
            </section>
          </div>
        </div>
      </div>
    </Sheet.Provider>
  );
}
