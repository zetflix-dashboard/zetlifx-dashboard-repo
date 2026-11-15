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
