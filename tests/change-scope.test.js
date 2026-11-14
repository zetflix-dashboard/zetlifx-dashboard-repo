import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeMode, parseScope, checkScope } from '../scripts/change-scope.mjs';
const path = id => 'src/charts/' + id + '-demo/index.js';
const marker = (mode, ids = '') => '<!-- ZETFLIX_SCOPE\nmode: ' + mode + '\ncharts: ' + ids + '\n-->';
test('synonyms and case normalization', () => {
  for (const s of ['BATCH', 'Batch', 'batch', 'режим батч', 'РЕЖИМ БАТЧ', 'mode: batch', 'пакетный']) assert.equal(normalizeMode(s), 'BATCH');
  assert.equal(normalizeMode('режим админ'), 'ADMIN');
  assert.equal(normalizeMode('режим график'), 'CHART');
  assert.equal(normalizeMode('сделай красиво'), null);
});
test('default is a single chart without metadata', () => {
  assert.equal(parseScope('Добавь C04').mode, 'CHART');
  assert.deepEqual(checkScope([path('C04')], parseScope('')).charts, ['C04']);
});
test('CHART rejects other charts and shell changes', () => {
  for (const paths of [[path('C04'), path('C05')], [path('C04'), 'src/main.js'],
    [path('C04'), 'src/charts/AGENTS.md'], ['docs/metrics.md']]) assert.throws(() => checkScope(paths, parseScope('')), /CHART/);
});
test('explicit CHART must match changed graph', () => {
  assert.throws(() => checkScope([path('C05')], parseScope(marker('chart', 'C04'))), /declared/);
  assert.equal(checkScope([path('C04')], parseScope(marker('график', 'c04'))).mode, 'CHART');
});
test('BATCH permits only explicitly named graphs', () => {
  const scope = parseScope(marker('режим батч', 'C04,C05'));
  assert.deepEqual(checkScope([path('C04'), path('C05')], scope).charts, ['C04', 'C05']);
  assert.throws(() => checkScope([path('C04')], scope), /differs/);
  assert.throws(() => checkScope([path('C04'), path('C05'), path('C06')], scope), /differs/);
  assert.throws(() => checkScope([path('C04'), path('C05'), 'src/style.css'], scope), /cannot modify/);
  assert.throws(() => parseScope(marker('batch', 'C04')), /two or more/);
});
test('ADMIN explicitly unlocks shell', () => {
  assert.equal(checkScope(['src/main.js', 'AGENTS.md'], parseScope(marker('ADMIN'))).mode, 'ADMIN');
  assert.throws(() => checkScope(['src/main.js'], parseScope('ADMIN: change shell')), /cannot modify/);
});
test('invalid markers fail', () => {
  assert.throws(() => parseScope(marker('unknown', 'C04')), /Invalid mode/);
  assert.throws(() => parseScope(marker('batch', 'C04,C04')), /Duplicate C-ID/);
  assert.throws(() => parseScope(marker('admin', 'C04')), /must be empty/);
  assert.throws(() => parseScope(marker('batch', 'C04,C05') + '\n' + marker('batch', 'C04,C05')), /exactly one/);
});
