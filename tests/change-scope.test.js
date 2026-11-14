import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeMode, parseScope, checkScope } from '../scripts/change-scope.mjs';
const block = (mode, charts = '') => `<!-- ZETFLIX_SCOPE
mode: ${mode}
charts: ${charts}
-->`;
test('mode names normalize case and explicit Russian aliases', () => {
  for (const value of ['chart', 'Chart', 'CHART', 'режим чарт', 'график'])
    assert.equal(normalizeMode(value), 'chart');
  for (const value of ['admin', 'ADMIN', 'режим админ', 'mode: Admin'])
    assert.equal(normalizeMode(value), 'admin');
  for (const value of [
    'batch',
    'Batch',
    'режим батч',
    'please admin',
    'administrator',
    '__proto__',
    'constructor',
  ])
    assert.equal(normalizeMode(value), null);
});
test('ordinary request defaults to one chart and cannot modify the shell or instructions', () => {
  const scope = parseScope('Make it beautiful');
  assert.equal(checkScope(['src/charts/C03-trend/chart.json'], scope).mode, 'chart');
  for (const path of [
    'src/main.js',
    'src/charts/AGENTS.md',
    'src/charts/C03-trend/index.js',
    'src/charts/C03-trend/AGENTS.md',
    '.github/workflows/check.yml',
    'docs/charts.md',
  ])
    assert.throws(() => checkScope([path], scope));
  assert.throws(() =>
    checkScope(['src/charts/C03-trend/chart.json', 'src/charts/C18-ads/chart.json'], scope),
  );
  assert.throws(() =>
    checkScope(['src/charts/C03-one/chart.json', 'src/charts/C03-two/chart.json'], scope),
  );
});
test('malformed, duplicate, ambiguous and removed modes fail closed', () => {
  for (const body of [
    block('batch', 'C03 C18'),
    block('chart', 'C03 C18'),
    block('chart', 'C03 C03'),
    block('admin', 'C03'),
    block('oops'),
    block('chart') + block('admin'),
    `<!-- ZETFLIX_SCOPE
mode: chart
mode: admin
-->`,
  ])
    assert.throws(() => parseScope(body));
  assert.throws(() =>
    checkScope(['src/charts/C18-ads/chart.json'], parseScope(block('chart', 'C03'))),
  );
  assert.throws(() => checkScope(['src/main.js'], { mode: 'admin', explicit: false }));
  assert.equal(checkScope(['src/main.js'], parseScope(block('admin'))).mode, 'admin');
});
test('deleted/renamed protected paths cannot be hidden in chart changes', () => {
  assert.throws(() =>
    checkScope(['src/main.js', 'src/charts/C03-trend/README.md'], parseScope('')),
  );
  assert.throws(() => checkScope(['src/charts/C03-trend/../README.md'], parseScope('')));
});
