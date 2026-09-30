// =========================================================================
// A.KITCHEN DASHBOARD - WAREHOUSE (QUẢN LÝ KHO) HANDLER
// Action: getWarehouseDashboardData
// =========================================================================

import { supabase } from "../lib/db.ts";
import { formatDate } from "../lib/transform.ts";

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

export async function handleGetWarehouseDashboardData(): Promise<any> {
  const [headerRes, txRes, rawPrice] = await Promise.all([
    supabase
      .from("stock_header")
      .select("*"),

    supabase
      .from("stock_transactions")
      .select("*")
      .order("pstng_date", { ascending: true }),

    fetchAllRows("stock_price_category", "article, price, mdse_catgry_desc, base_uom"),
  ]);

  if (headerRes.error) {
    throw new Error(`Lỗi truy vấn stock_header: ${headerRes.error.message}`);
  }

  const rawHeaders = headerRes.data || [];
  const rawTx = txRes.data || [];

  // Tạo map tra cứu giá & nhóm hàng từ stock_price_category
  const priceMap: Record<string, number> = {};
  const catMap: Record<string, string> = {};
  rawPrice.forEach((p: any) => {
    priceMap[p.article] = Number(p.price || 0);
    if (p.mdse_catgry_desc) catMap[p.article] = p.mdse_catgry_desc;
  });

  const siteCodeToName: Record<string, string> = {};
  rawHeaders.forEach((h: any) => {
    if (h.site && h.site_name) siteCodeToName[h.site] = h.site_name;
  });

  const slocMeta: Record<string, { name: string }> = {
    "KL01": { name: "Kho nguyên vật liệu & Thực phẩm (KL01)" },
    "KL02": { name: "Kho vật tư tiêu hao & Hóa phẩm (KL02)" },
    "KL03": { name: "Kho công cụ & Thiết bị bếp (KL03)" },
    "1001": { name: "Kho NVL chính (1001)" },
    "1002": { name: "Kho BTP (1002)" },
    "1003": { name: "Kho gia vị & đồ khô (1003)" },
    "1004": { name: "Kho bao bì & vật tư (1004)" },
    "1005": { name: "Kho đông lạnh (1005)" },
  };

  const slocSet = new Set<string>();
  const catSet = new Set<string>();
  const siteNameSet = new Set<string>();
  const typeSet = new Set<string>();

  // Map transactions
  const transactions = rawTx.map((t: any) => {
    const sloc = String(t.sloc || "KL01");
    slocSet.add(sloc);
    const category = catMap[t.article] || t.loai_hang || "Chưa phân loại";
    catSet.add(category);
    const siteName = siteCodeToName[t.site] || t.site_name || t.site || "";
    if (siteName) siteNameSet.add(siteName);
    const type = t.type || "NVL";
    typeSet.add(type);

    const qty = Number(t.quantity || 0);
    const price = priceMap[t.article] || 0;
    const value = Math.round(qty * price);

    const mvt = String(t.mvt || "101");
    let mvtLabel = "Giao dịch kho";
    if (mvt === "101" || qty > 0) mvtLabel = "Nhập mua kho (101)";
    else if (mvt === "261" || qty < 0) mvtLabel = "Xuất sản xuất (261)";
    else if (mvt === "551") mvtLabel = "Xuất hủy hao hụt (551)";

    return {
      article: t.article,
      name: t.description || t.article,
      category,
      type,
      sloc,
      date: formatDate(t.pstng_date),
      mvt,
      mvt_label: mvtLabel,
      qty,
      value,
      site_name: siteName,
      site: t.site || "",
    };
  });

  // Xác định khoảng thời gian dữ liệu
  let minDate = "";
  let maxDate = "";
  transactions.forEach((t) => {
    if (!minDate || (t.date && t.date < minDate)) minDate = t.date;
    if (!maxDate || (t.date && t.date > maxDate)) maxDate = t.date;
  });

  const d1 = minDate ? new Date(minDate) : new Date();
  const d2 = maxDate ? new Date(maxDate) : new Date();
  const daysInPeriod = Math.max(1, Math.round((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24)) + 1);

  // Map items từ stock_header
  const items = rawHeaders.map((h: any) => {
    const category = catMap[h.article] || "Chưa phân loại";
    catSet.add(category);
    const siteName = h.site_name || siteCodeToName[h.site] || h.site || "";
    if (siteName) siteNameSet.add(siteName);

    const stockBegin = Number(h.stock_begin_qty || 0);
    const receipts = Number(h.total_receipts_qty || 0);
    const issues = Number(h.total_issues_qty || 0);
    const issuesAbs = Math.abs(issues);
    const stockEnd = Number(h.stock_end_qty || 0);
    const price = priceMap[h.article] || 0;
    const stockEndValue = Math.round(stockEnd * price);
    const consumptionPerDay = issuesAbs > 0 ? issuesAbs / daysInPeriod : 0;

    let daysOfStock: number | null = null;
    if (consumptionPerDay > 0) {
      daysOfStock = Math.round((stockEnd / consumptionPerDay) * 10) / 10;
    }

    let status = "binh_thuong";
    if (stockEnd <= 0) status = "het_hang";
    else if (daysOfStock !== null && daysOfStock <= 3) status = "sap_het";
    else if (receipts === 0 && issuesAbs === 0 && stockEnd > 0) status = "ton_dong";

    const calculatedEnd = stockBegin + receipts - issuesAbs;
    const diff = stockEnd - calculatedEnd;
    const hasMismatch = Math.abs(diff) > 0.01;

    return {
      code: h.article,
      name: h.description || h.article,
      category,
      uom: h.uom || "Kg",
      stock_begin: stockBegin,
      receipts,
      issues: issues,
      issues_abs: issuesAbs,
      stock_end: stockEnd,
      price,
      stock_end_value: stockEndValue,
      consumption_per_day: consumptionPerDay,
      days_of_stock: daysOfStock,
      status,
      has_mismatch: hasMismatch,
      reconciliation_diff: diff,
      site_name: siteName,
      site: h.site || "",
    };
  });

  const viSort = (a: string, b: string) => a.localeCompare(b, "vi");

  const bySloc = Array.from(slocSet).sort().map((s) => ({
    sloc: s,
    name: slocMeta[s]?.name || `Kho ${s}`,
  }));

  const byCategory = Array.from(catSet).sort(viSort).map((c) => ({
    category: c,
  }));

  const sites = Array.from(siteNameSet).sort(viSort).map((s) => ({
    name: s,
  }));

  const types = Array.from(typeSet).sort(viSort);
  if (types.length === 0) types.push("NVL", "BTP", "Gia vị", "Vật tư tiêu hao");

  return {
    success: true,
    meta: {
      site: rawHeaders[0]?.site || "K500",
      site_name: rawHeaders[0]?.site_name || "MB A Kitchen Hòa Bình",
      period_from: minDate || formatDate(new Date()),
      period_to: maxDate || formatDate(new Date()),
      days_in_period: daysInPeriod,
      generated_at: new Date().toISOString(),
    },
    by_sloc: bySloc,
    by_category: byCategory,
    sites,
    types,
    items,
    transactions,
    sloc_meta: slocMeta,
  };
}
