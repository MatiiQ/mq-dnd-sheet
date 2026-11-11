import { useEffect, useRef, useState, type CSSProperties, type InputHTMLAttributes, type ReactNode } from 'react';
import { DAMAGE_TYPES } from '../catalog/schema';
import { effectCanTargetOther, inactiveReason } from '../links';
import { acCanTargetOther, castFree, castFromItem, castFromScroll, refundFree, castLevelOf, clamp, fmt, freeCastsOf, itemOfSpell, ORDINAL, scrollOf, toggleAcTarget, toggleEffect, type AcPart } from '../logic';
import { useSheet } from '../sheet';
import { revealOf } from './nav';
import type { Character, Resource, Spell } from '../types';

// ---------- icons (stroke SVG, colored by currentColor) ----------
interface IconProps { size?: number; style?: CSSProperties }
function Svg({ size = 16, strokeWidth = 2, fill = 'none', style, children }: IconProps & { strokeWidth?: number; fill?: string; children: ReactNode }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke="currentColor"
      strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" style={style}>
      {children}
    </svg>
  );
}
export const XIcon = (p: IconProps & { strokeWidth?: number }) => <Svg {...p}><path d="M6 6l12 12M18 6L6 18" /></Svg>;
export const PencilIcon = (p: IconProps) => <Svg {...p}><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></Svg>;
export const CheckIcon = (p: IconProps) => <Svg strokeWidth={2.5} {...p}><path d="M5 12l5 5L20 7" /></Svg>;
export const StarIcon = (p: IconProps & { fill?: string }) => <Svg strokeWidth={1.5} fill="currentColor" {...p}><path d="M12 2l2.9 6.6 7.1.7-5.4 4.8 1.6 7-6.2-3.7-6.2 3.7 1.6-7L2 9.3l7.1-.7z" /></Svg>;
export const MenuIcon = (p: IconProps) => <Svg strokeWidth={2.2} {...p}><path d="M4 7h16M4 12h16M4 17h16" /></Svg>;
export const ChevronDown = (p: IconProps) => <Svg strokeWidth={2.5} {...p}><path d="M6 9l6 6 6-6" /></Svg>;
export const ChevronRight = (p: IconProps) => <Svg strokeWidth={2.5} {...p}><path d="M9 6l6 6-6 6" /></Svg>;
// A disclosure button's arrow: points up while its panel is open.
export const Caret = ({ open }: { open: boolean }) => <ChevronDown size={12} style={{ transform: open ? 'rotate(180deg)' : undefined }} />;

// ---------- double-tap to confirm: first tap arms for 3 s, second tap acts ----------
export function useArmed(ms = 3000) {
  const [armed, setArmed] = useState(false);
  const t = useRef<number | undefined>(undefined);
  useEffect(() => () => clearTimeout(t.current), []);
  const tap = (act: () => void) => {
    clearTimeout(t.current);
    if (armed) { setArmed(false); act(); return; }
    setArmed(true);
    t.current = window.setTimeout(() => setArmed(false), ms);
  };
  return [armed, tap] as const;
}

// confirm: shown while armed, e.g. what else a removal takes with it (removalSummary).
export function RemoveButton({ name, onRemove, confirm }: { name: string; onRemove: () => void; confirm?: ReactNode }) {
  const [armed, tap] = useArmed(confirm ? 6000 : 3000);
  return (
    <span className="remove-wrap">
      <button type="button" className={armed ? 'remove-armed' : 'icon-btn faint'} onClick={() => tap(onRemove)}
        aria-label={armed ? 'Tap again to remove ' + name : 'Remove ' + name}>
        {armed ? 'Remove?' : <XIcon />}
      </button>
      {armed && confirm && <span role="status" className="remove-confirm">{confirm}</span>}
    </span>
  );
}

export function EntryActions({ name, onEdit, onRemove, confirm }: { name: string; onEdit?: () => void; onRemove: () => void; confirm?: ReactNode }) {
  return (
    <div className="row">
      {onEdit && <button type="button" className="icon-btn" aria-label={'Edit ' + name} onClick={onEdit}><PencilIcon /></button>}
      <RemoveButton name={name} onRemove={onRemove} confirm={confirm} />
    </div>
  );
}

// ---------- list entry that expands on tap ----------
// Tapping the head shows the body plus Edit / Remove, so entries change without Edit mode. In Edit mode the
// buttons stay in the row, as before, and never repeat in the body. `before` and `side` sit outside the tap target;
// `children` always show under the row (Edit-mode controls, warnings).
// id: the element id, so a newly added entry can be scrolled into view.
export function EntryRow({ name, before, head, side, body, onEdit, onRemove, removeConfirm, className = '', children, id }: {
  name: string; before?: ReactNode; head: ReactNode; side?: ReactNode; body?: ReactNode;
  onEdit?: () => void; onRemove: () => void; removeConfirm?: ReactNode; className?: string; children?: ReactNode; id?: string;
}) {
  const { edit, focus, markFocusUsed } = useSheet();
  const [open, setOpen] = useState(false);
  // A shortcut revealed this row: open it once, then scroll it into view after that render.
  useEffect(() => {
    if (!id || !focus || focus.id !== id || focus.used) return;
    setOpen(true);
    markFocusUsed(focus.n);
    setTimeout(() => document.getElementById(id)?.scrollIntoView?.({ block: 'center', behavior: 'smooth' }), 0);
  }, [focus?.n]);
  return (
    <div id={id} className={'well entry ' + className}>
      <div className="entry-row">
        {before}
        <button type="button" className="entry-head" aria-expanded={open} onClick={() => setOpen(!open)}>{head}</button>
        {side}
        {edit && <EntryActions name={name} onEdit={onEdit} onRemove={onRemove} confirm={removeConfirm} />}
      </div>
      {children && <div className="entry-extra">{children}</div>}
      {open && (body || !edit) && (
        <div className="entry-body">
          {body}
          {!edit && <EntryActions name={name} onEdit={onEdit} onRemove={onRemove} confirm={removeConfirm} />}
        </div>
      )}
    </div>
  );
}

// ---------- counters ----------
export function Step({ label, onClick, children, small }: { label: string; onClick: () => void; children: ReactNode; small?: boolean }) {
  return <button type="button" className={small ? 'step step-sm' : 'step'} aria-label={label} onClick={onClick}>{children}</button>;
}

const nextUsed = (used: number, i: number) => (i < used ? i : i + 1);

// Circles where the first `used` are spent; tapping spends or restores up to that circle.
export function UsePips({ used, max, color, size, noun, onChange, width = 44 }: { used: number; max: number; color: string; size: number; noun: string; onChange: (n: number) => void; width?: number }) {
  return (
    <>
      {Array.from({ length: max }, (_, i) => {
        const avail = i >= used;
        return (
          <button key={i} type="button" className="pip-btn" style={{ width }} onClick={() => onChange(nextUsed(used, i))}
            aria-label={(avail ? 'Use ' : 'Restore ') + noun + ' ' + (i + 1)}>
            <span aria-hidden="true" className="pip" style={{ width: size, height: size, borderColor: color, background: avail ? color : 'transparent' }} />
          </button>
        );
      })}
    </>
  );
}

// Three marks (death saves): the first `n` are filled.
export function MarkPips({ n, color, noun, onChange }: { n: number; color: string; noun: string; onChange: (n: number) => void }) {
  return (
    <>
      {[0, 1, 2].map((i) => (
        <button key={i} type="button" className="pip-btn" onClick={() => onChange(nextUsed(n, i))}
          aria-label={(i < n ? 'Clear ' : 'Mark ') + noun + ' ' + (i + 1)}>
          <span aria-hidden="true" className="pip" style={{ width: 18, height: 18, borderColor: color, background: i < n ? color : 'transparent' }} />
        </button>
      ))}
    </>
  );
}

// Ivory d20 badge for an attack bonus, spell attack or save DC. Free text longer than 3 characters becomes a pill.
export function DieBadge({ value }: { value: string }) {
  const long = value.length > 3;
  return <span className={'die' + (long ? ' long' : '')}>{value || '—'}</span>;
}

export const ProfDot = ({ level }: { level: number }) => <span aria-hidden="true" className={'dot dot-' + level} />;

// A number's parts as tiles. bareFirst: the first part is a plain number (a base); the rest are signed.
// A tile with a source names it; a source still on the sheet makes the tile a button that opens it.
export function PartTiles({ parts, bareFirst = true, style }: { parts: AcPart[]; bareFirst?: boolean; style?: CSSProperties }) {
  const { c, reveal } = useSheet();
  return (
    <div className="grid speed-grid" style={style}>
      {parts.map((p, i) => {
        const cls = 'tile' + (p.active ? ' active' : ''), to = revealOf(c, p.from);
        const inner = <>
          <span className="muted">{p.label}</span>
          <span className="speed-value">{bareFirst && i === 0 ? p.value : fmt(p.value)}</span>
          {p.note && <span className="muted">{p.note}</span>}
          {p.src && <span className={to ? 'small go-text' : 'small'}>from {p.src}</span>}
        </>;
        return to
          ? <button key={i} type="button" className={cls + ' tile-btn'} onClick={() => reveal(to)}>{inner}</button>
          : <div key={i} className={cls}>{inner}</div>;
      })}
    </div>
  );
}

// The On/Off switch of a source's effect (Shillelagh, Rage).
export function EffectSwitch({ link, name }: { link: string; name: string }) {
  const { c, update } = useSheet();
  const on = c.effectsOn.includes(link);
  return (
    <button type="button" aria-pressed={on} aria-label={(on ? 'Switch off ' : 'Switch on ') + name} className={'btn btn-sm toggle-btn' + (on ? ' on' : '')}
      onClick={() => update((p) => toggleEffect(p, link))}>{on ? 'On' : 'Off'}</button>
  );
}

// Who an AC spell is cast on. Only "me" counts in this character's AC; a Self spell has no choice to make.
export function AcTargetSwitch({ sp }: { sp: Spell }) {
  const { c, update } = useSheet();
  const forAc = acCanTargetOther(sp);
  if (!forAc && !effectCanTargetOther(c, sp)) return null;
  const other = !!sp.acOther;
  // Two choices side by side, the current one pressed: a single "On: me" button read like an on/off switch.
  const pick = (want: boolean) => () => { if (want !== other) update((p) => toggleAcTarget(p, sp.id)); };
  return (
    <div role="group" aria-label={'Who ' + sp.name + ' is cast on'} className="row gap-4">
      <span className="small muted">Target</span>
      <button type="button" aria-pressed={!other} aria-label={'Cast ' + sp.name + ' on me'} className={'btn btn-sm toggle-btn' + (other ? '' : ' on')} onClick={pick(false)}>Me</button>
      <button type="button" aria-pressed={other} aria-label={'Cast ' + sp.name + ' on another creature, so ' + (forAc ? 'it adds no AC' : 'it counts only for them')} className={'btn btn-sm toggle-btn' + (other ? ' on' : '')} onClick={pick(true)}>Other</button>
    </div>
  );
}

// Called after a cast that happened (never after a refused one), with the cast's slot level and the patch applied.
export type OnCast = (lvl: number, patch: Partial<Character>) => void;
// Applies a cast computed from the render's c (R36: never inside an update patch function, which runs lazily and
// twice in StrictMode); a refused cast (null) does nothing.
export function applyCast(update: (p: Partial<Character>) => void, r: Partial<Character> | null, lvl: number, onCast?: OnCast) {
  if (r === null) return;
  update(r);
  onCast?.(lvl, r);
}

// A resource that casts this spell. short: the narrow Actions row leaves out the word "left". off: why it can't be used
// now (an item spell whose item is off), shown disabled. At 0 uses a tap gives one back (refundFree), no cast.
export function FreeCastButton({ sp, r, short, off, onCast }: { sp: Spell; r: Resource; short?: boolean; off?: string | null; onCast?: OnCast }) {
  const { c, update } = useSheet();
  const used = r.count <= 0;
  return (
    <button type="button" aria-pressed={used} className={'btn btn-sm toggle-btn' + (used ? ' used' : '')} disabled={!!off}
      aria-label={(used ? 'Free casts of ' + sp.name + ' (' + r.name + ') used up; tap to give one back' : 'Use a free cast of ' + sp.name + ' (' + r.name + '), ' + r.count + ' left') + (off ? ' (' + off + ')' : '')}
      onClick={() => (used ? update((p) => refundFree(p, r.id)) : applyCast(update, castFree(c, sp, r.id), sp.lvl, onCast))}>{used ? 'Free used' : 'Free · ' + r.count + (short ? '' : ' left')}</button>
  );
}

// An item spell's casts, in place of slot buttons: one button per number of charges (each above the cost is one slot
// level higher), or one Cast for a spell cast at will; and the item's free casts. Disabled while the spell doesn't
// count (unequipped, unattuned, in a bag), never a tap that does nothing.
export function ItemCastButtons({ sp, short, onCast }: { sp: Spell; short?: boolean; onCast?: OnCast }) {
  const { c, update } = useSheet();
  const item = itemOfSpell(c, sp);
  if (!item) return null;
  const why = inactiveReason(c, sp), off = why ? ' (' + why + ')' : '', left = item.count ?? 0;
  // A Spell Scroll is read once (SRD 5.2.1, Spell Scroll).
  if (scrollOf(c, sp)) return (
    <button type="button" className="btn btn-sm toggle-btn" disabled={!!why || item.qty < 1}
      aria-label={'Read the scroll of ' + sp.name + ', ' + item.qty + ' left' + off}
      onClick={() => applyCast(update, castFromScroll(c, sp), sp.lvl, onCast)}>Read scroll</button>
  );
  const frees = freeCastsOf(c, sp.id);
  const amounts = sp.chg === undefined ? [] : Array.from({ length: (sp.chgMax ?? sp.chg) - sp.chg + 1 }, (_, i) => sp.chg! + i);
  return <>
    {frees.map((r) => <FreeCastButton key={r.id} sp={sp} r={r} short={short} off={why} onCast={onCast} />)}
    {amounts.map((n) => (
      <button key={n} type="button" className="btn btn-sm toggle-btn" disabled={!!why || left < n}
        aria-label={'Cast ' + sp.name + ' with ' + n + (n === 1 ? ' charge' : ' charges') + ' of ' + item.name + ', ' + left + ' left' + off}
        onClick={() => applyCast(update, castFromItem(c, sp, n), castLevelOf(sp, n), onCast)}>{n + (n === 1 ? ' charge' : ' charges') + ' · ' + ORDINAL[castLevelOf(sp, n)] + ' level'}</button>
    ))}
    {sp.chg === undefined && !frees.length && (
      <button type="button" className="btn btn-sm toggle-btn" disabled={!!why} aria-label={'Cast ' + sp.name + ' from ' + item.name + off}
        onClick={() => applyCast(update, castFromItem(c, sp, 0), castLevelOf(sp, 0), onCast)}>Cast</button>
    )}
  </>;
}

// ---------- number input: keeps the raw text while typing, commits valid numbers ----------
type NumInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'min' | 'max'> & {
  value: number; min: number; max: number; onCommit: (n: number) => void; initialDraft?: string | null;
  // Committed when the field is cleared, so a blank field never keeps a hidden number. Off by default.
  emptyValue?: number;
};
export function NumInput({ value, min, max, onCommit, initialDraft = null, emptyValue, onBlur, ...rest }: NumInputProps) {
  const [draft, setDraft] = useState<string | null>(initialDraft);
  return (
    <input type="text" inputMode="numeric" {...rest} value={draft ?? String(value)}
      onChange={(e) => {
        // Only a leading minus: parseInt would cut "5-3" to 5 while the field kept showing it.
        const t = e.target.value;
        const raw = (min < 0 && t.startsWith('-') ? '-' : '') + t.replace(/[^0-9]/g, '');
        setDraft(raw);
        const n = parseInt(raw, 10);
        if (!isNaN(n)) onCommit(clamp(n, min, max));
        else if (raw === '' && emptyValue !== undefined) onCommit(emptyValue);
      }}
      onBlur={(e) => { setDraft(null); onBlur?.(e); }} />
  );
}

// ---------- number typed in fresh: empty on focus, commits once on blur or Enter ----------
// For values where each keystroke would act on its own, e.g. typing 45 into max HP would first cut current HP to 4.
type TypeInProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'onFocus' | 'onBlur' | 'onKeyDown'> & { value: number; onCommit: (v: number) => void };
export function TypeInNumber({ value, onCommit, ...rest }: TypeInProps) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <input type="text" inputMode="numeric" {...rest} value={draft ?? String(value)} placeholder={String(value)}
      onFocus={() => setDraft('')}
      onChange={(e) => setDraft(e.target.value.replace(/[^0-9]/g, '').slice(0, 3))}
      onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
      onBlur={() => {
        const n = parseInt(draft ?? '', 10);
        if (!isNaN(n)) onCommit(n);
        setDraft(null);
      }} />
  );
}

// ---------- notice with a close button in its top right corner ----------
export function Notice({ className, label, onClose, children }: { className: string; label: string; onClose: () => void; children: ReactNode }) {
  return (
    <div role="status" className={'notice notice-close ' + className}>
      <span className="grow">{children}</span>
      <button type="button" className="icon-btn" aria-label={label} onClick={onClose}><XIcon /></button>
    </div>
  );
}

// ---------- add / edit form shell ----------
export function EntryForm({ kind, title, saveLabel, onSave, onCancel, inline, children }: {
  kind: string; title: string; saveLabel: string; onSave: () => void; onCancel: () => void; inline?: boolean; children: ReactNode;
}) {
  return (
    <div id={'form-' + kind} className={inline ? 'entry-form inline' : 'entry-form'}>
      <span className="label">{title}</span>
      {children}
      <div className="row gap-8">
        <button type="button" className="btn btn-primary" onClick={onSave}>{saveLabel}</button>
        <button type="button" className="btn" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

// Shows in Edit mode only, unless `always` (lists that add entries during play).
export function AddButton({ onClick, children, style, always }: { onClick: () => void; children: ReactNode; style?: CSSProperties; always?: boolean }) {
  const { edit } = useSheet();
  if (!edit && !always) return null;
  return <button type="button" className="btn btn-add" style={style} onClick={onClick}>{children}</button>;
}

// The damage types, plus a value typed before (an old or catalog one) so it stays selected.
export function DamageTypeField({ value, onChange, style }: { value: string; onChange: (v: string) => void; style?: CSSProperties }) {
  const types = ['', ...DAMAGE_TYPES, ...(value && !DAMAGE_TYPES.includes(value) ? [value] : [])];
  return (
    <label className="field" style={style}>Damage type
      <select className="input" value={value} onChange={(e) => onChange(e.target.value)}>
        {types.map((t) => <option key={t} value={t}>{t || '—'}</option>)}
      </select>
    </label>
  );
}

// list: the id of a <datalist> of suggestions.
export function TextField({ label, value, onChange, placeholder, style, list }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; style?: CSSProperties; list?: string }) {
  return (
    <label className="field" style={style}>{label}
      <input type="text" className="input" value={value} placeholder={placeholder} list={list} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

// ---------- creator and level-up tiles ----------

// The start of a text (lives in catalog/copy.ts, which may not import components).
export { firstSentence } from '../catalog/copy';

// One option as a tile: a select button (aria-pressed) and, beside it, a More button that opens the long text. No
// onSelect: a plain tile (the features screen). held: already on the sheet, struck through; a tap still reaches
// onSelect, whose togglePick only lets it come out. warn: an unmet prerequisite, still selectable.
export function ChoiceTile({ title, meta, body, more, count, selected, held, warn, picked, onSelect }: {
  title: string; meta?: ReactNode; body?: ReactNode; more?: ReactNode; count?: number; selected: boolean;
  held?: boolean; warn?: boolean; picked?: boolean; onSelect?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const inner = (
    <>
      <span className="tile-title">{title}{count && count > 1 ? ' ×' + count : ''}</span>
      {meta && <span className={warn ? 'small picker-warn' : 'small'}>{meta}</span>}
      {body && <span className="small tile-body">{body}</span>}
    </>
  );
  return (
    <div className={'tile' + (selected ? ' active' : '') + (held ? ' held' : '')}>
      {onSelect ? (
        <button type="button" className="tile-pick" aria-pressed={selected} aria-disabled={held || undefined} onClick={onSelect}
          aria-label={held ? title + (picked ? ', on your sheet, tap to remove' : ', already on your sheet') : undefined}>{inner}</button>
      ) : <div className="tile-static">{inner}</div>}
      {more && <button type="button" className="tile-more" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? 'Less' : 'More'}</button>}
      {more && open && <div className="small tile-long">{more}</div>}
    </div>
  );
}

export interface StepperStage { id: string; label: string; state: 'done' | 'current' | 'ahead'; enabled: boolean }
// The creator's stages as a wrapping row of numbered buttons, and the line naming where you are.
export function Stepper({ stages, line, onJump }: { stages: StepperStage[]; line: string; onJump: (id: string) => void }) {
  return (
    <nav className="col gap-6" aria-label="Steps">
      <div className="stepper">
        {stages.map((s, i) => (
          <button key={s.id} type="button" className={'stepper-btn ' + s.state} aria-disabled={!s.enabled || undefined}
            aria-current={s.state === 'current' ? 'step' : undefined}
            aria-label={s.label + (s.state === 'done' ? ', done' : s.state === 'current' ? ', current' : !s.enabled ? ', not available yet' : '')}
            onClick={() => { if (s.enabled) onJump(s.id); }}>
            {s.state === 'done' ? <CheckIcon /> : i + 1}
          </button>
        ))}
      </div>
      <span className="small">{line}</span>
    </nav>
  );
}
