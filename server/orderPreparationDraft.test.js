import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareDraftItems } from './orderPreparationDraft.js';
const source = [
  { productId: 1, productName: 'Foil', productCode: 'A', quantity: 100, preparedQuantity: 20 },
  { productId: null, productName: 'Glue', productCode: '', quantity: 3, manual: true, innerUnit: 'KG', innerQuantity: 15 },
];
const custom = item => item.manual === true;
const normalize = () => ({});
test('saves unfinished and zero quantities atomically without changing ordered amounts', () => {
  const rows = source.map(row => ({ ...row, preparedQuantity: 0, preparedRollCount: 0 }));
  rows[1] = { ...rows[1], preparedQuantity: 1, innerUnit: 'LT', innerQuantity: 12.5 };
  const result = prepareDraftItems(source, rows, custom, normalize);
  assert.equal(result.items[0].preparedQuantity, 0);
  assert.equal(result.items[1].innerUnit, 'LT');
  assert.equal(result.items[1].quantity, 3);
  assert.equal(source[0].preparedQuantity, 20);
  assert.equal(source[1].innerUnit, 'KG');
  assert.deepEqual(prepareDraftItems(result.items, result.items, custom, normalize).items, result.items);
});
test('invalid last row leaves all originals untouched', () => {
  const snapshot = structuredClone(source);
  const rows = source.map(row => ({ ...row, preparedQuantity: 10 }));
  rows[1].preparedQuantity = -1;
  assert.ok(prepareDraftItems(source, rows, custom, normalize).error);
  assert.deepEqual(source, snapshot);
  assert.ok(prepareDraftItems(source, [...rows].reverse(), custom, normalize).error);
  assert.ok(prepareDraftItems(source, [], custom, normalize).error);
});
