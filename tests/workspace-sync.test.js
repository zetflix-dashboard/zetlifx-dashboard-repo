import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mergeWorkspace, WorkspaceConflict } from '../src/layout/SharedWorkspace.js';

const known = () => true;
const base = {
  version: 2,
  activeId: 'overview',
  spaces: [
    {
      id: 'overview',
      title: 'Overview',
      widgets: [
        { instanceId: 'first', chartId: 'C03', x: 0, y: 0, w: 6, h: 2 },
        { instanceId: 'second', chartId: 'C18', x: 6, y: 0, w: 6, h: 2 },
      ],
    },
  ],
};

test('a save merges changes to independent cards and can replay the same write', () => {
  const local = structuredClone(base);
  const remote = structuredClone(base);
  local.spaces[0].widgets[0].h = 3;
  remote.spaces[0].widgets[1].h = 4;
  const merged = mergeWorkspace(base, local, remote, known);
  assert.deepEqual(
    merged.spaces[0].widgets.map(({ h }) => h),
    [3, 4],
  );
  assert.deepEqual(mergeWorkspace(base, local, merged, known), merged);
});

test('a save refuses a concurrent update to the same card', () => {
  const local = structuredClone(base);
  const remote = structuredClone(base);
  local.spaces[0].widgets[0].h = 3;
  remote.spaces[0].widgets[0].h = 4;
  assert.throws(() => mergeWorkspace(base, local, remote, known), WorkspaceConflict);
});

test('a save refuses a new collision caused by two individually valid layouts', () => {
  const local = structuredClone(base);
  const remote = structuredClone(base);
  local.spaces[0].widgets[0].y = 4;
  remote.spaces[0].widgets[1].x = 0;
  remote.spaces[0].widgets[1].y = 4;
  assert.throws(() => mergeWorkspace(base, local, remote, known), WorkspaceConflict);
});

test('project deletions remove every instance and survive concurrent workspace edits', () => {
  const before = structuredClone(base);
  before.spaces.push({
    id: 'other',
    title: 'Other',
    widgets: [{ ...before.spaces[0].widgets[0], instanceId: 'another' }],
  });
  const deleting = { ...structuredClone(before), removedCharts: ['C03'] };
  const editing = structuredClone(before);
  editing.spaces[0].widgets[1].h = 4;
  editing.spaces[1].widgets[0].h = 3;
  const merged = mergeWorkspace(before, deleting, editing, known);
  assert.equal(merged.version, 3);
  assert.deepEqual(merged.removedCharts, ['C03']);
  assert.deepEqual(
    merged.spaces.map(({ widgets }) => widgets.map(({ chartId }) => chartId)),
    [['C18'], []],
  );
  assert.equal(merged.spaces[0].widgets[0].h, 4);
  assert.deepEqual(mergeWorkspace(before, editing, deleting, known), merged);
});

test('display titles are merged per chart and survive workspace edits', () => {
  const local = { ...structuredClone(base), chartTitles: { C03: 'Финансы' } };
  const remote = { ...structuredClone(base), chartTitles: { C18: 'Реклама' } };
  remote.spaces[0].widgets[1].h = 4;
  const merged = mergeWorkspace(base, local, remote, known);
  assert.equal(merged.version, 4);
  assert.deepEqual(merged.chartTitles, { C03: 'Финансы', C18: 'Реклама' });
  assert.equal(merged.spaces[0].widgets[1].h, 4);
  assert.throws(
    () => mergeWorkspace(base, local, { ...remote, chartTitles: { C03: 'Выручка' } }, known),
    WorkspaceConflict,
  );
});
