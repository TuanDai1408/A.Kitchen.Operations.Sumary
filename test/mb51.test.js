// =========================================================================
// UNIT TESTS FOR MB51 GOODS ISSUE MIGRATION & KPI PHA CALCULATION
// =========================================================================

import assert from "node:assert";
import test from "node:test";

function mapMb51Row(d) {
  const rowKey = d.row_hash || `${d.mat_doc}_${d.doc_item}_${d.mat_doc_year}`;
  const ngay = d.posting_date || d.doc_date || d.entry_date;
  const tenSite = d.site_name || "";
  const maSite = d.site || "";
  const maCode = d.material || "";
  const tenSP = d.material_desc || "";
  const entryUnit = String(d.entry_unit || "").trim().toUpperCase();
  const qty = Math.abs(Number(d.quantity || 0));
  const value = Math.abs(Number(d.amount_lc !== undefined && d.amount_lc !== null ? d.amount_lc : (d.ext_amount_lc || 0)));
  const donGia = qty > 0 ? value / qty : 0;
  const lyDo = d.doc_header_text || d.mov_type_text || "";
  const userName = d.user_name || "";
  const storLoc = d.stor_loc || "";
  const loaiHang = d.nhom_hang || d.nganh_hang || "";

  if (entryUnit === "PHA") {
    return {
      type: "PHA",
      row: {
        ngay,
        tenSite,
        maSite,
        suatHuy: qty,
        tongSuat: 0,
        entryUnit: "PHA",
        amount: value,
        maCode,
        tenSP,
        lyDo,
        userName,
        storLoc,
        nganhHang: d.nganh_hang || "",
        nhomHang: d.nhom_hang || "",
        matDoc: d.mat_doc || "",
        rowKey
      }
    };
  }

  return {
    type: "DISPOSAL",
    row: {
      ngay,
      tenSite,
      maSite,
      maCode,
      tenSP,
      loaiHang,
      dvt: d.entry_unit || "",
      qtyKg: qty,
      donGia,
      value,
      lyDo,
      userName,
      storLoc,
      matDoc: d.mat_doc || "",
      rowKey
    }
  };
}

function sumQtyByUnit(rows, unit) {
  if (!rows || !rows.length) return 0;
  var target = String(unit || 'KG').trim().toUpperCase();
  var sum = 0;
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    var u = String(r.entryUnit || r.dvt || '').trim().toUpperCase();
    if (u === target) {
      sum += Number(r.quantity !== undefined && r.quantity !== null ? r.quantity : (r.qtyKg || 0));
    }
  }
  return sum;
}

function topUnitsExcluding(rows, excludeUnits, limit) {
  if (!rows || !rows.length) return '';
  var exList = [];
  if (Array.isArray(excludeUnits)) {
    exList = excludeUnits.map(function (x) { return String(x || '').trim().toUpperCase(); });
  } else if (typeof excludeUnits === 'string' && excludeUnits) {
    exList = [String(excludeUnits).trim().toUpperCase()];
  } else {
    exList = ['KG'];
  }
  // Loại trừ cả PHA vì PHA là suất ăn hủy, không hiển thị số lượng PHA ở card Tiêu hủy NVL-BTP
  if (exList.indexOf('PHA') < 0) exList.push('PHA');
  if (exList.indexOf('KG') < 0) exList.push('KG');

  limit = limit || 3;
  var map = {};
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    var u = String(r.entryUnit || r.dvt || '').trim().toUpperCase();
    if (!u || exList.indexOf(u) >= 0) continue;
    var q = Number(r.quantity !== undefined && r.quantity !== null ? r.quantity : (r.qtyKg || 0));
    if (q > 0) {
      map[u] = (map[u] || 0) + q;
    }
  }
  var keys = Object.keys(map);
  if (!keys.length) return '';
  keys.sort(function (a, b) { return map[b] - map[a]; });
  var top = keys.slice(0, limit);
  return top.map(function (k) {
    var val = map[k];
    var valStr = (Math.round(val * 10) / 10).toLocaleString('vi-VN');
    return valStr + ' ' + k;
  }).join(' · ');
}

function rev_huyFromReport(huyRows, f, mb51PhaRows) {
  var out = { total: { suatHuy: 0, tongSuat: 0, pct: 0 }, bySite: {} };
  if ((!huyRows || !huyRows.length) && (!mb51PhaRows || !mb51PhaRows.length)) return out;

  var from = (f && f.from) || '', to = (f && f.to) || '';
  var sites = (f && f.sites && f.sites.length) ? f.sites : null;

  var norm = function (s) {
    return String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
  };

  var siteMatches = function (siteName, list) {
    if (!list || !list.length) return true;
    if (list.indexOf(siteName) >= 0) return true;
    var t = norm(siteName);
    for (var i = 0; i < list.length; i++) {
      var a = norm(list[i]);
      if (a === t || t.indexOf(a) >= 0 || a.indexOf(t) >= 0) return true;
    }
    return false;
  };

  var siteKeyCanonical = {};
  var resolveCanonicalKey = function (siteName) {
    if (!siteName) return '(Không tên)';
    var t = norm(siteName);
    var keys = Object.keys(siteKeyCanonical);
    for (var i = 0; i < keys.length; i++) {
      if (norm(keys[i]) === t) return siteKeyCanonical[keys[i]];
    }
    siteKeyCanonical[siteName] = siteName;
    return siteName;
  };

  // Group Report theo (siteKey, ngay)
  var reportBySiteDay = {};
  if (huyRows && huyRows.length) {
    huyRows.forEach(function (r) {
      if (from && r.ngay < from) return;
      if (to && r.ngay > to) return;
      if (sites && !siteMatches(r.tenSite, sites)) return;

      var sk = resolveCanonicalKey(r.tenSite);
      var ngay = r.ngay || '';
      if (!ngay) return;

      if (!reportBySiteDay[sk]) reportBySiteDay[sk] = {};
      if (!reportBySiteDay[sk][ngay]) {
        reportBySiteDay[sk][ngay] = { suatHuy: 0, tongSuat: 0, nguoiBaoCao: r.nguoiBaoCao || '' };
      }
      reportBySiteDay[sk][ngay].suatHuy += Number(r.suatHuy || 0);
      reportBySiteDay[sk][ngay].tongSuat += Number(r.tongSuat || 0);
      if (r.nguoiBaoCao && !reportBySiteDay[sk][ngay].nguoiBaoCao) {
        reportBySiteDay[sk][ngay].nguoiBaoCao = r.nguoiBaoCao;
      }
    });
  }

  // Group MB51 PHA theo (siteKey, ngay)
  var mb51BySiteDay = {};
  if (mb51PhaRows && mb51PhaRows.length) {
    mb51PhaRows.forEach(function (p) {
      if (from && p.ngay < from) return;
      if (to && p.ngay > to) return;
      if (sites && !siteMatches(p.tenSite, sites)) return;

      var sk = resolveCanonicalKey(p.tenSite);
      var ngay = p.ngay || '';
      if (!ngay) return;

      var suat = Number(p.suatHuy !== undefined && p.suatHuy !== null ? p.suatHuy : (p.quantity || 0));
      if (suat <= 0) return;

      if (!mb51BySiteDay[sk]) mb51BySiteDay[sk] = {};
      if (!mb51BySiteDay[sk][ngay]) {
        mb51BySiteDay[sk][ngay] = { suatHuy: 0, user: p.userName || p.user || 'MB51 SAP', lyDo: p.lyDo || '' };
      }
      mb51BySiteDay[sk][ngay].suatHuy += suat;
      if (p.userName && !mb51BySiteDay[sk][ngay].user) {
        mb51BySiteDay[sk][ngay].user = p.userName;
      }
    });
  }

  // Pipeline helper: Tổng suất theo (site, ngày) — LUÔN chỉ từ sheet Report
  function getTotalPortionsByDay(siteKey, date) {
    var rep = reportBySiteDay[siteKey] && reportBySiteDay[siteKey][date];
    return rep ? Number(rep.tongSuat || 0) : 0;
  }

  // Pipeline helper: Suất hủy theo (site, ngày) — Rule ưu tiên Report > 0 ? Report : MB51(PHA)
  function getPortionWasteByDay(siteKey, date) {
    var rep = reportBySiteDay[siteKey] && reportBySiteDay[siteKey][date];
    var repWaste = rep ? Number(rep.suatHuy || 0) : 0;
    if (repWaste > 0) {
      return {
        suatHuy: repWaste,
        nguoiBaoCao: (rep && rep.nguoiBaoCao) || 'Report',
        source: 'Report'
      };
    }
    var mb = mb51BySiteDay[siteKey] && mb51BySiteDay[siteKey][date];
    var mbWaste = mb ? Number(mb.suatHuy || 0) : 0;
    if (mbWaste > 0) {
      return {
        suatHuy: mbWaste,
        nguoiBaoCao: (mb && mb.user) || 'MB51 SAP',
        source: 'MB51'
      };
    }
    return { suatHuy: 0, nguoiBaoCao: '', source: 'None' };
  }

  var allSitesSet = {};
  Object.keys(reportBySiteDay).forEach(function (sk) { allSitesSet[sk] = 1; });
  Object.keys(mb51BySiteDay).forEach(function (sk) { allSitesSet[sk] = 1; });

  Object.keys(allSitesSet).forEach(function (sk) {
    out.bySite[sk] = { suatHuy: 0, tongSuat: 0, pct: 0, chiTiet: [] };

    var dateSet = {};
    if (reportBySiteDay[sk]) Object.keys(reportBySiteDay[sk]).forEach(function (d) { dateSet[d] = 1; });
    if (mb51BySiteDay[sk]) Object.keys(mb51BySiteDay[sk]).forEach(function (d) { dateSet[d] = 1; });

    var dates = Object.keys(dateSet).sort(function (a, b) { return a < b ? 1 : -1; });

    dates.forEach(function (date) {
      var dayTotalPortions = getTotalPortionsByDay(sk, date);
      var dayWasteInfo = getPortionWasteByDay(sk, date);
      var dayWastePortions = dayWasteInfo.suatHuy;

      out.bySite[sk].suatHuy += dayWastePortions;
      out.bySite[sk].tongSuat += dayTotalPortions;

      out.total.suatHuy += dayWastePortions;
      out.total.tongSuat += dayTotalPortions;

      if (dayWastePortions > 0) {
        var dayPct = dayTotalPortions > 0 ? (dayWastePortions / dayTotalPortions) * 100 : 0;
        out.bySite[sk].chiTiet.push({
          ngay: date,
          suatHuy: dayWastePortions,
          tongSuat: dayTotalPortions, // LUÔN từ sheet Report
          pct: dayPct,
          nguoiBaoCao: dayWasteInfo.nguoiBaoCao || '—',
          source: dayWasteInfo.source
        });
      }
    });

    out.bySite[sk].pct = out.bySite[sk].tongSuat > 0
      ? (out.bySite[sk].suatHuy / out.bySite[sk].tongSuat) * 100
      : 0;
  });

  out.total.pct = out.total.tongSuat > 0
    ? (out.total.suatHuy / out.total.tongSuat) * 100
    : 0;

  return out;
}

test("MB51 - PHA unit routes to mb51PhaRows with positive portion quantity", () => {
  const raw = {
    mat_doc: "8004905522",
    doc_item: "0001",
    mat_doc_year: "2026",
    posting_date: "2026-09-29",
    site: "K001",
    site_name: "MN Bếp Ăn Đại Học Hùng Vương",
    entry_unit: "PHA",
    quantity: -12,
    amount_lc: -206772,
    material: "5100000694",
    material_desc: "Thịt kho trứng",
    doc_header_text: "Xuất hủy cơm trưa",
    user_name: "AKT.SD04",
    stor_loc: "KL01"
  };

  const res = mapMb51Row(raw);
  assert.strictEqual(res.type, "PHA");
  assert.strictEqual(res.row.suatHuy, 12);
  assert.strictEqual(res.row.amount, 206772);
  assert.strictEqual(res.row.tenSite, "MN Bếp Ăn Đại Học Hùng Vương");
  assert.strictEqual(res.row.maSite, "K001");
  assert.strictEqual(res.row.maCode, "5100000694");
  assert.strictEqual(res.row.rowKey, "8004905522_0001_2026");
});

test("MB51 - Non-PHA unit routes to disposalRows (Kg, Tra, Qua, etc.)", () => {
  const raw = {
    mat_doc: "8004905523",
    doc_item: "0002",
    mat_doc_year: "2026",
    posting_date: "2026-09-29",
    site: "K001",
    site_name: "MN Bếp Ăn Đại Học Hùng Vương",
    entry_unit: "KG",
    quantity: -2.5,
    amount_lc: -50000,
    material: "2100000257",
    material_desc: "NVL Gạo",
    doc_header_text: "Hỏng do bảo quản",
    user_name: "AKT.SD04",
    stor_loc: "KL01"
  };

  const res = mapMb51Row(raw);
  assert.strictEqual(res.type, "DISPOSAL");
  assert.strictEqual(res.row.qtyKg, 2.5);
  assert.strictEqual(res.row.value, 50000);
  assert.strictEqual(res.row.donGia, 20000);
  assert.strictEqual(res.row.dvt, "KG");
  assert.strictEqual(res.row.tenSite, "MN Bếp Ăn Đại Học Hùng Vương");
});

test("MB51 - PHA rows are added to numerator of Tỷ lệ suất hủy for that site", () => {
  const reportRows = [
    { tenSite: "MN Bếp Ăn Đại Học Hùng Vương", ngay: "2026-09-20", suatHuy: 0, tongSuat: 1000, nguoiBaoCao: "A" },
    { tenSite: "MN Bếp Ăn Đại Học Hùng Vương", ngay: "2026-09-21", suatHuy: 0, tongSuat: 1000, nguoiBaoCao: "B" }
  ];

  const phaRows = [
    { tenSite: "MN Bếp Ăn Đại Học Hùng Vương", ngay: "2026-09-20", suatHuy: 10, quantity: 10, userName: "AKT.SD04" },
    { tenSite: "MN Bếp Ăn Đại Học Hùng Vương", ngay: "2026-09-21", suatHuy: 20, quantity: 20, userName: "AKT.SD04" }
  ];

  const res = rev_huyFromReport(reportRows, { from: "2026-09-01", to: "2026-09-30" }, phaRows);

  assert.strictEqual(res.total.tongSuat, 2000);
  assert.strictEqual(res.total.suatHuy, 30);
  assert.strictEqual(res.total.pct, (30 / 2000) * 100); // 1.5%

  const hv = res.bySite["MN Bếp Ăn Đại Học Hùng Vương"];
  assert.ok(hv);
  assert.strictEqual(hv.suatHuy, 30);
  assert.strictEqual(hv.tongSuat, 2000);
  assert.strictEqual(hv.pct, 1.5);
  assert.strictEqual(hv.chiTiet.length, 2);
});

test("MB51 - Date filtering works correctly in rev_huyFromReport", () => {
  const reportRows = [
    { tenSite: "Site A", ngay: "2026-09-10", suatHuy: 5, tongSuat: 500 },
    { tenSite: "Site A", ngay: "2026-10-05", suatHuy: 10, tongSuat: 500 }
  ];
  const phaRows = [
    { tenSite: "Site A", ngay: "2026-09-15", suatHuy: 5 },
    { tenSite: "Site A", ngay: "2026-10-08", suatHuy: 15 }
  ];

  // Filter only September
  const res = rev_huyFromReport(reportRows, { from: "2026-09-01", to: "2026-09-30" }, phaRows);
  assert.strictEqual(res.total.tongSuat, 500);
  assert.strictEqual(res.total.suatHuy, 10); // 5 from report + 5 from PHA
  assert.strictEqual(res.total.pct, 2.0);
});

test("sumQtyByUnit strictly counts only KG and excludes PHA, THÙNG, HỘP", () => {
  const rows = [
    { dvt: "KG", quantity: 15.5 },
    { entryUnit: "kg ", quantity: 4.5 },
    { entryUnit: "PHA", quantity: 20 },
    { dvt: "THÙNG", quantity: 8 },
    { entryUnit: "HỘP", quantity: 5 }
  ];

  const totalKg = sumQtyByUnit(rows, "KG");
  assert.strictEqual(totalKg, 20.0);
});

test("topUnitsExcluding extracts top 3 non-KG units and strictly excludes PHA", () => {
  const rows = [
    { entryUnit: "PHA", quantity: 12 },
    { dvt: "THÙNG", quantity: 8 },
    { entryUnit: "HỘP", quantity: 5 },
    { entryUnit: "KG", quantity: 100 },
    { entryUnit: "CHAI", quantity: 2 },
    { entryUnit: "L", quantity: 1 }
  ];

  // PHA is portion waste and must not be displayed on card Tiêu hủy NVL-BTP
  const topText = topUnitsExcluding(rows, "KG", 3);
  assert.strictEqual(topText, "8 THÙNG · 5 HỘP · 2 CHAI");
  assert.ok(!topText.includes("PHA"), "Must not contain PHA");
});

test("Priority rule prevents duplicate portion waste (Report > 0 vs MB51 PHA)", () => {
  // Scenario:
  // Site: Thuận An
  // Date 2026-09-20: Report has suatHuy = 15, MB51 PHA has 10 -> Must take 15 from Report (NOT 25)
  // Date 2026-09-21: Report has suatHuy = 0, MB51 PHA has 12 -> Must take 12 from MB51
  // Date 2026-09-22: No report row, MB51 PHA has 8 -> Must take 8 from MB51, tongSuat = 0 (strictly Report)
  const reportRows = [
    { tenSite: "MN Thuận An", ngay: "2026-09-20", suatHuy: 15, tongSuat: 800, nguoiBaoCao: "Bếp Trưởng" },
    { tenSite: "MN Thuận An", ngay: "2026-09-21", suatHuy: 0, tongSuat: 850, nguoiBaoCao: "Bếp Trưởng" }
  ];

  const phaRows = [
    { tenSite: "MN Thuận An", ngay: "2026-09-20", suatHuy: 10, quantity: 10, userName: "SAP.USER" },
    { tenSite: "MN Thuận An", ngay: "2026-09-21", suatHuy: 12, quantity: 12, userName: "SAP.USER" },
    { tenSite: "MN Thuận An", ngay: "2026-09-22", suatHuy: 8, quantity: 8, userName: "SAP.USER" }
  ];

  const res = rev_huyFromReport(reportRows, { from: "2026-09-01", to: "2026-09-30" }, phaRows);

  // Period total calculation:
  // 2026-09-20: 15 (Report takes precedence, no duplicate with 10)
  // 2026-09-21: 12 (Report = 0, fallback to MB51)
  // 2026-09-22: 8 (No report, fallback to MB51)
  // Total suatHuy = 15 + 12 + 8 = 35
  assert.strictEqual(res.total.suatHuy, 35);

  // Total tongSuat MUST strictly come from Report:
  // 2026-09-20: 800
  // 2026-09-21: 850
  // 2026-09-22: 0 (MB51 does NOT provide tongSuat)
  // Total tongSuat = 1650
  assert.strictEqual(res.total.tongSuat, 1650);

  const site = res.bySite["MN Thuận An"];
  assert.ok(site);
  assert.strictEqual(site.suatHuy, 35);
  assert.strictEqual(site.tongSuat, 1650);

  // Verify daily details
  const d20 = site.chiTiet.find((c) => c.ngay === "2026-09-20");
  assert.ok(d20);
  assert.strictEqual(d20.suatHuy, 15);
  assert.strictEqual(d20.tongSuat, 800);
  assert.strictEqual(d20.source, "Report");

  const d21 = site.chiTiet.find((c) => c.ngay === "2026-09-21");
  assert.ok(d21);
  assert.strictEqual(d21.suatHuy, 12);
  assert.strictEqual(d21.tongSuat, 850);
  assert.strictEqual(d21.source, "MB51");

  const d22 = site.chiTiet.find((c) => c.ngay === "2026-09-22");
  assert.ok(d22);
  assert.strictEqual(d22.suatHuy, 8);
  assert.strictEqual(d22.tongSuat, 0); // strictly 0, never filled from MB51
  assert.strictEqual(d22.source, "MB51");
});

test("Waste portion value calculation (suatHuy * asp)", () => {
  const suatHuy = 25;
  const asp = 32000;
  const giaTriHuy = Math.round(suatHuy * asp);
  assert.strictEqual(giaTriHuy, 800000);
});

test("est_isExcludedSite excludes MB Bếp ăn canteen G – Group and Megafarrm by default", () => {
  const EST_EXCLUDED_SITES = [
    'A.Kitchen - Miền Nam',
    'MN Bếp Ăn Đại Học Hùng Vương',
    'MB A.Kitchen - Hub An Khánh',
    'MN Kho Megafarrm',
    'MB Bếp ăn canteen G – Group',
    'MB Bếp ăn canteen G - Group'
  ];

  function est_isExcludedSite(siteName) {
    if (!siteName) return false;
    const sClean = String(siteName).trim().toLowerCase();
    if (/megafar/i.test(sClean)) return true;
    if (/g[\s\-_–—]*group/i.test(sClean)) return true;
    for (let i = 0; i < EST_EXCLUDED_SITES.length; i++) {
      const exClean = EST_EXCLUDED_SITES[i].trim().toLowerCase();
      if (sClean === exClean || sClean.indexOf(exClean) >= 0 || exClean.indexOf(sClean) >= 0) {
        return true;
      }
    }
    return false;
  }

  assert.strictEqual(est_isExcludedSite("MB Bếp ăn canteen G – Group"), true);
  assert.strictEqual(est_isExcludedSite("MB Bếp ăn canteen G - Group"), true);
  assert.strictEqual(est_isExcludedSite("MN Kho Megafarrm"), true);
  assert.strictEqual(est_isExcludedSite("MN A.Kitchen - Hub Thuận An"), false);
  assert.strictEqual(est_isExcludedSite("MB A Kitchen Hòa Bình"), false);
});

test("Revenue info banner content and target tab mapping for 3 tabs (Single Line)", () => {
  function akRevInfoBanner(text, targetTab, linkText) {
    return `<div class="ak-rev-info-banner"><span class="ak-rev-info-banner-text">${text}</span><span class="ak-rev-info-banner-arrow" data-switch-tab="${targetTab}">→</span><button class="ak-rev-info-banner-link" data-switch-tab="${targetTab}">${linkText}</button></div>`;
  }

  // 1) Tab "Doanh thu & Foodcost (ALL)"
  const b1 = akRevInfoBanner(
    'Số liệu theo hóa đơn đã xuất (mọi mô hình PKD SACN).',
    'sacn',
    'Doanh thu & Foodcost (SACN)'
  );
  assert.ok(b1.includes('Số liệu theo hóa đơn đã xuất (mọi mô hình PKD SACN).'));
  assert.ok(b1.includes('data-switch-tab="sacn"'));
  assert.ok(b1.includes('Doanh thu & Foodcost (SACN)'));

  // 2) Tab "Doanh thu & Foodcost (SACN)"
  const b2 = akRevInfoBanner(
    'Số liệu theo hóa đơn đã xuất (các site mô hình SACN).',
    'revenue-est',
    'Doanh thu ước tính'
  );
  assert.ok(b2.includes('Số liệu theo hóa đơn đã xuất (các site mô hình SACN).'));
  assert.ok(b2.includes('data-switch-tab="revenue-est"'));
  assert.ok(b2.includes('Doanh thu ước tính'));

  // 3) Tab "Doanh thu ước tính"
  const b3 = akRevInfoBanner(
    'Số liệu ước tính từ suất ăn báo cáo vận hành.',
    'sacn',
    'Doanh thu & Foodcost (SACN)'
  );
  assert.ok(b3.includes('Số liệu ước tính từ suất ăn báo cáo vận hành.'));
  assert.ok(b3.includes('data-switch-tab="sacn"'));
  assert.ok(b3.includes('Doanh thu & Foodcost (SACN)'));
});




