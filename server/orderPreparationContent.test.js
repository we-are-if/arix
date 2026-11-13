import test from 'node:test';
import assert from 'node:assert/strict';
import { preparationContentPatch } from './orderPreparationContent.js';

test('warehouse corrects kg to litres without changing package count or original input', () => {
  const item = { quantity: 3, innerQuantity: 15, innerUnit: 'KG' };
  const result = preparationContentPatch(item, { innerUnit: 'LT' }, true);
  assert.deepEqual(result, { patch: { innerUnit: 'LT' }, changed: true });
  assert.equal(item.innerUnit, 'KG');
  assert.deepEqual({ ...item, ...result.patch }, { quantity: 3, innerQuantity: 15, innerUnit: 'LT' });
});
test('content amount supports fractional quantities, zero and missing fields', () => {
  const item = { innerUnit: 'LT', innerQuantity: 15 };
  assert.equal(preparationContentPatch(item, { innerQuantity: 12.5 }, true).patch.innerQuantity, 12.5);
  assert.equal(preparationContentPatch(item, { innerQuantity: 0 }, true).patch.innerQuantity, 0);
  assert.deepEqual(preparationContentPatch(item, {}, true), { patch: {}, changed: false });
  assert.equal(preparationContentPatch(item, { innerUnit: 'LT' }, true).changed, false);
});
test('rejects invalid content and changes to catalogue measurements', () => {
  for (const body of [{ innerQuantity: -1 }, { innerQuantity: 'oops' }, { innerUnit: 'INVALID' }, { innerQuantity: 10, innerUnit: '' }]) {
    assert.ok(preparationContentPatch({}, body, true).error);
  }
  assert.ok(preparationContentPatch({}, { innerUnit: 'KG' }, false).error);
});
