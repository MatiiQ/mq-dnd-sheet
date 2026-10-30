// Text normalisation for the PHB check: phrases, tracked files and pushed patches are all compared in this form.
// JSON escapes decoded, curly quotes made straight (as normName does for names), lower case, whitespace collapsed.
export function normText(text: string): string {
  return text
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, h: string) => String.fromCharCode(parseInt(h, 16)))
    .replace(/\\(["\\/])/g, '$1').replace(/\\[nt]/g, ' ')
    .replace(/[’‘]/g, "'").replace(/[“”]/g, '"')
    .toLowerCase().replace(/\s+/g, ' ').trim();
}
