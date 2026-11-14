import test from 'node:test';
import assert from 'node:assert/strict';
import { validateLayout, LayoutHistory, LAYOUT_VERSION } from '../src/layout/LayoutStorage.js';

const fixture = () => ({
  version: LAYOUT_VERSION,
  dashboardId: 'overview',
  widgets: [{ instanceId: 'one', chartId: 'C03', x: 0, y: 0, w: 6, h: 4 }]
});
const known = (id) => ['C03', 'C18'].includes(id);

test('accepts a valid layout and discards extra fields', () => {
  const v = validateLayout({ ...fixture(), malicious: true }, known);
  assert.equal(v.widgets[0].chartId, 'C03');
  assert.equal(v.malicious, undefined);
});
test('rejects unknown charts and duplicate IDs', () => {
  const layout = fixture();
  layout.widgets[0].chartId = 'C99';
  assert.throws(() => validateLayout(layout, known), /Неизвестный график/);
  const dup = fixture();
  dup.widgets.push({ ...dup.widgets[0] });
  assert.throws(() => validateLayout(dup, known), /Повторяющийся/);
});
test('rejects out-of-bounds cards', () => {
  const layout = fixture();
  layout.widgets[0].w = 13;
  assert.throws(() => validateLayout(layout, known), /координаты/);
});
test('history stores independent snapshots and supports undo redo', () => {
  const history = new LayoutHistory(fixture());
  const next = fixture();
  next.widgets[0].x = 2;
  history.push(next);
  next.widgets[0].x = 3;
  assert.equal(history.current().widgets[0].x, 2);
  assert.equal(history.undo().widgets[0].x, 0);
  assert.equal(history.redo().widgets[0].x, 2);
});
