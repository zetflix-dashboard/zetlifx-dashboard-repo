import test from 'node:test';
import assert from 'node:assert/strict';
import { FilterStore, dateRange, validateFilters } from '../src/shared/filters/FilterStore.js';

test('dates are always the first day of a month', () => {
  assert.deepEqual(dateRange({ periodFrom: '2024-02', periodTo: '2025-08' }), [
    '2024-02-01',
    '2025-08-01',
  ]);
});
test('reversed or out-of-range periods are rejected', () => {
  assert.throws(() => validateFilters({ periodFrom: '2025-09', periodTo: '2024-01' }), /Период/);
  assert.throws(() => validateFilters({ periodFrom: '2023-12', periodTo: '2025-12' }), /Период/);
});
test('subscriptions are notified only for real changes', () => {
  const store = new FilterStore();
  let calls = 0;
  const unsub = store.subscribe(() => calls++);
  store.set({ periodFrom: '2024-02' });
  store.set({ periodFrom: '2024-02' });
  assert.equal(calls, 1);
  unsub();
  store.reset();
  assert.equal(calls, 1);
});
