// =========================================================================
// A.KITCHEN DASHBOARD - TRANSFORMATION & SCORING LOGIC
// Port chính xác từ Apps Script (Code.gs) & Dashboard frontend
// =========================================================================

import { DEFAULT_NGUONG, TRONG_SO, NguongConfig } from "./nguong.ts";

/** Chuẩn hóa mức độ nghiêm trọng của khiếu nại */
export function normMucDo(s?: string | null): string {
  const t = String(s || "").toLowerCase().trim();
  if (!t) return "Chưa phân loại";
  if (/nghiêm trọng|nghiem trong|critical|khẩn/i.test(t)) return "Nghiêm trọng";
  if (/^cao|cao$|high|nặng|nang/i.test(t)) return "Cao";
  if (/trung bình|trung binh|^tb$|medium|vừa|vua/i.test(t)) return "Trung bình";
  if (/thấp|thap|low|nhẹ|nhe|nhỏ|nho/i.test(t)) return "Thấp";
  return "Chưa phân loại";
}

/** Điểm cộng khiếu nại theo mức độ - khớp knDiem() và Code.gs */
export function knDiem(mucDo?: string | null): number {
  const m = normMucDo(mucDo);
  if (m === "Nghiêm trọng") return TRONG_SO.khieuNaiNghiemTrong; // 4
  if (m === "Cao") return TRONG_SO.khieuNaiCao; // 3
  return TRONG_SO.khieuNaiKhac; // 1
}

/**
 * Phân tích trạng thái giao trễ từ cột gio_giao (raw string)
 */
export function parseGiaoTre(gioGiaoRaw?: string | null): {
  giaoTre: boolean;
  phutTre: number;
  lyDoTre: string;
} {
  const raw = String(gioGiaoRaw || "").trim();
  if (!raw) {
    return { giaoTre: false, phutTre: 0, lyDoTre: "" };
  }

  const isDelayText = /trễ|muộn|late|delay|chậm/i.test(raw);

  // Tìm số phút: ví dụ "trễ 15 phút", "muộn 30p", "15'", "trễ 45 ph"
  let phut = 0;
  const matchPhut = raw.match(/(\d+)\s*(?:phút|phut|p|ph|'|m)/i) ||
                    raw.match(/(?:trễ|muộn|chậm)\s*(\d+)/i);
  if (matchPhut) {
    phut = parseInt(matchPhut[1], 10) || 0;
  }

  const giaoTre = isDelayText || phut > 0;
  // Nếu có từ khóa trễ nhưng không ghi số phút cụ thể -> mặc định 1 phút để bật cờ
  const finalPhut = giaoTre && phut === 0 ? 1 : phut;

  return {
    giaoTre,
    phutTre: finalPhut,
    lyDoTre: giaoTre ? raw : "",
  };
}

/**
 * Phân tích chi phí phát sinh từ so_tien_ly_do_chi_phi hoặc cột chi phí
 */
export function parseChiPhi(input?: string | number | null): {
  coChiPhiNgoai: boolean;
  soTienChiPhi: number;
  lyDoChiPhi: string;
} {
  if (input === null || input === undefined) {
    return { coChiPhiNgoai: false, soTienChiPhi: 0, lyDoChiPhi: "" };
  }

  if (typeof input === "number") {
    return {
      coChiPhiNgoai: input > 0,
      soTienChiPhi: input,
      lyDoChiPhi: input > 0 ? "Chi phí ngoài phát sinh" : "",
    };
  }

  const s = String(input).trim();
  if (!s || /^(không|khong|ko|k|none|0|không có|khong co|ko co|không phát sinh|khong phat sinh|không cps)$/i.test(s)) {
    return { coChiPhiNgoai: false, soTienChiPhi: 0, lyDoChiPhi: "" };
  }

  // Trích xuất số tiền nếu có dạng 50.000, 150,000, 50k, 200000
  let soTien = 0;
  const cleanNumberStr = s.replace(/[.,\s]/g, "");
  const numMatch = cleanNumberStr.match(/(\d+)(k|nghìn|nghin|tr|triệu|trieu)?/i);

  if (numMatch) {
    const base = parseInt(numMatch[1], 10);
    const unit = (numMatch[2] || "").toLowerCase();
    if (unit === "k" || unit.startsWith("ngh")) {
      soTien = base * 1000;
    } else if (unit.startsWith("tr")) {
      soTien = base * 1000000;
    } else {
      soTien = base;
    }
  }

  return {
    coChiPhiNgoai: true,
    soTienChiPhi: soTien,
    lyDoChiPhi: s,
  };
}

/**
 * Trích xuất Google Drive URL và chuyển thành Thumbnail CDN
 */
export function parseDriveUrls(input?: string | string[] | null): string[] {
  if (!input) return [];

  let rawList: string[] = [];
  if (Array.isArray(input)) {
    rawList = input;
  } else {
    // Phân tách bởi dấu phẩy, chấm phẩy, xuống dòng hoặc khoảng trắng
    rawList = String(input).split(/[,;\n\r\t]+/).map(x => x.trim()).filter(Boolean);
  }

  return rawList.map(url => {
    // Nếu là Drive URL -> lấy ID
    const match = url.match(/\/d\/([a-zA-Z0-9_-]{20,})/i) ||
                  url.match(/[?&]id=([a-zA-Z0-9_-]{20,})/i);
    if (match && match[1]) {
      return `https://lh3.googleusercontent.com/d/${match[1]}`;
    }
    return url;
  });
}

/**
 * Tính mức độ vấn đề (0-3), tổng điểm vấn đề và danh sách lý do
 * Port nguyên bản từ hàm chiTietVanDe_ và heatmap trong script.js
 */
export function computeChiTietVanDe(
  row: {
    suCoThietBi?: string | null;
    soKhieuNai?: number | null;
    mucDoNghiemTrong?: string | null;
    suCoNhanSu?: string | null;
    giaoTre?: boolean | null;
    phutTre?: number | null;
    soThatThoat?: number | null;
    tongSuat?: number | null;
    nvlBatThuong?: boolean | null;
    tinhTrangNVL?: string | null;
    coChiPhiNgoai?: boolean | null;
    soTienChiPhi?: number | null;
    chiTietYKien?: string | null;
    phanLoaiKN?: string | null;
  },
  nguong: NguongConfig = DEFAULT_NGUONG
): {
  mucDoVanDe: number;
  diemVanDe: number;
  lyDoVanDe: string[];
} {
  let diem = 0;
  const lyDo: string[] = [];

  // 1. Thiết bị (+3)
  if (row.suCoThietBi && row.suCoThietBi.trim()) {
    diem += TRONG_SO.thietBi;
    lyDo.push(`• Thiết bị: ${row.suCoThietBi.trim()} (+${TRONG_SO.thietBi})`);
  }

  // 2. Khiếu nại (+4/3/1)
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

  // 3. Nhân sự (+2)
  if (row.suCoNhanSu && row.suCoNhanSu.trim()) {
    diem += TRONG_SO.nhanSu;
    lyDo.push(`• Nhân sự: ${row.suCoNhanSu.trim()} (+${TRONG_SO.nhanSu})`);
  }

  // 4. Giao trễ (+1 hoặc +2 nếu trễ > nguong.phutTre)
  if (row.giaoTre) {
    const pt = Number(row.phutTre || 0);
    const dTre = pt > nguong.phutTre ? TRONG_SO.giaoTreNang : TRONG_SO.giaoTreNhe;
    diem += dTre;
    lyDo.push(`• Giao trễ${pt ? " " + pt + " phút" : ""} (+${dTre})`);
  }

  // 5. Thất thoát (+2 nếu tỷ lệ thất thoát > nguong.thatThoatPct)
  const stt = Number(row.soThatThoat || 0);
  const ts = Number(row.tongSuat || 0);
  if (stt > 0 && ts > 0) {
    const ttp = (stt / ts) * 100;
    if (ttp > nguong.thatThoatPct) {
      diem += TRONG_SO.thatThoat;
      lyDo.push(`• Thất thoát: ${stt} suất (${ttp.toFixed(1)}%) (+${TRONG_SO.thatThoat})`);
    }
  }

  // 6. NVL bất thường (+1)
  if (row.nvlBatThuong) {
    diem += TRONG_SO.nvl;
    lyDo.push(`• NVL: ${row.tinhTrangNVL || "Bất thường"} (+${TRONG_SO.nvl})`);
  }

  // 7. Chi phí ngoài (+1)
  if (row.coChiPhiNgoai) {
    diem += TRONG_SO.chiPhiNgoai;
    const stDisp = Number(row.soTienChiPhi || 0).toLocaleString("vi-VN");
    lyDo.push(`• Chi phí: ${stDisp}đ (+${TRONG_SO.chiPhiNgoai})`);
  }

  // Quy đổi điểm ra bậc mức độ vấn đề 0-3:
  // 0: 0đ
  // 1: 1-2đ
  // 2: 3-5đ
  // 3: >= 6đ
  let mucDoVanDe = 0;
  if (diem >= 6) {
    mucDoVanDe = 3;
  } else if (diem >= 3) {
    mucDoVanDe = 2;
  } else if (diem >= 1) {
    mucDoVanDe = 1;
  }

  return { mucDoVanDe, diemVanDe: diem, lyDoVanDe: lyDo };
}

/**
 * Format ngày dạng YYYY-MM-DD
 */
export function formatDate(val: any): string {
  if (!val) return "";
  if (typeof val === "string") {
    return val.substring(0, 10);
  }
  if (val instanceof Date) {
    const y = val.getFullYear();
    const m = String(val.getMonth() + 1).padStart(2, "0");
    const d = String(val.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  return String(val);
}

/**
 * Map 1 dòng từ DB table `report` sang contract frontend yêu cầu
 */
export function mapReportRow(r: any, nguong: NguongConfig = DEFAULT_NGUONG) {
  const suatSang = Number(r.suat_sang || 0);
  const suatTrua = Number(r.suat_trua || 0);
  const suatChieu = Number(r.suat_chieu || 0);
  const suatNhanVien = Number(r.suat_nhan_vien || 0);
  const suatHuy = Number(r.suat_huy || 0);

  // tongSuat: nếu null/0 thì = sang + trua + chieu + nv + huy
  const calcTong = suatSang + suatTrua + suatChieu + suatNhanVien + suatHuy;
  const tongSuat = Number(r.tong_suat) > 0 ? Number(r.tong_suat) : calcTong;

  // Xử lý giao trễ nếu chưa tính sẵn
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

  // Xử lý chi phí ngoài nếu chưa tính sẵn
  let coChiPhiNgoai = Boolean(r.co_chi_phi_ngoai);
  let soTienChiPhi = Number(r.so_tien_chi_phi || 0);
  let lyDoChiPhi = r.ly_do_chi_phi || "";
  if (!coChiPhiNgoai && r.so_tien_ly_do_chi_phi) {
    const parsedCP = parseChiPhi(r.so_tien_ly_do_chi_phi);
    coChiPhiNgoai = parsedCP.coChiPhiNgoai;
    soTienChiPhi = parsedCP.soTienChiPhi;
    lyDoChiPhi = parsedCP.lyDoChiPhi;
  }

  // Xử lý NVL bất thường
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

  // Tính heatmap vấn đề
  const vanDe = computeChiTietVanDe({
    suCoThietBi,
    soKhieuNai,
    mucDoNghiemTrong,
    suCoNhanSu,
    giaoTre,
    phutTre,
    soThatThoat,
    tongSuat,
    nvlBatThuong,
    tinhTrangNVL,
    coChiPhiNgoai,
    soTienChiPhi,
    chiTietYKien,
    phanLoaiKN,
  }, nguong);

  return {
    id: r.id ? String(r.id) : `${r.ten_site}|${formatDate(r.ngay_bao_cao)}`,
    dauThoiGian: r.dau_thoi_gian ? String(r.dau_thoi_gian) : "",
    tenSite: r.ten_site || "",
    ngayBaoCao: formatDate(r.ngay_bao_cao),
    nguoiBaoCao: r.nguoi_bao_cao || "",
    suatSang,
    suatTrua,
    suatChieu,
    suatNhanVien,
    suatHuy,
    tongSuat,
    tenKhachHang: r.ten_khach_hang || "",
    suatLuuMau: Number(r.suat_luu_mau || 0),
    suatGiaoVien: Number(r.suat_giao_vien || 0),
    gioGiaoRaw,
    giaoTre,
    phutTre,
    lyDoTre,
    tinhTrangNVL,
    nvlBatThuong,
    suCoThietBi,
    soThatThoat,
    nguyenNhanThatThoat: r.nguyenNhan_that_thoat || r.nguyen_nhan_that_thoat || "",
    nsCoMat: Number(r.ns_co_mat || 0),
    nsVang: Number(r.ns_vang || 0),
    nsTangCa: Number(r.ns_tang_ca || 0),
    suCoNhanSu,
    soKhieuNai,
    soKhenNgoi,
    phanLoaiKN,
    mucDoNghiemTrong,
    chiTietYKien,
    coChiPhiNgoai,
    soTienChiPhi,
    lyDoChiPhi,
    hinhAnh: parseDriveUrls(r.hinh_anh),
    deXuat: r.de_xuat || "",
    mucDoVanDe: r.muc_do_van_de !== undefined && r.muc_do_van_de !== null ? Number(r.muc_do_van_de) : vanDe.mucDoVanDe,
    diemVanDe: r.diem_van_de !== undefined && r.diem_van_de !== null ? Number(r.diem_van_de) : vanDe.diemVanDe,
    lyDoVanDe: (r.ly_do_van_de && Array.isArray(r.ly_do_van_de) && r.ly_do_van_de.length)
      ? r.ly_do_van_de
      : vanDe.lyDoVanDe,
  };
}

/** Phát hiện giao dịch trả hàng (Return) */
export function computeIsReturn(r: any): boolean {
  if (r.is_return === true || r.is_return === 1) return true;
  const sl = Number(r.so_luong || 0);
  const tt = Number(r.thanh_tien || r.thanh_tien_truoc_thue || 0);
  if (sl < 0 || tt < 0) return true;

  const docType = String(r.loai_chung_tu_billing || "").toUpperCase();
  if (docType.includes("RE") || docType.includes("TRẢ") || docType.includes("RETURN") || docType.includes("ZRE")) {
    return true;
  }

  const lyDo = String(r.ly_do_tra_hang || "").trim();
  if (lyDo.length > 0 && !/^(không|khong|none|0)$/i.test(lyDo)) {
    return true;
  }

  return false;
}

/**
 * Map 1 dòng từ DB table `transactions` sang contract frontend yêu cầu
 */
export function mapTransactionRow(r: any) {
  const soLuong = Number(r.so_luong || 0);
  const thanhTienTruocThue = Number(r.thanh_tien_truoc_thue || 0);
  const chietKhau = Number(r.chiet_khau || 0);
  // Net revenue = thanh_tien_truoc_thue - chiet_khau
  const thanhTien = Number(r.thanh_tien) !== 0 && !isNaN(Number(r.thanh_tien))
    ? Number(r.thanh_tien)
    : (thanhTienTruocThue - chietKhau);
  const giaVon = Number(r.gia_von || 0);

  return {
    site: r.ten_cua_hang || "",
    maSite: r.ma_cua_hang || "",
    tenKH: r.ten_khach_hang || r.ten_kh || "",
    ngay: formatDate(r.billing_date),
    soLuong,
    dvt: r.dvt || "",
    thanhTien,
    giaVon,
    nhomSP: r.nhom_sp || "",
    nganhHang: r.nganh_hang || "",
    kenhBanHang: r.kenh_ban_hang || "",
    nvKinhDoanh: r.nv_kinh_doanh || "",
    tenSP: r.ten_sp || r.ten_san_pham || "",
    soHoaDon: r.so_hoa_don || "",
    soBillingGoc: r.so_billing_goc || "",
    lyDoTraHang: r.ly_do_tra_hang || "",
    isReturn: computeIsReturn(r),
  };
}
