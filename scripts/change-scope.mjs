import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
const ID = /^C\d{2}$/;
const FILE = /^src\/charts\/(C\d{2})-[a-z0-9][a-z0-9-]*\/.+$/;

// Safety guard for accidental changes, not authentication.
export function normalizeMode(raw) {
  if (typeof raw !== 'string') return null;
  const mode = raw.normalize('NFKC').trim().toLocaleLowerCase('ru-RU')
    .replace(/^(?:режим|mode)\s*[:\-]?\s*/u, '').trim();
  return ({ chart: 'CHART', график: 'CHART', чарт: 'CHART',
    batch: 'BATCH', батч: 'BATCH', пакетный: 'BATCH',
    admin: 'ADMIN', админ: 'ADMIN', администратор: 'ADMIN' })[mode] || null;
}

export function parseScope(body = '') {
  const blocks = [...String(body).matchAll(/<!--\s*ZETFLIX_SCOPE\s*\r?\n([\s\S]*?)\r?\n\s*-->/giu)];
  if (!blocks.length) return { mode: 'CHART', charts: [], explicit: false };
  if (blocks.length !== 1) throw new Error('Expected exactly one ZETFLIX_SCOPE block');
  const fields = {};
  for (const line of blocks[0][1].trim().split(/\r?\n/u)) {
    const m = line.trim().match(/^(mode|charts)\s*:\s*(.*?)\s*$/iu);
    if (!m) throw new Error('Invalid scope line: ' + line);
    const field = m[1].toLowerCase();
    if (Object.hasOwn(fields, field)) throw new Error('Duplicate field: ' + field);
    fields[field] = m[2];
  }
  const mode = normalizeMode(fields.mode);
  if (!mode) throw new Error('Invalid mode: CHART, BATCH or ADMIN');
  const charts = (fields.charts || '').split(/[,;\s]+/u).filter(Boolean).map(s => s.toUpperCase());
  if (charts.some(s => !ID.test(s))) throw new Error('Invalid C-ID');
  if (new Set(charts).size !== charts.length) throw new Error('Duplicate C-ID');
  if (mode === 'CHART' && charts.length > 1) throw new Error('CHART: one C-ID maximum');
  if (mode === 'BATCH' && charts.length < 2) throw new Error('BATCH: two or more C-IDs required');
  if (mode === 'ADMIN' && charts.length) throw new Error('ADMIN: charts must be empty');
  return { mode, charts, explicit: true };
}

export function checkScope(paths, scope) {
  const files = [...new Set(paths.filter(Boolean))];
  if (!files.length) throw new Error('No changed files');
  if (files.some(p => typeof p !== 'string' || p.startsWith('/') || p.includes('\\') || p.includes('..'))) {
    throw new Error('Invalid file path');
  }
  if (scope.mode === 'ADMIN') {
    if (!scope.explicit) throw new Error('ADMIN must be explicit');
    return { mode: 'ADMIN', charts: [], changed: files.length };
  }
  const matched = files.map(path => ({ path, match: path.match(FILE) }));
  const outside = matched.filter(x => !x.match).map(x => x.path);
  if (outside.length) throw new Error(scope.mode + ' cannot modify: ' + outside.join(', '));
  const ids = [...new Set(matched.map(x => x.match[1]))].sort();
  if (scope.mode === 'CHART') {
    if (ids.length !== 1) throw new Error('CHART: exactly one graph: ' + ids.join(', '));
    if (scope.charts.length && scope.charts[0] !== ids[0]) throw new Error('CHART declared ' + scope.charts[0] + ', changed ' + ids[0]);
  } else if (scope.mode === 'BATCH') {
    if (!scope.explicit) throw new Error('BATCH must be explicit');
    if (ids.length !== scope.charts.length || ids.some(id => !scope.charts.includes(id))) {
      throw new Error('BATCH actual ' + ids.join(', ') + ' differs from declared ' + scope.charts.join(', '));
    }
  } else throw new Error('Unknown scope');
  return { mode: scope.mode, charts: ids, changed: files.length };
}

export function runCli() {
  const { GITHUB_EVENT_PATH, GITHUB_BASE_SHA, GITHUB_HEAD_SHA } = process.env;
  if (!GITHUB_EVENT_PATH || !GITHUB_BASE_SHA || !GITHUB_HEAD_SHA) throw new Error('Missing GitHub event/base/head');
  const event = JSON.parse(readFileSync(GITHUB_EVENT_PATH, 'utf8'));
  if (!event.pull_request) throw new Error('Expected pull_request event');
  const paths = execFileSync('git', ['diff', '--name-only', '--diff-filter=ACMRTD',
    GITHUB_BASE_SHA + '...' + GITHUB_HEAD_SHA], { encoding: 'utf8' }).trim().split('\n').filter(Boolean);
  const result = checkScope(paths, parseScope(event.pull_request.body || ''));
  console.log('Accepted ' + result.mode + ': [' + result.charts.join(', ') + '] (' + result.changed + ' files)');
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { runCli(); } catch (err) { console.error('::error::' + err.message); process.exitCode = 1; }
}
