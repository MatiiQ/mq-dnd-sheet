import { useState } from 'react';
import type { RestEvent, RollAsk } from '../logic';
import { NumInput } from './ui';

const TITLES: Record<RestEvent, string> = { short: 'Short Rest', long: 'Long Rest', dawn: 'Dawn' };

// Before a rest or Dawn whose counters regain a die roll: one number per counter, then the rest runs with them.
export function RestPrompt({ event, asks, onDone, onCancel }: { event: RestEvent; asks: RollAsk[]; onDone: (rolls: Record<string, number>) => void; onCancel: () => void }) {
  const [rolls, setRolls] = useState<Record<string, number>>({});
  return (
    <section aria-label={TITLES[event] + ': roll regains'} className="block notice notice-blue col gap-8">
      <strong>{TITLES[event]}: roll first</strong>
      {asks.map((a) => (
        <label key={a.key} className="row gap-8">
          <span className="grow">Rolled {a.dice} for {a.name}</span>
          <NumInput className="input input-num" value={rolls[a.key] ?? 0} min={0} max={99} onCommit={(v) => setRolls((r) => ({ ...r, [a.key]: v }))} />
        </label>
      ))}
      <div className="row gap-8">
        <button type="button" className="btn" onClick={() => onDone(rolls)}>{TITLES[event]}</button>
        <button type="button" className="btn" onClick={onCancel}>Cancel</button>
      </div>
    </section>
  );
}
