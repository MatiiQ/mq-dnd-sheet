import { useEffect, useState } from 'react';
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
import { TABS, longRest, shortRest } from './logic';
import { Sheet, type FormState } from './sheet';
import { useCharacters } from './storage';

export default function App() {
  const store = useCharacters();
  const { c, update } = store;
  const [edit, setEdit] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [form, setForm] = useState<FormState>(null);
  const [activeSec, setActiveSec] = useState('sec-hp');
  const [hdPrompt, setHdPrompt] = useState(false);
  const wide = useWide();

  // After switching character: drop per-character UI state.
  const onSwitched = (editOn = false, keepMenu = false) => {
    setEdit(editOn);
    setForm(null);
    setHdPrompt(false);
    if (!keepMenu) { setMenuOpen(false); setActiveSec('sec-hp'); }
  };
  const onRest = (kind: 'short' | 'long') => {
    update(kind === 'long' ? longRest : shortRest);
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
    <Sheet.Provider value={{ c, update, edit, form, setForm }}>
      <div className={'sheet' + (wide ? ' wide' : '')}>
        <TopBar store={store} activeSec={activeSec} setActiveSec={setActiveSec} menuOpen={menuOpen} setMenuOpen={setMenuOpen}
          onToggleEdit={() => { setEdit(!edit); setForm(null); }} onSwitched={onSwitched} onRest={onRest} />
        <div className="sheet-body">
          <div className="sheet-left">
            {store.isExample && (
              <div className="notice notice-blue row gap-8">
                <span className="grow">Example character: changes reset when you open it again.</span>
                <button type="button" className="btn" onClick={() => { store.makeCopy(); onSwitched(); }}>Make my copy</button>
              </div>
            )}
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
