import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('Sidebar tab badges and structure in index.html and public/index.html', () => {
  const html = fs.readFileSync('index.html', 'utf8');
  const pubHtml = fs.readFileSync('public/index.html', 'utf8');

  assert.equal(html, pubHtml, 'index.html and public/index.html must be identical');

  const expectedBadges = [
    { code: 'T1', tab: 'overview', name: 'Báo cáo vận hành' },
    { code: 'T2', tab: 'site', name: 'Chi tiết theo Site' },
    { code: 'C1', tab: 'revenue', name: 'Doanh thu & Food Cost (ALL)' },
    { code: 'C2', tab: 'sacn', name: 'Doanh thu & Food Cost (SALES)' },
    { code: 'K1', tab: 'revenue-est', name: 'Doanh thu ước tính' },
    { code: 'K2', tab: 'kehoach', name: 'So sánh Kế hoạch' },
    { code: 'D1', tab: 'quanlykho', name: 'Quản lý kho' },
    { code: 'D2', tab: 'dinhduong', name: 'Thông tin dinh dưỡng' }
  ];

  expectedBadges.forEach(b => {
    assert.ok(html.includes(`data-code="${b.code}"`), `HTML must have data-code="${b.code}"`);
    assert.ok(html.includes(`data-tab="${b.tab}"`), `HTML must have data-tab="${b.tab}"`);
    assert.ok(html.includes(`>${b.code}</span>`), `HTML must render badge text ${b.code}`);
    assert.ok(html.includes(`title="${b.code} · ${b.name}"`), `HTML must have title with "${b.code} · ${b.name}"`);
  });

  // Check topbar title has badge element
  assert.ok(html.includes('page-title-badge'), 'pageTitle must include page-title-badge');
});

test('Sidebar CSS styling for badges and groups in style.css and public/style.css', () => {
  const css = fs.readFileSync('style.css', 'utf8');
  const pubCss = fs.readFileSync('public/style.css', 'utf8');

  assert.equal(css, pubCss, 'style.css and public/style.css must be identical');

  assert.ok(css.includes('.sb-badge'), 'CSS must define .sb-badge');
  assert.ok(css.includes('min-width: 28px'), 'Badge min-width must be 28px');
  assert.ok(css.includes('#f3f4f3'), 'Badge normal background must be #f3f4f3');
  assert.ok(css.includes('#d5d9d6'), 'Badge normal border must be #d5d9d6');
  assert.ok(css.includes('#5b6560'), 'Badge normal text must be #5b6560');
  assert.ok(css.includes('#1E7A4A'), 'Active badge background must be #1E7A4A');
  assert.ok(css.includes('.page-title-badge'), 'CSS must define .page-title-badge');
  assert.ok(css.includes('focus-visible'), 'CSS must define focus-visible for keyboard nav');
});

test('script.js SIDEBAR_TABS_CONFIG and hash mappings', () => {
  const js = fs.readFileSync('script.js', 'utf8');
  const pubJs = fs.readFileSync('public/script.js', 'utf8');

  assert.equal(js, pubJs, 'script.js and public/script.js must be identical');

  assert.ok(js.includes('SIDEBAR_TABS_CONFIG'), 'script.js must define SIDEBAR_TABS_CONFIG');
  assert.ok(js.includes('renderSidebarNav'), 'script.js must define renderSidebarNav');
  assert.ok(js.includes('initTabFromHash'), 'script.js must define initTabFromHash');
  assert.ok(js.includes('hashchange'), 'script.js must handle hashchange');
  assert.ok(js.includes('popstate'), 'script.js must handle popstate');
  assert.ok(js.includes('aria-current'), 'script.js must manage aria-current');
});
