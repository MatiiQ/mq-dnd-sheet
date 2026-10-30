// Helpers for text extracted from the SRD PDF with pdftotext.

export interface Line { text: string; page: number }

const FOOTER = 'System Reference Document 5.2.1';
// Lines with the page each one is on (a form feed starts a page), without the page footers: the running title and
// the page number next to it. A lone number elsewhere (a table cell) stays.
export function srdLines(text: string): Line[] {
  let page = 1;
  const raw = text.split('\n').map((l) => {
    page += (l.match(/\f/g) ?? []).length;
    return { text: l.replace(/\f/g, '').trimEnd(), page };
  });
  const near = (i: number) => [i - 2, i - 1, i + 1, i + 2].some((j) => raw[j]?.text.trim() === FOOTER);
  return raw.filter((l, i) => l.text.trim() !== FOOTER && !(/^\d+$/.test(l.text.trim()) && near(i)));
}

const HEADINGS = /^(Using a Higher-Level Spell Slot|Cantrip Upgrade)\./;
// Joins wrapped lines into paragraphs, one per line of the result. Blank lines end a paragraph unless it stops
// mid-sentence (a page or column break), and a known run-in heading starts a new one.
export function paragraphs(lines: string[]): string[] {
  const out: string[] = [];
  let cur = '', blank = false;
  const flush = () => { if (cur) out.push(cur); cur = ''; };
  for (const raw of lines) {
    const l = raw.trim();
    if (!l) { blank = true; continue; }
    if (cur && (HEADINGS.test(l) || (blank && /[.:!?”)]$/.test(cur)))) flush();
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
