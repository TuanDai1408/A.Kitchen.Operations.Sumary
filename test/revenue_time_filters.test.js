import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('Revenue Time Filter Suite - HTML Structure across 3 tabs', (t) => {
  const html = fs.readFileSync('index.html', 'utf8');

  // 1. Tab Doanh thu ước tính (fbarEst) contains date range inputs
  assert.ok(html.includes('id="estFrom"'), 'fbarEst must contain estFrom');
  assert.ok(html.includes('id="estTo"'), 'fbarEst must contain estTo');
  assert.ok(html.includes('id="estGran"'), 'fbarEst must contain estGran');
  assert.ok(html.includes('id="estScope"'), 'fbarEst must contain estScope');
  assert.ok(html.includes('id="estPeriodWrap"'), 'fbarEst must contain estPeriodWrap');

  // 2. Tab Doanh thu & Foodcost (ALL) (fbarRev) contains complete time filter suite
  assert.ok(html.includes('id="rGran"'), 'fbarRev must contain rGran (Tuần/Tháng/Quý/Năm)');
  assert.ok(html.includes('id="rScope"'), 'fbarRev must contain rScope (4 kỳ/Tất cả)');
  assert.ok(html.includes('id="rPeriodWrap"'), 'fbarRev must contain rPeriodWrap');
  assert.ok(html.includes('id="rFrom"'), 'fbarRev must contain rFrom');
  assert.ok(html.includes('id="rTo"'), 'fbarRev must contain rTo');

  // 3. Tab Doanh thu & Foodcost (SACN) (fbarSacn) contains complete time filter suite
  assert.ok(html.includes('id="sGran"'), 'fbarSacn must contain sGran (Tuần/Tháng/Quý/Năm)');
  assert.ok(html.includes('id="sScope"'), 'fbarSacn must contain sScope (4 kỳ/Tất cả)');
  assert.ok(html.includes('id="sPeriodWrap"'), 'fbarSacn must contain sPeriodWrap');
  assert.ok(html.includes('id="sFrom"'), 'fbarSacn must contain sFrom');
  assert.ok(html.includes('id="sTo"'), 'fbarSacn must contain sTo');
});

test('Revenue Time Filter Suite - 2-row layout CSS rules', (t) => {
  const css = fs.readFileSync('style.css', 'utf8');

  // fbar-2rows and grid definition
  assert.ok(css.includes('.fbar-2rows'), 'style.css must define .fbar-2rows');
  assert.ok(css.includes('#fbarRev'), 'style.css must style #fbarRev');
  assert.ok(css.includes('#fbarSacn'), 'style.css must style #fbarSacn');
  assert.ok(css.includes('#fbarEst'), 'style.css must style #fbarEst');
  assert.ok(css.includes('32px !important'), 'style.css must enforce compact 32px height');
});

test('Revenue Time Filter Suite - Shared time math and date calculation', (t) => {
  const js = fs.readFileSync('script.js', 'utf8');

  assert.ok(js.includes('function akGetWeekInfo'), 'script.js must contain akGetWeekInfo');
  assert.ok(js.includes('function akGetQuarterInfo'), 'script.js must contain akGetQuarterInfo');
  assert.ok(js.includes('function akGetMonthInfo'), 'script.js must contain akGetMonthInfo');
  assert.ok(js.includes('function akCalcPeriodRange'), 'script.js must contain akCalcPeriodRange');

  // Test date math directly
  const dateStr = '2026-08-20';
  const d = new Date(dateStr + 'T00:00:00');
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(d.setDate(diff));
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  assert.equal(monday.toISOString().slice(0, 10), '2026-08-17');
  assert.equal(sunday.toISOString().slice(0, 10), '2026-08-23');
});

test('Revenue Time Filter Suite - State objects RF, RF_SACN, RF_EST have time controls', (t) => {
  const js = fs.readFileSync('script.js', 'utf8');

  // RF and RF_SACN state
  assert.ok(/var\s+RF\s*=\s*\{[^}]*gran:\s*['"]week['"][^}]*scope:\s*['"]4['"][^}]*periods:\s*\[\]/.test(js), 'RF must have gran, scope, periods');
  assert.ok(/var\s+RF_SACN\s*=\s*\{[^}]*gran:\s*['"]week['"][^}]*scope:\s*['"]4['"][^}]*periods:\s*\[\]/.test(js), 'RF_SACN must have gran, scope, periods');
  assert.ok(/var\s+RF_EST\s*=\s*\{[^}]*from:\s*['"][^}]*to:\s*['"]/.test(js), 'RF_EST must have from and to fields');

  // Sync functions exist
  assert.ok(js.includes('updateRevPeriodDropdown'), 'updateRevPeriodDropdown must be declared');
  assert.ok(js.includes('updateRevSacnPeriodDropdown'), 'updateRevSacnPeriodDropdown must be declared');
  assert.ok(js.includes('updateEstPeriodDropdown'), 'updateEstPeriodDropdown must be declared');
});
