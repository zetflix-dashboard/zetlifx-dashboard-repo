import test from 'node:test';
import assert from 'node:assert/strict';
import { recoverSelectedSpaces, summarizeWorkspaceChanges } from '../src/layout/WorkspaceChanges.js';

const widget = (instanceId, x = 0) => ({
  instanceId, chartId: 'C03', x, y: 0, w: 6, h: 4,
});
const space = (id, widgets) => ({ id, title: id, widgets });

test('workspace comparison counts changed spaces, instances and geometry', () => {
  const before = { spaces: [space('a', [widget('one'), widget('two')])] };
  const after = {
    spaces: [
      space('a', [
        { ...widget('one', 3), w: 7, localFilters: { quarter: '1' } },
        widget('three'),
      ]),
      space('b', [widget('four')]),
    ],
  };
  assert.deepEqual(summarizeWorkspaceChanges(before, after), {
    spaces: 2,
    added: 2,
    removed: 1,
    moved: 1,
    resized: 1,
    updated: 1,
  });
});

test('recovery replaces only selected spaces and preserves common changes', () => {
  const published = {
    version: 2,
    activeId: 'a',
    spaces: [space('a', [widget('common')]), space('b', [widget('shared')])],
  };
  const draft = {
    version: 2,
    activeId: 'a',
    spaces: [space('a', [widget('personal')]), space('c', [widget('additional')])],
  };
  const recovered = recoverSelectedSpaces(published, draft, ['a', 'c']);
  assert.deepEqual(recovered.spaces.map((s) => s.id), ['a', 'b', 'c']);
  assert.equal(recovered.spaces[0].widgets[0].instanceId, 'personal');
  assert.equal(recovered.spaces[1].widgets[0].instanceId, 'shared');
  draft.spaces[0].widgets[0].x = 9;
  assert.equal(recovered.spaces[0].widgets[0].x, 0);
});
