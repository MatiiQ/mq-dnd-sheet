import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { setLayoutMode, useLayoutMode, useWide, type LayoutMode } from '../layout';
import { CONDITIONS, PILL_STATS, TABS, hpColor, pillView, resPill, setConc, setPill, type PillView } from '../logic';
import { useSheet } from '../sheet';
import { EXAMPLES, charInfo, charName, saveBackupFile, type CharacterStore } from '../storage';
import type { Tab } from '../types';
import { CheckIcon, ChevronDown, ChevronRight, MenuIcon, PencilIcon, StarIcon, XIcon, useArmed } from './ui';

const SECTION_LINKS = [['sec-hp', 'Hit Points'], ['sec-abilities', 'Abilities'], ['sec-senses', 'Senses'], ['sec-defenses', 'Defenses'], ['sec-conditions', 'Conditions']];
export const SECTION_IDS = [...SECTION_LINKS.map(([id]) => id), 'sec-tabs'];
const LAYOUTS: [LayoutMode, string][] = [['auto', 'Auto'], ['one', '1 column'], ['two', '2 columns']];

interface Props {
  store: CharacterStore;
  activeSec: string;
  setActiveSec: (id: string) => void;
  menuOpen: boolean;
  setMenuOpen: (open: boolean) => void;
  onToggleEdit: () => void;
  onSwitched: (editOn?: boolean, keepMenu?: boolean) => void;
  onRest: (kind: 'short' | 'long') => void;
}

export function TopBar({ store, activeSec, setActiveSec, menuOpen, setMenuOpen, onToggleEdit, onSwitched, onRest }: Props) {
  const { c, update, edit } = useSheet();
  const ch = c.ch;
  const initials = (ch.name || '?').split(/\s+/).filter((x) => x).slice(0, 2).map((x) => x.charAt(0).toUpperCase()).join('') || '?';
  const subtitle = [ch.species, [ch.cls, 'Lv ' + c.level].filter((x) => x).join(' ') + (ch.sub ? ' (' + ch.sub + ')' : ''), ch.align]
    .filter((x) => x && String(x).trim()).join(' · ');
  const condParts = CONDITIONS.filter((n) => c.conds[n]);
  if (c.exh > 0) condParts.push('Exhaustion ' + c.exh);
  const inTabs = activeSec === 'sec-tabs';
  // Two columns: the tabs sit beside the core, so the nav holds only tabs and a tap doesn't scroll the page.
  const wide = useWide();

  // A tab tap, from the nav or a pill: in two columns the tabs sit beside the core, so it scrolls the tab panel, not the page.
  const openTab = (t: Tab, e: MouseEvent) => {
    update({ tab: t });
    if (!wide) { setActiveSec('sec-tabs'); return; }
    e.preventDefault();
    document.getElementById('sec-tabs')?.scrollTo({ top: 0 });
  };

  // Edit mode: the slot whose picker is open. The picker never shows outside Edit mode.
  const [pickSlot, setPickSlot] = useState<number | null>(null);
  useEffect(() => { if (!edit) setPickSlot(null); }, [edit]);
  // Tapping the slot's current choice again empties the slot.
  const pick = (slot: number, key: string) => {
    update((p) => ({ pills: setPill(p.pills, slot, p.pills[slot] === key ? '' : key) }));
    setPickSlot(null);
  };

  // Publish the bar's height for sticky offsets and scroll margins; it grows when the chip row shows.
  const barRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = barRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => document.documentElement.style.setProperty('--topbar-h', el.offsetHeight + 'px'));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Fade the nav edges when there is more to scroll.
  const navRef = useRef<HTMLElement>(null);
  const [fade, setFade] = useState({ l: false, r: false });
  useEffect(() => {
    const el = navRef.current;
    if (!el) return;
    const sync = () => {
      const l = el.scrollLeft > 4, r = el.scrollLeft + el.clientWidth < el.scrollWidth - 4;
      setFade((p) => (p.l === l && p.r === r ? p : { l, r }));
    };
    sync();
    el.addEventListener('scroll', sync, { passive: true });
    window.addEventListener('resize', sync);
    return () => { el.removeEventListener('scroll', sync); window.removeEventListener('resize', sync); };
  }, []);

  return (
    <header ref={barRef} className="topbar">
      <div className="row gap-10">
        <div aria-hidden="true" className="avatar">{initials}</div>
        <div className="col grow">
          <h1 className="char-name">{charName(c)}</h1>
          <span className="small ellipsis">{subtitle}</span>
        </div>
        {c.pills.map((key, slot) => {
          const v = pillView(c, key);
          if (edit) {
            return (
              <button key={slot} type="button" className={'pill slot' + (v ? '' : ' empty')} onClick={() => setPickSlot(pickSlot === slot ? null : slot)}
                aria-expanded={pickSlot === slot} aria-controls="pill-picker" aria-label={'Slot ' + (slot + 1) + ': ' + (v ? pillName(v) : 'empty') + '. Change it.'}>
                {v ? <PillBody v={v} /> : '+ Pill'}
              </button>
            );
          }
          if (!v) return null;
          const t = v.target;
          if (t === 'insp') {
            return (
              <button key={slot} type="button" className="pill" onClick={() => update({ insp: !c.insp })} aria-pressed={c.insp} aria-label="Heroic Inspiration">
                <PillBody v={v} />
              </button>
            );
          }
          if ('tab' in t) {
            return (
              <a key={slot} href="#sec-tabs" className="pill" onClick={(e) => openTab(t.tab, e)}
                aria-label={pillSpoken(v) + ' Open ' + TABS.find(([x]) => x === t.tab)![1] + '.'}>
                <PillBody v={v} />
              </a>
            );
          }
          return (
            <a key={slot} href={'#' + t.sec} className="pill" aria-label={pillSpoken(v) + ' Jump to ' + SEC_NAMES[t.sec] + '.'}
              onClick={(e) => {
                // Two columns: Hit Points is always in view. Vitals has no nav entry and sits right above Hit Points.
                if (wide) { if (t.sec === 'sec-hp') e.preventDefault(); return; }
                setActiveSec(t.sec === 'sec-vitals' ? 'sec-hp' : t.sec);
              }}>
              <PillBody v={v} />
            </a>
          );
        })}
        <button type="button" className="bar-btn" onClick={() => setMenuOpen(!menuOpen)} aria-expanded={menuOpen} aria-controls="sheet-menu" aria-label="Menu: rests and characters" title="Rests and characters">
          <span aria-hidden="true" className={'bar-icon' + (menuOpen ? ' on-light' : '')}><MenuIcon /></span>
          <span aria-hidden="true">Rest · More</span>
        </button>
        <button type="button" className="bar-btn" style={{ minWidth: 44, marginRight: -4 }} onClick={onToggleEdit} aria-pressed={edit}
          aria-label={edit ? 'Done editing' : 'Edit character'} title={edit ? 'Done editing' : 'Edit character'}>
          <span aria-hidden="true" className={'bar-icon' + (edit ? ' on' : '')}>{edit ? <CheckIcon /> : <PencilIcon />}</span>
          <span aria-hidden="true">{edit ? 'Done' : 'Edit'}</span>
        </button>
      </div>

      {edit && pickSlot !== null && (
        <div id="pill-picker" className="pill-picker">
          <span className="label">Slot {pickSlot + 1}</span>
          <span className="small">Stats</span>
          <div className="row wrap gap-6">
            {PILL_STATS.map(([k, name]) => (
              <button key={k} type="button" aria-pressed={c.pills[pickSlot] === k} onClick={() => pick(pickSlot, k)}>{name}</button>
            ))}
          </div>
          {c.res.length > 0 && <span className="small">Resources</span>}
          {c.res.length > 0 && (
            <div className="row wrap gap-6">
              {c.res.map((r) => (
                <button key={r.id} type="button" aria-pressed={c.pills[pickSlot] === resPill(r.id)} onClick={() => pick(pickSlot, resPill(r.id))}>{r.name}</button>
              ))}
            </div>
          )}
        </div>
      )}

      {(c.conc || condParts.length > 0) && (
        <div className="row wrap gap-6" style={{ paddingTop: 4 }}>
          {c.conc && (
            <button type="button" className="status-chip" onClick={() => update(setConc(null))} aria-label={'End concentration on ' + c.conc.name}>
              Concentrating · {c.conc.name}<XIcon size={14} strokeWidth={2.5} />
            </button>
          )}
          {condParts.length > 0 && (
            <a href="#sec-conditions" className="cond-chip">{condParts.length > 2 ? condParts.length + ' conditions' : condParts.join(' · ')}</a>
          )}
        </div>
      )}

      {store.saveFailed && (
        <div role="alert" className="notice notice-dead" style={{ marginTop: 4 }}>
          Changes aren’t being saved: this device refused to store them. Export a backup from the menu now.
        </div>
      )}

      <div className="nav-wrap">
        <nav ref={navRef} className="nav" aria-label="Sheet sections">
          {!wide && SECTION_LINKS.map(([id, label]) => {
            const on = activeSec === id;
            return (
              <a key={id} href={'#' + id} aria-current={on ? 'location' : undefined} className={on ? 'on-screen' : undefined}
                onClick={() => setActiveSec(id)}><span>{label}</span></a>
            );
          })}
          {TABS.map(([t, label], i) => {
            const sel = c.tab === t;
            return (
              <a key={t} href="#sec-tabs" aria-current={sel ? 'page' : undefined}
                className={['tab', i === 0 && 'first-tab', sel && 'open', sel && (inTabs || wide) && 'on-screen'].filter(Boolean).join(' ')}
                onClick={(e) => openTab(t, e)}><span>{label}</span></a>
            );
          })}
        </nav>
        {fade.l && <span aria-hidden="true" className="fade-l" />}
        {fade.r && <span aria-hidden="true" className="fade-r"><ChevronRight size={14} /></span>}
      </div>

      {menuOpen && <Menu store={store} onClose={() => setMenuOpen(false)} onSwitched={onSwitched} onRest={onRest} />}
    </header>
  );
}

const SEC_NAMES = { 'sec-hp': 'Hit Points', 'sec-vitals': 'Vitals', 'sec-senses': 'Senses' };
const pillName = (v: PillView) => PILL_STATS.find(([k]) => k === v.key)?.[1] ?? v.label;
const pillSpoken = (v: PillView) => pillName(v) + ' ' + v.value + (v.max ? ' of ' + v.max : '') + '.';

// A pill's content. HP keeps its own look: coloured current, max, and temporary HP.
function PillBody({ v }: { v: PillView }) {
  const { c } = useSheet();
  if (v.key === 'hp') {
    return (
      <>
        HP <strong style={{ color: hpColor(c) }}>{c.hp}</strong><span style={{ color: 'var(--muted)' }}>/{c.maxHp}</span>
        {c.temp > 0 && <span style={{ color: 'var(--blue)', fontWeight: 600 }}>+{c.temp}</span>}
      </>
    );
  }
  if (v.key === 'insp') return <><span aria-hidden="true" className={'pill-star' + (c.insp ? ' on' : '')}><StarIcon size={16} fill={c.insp ? 'currentColor' : 'none'} /></span>{v.label}</>;
  return <><span className="pill-label">{v.label}</span> <strong>{v.value}</strong>{v.max && <span style={{ color: 'var(--muted)' }}>/{v.max}</span>}</>;
}

function Menu({ store, onClose, onSwitched, onRest }: { store: CharacterStore; onClose: () => void; onSwitched: (editOn?: boolean, keepMenu?: boolean) => void; onRest: (kind: 'short' | 'long') => void }) {
  const { c } = useSheet();
  const [delArmed, tapDelete] = useArmed();
  const [longArmed, tapLong] = useArmed();
  const [backupMsg, setBackupMsg] = useState<string | null>(null);
  const [choosing, setChoosing] = useState(false);
  // Starts open while an example is the open character, so its check mark shows.
  const [examplesOpen, setExamplesOpen] = useState(store.isExample);
  const layout = useLayoutMode();
  const fileRef = useRef<HTMLInputElement>(null);
  const name = c.ch.name || 'this character';

  const exportBackup = async (one: boolean) => {
    const msg = await (one ? saveBackupFile(store.exportOne(), charName(c)) : saveBackupFile(store.exportAll()));
    if (msg) setBackupMsg(msg);
  };

  const importBackup = async (file: File | undefined) => {
    if (!file) return;
    try {
      const { added, failed } = store.importAll(JSON.parse(await file.text()));
      onSwitched(false, true);
      setBackupMsg('Imported ' + added + (added === 1 ? ' character.' : ' characters.') +
        (failed ? ' ' + failed + ' could not be saved: storage is full.' : ''));
    } catch (e) {
      setBackupMsg(e instanceof Error && e.message.includes('backup') ? e.message : 'That file could not be read as a backup.');
    }
  };

  return (
    <>
      <button type="button" className="scrim" aria-label="Close menu" onClick={onClose} />
      <div id="sheet-menu" className="menu">
        <span className="label">Rests</span>
        <div className="row gap-8">
          <a href="#sec-hp" className="rest-btn" onClick={() => onRest('short')}>Short Rest</a>
          {/* Long Rest resets a lot and has no undo, so it takes two taps. Only the second one follows the link. */}
          <a href="#sec-hp" className={'rest-btn long' + (longArmed ? ' armed' : '')}
            onClick={(e) => { if (!longArmed) e.preventDefault(); tapLong(() => onRest('long')); }}>
            {longArmed ? 'Tap again to rest' : 'Long Rest'}
          </a>
        </div>

        <span className="label">Your characters</span>
        {!store.list.length && <span className="small">No characters yet.</span>}
        {store.list.map((x) => {
          const cur = x.id === store.charId;
          return (
            <button key={x.id} type="button" className="char-btn" aria-current={cur}
              onClick={() => { if (cur) { onClose(); return; } store.switchTo(x.id); onSwitched(); }}>
              <span className="col grow" style={{ textAlign: 'left', padding: '4px 0' }}>
                <span className="ellipsis">{x.name}</span>
                {x.info && <span className="small ellipsis" style={{ fontWeight: 500 }}>{x.info}</span>}
              </span>
              {cur && <CheckIcon />}
            </button>
          );
        })}
        <button type="button" className="menu-btn" style={{ color: 'var(--accent)' }} aria-expanded={choosing} aria-controls="new-choice"
          onClick={() => setChoosing(!choosing)}>+ New character</button>
        {choosing && (
          <div id="new-choice" className="new-choice">
            <button type="button" className="menu-btn plain" onClick={() => { store.newBlank(); onSwitched(true); }}>Blank sheet</button>
            <button type="button" className="menu-btn plain" onClick={() => { store.newSample(); onSwitched(); }}>Copy of Ilyra · Ranger 5</button>
            <button type="button" className="menu-btn plain" onClick={() => { store.newDruid(); onSwitched(); }}>Copy of Seren · Druid 12</button>
            <button type="button" className="menu-btn" onClick={() => setChoosing(false)}>Cancel</button>
          </div>
        )}
        {!store.isExample && (
          <>
            <button type="button" className="menu-btn plain"
              onClick={() => { store.duplicate(); onSwitched(); }}>Duplicate this character</button>
            <button type="button" className={'btn btn-danger' + (delArmed ? ' armed' : '')} style={{ textAlign: 'left', padding: '0 12px' }}
              onClick={() => tapDelete(() => { store.deleteCurrent(); onSwitched(); })}>
              {delArmed ? 'Tap again to delete ' + name : 'Delete this character'}
            </button>
          </>
        )}

        <button type="button" className="disclosure" aria-expanded={examplesOpen} aria-controls="example-list" onClick={() => setExamplesOpen(!examplesOpen)}>
          <span className="label">Example Characters</span><ChevronDown size={14} />
        </button>
        {examplesOpen && (
          <div id="example-list" className="col gap-8">
            {EXAMPLES.map(({ id, make }) => {
              const ex = make(), cur = id === store.charId;
              // Always reloads, even when it's the open one: that's how an example resets.
              return (
                <button key={id} type="button" className="char-btn" aria-current={cur} onClick={() => { store.switchTo(id); onSwitched(); }}>
                  <span className="col grow" style={{ textAlign: 'left', padding: '4px 0' }}>
                    <span className="ellipsis">{charName(ex)}</span>
                    <span className="small ellipsis" style={{ fontWeight: 500 }}>{charInfo(ex)}</span>
                  </span>
                  <span className="small">resets</span>
                  {cur && <CheckIcon />}
                </button>
              );
            })}
          </div>
        )}

        <span className="label">Layout</span>
        <div role="group" aria-label="Layout" className="seg">
          {LAYOUTS.map(([m, label]) => (
            <button key={m} type="button" aria-pressed={layout === m} onClick={() => setLayoutMode(m)}>{label}</button>
          ))}
        </div>

        <span className="label">Backup</span>
        <div className="row gap-8">
          <button type="button" className="btn grow" style={{ padding: '0 10px' }} onClick={() => exportBackup(true)}>Export this</button>
          <button type="button" className="btn grow" style={{ padding: '0 10px' }} onClick={() => exportBackup(false)}>Export all</button>
          <button type="button" className="btn grow" style={{ padding: '0 10px' }} onClick={() => fileRef.current?.click()}>Import</button>
          <input ref={fileRef} type="file" accept="application/json,.json" hidden
            onChange={(e) => { importBackup(e.target.files?.[0]); e.target.value = ''; }} />
        </div>
        <span className="small">{backupMsg ?? 'Characters live only on this device. Export a backup to Files or iCloud Drive now and then.'}</span>
      </div>
    </>
  );
}
