import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { validateWorkspaceChange } from './workspace-change.mjs';
const FILE = /^src\/charts\/(C\d{2})-[a-z0-9][a-z0-9-]*\/(chart\.json|README\.md)$/;
export function normalizeMode(raw) {
  if (typeof raw !== 'string') return null;
  const value = raw
    .normalize('NFKC')
    .trim()
    .toLocaleLowerCase('ru-RU')
    .replace(/^(?:режим|mode)\s*[:=-]?\s*/u, '')
    .trim();
  const aliases = {
    chart: 'chart',
    чарт: 'chart',
    график: 'chart',
    admin: 'admin',
    админ: 'admin',
    администратор: 'admin',
  };
  return Object.hasOwn(aliases, value) ? aliases[value] : null;
}
export function parseScope(body = '') {
  const blocks = [...String(body).matchAll(/<!--\s*ZETFLIX_SCOPE\s*\r?\n([\s\S]*?)\r?\n\s*-->/giu)];
  if (!blocks.length) return { mode: 'chart', charts: [], explicit: false };
  if (blocks.length !== 1) throw new Error('Exactly one ZETFLIX_SCOPE block is allowed');
  const fields = {};
  for (const line of blocks[0][1].trim().split(/\r?\n/u)) {
    const match = line.trim().match(/^(mode|charts)\s*:\s*(.*?)\s*$/iu);
    if (!match || Object.hasOwn(fields, match[1].toLowerCase()))
      throw new Error('Invalid or duplicate scope field');
    fields[match[1].toLowerCase()] = match[2];
  }
  const mode = normalizeMode(fields.mode);
  if (!mode) throw new Error('Only chart and admin modes exist; batch has been removed');
  const charts = (fields.charts || '')
    .split(/[,;\s]+/u)
    .filter(Boolean)
    .map((v) => v.toUpperCase());
  if (charts.some((v) => !/^C\d{2}$/.test(v)) || charts.length > (mode === 'chart' ? 1 : 0))
    throw new Error('chart allows one C-ID; admin must leave charts empty');
  return { mode, charts, explicit: true };
}
export function checkScope(paths, scope, branch = '') {
  const files = [...new Set(paths)];
  if (!files.length) throw new Error('No changed files');
  if (
    files.some(
      (p) =>
        typeof p !== 'string' ||
        !p ||
        p.startsWith('/') ||
        p.includes('\\') ||
        p.split('/').includes('..'),
    )
  )
    throw new Error('Invalid path');
  if (branch.startsWith('admin/layout-')) {
    if (scope.mode !== 'admin' || !scope.explicit)
      throw new Error('Workspace publication requires explicit admin scope');
    if (files.length !== 1 || files[0] !== 'src/layout/workspace.json')
      throw new Error('Workspace publication may only change src/layout/workspace.json');
  }
  if (scope.mode === 'admin' && scope.explicit)
    return { mode: 'admin', charts: [], changed: files.length };
  if (scope.mode !== 'chart') throw new Error('Explicit admin mode required');
  const matches = files.map((p) => p.match(FILE));
  if (matches.some((m) => !m))
    throw new Error(
      'chart may change only one chart.json and its README.md; shell, code, styles, tests and instructions require admin',
    );
  const directories = new Set(files.map((p) => p.split('/').slice(0, 3).join('/')));
  const ids = [...new Set(matches.map((m) => m[1]))];
  if (
    ids.length !== 1 ||
    directories.size !== 1 ||
    (scope.charts.length && scope.charts[0] !== ids[0])
  )
    throw new Error('chart must change exactly one declared C-ID directory');
  return { mode: 'chart', charts: ids, changed: files.length };
}
export function runCli() {
  const { GITHUB_EVENT_PATH, GITHUB_BASE_SHA, GITHUB_HEAD_SHA, QUEUED_PULL_REQUEST_PATH } =
    process.env;
  if (![GITHUB_BASE_SHA, GITHUB_HEAD_SHA].every((s) => /^[0-9a-f]{40}$/.test(s || '')))
    throw new Error('Exact base/head SHAs required');
  const event = JSON.parse(readFileSync(GITHUB_EVENT_PATH, 'utf8'));
  const queued = Boolean(event.merge_group);
  const pull = queued
    ? JSON.parse(readFileSync(QUEUED_PULL_REQUEST_PATH, 'utf8'))
    : event.pull_request;
  if (!pull) throw new Error('PR event required');
  if (queued) {
    const [first, second, extra] = execFileSync(
      'git',
      ['show', '-s', '--format=%P', GITHUB_HEAD_SHA],
      { encoding: 'utf8' },
    )
      .trim()
      .split(' ');
    if (first !== GITHUB_BASE_SHA || second !== pull.head.sha || extra || pull.base.ref !== 'main')
      throw new Error('Expected a merge queue candidate with one PR on the specified base');
  }
  // --no-renames checks both the old and new path; -z handles whitespace safely.
  const paths = execFileSync(
    'git',
    [
      'diff',
      '--no-renames',
      '--name-only',
      '-z',
      queued ? GITHUB_BASE_SHA + '..' + GITHUB_HEAD_SHA : GITHUB_BASE_SHA + '...' + GITHUB_HEAD_SHA,
    ],
    { encoding: 'utf8' },
  )
    .split('\0')
    .filter(Boolean);
  const result = checkScope(paths, parseScope(pull.body), pull.head.ref);
  validateWorkspaceChange(GITHUB_BASE_SHA, GITHUB_HEAD_SHA);
  const tree = execFileSync('git', ['ls-tree', '-r', '-z', GITHUB_HEAD_SHA, '--', 'src/charts'], {
    encoding: 'utf8',
  });
  if (
    tree
      .split('\0')
      .filter(Boolean)
      .some((line) => !line.startsWith('100644 blob '))
  )
    throw new Error('Chart symlinks, executables and submodules are forbidden');
  console.log(JSON.stringify(result));
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    runCli();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
