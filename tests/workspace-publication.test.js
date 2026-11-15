import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { workspaceBlobSha, WORKSPACE_PATH } from '../src/layout/PublishedWorkspace.js';

test('a queued update may follow unrelated code but fails after a different layout publication', async () => {
  const cwd = mkdtempSync(resolve(tmpdir(), 'zetflix-layout-'));
  const git = (...args) =>
    execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const script = resolve('scripts/workspace-change.mjs');
  const check = (base, head) =>
    execFileSync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        'import { validateWorkspaceChange } from ' +
          JSON.stringify('file://' + script) +
          '; validateWorkspaceChange(process.argv[1], process.argv[2]);',
        base,
        head,
      ],
      { cwd, stdio: ['ignore', 'pipe', 'pipe'] },
    );
  const write = (contents) => writeFileSync(resolve(cwd, WORKSPACE_PATH), contents);
  const commit = (message) => {
    git('add', '.');
    git('-c', 'user.email=test@example.test', '-c', 'user.name=Test', 'commit', '-qm', message);
    return git('rev-parse', 'HEAD');
  };
  try {
    git('init', '-q');
    mkdirSync(resolve(cwd, 'src/layout'), { recursive: true });
    const original = readFileSync(WORKSPACE_PATH, 'utf8');
    write(original);
    const seed = commit('seed');
    const baseline = git('rev-parse', seed + ':' + WORKSPACE_PATH);
    assert.equal(await workspaceBlobSha(original), baseline);
    writeFileSync(resolve(cwd, 'code.txt'), 'independent change');
    const unrelated = commit('code');
    const proposal = (title) => {
      const layout = JSON.parse(original);
      layout.previousBlobSha = baseline;
      layout.spaces[0].title = title;
      return JSON.stringify(layout);
    };
    write(proposal('Первый редактор'));
    const first = commit('first');
    assert.doesNotThrow(() => check(unrelated, first));
    write(proposal('Второй редактор'));
    const second = commit('second');
    assert.throws(() => check(first, second), /common layout has changed/);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});
