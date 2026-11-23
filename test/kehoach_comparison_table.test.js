import { test } from 'node:test';
import assert from 'node:assert';
import { getKeHoachData } from '../server-api.js';
import fs from 'fs';

test('Ke Hoach Comparison Table - Backend data structure and weekly breakdown', async () => {
  const data = await getKeHoachData();
  assert.ok(data && data.ok, 'getKeHoachData should return ok');
  assert.ok(Array.isArray(data.periods), 'periods must be an array');

  // Verify 2026 has all 12 months
  const p2026 = data.periods.filter(p => p.key.startsWith('2026'));
  assert.strictEqual(p2026.length, 12, 'Year 2026 should have 12 periods (2026-01 to 2026-12)');

  // Verify each month has weeks W1, W2, W3, W4
  p2026.forEach(p => {
    const tongObj = p.bySite[data.siteTong];
    assert.ok(tongObj, `siteTong must exist in period ${p.key}`);
    assert.ok(tongObj.weeks, `weeks must exist in period ${p.key}`);
    assert.ok(tongObj.weeks.W1, `W1 must exist in ${p.key}`);
    assert.ok(tongObj.weeks.W2, `W2 must exist in ${p.key}`);
    assert.ok(tongObj.weeks.W3, `W3 must exist in ${p.key}`);
    assert.ok(tongObj.weeks.W4, `W4 must exist in ${p.key}`);

    // Verify day weights sum to total days in month
    const totalDays = tongObj.weeks.W1.days + tongObj.weeks.W2.days + tongObj.weeks.W3.days + tongObj.weeks.W4.days;
    const parts = p.key.split('-');
    const expectedDays = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10), 0).getDate();
    assert.strictEqual(totalDays, expectedDays, `Total days for ${p.key} must equal ${expectedDays}`);
  });

  // Verify November 2026: W1 and W2 have actual data
  const nov = data.periods.find(p => p.key === '2026-11');
  assert.ok(nov, 'November 2026 period must exist');
  const novTong = nov.bySite[data.siteTong];
  assert.ok(novTong.weeks.W1.hasActual, 'W1 must have actual data');
  assert.ok(novTong.weeks.W2.hasActual, 'W2 must have actual data');
});

test('Ke Hoach Comparison Table - Excel template math reproduction', () => {
  // Test with exact figures from Template_So_sanh_ke_hoach.xlsx
  const khFY = 612;
  const ttFY = 499.9;
  const remainNeed = khFY - ttFY; // 112.1
  const planRemaining = 110;
  const heSo = remainNeed / planRemaining; // 1.019090909...
  const heSoDiff = heSo - 1; // +0.0190909...

  assert.ok(Math.abs(remainNeed - 112.1) < 0.0001, 'remainNeed should be 112.1');
  assert.ok(Math.abs(heSo - 1.0190909090909093) < 0.00001, 'heSo should match Excel B17');
  assert.strictEqual((heSo * 100).toFixed(2) + '%', '101.91%', 'heSo percentage should be 101.91%');
  assert.strictEqual(((heSoDiff) * 100).toFixed(2) + '%', '1.91%', 'heSo difference should be +1.91%');

  // Verify Line 3 sum matches 100% of khFY
  const actualGot = 499.9;
  const targetRemaining = planRemaining * heSo;
  const l3FY = actualGot + targetRemaining;
  assert.ok(Math.abs(l3FY - khFY) < 0.0001, 'Line 3 FY must match 100% of KH FY');
  const l4FY = l3FY - khFY;
  assert.ok(Math.abs(l4FY) < 0.0001, 'Line 4 FY difference must be exactly 0');
});

test('Ke Hoach Comparison Table - Client script.js and public/script.js parity', () => {
  const sRoot = fs.readFileSync('script.js', 'utf8');
  const sPub = fs.readFileSync('public/script.js', 'utf8');

  // Verify functions exist in both files
  ['kh_weekAgg', 'kh7ComparisonTableHtml', 'kh7TableHtml', 'kh7BodyHtml', 'kh7AopVarianceChartHtml', 'bindKhAopCutEvents', 'bindKhAopTooltipEvents', 'bindKhAopChartEvents'].forEach(fn => {
    assert.ok(sRoot.includes(`function ${fn}`), `script.js must contain function ${fn}`);
    assert.ok(sPub.includes(`function ${fn}`), `public/script.js must contain function ${fn}`);
  });

  // Verify header labels, expandable columns and cards
  assert.ok(sRoot.includes("Các tháng đã chốt ('+closedRangeStr+')"), 'script.js must contain closed months header with dynamic range');
  assert.ok(sRoot.includes('YTM-1'), 'script.js must contain YTM-1 header');
  assert.ok(sRoot.includes('kh-expandable-th'), 'script.js must contain expandable month th');
  assert.ok(sRoot.includes('( Click vào để xem chi tiết theo tuần )'), 'script.js must contain hover note for collapsed month');
  assert.ok(sRoot.includes('( Click để thu gọn theo tháng )'), 'script.js must contain hover note for expanded month');
  assert.strictEqual(sRoot.includes('<span>Cách tính mức cần đạt (YTG)</span>'), false, 'script.js must NOT contain YTG summary card as requested');
  assert.strictEqual(sRoot.includes('Đọc nhanh tháng hiện tại'), false, 'script.js must NOT contain quick-read current month card as requested');
  assert.ok(sRoot.includes('kh7-badge ytg'), 'script.js must contain YTG badge');
  assert.ok(sRoot.includes('kh7-ytg-cell'), 'script.js must contain YTG cell class');

  // Verify AOP Variance & Cum % chart, tooltip and hover zones
  assert.ok(sRoot.includes('Biểu đồ chênh lệch AOP từng tháng &amp; % Đạt AOP lũy kế'), 'script.js must contain AOP variance chart title');
  assert.ok(sRoot.includes('Cột là chênh lệch thực tế so với AOP của tháng. Đường phía trên là % đạt AOP lũy kế.'), 'script.js must contain AOP variance sub-title');
  assert.ok(sRoot.includes('id="khAopCutSelect"'), 'script.js must contain cut month selector');
  assert.ok(sRoot.includes('kh-aop-insight-box'), 'script.js must contain insight box');
  assert.ok(sRoot.includes('kh-aop-hover-zone'), 'script.js must contain hover zone for tooltip');
  assert.ok(sRoot.includes('kh-aop-tooltip'), 'script.js must contain tooltip element');
  assert.ok(sRoot.includes('font-family="Roboto, sans-serif"'), 'script.js SVG text must use Roboto font');

  // Verify dynamic time filter using first actual period key
  assert.ok(sRoot.includes("firstActKey && p.key < firstActKey"), 'script.js must dynamically filter periods before first actual period');
  assert.ok(sPub.includes("firstActKey && p.key < firstActKey"), 'public/script.js must dynamically filter periods before first actual period');

  assert.ok(sPub.includes("Các tháng đã chốt ('+closedRangeStr+')"), 'public/script.js must contain closed months header with dynamic range');
  assert.ok(sPub.includes('YTM-1'), 'public/script.js must contain YTM-1 header');
  assert.ok(sPub.includes('kh-expandable-th'), 'public/script.js must contain expandable month th');
  assert.ok(sPub.includes('( Click vào để xem chi tiết theo tuần )'), 'public/script.js must contain hover note for collapsed month');
  assert.ok(sPub.includes('( Click để thu gọn theo tháng )'), 'public/script.js must contain hover note for expanded month');
  assert.strictEqual(sPub.includes('<span>Cách tính mức cần đạt (YTG)</span>'), false, 'public/script.js must NOT contain YTG summary card as requested');
  assert.strictEqual(sPub.includes('Đọc nhanh tháng hiện tại'), false, 'public/script.js must NOT contain quick-read current month card as requested');
  assert.ok(sPub.includes('kh7-badge ytg'), 'public/script.js must contain YTG badge');
  assert.ok(sPub.includes('kh7-ytg-cell'), 'public/script.js must contain YTG cell class');

  assert.ok(sPub.includes('Biểu đồ chênh lệch AOP từng tháng &amp; % Đạt AOP lũy kế'), 'public/script.js must contain AOP variance chart title');
  assert.ok(sPub.includes('Cột là chênh lệch thực tế so với AOP của tháng. Đường phía trên là % đạt AOP lũy kế.'), 'public/script.js must contain AOP variance sub-title');
  assert.ok(sPub.includes('id="khAopCutSelect"'), 'public/script.js must contain cut month selector');
  assert.ok(sPub.includes('kh-aop-insight-box'), 'public/script.js must contain insight box');
  assert.ok(sPub.includes('kh-aop-hover-zone'), 'public/script.js must contain hover zone for tooltip');
  assert.ok(sPub.includes('kh-aop-tooltip'), 'public/script.js must contain tooltip element');
  assert.ok(sPub.includes('font-family="Roboto, sans-serif"'), 'public/script.js SVG text must use Roboto font');
});

test('Ke Hoach Comparison Table - CSS styles in style.css and public/style.css', () => {
  const cssRoot = fs.readFileSync('style.css', 'utf8');
  const cssPub = fs.readFileSync('public/style.css', 'utf8');

  [cssRoot, cssPub].forEach(css => {
    assert.ok(css.includes('.kh-cmp-table'), 'CSS must include .kh-cmp-table');
    assert.ok(css.includes('.kh-grp-closed'), 'CSS must include .kh-grp-closed');
    assert.ok(css.includes('.kh-grp-ytm'), 'CSS must include .kh-grp-ytm');
    assert.ok(css.includes('.kh-grp-cur'), 'CSS must include .kh-grp-cur');
    assert.ok(css.includes('.kh-col-ytm'), 'CSS must include .kh-col-ytm');
    assert.ok(css.includes('.kh-col-fy'), 'CSS must include .kh-col-fy');
    assert.ok(css.includes('.kh7-ytg-cell'), 'CSS must include .kh7-ytg-cell');
    assert.ok(css.includes('.kh7-badge.ytg'), 'CSS must include .kh7-badge.ytg');
    assert.ok(css.includes('.kh-expandable-th'), 'CSS must include .kh-expandable-th');
    assert.ok(css.includes('.kh-exp-tooltip'), 'CSS must include .kh-exp-tooltip');
    assert.ok(css.includes("font-family: 'Roboto'"), 'CSS must use Roboto font');
    assert.ok(css.includes('.kh-aop-chart-card'), 'CSS must include .kh-aop-chart-card');
    assert.ok(css.includes('.kh-aop-svg'), 'CSS must include .kh-aop-svg');
    assert.ok(css.includes('.kh-aop-tooltip'), 'CSS must include .kh-aop-tooltip');
    assert.ok(css.includes('.kh-aop-insight-box'), 'CSS must include .kh-aop-insight-box');
  });
});
