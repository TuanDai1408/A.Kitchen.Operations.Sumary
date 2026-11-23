import { test } from 'node:test';
import assert from 'node:assert';
import { getKeHoachData } from '../server-api.js';
import fs from 'fs';

test('Ke Hoach SACN Filter - Backend scope separation and site exclusions', async () => {
  const allData = await getKeHoachData({ scope: 'all' });
  const sacnData = await getKeHoachData({ scope: 'sacn' });

  assert.ok(allData && allData.ok, 'getKeHoachData(all) should succeed');
  assert.ok(sacnData && sacnData.ok, 'getKeHoachData(sacn) should succeed');

  // Verify K003 is excluded in SACN, but Megafarm is KEPT
  const hasMienNamAll = allData.sites.some(s => /miền nam/i.test(s));
  const hasMienNamSacn = sacnData.sites.some(s => /miền nam/i.test(s));
  assert.strictEqual(hasMienNamAll, true, 'K003 (Miền Nam) must be in ALL sites');
  assert.strictEqual(hasMienNamSacn, false, 'K003 (Miền Nam) must be excluded in SACN sites');

  const hasMegafarmAll = allData.sites.some(s => /megafar/i.test(s));
  const hasMegafarmSacn = sacnData.sites.some(s => /megafar/i.test(s));
  assert.strictEqual(hasMegafarmAll, true, 'Megafarm must be in ALL sites');
  assert.strictEqual(hasMegafarmSacn, true, 'Megafarm must NOT be excluded in SACN sites');

  // Verify R515 has data before 2026-09-18 in ALL, but in SACN it only starts from 2026-09-18
  const sepAll = allData.periods.find(p => p.key === '2026-09');
  const sepSacn = sacnData.periods.find(p => p.key === '2026-09');
  assert.ok(sepAll && sepSacn, 'Sep 2026 period must exist');

  const r515All = sepAll.bySite['MB Bếp ăn canteen G – Group'];
  const r515Sacn = sepSacn.bySite['MB Bếp ăn canteen G – Group'];
  assert.ok(r515All && r515Sacn, 'R515 should exist in Sep 2026 for both');
  assert.ok(r515Sacn.DoanhThu.actual < r515All.DoanhThu.actual, 'R515 SACN revenue in Sep 2026 must be strictly lower than ALL because data before 2026-09-18 is excluded');
  assert.strictEqual(r515Sacn.DoanhThu.actual, 36756264, 'R515 SACN revenue in Sep 2026 must match exact sum >= 2026-09-18');

  // Verify Total Revenue in SACN is strictly lower than ALL
  const tongAll = sepAll.bySite[allData.siteTong].DoanhThu.actual;
  const tongSacn = sepSacn.bySite[sacnData.siteTong].DoanhThu.actual;
  assert.ok(tongSacn < tongAll, 'Total SACN revenue in Sep 2026 must be strictly lower than ALL');
});

test('Ke Hoach SACN Filter - Frontend markup and script logic', () => {
  const indexHtml = fs.readFileSync('index.html', 'utf8');
  const pubIndexHtml = fs.readFileSync('public/index.html', 'utf8');
  const sRoot = fs.readFileSync('script.js', 'utf8');
  const sPub = fs.readFileSync('public/script.js', 'utf8');

  // Check toggle button group in index.html and public/index.html
  [indexHtml, pubIndexHtml].forEach((html, i) => {
    const file = i === 0 ? 'index.html' : 'public/index.html';
    assert.ok(html.includes('id="pfScope"'), `${file} must contain #pfScope`);
    assert.ok(html.includes('data-v="all"'), `${file} must contain data-v="all"`);
    assert.ok(html.includes('data-v="sacn"'), `${file} must contain data-v="sacn"`);
    assert.ok(html.includes('Doanh thu tất cả'), `${file} must contain "Doanh thu tất cả"`);
    assert.ok(html.includes('Doanh thu SACN'), `${file} must contain "Doanh thu SACN"`);
  });

  // Check script.js and public/script.js parity
  [sRoot, sPub].forEach((s, i) => {
    const file = i === 0 ? 'script.js' : 'public/script.js';
    assert.ok(s.includes("scope:'all'"), `${file} must initialize PF.scope to 'all'`);
    assert.ok(s.includes('scope: PF.scope || \'all\''), `${file} must pass scope in loadKeHoach payload`);
    assert.ok(s.includes('sacn: (PF.scope === \'sacn\')'), `${file} must pass sacn flag in loadKeHoach payload`);
    assert.ok(s.includes('function kh_firstActualPeriodKey'), `${file} must define kh_firstActualPeriodKey`);
    assert.ok(s.includes('kh_firstActualPeriodKey'), `${file} must use kh_firstActualPeriodKey`);
    assert.ok(s.includes("'pfScope'"), `${file} must bind event listener for #pfScope`);
  });
});
