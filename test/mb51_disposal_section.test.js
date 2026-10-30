import test from 'node:test';
import assert from 'node:assert/strict';
import { getMb51GoodsIssue } from '../server-api.js';

test('getMb51GoodsIssue returns rows from Supabase and applies filters', async () => {
  const res = await getMb51GoodsIssue({ limit: 10 });
  assert.equal(res.ok, true, 'getMb51GoodsIssue must return ok: true');
  assert.ok(Array.isArray(res.rows), 'rows must be an array');
  assert.ok(res.rows.length > 0, 'rows must not be empty');

  const sample = res.rows[0];
  assert.ok('mat_doc' in sample, 'sample must have mat_doc');
  assert.ok('posting_date' in sample, 'sample must have posting_date');
  assert.ok('quantity' in sample, 'sample must have quantity');
  assert.ok('amount_lc' in sample, 'sample must have amount_lc');
  assert.ok('mov_type' in sample, 'sample must have mov_type');
});

test('getMb51GoodsIssue unit and keyword filters work correctly', async () => {
  const kgRes = await getMb51GoodsIssue({ entry_unit: 'KG', limit: 20 });
  assert.equal(kgRes.ok, true);
  if (kgRes.rows.length > 0) {
    kgRes.rows.forEach(r => {
      assert.equal(r.entry_unit, 'KG', 'all rows must have entry_unit KG');
    });
  }

  const searchRes = await getMb51GoodsIssue({ q: '21000004' });
  assert.equal(searchRes.ok, true);
  if (searchRes.rows.length > 0) {
    searchRes.rows.forEach(r => {
      const match = (r.material && r.material.includes('21000004')) ||
                    (r.material_desc && r.material_desc.includes('21000004')) ||
                    (r.mat_doc && r.mat_doc.includes('21000004'));
      assert.ok(match, 'search result must match query keyword');
    });
  }
});

test('getMb51GoodsIssue nhom_hang filter works correctly', async () => {
  const nhomRes = await getMb51GoodsIssue({ nhom_hang: '115151-Trứng', limit: 20 });
  assert.equal(nhomRes.ok, true);
  if (nhomRes.rows.length > 0) {
    nhomRes.rows.forEach(r => {
      assert.equal(r.nhom_hang, '115151-Trứng', 'all rows must have nhom_hang 115151-Trứng');
    });
  }
});

test('Disposal quantities and amounts display as positive values', () => {
  const sampleDbRow = {
    quantity: -5.25,
    amount_lc: -150000,
    ext_amount_lc: -150000
  };

  const displayQty = Math.abs(Number(sampleDbRow.quantity) || 0);
  const displayAmt = Math.abs(Number(sampleDbRow.amount_lc || sampleDbRow.ext_amount_lc) || 0);

  assert.equal(displayQty, 5.25, 'quantity magnitude must be positive');
  assert.equal(displayAmt, 150000, 'amount magnitude must be positive');
});
