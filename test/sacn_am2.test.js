import test from 'node:test';
import assert from 'node:assert/strict';
import { getRevenueSummary } from '../server-api.js';

test('getRevenueSummary for SACN returns personnelBySiteKy, planSites and calculates AM2', async () => {
  const res = await getRevenueSummary({ sacn: true, from: '2026-07-01', to: '2026-07-31' });
  assert.equal(res.ok, true, 'Response must be ok');
  assert.ok(Array.isArray(res.personnelBySiteKy), 'personnelBySiteKy must be an array');
  assert.ok(res.personnelBySiteKy.length > 0, 'personnelBySiteKy must not be empty');
  assert.ok(Array.isArray(res.planSites), 'planSites must be an array');
  assert.ok(res.planSites.length > 0, 'planSites must not be empty');

  // Kiểm tra cấu trúc item nhân sự
  const sample = res.personnelBySiteKy[0];
  assert.ok(sample.site, 'personnel item has site');
  assert.ok(sample.ky, 'personnel item has ky');
  assert.equal(typeof sample.amount, 'number', 'amount is number');

  // Kiểm tra KPI backend có hasNS
  assert.ok(res.kpis, 'kpis exists');
  assert.equal(typeof res.kpis.am1, 'number', 'am1 is number');
  assert.equal(typeof res.kpis.am2, 'number', 'am2 is number');
});
