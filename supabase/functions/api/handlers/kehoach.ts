// =========================================================================
// A.KITCHEN DASHBOARD - KE HOACH (PLAN vs ACTUAL) HANDLER
// Action: getKeHoachData
// =========================================================================

import { supabase } from "../lib/db.ts";
import { DEFAULT_NGUONG } from "../lib/nguong.ts";

const SITE_TONG = "Toàn hệ thống A.Kitchen (Tổng hợp toàn bộ site)";

export async function handleGetKeHoachData(filtersParam?: any): Promise<any> {
  let filters: { gran?: string; nPeriods?: number; sites?: string[] } = {};
  if (typeof filtersParam === "string") {
    try {
      filters = JSON.parse(filtersParam);
    } catch {
      // Bỏ qua lỗi parse
    }
  } else if (typeof filtersParam === "object" && filtersParam !== null) {
    filters = filtersParam;
  }

  // 1. Query thông tin kế hoạch và thực tế
  const [plRes, duAnRes, thamSoRes, opexRes, repRes, txRes] = await Promise.all([
    supabase
      .from("kehoach_pl_thang")
      .select("*")
      .order("ky", { ascending: true }),

    supabase
      .from("kehoach_duan")
      .select("*"),

    supabase
      .from("kehoach_thamso")
      .select("*"),

    supabase
      .from("opex_input")
      .select("*"),

    supabase
      .from("report")
      .select("ten_site, ngay_bao_cao, tong_suat, suat_huy"),

    supabase
      .from("transactions")
      .select("ten_cua_hang, billing_date, thanh_tien_truoc_thue, ck_truoc_thue, gia_von"),
  ]);

  if (plRes.error) {
    throw new Error(`Lỗi truy vấn kehoach_pl_thang: ${plRes.error.message}`);
  }

  const plRows = plRes.data || [];
  const duAnRows = duAnRes.data || [];
  const thamSoRows = thamSoRes.data || [];
  const opexRows = opexRes.data || [];
  const repRows = repRes.data || [];
  const txRows = txRes.data || [];

  // Gom duAn theo site
  const duAn: Record<string, any> = {};
  duAnRows.forEach((d: any) => {
    duAn[d.site] = {
      tenDuAn: d.ten_du_an || d.site,
      quanLy: d.quan_ly_du_an || d.quan_ly || "",
      ngayTrinh: d.ngay_trinh || "",
      version: d.version || "1.0",
      tongSanLuong12T: Number(d.tong_san_luong_12t || 0),
      tongDoanhThu12T: Number(d.tong_doanh_thu_12t || 0),
      grossMarginPct: Number(d.gross_margin_pct || 0),
      ebitda12T: Number(d.ebitda_12t || 0),
      ebitdaMarginPct: Number(d.ebitda_margin_pct || 0),
      hoanVonThang: Number(d.hoan_von_thang || 0),
    };
  });

  // Gom thamSo theo site
  const thamSo: Record<string, any[]> = {};
  thamSoRows.forEach((t: any) => {
    if (!thamSo[t.site]) thamSo[t.site] = [];
    thamSo[t.site].push({
      thamSo: t.tham_so || "",
      giaTri: isNaN(Number(t.gia_tri)) ? t.gia_tri : Number(t.gia_tri),
      ghiChu: t.ghi_chu || "",
    });
  });

  // Pivot kehoach_pl_thang (site + ky -> { DoanhThu, SanLuongTong, FoodCost, LaiGop, EBITDA })
  const plPivot: Record<string, Record<string, number>> = {};
  const periodMap = new Map<string, string>();

  plRows.forEach((p: any) => {
    const ky = String(p.ky || "");
    if (!ky) return;
    const label = `Tháng ${ky.substring(5, 7)}/${ky.substring(0, 4)}`;
    periodMap.set(ky, label);

    const k = `${p.site}|${ky}`;
    if (!plPivot[k]) plPivot[k] = {};
    plPivot[k][p.hang_muc] = Number(p.gia_tri || 0);
  });

  // Thu thập danh sách tất cả các site
  const siteSet = new Set<string>();
  plRows.forEach((p: any) => { if (p.site) siteSet.add(p.site); });
  duAnRows.forEach((d: any) => { if (d.site) siteSet.add(d.site); });
  repRows.forEach((r: any) => { if (r.ten_site) siteSet.add(r.ten_site); });
  txRows.forEach((t: any) => { if (t.ten_cua_hang) siteSet.add(t.ten_cua_hang); });
  siteSet.add(SITE_TONG);

  const viSort = (a: string, b: string) => a.localeCompare(b, "vi");
  const sites = Array.from(siteSet).sort(viSort);

  // Tính Actuals gom theo site và ky (YYYY-MM)
  const txActual: Record<string, { net: number; foodCost: number }> = {};
  txRows.forEach((t: any) => {
    const ym = String(t.billing_date || "").substring(0, 7);
    const site = t.ten_cua_hang;
    if (!ym || !site) return;
    const k = `${site}|${ym}`;
    if (!txActual[k]) txActual[k] = { net: 0, foodCost: 0 };
    const net = Number(t.thanh_tien_truoc_thue || 0) - Number(t.ck_truoc_thue || 0);
    txActual[k].net += net;
    txActual[k].foodCost += Number(t.gia_von || 0);
  });

  const repActual: Record<string, { tong: number; huy: number }> = {};
  repRows.forEach((r: any) => {
    const ym = String(r.ngay_bao_cao || "").substring(0, 7);
    const site = r.ten_site;
    if (!ym || !site) return;
    const k = `${site}|${ym}`;
    if (!repActual[k]) repActual[k] = { tong: 0, huy: 0 };
    repActual[k].tong += Number(r.tong_suat || 0);
    repActual[k].huy += Number(r.suat_huy || 0);
  });

  const opexActual: Record<string, number> = {};
  opexRows.forEach((o: any) => {
    const ym = o.ky || o.period;
    const k = `${o.site}|${ym}`;
    opexActual[k] = (opexActual[k] || 0) + Number(o.so_tien || o.amount || 0);
  });

  // Sắp xếp các kỳ
  const sortedPeriodKeys = Array.from(periodMap.keys()).sort();
  const limitN = filters.nPeriods && filters.nPeriods > 0 ? filters.nPeriods : 24;
  const activePeriods = sortedPeriodKeys.slice(-limitN);

  const periods = activePeriods.map((perKey) => {
    const label = periodMap.get(perKey) || perKey;
    const bySite: Record<string, any> = {};

    sites.forEach((site) => {
      const k = `${site}|${perKey}`;
      const plan = plPivot[k] || {};

      const actTx = txActual[k] || { net: 0, foodCost: 0 };
      const actRep = repActual[k] || { tong: 0, huy: 0 };
      const opexVal = opexActual[k] || 0;
      const hasOpex = opexVal > 0;

      const actNet = actTx.net;
      const actFC = actTx.foodCost;
      const actLaiGop = actNet - actFC;
      const actEbitda = hasOpex ? (actLaiGop - opexVal) : (actNet > 0 ? actLaiGop : 0);

      bySite[site] = {
        DoanhThu: {
          actual: actNet,
          plan: plan["DoanhThu"] || 0,
        },
        SanLuongTong: {
          actual: actRep.tong,
          plan: plan["SanLuongTong"] || 0,
        },
        FoodCost: {
          actualVal: actFC,
          planVal: plan["FoodCost"] || 0,
        },
        LaiGop: {
          actual: actLaiGop,
          plan: plan["LaiGop"] || 0,
        },
        HuyPct: {
          actualHuy: actRep.huy,
          actualTong: actRep.tong,
        },
        VatTuTieuHao: {
          actual: 0,
          plan: plan["ChiPhiVanHanh"] || 0,
        },
        EBITDA: {
          actual: actEbitda,
          plan: plan["EBITDA"] || 0,
          hasActual: actNet > 0 || hasOpex,
        },
      };
    });

    // Dòng tổng hợp toàn hệ thống
    const kTong = `${SITE_TONG}|${perKey}`;
    const planTong = plPivot[kTong] || {};

    let sumActNet = 0, sumActFC = 0, sumActTong = 0, sumActHuy = 0, sumActLaiGop = 0, sumActEbitda = 0;
    let sumPlanDT = 0, sumPlanSL = 0, sumPlanFC = 0, sumPlanLG = 0, sumPlanVT = 0, sumPlanEB = 0;

    sites.forEach((s) => {
      if (s === SITE_TONG) return;
      const o = bySite[s];
      sumActNet += o.DoanhThu.actual;
      sumActFC += o.FoodCost.actualVal;
      sumActTong += o.SanLuongTong.actual;
      sumActHuy += o.HuyPct.actualHuy;
      sumActLaiGop += o.LaiGop.actual;
      if (o.EBITDA.hasActual) sumActEbitda += o.EBITDA.actual;

      sumPlanDT += o.DoanhThu.plan;
      sumPlanSL += o.SanLuongTong.plan;
      sumPlanFC += o.FoodCost.planVal;
      sumPlanLG += o.LaiGop.plan;
      sumPlanVT += o.VatTuTieuHao.plan;
      sumPlanEB += o.EBITDA.plan;
    });

    bySite[SITE_TONG] = {
      DoanhThu: {
        actual: sumActNet,
        plan: planTong["DoanhThu"] !== undefined ? planTong["DoanhThu"] : sumPlanDT,
      },
      SanLuongTong: {
        actual: sumActTong,
        plan: planTong["SanLuongTong"] !== undefined ? planTong["SanLuongTong"] : sumPlanSL,
      },
      FoodCost: {
        actualVal: sumActFC,
        planVal: planTong["FoodCost"] !== undefined ? planTong["FoodCost"] : sumPlanFC,
      },
      LaiGop: {
        actual: sumActLaiGop,
        plan: planTong["LaiGop"] !== undefined ? planTong["LaiGop"] : sumPlanLG,
      },
      HuyPct: {
        actualHuy: sumActHuy,
        actualTong: sumActTong,
      },
      VatTuTieuHao: {
        actual: 0,
        plan: planTong["ChiPhiVanHanh"] !== undefined ? planTong["ChiPhiVanHanh"] : sumPlanVT,
      },
      EBITDA: {
        actual: sumActEbitda,
        plan: planTong["EBITDA"] !== undefined ? planTong["EBITDA"] : sumPlanEB,
        hasActual: sumActNet > 0,
      },
    };

    return {
      key: perKey,
      label,
      bySite,
    };
  });

  return {
    ok: true,
    sites,
    periods,
    duAn,
    thamSo,
    siteTong: SITE_TONG,
    nguong: { huyPct: DEFAULT_NGUONG.huyPct },
    updatedAt: new Date().toISOString(),
  };
}
