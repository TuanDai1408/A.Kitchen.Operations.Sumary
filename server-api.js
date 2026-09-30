// =========================================================================
// A.KITCHEN DASHBOARD - LOCAL & PREVIEW API HANDLER
// Connects directly to Supabase PostgreSQL using @supabase/supabase-js
// =========================================================================

import { createClient } from "@supabase/supabase-js";

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
  let all = [];
  let from = 0;
  const step = 1000;
  while (true) {
    let q = supabase.from(table).select(select).range(from, from + step - 1);
    if (orderCol) q = q.order(orderCol, { ascending: true });
    if (fromDate && dateCol) q = q.gte(dateCol, fromDate);
    if (toDate && dateCol) q = q.lte(dateCol, toDate);
    const { data, error } = await q;
    if (error) throw error;
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < step) break;
    from += step;
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

function mapTransactionRow(r) {
  const soLuong = Number(r.so_luong || 0);
  const thanhTienTruocThue = Number(r.thanh_tien_truoc_thue || 0);
  const chietKhau = Number(r.ck_truoc_thue || r.chiet_khau || 0);
  const thanhTien = Number(r.thanh_tien) !== 0 && !isNaN(Number(r.thanh_tien))
    ? Number(r.thanh_tien)
    : (thanhTienTruocThue - chietKhau);
  const giaVon = Number(r.gia_von || 0);

  return {
    site: r.ten_cua_hang || "",
    maSite: r.ma_cua_hang || "",
    tenKH: r.ten_kh || r.ten_khach_hang || "",
    ngay: formatDate(r.billing_date),
    soLuong,
    dvt: r.dvt || "",
    thanhTien,
    giaVon,
    nhomSP: r.nhom_sp || "",
    nganhHang: r.nganh_hang || "",
    kenhBanHang: r.kenh_ban_hang || "",
    nvKinhDoanh: r.nv_kinh_doanh || "",
    tenSP: r.ten_sp || "",
    soHoaDon: r.so_hoa_don || "",
    soBillingGoc: r.so_billing_goc || "",
    lyDoTraHang: r.ly_do_tra_hang || "",
    isReturn: computeIsReturn(r),
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

  // Mặc định: 2 tháng gần nhất kể từ ngày lớn nhất có dữ liệu
  const maxD = new Date(maxDateStr);
  const twoMonthsAgo = new Date(maxD);
  twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 2);
  const defaultFrom = twoMonthsAgo.toISOString().slice(0, 10);

  let reqFrom = filters.from || "";
  let reqTo = filters.to || "";

  // Nếu người dùng không chỉ định khoảng ngày hoặc không yêu cầu lấy toàn bộ lịch sử (all):
  if (!reqFrom && !filters.all) {
    reqFrom = defaultFrom;
    reqTo = maxDateStr;
  }

  const [rawTx, opexRes, reportRes, disposalRes] = await Promise.all([
    fetchAllRows("transactions", "*", "billing_date", reqFrom || null, reqTo || null, "billing_date"),
    supabase.from("opex_input").select("*"),
    supabase.from("report").select("ten_site, ngay_bao_cao, suat_huy, tong_suat, nguoi_bao_cao").order("ngay_bao_cao", { ascending: true }),
    supabase.from("disposal_of_goods").select("*").order("ngay_lap", { ascending: true })
  ]);

  const rows = rawTx.map(mapTransactionRow);
  const siteSet = new Set(), kenhSet = new Set(), nhomSet = new Set(), nvkdSet = new Set(), khSet = new Set(), dateSet = new Set();
  rows.forEach(r => {
    if (r.site) siteSet.add(r.site);
    if (r.kenhBanHang) kenhSet.add(r.kenhBanHang);
    if (r.nhomSP) nhomSet.add(r.nhomSP);
    if (r.nvKinhDoanh) nvkdSet.add(r.nvKinhDoanh);
    if (r.tenKH) khSet.add(r.tenKH);
    if (r.ngay) dateSet.add(r.ngay);
  });
  const viSort = (a, b) => a.localeCompare(b, "vi");

  const dims = {
    sites: Array.from(siteSet).sort(viSort),
    kenh: Array.from(kenhSet).sort(viSort),
    nhomSP: Array.from(nhomSet).sort(viSort),
    nvkd: Array.from(nvkdSet).sort(viSort),
    khachHang: Array.from(khSet).sort(viSort),
    dates: Array.from(dateSet).sort(),
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

  const huyRows = (reportRes.data || []).map(h => ({
    tenSite: h.ten_site || "",
    ngay: formatDate(h.ngay_bao_cao),
    suatHuy: Number(h.suat_huy || 0),
    tongSuat: Number(h.tong_suat || 0),
    nguoiBaoCao: h.nguoi_bao_cao || ""
  }));

  const disposalRows = (disposalRes.data || []).map(d => {
    const qtyKg = Number(d.qty_kg || 0);
    const donGia = Number(d.don_gia || 0);
    const value = d.value !== undefined && d.value !== null && Number(d.value) > 0 ? Number(d.value) : (qtyKg * donGia);
    return {
      ngay: formatDate(d.ngay_lap),
      tenSite: d.ten_site || "",
      maSite: d.ma_site || "",
      maCode: d.ma_code || "",
      tenSP: d.ten_san_pham || d.ten_sp || "",
      loaiHang: d.loai_hang || "",
      qtyKg, donGia, value,
      lyDo: d.ly_do || ""
    };
  });

  return {
    ok: true,
    rows,
    dims,
    opexItems,
    huyRows,
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

export async function getWarehouseDashboardData() {
  // Lấy TOÀN BỘ 5,758 dòng giá & phân loại để không bị bỏ sót mã nào
  const [headerRes, txRes, rawPrice] = await Promise.all([
    supabase.from("stock_header").select("*"),
    supabase.from("stock_transactions").select("*").order("pstng_date", { ascending: true }),
    fetchAllRows("stock_price_category", "article, price, mdse_catgry_desc, base_uom")
  ]);

  const rawHeaders = headerRes.data || [];
  const rawTx = txRes.data || [];

  const priceMap = {}, catMap = {};
  rawPrice.forEach(p => {
    priceMap[p.article] = Number(p.price || 0);
    if (p.mdse_catgry_desc) catMap[p.article] = p.mdse_catgry_desc;
  });

  // Tạo map chuyển đổi mã site (ví dụ K500) sang tên site người dùng đọc được
  const siteCodeToName = {};
  rawHeaders.forEach(h => {
    if (h.site && h.site_name) siteCodeToName[h.site] = h.site_name;
  });

  const slocDict = {
    "KL01": { name: "Kho nguyên vật liệu & Thực phẩm (KL01)" },
    "KL02": { name: "Kho vật tư tiêu hao & Hóa phẩm (KL02)" },
    "KL03": { name: "Kho công cụ dụng cụ & Thiết bị bếp (KL03)" }
  };

  const slocSet = new Set(), catSet = new Set(), siteNameSet = new Set(), typeSet = new Set();

  const transactions = rawTx.map(t => {
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
      category, type, sloc,
      date: formatDate(t.pstng_date),
      mvt, mvt_label: mvtLabel,
      qty, value,
      site_name: siteName,
      site: t.site || ""
    };
  });

  let minDate = "", maxDate = "";
  transactions.forEach(t => {
    if (!minDate || (t.date && t.date < minDate)) minDate = t.date;
    if (!maxDate || (t.date && t.date > maxDate)) maxDate = t.date;
  });

  const d1 = minDate ? new Date(minDate) : new Date();
  const d2 = maxDate ? new Date(maxDate) : new Date();
  const daysInPeriod = Math.max(1, Math.round((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24)) + 1);

  const items = rawHeaders.map(h => {
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
    let daysOfStock = null;
    if (consumptionPerDay > 0) daysOfStock = Math.round((stockEnd / consumptionPerDay) * 10) / 10;

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
      receipts, issues, issues_abs: issuesAbs,
      stock_end: stockEnd,
      price, stock_end_value: stockEndValue,
      consumption_per_day: consumptionPerDay,
      days_of_stock: daysOfStock,
      status, has_mismatch: hasMismatch,
      reconciliation_diff: diff,
      site_name: siteName,
      site: h.site || ""
    };
  });

  const viSort = (a, b) => a.localeCompare(b, "vi");
  const slocMeta = {};
  slocSet.forEach(s => {
    slocMeta[s] = slocDict[s] || { name: `Kho ${s}` };
  });

  return {
    success: true,
    meta: {
      site: rawHeaders[0]?.site || "K500",
      site_name: rawHeaders[0]?.site_name || "MB A Kitchen Hòa Bình",
      period_from: minDate || formatDate(new Date()),
      period_to: maxDate || formatDate(new Date()),
      days_in_period: daysInPeriod,
      generated_at: new Date().toISOString()
    },
    by_sloc: Array.from(slocSet).sort().map(s => ({ sloc: s, name: slocMeta[s]?.name || `Kho ${s}` })),
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
