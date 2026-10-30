// Fails when PHB description text is about to be published: in the build (dist/), in the tracked files, or, as the
// pre-push hook, in any commit being pushed (text added and later removed still goes public in the history).
// Phrases come from reference/build/check-phrases.json (npm run pack), so this runs only where reference/ exists.
// Run from code/: npm run check-phb; the hook runs it with --pre-push and the push lines on stdin.
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { normText } from './lib/text.ts';

export function findPhrases(text: string, phrases: string[]): string[] {
  const t = normText(text);
  return phrases.filter((p) => t.includes(p));
}

// Added lines of `git log -p --cc` output, per commit. A hunk header's leading @ count minus one is the width of the
// line prefix ('@@ ' 1, '@@@ ' 2); a line is added when its prefix has a '+' and no '-'. Commit messages, diff and
// ---/+++ header lines are outside hunks and never content.
export function addedLines(patch: string): Map<string, string[]> {
  const out = new Map<string, string[]>();
  let sha = '', width = 0, inHunk = false;
  for (const line of patch.split('\n')) {
    if (line.startsWith('commit ')) { sha = line.split(' ')[1]; out.set(sha, []); inHunk = false; continue; }
    if (line.startsWith('diff --')) { inHunk = false; continue; }
    const h = /^(@{2,}) /.exec(line);
    if (h) { width = h[1].length - 1; inHunk = true; continue; }
    if (!inHunk) continue;
    const prefix = line.slice(0, width);
    if (prefix.includes('+') && !prefix.includes('-')) out.get(sha)?.push(line.slice(width));
  }
  return out;
}

const git = (args: string[], cwd: string) => execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 1 << 28 });
// Each pre-push stdin line: <local ref> <local sha> <remote ref> <remote sha>. Returns one message per phrase found.
export function scanPushRanges(lines: string[], phrases: string[], cwd: string): string[] {
  const zero = /^0+$/;
  const hits: string[] = [];
  for (const line of lines.filter((l) => l.trim())) {
    const [, local, , remote] = line.trim().split(/\s+/);
    if (zero.test(local)) continue; // deleting a remote branch publishes nothing
    let known = !zero.test(remote);
    if (known) { try { git(['cat-file', '-e', `${remote}^{commit}`], cwd); } catch { known = false; } }
    const range = known ? [`${remote}..${local}`] : [local, '--not', '--remotes'];
    const patch = git(['log', '-p', '--cc', '--no-color', '--no-ext-diff', ...range], cwd);
    // One commit at a time: a phrase must belong to one commit, so the message can name it.
    for (const [sha, added] of addedLines(patch)) for (const p of findPhrases(added.join(' '), phrases)) hits.push(`"${p}" added in commit ${sha.slice(0, 10)}`);
  }
  return hits;
}

function main(): number {
  const root = fileURLToPath(new URL('../../', import.meta.url));
  if (!existsSync(`${root}reference`)) { console.log('reference/ not found: this push is UNCHECKED for PHB text. Push only from the machine that holds reference/.'); return 0; }
  const phrasesFile = `${root}reference/build/check-phrases.json`;
  if (!existsSync(phrasesFile)) { console.error('reference/build/check-phrases.json is missing: run npm run pack in code/ first.'); return 1; }
  const phrases: string[] = JSON.parse(readFileSync(phrasesFile, 'utf8'));
  const hits: string[] = [];
  execFileSync('npm', ['run', 'build'], { cwd: `${root}code`, stdio: ['ignore', 'ignore', 'inherit'] });
  const walk = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? walk(`${dir}/${d.name}`) : [`${dir}/${d.name}`]));
  for (const f of walk(`${root}code/dist`)) for (const p of findPhrases(readFileSync(f, 'utf8'), phrases)) hits.push(`"${p}" in ${f.slice(root.length)}`);
  for (const f of git(['ls-files', '-z'], root).split('\0').filter(Boolean)) {
    if (existsSync(`${root}${f}`)) for (const p of findPhrases(readFileSync(`${root}${f}`, 'utf8'), phrases)) hits.push(`"${p}" in ${f}`);
  }
  if (process.argv.includes('--pre-push')) hits.push(...scanPushRanges(readFileSync(0, 'utf8').split('\n'), phrases, root));
  if (hits.length) { console.error(`PHB text found (${hits.length}):\n${hits.join('\n')}`); return 1; }
  console.log('No PHB text found.');
  return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exit(main());
