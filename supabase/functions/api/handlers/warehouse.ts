// =========================================================================
// A.KITCHEN DASHBOARD - WAREHOUSE (QUẢN LÝ KHO) HANDLER
// Action: getWarehouseDashboardData
// Data source: mb51_material_docs
// =========================================================================

import { supabase } from "../lib/db.ts";
import { formatDate } from "../lib/transform.ts";

export const MVT_RECEIPT_TYPES = new Set([
  "101", "103", "105", "107", "109", "121", "131", "141", "161", "167",
  "501", "503", "505", "511", "521", "523", "525", "531", "561", "563",
  "565", "571", "573", "575", "581", "888",
  "Z09", "Z10", "Z12", "Z13", "Z14", "Z15", "Z18", "Z23", "Z25",
  "262", "242", "602", "Y22"
]);

export const MVT_ISSUE_TYPES = new Set([
  "201", "221", "231", "241", "251", "261", "281", "291",
  "331", "332", "333", "334", "335", "451", "541", "543", "601", "661",
  "Z01", "Z02", "Z03", "Z04", "Z05", "Z06", "Z07", "Z08", "Z11", "Z16",
  "Z19", "Z20", "Z21", "Z22", "Z24",
  "102", "122", "Y08", "Y09", "Y15"
]);

export const MVT_SCRAP_TYPES = new Set([
  "551", "553", "555", "89C"
]);

export const MVT_SCRAP_REVERSAL_TYPES = new Set([
  "552", "554", "556", "89D"
]);

export const MVT_TRANSFER_TYPES = new Set([
  "301", "302", "303", "304", "305", "306", "309", "310", "311", "312",
  "313", "314", "315", "316", "321", "322", "323", "324", "325", "326",
  "341", "342", "343", "344", "345", "346", "347", "348", "349", "350",
  "351", "352", "411", "412", "413", "414", "415", "416", "417", "418",
  "419", "420", "421", "422", "423", "424", "425", "426", "427", "428",
  "429", "430", "641", "642", "643", "644", "645", "646", "647", "648"
]);

export const SLOC_GROUPS = [
  { id: 'hang_hoa', name: 'Kho hàng hóa', codes: ['RL01', 'KL01'], primaryLabel: 'RL01, KL01' },
  { id: 'vtth', name: 'Kho VTTH', codes: ['RL02', 'KL02'], primaryLabel: 'RL02, KL02' },
  { id: 'ccdc_xd', name: 'Kho CCDC XD', codes: ['RL03', 'KL03'], primaryLabel: 'RL03, KL03' },
  { id: 'cap_dong', name: 'Kho cấp đông', codes: ['RL04', 'KL04'], primaryLabel: 'RL04' },
  { id: 'tra_hang', name: 'Kho trả hàng', codes: ['RL05', 'KL05'], primaryLabel: 'RL05' }
];

export const SLOC_MAP: Record<string, { id: string; name: string; groupCodes: string[] }> = {
  'RL01': { id: 'hang_hoa', name: 'Kho hàng hóa', groupCodes: ['RL01', 'KL01'] },
  'KL01': { id: 'hang_hoa', name: 'Kho hàng hóa', groupCodes: ['RL01', 'KL01'] },
  'RL02': { id: 'vtth', name: 'Kho VTTH', groupCodes: ['RL02', 'KL02'] },
  'KL02': { id: 'vtth', name: 'Kho VTTH', groupCodes: ['RL02', 'KL02'] },
  'RL03': { id: 'ccdc_xd', name: 'Kho CCDC XD', groupCodes: ['RL03', 'KL03'] },
  'KL03': { id: 'ccdc_xd', name: 'Kho CCDC XD', groupCodes: ['RL03', 'KL03'] },
  'RL04': { id: 'cap_dong', name: 'Kho cấp đông', groupCodes: ['RL04', 'KL04'] },
  'KL04': { id: 'cap_dong', name: 'Kho cấp đông', groupCodes: ['RL04', 'KL04'] },
  'RL05': { id: 'tra_hang', name: 'Kho trả hàng', groupCodes: ['RL05', 'KL05'] },
  'KL05': { id: 'tra_hang', name: 'Kho trả hàng', groupCodes: ['RL05', 'KL05'] }
};

export function getSlocGroup(code: string) {
  if (!code) return { id: 'other', name: 'Khác', groupCodes: [] };
  const c = String(code).trim().toUpperCase();
  return SLOC_MAP[c] || { id: c, name: c, groupCodes: [c] };
}

export function getSlocName(code: string) {
  if (!code) return '';
  const c = String(code).trim().toUpperCase();
  return SLOC_MAP[c]?.name || c;
}

export function getSlocDisplayName(code: string, withCode = true) {
  if (!code) return '';
  const c = String(code).trim().toUpperCase();
  const info = SLOC_MAP[c];
  if (!info) return c;
  return withCode ? `${info.name} (${c})` : info.name;
}

export function classifyMovType(mvt: string): string {
  const clean = String(mvt || "").trim().toUpperCase();
  if (MVT_SCRAP_TYPES.has(clean)) return "scrap";
  if (MVT_SCRAP_REVERSAL_TYPES.has(clean)) return "scrap_reversal";
  if (MVT_TRANSFER_TYPES.has(clean)) return "transfer";
  if (MVT_RECEIPT_TYPES.has(clean)) return "receipt";
  if (MVT_ISSUE_TYPES.has(clean)) return "issue";
  return "other";
}

export function mapMb51RowToLegacyStockTx(r: any) {
  const cleanMvt = String(r.mov_type || "").trim().toUpperCase();
  const labelDesc = r.mov_text_vi || r.mov_text_sap || cleanMvt;
  const mvtLabel = cleanMvt ? `${cleanMvt} - ${labelDesc}` : labelDesc;
  const qty = Number(r.quantity || 0);
  const amount = Number(r.amount_lc !== undefined && r.amount_lc !== null ? r.amount_lc : 0);
  const price = (qty !== 0 && amount !== 0) ? Math.round(Math.abs(amount) / Math.abs(qty)) : 0;
  const value = amount !== 0 ? amount : Math.round(qty * price);

  const ng = String(r.nganh_hang || "").toLowerCase();
  const nh = String(r.nhom_hang || "").toLowerCase();
  let type = "Khác / Chưa phân loại";
  if (ng.includes("thành phẩm") || nh.includes("thành phẩm") || ng.includes("nhà hàng")) {
    type = "Thành phẩm";
  } else if (ng.includes("sơ chế") || ng.includes("chế biến") || ng.includes("nvl") || ng.includes("rau") || ng.includes("thịt") || ng.includes("trứng") || ng.includes("khô") || ng.includes("đồ uống")) {
    type = "Bán thành phẩm - NVL";
  } else if (r.nganh_hang) {
    type = r.nganh_hang;
  }

  const pDate = r.posting_date || r.entry_date || "";
  const dateFormatted = pDate ? formatDate(pDate) : "";

  return {
    article: r.material || "",
    material: r.material || "",
    name: r.material_desc || r.material || "",
    material_desc: r.material_desc || r.material || "",
    category: r.nhom_hang || r.nganh_hang || "Chưa phân loại",
    nhom_hang: r.nhom_hang || "",
    nganh_hang: r.nganh_hang || "",
    type,
    sloc: r.stor_loc || "KL01",
    stor_loc: r.stor_loc || "KL01",
    stor_loc_name: getSlocName(r.stor_loc || "KL01"),
    stor_loc_display: getSlocDisplayName(r.stor_loc || "KL01"),
    date: dateFormatted,
    posting_date: pDate,
    pstng_date: pDate,
    mvt: cleanMvt,
    mov_type: cleanMvt,
    mvt_label: mvtLabel,
    mov_text_vi: r.mov_text_vi || "",
    mov_text_sap: r.mov_text_sap || "",
    qty,
    quantity: qty,
    value,
    amount_lc: amount,
    price,
    site: r.site || "",
    site_name: r.site_name || r.site || "",
    doc_no: r.mat_doc || "",
    art_doc: r.mat_doc || "",
    mat_doc: r.mat_doc || "",
    doc_item: r.doc_item || "",
    item: r.doc_item || "",
    mat_doc_year: r.mat_doc_year || "",
    uom: r.entry_unit || "Kg",
    entry_unit: r.entry_unit || "Kg",
    order_no: r.order_no || "",
    doc_header_text: r.doc_header_text || ""
  };
}

async function fetchAllRows(table: string, select = "*", orderCol: string | null = null, fromDate: string | null = null, toDate: string | null = null, dateCol: string | null = null): Promise<any[]> {
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

export async function handleGetWarehouseDashboardData(filtersParam?: any): Promise<any> {
  let filters: any = {};
  if (typeof filtersParam === "string") {
    try { filters = JSON.parse(filtersParam); } catch {}
  } else if (typeof filtersParam === "object" && filtersParam !== null) {
    filters = filtersParam;
  }

  // 1. Xác định ngày mới nhất từ mb51_material_docs
  const [latestDateRow, latestMbRow] = await Promise.all([
    supabase.from("mb51_material_docs").select("posting_date").order("posting_date", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("mb51_material_docs").select("posting_date").eq("mov_type", "551").order("posting_date", { ascending: false }).limit(1).maybeSingle()
  ]);

  const dKho = latestDateRow?.data?.posting_date || "2026-11-02";
  const dHuy = latestMbRow?.data?.posting_date || "";
  const dMax = (dHuy && dHuy > dKho) ? dHuy : dKho;

  function calcMinusOneMonth(dStr: string) {
    if (!dStr) return "";
    const p = dStr.split("-").map(Number);
    if (p.length !== 3) return "";
    let targetYear = p[0];
    let targetMonth = p[1] - 1;
    if (targetMonth === 0) {
      targetMonth = 12;
      targetYear--;
    }
    const daysInMonth = new Date(targetYear, targetMonth, 0).getDate();
    const targetDay = Math.min(p[2], daysInMonth);
    return `${targetYear}-${String(targetMonth).padStart(2, "0")}-${String(targetDay).padStart(2, "0")}`;
  }

  function getDayBefore(dStr: string) {
    if (!dStr) return "";
    const d = new Date(dStr + "T00:00:00");
    d.setDate(d.getDate() - 1);
    return d.toISOString().slice(0, 10);
  }

  const defaultTo = dMax;
  const defaultFrom = calcMinusOneMonth(dMax);

  let reqFrom = filters.from || "";
  let reqTo = filters.to || "";

  if (!reqFrom && !filters.all) {
    reqFrom = defaultFrom;
    reqTo = defaultTo;
  }

  const selectCols = "mat_doc,mat_doc_year,doc_item,posting_date,entry_date,site,site_name,stor_loc,material,material_desc,nganh_hang,nhom_hang,mov_type,mov_text_sap,mov_text_vi,transaction_type,quantity,entry_unit,amount_lc,order_no,doc_header_text";

  const fetchPromises: Promise<any[]>[] = [
    fetchAllRows("mb51_material_docs", selectCols, "posting_date", reqFrom || null, reqTo || null, "posting_date")
  ];
  if (reqFrom && reqFrom > "2026-09-01") {
    const priorTo = getDayBefore(reqFrom);
    fetchPromises.push(
      fetchAllRows("mb51_material_docs", "material,quantity,amount_lc,site,site_name", null, null, priorTo, "posting_date")
    );
  }

  const [periodRows, priorRows = []] = await Promise.all(fetchPromises);

  const stockBeginMap: Record<string, number> = {};
  const priceMap: Record<string, number> = {};
  priorRows.forEach((r: any) => {
    if (r.posting_date && r.posting_date >= reqFrom) return;
    const artKey = String(r.material || "").trim();
    const key = (r.site || "") + "|" + artKey;
    stockBeginMap[key] = (stockBeginMap[key] || 0) + Number(r.quantity || 0);
    const qty = Math.abs(Number(r.quantity || 0));
    const amt = Math.abs(Number(r.amount_lc || 0));
    if (qty > 0 && amt > 0) {
      priceMap[artKey] = Math.round(amt / qty);
    }
  });

  const slocSet = new Set<string>();
  const catSet = new Set<string>();
  const siteNameSet = new Set<string>();
  const typeSet = new Set<string>(["Thành phẩm", "Bán thành phẩm - NVL", "Khác / Chưa phân loại"]);
  const itemsMap: Record<string, any> = {};
  const transactions: any[] = [];

  periodRows.forEach((r: any) => {
    const t = mapMb51RowToLegacyStockTx(r);
    transactions.push(t);

    if (t.sloc) slocSet.add(t.sloc);
    if (t.category) catSet.add(t.category);
    if (t.site_name) siteNameSet.add(t.site_name);
    if (t.type) typeSet.add(t.type);

    const artKey = t.article;
    const qtyAbs = Math.abs(t.qty);
    const valAbs = Math.abs(t.value);
    if (qtyAbs > 0 && valAbs > 0) {
      priceMap[artKey] = Math.round(valAbs / qtyAbs);
    }

    const itemKey = (t.site || "") + "|" + artKey;
    if (!itemsMap[itemKey]) {
      itemsMap[itemKey] = {
        code: artKey,
        name: t.name,
        category: t.category,
        uom: t.uom,
        stock_begin: stockBeginMap[itemKey] || 0,
        receipts: 0,
        issues: 0,
        issues_abs: 0,
        receipts_val: 0,
        issues_val: 0,
        site_name: t.site_name,
        site: t.site
      };
    }

    if (t.qty >= 0) {
      itemsMap[itemKey].receipts += t.qty;
      itemsMap[itemKey].receipts_val += Math.abs(t.value || 0);
    } else {
      itemsMap[itemKey].issues += t.qty;
      itemsMap[itemKey].issues_abs += Math.abs(t.qty);
      itemsMap[itemKey].issues_val += Math.abs(t.value || 0);
    }
  });

  Object.keys(stockBeginMap).forEach(key => {
    if (!itemsMap[key] && stockBeginMap[key] !== 0) {
      const parts = key.split("|");
      const site = parts[0];
      const code = parts[1];
      itemsMap[key] = {
        code,
        name: code,
        category: "Chưa phân loại",
        uom: "Kg",
        stock_begin: stockBeginMap[key],
        receipts: 0,
        issues: 0,
        issues_abs: 0,
        receipts_val: 0,
        issues_val: 0,
        site_name: site,
        site
      };
    }
  });

  let minDate = "", maxDate = "";
  transactions.forEach(t => {
    if (!minDate || (t.date && t.date < minDate)) minDate = t.date;
    if (!maxDate || (t.date && t.date > maxDate)) maxDate = t.date;
  });

  const d1 = minDate ? new Date(minDate) : new Date();
  const d2 = maxDate ? new Date(maxDate) : new Date();
  const daysInPeriod = Math.max(1, Math.round((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24)) + 1);

  const items = Object.values(itemsMap).map((it: any) => {
    const price = priceMap[it.code] || (it.receipts_abs > 0 ? Math.round(it.receipts_val / it.receipts_abs) : 0);
    const stockEnd = it.stock_begin + it.receipts + it.issues;
    const stockEndValue = Math.round(stockEnd * price);
    const receiptsValue = it.receipts_val > 0 ? it.receipts_val : Math.round(it.receipts * price);
    const issuesValue = it.issues_val > 0 ? it.issues_val : Math.round(it.issues_abs * price);
    const consumptionPerDay = it.issues_abs > 0 ? it.issues_abs / daysInPeriod : 0;
    let daysOfStock: number | null = null;
    if (consumptionPerDay > 0) {
      daysOfStock = Math.round((stockEnd / consumptionPerDay) * 10) / 10;
    }

    let status = "binh_thuong";
    if (stockEnd <= 0) status = "het_hang";
    else if (daysOfStock !== null && daysOfStock <= 3) status = "sap_het";
    else if (it.receipts === 0 && it.issues_abs === 0 && stockEnd > 0) status = "ton_dong";

    const calculatedEnd = it.stock_begin + it.receipts - it.issues_abs;
    const diff = stockEnd - calculatedEnd;
    const hasMismatch = Math.abs(diff) > 0.01;

    return {
      code: it.code,
      name: it.name,
      category: it.category,
      uom: it.uom,
      stock_begin: it.stock_begin,
      receipts: it.receipts,
      issues: it.issues,
      issues_abs: it.issues_abs,
      stock_end: stockEnd,
      price,
      stock_end_value: stockEndValue,
      receipts_value: receiptsValue,
      issues_value: issuesValue,
      consumption_per_day: consumptionPerDay,
      days_of_stock: daysOfStock,
      status,
      has_mismatch: hasMismatch,
      reconciliation_diff: diff,
      computed_end_from_trans: calculatedEnd,
      site_name: it.site_name,
      site: it.site
    };
  });

  const viSort = (a: string, b: string) => a.localeCompare(b, "vi");
  const slocMeta: Record<string, { name: string; display: string; group: any }> = {};
  slocSet.forEach(s => {
    slocMeta[s] = {
      name: getSlocName(s) || `Kho ${s}`,
      display: getSlocDisplayName(s),
      group: getSlocGroup(s)
    };
  });

  return {
    success: true,
    meta: {
      site: transactions[0]?.site || "K500",
      site_name: transactions[0]?.site_name || "MB A Kitchen Hòa Bình",
      period_from: reqFrom || minDate || defaultFrom,
      period_to: reqTo || maxDate || defaultTo,
      max_date: dMax,
      d_kho: dKho,
      d_huy: dHuy,
      default_from: defaultFrom,
      default_to: defaultTo,
      loaded_from: reqFrom || defaultFrom,
      loaded_to: reqTo || defaultTo,
      days_in_period: daysInPeriod,
      generated_at: new Date().toISOString()
    },
    by_sloc: Array.from(slocSet).sort().map(s => ({
      sloc: s,
      name: getSlocName(s) || `Kho ${s}`,
      display: getSlocDisplayName(s),
      group: getSlocGroup(s)
    })),
    by_category: Array.from(catSet).sort(viSort).map(c => ({ category: c })),
    sites: Array.from(siteNameSet).sort(viSort).map(s => ({ name: s })),
    types: Array.from(typeSet).sort(viSort),
    items,
    transactions,
    sloc_meta: slocMeta
  };
}

/**
 * Lấy dữ liệu chi tiết hủy hàng từ public.mb51_material_docs
 * Chỉ lấy dòng xuất tiêu hủy (mov_type = '551')
 * Loại trừ các dòng đã bị hủy bởi mov_type = '552' (cùng mat_doc + mat_doc_year + doc_item)
 * Không tính/không cộng 552 vào số hủy
 */
export async function handleGetMb51GoodsIssue(filtersParam?: any): Promise<any> {
  let filters: any = {};
  if (typeof filtersParam === "string") {
    try { filters = JSON.parse(filtersParam); } catch {}
  } else if (typeof filtersParam === "object" && filtersParam !== null) {
    filters = filtersParam;
  }

  const selectCols = "mat_doc,mat_doc_year,doc_item,posting_date,entry_date,entry_time,site,site_name,stor_loc,material,material_desc,nganh_hang,nhom_hang,mov_type,mov_text_sap,mov_text_vi,transaction_type,quantity,entry_unit,amount_lc,order_no,doc_header_text";
  let q = supabase.from("mb51_material_docs").select(selectCols).in("mov_type", ["551", "552"]);

  if (filters.from) q = q.gte("posting_date", filters.from);
  if (filters.to) q = q.lte("posting_date", filters.to);

  if (filters.sites && Array.isArray(filters.sites) && filters.sites.length > 0) {
    const siteValues = filters.sites.map((s: any) => String(s).trim()).filter(Boolean);
    if (siteValues.length > 0) {
      const isAllCodes = siteValues.every((s: string) => /^[A-Z0-9_-]{3,6}$/i.test(s));
      if (isAllCodes) {
        q = q.in("site", siteValues);
      } else {
        const siteOr = siteValues.map((s: string) => `site.eq."${s}",site_name.eq."${s}"`).join(",");
        q = q.or(siteOr);
      }
    }
  } else if (filters.site && typeof filters.site === "string" && filters.site.trim()) {
    const s = filters.site.trim();
    if (/^[A-Z0-9_-]{3,6}$/i.test(s)) {
      q = q.eq("site", s);
    } else {
      q = q.or(`site.eq."${s}",site_name.eq."${s}"`);
    }
  }

  q = q.order("posting_date", { ascending: false }).order("mat_doc", { ascending: false });

  const { data, error } = await q;
  if (error) {
    console.error("handleGetMb51GoodsIssue error:", error);
    return { ok: false, error: error.message, rows: [] };
  }

  const rawRows = data || [];
  const set552Item = new Set<string>();
  const set552Doc = new Set<string>();
  const set552Heuristic = new Set<string>();

  rawRows.forEach((r: any) => {
    if (String(r.mov_type || "").trim() === "552") {
      set552Item.add(`${r.mat_doc}_${r.mat_doc_year}_${r.doc_item}`);
      set552Doc.add(`${r.mat_doc}_${r.mat_doc_year}`);
      if (r.site && r.material) {
        set552Heuristic.add(`${r.site}_${r.material}_${Math.abs(Number(r.quantity))}_${String(r.doc_header_text || "").trim().toLowerCase()}`);
      }
    }
  });

  let valid551 = rawRows.filter((r: any) => {
    if (String(r.mov_type || "").trim() !== "551") return false;
    const kItem = `${r.mat_doc}_${r.mat_doc_year}_${r.doc_item}`;
    const kDoc = `${r.mat_doc}_${r.mat_doc_year}`;
    const kHeuristic = `${r.site}_${r.material}_${Math.abs(Number(r.quantity))}_${String(r.doc_header_text || "").trim().toLowerCase()}`;
    if (set552Item.has(kItem) || set552Doc.has(kDoc) || set552Heuristic.has(kHeuristic)) {
      return false;
    }
    return true;
  });

  if (filters.entry_unit && filters.entry_unit !== "ALL" && filters.entry_unit !== "") {
    const targetUnit = String(filters.entry_unit).trim().toUpperCase();
    valid551 = valid551.filter((r: any) => String(r.entry_unit || "").trim().toUpperCase() === targetUnit);
  }

  if (filters.stor_loc && filters.stor_loc !== "ALL" && filters.stor_loc !== "") {
    const targetSloc = String(filters.stor_loc).trim().toUpperCase();
    valid551 = valid551.filter((r: any) => {
      const s = String(r.stor_loc || "").trim().toUpperCase();
      const sName = getSlocName(s).toUpperCase();
      return s === targetSloc || sName === targetSloc || targetSloc.includes(s);
    });
  }

  if (filters.nhom_hang && filters.nhom_hang !== "ALL" && filters.nhom_hang !== "") {
    const targetNhom = String(filters.nhom_hang).trim().toLowerCase();
    valid551 = valid551.filter((r: any) => String(r.nhom_hang || "").trim().toLowerCase() === targetNhom);
  }

  if (filters.nganh_hang && filters.nganh_hang !== "ALL" && filters.nganh_hang !== "") {
    const targetNganh = String(filters.nganh_hang).trim().toLowerCase();
    valid551 = valid551.filter((r: any) => String(r.nganh_hang || "").trim().toLowerCase() === targetNganh);
  }

  if (filters.q && typeof filters.q === "string" && filters.q.trim()) {
    const kw = filters.q.trim().toLowerCase();
    valid551 = valid551.filter((r: any) => {
      const mat = String(r.material || "").toLowerCase();
      const desc = String(r.material_desc || "").toLowerCase();
      const doc = String(r.mat_doc || "").toLowerCase();
      return mat.includes(kw) || desc.includes(kw) || doc.includes(kw);
    });
  }

  const rows = valid551.map((r: any) => {
    const qty = Math.abs(Number(r.quantity || 0));
    const amt = Math.abs(Number(r.amount_lc || 0));
    const price = qty > 0 ? Math.round(amt / qty) : 0;
    return {
      mat_doc: r.mat_doc || "",
      doc_item: r.doc_item,
      mat_doc_year: r.mat_doc_year || "",
      posting_date: r.posting_date || r.entry_date || "",
      site: r.site || "",
      site_name: r.site_name || r.site || "",
      stor_loc: r.stor_loc || "",
      stor_loc_name: getSlocName(r.stor_loc),
      stor_loc_display: getSlocDisplayName(r.stor_loc),
      material: r.material || "",
      material_desc: r.material_desc || r.material || "",
      entry_unit: r.entry_unit || "",
      quantity: qty,
      amount_lc: amt,
      unit_price: price,
      mov_type: "551",
      mov_type_text: r.mov_text_vi || r.mov_text_sap || "Xuất kho tiêu hủy",
      mov_text_vi: r.mov_text_vi || "Xuất kho tiêu hủy",
      nganh_hang: r.nganh_hang || "",
      nhom_hang: r.nhom_hang || "",
      user_name: "",
      doc_header_text: r.doc_header_text || ""
    };
  });

  if (filters.limit && typeof filters.limit === "number") {
    return { ok: true, total: rows.length, rows: rows.slice(0, filters.limit) };
  }

  return { ok: true, total: rows.length, rows };
}

export const handleGetMb51MaterialDocsDisposal = handleGetMb51GoodsIssue;
