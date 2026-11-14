import test from 'node:test';
import assert from 'node:assert/strict';
import {
  WorkspaceStore,
  createWorkspace,
  loadWorkspace,
  validateWorkspace,
  WORKSPACE_KEY,
} from '../src/layout/WorkspaceStore.js';
import { STORAGE_KEY } from '../src/layout/LayoutStorage.js';
const known = (id) => ['C03', 'C18'].includes(id);
const initial = () => createWorkspace([{ id: 'C03' }, { id: 'C18' }]);
test('spaces can be created, renamed, switched, deleted and restored independently', () => {
  const store = new WorkspaceStore(initial(), known);
  store.create('Контент', 'content');
  assert.equal(store.active().widgets.length, 0);
  store.changeActive({ title: 'Доходы' });
  store.select('initial');
  assert.equal(store.active().widgets.length, 2);
  store.select('content');
  store.removeActive();
  assert.equal(store.state.spaces.length, 1);
  store.undo();
  assert.equal(store.active().title, 'Доходы');
  store.redo();
  assert.equal(store.state.spaces.length, 1);
  store.removeActive();
  assert.equal(store.active(), undefined);
  assert.equal(store.state.activeId, null);
  store.create('Новый', 'new');
  assert.equal(store.active().title, 'Новый');
});
test('legacy saved layout migrates without overwriting or resurrecting hidden charts', () => {
  const raw = JSON.stringify({ version: 1, dashboardId: 'overview', title: 'Обзор', widgets: [] });
  const storage = {
    getItem: (key) => (key === STORAGE_KEY ? raw : null),
    setItem: () => {
      throw new Error('must not write');
    },
  };
  const result = loadWorkspace(initial(), known, storage);
  assert.equal(result.state.spaces[0].widgets.length, 0);
  assert.match(result.warning, /перенесён/);
});
test('corrupted storage is reported, not silently overwritten', () => {
  const loaded = loadWorkspace(initial(), known, { getItem: () => '{bad' });
  assert.equal(loaded.recovery, true);
  assert.equal(loaded.state.spaces.length, 1);
  assert.equal(loadWorkspace(initial(), known, undefined).recovery, true);
});
test('untrusted imports cannot create duplicates, unknown charts or unbounded layouts', () => {
  const dup = initial();
  dup.spaces.push(dup.spaces[0]);
  assert.throws(() => validateWorkspace(dup, known));
  const unknown = initial();
  unknown.spaces[0].widgets[0].chartId = 'C99';
  assert.throws(() => validateWorkspace(unknown, known));
  const bad = initial();
  bad.activeId = 'missing';
  assert.throws(() => validateWorkspace(bad, known));
  const huge = initial();
  huge.spaces[0].widgets[0].w = 13;
  assert.throws(() => validateWorkspace(huge, known));
  assert.throws(() =>
    validateWorkspace({ version: 2, activeId: null, spaces: Array(41).fill({}) }, known),
  );
});
test('history snapshots do not leak mutation and a new edit discards redo', () => {
  const store = new WorkspaceStore(initial(), known);
  store.create('B', 'b');
  const state = store.current();
  state.spaces[0].title = 'mutated';
  assert.notEqual(store.state.spaces[0].title, 'mutated');
  store.undo();
  store.changeActive({ title: 'Changed' });
  assert.equal(store.future.length, 0);
});
