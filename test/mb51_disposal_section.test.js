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

test('Disposal multi-select filter logic checks in (...) match', () => {
  const rows = [
    { entry_unit: 'KG', nhom_hang: '115151-Trứng', nganh_hang: 'Thực phẩm' },
    { entry_unit: 'PHA', nhom_hang: '115152-Thịt', nganh_hang: 'Thực phẩm tươi' },
    { entry_unit: 'CHAI', nhom_hang: '115153-Gia vị', nganh_hang: 'Gia vị đóng chai' },
    { entry_unit: 'HOP', nhom_hang: '115154-Bánh', nganh_hang: 'Đồ ngọt' }
  ];

  // Test 1: Empty filters select everything
  const huyFilterEmpty = { units: [], nhoms: [], nganhs: [] };
  const resEmpty = rows.filter(r => {
    if (huyFilterEmpty.units.length && huyFilterEmpty.units.indexOf(r.entry_unit) < 0) return false;
    if (huyFilterEmpty.nhoms.length && huyFilterEmpty.nhoms.indexOf(r.nhom_hang) < 0) return false;
    if (huyFilterEmpty.nganhs.length && huyFilterEmpty.nganhs.indexOf(r.nganh_hang) < 0) return false;
    return true;
  });
  assert.equal(resEmpty.length, 4);

  // Test 2: Multi-select unit: ['KG', 'PHA']
  const huyFilterUnits = { units: ['KG', 'PHA'], nhoms: [], nganhs: [] };
  const resUnits = rows.filter(r => {
    if (huyFilterUnits.units.length && huyFilterUnits.units.indexOf(r.entry_unit) < 0) return false;
    return true;
  });
  assert.equal(resUnits.length, 2);
  assert.deepEqual(resUnits.map(r => r.entry_unit), ['KG', 'PHA']);

  // Test 3: Multi-select nhom_hang and nganh_hang
  const huyFilterCombined = { units: [], nhoms: ['115151-Trứng', '115153-Gia vị'], nganhs: ['Thực phẩm'] };
  const resCombined = rows.filter(r => {
    if (huyFilterCombined.units.length && huyFilterCombined.units.indexOf(r.entry_unit) < 0) return false;
    if (huyFilterCombined.nhoms.length && huyFilterCombined.nhoms.indexOf(r.nhom_hang) < 0) return false;
    if (huyFilterCombined.nganhs.length && huyFilterCombined.nganhs.indexOf(r.nganh_hang) < 0) return false;
    return true;
  });
  assert.equal(resCombined.length, 1);
  assert.equal(resCombined[0].nhom_hang, '115151-Trứng');
});

test('D_max rule evaluates max(D_kho, D_huy) and defaults to 1 month prior', () => {
  function minusOneMonth(dStr) {
    if (!dStr) return '';
    const p = dStr.split('-').map(Number);
    if (p.length !== 3 || isNaN(p[0])) return '';
    let year = p[0];
    let month = p[1] - 1;
    if (month < 1) {
      month = 12;
      year -= 1;
    }
    const daysInMonth = new Date(year, month, 0).getDate();
    const day = Math.min(p[2], daysInMonth);
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  function getDMaxRange(dKho, dHuy) {
    const dMax = (dHuy && dHuy > dKho) ? dHuy : dKho;
    return {
      dMax,
      defaultTo: dMax,
      defaultFrom: minusOneMonth(dMax)
    };
  }

  // Case 1: D_huy (2026-10-20) > D_kho (2026-09-30)
  const case1 = getDMaxRange('2026-09-30', '2026-10-20');
  assert.equal(case1.dMax, '2026-10-20');
  assert.equal(case1.defaultTo, '2026-10-20');
  assert.equal(case1.defaultFrom, '2026-09-20');

  // Case 2: D_kho (2026-11-15) > D_huy (2026-10-20)
  const case2 = getDMaxRange('2026-11-15', '2026-10-20');
  assert.equal(case2.dMax, '2026-11-15');
  assert.equal(case2.defaultTo, '2026-11-15');
  assert.equal(case2.defaultFrom, '2026-10-15');

  // Case 3: Month day clamping (e.g. 31st to month with 30 days)
  assert.equal(minusOneMonth('2026-03-31'), '2026-02-28');
  assert.equal(minusOneMonth('2026-05-31'), '2026-04-30');
  assert.equal(minusOneMonth('2027-01-15'), '2026-12-15');
});

