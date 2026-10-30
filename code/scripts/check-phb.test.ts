import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { addedLines, findPhrases, scanPushRanges } from './check-phb.ts';
import { normText } from './lib/text.ts';

// The phrases below are invented; no PHB text in the repo.
it('finds phrases ignoring case, line breaks, curly quotes and JSON escapes', () => {
  expect(findPhrases('The quick\n  brown FOX jumps', ['quick brown fox', 'lazy dog'])).toEqual(['quick brown fox']);
  expect(findPhrases('"desc": "the fox\\u2019s \\"den\\""', [normText('The fox’s “den”')])).toHaveLength(1);
});

it('reads added lines from ordinary and combined diffs, never the file headers', () => {
  const patch = ['commit aaa', 'Author: t <t@t>', '', '    message +++ not content', '', 'diff --cc a.txt', 'index 1,2..3', '--- a/a.txt', '+++ b/a.txt',
    '@@@ -1,1 -1,1 +1,2 @@@', '- old', ' -other', '++secret', '+-removed in one parent', '+++1 bonus', '  same', 'commit bbb', 'diff --git a/b.txt b/b.txt', '--- a/b.txt', '+++ b/b.txt',
    '@@ -1 +1 @@', '-gone', '++plus first'].join('\n');
  expect([...addedLines(patch)]).toEqual([['aaa', ['secret', '+1 bonus']], ['bbb', ['+plus first']]]);
});

describe('pushed commits', () => {
  const repo = () => {
    const dir = mkdtempSync(join(tmpdir(), 'phb-'));
    // -c settings keep the user's global git config (signing, hooks) out of the throwaway repo
    const git = (...a: string[]) => execFileSync('git', ['-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=/dev/null', ...a], { cwd: dir, encoding: 'utf8' }).trim();
    git('init', '-q', '-b', 'main'); git('config', 'user.email', 't@t'); git('config', 'user.name', 't');
    writeFileSync(join(dir, 'a.txt'), 'hello\n'); git('add', '.'); git('commit', '-qm', 'base');
    return { dir, git, base: git('rev-parse', 'HEAD') };
  };
  it('catches a phrase added in one pushed commit and removed in the next', () => {
    const { dir, git, base } = repo();
    writeFileSync(join(dir, 'a.txt'), 'hello\nsecret marker\nphrase\n'); git('commit', '-qam', 'add'); // wrapped over two lines
    writeFileSync(join(dir, 'a.txt'), 'hello\n'); git('commit', '-qam', 'remove');
    const head = git('rev-parse', 'HEAD');
    expect(scanPushRanges([`refs/heads/main ${head} refs/heads/main ${base}`], ['secret marker phrase'], dir)).not.toEqual([]);
    expect(scanPushRanges([`refs/heads/x ${'0'.repeat(40)} refs/heads/x ${head}`], ['secret marker phrase'], dir)).toEqual([]);
    // a remote sha this clone has never seen falls back to --not --remotes instead of failing
    expect(scanPushRanges([`refs/heads/main ${head} refs/heads/main ${'1'.repeat(40)}`], ['secret marker phrase'], dir)).not.toEqual([]);
  });
  it('catches a phrase written while resolving a merge conflict', () => {
    const { dir, git, base } = repo();
    git('checkout', '-qb', 'side'); writeFileSync(join(dir, 'a.txt'), 'side\n'); git('commit', '-qam', 'side');
    git('checkout', '-q', 'main'); writeFileSync(join(dir, 'a.txt'), 'main\n'); git('commit', '-qam', 'main');
    try { git('merge', '-q', 'side'); } catch { /* conflict expected */ }
    writeFileSync(join(dir, 'a.txt'), 'secret marker\nphrase\n+1 bonus\n'); git('add', '.'); git('commit', '-qm', 'merge');
    const merge = git('rev-parse', 'HEAD');
    expect(scanPushRanges([`refs/heads/main ${merge} refs/heads/main ${base}`], ['secret marker phrase'], dir)).not.toEqual([]);
    expect(scanPushRanges([`refs/heads/main ${merge} refs/heads/main ${git('rev-parse', 'HEAD^1')}`], ['secret marker phrase'], dir)).not.toEqual([]);
  });
});
