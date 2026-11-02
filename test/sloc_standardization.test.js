import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  SLOC_GROUPS,
  SLOC_MAP,
  getSlocGroup,
  getSlocName,
  getSlocDisplayName
} from '../shared/sloc-config.js';
import * as api from '../server-api.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test('SLOC configuration: standardizes warehouse groups accurately', () => {
  // Kho hàng hóa
  assert.equal(getSlocName('RL01'), 'Kho hàng hóa');
  assert.equal(getSlocName('KL01'), 'Kho hàng hóa');
  assert.equal(getSlocGroup('RL01').id, 'hang_hoa');
  assert.equal(getSlocGroup('KL01').id, 'hang_hoa');
  assert.deepEqual(getSlocGroup('RL01').groupCodes.sort(), ['KL01', 'RL01']);

  // Kho VTTH
  assert.equal(getSlocName('RL02'), 'Kho VTTH');
  assert.equal(getSlocName('KL02'), 'Kho VTTH');
  assert.equal(getSlocGroup('RL02').id, 'vtth');
  assert.equal(getSlocGroup('KL02').id, 'vtth');

  // Kho CCDC XD
  assert.equal(getSlocName('RL03'), 'Kho CCDC XD');
  assert.equal(getSlocName('KL03'), 'Kho CCDC XD');
  assert.equal(getSlocGroup('RL03').id, 'ccdc_xd');

  // Kho cấp đông & Kho trả hàng
  assert.equal(getSlocName('RL04'), 'Kho cấp đông');
  assert.equal(getSlocGroup('RL04').id, 'cap_dong');
  assert.equal(getSlocName('RL05'), 'Kho trả hàng');
  assert.equal(getSlocGroup('RL05').id, 'tra_hang');

  // Unmapped codes fallback cleanly
  assert.equal(getSlocName('UNKNOWN_LOC'), 'UNKNOWN_LOC');
  assert.equal(getSlocGroup('UNKNOWN_LOC').id, 'UNKNOWN_LOC');
  assert.equal(getSlocDisplayName('UNKNOWN_LOC'), 'UNKNOWN_LOC');
});

test('SLOC display names format with and without original code', () => {
  assert.equal(getSlocDisplayName('RL01', false), 'Kho hàng hóa');
  assert.equal(getSlocDisplayName('RL01', true), 'Kho hàng hóa (RL01)');
  assert.equal(getSlocDisplayName('KL01', true), 'Kho hàng hóa (KL01)');
  assert.equal(getSlocDisplayName('KL02', true), 'Kho VTTH (KL02)');
  assert.equal(getSlocDisplayName('', true), '');
});

test('UI layout: SLoc cards display in 1 row on desktop', () => {
  const scriptContent = fs.readFileSync(path.join(__dirname, '../script.js'), 'utf8');
  assert.ok(scriptContent.includes('.qlk-sloc-row-cards'), 'CSS class .qlk-sloc-row-cards must be defined');
  assert.ok(scriptContent.includes('flex-direction:row'), 'Row layout must use flex-direction:row');
  assert.ok(scriptContent.includes('overflow-x:auto'), 'Horizontal scroll must be enabled on overflow');
  assert.ok(scriptContent.includes('<div class="qlk-sloc-row-cards">'), 'renderSlocInfo must render into .qlk-sloc-row-cards');
});

test('Chi tiết hủy hàng: uses only mb51_material_docs and excludes 552 reversals', async () => {
  // Check live API result for disposal records
  const result = await api.getMb51GoodsIssue({ limit: 100 });
  assert.equal(result.ok, true, 'getMb51GoodsIssue call should succeed with ok: true');
  assert.ok(Array.isArray(result.rows), 'result.rows should be an array');
  assert.ok(result.rows.length > 0, 'result.rows should have data');
  
  // Every row must be mov_type 551
  result.rows.forEach(r => {
    assert.equal(String(r.mov_type).trim(), '551', 'Every row in scrap detail must have mov_type 551');
    assert.ok(Number(r.quantity) >= 0, 'Disposal quantities must be non-negative');
    assert.ok(Number(r.amount_lc) >= 0, 'Disposal amount must be non-negative');
  });

  // Verify server-api.js implementation does not query mb51_goods_issue
  const serverApiContent = fs.readFileSync(path.join(__dirname, '../server-api.js'), 'utf8');
  assert.ok(!serverApiContent.includes(".from('mb51_goods_issue')"), "Must not query mb51_goods_issue in server-api.js");
  assert.ok(!serverApiContent.includes(".from('stock_transactions')"), "Must not query stock_transactions in server-api.js");
  assert.ok(!serverApiContent.includes(".from('stock_header')"), "Must not query stock_header in server-api.js");
  assert.ok(!serverApiContent.includes(".from('stock_price_category')"), "Must not query stock_price_category in server-api.js");
});

test('slocItems variable is declared in QLK module scope and getSlocItems exists', () => {
  const scriptContent = fs.readFileSync(path.join(__dirname, '../script.js'), 'utf8');
  // Check declaration at module scope
  assert.ok(scriptContent.includes('var slocItems = [];'), 'var slocItems = []; must be declared in module scope');
  assert.ok(scriptContent.includes('function getSlocItems('), 'function getSlocItems must be defined');
  assert.ok(scriptContent.includes('slocItems = getSlocItems('), 'buildSkeleton must assign slocItems via getSlocItems');
  assert.ok(!scriptContent.includes('var slocItems = (slocItems || []).map'), 'No shadowed declaration in bindEvents');
});
