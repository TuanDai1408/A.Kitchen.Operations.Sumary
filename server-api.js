// =========================================================================
// A.KITCHEN DASHBOARD - LOCAL & PREVIEW API HANDLER
// Connects directly to Supabase PostgreSQL using @supabase/supabase-js
// =========================================================================

import { createClient } from "@supabase/supabase-js";
import {
  SLOC_GROUPS,
  SLOC_MAP,
  getSlocGroup,
  getSlocName,
  getSlocDisplayName,
  isProductionOrderIssue,
  isTransferMovement,
  isCountedAsWarehouseIssue,
  isCountedAsWarehouseReceipt
} from "./shared/sloc-config.js";

import {
  PORTION_SITE_RULES,
  isSiteK003,
  isSiteD007,
  getPortionFactor,
  normalizePortionQty
} from "./shared/portion-config.js";

import {
  isIssueMovement,
  isDisposalMovement,
  buildIssuePriceIndex,
  resolveIssueReferencePrice,
  enrichTransactionsWithEffectiveReceiptPrices
} from "./shared/warehouse-receipt-pricing.js";

export {
  SLOC_GROUPS,
  SLOC_MAP,
  getSlocGroup,
  getSlocName,
  getSlocDisplayName,
  isProductionOrderIssue,
  isTransferMovement,
  isCountedAsWarehouseIssue,
  isCountedAsWarehouseReceipt,
  PORTION_SITE_RULES,
  isSiteK003,
  isSiteD007,
  getPortionFactor,
  normalizePortionQty,
  isIssueMovement,
  isDisposalMovement,
  buildIssuePriceIndex,
  resolveIssueReferencePrice,
  enrichTransactionsWithEffectiveReceiptPrices
};

const SUPABASE_URL = process.env.SUPABASE_URL || "https://alqcojnxshfylheovdgw.supabase.co";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFscWNvam54c2hmeWxoZW92ZGd3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc5MDc3ODMwNSwiZXhwIjoyMTA2MzU0MzA1fQ.qO6NFbJWJuUDG1fArn47nvYBXVg4BhFDoho0Md4H1xk";
const API_TOKEN = process.env.API_TOKEN || "TRANTUANDAISIBAFOOD";

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

// In-memory cache & promise deduplication
const _apiCache = new Map();
const _inFlightPromises = new Map();

export function clearApiCache() {
  _apiCache.clear();
  _inFlightPromises.clear();
  delete global._cachedMaxBillingDate;
  delete global._cachedMaxBillingDateAt;
  delete global._cachedAllBillingDates;
  delete global._cachedAllBillingDatesAt;
  delete global._cachedMaxEstBillingDate;
  delete global._cachedMaxEstBillingDateAt;
  delete global._cachedAllEstBillingDates;
  delete global._cachedAllEstBillingDatesAt;
}

export async function withCache(cacheKey, ttlMs, fn) {
  const cached = _apiCache.get(cacheKey);
  if (cached && (Date.now() - cached.timestamp < ttlMs)) {
    return cached.data;
  }
  if (_inFlightPromises.has(cacheKey)) {
    return _inFlightPromises.get(cacheKey);
  }
  const promise = (async () => {
    try {
      const data = await fn();
      _apiCache.set(cacheKey, { data, timestamp: Date.now() });
      return data;
    } finally {
      _inFlightPromises.delete(cacheKey);
    }
  })();
  _inFlightPromises.set(cacheKey, promise);
  return promise;
}


/**
 * Lấy toàn bộ bản ghi vượt giới hạn mặc định 1000 dòng của Supabase PostgREST
 * Hỗ trợ lọc theo khoảng ngày trực tiếp trên database để tối ưu hiệu năng
 */
async function fetchAllRows(table, select = "*", orderCol = null, fromDate = null, toDate = null, dateCol = null) {
  const cacheKey = `fetchAllRows:${table}:${select}:${orderCol || ""}:${fromDate || ""}:${toDate || ""}:${dateCol || ""}`;
  return withCache(cacheKey, 180000, async () => {
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

    // Chunked parallel pagination (concurrency of 5 to avoid connection pool exhaustion)
    const pages = Math.ceil(count / step);
    const all = [];
    const CONCURRENCY = 5;
    for (let i = 0; i < pages; i += CONCURRENCY) {
      const chunkPromises = [];
      for (let j = i; j < Math.min(i + CONCURRENCY, pages); j++) {
        const from = j * step;
        const to = Math.min(from + step - 1, count - 1);
        let q = supabase.from(table).select(select).range(from, to);
        if (orderCol) q = q.order(orderCol, { ascending: true });
        if (fromDate && dateCol) q = q.gte(dateCol, fromDate);
        if (toDate && dateCol) q = q.lte(dateCol, toDate);
        chunkPromises.push(q);
      }
      const chunkResults = await Promise.all(chunkPromises);
      for (const r of chunkResults) {
        if (r.error) throw r.error;
        if (r.data) all.push(...r.data);
      }
    }
    return all;
  });
}

const DEFAULT_NGUONG = {
  thatThoatPct: 2,
  vangPct: 15,
  phutTre: 30,
  huyPct: 1.5,
  foodCostMin: 30,
  foodCostMax: 40,
  topKhachHang: 5,
};

const TRONG_SO = {
  thietBi: 3,
  nhanSu: 2,
  khieuNaiNghiemTrong: 4,
  khieuNaiCao: 3,
  khieuNaiKhac: 1,
  giaoTreNhe: 1,
  giaoTreNang: 2,
  thatThoat: 2,
  nvl: 1,
  chiPhiNgoai: 1,
};

function normMucDo(s) {
  const t = String(s || "").toLowerCase().trim();
  if (!t) return "Chưa phân loại";
  if (/nghiêm trọng|nghiem trong|critical|khẩn/i.test(t)) return "Nghiêm trọng";
  if (/^cao|cao$|high|nặng|nang/i.test(t)) return "Cao";
  if (/trung bình|trung binh|^tb$|medium|vừa|vua/i.test(t)) return "Trung bình";
  if (/thấp|thap|low|nhẹ|nhe|nhỏ|nho/i.test(t)) return "Thấp";
  return "Chưa phân loại";
}

function knDiem(mucDo) {
  const m = normMucDo(mucDo);
  if (m === "Nghiêm trọng") return TRONG_SO.khieuNaiNghiemTrong;
  if (m === "Cao") return TRONG_SO.khieuNaiCao;
  return TRONG_SO.khieuNaiKhac;
}

function parseGiaoTre(gioGiaoRaw) {
  const raw = String(gioGiaoRaw || "").trim();
  if (!raw) return { giaoTre: false, phutTre: 0, lyDoTre: "" };
  const isDelayText = /trễ|muộn|late|delay|chậm/i.test(raw);
  let phut = 0;
  const matchPhut = raw.match(/(\d+)\s*(?:phút|phut|p|ph|'|m)/i) ||
                    raw.match(/(?:trễ|muộn|chậm)\s*(\d+)/i);
  if (matchPhut) phut = parseInt(matchPhut[1], 10) || 0;
  const giaoTre = isDelayText || phut > 0;
  return { giaoTre, phutTre: giaoTre && phut === 0 ? 1 : phut, lyDoTre: giaoTre ? raw : "" };
}

function parseChiPhi(input) {
  if (input === null || input === undefined) return { coChiPhiNgoai: false, soTienChiPhi: 0, lyDoChiPhi: "" };
  if (typeof input === "number") return { coChiPhiNgoai: input > 0, soTienChiPhi: input, lyDoChiPhi: input > 0 ? "Chi phí ngoài phát sinh" : "" };
  const s = String(input).trim();
  if (!s || /^(không|khong|ko|k|none|0|không có|khong co|ko co|không phát sinh|khong phat sinh|không cps)$/i.test(s)) {
    return { coChiPhiNgoai: false, soTienChiPhi: 0, lyDoChiPhi: "" };
  }
  let soTien = 0;
  const cleanNumberStr = s.replace(/[.,\s]/g, "");
  const numMatch = cleanNumberStr.match(/(\d+)(k|nghìn|nghin|tr|triệu|trieu)?/i);
  if (numMatch) {
    const base = parseInt(numMatch[1], 10);
    const unit = (numMatch[2] || "").toLowerCase();
    if (unit === "k" || unit.startsWith("ngh")) soTien = base * 1000;
    else if (unit.startsWith("tr")) soTien = base * 1000000;
    else soTien = base;
  }
  return { coChiPhiNgoai: true, soTienChiPhi: soTien, lyDoChiPhi: s };
}

function parseDriveUrls(input) {
  if (!input) return [];
  const rawList = Array.isArray(input) ? input : String(input).split(/[,;\n\r\t]+/).map(x => x.trim()).filter(Boolean);
  return rawList.map(url => {
    const match = url.match(/\/d\/([a-zA-Z0-9_-]{20,})/i) || url.match(/[?&]id=([a-zA-Z0-9_-]{20,})/i);
    return (match && match[1]) ? `https://lh3.googleusercontent.com/d/${match[1]}` : url;
  });
}

function computeChiTietVanDe(row, nguong = DEFAULT_NGUONG) {
  let diem = 0;
  const lyDo = [];

  if (row.suCoThietBi && row.suCoThietBi.trim()) {
    diem += TRONG_SO.thietBi;
    lyDo.push(`• Thiết bị: ${row.suCoThietBi.trim()} (+${TRONG_SO.thietBi})`);
  }

  const soKN = Number(row.soKhieuNai || 0);
  const coPhanAnh = soKN > 0 ||
    Boolean(row.phanLoaiKN && row.phanLoaiKN.trim()) ||
    Boolean(row.mucDoNghiemTrong && row.mucDoNghiemTrong.trim()) ||
    Boolean(row.chiTietYKien && row.chiTietYKien.trim());

  if (coPhanAnh) {
    const dKN = knDiem(row.mucDoNghiemTrong);
    diem += dKN;
    const md = normMucDo(row.mucDoNghiemTrong);
    lyDo.push(`• Khiếu nại: ${soKN > 0 ? soKN : 1} — ${md} (+${dKN})`);
  }

  if (row.suCoNhanSu && row.suCoNhanSu.trim()) {
    diem += TRONG_SO.nhanSu;
    lyDo.push(`• Nhân sự: ${row.suCoNhanSu.trim()} (+${TRONG_SO.nhanSu})`);
  }

  if (row.giaoTre) {
    const pt = Number(row.phutTre || 0);
    const dTre = pt > nguong.phutTre ? TRONG_SO.giaoTreNang : TRONG_SO.giaoTreNhe;
    diem += dTre;
    lyDo.push(`• Giao trễ${pt ? " " + pt + " phút" : ""} (+${dTre})`);
  }

  const stt = Number(row.soThatThoat || 0);
  const ts = Number(row.tongSuat || 0);
  if (stt > 0 && ts > 0) {
    const ttp = (stt / ts) * 100;
    if (ttp > nguong.thatThoatPct) {
      diem += TRONG_SO.thatThoat;
      lyDo.push(`• Thất thoát: ${stt} suất (${ttp.toFixed(1)}%) (+${TRONG_SO.thatThoat})`);
    }
  }

  if (row.nvlBatThuong) {
    diem += TRONG_SO.nvl;
    lyDo.push(`• NVL: ${row.tinhTrangNVL || "Bất thường"} (+${TRONG_SO.nvl})`);
  }

  if (row.coChiPhiNgoai) {
    diem += TRONG_SO.chiPhiNgoai;
    lyDo.push(`• Chi phí: ${Number(row.soTienChiPhi || 0).toLocaleString("vi-VN")}đ (+${TRONG_SO.chiPhiNgoai})`);
  }

  let mucDoVanDe = 0;
  if (diem >= 6) mucDoVanDe = 3;
  else if (diem >= 3) mucDoVanDe = 2;
  else if (diem >= 1) mucDoVanDe = 1;

  return { mucDoVanDe, diemVanDe: diem, lyDoVanDe: lyDo };
}

function formatDate(val) {
  if (!val) return "";
  if (typeof val === "string") return val.substring(0, 10);
  if (val instanceof Date) {
    const y = val.getFullYear();
    const m = String(val.getMonth() + 1).padStart(2, "0");
    const d = String(val.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  return String(val);
}

function mapReportRow(r, nguong = DEFAULT_NGUONG) {
  const suatSang = Number(r.suat_sang || 0);
  const suatTrua = Number(r.suat_trua || 0);
  const suatChieu = Number(r.suat_chieu || 0);
  const suatNhanVien = Number(r.suat_nhan_vien || 0);
  const suatHuy = Number(r.suat_huy || 0);

  const calcTong = suatSang + suatTrua + suatChieu + suatNhanVien + suatHuy;
  const tongSuat = Number(r.tong_suat) > 0 ? Number(r.tong_suat) : calcTong;

  let giaoTre = Boolean(r.giao_tre);
  let phutTre = Number(r.phut_tre || 0);
  let lyDoTre = r.ly_do_tre || "";
  const gioGiaoRaw = r.gio_giao || "";
  if (!giaoTre && gioGiaoRaw) {
    const parsed = parseGiaoTre(gioGiaoRaw);
    giaoTre = parsed.giaoTre;
    phutTre = parsed.phutTre;
    lyDoTre = parsed.lyDoTre;
  }

  let coChiPhiNgoai = Boolean(r.co_chi_phi_ngoai);
  let soTienChiPhi = Number(r.so_tien_chi_phi || 0);
  let lyDoChiPhi = r.ly_do_chi_phi || "";
  if (!coChiPhiNgoai && r.so_tien_ly_do_chi_phi) {
    const parsedCP = parseChiPhi(r.so_tien_ly_do_chi_phi);
    coChiPhiNgoai = parsedCP.coChiPhiNgoai;
    soTienChiPhi = parsedCP.soTienChiPhi;
    lyDoChiPhi = parsedCP.lyDoChiPhi;
  }

  const tinhTrangNVL = r.tinh_trang_nvl || "";
  const nvlBatThuong = Boolean(r.nvl_bat_thuong) ||
    Boolean(tinhTrangNVL && !/^(bình thường|binh thuong|ổn|on|ok|tốt|tot)$/i.test(tinhTrangNVL.trim()));

  const soThatThoat = Number(r.so_that_thoat || 0);
  const suCoThietBi = r.su_co_thiet_bi || "";
  const suCoNhanSu = r.su_co_nhan_su || "";
  const soKhieuNai = Number(r.so_khieu_nai || 0);
  const soKhenNgoi = Number(r.so_khen_ngoi || 0);
  const phanLoaiKN = r.phan_loai_kn || "";
  const mucDoNghiemTrong = r.muc_do_nghiem_trong || "";
  const chiTietYKien = r.chi_tiet_y_kien || "";

  const vanDe = computeChiTietVanDe({
    suCoThietBi, soKhieuNai, mucDoNghiemTrong, suCoNhanSu,
    giaoTre, phutTre, soThatThoat, tongSuat,
    nvlBatThuong, tinhTrangNVL, coChiPhiNgoai, soTienChiPhi,
    chiTietYKien, phanLoaiKN
  }, nguong);

  return {
    id: r.id ? String(r.id) : `${r.ten_site}|${formatDate(r.ngay_bao_cao)}`,
    dauThoiGian: r.dau_thoi_gian ? String(r.dau_thoi_gian) : "",
    tenSite: r.ten_site || "",
    ngayBaoCao: formatDate(r.ngay_bao_cao),
    nguoiBaoCao: r.nguoi_bao_cao || "",
    suatSang, suatTrua, suatChieu, suatNhanVien, suatHuy,
    tongSuat,
    tenKhachHang: r.ten_khach_hang || "",
    suatLuuMau: Number(r.suat_luu_mau || 0),
    suatGiaoVien: Number(r.suat_giao_vien || 0),
    gioGiaoRaw, giaoTre, phutTre, lyDoTre,
    tinhTrangNVL, nvlBatThuong,
    suCoThietBi, soThatThoat,
    nguyenNhanThatThoat: r.nguyen_nhan_that_thoat || "",
    nsCoMat: Number(r.ns_co_mat || 0),
    nsVang: Number(r.ns_vang || 0),
    nsTangCa: Number(r.ns_tang_ca || 0),
    suCoNhanSu, soKhieuNai, soKhenNgoi,
    phanLoaiKN, mucDoNghiemTrong, chiTietYKien,
    coChiPhiNgoai, soTienChiPhi, lyDoChiPhi,
    hinhAnh: parseDriveUrls(r.hinh_anh),
    deXuat: r.de_xuat || "",
    mucDoVanDe: vanDe.mucDoVanDe,
    diemVanDe: vanDe.diemVanDe,
    lyDoVanDe: vanDe.lyDoVanDe,
  };
}

function computeIsReturn(r) {
  if (r.is_return === true || r.is_return === 1) return true;
  const sl = Number(r.so_luong || 0);
  const tt = Number(r.thanh_tien || r.thanh_tien_truoc_thue || 0);
  if (sl < 0 || tt < 0) return true;
  const docType = String(r.loai_chung_tu_billing || "").toUpperCase();
  if (docType.includes("RE") || docType.includes("TRẢ") || docType.includes("RETURN") || docType.includes("ZRE")) return true;
  const lyDo = String(r.ly_do_tra_hang || "").trim();
  if (lyDo.length > 0 && !/^(không|khong|none|0)$/i.test(lyDo)) return true;
  return false;
}

export function mapTransactionRow(r) {
  const soLuong = Number(r.so_luong || 0);
  const thanhTienTruocThue = Number(r.thanh_tien_truoc_thue || 0);
  const chietKhau = Number(r.ck_truoc_thue || r.chiet_khau || 0);
  const thanhTien = Number(r.thanh_tien) !== 0 && !isNaN(Number(r.thanh_tien))
    ? Number(r.thanh_tien)
    : (thanhTienTruocThue - chietKhau);
  const giaVon = Number(r.gia_von || 0);

  const vungMien = (r.vung_mien !== null && r.vung_mien !== undefined) ? String(r.vung_mien).trim() : "";
  const loaiCuaHang = (r.loai_cua_hang !== null && r.loai_cua_hang !== undefined) ? String(r.loai_cua_hang).trim() : "";
  const tenKenhBanHang = (r.ten_kenh_ban_hang !== null && r.ten_kenh_ban_hang !== undefined && String(r.ten_kenh_ban_hang).trim())
    ? String(r.ten_kenh_ban_hang).trim()
    : (r.kenh_ban_hang ? String(r.kenh_ban_hang).trim() : "");

  return {
    site: r.ten_cua_hang || "",
    ten_cua_hang: r.ten_cua_hang || "",
    maSite: r.ma_cua_hang || "",
    ma_cua_hang: r.ma_cua_hang || "",
    tenKH: r.ten_kh || r.ten_khach_hang || "",
    ten_khach_hang: r.ten_kh || r.ten_khach_hang || "",
    ngay: formatDate(r.billing_date),
    soLuong,
    so_luong: soLuong,
    dvt: r.dvt || "",
    thanhTien,
    thanh_tien: thanhTien,
    giaVon,
    gia_von: giaVon,
    nhomSP: r.nhom_sp || "",
    nhom_sp: r.nhom_sp || "",
    nganhHang: r.nganh_hang || "",
    nganh_hang: r.nganh_hang || "",
    kenhBanHang: r.kenh_ban_hang || "",
    kenh_ban_hang: r.kenh_ban_hang || "",
    tenKenhBanHang,
    ten_kenh_ban_hang: tenKenhBanHang,
    nvKinhDoanh: r.nv_kinh_doanh || "",
    nv_kinh_doanh: r.nv_kinh_doanh || "",
    tenSP: r.ten_sp || "",
    ten_sp: r.ten_sp || "",
    soHoaDon: r.so_hoa_don || "",
    so_hoa_don: r.so_hoa_don || "",
    soBillingGoc: r.so_billing_goc || "",
    so_billing_goc: r.so_billing_goc || "",
    lyDoTraHang: r.ly_do_tra_hang || "",
    ly_do_tra_hang: r.ly_do_tra_hang || "",
    isReturn: computeIsReturn(r),
    is_return: computeIsReturn(r),
    vungMien,
    vung_mien: vungMien,
    loaiCuaHang,
    loai_cua_hang: loaiCuaHang,
  };
}

// Handlers
export async function getDashboardData() {
  return withCache("getDashboardData", 180000, () => _getDashboardData());
}

export async function getDataVersion() {
  const now = new Date().toISOString();
  const { data } = await supabase.from("data_version").select("version, updated_at").order("updated_at", { ascending: false }).limit(1).maybeSingle();
  const currentUpdatedAt = data?.updated_at || now;
  if (global._lastKnownDataUpdatedAt && global._lastKnownDataUpdatedAt !== currentUpdatedAt) {
    clearApiCache();
  }
  global._lastKnownDataUpdatedAt = currentUpdatedAt;
  return { version: String(data?.version || "1.0.0"), updatedAt: currentUpdatedAt, serverTime: now };
}

export const TX_SELECT_COLS = "billing_date,ten_cua_hang,ma_cua_hang,ten_kh,so_luong,dvt,thanh_tien_truoc_thue,ck_truoc_thue,gia_von,nhom_sp,nganh_hang,kenh_ban_hang,ten_kenh_ban_hang,nv_kinh_doanh,ten_sp,so_hoa_don,so_billing_goc,ly_do_tra_hang,vung_mien,loai_cua_hang";

async function _getDashboardData() {
  const REPORT_COLS = "id,dau_thoi_gian,ten_site,ngay_bao_cao,nguoi_bao_cao,suat_sang,suat_trua,suat_chieu,suat_nhan_vien,suat_huy,tong_suat,gio_giao,ly_do_tre,tinh_trang_nvl,su_co_thiet_bi,so_that_thoat,nguyen_nhan_that_thoat,ns_co_mat,ns_vang,ns_tang_ca,su_co_nhan_su,so_khieu_nai,so_khen_ngoi,phan_loai_kn,muc_do_nghiem_trong,chi_tiet_y_kien,co_chi_phi_ngoai,so_tien_ly_do_chi_phi,hinh_anh,de_xuat,suat_luu_mau,suat_giao_vien,ten_khach_hang";
  const [versionRes, reportRes] = await Promise.all([
    supabase.from("data_version").select("version, updated_at").order("updated_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("report").select(REPORT_COLS).order("ngay_bao_cao", { ascending: true }).limit(5000)
  ]);

  const rawRows = reportRes.data || [];
  const rows = rawRows.map(r => mapReportRow(r, DEFAULT_NGUONG));
  const siteSet = new Set(), nguoiSet = new Set(), khachSet = new Set(), dateSet = new Set();
  rows.forEach(r => {
    if (r.tenSite) siteSet.add(r.tenSite);
    if (r.nguoiBaoCao) nguoiSet.add(r.nguoiBaoCao);
    if (r.tenKhachHang) khachSet.add(r.tenKhachHang);
    if (r.ngayBaoCao) dateSet.add(r.ngayBaoCao);
  });
  const viSort = (a, b) => a.localeCompare(b, "vi");
  return {
    ok: true,
    rows,
    sites: Array.from(siteSet).sort(viSort),
    nguoiBaoCao: Array.from(nguoiSet).sort(viSort),
    khachHang: Array.from(khachSet).sort(viSort),
    dates: Array.from(dateSet).sort(),
    nguong: DEFAULT_NGUONG,
    version: String(versionRes.data?.version || "1.0.0"),
    updatedAt: versionRes.data?.updated_at || new Date().toISOString(),
    total: rows.length
  };
}

/**
 * Lấy dữ liệu tiêu hủy từ mb51_goods_issue (thay thế disposal_of_goods)
 * Tối ưu hóa:
 * - Mặc định chỉ lấy theo kỳ phân tích (posting_date)
 * - Lọc site trực tiếp nếu có filter
 * - Tận dụng index (posting_date) và (site, posting_date)
 */
async function fetchMb51GoodsIssue(fromDate = null, toDate = null, siteFilter = null) {
  const selectCols = "mat_doc,doc_item,mat_doc_year,posting_date,doc_date,entry_date,site,site_name,stor_loc,user_name,mov_type,mov_type_text,material,material_desc,doc_header_text,quantity,entry_unit,amount_lc,ext_amount_lc,qty_stock_unit,stock_unit,nganh_hang,nhom_hang,row_hash";
  let q = supabase.from("mb51_goods_issue").select(selectCols);

  if (fromDate) q = q.gte("posting_date", fromDate);
  if (toDate) q = q.lte("posting_date", toDate);

  if (siteFilter) {
    if (Array.isArray(siteFilter) && siteFilter.length > 0) {
      const isCodes = siteFilter.every(s => /^[A-Z0-9_-]{3,6}$/i.test(s));
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

export async function getRevenueSummary(filtersParam) {
  const cacheKey = "getRevenueSummary:" + (typeof filtersParam === "string" ? filtersParam : JSON.stringify(filtersParam || {}));
  return withCache(cacheKey, 180000, () => _getRevenueSummary(filtersParam));
}

async function _getRevenueSummary(filtersParam) {
  let filters = {};
  if (typeof filtersParam === "string") {
    try { filters = JSON.parse(filtersParam); } catch {}
  } else if (typeof filtersParam === "object" && filtersParam !== null) {
    filters = filtersParam;
  }

  const granular = filters.granular || filters.gran || "week";

  // 1. Xác định ngày lớn nhất có dữ liệu
  let maxDateStr = global._cachedMaxBillingDate;
  if (!maxDateStr || Date.now() - (global._cachedMaxBillingDateAt || 0) > 300000) {
    const { data: latestRow } = await supabase
      .from("transactions")
      .select("billing_date")
      .order("billing_date", { ascending: false })
      .limit(1)
      .maybeSingle();
    maxDateStr = latestRow?.billing_date || "2026-09-25";
    global._cachedMaxBillingDate = maxDateStr;
    global._cachedMaxBillingDateAt = Date.now();
  }

  const maxD = new Date(maxDateStr);
  const oneMonthAgo = new Date(maxD);
  oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
  const defaultFrom = oneMonthAgo.toISOString().slice(0, 10);

  let reqFrom = filters.from || "";
  let reqTo = filters.to || "";
  if (!reqFrom && !filters.all) {
    reqFrom = defaultFrom;
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

  let queryFrom = reqFrom;
  let prFrom = "", prTo = "";
  if (reqFrom && reqTo) {
    try {
      const d1 = new Date(reqFrom + "T00:00:00");
      const d2 = new Date(reqTo + "T00:00:00");
      const days = Math.round((d2 - d1) / 86400000) + 1;
      const pTo = new Date(d1.getTime() - 86400000);
      const pFrom = new Date(pTo.getTime() - (days - 1) * 86400000);
      prFrom = pFrom.toISOString().slice(0, 10);
      prTo = pTo.toISOString().slice(0, 10);
      queryFrom = prFrom;
    } catch {}
  }

  const isSacn = Boolean(filters.sacn || filters.tab === "sacn");
  const siteFilter = filters.site || filters.sites || null;

  const [rawTx, opexRes, reportRes, rawMb51, plRows] = await Promise.all([
    fetchAllRows("transactions", TX_SELECT_COLS, "billing_date", queryFrom || null, reqTo || null, "billing_date"),
    supabase.from("opex_input").select("*"),
    supabase.from("report").select("ten_site, ngay_bao_cao, suat_huy, tong_suat, nguoi_bao_cao").order("ngay_bao_cao", { ascending: true }),
    fetchMb51GoodsIssue(queryFrom || null, reqTo || null, siteFilter),
    fetchAllRows("kehoach_pl_thang", "*", "ky")
  ]);

  let txList = rawTx;
  if (isSacn) {
    const SACN_EXCLUDE = new Set(["K502", "K003", "K800", "D007"]);
    txList = rawTx.filter(r => {
      if (SACN_EXCLUDE.has(r.ma_cua_hang)) return false;
      const s = r.ten_cua_hang || "";
      if (/megafar/i.test(s)) return false;
      return true;
    });
  }
  if (siteFilter) {
    const sArr = Array.isArray(siteFilter) ? siteFilter : [siteFilter];
    if (sArr.length > 0) {
      const sSet = new Set(sArr);
      txList = txList.filter(r => sSet.has(r.ten_cua_hang) || sSet.has(r.ma_cua_hang));
    }
  }

  const curRows = [];
  const prevRows = [];
  txList.forEach(r => {
    const d = formatDate(r.billing_date);
    if (reqFrom && reqTo) {
      if (d >= reqFrom && d <= reqTo) curRows.push(r);
      else if (prFrom && prTo && d >= prFrom && d <= prTo) prevRows.push(r);
    } else {
      curRows.push(r);
    }
  });

  function agg(rows) {
    let netRevenue = 0, foodCost = 0, soLuong = 0, qtyPHA = 0, qtyKG = 0, qtyCHY = 0;
    const invSet = new Set();
    const daySet = new Set();
    const getNet = r => Number(r.thanh_tien !== undefined && r.thanh_tien !== null ? r.thanh_tien : (Number(r.thanh_tien_truoc_thue || 0) - Number(r.ck_truoc_thue || 0)));

    rows.forEach(r => {
      const tt = getNet(r);
      const gv = Number(r.gia_von || 0);
      const q = Number(r.so_luong || 0);
      const dvt = String(r.dvt || "").toUpperCase().trim();
      const d = formatDate(r.billing_date);
      netRevenue += tt;
      foodCost += gv;
      soLuong += q;
      if (dvt === "PHA") qtyPHA += q;
      else if (dvt === "KG") qtyKG += q;
      else if (dvt === "CHY") qtyCHY += q;
      if (r.so_hoa_don) invSet.add(r.so_hoa_don);
      if (d) daySet.add(d);
    });
    const grossProfit = netRevenue - foodCost;
    const foodCostPct = netRevenue > 0 ? (foodCost / netRevenue) * 100 : 0;
    const grossMarginPct = netRevenue > 0 ? (grossProfit / netRevenue) * 100 : 0;
    const asp = qtyPHA > 0 ? netRevenue / qtyPHA : 0;
    const aspKG = qtyKG > 0 ? netRevenue / qtyKG : 0;
    const aspCHY = qtyCHY > 0 ? netRevenue / qtyCHY : 0;
    const operatingDays = daySet.size;
    const netPerDay = operatingDays > 0 ? netRevenue / operatingDays : 0;

    return {
      netRevenue, foodCost, grossProfit, foodCostPct, grossMarginPct, soLuong,
      soDonHang: invSet.size, invoiceCount: invSet.size,
      qtyPHA, qtyKG, qtyCHY, asp, aspKG, aspCHY, operatingDays, netPerDay
    };
  }

  const kpiCur = agg(curRows);
  const kpiPrev = agg(prevRows);

  let totalNS = 0;
  (plRows || []).forEach(p => {
    if (p.hang_muc === "ChiPhiNhanSu") totalNS += Number(p.gia_tri || 0);
  });
  const daysSpan = reqFrom && reqTo ? Math.max(1, Math.round((new Date(reqTo) - new Date(reqFrom)) / 86400000) + 1) : 30;
  const scaledNS = Math.round(totalNS * (daysSpan / 30));
  kpiCur.am1 = kpiCur.grossProfit;
  kpiCur.ns = scaledNS;
  kpiCur.hasNS = scaledNS > 0;
  kpiCur.am2 = kpiCur.am1 - scaledNS;
  kpiCur.am2Pct = kpiCur.netRevenue > 0 ? (kpiCur.am2 / kpiCur.netRevenue) * 100 : 0;

  kpiPrev.am1 = kpiPrev.grossProfit;
  kpiPrev.ns = scaledNS;
  kpiPrev.hasNS = scaledNS > 0;
  kpiPrev.am2 = kpiPrev.am1 - scaledNS;
  kpiPrev.am2Pct = kpiPrev.netRevenue > 0 ? (kpiPrev.am2 / kpiPrev.netRevenue) * 100 : 0;

  let suatHuy = 0, tongSuat = 0;
  (reportRes.data || []).forEach(h => {
    const d = formatDate(h.ngay_bao_cao);
    if (!reqFrom || !reqTo || (d >= reqFrom && d <= reqTo)) {
      suatHuy += Number(h.suat_huy || 0);
      tongSuat += Number(h.tong_suat || 0);
    }
  });
  const huyPct = tongSuat > 0 ? (suatHuy / tongSuat) * 100 : 0;
  kpiCur.huyQtyPct = huyPct;
  kpiCur.huyReportPct = huyPct;
  kpiCur.huySuatHuy = suatHuy;
  kpiCur.huyTongSuat = tongSuat;
  kpiCur.huyHasReport = tongSuat > 0;

  const getNet = r => Number(r.thanh_tien !== undefined && r.thanh_tien !== null ? r.thanh_tien : (Number(r.thanh_tien_truoc_thue || 0) - Number(r.ck_truoc_thue || 0)));

  const dayMap = {};
  curRows.forEach(r => {
    const d = formatDate(r.billing_date);
    if (!dayMap[d]) dayMap[d] = { key: d, date: d, netRevenue: 0, foodCost: 0, soLuong: 0 };
    dayMap[d].netRevenue += getNet(r);
    dayMap[d].foodCost += Number(r.gia_von || 0);
    dayMap[d].soLuong += Number(r.so_luong || 0);
  });
  const byDay = Object.values(dayMap).sort((a, b) => a.date.localeCompare(b.date)).map(d => ({
    ...d,
    grossProfit: d.netRevenue - d.foodCost,
    foodCostPct: d.netRevenue > 0 ? (d.foodCost / d.netRevenue) * 100 : 0,
    am1: d.netRevenue - d.foodCost,
    am2: d.netRevenue - d.foodCost - (scaledNS / Math.max(1, Object.keys(dayMap).length))
  }));

  const siteMap = {};
  curRows.forEach(r => {
    const s = r.ten_cua_hang || "Chưa rõ";
    if (!siteMap[s]) siteMap[s] = { key: s, site: s, maSite: r.ma_cua_hang || "", netRevenue: 0, foodCost: 0, soLuong: 0 };
    siteMap[s].netRevenue += getNet(r);
    siteMap[s].foodCost += Number(r.gia_von || 0);
    siteMap[s].soLuong += Number(r.so_luong || 0);
  });

  // Hủy từ Report theo site
  const siteHuyMap = {};
  (reportRes.data || []).forEach(h => {
    const s = h.ten_site || "";
    const d = formatDate(h.ngay_bao_cao);
    if (!reqFrom || !reqTo || (d >= reqFrom && d <= reqTo)) {
      if (!siteHuyMap[s]) siteHuyMap[s] = { suatHuy: 0, tongSuat: 0 };
      siteHuyMap[s].suatHuy += Number(h.suat_huy || 0);
      siteHuyMap[s].tongSuat += Number(h.tong_suat || 0);
    }
  });

  const normSite = str => String(str || "").toLowerCase().replace(/\s+/g, " ").trim();
  const matchHuyForSite = siteName => {
    if (siteHuyMap[siteName]) return siteHuyMap[siteName];
    const target = normSite(siteName);
    for (const key of Object.keys(siteHuyMap)) {
      const k = normSite(key);
      if (k === target || target.includes(k) || k.includes(target)) {
        return siteHuyMap[key];
      }
    }
    return null;
  };

  const bySite = Object.values(siteMap).sort((a, b) => b.netRevenue - a.netRevenue).map(s => {
    const hInfo = matchHuyForSite(s.site);
    const sh = (hInfo && hInfo.suatHuy) || 0;
    const ts = (hInfo && hInfo.tongSuat) || 0;
    const hPct = ts > 0 ? (sh / ts) * 100 : null;
    return {
      ...s,
      grossProfit: s.netRevenue - s.foodCost,
      foodCostPct: s.netRevenue > 0 ? (s.foodCost / s.netRevenue) * 100 : 0,
      grossMarginPct: s.netRevenue > 0 ? ((s.netRevenue - s.foodCost) / s.netRevenue) * 100 : 0,
      am1: s.netRevenue - s.foodCost,
      am2: s.netRevenue - s.foodCost,
      huyReportPct: hPct,
      huyQtyPct: hPct,
      huySuatHuy: sh,
      huyTongSuat: ts
    };
  });

  const chMap = {};
  curRows.forEach(r => {
    const c = r.ten_kenh_ban_hang || r.kenh_ban_hang || "(Không tên kênh)";
    if (!chMap[c]) chMap[c] = { key: c, channel: c, netRevenue: 0, foodCost: 0, soLuong: 0 };
    chMap[c].netRevenue += getNet(r);
    chMap[c].foodCost += Number(r.gia_von || 0);
    chMap[c].soLuong += Number(r.so_luong || 0);
  });
  const byChannel = Object.values(chMap).sort((a, b) => b.netRevenue - a.netRevenue).map(c => ({
    ...c,
    foodCostPct: c.netRevenue > 0 ? (c.foodCost / c.netRevenue) * 100 : 0,
    pct: kpiCur.netRevenue > 0 ? (c.netRevenue / kpiCur.netRevenue) * 100 : 0
  }));

  const grMap = {};
  curRows.forEach(r => {
    const g = r.nhom_sp || "(Chưa phân nhóm)";
    if (!grMap[g]) grMap[g] = { key: g, group: g, nhomSP: g, netRevenue: 0, foodCost: 0, soLuong: 0 };
    grMap[g].netRevenue += getNet(r);
    grMap[g].foodCost += Number(r.gia_von || 0);
    grMap[g].soLuong += Number(r.so_luong || 0);
  });
  const byProductGroup = Object.values(grMap).sort((a, b) => b.netRevenue - a.netRevenue).map(g => ({
    ...g,
    foodCostPct: g.netRevenue > 0 ? (g.foodCost / g.netRevenue) * 100 : 0,
    pct: kpiCur.netRevenue > 0 ? (g.netRevenue / kpiCur.netRevenue) * 100 : 0
  }));

  // 1. byCustomer / byKhachHang
  const khMap = {};
  curRows.forEach(r => {
    const kh = r.ten_kh || r.ten_khach_hang || "(Không tên KH)";
    if (!khMap[kh]) khMap[kh] = { key: kh, customer: kh, ten_kh: kh, ma_kh: r.ma_kh || "", netRevenue: 0, netRev: 0, foodCost: 0, cogs: 0, salesQty: 0, qty: 0 };
    const net = getNet(r);
    const fc = Number(r.gia_von || 0);
    const sl = Number(r.so_luong || 0);
    khMap[kh].netRevenue += net;
    khMap[kh].netRev += net;
    khMap[kh].foodCost += fc;
    khMap[kh].cogs += fc;
    khMap[kh].salesQty += sl;
    khMap[kh].qty += sl;
  });
  const byCustomer = Object.values(khMap).sort((a, b) => b.netRevenue - a.netRevenue).map(c => ({
    ...c,
    grossProfit: c.netRevenue - c.foodCost,
    foodCostPct: c.netRevenue > 0 ? (c.foodCost / c.netRevenue) * 100 : 0,
    fcPct: c.netRevenue > 0 ? (c.foodCost / c.netRevenue) * 100 : 0
  })).slice(0, 50);

  // 2. topProductsByRev & topProductsByFc
  const prodMap = {};
  curRows.forEach(r => {
    const p = r.ten_sp || "Sản phẩm";
    if (!prodMap[p]) prodMap[p] = { key: p, name: p, ma_sp: r.ma_sp || "", ten_sp: p, group: r.nhom_sp || "", netRevenue: 0, netRev: 0, foodCost: 0, cogs: 0, salesQty: 0, qty: 0, dvt: r.dvt || "" };
    const net = getNet(r);
    const fc = Number(r.gia_von || 0);
    const sl = Number(r.so_luong || 0);
    prodMap[p].netRevenue += net;
    prodMap[p].netRev += net;
    prodMap[p].foodCost += fc;
    prodMap[p].cogs += fc;
    prodMap[p].salesQty += sl;
    prodMap[p].qty += sl;
  });
  const prods = Object.values(prodMap).map(p => ({
    ...p,
    grossProfit: p.netRevenue - p.foodCost,
    foodCostPct: p.netRevenue > 0 ? (p.foodCost / p.netRevenue) * 100 : 0,
    fcPct: p.netRevenue > 0 ? (p.foodCost / p.netRevenue) * 100 : 0
  }));
  const topProductsByRev = prods.slice().sort((a, b) => b.netRevenue - a.netRevenue).slice(0, 20);
  const topProductsByFc = prods.filter(p => p.netRevenue >= 100000).sort((a, b) => b.foodCostPct - a.foodCostPct).slice(0, 20);

  // 3. discardNvlBySite & disposal (MB51 Goods Issue)
  const dispSiteMap = {};
  const dispDateMap = {};
  let totalDispValue = 0, totalDispQtyKg = 0;
  (rawMb51 || []).forEach(m => {
    const s = m.site_name || m.site || "Chưa rõ";
    const d = formatDate(m.posting_date);
    const q = Math.abs(Number(m.quantity || m.qty || 0));
    const v = Math.abs(Number(m.amount_lc || m.ext_amount_lc || 0));
    totalDispQtyKg += q;
    totalDispValue += v;

    if (!dispSiteMap[s]) dispSiteMap[s] = { key: s, site: s, siteName: s, qtyKg: 0, value: 0, pctOfRev: 0, dispQtyKg: 0, dispValue: 0, dispPctRev: 0 };
    dispSiteMap[s].qtyKg += q;
    dispSiteMap[s].value += v;
    dispSiteMap[s].dispQtyKg += q;
    dispSiteMap[s].dispValue += v;

    if (d) {
      if (!dispDateMap[d]) dispDateMap[d] = { date: d, ngay: d, qtyKg: 0, value: 0 };
      dispDateMap[d].qtyKg += q;
      dispDateMap[d].value += v;
    }
  });
  const discardNvlBySite = Object.values(dispSiteMap).map(s => {
    const sRev = (siteMap[s.site] && siteMap[s.site].netRevenue) || 0;
    const pct = sRev > 0 ? (s.value / sRev) * 100 : 0;
    return {
      ...s,
      pctOfRev: pct,
      dispPctRev: pct
    };
  }).sort((a, b) => b.value - a.value);

  const disposal = {
    qtyKg: totalDispQtyKg,
    value: totalDispValue,
    pctRev: kpiCur.netRevenue > 0 ? (totalDispValue / kpiCur.netRevenue) * 100 : 0,
    bySite: dispSiteMap,
    byDate: dispDateMap,
    discardNvlBySite
  };

  // 4. discardByDay & huyChiTiet & huyRows (Suất hủy theo ngày từ Report)
  const dayHuyMap = {};
  const huyRows = [];
  (reportRes.data || []).forEach(h => {
    const d = formatDate(h.ngay_bao_cao);
    if (!reqFrom || !reqTo || (d >= reqFrom && d <= reqTo)) {
      const sh = Number(h.suat_huy || 0);
      const ts = Number(h.tong_suat || 0);
      const site = h.ten_site || "";
      const row = {
        date: d,
        ngay: d,
        site,
        tenSite: site,
        ten_site: site,
        suatHuy: sh,
        tongSuat: ts,
        pct: ts > 0 ? (sh / ts) * 100 : 0,
        huyPct: ts > 0 ? (sh / ts) * 100 : 0,
        nguoiBaoCao: h.nguoi_bao_cao || ""
      };
      huyRows.push(row);

      if (!dayHuyMap[d]) dayHuyMap[d] = { date: d, ngay: d, suatHuy: 0, tongSuat: 0, nguoiBaoCao: h.nguoi_bao_cao || "" };
      dayHuyMap[d].suatHuy += sh;
      dayHuyMap[d].tongSuat += ts;
    }
  });
  const discardByDay = Object.values(dayHuyMap).map(d => ({
    ...d,
    pct: d.tongSuat > 0 ? (d.suatHuy / d.tongSuat) * 100 : 0,
    huyPct: d.tongSuat > 0 ? (d.suatHuy / d.tongSuat) * 100 : 0
  })).sort((a, b) => b.date.localeCompare(a.date));

  // 5. siteDetail với byKhachHang, topSanPham, topFoodCost, huyChiTiet
  const siteDetail = {};
  bySite.forEach(s => {
    const sRows = curRows.filter(r => (r.ten_cua_hang || "Chưa rõ") === s.site);
    const sProds = {};
    const sCusts = {};
    sRows.forEach(r => {
      const p = r.ten_sp || "SP";
      if (!sProds[p]) sProds[p] = { key: p, name: p, ten_sp: p, netRevenue: 0, foodCost: 0, soLuong: 0, salesQty: 0 };
      const net = getNet(r);
      const fc = Number(r.gia_von || 0);
      const sl = Number(r.so_luong || 0);
      sProds[p].netRevenue += net;
      sProds[p].foodCost += fc;
      sProds[p].soLuong += sl;
      sProds[p].salesQty += sl;

      const c = r.ten_kh || r.ten_khach_hang || "(Không tên KH)";
      if (!sCusts[c]) sCusts[c] = { key: c, customer: c, ten_kh: c, netRevenue: 0, foodCost: 0, grossProfit: 0, cogs: 0, foodCostPct: 0 };
      sCusts[c].netRevenue += net;
      sCusts[c].foodCost += fc;
      sCusts[c].cogs += fc;
    });
    const sProdList = Object.values(sProds).map(p => ({
      ...p,
      grossProfit: p.netRevenue - p.foodCost,
      foodCostPct: p.netRevenue > 0 ? (p.foodCost / p.netRevenue) * 100 : 0
    }));
    const sCustList = Object.values(sCusts).map(c => ({
      ...c,
      grossProfit: c.netRevenue - c.foodCost,
      foodCostPct: c.netRevenue > 0 ? (c.foodCost / c.netRevenue) * 100 : 0
    })).sort((a, b) => b.netRevenue - a.netRevenue);

    const sHuyList = huyRows.filter(h => h.site === s.site).sort((a, b) => b.ngay.localeCompare(a.ngay));

    // gán mb51 disposal cho site s
    const d0 = dispSiteMap[s.site];
    if (d0) {
      s.dispQtyKg = d0.qtyKg;
      s.dispValue = d0.value;
      s.dispPctRev = d0.pctOfRev;
    } else {
      s.dispQtyKg = 0; s.dispValue = 0; s.dispPctRev = 0;
    }

    siteDetail[s.site] = {
      kpi: s,
      byKhachHang: sCustList,
      byCustomer: sCustList,
      topSanPham: sProdList.slice().sort((a, b) => b.netRevenue - a.netRevenue).slice(0, 20),
      topFoodCost: sProdList.filter(p => p.netRevenue >= 100000).sort((a, b) => b.foodCostPct - a.foodCostPct).slice(0, 15),
      huyChiTiet: sHuyList,
      discardByDay: sHuyList
    };
  });

  const siteSet = new Set(), kenhSet = new Set(), nhomSet = new Set(), nvkdSet = new Set(), khSet = new Set(), dateSet = new Set();
  const vungSet = new Set(), loaiSet = new Set();
  txList.forEach(r => {
    if (r.ten_cua_hang) siteSet.add(r.ten_cua_hang);
    const kName = r.ten_kenh_ban_hang || r.kenh_ban_hang;
    if (kName) kenhSet.add(kName);
    if (r.nhom_sp) nhomSet.add(r.nhom_sp);
    if (r.nv_kinh_doanh) nvkdSet.add(r.nv_kinh_doanh);
    if (r.ten_kh || r.ten_khach_hang) khSet.add(r.ten_kh || r.ten_khach_hang);
    if (r.billing_date) dateSet.add(formatDate(r.billing_date));
    if (r.vung_mien) vungSet.add(r.vung_mien);
    if (r.loai_cua_hang) loaiSet.add(r.loai_cua_hang);
  });
  const viSort = (a, b) => a.localeCompare(b, "vi");

  // Nạp toàn bộ danh mục ngày có dữ liệu bán hàng để dropdown kỳ (Tuần/Tháng/Quý/Năm) luôn có đủ dữ liệu
  if (!global._cachedAllBillingDates || Date.now() - (global._cachedAllBillingDatesAt || 0) > 300000) {
    try {
      const allDatesRows = await fetchAllRows("transactions", "billing_date", "billing_date");
      const dSet = new Set();
      (allDatesRows || []).forEach(r => { if (r.billing_date) dSet.add(r.billing_date.slice(0, 10)); });
      global._cachedAllBillingDates = Array.from(dSet).sort();
      global._cachedAllBillingDatesAt = Date.now();
    } catch (e) {
      console.warn("fetch all billing dates error:", e);
    }
  }
  const allAvailableDates = (global._cachedAllBillingDates && global._cachedAllBillingDates.length)
    ? global._cachedAllBillingDates
    : Array.from(dateSet).sort();

  const dims = {
    sites: Array.from(siteSet).sort(viSort),
    kenh: Array.from(kenhSet).sort(viSort),
    nhomSP: Array.from(nhomSet).sort(viSort),
    nvkd: Array.from(nvkdSet).sort(viSort),
    khachHang: Array.from(khSet).sort(viSort),
    dates: Array.from(dateSet).sort(),
    allDates: allAvailableDates,
    vungMien: Array.from(vungSet).sort(viSort),
    loaiCuaHang: Array.from(loaiSet).sort(viSort),
    maxBillingDate: maxDateStr,
    defaultFrom: defaultFrom,
    loadedFrom: reqFrom || defaultFrom,
    loadedTo: reqTo || maxDateStr
  };

  const aggRowsMap = new Map();
  curRows.forEach(r => {
    const k = `${r.billing_date}|${r.ten_cua_hang}|${r.nhom_sp}|${r.ten_kenh_ban_hang || r.kenh_ban_hang}|${r.dvt || ""}`;
    let it = aggRowsMap.get(k);
    if (!it) {
      it = {
        id: r.id,
        ngay: formatDate(r.billing_date),
        billing_date: formatDate(r.billing_date),
        site: r.ten_cua_hang || "",
        ten_cua_hang: r.ten_cua_hang || "",
        maSite: r.ma_cua_hang || "",
        ma_cua_hang: r.ma_cua_hang || "",
        nhomSP: r.nhom_sp || "",
        nhom_sp: r.nhom_sp || "",
        tenKenhBanHang: r.ten_kenh_ban_hang || r.kenh_ban_hang || "",
        kenhBanHang: r.kenh_ban_hang || "",
        vungMien: r.vung_mien || "",
        loaiCuaHang: r.loai_cua_hang || "",
        dvt: r.dvt || "",
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
    const net = getNet(r);
    const fc = Number(r.gia_von || 0);
    const sl = Number(r.so_luong || 0);
    it.soLuong += sl;
    it.so_luong += sl;
    it.thanhTien += net;
    it.thanh_tien += net;
    it.netRevenue += net;
    it.foodCost += fc;
    it.giaVon += fc;
    it.gia_von += fc;
  });
  const summaryRows = Array.from(aggRowsMap.values());

  return {
    ok: true,
    isSummary: true,
    rows: summaryRows,
    kpis: kpiCur,
    kpi: kpiCur,
    kpiPrev,
    byDay,
    byDate: byDay,
    bySite,
    byChannel,
    byKenh: byChannel,
    byProductGroup,
    byNhomSP: byProductGroup,
    byCustomer,
    byKhachHang: byCustomer,
    topProductsByRev,
    topProductsByFc,
    topSanPham: topProductsByRev,
    topFoodCost: topProductsByFc,
    discardNvlBySite,
    discardBySite: discardNvlBySite,
    disposal,
    discardByDay,
    huyChiTiet: discardByDay,
    huyRows,
    siteDetail,
    dims,
    nguong: DEFAULT_NGUONG,
    totalLines: curRows.length,
    filteredLines: curRows.length,
    prevRange: prFrom && prTo ? { from: prFrom, to: prTo } : null,
    updatedAt: new Date().toISOString()
  };
}

export async function getRevenueRawData(filtersParam) {
  let filters = {};
  if (typeof filtersParam === "string") {
    try { filters = JSON.parse(filtersParam); } catch {}
  } else if (typeof filtersParam === "object" && filtersParam !== null) {
    filters = filtersParam;
  }

  // 1. Xác định ngày lớn nhất có dữ liệu trong transactions
  const { data: latestDateRow } = await supabase
    .from("transactions")
    .select("billing_date")
    .order("billing_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  const maxDateStr = latestDateRow?.billing_date || "2026-09-25";

  // Mặc định: 1 tháng gần nhất kể từ ngày lớn nhất có dữ liệu
  const maxD = new Date(maxDateStr);
  const oneMonthAgo = new Date(maxD);
  oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
  const defaultFrom = oneMonthAgo.toISOString().slice(0, 10);

  let reqFrom = filters.from || "";
  let reqTo = filters.to || "";

  // Nếu người dùng không chỉ định khoảng ngày hoặc không yêu cầu lấy toàn bộ lịch sử (all):
  if (!reqFrom && !filters.all) {
    reqFrom = defaultFrom;
    reqTo = reqTo || maxDateStr;
  }

  // Mở rộng queryFrom để chứa cả kỳ trước (phục vụ tính KPI so sánh kpiPrev / dispPrev)
  let queryFrom = reqFrom;
  if (reqFrom && reqTo) {
    try {
      const d1 = new Date(reqFrom + "T00:00:00");
      const d2 = new Date(reqTo + "T00:00:00");
      const days = Math.round((d2 - d1) / 86400000) + 1;
      const pTo = new Date(d1.getTime() - 86400000);
      const pFrom = new Date(pTo.getTime() - (days - 1) * 86400000);
      queryFrom = pFrom.toISOString().slice(0, 10);
    } catch {}
  }

  const [rawTx, opexRes, reportRes, rawMb51, plRows] = await Promise.all([
    fetchAllRows("transactions", TX_SELECT_COLS, "billing_date", queryFrom || null, reqTo || null, "billing_date"),
    supabase.from("opex_input").select("*"),
    supabase.from("report").select("ten_site, ngay_bao_cao, suat_huy, tong_suat, nguoi_bao_cao").order("ngay_bao_cao", { ascending: true }),
    fetchMb51GoodsIssue(queryFrom || null, reqTo || null, filters.site || filters.sites || null),
    fetchAllRows("kehoach_pl_thang", "*", "ky")
  ]);

  const rows = rawTx.map(mapTransactionRow);
  const siteSet = new Set(), kenhSet = new Set(), nhomSet = new Set(), nvkdSet = new Set(), khSet = new Set(), dateSet = new Set();
  const vungSet = new Set(), loaiSet = new Set();
  (reportRes.data || []).forEach(r => {
    if (r.ten_site) siteSet.add(r.ten_site);
  });
  rows.forEach(r => {
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
  (rawMb51 || []).forEach(r => {
    if (r.site_name) siteSet.add(r.site_name);
  });
  const viSort = (a, b) => a.localeCompare(b, "vi");

  // Nạp toàn bộ danh mục ngày có dữ liệu bán hàng để dropdown kỳ (Tuần/Tháng/Quý/Năm) luôn có đủ dữ liệu
  if (!global._cachedAllBillingDates || Date.now() - (global._cachedAllBillingDatesAt || 0) > 300000) {
    try {
      const allDatesRows = await fetchAllRows("transactions", "billing_date", "billing_date");
      const dSet = new Set();
      (allDatesRows || []).forEach(r => { if (r.billing_date) dSet.add(r.billing_date.slice(0, 10)); });
      global._cachedAllBillingDates = Array.from(dSet).sort();
      global._cachedAllBillingDatesAt = Date.now();
    } catch (e) {
      console.warn("fetch all billing dates error:", e);
    }
  }
  const allAvailableDates = (global._cachedAllBillingDates && global._cachedAllBillingDates.length)
    ? global._cachedAllBillingDates
    : Array.from(dateSet).sort();

  const dims = {
    sites: Array.from(siteSet).sort(viSort),
    kenh: Array.from(kenhSet).sort(viSort),
    nhomSP: Array.from(nhomSet).sort(viSort),
    nvkd: Array.from(nvkdSet).sort(viSort),
    khachHang: Array.from(khSet).sort(viSort),
    dates: Array.from(dateSet).sort(),
    allDates: allAvailableDates,
    vungMien: Array.from(vungSet).sort(viSort),
    loaiCuaHang: Array.from(loaiSet).sort(viSort),
    maxBillingDate: maxDateStr,
    defaultFrom: defaultFrom,
    loadedFrom: reqFrom || "2026-06-30",
    loadedTo: reqTo || maxDateStr,
    isPartialHistory: Boolean(reqFrom && reqFrom > "2026-06-30")
  };

  const opexItems = (opexRes.data || []).map(o => ({
    site: o.site || "ALL",
    period: o.ky || o.period || "ALL",
    amount: Number(o.so_tien || o.amount || 0),
    updatedAt: o.cap_nhat_luc || o.updated_at || new Date().toISOString()
  }));

  const personnelBySiteKy = [];
  const planSiteSet = new Set();
  (plRows || []).forEach(p => {
    const s = String(p.site || "").trim();
    if (s) planSiteSet.add(s);
    if (p.hang_muc === "ChiPhiNhanSu") {
      const k = String(p.ky || "").trim();
      const amount = Number(p.gia_tri || 0);
      if (s && k) personnelBySiteKy.push({ site: s, ky: k, amount });
    }
  });

  const huyRows = (reportRes.data || []).map(h => ({
    tenSite: h.ten_site || "",
    ngay: formatDate(h.ngay_bao_cao),
    suatHuy: Number(h.suat_huy || 0),
    tongSuat: Number(h.tong_suat || 0),
    nguoiBaoCao: h.nguoi_bao_cao || ""
  }));

  // Xử lý mb51_goods_issue: deduplicate theo row_hash hoặc (mat_doc, doc_item, mat_doc_year)
  const seenMb51 = new Set();
  const mb51Rows = [];
  const mb51PhaRows = [];
  const disposalRows = [];

  for (const d of (rawMb51 || [])) {
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
    const value = Math.abs(Number(d.amount_lc !== undefined && d.amount_lc !== null ? d.amount_lc : (d.ext_amount_lc || 0)));
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
      rowKey
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
        rowKey
      });
    }
  }

  return {
    ok: true,
    rows,
    dims,
    opexItems,
    personnelBySiteKy,
    planSites: Array.from(planSiteSet).sort(viSort),
    huyRows,
    mb51Rows,
    mb51PhaRows,
    disposalRows,
    nguong: {
      huyPct: DEFAULT_NGUONG.huyPct,
      foodCostMin: DEFAULT_NGUONG.foodCostMin,
      foodCostMax: DEFAULT_NGUONG.foodCostMax,
      topKhachHang: DEFAULT_NGUONG.topKhachHang
    },
    updatedAt: new Date().toISOString()
  };
}

export async function getKeHoachData(filtersParam) {
  let filters = {};
  if (typeof filtersParam === "string") {
    try { filters = JSON.parse(filtersParam); } catch {}
  } else if (typeof filtersParam === "object" && filtersParam !== null) {
    filters = filtersParam;
  }

  // Sử dụng fetchAllRows để lấy TOÀN BỘ dữ liệu (tránh bị cắt ở 1000 dòng)
  const [plRows, duAnRes, thamSoRes, opexRes, repRows, txRows] = await Promise.all([
    fetchAllRows("kehoach_pl_thang", "*", "ky"),
    supabase.from("kehoach_duan").select("*"),
    supabase.from("kehoach_thamso").select("*"),
    supabase.from("opex_input").select("*"),
    fetchAllRows("report", "ten_site, ngay_bao_cao, tong_suat, suat_huy"),
    fetchAllRows("transactions", "ten_cua_hang, billing_date, thanh_tien_truoc_thue, ck_truoc_thue, gia_von")
  ]);

  const duAnRows = duAnRes.data || [];
  const thamSoRows = thamSoRes.data || [];
  const opexRows = opexRes.data || [];

  const duAn = {};
  duAnRows.forEach(d => {
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
      hoanVonThang: Number(d.hoan_von_thang || 0)
    };
  });

  const thamSo = {};
  thamSoRows.forEach(t => {
    if (!thamSo[t.site]) thamSo[t.site] = [];
    thamSo[t.site].push({
      thamSo: t.tham_so || "",
      giaTri: isNaN(Number(t.gia_tri)) ? t.gia_tri : Number(t.gia_tri),
      ghiChu: t.ghi_chu || ""
    });
  });

  const plPivot = {};
  const periodMap = new Map();
  plRows.forEach(p => {
    const ky = String(p.ky || "");
    if (!ky) return;
    const label = `Tháng ${ky.substring(5, 7)}/${ky.substring(0, 4)}`;
    periodMap.set(ky, label);
    const k = `${p.site}|${ky}`;
    if (!plPivot[k]) plPivot[k] = {};
    plPivot[k][p.hang_muc] = Number(p.gia_tri || 0);
  });

  // Thu thập thêm các kỳ phát sinh thực tế từ transactions và report
  [...txRows, ...repRows].forEach(r => {
    const d = r.billing_date || r.ngay_bao_cao;
    if (!d) return;
    const ky = String(d).substring(0, 7);
    if (ky && !periodMap.has(ky)) {
      periodMap.set(ky, `Tháng ${ky.substring(5, 7)}/${ky.substring(0, 4)}`);
    }
  });

  const SITE_TONG = "Toàn hệ thống A.Kitchen (Tổng hợp toàn bộ site)";
  const siteSet = new Set();
  plRows.forEach(p => { if (p.site) siteSet.add(p.site); });
  duAnRows.forEach(d => { if (d.site) siteSet.add(d.site); });
  repRows.forEach(r => { if (r.ten_site) siteSet.add(r.ten_site); });
  txRows.forEach(t => { if (t.ten_cua_hang) siteSet.add(t.ten_cua_hang); });
  siteSet.add(SITE_TONG);
  const viSort = (a, b) => a.localeCompare(b, "vi");
  const sites = Array.from(siteSet).sort(viSort);

  // Tính Actuals gom theo site và ky (YYYY-MM)
  const txActual = {};
  txRows.forEach(t => {
    const ym = String(t.billing_date || "").substring(0, 7);
    const site = t.ten_cua_hang;
    if (!ym || !site) return;
    const k = `${site}|${ym}`;
    if (!txActual[k]) txActual[k] = { net: 0, foodCost: 0 };
    const net = Number(t.thanh_tien_truoc_thue || 0) - Number(t.ck_truoc_thue || 0);
    txActual[k].net += net;
    txActual[k].foodCost += Number(t.gia_von || 0);
  });

  const repActual = {};
  repRows.forEach(r => {
    const ym = String(r.ngay_bao_cao || "").substring(0, 7);
    const site = r.ten_site;
    if (!ym || !site) return;
    const k = `${site}|${ym}`;
    if (!repActual[k]) repActual[k] = { tong: 0, huy: 0 };
    repActual[k].tong += Number(r.tong_suat || 0);
    repActual[k].huy += Number(r.suat_huy || 0);
  });

  const opexActual = {};
  opexRows.forEach(o => {
    const ym = o.ky || o.period;
    const k = `${o.site}|${ym}`;
    opexActual[k] = (opexActual[k] || 0) + Number(o.so_tien || o.amount || 0);
  });

  // Sắp xếp các kỳ theo thứ tự thời gian tăng dần và lấy từ kỳ đầu tiên phát sinh (không cắt đuôi)
  const sortedPeriodKeys = Array.from(periodMap.keys()).sort();
  const limitN = filters.nPeriods && filters.nPeriods > 0 ? filters.nPeriods : 24;
  const activePeriods = sortedPeriodKeys.slice(0, limitN);

  const periods = activePeriods.map(perKey => {
    const label = periodMap.get(perKey) || perKey;
    const bySite = {};
    sites.forEach(site => {
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
        DoanhThu: { actual: actNet, plan: plan["DoanhThu"] || 0 },
        SanLuongTong: { actual: actRep.tong, plan: plan["SanLuongTong"] || 0 },
        FoodCost: { actualVal: actFC, planVal: plan["FoodCost"] || 0 },
        LaiGop: { actual: actLaiGop, plan: plan["LaiGop"] || 0 },
        HuyPct: { actualHuy: actRep.huy, actualTong: actRep.tong },
        VatTuTieuHao: { actual: 0, plan: plan["ChiPhiVanHanh"] || 0 },
        EBITDA: { actual: actEbitda, plan: plan["EBITDA"] || 0, hasActual: actNet > 0 || hasOpex }
      };
    });

    const kTong = `${SITE_TONG}|${perKey}`;
    const planTong = plPivot[kTong] || {};
    let sumActNet = 0, sumActFC = 0, sumActTong = 0, sumActHuy = 0, sumActLaiGop = 0, sumActEbitda = 0;
    let sumPlanDT = 0, sumPlanSL = 0, sumPlanFC = 0, sumPlanLG = 0, sumPlanVT = 0, sumPlanEB = 0;

    sites.forEach(s => {
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
      DoanhThu: { actual: sumActNet, plan: planTong["DoanhThu"] !== undefined ? planTong["DoanhThu"] : sumPlanDT },
      SanLuongTong: { actual: sumActTong, plan: planTong["SanLuongTong"] !== undefined ? planTong["SanLuongTong"] : sumPlanSL },
      FoodCost: { actualVal: sumActFC, planVal: planTong["FoodCost"] !== undefined ? planTong["FoodCost"] : sumPlanFC },
      LaiGop: { actual: sumActLaiGop, plan: planTong["LaiGop"] !== undefined ? planTong["LaiGop"] : sumPlanLG },
      HuyPct: { actualHuy: sumActHuy, actualTong: sumActTong },
      VatTuTieuHao: { actual: 0, plan: planTong["ChiPhiVanHanh"] !== undefined ? planTong["ChiPhiVanHanh"] : sumPlanVT },
      EBITDA: { actual: sumActEbitda, plan: planTong["EBITDA"] !== undefined ? planTong["EBITDA"] : sumPlanEB, hasActual: sumActNet > 0 }
    };

    return { key: perKey, label, bySite };
  });

  return {
    ok: true,
    sites,
    periods,
    duAn,
    thamSo,
    siteTong: SITE_TONG,
    nguong: { huyPct: DEFAULT_NGUONG.huyPct },
    updatedAt: new Date().toISOString()
  };
}

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

export function classifyMovType(mvt) {
  const clean = String(mvt || "").trim().toUpperCase();
  if (MVT_SCRAP_TYPES.has(clean)) return "scrap";
  if (MVT_SCRAP_REVERSAL_TYPES.has(clean)) return "scrap_reversal";
  if (MVT_TRANSFER_TYPES.has(clean)) return "transfer";
  if (MVT_RECEIPT_TYPES.has(clean)) return "receipt";
  if (MVT_ISSUE_TYPES.has(clean)) return "issue";
  return "other";
}

export function mapMb51RowToLegacyStockTx(r) {
  const cleanMvt = String(r.mov_type || "").trim().toUpperCase();
  const labelDesc = r.mov_text_vi || r.mov_text_sap || cleanMvt;
  const mvtLabel = cleanMvt ? `${cleanMvt} - ${labelDesc}` : labelDesc;
  let qty = Number(r.quantity || 0);
  let amount = Number(r.amount_lc !== undefined && r.amount_lc !== null ? r.amount_lc : 0);

  // In SAP MB51: Movement 351 (Transfer issue to in-transit / Xuất chuyển kho) is an issue from the sending plant,
  // but was recorded with positive sign in the DB dump. Normalize 351 to negative (issue / giảm tồn kho gửi).
  // Movement 352 (Reversal of 351 / Hủy xuất chuyển kho) normalize to positive (tăng tồn kho gửi).
  if (cleanMvt === "351" && qty > 0) {
    qty = -qty;
    amount = -Math.abs(amount);
  } else if (cleanMvt === "352" && qty < 0) {
    qty = Math.abs(qty);
    amount = Math.abs(amount);
  }

  const price = (qty !== 0 && amount !== 0) ? Math.round(Math.abs(amount) / Math.abs(qty)) : 0;
  const value = amount !== 0 ? amount : Math.round(qty * price);

  const matDesc = String(r.material_desc || "").trim();
  const matCode = String(r.material || "").trim();
  const matName = matDesc || matCode || "";

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
    article: matCode,
    material: matCode,
    name: matName,
    material_desc: matDesc || matCode,
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

export async function getWarehouseDashboardData(filtersParam) {
  let filters = {};
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

  // Mặc định: 1 tháng tính từ D_max (D_max - 1 tháng)
  function calcMinusOneMonth(dStr) {
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

  function getDayBefore(dStr) {
    if (!dStr) return "";
    const d = new Date(dStr + "T00:00:00");
    d.setDate(d.getDate() - 1);
    return d.toISOString().slice(0, 10);
  }

  const defaultTo = dMax;
  const defaultFrom = calcMinusOneMonth(dMax);

  let reqFrom = filters.from || "";
  let reqTo = filters.to || "";

  // Nếu người dùng không chỉ định khoảng ngày hoặc không yêu cầu all:
  if (!reqFrom && !filters.all) {
    reqFrom = defaultFrom;
    reqTo = defaultTo;
  }

  const selectCols = "mat_doc,mat_doc_year,doc_item,posting_date,entry_date,site,site_name,stor_loc,material,material_desc,nganh_hang,nhom_hang,mov_type,mov_text_sap,mov_text_vi,transaction_type,quantity,entry_unit,amount_lc,order_no,doc_header_text";

  const fetchPromises = [
    fetchAllRows("mb51_material_docs", selectCols, "posting_date", reqFrom || null, reqTo || null, "posting_date")
  ];
  if (reqFrom && reqFrom > "2026-09-01") {
    const priorTo = getDayBefore(reqFrom);
    fetchPromises.push(
      fetchAllRows("mb51_material_docs", "material,material_desc,quantity,amount_lc,site,site_name,entry_unit,nhom_hang,mov_type,stor_loc,posting_date", "posting_date", null, priorTo, "posting_date")
    );
  }

  const [periodRows, priorRows = []] = await Promise.all(fetchPromises);

  const stockBeginMap = {};
  const stockBeginValueMap = {};
  const priceMap = {};
  const matDescMap = {};
  const matUomMap = {};
  const matCatMap = {};

  const registerMatMeta = (mat, desc, uom, cat) => {
    const k = String(mat || "").trim();
    if (!k) return;
    const d = String(desc || "").trim();
    if (d && (!matDescMap[k] || matDescMap[k] === k)) {
      matDescMap[k] = d;
    }
    if (uom && !matUomMap[k]) matUomMap[k] = uom;
    if (cat && !matCatMap[k]) matCatMap[k] = cat;
  };

  // 1. Xử lý tồn đầu kỳ từ priorRows (các chứng từ trước fromDate)
  priorRows.forEach(r => {
    registerMatMeta(r.material, r.material_desc, r.entry_unit, r.nhom_hang);
    if (r.posting_date && r.posting_date >= reqFrom) return;
    const artKey = String(r.material || "").trim();
    const cleanMvt = String(r.mov_type || "").trim().toUpperCase();

    let q = Number(r.quantity || 0);
    let amt = Number(r.amount_lc || 0);

    // Cập nhật đơn giá tham chiếu từ các dòng có giá trị thực
    const qtyAbs = Math.abs(q);
    const amtAbs = Math.abs(amt);
    if (qtyAbs > 0 && amtAbs > 0) {
      priceMap[artKey] = Math.round(amtAbs / qtyAbs);
    }

    // LOẠI TRỪ khỏi tồn kho đầu kỳ:
    // - Lệnh sản xuất (261, 262)
    // - Điều chuyển nội bộ (351, 352, 301, 309...) để không gây âm ảo/double-subtract
    if (isProductionOrderIssue(cleanMvt) || isTransferMovement(cleanMvt)) return;

    const key = (r.site || "") + "|" + artKey;
    stockBeginMap[key] = (stockBeginMap[key] || 0) + q;
    stockBeginValueMap[key] = (stockBeginValueMap[key] || 0) + amt;
  });

  const slocSet = new Set(), catSet = new Set(), siteNameSet = new Set();
  const typeSet = new Set(["Thành phẩm", "Bán thành phẩm - NVL", "Khác / Chưa phân loại"]);
  const itemsMap = {};
  const transactions = [];

  periodRows.forEach(r => {
    registerMatMeta(r.material, r.material_desc, r.entry_unit, r.nhom_hang || r.nganh_hang);
    const t = mapMb51RowToLegacyStockTx(r);
    transactions.push(t);
  });

  // Áp dụng đơn giá tham chiếu từ dòng xuất cho các dòng nhập có amount_lc = 0
  enrichTransactionsWithEffectiveReceiptPrices(transactions, priorRows);

  transactions.forEach(t => {
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
        name: matDescMap[artKey] || t.name || artKey,
        category: t.category,
        uom: t.uom,
        stock_begin: stockBeginMap[itemKey] || 0,
        stock_begin_val: stockBeginValueMap[itemKey] || 0,
        receipts: 0,
        issues: 0,
        issues_abs: 0,
        receipts_val: 0,
        issues_val: 0,
        site_name: t.site_name,
        site: t.site
      };
    } else if (matDescMap[artKey] && itemsMap[itemKey].name === artKey) {
      itemsMap[itemKey].name = matDescMap[artKey];
    }

    // LOẠI TRỪ KHỎI GT/SL XUẤT VÀ NHẬP:
    // 1. isProductionOrderIssue: mov_type 261, 262
    // 2. isTransferMovement: mov_type 351, 352, 301, 309, 311...
    // (tránh làm GT xuất tăng một phía gây âm ảo)
    const isProdOrder = isProductionOrderIssue(t.mov_type || t.mvt);
    const isTransfer = isTransferMovement(t.mov_type || t.mvt);

    if (!isProdOrder && !isTransfer) {
      if (t.qty >= 0) {
        itemsMap[itemKey].receipts += t.qty;
        itemsMap[itemKey].receipts_val += Math.abs(t.value || 0);
      } else {
        itemsMap[itemKey].issues += t.qty;
        itemsMap[itemKey].issues_abs += Math.abs(t.qty);
        itemsMap[itemKey].issues_val += Math.abs(t.value || 0);
      }
    }
  });

  // Bổ sung các mã có tồn đầu nhưng không phát sinh trong kỳ
  Object.keys(stockBeginMap).forEach(key => {
    if (!itemsMap[key] && stockBeginMap[key] !== 0) {
      const parts = key.split("|");
      const site = parts[0];
      const code = parts[1];
      itemsMap[key] = {
        code,
        name: matDescMap[code] || code,
        category: matCatMap[code] || "Chưa phân loại",
        uom: matUomMap[code] || "Kg",
        stock_begin: stockBeginMap[key],
        stock_begin_val: stockBeginValueMap[key] || 0,
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

  const missingNames = Object.keys(itemsMap).filter(k => itemsMap[k].name === itemsMap[k].code).map(k => itemsMap[k].code);
  const uniqueMissing = [...new Set(missingNames)];
  if (uniqueMissing.length > 0) {
    try {
      const { data: descData } = await supabase
        .from("mb51_material_docs")
        .select("material,material_desc,nhom_hang,entry_unit")
        .in("material", uniqueMissing.slice(0, 500))
        .not("material_desc", "is", null);
      if (descData && descData.length) {
        descData.forEach(d => {
          const c = String(d.material || "").trim();
          const nm = String(d.material_desc || "").trim();
          if (c && nm) {
            matDescMap[c] = nm;
            if (d.nhom_hang) matCatMap[c] = d.nhom_hang;
            if (d.entry_unit) matUomMap[c] = d.entry_unit;
          }
        });
        Object.keys(itemsMap).forEach(k => {
          const it = itemsMap[k];
          if (matDescMap[it.code]) {
            it.name = matDescMap[it.code];
            if (matCatMap[it.code] && it.category === "Chưa phân loại") it.category = matCatMap[it.code];
            if (matUomMap[it.code] && it.uom === "Kg") it.uom = matUomMap[it.code];
          }
        });
      }
    } catch (e) {
      console.warn("lookup missing material names error:", e);
    }
  }

  let minDate = "", maxDate = "";
  transactions.forEach(t => {
    if (!minDate || (t.date && t.date < minDate)) minDate = t.date;
    if (!maxDate || (t.date && t.date > maxDate)) maxDate = t.date;
  });

  const d1 = minDate ? new Date(minDate) : new Date();
  const d2 = maxDate ? new Date(maxDate) : new Date();
  const daysInPeriod = Math.max(1, Math.round((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24)) + 1);

  // CÔNG THỨC BẮT BUỘC (UNIFIED PIPELINE):
  // GT_cuoi = GT_dau + GT_nhap - GT_xuat
  // SL_cuoi = SL_dau + SL_nhap - SL_xuat
  const items = Object.values(itemsMap).map(it => {
    const price = priceMap[it.code] || (it.receipts_abs > 0 ? Math.round(it.receipts_val / it.receipts_abs) : 0);
    const stockBegin = it.stock_begin;
    const stockBeginValue = (it.stock_begin_val !== undefined && it.stock_begin_val !== 0)
      ? it.stock_begin_val
      : Math.round(stockBegin * price);
    const receiptsValue = it.receipts_val;
    const issuesValue = it.issues_val;
    const stockEnd = stockBegin + it.receipts - it.issues_abs;
    // BẢO TOÀN GIÁ TRỊ: GT_cuoi = GT_dau + GT_nhap - GT_xuat
    const stockEndValue = stockBeginValue + receiptsValue - issuesValue;
    const consumptionPerDay = it.issues_abs > 0 ? it.issues_abs / daysInPeriod : 0;
    let daysOfStock = null;
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
      stock_begin: stockBegin,
      stock_begin_value: stockBeginValue,
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

  const viSort = (a, b) => a.localeCompare(b, "vi");
  const slocMeta = {};
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
    items,
    transactions: transactions.map(t => ({
      article: t.article,
      name: t.name,
      category: t.category,
      type: t.type,
      sloc: t.sloc,
      date: t.date,
      mvt: t.mvt,
      mvt_label: t.mvt_label,
      qty: t.qty,
      value: t.value,
      price: t.price,
      site: t.site,
      site_name: t.site_name,
      uom: t.uom,
      is_estimated_price: t.is_estimated_price
    })),
    sloc_meta: slocMeta
  };
}

export async function getWarehouseSummary(filtersParam) {
  const full = await getWarehouseDashboardData(filtersParam);
  // Summarize transactions to date/sloc/mvt/site
  const aggTx = new Map();
  (full.transactions || []).forEach(t => {
    const k = `${t.date}|${t.sloc}|${t.mvt}|${t.site}`;
    let item = aggTx.get(k);
    if (!item) {
      item = {
        date: t.date,
        sloc: t.sloc,
        mvt: t.mvt,
        mvt_label: t.mvt_label,
        site: t.site,
        site_name: t.site_name,
        category: t.category,
        type: t.type,
        qty: 0,
        value: 0,
        count: 0
      };
      aggTx.set(k, item);
    }
    item.qty += (t.qty || 0);
    item.value += (t.value || 0);
    item.count++;
  });

  return {
    ...full,
    isSummary: true,
    totalTransactions: full.transactions ? full.transactions.length : 0,
    transactions: Array.from(aggTx.values())
  };
}

export async function getWarehouseDetail(filtersParam) {
  let filters = {};
  if (typeof filtersParam === "string") {
    try { filters = JSON.parse(filtersParam); } catch {}
  } else if (typeof filtersParam === "object" && filtersParam !== null) {
    filters = filtersParam;
  }

  const matCode = filters.material || filters.article || filters.code || "";
  let q = supabase.from("mb51_material_docs").select("*");
  if (matCode) q = q.eq("material", matCode);
  if (filters.from) q = q.gte("posting_date", filters.from);
  if (filters.to) q = q.lte("posting_date", filters.to);
  if (filters.site) q = q.eq("site", filters.site);

  const { data, error } = await q.order("posting_date", { ascending: true }).limit(2000);
  if (error) throw error;
  const docs = (data || []).map(mapMb51RowToLegacyStockTx);
  return { success: true, material: matCode, transactions: docs };
}

export async function getNutritionDashboardData() {
  const [nutriRes, menuRes] = await Promise.all([
    supabase.from("dinhduong_100g").select("*").order("ten_mon", { ascending: true }),
    supabase.from("menu_dinhduong").select("*").order("id", { ascending: true })
  ]);

  const rawNutri = nutriRes.data || [];
  const rawMenu = menuRes.data || [];
  const catMap = {};
  const nutriDb = rawNutri.map(n => {
    const name = n.ten_mon || n.name;
    const category = n.loai_mon || n.category || "Món mặn";
    catMap[name] = category;
    return {
      name, category,
      kcal: Number(n.kcal_100g !== undefined ? n.kcal_100g : (n.kcal || 0)),
      protein: Number(n.protein_100g !== undefined ? n.protein_100g : (n.protein || 0)),
      fat: Number(n.fat_100g !== undefined ? n.fat_100g : (n.fat || 0)),
      carb: Number(n.carb_100g !== undefined ? n.carb_100g : (n.carb || 0)),
      fiber: Number(n.chat_xo_100g !== undefined ? n.chat_xo_100g : (n.fiber || 0))
    };
  });

  const mealMap = new Map();
  rawMenu.forEach(m => {
    const dayLabel = m.thu || m.day_label || "Thứ Hai";
    const ca = m.ca || "Trưa";
    const dishLabel = m.ten_san_pham || m.dish_label || "Suất ăn";
    const key = `${dayLabel}|${ca}|${dishLabel}`;
    if (!mealMap.has(key)) {
      mealMap.set(key, { dayLabel, ca, dishLabel, components: [] });
    }
    const meal = mealMap.get(key);
    const name = m.thanh_phan || m.name || "";
    if (name) {
      meal.components.push({
        name,
        category: catMap[name] || "Món mặn",
        qty: Number(m.khoi_luong_g !== undefined ? m.khoi_luong_g : (m.qty || 100))
      });
    }
  });

  return {
    success: true,
    weekPlan: Array.from(mealMap.values()),
    nutriDb
  };
}

export const EST_SELECT_COLS = "id,ma_cua_hang,ten_cua_hang,ten_kh,billing_date,so_luong,dvt,thanh_tien_truoc_thue,ck_truoc_thue,gia_von,nhom_sp,nganh_hang,kenh_ban_hang,ten_kenh_ban_hang,vung_mien,loai_cua_hang,so_hoa_don,loai_chung_tu_billing,ly_do_tra_hang,reference,ghi_chu,ky_uoc_tinh";

export async function getRevenueEstSummary(filtersParam) {
  let filters = {};
  if (typeof filtersParam === "string") {
    try { filters = JSON.parse(filtersParam); } catch {}
  } else if (typeof filtersParam === "object" && filtersParam !== null) {
    filters = filtersParam;
  }

  const granular = filters.granular || filters.gran || "week";
  const recentBuckets = Number(filters.recentBuckets) || 4;

  let maxDateStr = global._cachedMaxEstBillingDate || "";
  if (!maxDateStr || Date.now() - (global._cachedMaxEstBillingDateAt || 0) > 60000) {
    const { data: latestRow } = await supabase
      .from("transactions_est")
      .select("billing_date")
      .order("billing_date", { ascending: false })
      .limit(1)
      .maybeSingle();
    maxDateStr = latestRow?.billing_date || "2026-11-07";
    global._cachedMaxEstBillingDate = maxDateStr;
    global._cachedMaxEstBillingDateAt = Date.now();
  }

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
      // month
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

  const [rawTx, plRows, keHoach] = await Promise.all([
    fetchAllRows("transactions_est", EST_SELECT_COLS, "billing_date", reqFrom || null, reqTo || null, "billing_date"),
    fetchAllRows("kehoach_pl_thang", "*", "ky"),
    getKeHoachData(filtersParam)
  ]);

  // Aggregate raw transaction lines by (date, site, group, channel, dvt)
  // to shrink response payload while preserving exact totals and UI contract
  const aggMap = new Map();
  (rawTx || []).forEach(r => {
    const soLuong = Number(r.so_luong || 0);
    const thanhTienTruocThue = Number(r.thanh_tien_truoc_thue || 0);
    const chietKhau = Number(r.ck_truoc_thue || 0);
    const netRevenue = thanhTienTruocThue - chietKhau;
    const foodCost = Number(r.gia_von || 0);
    const vungMien = (r.vung_mien !== null && r.vung_mien !== undefined) ? String(r.vung_mien).trim() : "";
    const loaiCuaHang = (r.loai_cua_hang !== null && r.loai_cua_hang !== undefined) ? String(r.loai_cua_hang).trim() : "";
    const tenKenhBanHang = (r.ten_kenh_ban_hang !== null && r.ten_kenh_ban_hang !== undefined && String(r.ten_kenh_ban_hang).trim())
      ? String(r.ten_kenh_ban_hang).trim()
      : (r.kenh_ban_hang ? String(r.kenh_ban_hang).trim() : "");
    const ngay = formatDate(r.billing_date);
    const ky = (ngay ? ngay.substring(0, 7) : "") || r.ky_uoc_tinh || "";
    const site = r.ten_cua_hang || "";
    const maSite = r.ma_cua_hang || "";
    const nhomSP = r.nhom_sp || "";
    const dvt = r.dvt || "";

    const key = `${ngay}|${site}|${nhomSP}|${tenKenhBanHang}|${dvt}`;
    let item = aggMap.get(key);
    if (!item) {
      item = {
        id: r.id,
        maSite,
        ma_cua_hang: maSite,
        site,
        ten_cua_hang: site,
        tenKH: r.ten_kh || "",
        ten_kh: r.ten_kh || "",
        ngay,
        billing_date: ngay,
        ky,
        soLuong: 0,
        so_luong: 0,
        dvt,
        netRevenue: 0,
        thanhTien: 0,
        thanh_tien: 0,
        foodCost: 0,
        giaVon: 0,
        gia_von: 0,
        nhomSP,
        nhom_sp: nhomSP,
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
      aggMap.set(key, item);
    }
    item.soLuong += soLuong;
    item.so_luong += soLuong;
    item.netRevenue += netRevenue;
    item.thanhTien += netRevenue;
    item.thanh_tien += netRevenue;
    item.foodCost += foodCost;
    item.giaVon += foodCost;
    item.gia_von += foodCost;
  });

  const rows = Array.from(aggMap.values());

  const planBySiteKy = [];
  const personnelBySiteKy = [];
  (plRows || []).forEach(p => {
    const s = String(p.site || "").trim();
    const k = String(p.ky || "").trim();
    const amount = Number(p.gia_tri || 0);
    if (!s || !k) return;
    if (p.hang_muc === "DoanhThu") {
      planBySiteKy.push({ site: s, ky: k, amount, period: k });
    }
    if (p.hang_muc === "ChiPhiNhanSu") {
      personnelBySiteKy.push({ site: s, ky: k, amount, period: k });
    }
  });

  const siteSet = new Set(), kySet = new Set(), vungSet = new Set(), loaiSet = new Set(), kenhSet = new Set(), nhomSet = new Set(), dateSet = new Set();
  rows.forEach(r => {
    if (r.site) siteSet.add(r.site);
    if (r.ky) kySet.add(r.ky);
    if (r.ngay) dateSet.add(r.ngay);
    if (r.vungMien) vungSet.add(r.vungMien);
    if (r.loaiCuaHang) loaiSet.add(r.loaiCuaHang);
    if (r.tenKenhBanHang) kenhSet.add(r.tenKenhBanHang);
    if (r.nhomSP) nhomSet.add(r.nhomSP);
  });
  const viSort = (a, b) => a.localeCompare(b, "vi");
  const sortedPeriods = Array.from(kySet).sort().reverse();
  const sortedDates = Array.from(dateSet).sort();

  if (!global._cachedAllEstBillingDates || Date.now() - (global._cachedAllEstBillingDatesAt || 0) > 300000) {
    try {
      const allDatesRows = await fetchAllRows("transactions_est", "billing_date", "billing_date");
      const dSet = new Set();
      (allDatesRows || []).forEach(r => { if (r.billing_date) dSet.add(r.billing_date.slice(0, 10)); });
      global._cachedAllEstBillingDates = Array.from(dSet).sort();
      global._cachedAllEstBillingDatesAt = Date.now();
    } catch (e) {
      console.warn("fetch all est billing dates error:", e);
    }
  }
  const allAvailableEstDates = (global._cachedAllEstBillingDates && global._cachedAllEstBillingDates.length)
    ? global._cachedAllEstBillingDates
    : sortedDates;

  return {
    ok: true,
    isSummary: true,
    rows,
    planBySiteKy,
    personnelBySiteKy,
    keHoach,
    dims: {
      sites: Array.from(siteSet).sort(viSort),
      periods: Array.from(new Set(allAvailableEstDates.map(d => d.slice(0, 7)))).sort().reverse(),
      dates: sortedDates,
      allDates: allAvailableEstDates,
      vungMien: Array.from(vungSet).sort(viSort),
      loaiCuaHang: Array.from(loaiSet).sort(viSort),
      kenh: Array.from(kenhSet).sort(viSort),
      nhomSP: Array.from(nhomSet).sort(viSort)
    },
    loadedGranular: granular,
    loadedFrom: reqFrom,
    loadedTo: reqTo,
    updatedAt: new Date().toISOString()
  };
}

export async function getRevenueEstData(filtersParam) {
  let filters = {};
  if (typeof filtersParam === "string") {
    try { filters = JSON.parse(filtersParam); } catch {}
  } else if (typeof filtersParam === "object" && filtersParam !== null) {
    filters = filtersParam;
  }

  const [rawTx, plRows, keHoach] = await Promise.all([
    fetchAllRows("transactions_est", EST_SELECT_COLS, "billing_date", filters.from || null, filters.to || null, "billing_date"),
    fetchAllRows("kehoach_pl_thang", "*", "ky"),
    getKeHoachData(filtersParam)
  ]);

  const rows = (rawTx || []).map(r => {
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

  const siteSet = new Set();
  const dateSet = new Set();
  const vungSet = new Set();
  const loaiSet = new Set();
  const kySet = new Set();
  const kenhSet = new Set();
  const nhomSet = new Set();

  rows.forEach(r => {
    if (r.site) siteSet.add(r.site);
    if (r.ngay) dateSet.add(r.ngay);
    if (r.vungMien) vungSet.add(r.vungMien);
    if (r.loaiCuaHang) loaiSet.add(r.loaiCuaHang);
    if (r.ky) kySet.add(r.ky);
    if (r.tenKenhBanHang) kenhSet.add(r.tenKenhBanHang);
    if (r.nhomSP) nhomSet.add(r.nhomSP);
  });

  const viSort = (a, b) => a.localeCompare(b, "vi");

  const planMap = {};
  const personnelBySiteKy = [];
  (plRows || []).forEach(p => {
    const s = String(p.site || "").trim();
    const k = String(p.ky || "").trim();
    if (!s || !k) return;
    kySet.add(k);
    const key = `${s}|${k}`;
    if (!planMap[key]) {
      planMap[key] = { site: s, ky: k, doanhThu: 0, foodCost: 0, laiGop: 0, chiPhiNhanSu: 0, sanLuong: 0 };
    }
    const val = Number(p.gia_tri || 0);
    if (p.hang_muc === "DoanhThu") planMap[key].doanhThu = val;
    else if (p.hang_muc === "FoodCost") planMap[key].foodCost = val;
    else if (p.hang_muc === "LaiGop") planMap[key].laiGop = val;
    else if (p.hang_muc === "SanLuongTong" || p.hang_muc === "SanLuong") planMap[key].sanLuong = val;
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
    nhomSP: Array.from(nhomSet).sort(viSort)
  };

  return {
    ok: true,
    updatedAt: new Date().toISOString(),
    dims,
    rows,
    planBySiteKy,
    personnelBySiteKy,
    keHoach,
    nguong: {
      foodCostMax: 62,
      foodCostMin: DEFAULT_NGUONG.foodCostMin || 30,
      am2Min: 12,
      planPctMin: 95,
      huyPct: DEFAULT_NGUONG.huyPct || 1.5
    }
  };
}

/**
 * Lấy dữ liệu chi tiết hủy hàng từ public.mb51_material_docs
 * Chỉ lấy dòng xuất tiêu hủy (mov_type = '551')
 * Loại trừ các dòng đã bị hủy bởi mov_type = '552' (cùng mat_doc + mat_doc_year + doc_item)
 * Không tính/không cộng 552 vào số hủy
 * Phục vụ section Chi tiết hủy hàng trong tab Quản lý kho
 */
export async function getMb51GoodsIssue(filtersParam) {
  let filters = {};
  if (typeof filtersParam === "string") {
    try { filters = JSON.parse(filtersParam); } catch {}
  } else if (typeof filtersParam === "object" && filtersParam !== null) {
    filters = filtersParam;
  }

  const selectCols = "mat_doc,mat_doc_year,doc_item,posting_date,entry_date,entry_time,site,site_name,stor_loc,material,material_desc,nganh_hang,nhom_hang,mov_type,mov_text_sap,mov_text_vi,transaction_type,quantity,entry_unit,amount_lc,order_no,doc_header_text";

  // 1. Truy vấn các dòng 551 và 552 từ mb51_material_docs
  let q = supabase.from("mb51_material_docs").select(selectCols).in("mov_type", ["551", "552"]);

  if (filters.from) q = q.gte("posting_date", filters.from);
  if (filters.to) q = q.lte("posting_date", filters.to);

  if (filters.sites && Array.isArray(filters.sites) && filters.sites.length > 0) {
    const siteValues = filters.sites.map(s => String(s).trim()).filter(Boolean);
    if (siteValues.length > 0) {
      const isAllCodes = siteValues.every(s => /^[A-Z0-9_-]{3,6}$/i.test(s));
      if (isAllCodes) {
        q = q.in("site", siteValues);
      } else {
        const siteOr = siteValues.map(s => `site.eq."${s}",site_name.eq."${s}"`).join(",");
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
    console.error("getMb51MaterialDocsDisposal error:", error);
    return { ok: false, error: error.message, rows: [] };
  }

  const rawRows = data || [];

  // 2. Thu thập các khóa reversal từ 552
  const set552Item = new Set();
  const set552Doc = new Set();
  const set552Heuristic = new Set();

  rawRows.forEach(r => {
    if (String(r.mov_type || "").trim() === "552") {
      set552Item.add(`${r.mat_doc}_${r.mat_doc_year}_${r.doc_item}`);
      set552Doc.add(`${r.mat_doc}_${r.mat_doc_year}`);
      if (r.site && r.material) {
        set552Heuristic.add(`${r.site}_${r.material}_${Math.abs(Number(r.quantity))}_${String(r.doc_header_text || "").trim().toLowerCase()}`);
      }
    }
  });

  // 3. Lọc lấy dòng 551 không bị đảo bởi 552
  let valid551 = rawRows.filter(r => {
    if (String(r.mov_type || "").trim() !== "551") return false;
    const kItem = `${r.mat_doc}_${r.mat_doc_year}_${r.doc_item}`;
    const kDoc = `${r.mat_doc}_${r.mat_doc_year}`;
    const kHeuristic = `${r.site}_${r.material}_${Math.abs(Number(r.quantity))}_${String(r.doc_header_text || "").trim().toLowerCase()}`;
    if (set552Item.has(kItem) || set552Doc.has(kDoc) || set552Heuristic.has(kHeuristic)) {
      return false;
    }
    return true;
  });

  // 4. Áp dụng các bộ lọc riêng nếu có
  if (filters.entry_unit && filters.entry_unit !== "ALL" && filters.entry_unit !== "") {
    const targetUnit = String(filters.entry_unit).trim().toUpperCase();
    valid551 = valid551.filter(r => String(r.entry_unit || "").trim().toUpperCase() === targetUnit);
  }

  if (filters.stor_loc && filters.stor_loc !== "ALL" && filters.stor_loc !== "") {
    const targetSloc = String(filters.stor_loc).trim().toUpperCase();
    valid551 = valid551.filter(r => {
      const s = String(r.stor_loc || "").trim().toUpperCase();
      const sName = getSlocName(s).toUpperCase();
      return s === targetSloc || sName === targetSloc || targetSloc.includes(s);
    });
  }

  if (filters.nhom_hang && filters.nhom_hang !== "ALL" && filters.nhom_hang !== "") {
    const targetNhom = String(filters.nhom_hang).trim().toLowerCase();
    valid551 = valid551.filter(r => String(r.nhom_hang || "").trim().toLowerCase() === targetNhom);
  }

  if (filters.nganh_hang && filters.nganh_hang !== "ALL" && filters.nganh_hang !== "") {
    const targetNganh = String(filters.nganh_hang).trim().toLowerCase();
    valid551 = valid551.filter(r => String(r.nganh_hang || "").trim().toLowerCase() === targetNganh);
  }

  if (filters.q && typeof filters.q === "string" && filters.q.trim()) {
    const kw = filters.q.trim().toLowerCase();
    valid551 = valid551.filter(r => {
      const mat = String(r.material || "").toLowerCase();
      const desc = String(r.material_desc || "").toLowerCase();
      const doc = String(r.mat_doc || "").toLowerCase();
      return mat.includes(kw) || desc.includes(kw) || doc.includes(kw);
    });
  }

  // 5. Chuẩn hóa hiển thị (dương số lượng và tiền, map tên kho)
  const rows = valid551.map(r => {
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

export const getMb51MaterialDocsDisposal = getMb51GoodsIssue;

export async function getDiscardNvlSummary(filtersParam) {
  const cacheKey = "getDiscardNvlSummary:" + (typeof filtersParam === "string" ? filtersParam : JSON.stringify(filtersParam || {}));
  return withCache(cacheKey, 180000, () => _getDiscardNvlSummary(filtersParam));
}

async function _getDiscardNvlSummary(filtersParam) {
  let filters = {};
  if (typeof filtersParam === "string") {
    try { filters = JSON.parse(filtersParam); } catch {}
  } else if (typeof filtersParam === "object" && filtersParam !== null) {
    filters = filtersParam;
  }

  let reqFrom = filters.from || "";
  let reqTo = filters.to || "";
  const isSacn = Boolean(filters.sacn || filters.tab === "sacn");
  const siteFilter = filters.site || filters.sites || null;

  let mbQuery = supabase
    .from("mb51_material_docs")
    .select("posting_date, site, site_name, quantity, amount_lc, mov_type, entry_unit")
    .in("mov_type", ["551", "552"]);

  if (reqFrom) mbQuery = mbQuery.gte("posting_date", reqFrom);
  if (reqTo) mbQuery = mbQuery.lte("posting_date", reqTo);

  const [mbRes, txRows] = await Promise.all([
    mbQuery,
    fetchAllRows("transactions", TX_SELECT_COLS, "billing_date", reqFrom || null, reqTo || null, "billing_date")
  ]);

  if (mbRes.error) {
    console.error("getDiscardNvlSummary error:", mbRes.error);
    throw mbRes.error;
  }

  let mbDocs = mbRes.data || [];
  let txList = txRows || [];

  const SACN_EXCLUDE = new Set(["K502", "K003", "K800", "D007"]);
  if (isSacn) {
    mbDocs = mbDocs.filter(r => {
      if (SACN_EXCLUDE.has(r.site)) return false;
      if (/megafar/i.test(r.site_name || "")) return false;
      return true;
    });
    txList = txList.filter(r => {
      if (SACN_EXCLUDE.has(r.ma_cua_hang)) return false;
      if (/megafar/i.test(r.ten_cua_hang || "")) return false;
      return true;
    });
  }

  if (siteFilter) {
    const sArr = (Array.isArray(siteFilter) ? siteFilter : [siteFilter]).map(s => String(s).trim()).filter(Boolean);
    if (sArr.length > 0) {
      const sSet = new Set(sArr);
      mbDocs = mbDocs.filter(r => sSet.has(r.site) || sSet.has(r.site_name));
      txList = txList.filter(r => sSet.has(r.ma_cua_hang) || sSet.has(r.ten_cua_hang));
    }
  }

  const getNet = r => Number(r.thanh_tien !== undefined && r.thanh_tien !== null ? r.thanh_tien : (Number(r.thanh_tien_truoc_thue || 0) - Number(r.ck_truoc_thue || 0)));
  let totalNetRev = 0;
  const siteNetRevMap = {};

  txList.forEach(r => {
    const net = getNet(r);
    totalNetRev += net;
    const nameKey = r.ten_cua_hang || r.ma_cua_hang || "Khác";
    const codeKey = r.ma_cua_hang || "";
    siteNetRevMap[nameKey] = (siteNetRevMap[nameKey] || 0) + net;
    if (codeKey && codeKey !== nameKey) {
      siteNetRevMap[codeKey] = (siteNetRevMap[codeKey] || 0) + net;
    }
  });

  let totalQtyKg = 0;
  let totalValue = 0;
  const siteMap = {};
  const dayMap = {};
  const otherUnitsMap = {};

  mbDocs.forEach(r => {
    const movType = String(r.mov_type || "").trim();
    const sign = movType === "551" ? 1 : -1;
    const qty = Math.abs(Number(r.quantity || 0)) * sign;
    const val = Math.abs(Number(r.amount_lc || 0)) * sign;
    const unit = String(r.entry_unit || "").trim().toUpperCase();

    totalValue += val;

    if (unit === "KG") {
      totalQtyKg += qty;
    } else if (unit && unit !== "PHA") {
      otherUnitsMap[unit] = (otherUnitsMap[unit] || 0) + qty;
    }

    const siteCode = r.site || "";
    const siteName = r.site_name || siteCode || "Khác";
    const siteKey = siteName;

    if (!siteMap[siteKey]) {
      siteMap[siteKey] = { site: siteCode, siteName, qtyKg: 0, value: 0 };
    }
    if (unit === "KG") siteMap[siteKey].qtyKg += qty;
    siteMap[siteKey].value += val;

    const d = formatDate(r.posting_date);
    if (d) {
      if (!dayMap[d]) dayMap[d] = { date: d, qtyKg: 0, value: 0 };
      if (unit === "KG") dayMap[d].qtyKg += qty;
      dayMap[d].value += val;
    }
  });

  const pctOfNetRev = totalNetRev > 0 ? (totalValue / totalNetRev) * 100 : 0;

  const topUnitsText = Object.keys(otherUnitsMap)
    .filter(u => otherUnitsMap[u] > 0)
    .sort((a, b) => otherUnitsMap[b] - otherUnitsMap[a])
    .slice(0, 3)
    .map(u => `${(Math.round(otherUnitsMap[u] * 10) / 10).toLocaleString("vi-VN")} ${u}`)
    .join(" · ");

  const bySite = Object.values(siteMap).map(s => {
    const netRev = siteNetRevMap[s.siteName] || siteNetRevMap[s.site] || 0;
    const pctOfRev = netRev > 0 ? (s.value / netRev) * 100 : 0;
    return {
      site: s.site,
      siteName: s.siteName,
      qtyKg: Math.round(s.qtyKg * 1000) / 1000,
      value: Math.round(s.value),
      pctOfRev: Math.round(pctOfRev * 100) / 100
    };
  }).sort((a, b) => b.value - a.value);

  const byDay = Object.values(dayMap).map(d => ({
    date: d.date,
    qtyKg: Math.round(d.qtyKg * 1000) / 1000,
    value: Math.round(d.value)
  })).sort((a, b) => a.date.localeCompare(b.date));

  return {
    ok: true,
    kpis: {
      totalQtyKg: Math.round(totalQtyKg * 1000) / 1000,
      totalValue: Math.round(totalValue),
      pctOfNetRev: Math.round(pctOfNetRev * 100) / 100,
      topUnitsText
    },
    bySite,
    byDay
  };
}

