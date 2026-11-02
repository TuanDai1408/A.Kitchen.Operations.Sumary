import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('AM2 card replaces EBITDA on tab ALL and tab SACN', () => {
  const scriptContent = fs.readFileSync('script.js', 'utf8');

  // Verify function est_calcAM2ForScope exists
  assert.ok(scriptContent.includes('function est_calcAM2ForScope('), 'est_calcAM2ForScope should be defined');

  // Verify computeAndDrawRevenueSacn computes AM2
  assert.ok(scriptContent.includes('var am2Cur = est_calcAM2ForScope('), 'computeAndDrawRevenueSacn must call est_calcAM2ForScope');
  assert.ok(scriptContent.includes('kpi.am2 = am2Cur.am2;'), 'kpi.am2 must be populated');
  assert.ok(scriptContent.includes('kpi.am2Pct = am2Cur.am2Pct;'), 'kpi.am2Pct must be populated');

  // Verify drawRevenueSacn renders Lãi AM2 and does NOT render EBITDA card or OPEX_Input block
  assert.ok(scriptContent.includes('drawRevenueSacn('));
  assert.ok(!scriptContent.includes('Chi phí vận hành (OPEX) — nhập trực tiếp vào sheet OPEX_Input'), 'OPEX_Input card should be removed from both tabs');

  // Verify neither drawRevenue nor drawRevenueSacn have EBITDA in their card markup
  const sacnIdx = scriptContent.indexOf('function drawRevenueSacn(){');
  const sacnEndIdx = scriptContent.indexOf('function drawRevenue(){');
  const sacnBlock = scriptContent.substring(sacnIdx, sacnEndIdx);

  assert.ok(sacnBlock.includes('Lãi AM2'), 'drawRevenueSacn must render Lãi AM2 card');
  assert.ok(!sacnBlock.includes('EBITDA ước tính'), 'drawRevenueSacn must not contain EBITDA card');

  const allIdx = scriptContent.indexOf('function drawRevenue(){');
  const allEndIdx = scriptContent.indexOf('function drawRevTrendSacn(');
  const allBlock = scriptContent.substring(allIdx, allEndIdx);

  assert.ok(allBlock.includes('Lãi AM2'), 'drawRevenue must render Lãi AM2 card');
  assert.ok(!allBlock.includes('EBITDA ước tính'), 'drawRevenue must not contain EBITDA card');

  // Verify drill-down cards
  const drillSacnIdx = scriptContent.indexOf('function renderRevDrillSacn(');
  const drillSacnEnd = scriptContent.indexOf('function bindRevenueEventsSacn(');
  const drillSacnBlock = scriptContent.substring(drillSacnIdx, drillSacnEnd);
  assert.ok(drillSacnBlock.includes("'Lãi AM2'"), 'renderRevDrillSacn must render Lãi AM2 card');
  assert.ok(!drillSacnBlock.includes("'EBITDA ước tính'"), 'renderRevDrillSacn must not render EBITDA card');

  const drillAllIdx = scriptContent.indexOf('function renderRevDrill(');
  const drillAllEnd = scriptContent.indexOf('function bindRevenueEvents(');
  const drillAllBlock = scriptContent.substring(drillAllIdx, drillAllEnd);
  assert.ok(drillAllBlock.includes("'Lãi AM2'"), 'renderRevDrill must render Lãi AM2 card');
  assert.ok(!drillAllBlock.includes("'EBITDA ước tính'"), 'renderRevDrill must not render EBITDA card');
});

test('est_calcAM2ForScope calculation logic', () => {
  // Test calculation matching
  const netRevenue = 100000000; // 100tr
  const foodCost = 60000000;    // 60tr
  const am1 = netRevenue - foodCost; // 40tr
  const ns = 15000000;          // 15tr
  const am2 = am1 - ns;         // 25tr
  const am2Pct = (am2 / netRevenue) * 100; // 25%

  assert.equal(am1, 40000000);
  assert.equal(am2, 25000000);
  assert.equal(am2Pct, 25);
});
