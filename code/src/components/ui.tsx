import { useEffect, useRef, useState, type CSSProperties, type InputHTMLAttributes, type ReactNode } from 'react';
import { clamp } from '../logic';
import { useSheet } from '../sheet';

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
export const StarIcon = (p: IconProps) => <Svg strokeWidth={1.5} fill="currentColor" {...p}><path d="M12 2l2.9 6.6 7.1.7-5.4 4.8 1.6 7-6.2-3.7-6.2 3.7 1.6-7L2 9.3l7.1-.7z" /></Svg>;
export const MenuIcon = (p: IconProps) => <Svg strokeWidth={2.2} {...p}><path d="M4 7h16M4 12h16M4 17h16" /></Svg>;
export const ChevronDown = (p: IconProps) => <Svg strokeWidth={2.5} {...p}><path d="M6 9l6 6 6-6" /></Svg>;
export const ChevronRight = (p: IconProps) => <Svg strokeWidth={2.5} {...p}><path d="M9 6l6 6-6 6" /></Svg>;
export const ShieldIcon = (p: IconProps) => <Svg {...p}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></Svg>;
export const BoltIcon = (p: IconProps) => <Svg {...p}><path d="M13 2L4 14h7l-1 8 9-12h-7z" /></Svg>;
export const BootIcon = (p: IconProps) => <Svg {...p}><path d="M4 17c3 0 4-2 4-5s1-6 4-6 4 3 4 6 1 5 4 5" /><path d="M3 21h18" /></Svg>;
export const MedalIcon = (p: IconProps) => <Svg {...p}><circle cx="12" cy="8" r="5" /><path d="M8.5 12.5L7 22l5-3 5 3-1.5-9.5" /></Svg>;
export const EyeIcon = (p: IconProps) => <Svg {...p}><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></Svg>;

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

function RemoveButton({ name, onRemove }: { name: string; onRemove: () => void }) {
  const [armed, tap] = useArmed();
  return (
    <button type="button" className={armed ? 'remove-armed' : 'icon-btn faint'} onClick={() => tap(onRemove)}
      aria-label={armed ? 'Tap again to remove ' + name : 'Remove ' + name}>
      {armed ? 'Remove?' : <XIcon />}
    </button>
  );
}

export function EntryActions({ name, canEdit, onEdit, onRemove }: { name: string; canEdit: boolean; onEdit: () => void; onRemove: () => void }) {
  if (!canEdit) return null;
  return (
    <div className="row">
      <button type="button" className="icon-btn" aria-label={'Edit ' + name} onClick={onEdit}><PencilIcon /></button>
      <RemoveButton name={name} onRemove={onRemove} />
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

export const ProfDot = ({ level }: { level: number }) => <span aria-hidden="true" className={'dot dot-' + level} />;

// ---------- number input: keeps the raw text while typing, commits valid numbers ----------
type NumInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'min' | 'max'> & {
  value: number; min: number; max: number; onCommit: (n: number) => void; initialDraft?: string | null;
};
export function NumInput({ value, min, max, onCommit, initialDraft = null, onBlur, ...rest }: NumInputProps) {
  const [draft, setDraft] = useState<string | null>(initialDraft);
  return (
    <input type="text" inputMode="numeric" {...rest} value={draft ?? String(value)}
      onChange={(e) => {
        const raw = e.target.value.replace(min < 0 ? /[^0-9-]/g : /[^0-9]/g, '');
        setDraft(raw);
        const n = parseInt(raw, 10);
        if (!isNaN(n)) onCommit(clamp(n, min, max));
      }}
      onBlur={(e) => { setDraft(null); onBlur?.(e); }} />
  );
}

// ---------- add / edit form shell ----------
export function EntryForm({ kind, title, saveLabel, onSave, onCancel, inline, children }: {
  kind: string; title: string; saveLabel: string; onSave: () => void; onCancel: () => void; inline?: boolean; children: ReactNode;
}) {
  return (
    <div id={'form-' + kind} className={inline ? 'entry-form inline' : 'entry-form'}>
      <span className="caps">{title}</span>
      {children}
      <div className="row gap-8">
        <button type="button" className="btn btn-primary" onClick={onSave}>{saveLabel}</button>
        <button type="button" className="btn" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

export function AddButton({ onClick, children, style }: { onClick: () => void; children: ReactNode; style?: CSSProperties }) {
  const { edit } = useSheet();
  if (!edit) return null;
  return <button type="button" className="btn btn-add" style={style} onClick={onClick}>{children}</button>;
}

export function TextField({ label, value, onChange, placeholder, style }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; style?: CSSProperties }) {
  return (
    <label className="field" style={style}>{label}
      <input type="text" className="input" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}
