// Helpers for text extracted from the SRD PDF with pdftotext.

export interface Line { text: string; page: number }

export const unbalanced = (s: string) => (s.match(/\(/g) ?? []).length > (s.match(/\)/g) ?? []).length;

const FOOTER = 'System Reference Document 5.2.1';
// Lines with the page each one is on (a form feed starts a page), without the page footers: the running title and
// the page number next to it. A lone number elsewhere (a table cell) stays.
export function srdLines(text: string): Line[] {
  let page = 1;
  const raw = text.split('\n').map((l) => {
    page += (l.match(/\f/g) ?? []).length;
    // pdftotext drops the fraction's superscript in "1½ pints" (Glass Bottle); this one pattern only, so a real 11/2 stays.
    return { text: l.replace(/\f/g, '').trimEnd().replace(/\b11\/2 pints\b/g, '1½ pints').replace(/\u00ad/g, ''), page };
  });
  const near = (i: number) => [i - 2, i - 1, i + 1, i + 2].some((j) => raw[j]?.text.trim() === FOOTER);
  // A lone number that is the page's own number is its footer too, cut from its title by the column crop.
  return raw.filter((l, i) => l.text.trim() !== FOOTER && !(/^\d+$/.test(l.text.trim()) && (near(i) || Number(l.text.trim()) === l.page)));
}

const HEADINGS = /^(Using a Higher-Level Spell Slot|Cantrip Upgrade)\./;
// A run-in heading: up to six title-case words, then '. ' ("Darkvision. You have…", "Cloud’s Jaunt (Cloud Giant). As…").
export const RUN_IN = /^([A-Z(][\w’'()-]*(?: (?:[A-Z(][\w’'()-]*|of|the|and|a|an|with|without|between|into|in|on|for|to|from|by|at|or)){0,5})\. (.*)$/;
// Joins wrapped lines into paragraphs, one per line of the result. Blank lines end a paragraph unless it stops
// mid-sentence (a page or column break); a run-in heading after the end of a sentence starts a new one.
export function paragraphs(lines: string[]): string[] {
  const out: string[] = [];
  let cur = '', blank = false;
  const flush = () => { if (cur) out.push(cur); cur = ''; };
  for (const raw of lines) {
    const l = raw.trim();
    if (!l) { blank = true; continue; }
    if (cur && (HEADINGS.test(l) || ((blank || RUN_IN.test(l)) && /[.:!?”)]$/.test(cur)))) flush();
    blank = false;
    if (!cur) cur = l;
    else if (/[a-z]-$/.test(cur) && /^[a-z]/.test(l)) cur = cur.slice(0, -1) + l;
    else cur += ' ' + l;
  }
  flush();
  return out;
}

// The part of the text from the line `from` (exact, its occurrence after `after` if given) up to the line `to`.
// Earlier pages are kept as form feeds, so page numbers stay right.
export function section(text: string, from: string, to: string, after?: string): string {
  const lines = text.split('\n');
  const find = (s: string, k = 0) => lines.findIndex((l, i) => i >= k && l.replace(/\f/g, '').trim() === s);
  const a = find(from, after ? find(after) + 1 : 0), b = find(to, a + 1);
  if (a < 0 || b < 0) throw new Error(`section ${from} … ${to} not found`);
  return '\f'.repeat(lines.slice(0, a).join('\n').split('\f').length - 1) + lines.slice(a, b).join('\n');
}

// The lines of the -layout text from the first line matching `from` through the next line matching `to`.
export function layoutBetween(layout: string, from: RegExp, to: RegExp): string {
  const lines = layout.split('\n');
  const a = lines.findIndex((l) => from.test(l)), b = lines.findIndex((l, i) => i > a && to.test(l));
  if (a < 0 || b < 0) throw new Error(`layout ${from} … ${to} not found`);
  return lines.slice(a, b + 1).join('\n');
}

export const norm = (s: string) => s.replace(/​/g, '').replace(/\s+/g, ' ').trim();

// Drops fragments of full-width tables that the column crop cut into the prose: runs of short lines, each found in
// one of the tables' text (normalised). A lone match is prose. keep(i) protects a line (a heading) from the check.
export function dropFragments(lines: Line[], tables: string[], keep: (i: number) => boolean = () => false): Line[] {
  const cand = lines.map((l, i) => { const t = norm(l.text); return !!t && !keep(i) && t.length <= 45 && tables.some((tb) => tb.includes(t)); });
  const near = (i: number, d: number) => { for (let j = i + d; j >= 0 && j < lines.length; j += d) if (lines[j].text.trim()) return cand[j]; return false; };
  return lines.filter((_, i) => !(cand[i] && (near(i, -1) || near(i, 1))));
}
