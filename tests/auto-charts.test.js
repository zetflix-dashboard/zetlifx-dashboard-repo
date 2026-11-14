import test from 'node:test';
import assert from 'node:assert/strict';
import { addNewCharts, readSeenCharts, writeSeenCharts } from '../src/layout/AutoCharts.js';

const layout = () => ({ version: 1, dashboardId: 'overview',
  widgets: [{ chartId: 'C03', instanceId: 'revenue', x: 0, y: 0, w: 8, h: 4 }] });
const defs = [{ id: 'C03', defaultSize: { w: 8, h: 4 } },
  { id: 'C04', defaultSize: { w: 6, h: 3 } }];
test('a newly registered chart auto-appears without editing dashboard JSON', () => {
  const result = addNewCharts(layout(), defs, ['C03']);
  assert.deepEqual(result.widgets.map(w => w.chartId), ['C03', 'C04']);
  assert.equal(result.widgets[1].y, 4);
  assert.deepEqual(addNewCharts(result, defs, ['C03']).widgets, result.widgets);
});
test('previously seen removed chart stays hidden', () => {
  assert.deepEqual(addNewCharts(layout(), defs, ['C03', 'C04']).widgets, layout().widgets);
});
test('saving seen ids preserves dismissed graphs', () => {
  const data = new Map();
  const storage = { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
  writeSeenCharts(['C03', 'C04'], storage);
  assert.deepEqual(readSeenCharts(['C03'], storage), ['C03', 'C04']);
});
test('invalid catalog data does not crash startup', () => {
  const storage = { getItem: () => '{not-json' };
  assert.deepEqual(readSeenCharts(['C03'], storage), ['C03']);
});
