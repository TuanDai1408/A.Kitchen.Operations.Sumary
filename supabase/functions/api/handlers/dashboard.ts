// =========================================================================
// A.KITCHEN DASHBOARD - DASHBOARD HANDLER
// Actions: getDataVersion, getDashboardData
// =========================================================================

import { supabase } from "../lib/db.ts";
import { mapReportRow } from "../lib/transform.ts";
import { DEFAULT_NGUONG } from "../lib/nguong.ts";

/**
 * Action: getDataVersion
 * Kiểm tra phiên bản dữ liệu hiện tại để polling realtime mỗi 10s
 */
export async function handleGetDataVersion(): Promise<any> {
  const now = new Date().toISOString();
  try {
    const { data, error } = await supabase
      .from("data_version")
      .select("version, updated_at")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !data) {
      return {
        version: "1.0.0",
        updatedAt: now,
        serverTime: now,
      };
    }

    return {
      version: String(data.version || "1.0.0"),
      updatedAt: data.updated_at || now,
      serverTime: now,
    };
  } catch (err: any) {
    return {
      version: "1.0.0",
      updatedAt: now,
      serverTime: now,
      warning: err.message,
    };
  }
}

/**
 * Action: getDashboardData
 * Lấy toàn bộ danh sách báo cáo vận hành hàng ngày (Report) và các chiều lọc
 */
export async function handleGetDashboardData(): Promise<any> {
  const [versionRes, reportRes, revMonthlyRes] = await Promise.all([
    supabase
      .from("data_version")
      .select("version, updated_at")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("report")
      .select("*")
      .order("ngay_bao_cao", { ascending: true }),
    supabase
      .from("v_monthly_site_revenue")
      .select("*"),
  ]);

  if (reportRes.error) {
    throw new Error(`Lỗi truy vấn bảng report: ${reportRes.error.message}`);
  }

  const rawRows = reportRes.data || [];
  const rows = rawRows.map((r: any) => mapReportRow(r, DEFAULT_NGUONG));

  const siteSet = new Set<string>();
  const nguoiSet = new Set<string>();
  const khachSet = new Set<string>();
  const dateSet = new Set<string>();

  rows.forEach((r: any) => {
    if (r.tenSite) siteSet.add(r.tenSite);
    if (r.nguoiBaoCao) nguoiSet.add(r.nguoiBaoCao);
    if (r.tenKhachHang) khachSet.add(r.tenKhachHang);
    if (r.ngayBaoCao) dateSet.add(r.ngayBaoCao);
  });

  const monthlyRevenue = (revMonthlyRes && revMonthlyRes.data)
    ? revMonthlyRes.data.map((r: any) => ({
        month: r.month,
        site: r.site,
        maSite: r.ma_site,
        khachHang: r.khach_hang,
        soLuong: Number(r.so_luong || 0),
        qtyPHA: Number(r.qty_pha || 0),
        thanhTien: Number(r.gross_rev || 0),
        ckTruocThue: Number(r.discount || 0),
        netRevenue: Number(r.net_revenue || 0),
        foodCost: Number(r.food_cost || 0),
        giaVon: Number(r.food_cost || 0),
      }))
    : [];

  monthlyRevenue.forEach((r: any) => {
    if (r.site) siteSet.add(r.site);
    if (r.khachHang) khachSet.add(r.khachHang);
  });

  const viSort = (a: string, b: string) => a.localeCompare(b, "vi");

  const sites = Array.from(siteSet).sort(viSort);
  const nguoiBaoCao = Array.from(nguoiSet).sort(viSort);
  const khachHang = Array.from(khachSet).sort(viSort);
  const dates = Array.from(dateSet).sort();

  const version = String(versionRes.data?.version || "1.0.0");
  const updatedAt = versionRes.data?.updated_at || new Date().toISOString();

  return {
    ok: true,
    rows,
    sites,
    nguoiBaoCao,
    khachHang,
    dates,
    monthlyRevenue,
    nguong: DEFAULT_NGUONG,
    version,
    updatedAt,
    total: rows.length,
  };
}
