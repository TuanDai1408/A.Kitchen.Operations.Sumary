// =========================================================================
// A.KITCHEN DASHBOARD - REVENUE & FOOD COST HANDLER
// Action: getRevenueRawData, getRevenueFoodCostData
// =========================================================================

import { supabase } from "../lib/db.ts";
import { mapTransactionRow, formatDate } from "../lib/transform.ts";
import { DEFAULT_NGUONG } from "../lib/nguong.ts";

/**
 * Action: getRevenueRawData
 * Đọc song song transactions, opex_input, report (suất hủy), disposal_of_goods
 */
export async function handleGetRevenueRawData(): Promise<any> {
  const [txRes, opexRes, reportRes, disposalRes] = await Promise.all([
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

    supabase
      .from("disposal_of_goods")
      .select("*")
      .order("ngay_lap", { ascending: true }),
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

  rows.forEach((r: any) => {
    if (r.site) siteSet.add(r.site);
    if (r.kenhBanHang) kenhSet.add(r.kenhBanHang);
    if (r.nhomSP) nhomSet.add(r.nhomSP);
    if (r.nvKinhDoanh) nvkdSet.add(r.nvKinhDoanh);
    if (r.tenKH) khSet.add(r.tenKH);
    if (r.ngay) dateSet.add(r.ngay);
  });

  const viSort = (a: string, b: string) => a.localeCompare(b, "vi");

  const dims = {
    sites: Array.from(siteSet).sort(viSort),
    kenh: Array.from(kenhSet).sort(viSort),
    nhomSP: Array.from(nhomSet).sort(viSort),
    nvkd: Array.from(nvkdSet).sort(viSort),
    khachHang: Array.from(khSet).sort(viSort),
    dates: Array.from(dateSet).sort(),
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

  // Chuẩn hóa disposalRows: value = qty_kg * don_gia
  const disposalRows = (disposalRes.data || []).map((d: any) => {
    const qtyKg = Number(d.qty_kg || 0);
    const donGia = Number(d.don_gia || 0);
    const value = d.value !== undefined && d.value !== null && Number(d.value) > 0
      ? Number(d.value)
      : (qtyKg * donGia);

    return {
      ngay: formatDate(d.ngay_lap),
      tenSite: d.ten_site || "",
      maSite: d.ma_site || "",
      maCode: d.ma_code || "",
      tenSP: d.ten_san_pham || d.ten_sp || "",
      loaiHang: d.loai_hang || "",
      qtyKg,
      donGia,
      value,
      lyDo: d.ly_do || "",
    };
  });

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
