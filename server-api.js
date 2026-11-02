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
  getSlocDisplayName
} from "./shared/sloc-config.js";

export {
  SLOC_GROUPS,
  SLOC_MAP,
  getSlocGroup,
  getSlocName,
  getSlocDisplayName
};

const SUPABASE_URL = process.env.SUPABASE_URL || "https://alqcojnxshfylheovdgw.supabase.co";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFscWNvam54c2hmeWxoZW92ZGd3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc5MDc3ODMwNSwiZXhwIjoyMTA2MzU0MzA1fQ.qO6NFbJWJuUDG1fArn47nvYBXVg4BhFDoho0Md4H1xk";
const API_TOKEN = process.env.API_TOKEN || "TRANTUANDAISIBAFOOD";

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

/**
 * Lấy toàn bộ bản ghi vượt giới hạn mặc định 1000 dòng của Supabase PostgREST
 * Hỗ trợ lọc theo khoảng ngày trực tiếp trên database để tối ưu hiệu năng
 */
async function fetchAllRows(table, select = "*", orderCol = null, fromDate = null, toDate = null, dateCol = null) {
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

  // Parallel pagination for large datasets
  const pages = Math.ceil(count / step);
  const promises = [];
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
  let all = [];
  for (const r of results) {
    if (r.error) throw r.error;
    if (r.data) all.push(...r.data);
  }
  return all;
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
export async function getDataVersion() {
  const now = new Date().toISOString();
  const { data } = await supabase.from("data_version").select("version, updated_at").order("updated_at", { ascending: false }).limit(1).maybeSingle();
  return { version: String(data?.version || "1.0.0"), updatedAt: data?.updated_at || now, serverTime: now };
}

export async function getDashboardData() {
  const [versionRes, rawRows] = await Promise.all([
    supabase.from("data_version").select("version, updated_at").order("updated_at", { ascending: false }).limit(1).maybeSingle(),
    fetchAllRows("report", "*", "ngay_bao_cao")
  ]);

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

  const [rawTx, opexRes, reportRes, rawMb51, plRows] = await Promise.all([
    fetchAllRows("transactions", "*", "billing_date", reqFrom || null, reqTo || null, "billing_date"),
    supabase.from("opex_input").select("*"),
    supabase.from("report").select("ten_site, ngay_bao_cao, suat_huy, tong_suat, nguoi_bao_cao").order("ngay_bao_cao", { ascending: true }),
    fetchMb51GoodsIssue(reqFrom || null, reqTo || null, filters.site || filters.sites || null),
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

  const dims = {
    sites: Array.from(siteSet).sort(viSort),
    kenh: Array.from(kenhSet).sort(viSort),
    nhomSP: Array.from(nhomSet).sort(viSort),
    nvkd: Array.from(nvkdSet).sort(viSort),
    khachHang: Array.from(khSet).sort(viSort),
    dates: Array.from(dateSet).sort(),
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
      fetchAllRows("mb51_material_docs", "material,quantity,amount_lc,site,site_name", null, null, priorTo, "posting_date")
    );
  }

  const [periodRows, priorRows = []] = await Promise.all(fetchPromises);

  const stockBeginMap = {};
  const priceMap = {};
  priorRows.forEach(r => {
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

  const slocSet = new Set(), catSet = new Set(), siteNameSet = new Set();
  const typeSet = new Set(["Thành phẩm", "Bán thành phẩm - NVL", "Khác / Chưa phân loại"]);
  const itemsMap = {};
  const transactions = [];

  periodRows.forEach(r => {
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

  // Bổ sung các mã có tồn đầu nhưng không phát sinh trong kỳ
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

  const items = Object.values(itemsMap).map(it => {
    const price = priceMap[it.code] || (it.receipts_abs > 0 ? Math.round(it.receipts_val / it.receipts_abs) : 0);
    const stockEnd = it.stock_begin + it.receipts + it.issues;
    const stockEndValue = Math.round(stockEnd * price);
    const receiptsValue = it.receipts_val > 0 ? it.receipts_val : Math.round(it.receipts * price);
    const issuesValue = it.issues_val > 0 ? it.issues_val : Math.round(it.issues_abs * price);
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
    types: Array.from(typeSet).sort(viSort),
    items,
    transactions,
    sloc_meta: slocMeta
  };
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

export async function getRevenueEstData(filtersParam) {
  let filters = {};
  if (typeof filtersParam === "string") {
    try { filters = JSON.parse(filtersParam); } catch {}
  } else if (typeof filtersParam === "object" && filtersParam !== null) {
    filters = filtersParam;
  }

  const [rawTx, plRows, keHoach] = await Promise.all([
    fetchAllRows("transactions_est", "*", "billing_date"),
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
