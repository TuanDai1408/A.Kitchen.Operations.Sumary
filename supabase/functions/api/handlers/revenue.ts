// =========================================================================
// A.KITCHEN DASHBOARD - REVENUE & FOOD COST HANDLER
// Action: getRevenueRawData, getRevenueFoodCostData
// =========================================================================

import { supabase } from "../lib/db.ts";
import { mapTransactionRow, formatDate, computeIsReturn } from "../lib/transform.ts";
import { DEFAULT_NGUONG } from "../lib/nguong.ts";

async function fetchAllRows(
  table: string,
  select = "*",
  orderCol: string | null = null,
  fromDate: string | null = null,
  toDate: string | null = null,
  dateCol: string | null = null
): Promise<any[]> {
  let countQ = supabase.from(table).select("*", { count: "exact", head: true });
  if (fromDate && dateCol) countQ = countQ.gte(dateCol, fromDate);
  if (toDate && dateCol) countQ = countQ.lte(dateCol, toDate);
  const { count, error } = await countQ;
  if (error) throw error;
  if (!count) return [];

  const step = 1000;
  if (count <= step) {
    let q = supabase.from(table).select(select).range(0, count - 1);
    if (orderCol) q = q.order(orderCol, { ascending: true });
    if (fromDate && dateCol) q = q.gte(dateCol, fromDate);
    if (toDate && dateCol) q = q.lte(dateCol, toDate);
    const { data, error: qErr } = await q;
    if (qErr) throw qErr;
    return data || [];
  }

  const pages = Math.ceil(count / step);
  const promises: PromiseLike<any>[] = [];
  for (let i = 0; i < pages; i++) {
    const from = i * step;
    const to = Math.min(from + step - 1, count - 1);
    let q = supabase.from(table).select(select).range(from, to);
    if (orderCol) q = q.order(orderCol, { ascending: true });
    if (fromDate && dateCol) q = q.gte(dateCol, fromDate);
    if (toDate && dateCol) q = q.lte(dateCol, toDate);
    promises.push(q);
  }
  const results = await Promise.all(promises);
  let all: any[] = [];
  for (const r of results) {
    if (r.error) throw r.error;
    if (r.data) all.push(...r.data);
  }
  return all;
}

/**
 * Lấy dữ liệu tiêu hủy từ mb51_goods_issue (thay thế disposal_of_goods)
 * Tối ưu hóa truy vấn theo posting_date và site
 */
async function fetchMb51GoodsIssue(
  fromDate: string | null = null,
  toDate: string | null = null,
  siteFilter: string | string[] | null = null
): Promise<any[]> {
  const selectCols =
    "mat_doc,doc_item,mat_doc_year,posting_date,doc_date,entry_date,site,site_name,stor_loc,user_name,mov_type,mov_type_text,material,material_desc,doc_header_text,quantity,entry_unit,amount_lc,ext_amount_lc,qty_stock_unit,stock_unit,nganh_hang,nhom_hang,row_hash";
  let q = supabase.from("mb51_goods_issue").select(selectCols);

  if (fromDate) q = q.gte("posting_date", fromDate);
  if (toDate) q = q.lte("posting_date", toDate);

  if (siteFilter) {
    if (Array.isArray(siteFilter) && siteFilter.length > 0) {
      const isCodes = siteFilter.every((s) => /^[A-Z0-9_-]{3,6}$/i.test(s));
      if (isCodes) {
        q = q.in("site", siteFilter);
      } else {
        q = q.in("site_name", siteFilter);
      }
    } else if (typeof siteFilter === "string" && siteFilter.trim()) {
      if (/^[A-Z0-9_-]{3,6}$/i.test(siteFilter.trim())) {
        q = q.eq("site", siteFilter.trim());
      } else {
        q = q.eq("site_name", siteFilter.trim());
      }
    }
  }

  q = q.order("posting_date", { ascending: true });
  const { data, error } = await q;
  if (error) {
    console.warn("fetchMb51GoodsIssue error:", error.message);
    return [];
  }
  return data || [];
}

/**
 * Action: getRevenueRawData
 * Đọc song song transactions, opex_input, report (suất hủy), mb51_goods_issue
 */
export async function handleGetRevenueRawData(filtersParam?: any): Promise<any> {
  let filters: any = {};
  if (typeof filtersParam === "string") {
    try {
      filters = JSON.parse(filtersParam);
    } catch {}
  } else if (typeof filtersParam === "object" && filtersParam !== null) {
    filters = filtersParam;
  }

  const reqFrom = filters.from || null;
  const reqTo = filters.to || null;
  const siteFilter = filters.site || filters.sites || null;

  const [txRes, opexRes, reportRes, rawMb51] = await Promise.all([
    supabase
      .from("transactions")
      .select("*")
      .order("billing_date", { ascending: true }),

    supabase
      .from("opex_input")
      .select("*"),

    supabase
      .from("report")
      .select("ten_site, ngay_bao_cao, suat_huy, tong_suat, nguoi_bao_cao")
      .order("ngay_bao_cao", { ascending: true }),

    fetchMb51GoodsIssue(reqFrom, reqTo, siteFilter),
  ]);

  if (txRes.error) {
    throw new Error(`Lỗi truy vấn transactions: ${txRes.error.message}`);
  }

  const rawTx = txRes.data || [];
  const rows = rawTx.map(mapTransactionRow);

  const siteSet = new Set<string>();
  const kenhSet = new Set<string>();
  const nhomSet = new Set<string>();
  const nvkdSet = new Set<string>();
  const khSet = new Set<string>();
  const dateSet = new Set<string>();
  const vungSet = new Set<string>();
  const loaiSet = new Set<string>();

  rows.forEach((r: any) => {
    if (r.site) siteSet.add(r.site);
    const kName = r.tenKenhBanHang || r.ten_kenh_ban_hang || r.kenhBanHang;
    if (kName) kenhSet.add(kName);
    if (r.nhomSP) nhomSet.add(r.nhomSP);
    if (r.nvKinhDoanh) nvkdSet.add(r.nvKinhDoanh);
    if (r.tenKH) khSet.add(r.tenKH);
    if (r.ngay) dateSet.add(r.ngay);
    if (r.vungMien) vungSet.add(r.vungMien);
    if (r.loaiCuaHang) loaiSet.add(r.loaiCuaHang);
  });

  (rawMb51 || []).forEach((r: any) => {
    if (r.site_name) siteSet.add(r.site_name);
  });

  const viSort = (a: string, b: string) => a.localeCompare(b, "vi");

  const dims = {
    sites: Array.from(siteSet).sort(viSort),
    kenh: Array.from(kenhSet).sort(viSort),
    nhomSP: Array.from(nhomSet).sort(viSort),
    nvkd: Array.from(nvkdSet).sort(viSort),
    khachHang: Array.from(khSet).sort(viSort),
    dates: Array.from(dateSet).sort(),
    vungMien: Array.from(vungSet).sort(viSort),
    loaiCuaHang: Array.from(loaiSet).sort(viSort),
  };

  // Chuẩn hóa opexItems từ opex_input (site, ky, so_tien, cap_nhat_luc)
  const opexItems = (opexRes.data || []).map((o: any) => ({
    site: o.site || "ALL",
    period: o.ky || o.period || "ALL",
    amount: Number(o.so_tien || o.amount || 0),
    updatedAt: o.cap_nhat_luc || o.updated_at || new Date().toISOString(),
  }));

  // Chuẩn hóa huyRows (từ Report, không lấy từ billing)
  const huyRows = (reportRes.data || []).map((h: any) => ({
    tenSite: h.ten_site || "",
    ngay: formatDate(h.ngay_bao_cao),
    suatHuy: Number(h.suat_huy || 0),
    tongSuat: Number(h.tong_suat || 0),
    nguoiBaoCao: h.nguoi_bao_cao || "",
  }));

  // Xử lý mb51_goods_issue: deduplicate theo row_hash hoặc (mat_doc, doc_item, mat_doc_year)
  // Tách dòng:
  // - entry_unit === 'PHA' -> mb51PhaRows (cộng vào tử số Suất hủy cho site)
  const seenMb51 = new Set<string>();
  const mb51Rows: any[] = [];
  const mb51PhaRows: any[] = [];
  const disposalRows: any[] = [];

  for (const d of rawMb51 || []) {
    const rowKey = d.row_hash || `${d.mat_doc}_${d.doc_item}_${d.mat_doc_year}`;
    if (seenMb51.has(rowKey)) continue;
    seenMb51.add(rowKey);

    const ngay = formatDate(d.posting_date || d.doc_date || d.entry_date);
    const tenSite = d.site_name || "";
    const maSite = d.site || "";
    const maCode = d.material || "";
    const tenSP = d.material_desc || "";
    const entryUnit = String(d.entry_unit || "").trim().toUpperCase();
    const qty = Math.abs(Number(d.quantity || 0));
    const value = Math.abs(
      Number(
        d.amount_lc !== undefined && d.amount_lc !== null
          ? d.amount_lc
          : d.ext_amount_lc || 0
      )
    );
    const donGia = qty > 0 ? value / qty : 0;
    const lyDo = d.doc_header_text || d.mov_type_text || "";
    const userName = d.user_name || "";
    const storLoc = d.stor_loc || "";
    const loaiHang = d.nhom_hang || d.nganh_hang || "";

    const rowObj = {
      ngay,
      tenSite,
      maSite,
      maCode,
      tenSP,
      loaiHang,
      entryUnit,
      dvt: entryUnit,
      quantity: qty,
      qtyKg: entryUnit === "KG" ? qty : 0, // CHỈ tổng số lượng hủy có đơn vị tính = KG
      donGia,
      value,
      lyDo,
      userName,
      storLoc,
      nganhHang: d.nganh_hang || "",
      nhomHang: d.nhom_hang || "",
      matDoc: d.mat_doc || "",
      rowKey,
    };

    mb51Rows.push(rowObj);
    disposalRows.push(rowObj);

    if (entryUnit === "PHA") {
      mb51PhaRows.push({
        ngay,
        tenSite,
        maSite,
        suatHuy: qty,
        quantity: qty,
        tongSuat: 0,
        entryUnit: "PHA",
        dvt: "PHA",
        amount: value,
        value,
        maCode,
        tenSP,
        lyDo,
        userName,
        storLoc,
        nganhHang: d.nganh_hang || "",
        nhomHang: d.nhom_hang || "",
        matDoc: d.mat_doc || "",
        rowKey,
      });
    }
  }

  const nguong = {
    huyPct: DEFAULT_NGUONG.huyPct,
    foodCostMin: DEFAULT_NGUONG.foodCostMin,
    foodCostMax: DEFAULT_NGUONG.foodCostMax,
    topKhachHang: DEFAULT_NGUONG.topKhachHang,
  };

  return {
    ok: true,
    rows,
    dims,
    opexItems,
    huyRows,
    mb51Rows,
    mb51PhaRows,
    disposalRows,
    nguong,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Action: getRevenueFoodCostData (optional/fallback)
 */
export async function handleGetRevenueFoodCostData(): Promise<any> {
  return handleGetRevenueRawData();
}

/**
 * Action: getRevenueEstData
 * Đọc transactions_est và kehoach_pl_thang phục vụ giao ban tuần/tháng
 */
export async function handleGetRevenueEstData(filtersParam?: any): Promise<any> {
  let filters: any = {};
  if (typeof filtersParam === "string") {
    try { filters = JSON.parse(filtersParam); } catch {}
  } else if (typeof filtersParam === "object" && filtersParam !== null) {
    filters = filtersParam;
  }

  const granular = filters.granular || filters.gran || "week";
  const recentBuckets = Number(filters.recentBuckets) || 4;
  const maxDateStr = "2026-11-09";

  let reqFrom = filters.from || "";
  let reqTo = filters.to || "";
  if (!reqFrom && !filters.all) {
    const maxD = new Date(maxDateStr + "T00:00:00");
    if (granular === "week") {
      const dFrom = new Date(maxD.getTime() - (recentBuckets * 7 - 1) * 86400000);
      reqFrom = dFrom.toISOString().slice(0, 10);
    } else if (granular === "quarter") {
      const curQ = Math.floor(maxD.getMonth() / 3) + 1;
      const qStartMonth = (curQ - 1) * 3;
      const dFrom = new Date(maxD.getFullYear(), qStartMonth - (recentBuckets - 1) * 3, 1);
      reqFrom = dFrom.toISOString().slice(0, 10);
    } else if (granular === "year") {
      const dFrom = new Date(maxD.getFullYear() - (recentBuckets - 1), 0, 1);
      reqFrom = dFrom.toISOString().slice(0, 10);
    } else {
      const y = maxD.getFullYear();
      const m = maxD.getMonth();
      const dFrom = new Date(y, m - (recentBuckets - 1), 1);
      const fromY = dFrom.getFullYear();
      const fromM = String(dFrom.getMonth() + 1).padStart(2, "0");
      reqFrom = `${fromY}-${fromM}-01`;
    }
    if (!reqTo) {
    if (granular === "month") {
      const maxD = new Date(maxDateStr + "T00:00:00");
      const lastDayOfMonth = new Date(maxD.getFullYear(), maxD.getMonth() + 1, 0).getDate();
      const maxM = String(maxD.getMonth() + 1).padStart(2, "0");
      reqTo = `${maxD.getFullYear()}-${maxM}-${String(lastDayOfMonth).padStart(2, "0")}`;
    } else {
      reqTo = maxDateStr;
    }
  }
  }

  const [rawTx, plRows] = await Promise.all([
    fetchAllRows("transactions_est", "*", "billing_date", reqFrom || null, reqTo || null, "billing_date"),
    fetchAllRows("kehoach_pl_thang", "*", "ky"),
  ]);

  const rows = (rawTx || []).map((r: any) => {
    const soLuong = Number(r.so_luong || 0);
    const thanhTienTruocThue = Number(r.thanh_tien_truoc_thue || 0);
    const chietKhau = Number(r.ck_truoc_thue || r.chiet_khau || 0);
    const netRevenue = thanhTienTruocThue - chietKhau;
    const foodCost = Number(r.gia_von || 0);
    const vungMien = (r.vung_mien !== null && r.vung_mien !== undefined) ? String(r.vung_mien).trim() : "";
    const loaiCuaHang = (r.loai_cua_hang !== null && r.loai_cua_hang !== undefined) ? String(r.loai_cua_hang).trim() : "";
    const tenKenhBanHang = (r.ten_kenh_ban_hang !== null && r.ten_kenh_ban_hang !== undefined && String(r.ten_kenh_ban_hang).trim())
      ? String(r.ten_kenh_ban_hang).trim()
      : (r.kenh_ban_hang ? String(r.kenh_ban_hang).trim() : "");
    const ngay = formatDate(r.billing_date);
    const ky = (ngay ? ngay.substring(0, 7) : "") || r.ky_uoc_tinh || "";

    return {
      id: r.id,
      maSite: r.ma_cua_hang || "",
      ma_cua_hang: r.ma_cua_hang || "",
      site: r.ten_cua_hang || "",
      ten_cua_hang: r.ten_cua_hang || "",
      tenKH: r.ten_kh || r.ten_khach_hang || "",
      ten_kh: r.ten_kh || r.ten_khach_hang || "",
      ngay,
      billing_date: ngay,
      ky,
      soLuong,
      so_luong: soLuong,
      dvt: r.dvt || "",
      netRevenue,
      thanhTien: netRevenue,
      thanh_tien: netRevenue,
      foodCost,
      giaVon: foodCost,
      gia_von: foodCost,
      nhomSP: r.nhom_sp || "",
      nhom_sp: r.nhom_sp || "",
      nganhHang: r.nganh_hang || "",
      nganh_hang: r.nganh_hang || "",
      kenhBanHang: r.kenh_ban_hang || "",
      kenh_ban_hang: r.kenh_ban_hang || "",
      tenKenhBanHang,
      ten_kenh_ban_hang: tenKenhBanHang,
      vungMien,
      vung_mien: vungMien,
      loaiCuaHang,
      loai_cua_hang: loaiCuaHang,
      soHoaDon: r.so_hoa_don || "",
      isReturn: computeIsReturn(r),
      is_return: computeIsReturn(r),
      reference: r.reference || "",
      ghiChu: r.ghi_chu || ""
    };
  });

  const siteSet = new Set<string>();
  const dateSet = new Set<string>();
  const vungSet = new Set<string>();
  const loaiSet = new Set<string>();
  const kySet = new Set<string>();
  const kenhSet = new Set<string>();
  const nhomSet = new Set<string>();

  rows.forEach((r: any) => {
    if (r.site) siteSet.add(r.site);
    if (r.ngay) dateSet.add(r.ngay);
    if (r.vungMien) vungSet.add(r.vungMien);
    if (r.loaiCuaHang) loaiSet.add(r.loaiCuaHang);
    if (r.ky) kySet.add(r.ky);
    if (r.tenKenhBanHang) kenhSet.add(r.tenKenhBanHang);
    if (r.nhomSP) nhomSet.add(r.nhomSP);
  });

  const viSort = (a: string, b: string) => a.localeCompare(b, "vi");

  const planMap: Record<string, any> = {};
  const personnelBySiteKy: any[] = [];
  (plRows || []).forEach((p: any) => {
    const s = String(p.site || "").trim();
    const k = String(p.ky || "").trim();
    if (!s || !k) return;
    kySet.add(k);
    const key = `${s}|${k}`;
    if (!planMap[key]) {
      planMap[key] = { site: s, ky: k, doanhThu: 0, foodCost: 0, laiGop: 0, chiPhiNhanSu: 0 };
    }
    const val = Number(p.gia_tri || 0);
    if (p.hang_muc === "DoanhThu") planMap[key].doanhThu = val;
    else if (p.hang_muc === "FoodCost") planMap[key].foodCost = val;
    else if (p.hang_muc === "LaiGop") planMap[key].laiGop = val;
    else if (p.hang_muc === "ChiPhiNhanSu") {
      planMap[key].chiPhiNhanSu = val;
      personnelBySiteKy.push({ site: s, ky: k, amount: val });
    }
  });

  const planBySiteKy = Object.values(planMap);

  const sortedDates = Array.from(dateSet).sort();
  const sortedPeriods = Array.from(kySet).sort().reverse();
  const dims = {
    sites: Array.from(siteSet).sort(viSort),
    dates: sortedDates,
    allDates: sortedDates,
    periods: sortedPeriods,
    vungMien: Array.from(vungSet).sort(viSort),
    loaiCuaHang: Array.from(loaiSet).sort(viSort),
    kyOptions: sortedPeriods,
    kenh: Array.from(kenhSet).sort(viSort),
    nhomSP: Array.from(nhomSet).sort(viSort),
  };

  return {
    ok: true,
    updatedAt: new Date().toISOString(),
    dims,
    rows,
    planBySiteKy,
    personnelBySiteKy,
    nguong: {
      foodCostMax: 62,
      foodCostMin: DEFAULT_NGUONG.foodCostMin || 30,
      am2Min: 12,
      planPctMin: 95,
      huyPct: DEFAULT_NGUONG.huyPct || 1.5,
    },
  };
}

export async function handleGetRevenueSummary(filtersParam?: any): Promise<any> {
  const full = await handleGetRevenueRawData(filtersParam);
  const rows = full.rows || [];

  // 1. byCustomer
  const khMap: Record<string, any> = {};
  rows.forEach((r: any) => {
    const kh = r.tenKH || r.ten_kh || "(Không tên KH)";
    if (!khMap[kh]) khMap[kh] = { key: kh, customer: kh, ten_kh: kh, ma_kh: r.ma_kh || "", netRevenue: 0, netRev: 0, foodCost: 0, cogs: 0, salesQty: 0, qty: 0 };
    const net = Number(r.netRevenue || r.thanhTien || 0);
    const fc = Number(r.foodCost || r.giaVon || 0);
    const sl = Number(r.soLuong || r.so_luong || 0);
    khMap[kh].netRevenue += net;
    khMap[kh].netRev += net;
    khMap[kh].foodCost += fc;
    khMap[kh].cogs += fc;
    khMap[kh].salesQty += sl;
    khMap[kh].qty += sl;
  });
  const byCustomer = Object.values(khMap).sort((a: any, b: any) => b.netRevenue - a.netRevenue).map((c: any) => ({
    ...c,
    grossProfit: c.netRevenue - c.foodCost,
    foodCostPct: c.netRevenue > 0 ? (c.foodCost / c.netRevenue) * 100 : 0,
    fcPct: c.netRevenue > 0 ? (c.foodCost / c.netRevenue) * 100 : 0
  })).slice(0, 50);

  // 2. topProductsByRev & topProductsByFc
  const prodMap: Record<string, any> = {};
  rows.forEach((r: any) => {
    const p = r.tenSP || r.ten_sp || "Sản phẩm";
    if (!prodMap[p]) prodMap[p] = { key: p, name: p, ma_sp: r.ma_sp || "", ten_sp: p, group: r.nhomSP || r.nhom_sp || "", netRevenue: 0, netRev: 0, foodCost: 0, cogs: 0, salesQty: 0, qty: 0, dvt: r.dvt || "" };
    const net = Number(r.netRevenue || r.thanhTien || 0);
    const fc = Number(r.foodCost || r.giaVon || 0);
    const sl = Number(r.soLuong || r.so_luong || 0);
    prodMap[p].netRevenue += net;
    prodMap[p].netRev += net;
    prodMap[p].foodCost += fc;
    prodMap[p].cogs += fc;
    prodMap[p].salesQty += sl;
    prodMap[p].qty += sl;
  });
  const prods = Object.values(prodMap).map((p: any) => ({
    ...p,
    grossProfit: p.netRevenue - p.foodCost,
    foodCostPct: p.netRevenue > 0 ? (p.foodCost / p.netRevenue) * 100 : 0,
    fcPct: p.netRevenue > 0 ? (p.foodCost / p.netRevenue) * 100 : 0
  }));
  const topProductsByRev = prods.slice().sort((a: any, b: any) => b.netRevenue - a.netRevenue).slice(0, 20);
  const topProductsByFc = prods.filter((p: any) => p.netRevenue >= 100000).sort((a: any, b: any) => b.foodCostPct - a.foodCostPct).slice(0, 20);

  // 3. siteDetail
  const siteDetail: Record<string, any> = {};
  (full.bySite || []).forEach((s: any) => {
    const sRows = rows.filter((r: any) => (r.site || r.ten_cua_hang || "Chưa rõ") === s.site);
    const sProds: Record<string, any> = {};
    const sCusts: Record<string, any> = {};
    sRows.forEach((r: any) => {
      const p = r.tenSP || r.ten_sp || "SP";
      if (!sProds[p]) sProds[p] = { key: p, name: p, ten_sp: p, netRevenue: 0, foodCost: 0, soLuong: 0, salesQty: 0 };
      const net = Number(r.netRevenue || r.thanhTien || 0);
      const fc = Number(r.foodCost || r.giaVon || 0);
      const sl = Number(r.soLuong || r.so_luong || 0);
      sProds[p].netRevenue += net;
      sProds[p].foodCost += fc;
      sProds[p].soLuong += sl;
      sProds[p].salesQty += sl;

      const c = r.tenKH || r.ten_kh || "(Không tên KH)";
      if (!sCusts[c]) sCusts[c] = { key: c, customer: c, ten_kh: c, netRevenue: 0, foodCost: 0, grossProfit: 0, cogs: 0, foodCostPct: 0 };
      sCusts[c].netRevenue += net;
      sCusts[c].foodCost += fc;
      sCusts[c].cogs += fc;
    });
    const sProdList = Object.values(sProds).map((p: any) => ({
      ...p,
      grossProfit: p.netRevenue - p.foodCost,
      foodCostPct: p.netRevenue > 0 ? (p.foodCost / p.netRevenue) * 100 : 0
    }));
    const sCustList = Object.values(sCusts).map((c: any) => ({
      ...c,
      grossProfit: c.netRevenue - c.foodCost,
      foodCostPct: c.netRevenue > 0 ? (c.foodCost / c.netRevenue) * 100 : 0
    })).sort((a: any, b: any) => b.netRevenue - a.netRevenue);

    siteDetail[s.site] = {
      kpi: s,
      byKhachHang: sCustList,
      byCustomer: sCustList,
      topSanPham: sProdList.slice().sort((a: any, b: any) => b.netRevenue - a.netRevenue).slice(0, 20),
      topFoodCost: sProdList.filter((p: any) => p.netRevenue >= 100000).sort((a: any, b: any) => b.foodCostPct - a.foodCostPct).slice(0, 15),
      huyChiTiet: (full.discardByDay || []).filter((h: any) => h.site === s.site),
      discardByDay: (full.discardByDay || []).filter((h: any) => h.site === s.site)
    };
  });

  const aggRowsMap = new Map<string, any>();
  rows.forEach((r: any) => {
    const k = `${r.ngay}|${r.site}|${r.nhomSP}|${r.tenKenhBanHang}|${r.dvt || ""}`;
    let it = aggRowsMap.get(k);
    if (!it) {
      it = {
        id: r.id,
        ngay: r.ngay,
        billing_date: r.billing_date,
        site: r.site,
        ten_cua_hang: r.site,
        maSite: r.maSite,
        ma_cua_hang: r.maSite,
        nhomSP: r.nhomSP,
        nhom_sp: r.nhomSP,
        tenKenhBanHang: r.tenKenhBanHang,
        vungMien: r.vungMien,
        loaiCuaHang: r.loaiCuaHang,
        dvt: r.dvt,
        soLuong: 0,
        so_luong: 0,
        thanhTien: 0,
        thanh_tien: 0,
        netRevenue: 0,
        foodCost: 0,
        giaVon: 0,
        gia_von: 0,
        isReturn: false,
        is_return: false
      };
      aggRowsMap.set(k, it);
    }
    it.soLuong += (r.soLuong || 0);
    it.so_luong += (r.soLuong || 0);
    it.thanhTien += (r.netRevenue || 0);
    it.thanh_tien += (r.netRevenue || 0);
    it.netRevenue += (r.netRevenue || 0);
    it.foodCost += (r.foodCost || 0);
    it.giaVon += (r.foodCost || 0);
    it.gia_von += (r.foodCost || 0);
  });

  return {
    ...full,
    isSummary: true,
    rows: Array.from(aggRowsMap.values()),
    byCustomer,
    byKhachHang: byCustomer,
    topProductsByRev,
    topProductsByFc,
    topSanPham: topProductsByRev,
    topFoodCost: topProductsByFc,
    discardNvlBySite: full.discardNvlBySite || full.discardBySite || [],
    discardBySite: full.discardNvlBySite || full.discardBySite || [],
    discardByDay: full.discardByDay || full.huyChiTiet || [],
    huyChiTiet: full.discardByDay || full.huyChiTiet || [],
    siteDetail: Object.keys(siteDetail).length ? siteDetail : (full.siteDetail || {})
  };
}

export async function handleGetRevenueEstSummary(filtersParam?: any): Promise<any> {
  const full = await handleGetRevenueEstData(filtersParam);
  const aggMap = new Map<string, any>();
  (full.rows || []).forEach((r: any) => {
    const k = `${r.ngay}|${r.site}|${r.nhomSP}|${r.tenKenhBanHang}|${r.dvt || ""}`;
    let it = aggMap.get(k);
    if (!it) {
      it = {
        id: r.id,
        maSite: r.maSite,
        ma_cua_hang: r.maSite,
        site: r.site,
        ten_cua_hang: r.site,
        tenKH: r.tenKH || "",
        ten_kh: r.ten_kh || "",
        ngay: r.ngay,
        billing_date: r.ngay,
        ky: r.ky,
        soLuong: 0,
        so_luong: 0,
        dvt: r.dvt,
        netRevenue: 0,
        thanhTien: 0,
        thanh_tien: 0,
        foodCost: 0,
        giaVon: 0,
        gia_von: 0,
        nhomSP: r.nhomSP,
        nhom_sp: r.nhomSP,
        nganhHang: r.nganhHang || "",
        nganh_hang: r.nganhHang || "",
        kenhBanHang: r.kenhBanHang || "",
        kenh_ban_hang: r.kenhBanHang || "",
        tenKenhBanHang: r.tenKenhBanHang,
        ten_kenh_ban_hang: r.tenKenhBanHang,
        vungMien: r.vungMien,
        vung_mien: r.vungMien,
        loaiCuaHang: r.loaiCuaHang,
        loai_cua_hang: r.loaiCuaHang,
        soHoaDon: r.soHoaDon || "",
        isReturn: false,
        is_return: false,
        reference: r.reference || "",
        ghiChu: r.ghiChu || ""
      };
      aggMap.set(k, it);
    }
    it.soLuong += (r.soLuong || 0);
    it.so_luong += (r.soLuong || 0);
    it.netRevenue += (r.netRevenue || 0);
    it.thanhTien += (r.netRevenue || 0);
    it.thanh_tien += (r.netRevenue || 0);
    it.foodCost += (r.foodCost || 0);
    it.giaVon += (r.foodCost || 0);
    it.gia_von += (r.foodCost || 0);
  });

  return {
    ...full,
    isSummary: true,
    rows: Array.from(aggMap.values())
  };
}
