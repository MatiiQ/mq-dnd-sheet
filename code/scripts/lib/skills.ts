// Skill names → the app's skill keys (SKILLS in src/logic.ts, which Node can't import: its imports have no
// extension). src/catalog/data.test.ts checks every key used in the data against SKILLS.
export const SKILL_KEYS: Record<string, string> = {
  Athletics: 'athletics', Acrobatics: 'acrobatics', 'Sleight of Hand': 'sleight', Stealth: 'stealth',
  Arcana: 'arcana', History: 'history', Investigation: 'investigation', Nature: 'nature', Religion: 'religion',
  'Animal Handling': 'animal', Insight: 'insight', Medicine: 'medicine', Perception: 'perception', Survival: 'survival',
  Deception: 'deception', Intimidation: 'intimidation', Performance: 'performance', Persuasion: 'persuasion'
};
export function skillKey(name: string): string {
  const k = SKILL_KEYS[name.trim()];
  if (!k) throw new Error(`unknown skill ${JSON.stringify(name)}`);
  return k;
}
