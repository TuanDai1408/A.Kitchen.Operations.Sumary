import { test } from 'node:test';
import assert from 'node:assert';
import { getBomDetail } from '../server-api.js';

test('getBomDetail - query by productCode (material)', async () => {
  const res = await getBomDetail({ productCode: '5100000080' });
  assert.strictEqual(res.ok, true, 'Result should be ok');
  assert.strictEqual(res.material, '5100000080', 'Material should match');
  assert.ok(res.totalNvlCount > 0, 'Should have components');
  assert.ok(res.totalNvlCost > 0, 'Should have total cost');
  assert.ok(Array.isArray(res.components), 'Components should be array');
  assert.ok(res.components.length > 0, 'Components length > 0');

  // Verify first component format
  const comp = res.components[0];
  assert.ok(comp.nvl_material, 'Component should have nvl_material');
  assert.ok(comp.nvl_desc !== undefined, 'Component should have nvl_desc');
  assert.ok(typeof comp.nvl_qty === 'number', 'nvl_qty should be number');
  assert.ok(typeof comp.price === 'number', 'price should be number');
  assert.ok(typeof comp.gia_nvl === 'number', 'gia_nvl should be number');
});

test('getBomDetail - query by productName (fallback search)', async () => {
  const res = await getBomDetail({ productName: 'THỊT RIM TÔM SACN' });
  assert.strictEqual(res.ok, true, 'Result should be ok');
  assert.strictEqual(res.material, '5100002510', 'Should find matching material');
  assert.ok(res.components.length > 0, 'Should have components');
});

test('getBomDetail - not found product', async () => {
  const res = await getBomDetail({ productCode: 'NOT_EXISTING_999999' });
  assert.strictEqual(res.ok, false, 'Should return not ok for unknown code');
  assert.ok(res.message, 'Should provide helpful message');
});
