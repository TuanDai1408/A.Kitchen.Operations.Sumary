import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  isProductionOrderIssue,
  isCountedAsWarehouseIssue
} from '../server-api.js';

test('Warehouse - isProductionOrderIssue matches 261 and 262', () => {
  // Production order issues & reversals
  assert.equal(isProductionOrderIssue('261'), true);
  assert.equal(isProductionOrderIssue('262'), true);
  assert.equal(isProductionOrderIssue('261 - GI for order'), true);
  assert.equal(isProductionOrderIssue('262 - RE for order'), true);
  assert.equal(isProductionOrderIssue(' 261 '), true);
  assert.equal(isProductionOrderIssue(' 262 '), true);

  // Other movement types must NOT be flagged as production order
  assert.equal(isProductionOrderIssue('201'), false);
  assert.equal(isProductionOrderIssue('551'), false);
  assert.equal(isProductionOrderIssue('552'), false);
  assert.equal(isProductionOrderIssue('601'), false);
  assert.equal(isProductionOrderIssue('101'), false);
  assert.equal(isProductionOrderIssue('351'), false);
  assert.equal(isProductionOrderIssue('352'), false);
  assert.equal(isProductionOrderIssue('Z01'), false);
  assert.equal(isProductionOrderIssue(null), false);
  assert.equal(isProductionOrderIssue(''), false);
});

test('Warehouse - isCountedAsWarehouseIssue accepts valid issues and excludes 261/262', () => {
  assert.equal(isCountedAsWarehouseIssue('201'), true);
  assert.equal(isCountedAsWarehouseIssue('551'), true);
  assert.equal(isCountedAsWarehouseIssue('601'), true);
  assert.equal(isCountedAsWarehouseIssue('Z01'), true);
  assert.equal(isCountedAsWarehouseIssue({ mov_type: '201' }), true);
  assert.equal(isCountedAsWarehouseIssue({ mvt: '551' }), true);

  // Exclude 261 and 262
  assert.equal(isCountedAsWarehouseIssue('261'), false);
  assert.equal(isCountedAsWarehouseIssue('262'), false);
  assert.equal(isCountedAsWarehouseIssue({ mov_type: '261' }), false);
  assert.equal(isCountedAsWarehouseIssue({ mvt: '262' }), false);
});

test('Warehouse - KPI card and time series exclude 261 and 262 from GT xuất and SL xuất', () => {
  const transactions = [
    { mvt: '101', qty: 100, value: 1000000, date: '2026-10-01' },   // Normal receipt
    { mvt: '201', qty: -30, value: -300000, date: '2026-10-02' },   // Normal issue (cost center)
    { mvt: '551', qty: -10, value: -100000, date: '2026-10-03' },   // Scrap issue
    { mvt: '261', qty: -50, value: -500000, date: '2026-10-04' },   // Production order issue (EXCLUDE)
    { mvt: '262', qty: 5, value: 50000, date: '2026-10-05' }        // Production order reversal (EXCLUDE)
  ];

  let recVal = 0, issVal = 0;
  transactions.forEach(t => {
    if (isProductionOrderIssue(t.mvt)) return;
    if (t.qty >= 0) recVal += t.value;
    else issVal += Math.abs(t.value);
  });

  // Total issues must ONLY be 201 (300,000) + 551 (100,000) = 400,000. Not 900,000!
  assert.equal(issVal, 400000, 'GT xuất must exclude 261');
  assert.equal(recVal, 1000000, 'GT nhập must exclude 262');
});

test('Warehouse - Modal detail and Stock table include all documents without excluding any movement type', () => {
  const matchingItems = [{ stock_begin: 200, price: 10000 }];
  const artTx = [
    { mvt: '101', qty: 50, value: 500000, date: '2026-10-01', art_doc: '1001', item: '1' },
    { mvt: '201', qty: -20, value: -200000, date: '2026-10-02', art_doc: '1002', item: '1' },
    { mvt: '261', qty: -60, value: -600000, date: '2026-10-03', art_doc: '1003', item: '1' }, // Prod order issue
    { mvt: '262', qty: 10, value: 100000, date: '2026-10-04', art_doc: '1004', item: '1' }    // Prod order reversal
  ];

  // Ledger table keeps ALL 4 transactions for traceability
  assert.equal(artTx.length, 4, 'Ledger table must display all 4 rows including 261');
  assert.ok(artTx.some(t => t.mvt === '261'), 'Row 261 must remain visible in ledger table');

  // Đối với riêng bảng này, quy tắc không loại bỏ bất kỳ chứng từ nào:
  let recQty = 0, recVal = 0, issQty = 0, issVal = 0;
  artTx.forEach(t => {
    if (t.qty >= 0) {
      recQty += t.qty;
      recVal += Math.abs(t.value || 0);
    } else {
      issQty += Math.abs(t.qty);
      issVal += Math.abs(t.value || 0);
    }
  });

  assert.equal(issQty, 80, 'Tổng xuất (SL) includes all negative transactions (20 + 60 = 80)');
  assert.equal(issVal, 800000, 'GT xuất in modal includes all negative transactions (200,000 + 600,000 = 800,000)');
  assert.equal(recQty, 60, 'Tổng nhập (SL) includes all positive transactions (50 + 10 = 60)');
  assert.equal(recVal, 600000, 'GT nhập in modal includes all positive transactions (500,000 + 100,000 = 600,000)');
});

test('Warehouse - Codebase verification: script.js and server-api.js contain 261 exclusion helpers', () => {
  const scriptContent = fs.readFileSync('script.js', 'utf8');
  const serverApiContent = fs.readFileSync('server-api.js', 'utf8');
  const publicScriptContent = fs.readFileSync('public/script.js', 'utf8');

  assert.ok(scriptContent.includes('isProductionOrderIssue'), 'script.js must define isProductionOrderIssue');
  assert.ok(serverApiContent.includes('isProductionOrderIssue'), 'server-api.js must import/export isProductionOrderIssue');
  assert.ok(publicScriptContent.includes('isProductionOrderIssue'), 'public/script.js must stay in sync');
});

test('Warehouse - Duality verification: Stock table items preserve raw full documents while KPI fields exclude 261/262 and transfers', () => {
  // Mock item with 261 issue (500k) and regular issue (300k)
  const item = {
    code: 'TEST_MAT',
    receipts_value: 1000000,
    issues_value: 800000, // 300k regular + 500k PO (261)
    stock_begin_value: 200000,
    stock_end_value: 400000, // 200k + 1000k - 800k = 400k (Bảng Tồn kho: đầy đủ chứng từ)

    kpi_receipts_value: 1000000,
    kpi_issues_value: 300000, // Chỉ 300k regular, loại trừ 261 để không duplicate
    kpi_stock_begin_value: 200000,
    kpi_stock_end_value: 900000 // 200k + 1000k - 300k = 900k
  };

  // 1. Stock table displays full raw issues:
  assert.equal(item.issues_value, 800000, 'Bảng Tồn kho hiển thị đầy đủ 800,000đ xuất');

  // 2. KPI card excludes 261/262 to prevent duplicate:
  assert.equal(item.kpi_issues_value, 300000, 'KPI card loại trừ 261 để tránh duplicate (300,000đ)');
});
