import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import { getBomDetail } from '../server-api.js';

test('getBomDetail - query by productCode (material)', async () => {
  const res = await getBomDetail({ productCode: '5100000080' });
  assert.strictEqual(res.ok, true, 'Result should be ok');
  assert.strictEqual(res.material, '5100000080', 'Material should match');
  assert.ok(res.totalNvlCount > 0, 'Should have components');
  assert.ok(res.totalNvlCost > 0, 'Should have total cost');
  assert.ok(Array.isArray(res.components), 'Components should be array');
  assert.ok(res.components.length > 0, 'Components length > 0');

  // Verify price control and standard price
  assert.strictEqual(res.price_control, 'S', 'Price control should be S');
  assert.ok(res.standard_price > 0, 'Standard price should be > 0');
  assert.strictEqual(res.gia_uoc_tinh_s, res.standard_price, 'gia_uoc_tinh_s should match standard_price');

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
  assert.strictEqual(res.price_control, 'S', 'Price control should be S');
  assert.ok(res.standard_price > 0, 'Standard price should be > 0');
});

test('getBomDetail - not found product', async () => {
  const res = await getBomDetail({ productCode: 'NOT_EXISTING_999999' });
  assert.strictEqual(res.ok, false, 'Should return not ok for unknown code');
  assert.ok(res.message, 'Should provide helpful message');
});

test('BOM Popup UI - script.js contains card Giá ước tính (S) and 5-card responsive layout', () => {
  const scriptContent = fs.readFileSync(path.join(process.cwd(), 'script.js'), 'utf8');
  const publicScriptContent = fs.readFileSync(path.join(process.cwd(), 'public', 'script.js'), 'utf8');

  assert.strictEqual(scriptContent, publicScriptContent, 'script.js and public/script.js must be identical');
  assert.ok(scriptContent.includes('Giá ước tính (S)'), 'script.js must contain card Giá ước tính (S)');
  assert.ok(scriptContent.includes('repeat(5,1fr)'), 'CSS must specify 5 columns layout for bom-kpis');
  assert.ok(scriptContent.includes('Đơn giá bán trước thuế'), 'script.js must contain card Đơn giá bán trước thuế');
});
