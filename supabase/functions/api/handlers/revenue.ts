// =========================================================================
// A.KITCHEN DASHBOARD - REVENUE & FOOD COST HANDLER
// Action: getRevenueRawData, getRevenueFoodCostData
// =========================================================================

import { supabase } from "../lib/db.ts";
import { mapTransactionRow, formatDate, computeIsReturn } from "../lib/transform.ts";
import { DEFAULT_NGUONG } from "../lib/nguong.ts";

async function fetchAllRows(table: string, select = "*", orderCol: string | null = null): Promise<any[]> {
  let all: any[] = [];
  let from = 0;
  const step = 1000;
  while (true) {
    let q = supabase.from(table).select(select).range(from, from + step - 1);
    if (orderCol) q = q.order(orderCol, { ascending: true });
    const { data, error } = await q;
    if (error) throw error;
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < step) break;
    from += step;
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
  const [rawTx, plRows] = await Promise.all([
    fetchAllRows("transactions_est", "*", "billing_date"),
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

  const dims = {
    sites: Array.from(siteSet).sort(viSort),
    dates: Array.from(dateSet).sort(),
    vungMien: Array.from(vungSet).sort(viSort),
    loaiCuaHang: Array.from(loaiSet).sort(viSort),
    kyOptions: Array.from(kySet).sort(),
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
