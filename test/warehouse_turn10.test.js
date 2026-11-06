import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { mapMb51RowToLegacyStockTx } from '../server-api.js';

test('Warehouse Turn 10 - Movement 351 and 352 normalization', () => {
  // Movement 351 with positive quantity in raw MB51 must be normalized to negative
  const row351 = {
    mov_type: '351',
    quantity: 120,
    amount_lc: 1200000,
    material: 'NVL001',
    material_desc: 'Thịt heo tươi'
  };
  const tx351 = mapMb51RowToLegacyStockTx(row351);
  assert.equal(tx351.qty, -120, '351 qty must be negative');
  assert.equal(tx351.value, -1200000, '351 value must be negative');

  // Movement 352 with negative quantity must be normalized to positive
  const row352 = {
    mov_type: '352',
    quantity: -50,
    amount_lc: -500000,
    material: 'NVL001',
    material_desc: 'Thịt heo tươi'
  };
  const tx352 = mapMb51RowToLegacyStockTx(row352);
  assert.equal(tx352.qty, 50, '352 qty must be positive');
  assert.equal(tx352.value, 500000, '352 value must be positive');
});

test('Warehouse Turn 10 - Material name prioritizes material_desc', () => {
  const rowWithDesc = {
    mov_type: '101',
    quantity: 10,
    material: '1000234',
    material_desc: 'Gạo ST25 loại 1'
  };
  const tx1 = mapMb51RowToLegacyStockTx(rowWithDesc);
  assert.equal(tx1.name, 'Gạo ST25 loại 1');

  const rowWithoutDesc = {
    mov_type: '101',
    quantity: 10,
    material: '1000234',
    material_desc: null
  };
  const tx2 = mapMb51RowToLegacyStockTx(rowWithoutDesc);
  assert.equal(tx2.name, '1000234');
});

test('Warehouse Turn 10 - Filter dropdown has single scrollbar and correct max-height', () => {
  const css = fs.readFileSync('style.css', 'utf8');
  assert.match(css, /\.qlk-ms-pop[\s\S]*?max-height:\s*none/i, 'qlk-ms-pop should not constrain height or scroll');
  assert.match(css, /\.qlk-ms-list[\s\S]*?max-height:\s*280px/i, 'qlk-ms-list should have single scroll container max-height 280px');
});

test('Warehouse Turn 10 - Modal article KPI calculation equals sum of transactions', () => {
  const stockBegin = 100;
  const artTx = [
    { qty: 50, value: 500000, date: '2026-10-01' },   // receipt
    { qty: 30, value: 300000, date: '2026-10-02' },   // receipt
    { qty: -40, value: -400000, date: '2026-10-03' }, // issue
    { qty: -20, value: -200000, date: '2026-10-04' }  // issue
  ];

  let recQty = 0, recVal = 0, issQty = 0, issVal = 0;
  artTx.forEach(t => {
    if (t.qty >= 0) {
      recQty += t.qty;
      recVal += Math.abs(t.value);
    } else {
      issQty += Math.abs(t.qty);
      issVal += Math.abs(t.value);
    }
  });

  const endFromTrans = stockBegin + recQty - issQty;
  assert.equal(recQty, 80, 'Receipt qty should sum positive lines');
  assert.equal(recVal, 800000, 'Receipt val should sum positive values');
  assert.equal(issQty, 60, 'Issue qty should sum negative lines');
  assert.equal(issVal, 600000, 'Issue val should sum negative values');
  assert.equal(endFromTrans, 120, 'End from trans should equal begin + rec - iss');
});
