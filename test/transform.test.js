// =========================================================================
// UNIT TESTS FOR TRANSFORM & SCORING LOGIC
// =========================================================================

import assert from "node:assert";
import test from "node:test";

// Test suite for scoring & normalization logic
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
  const finalPhut = giaoTre && phut === 0 ? 1 : phut;
  return { giaoTre, phutTre: finalPhut, lyDoTre: giaoTre ? raw : "" };
}

function parseChiPhi(input) {
  if (input === null || input === undefined) return { coChiPhiNgoai: false, soTienChiPhi: 0, lyDoChiPhi: "" };
  if (typeof input === "number") return { coChiPhiNgoai: input > 0, soTienChiPhi: input, lyDoChiPhi: input > 0 ? "Chi phí ngoài phát sinh" : "" };
  const s = String(input).trim();
  if (!s || /^(không|khong|ko|k|none|0|không có|khong co|ko co|không phát sinh|khong phat sinh|không cps)$/i.test(s)) return { coChiPhiNgoai: false, soTienChiPhi: 0, lyDoChiPhi: "" };
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

function computeChiTietVanDe(row, nguong = { thatThoatPct: 2, phutTre: 30 }) {
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

test("normMucDo correctly maps degrees of severity", () => {
  assert.strictEqual(normMucDo("Nghiêm trọng"), "Nghiêm trọng");
  assert.strictEqual(normMucDo("khẩn cấp"), "Nghiêm trọng");
  assert.strictEqual(normMucDo("Cao"), "Cao");
  assert.strictEqual(normMucDo("trung bình"), "Trung bình");
  assert.strictEqual(normMucDo("thấp"), "Thấp");
  assert.strictEqual(normMucDo(""), "Chưa phân loại");
});

test("knDiem scoring matches weights", () => {
  assert.strictEqual(knDiem("Nghiêm trọng"), 4);
  assert.strictEqual(knDiem("Cao"), 3);
  assert.strictEqual(knDiem("Trung bình"), 1);
  assert.strictEqual(knDiem("Thấp"), 1);
});

test("parseGiaoTre parses delay and minutes correctly", () => {
  const res1 = parseGiaoTre("10:45 (trễ 15 phút)");
  assert.strictEqual(res1.giaoTre, true);
  assert.strictEqual(res1.phutTre, 15);

  const res2 = parseGiaoTre("10:30 đúng giờ");
  assert.strictEqual(res2.giaoTre, false);
  assert.strictEqual(res2.phutTre, 0);

  const res3 = parseGiaoTre("Trễ 45p do kẹt xe");
  assert.strictEqual(res3.giaoTre, true);
  assert.strictEqual(res3.phutTre, 45);
});

test("parseChiPhi extracts amounts accurately", () => {
  const res1 = parseChiPhi("50.000đ mua đá");
  assert.strictEqual(res1.coChiPhiNgoai, true);
  assert.strictEqual(res1.soTienChiPhi, 50000);

  const res2 = parseChiPhi("Không có");
  assert.strictEqual(res2.coChiPhiNgoai, false);
  assert.strictEqual(res2.soTienChiPhi, 0);

  const res3 = parseChiPhi(150000);
  assert.strictEqual(res3.coChiPhiNgoai, true);
  assert.strictEqual(res3.soTienChiPhi, 150000);
});

test("computeChiTietVanDe computes correct levels and points", () => {
  // Case 0: Không vấn đề
  const c0 = computeChiTietVanDe({ tongSuat: 100 });
  assert.strictEqual(c0.diemVanDe, 0);
  assert.strictEqual(c0.mucDoVanDe, 0);

  // Case 1: Cần lưu ý (1-2đ) -> giao trễ 10p (+1)
  const c1 = computeChiTietVanDe({ giaoTre: true, phutTre: 10, tongSuat: 100 });
  assert.strictEqual(c1.diemVanDe, 1);
  assert.strictEqual(c1.mucDoVanDe, 1);

  // Case 2: Có vấn đề (3-5đ) -> sự cố thiết bị (+3)
  const c2 = computeChiTietVanDe({ suCoThietBi: "Hỏng tủ hấp cơm", tongSuat: 100 });
  assert.strictEqual(c2.diemVanDe, 3);
  assert.strictEqual(c2.mucDoVanDe, 2);

  // Case 3: Nghiêm trọng (>=6đ) -> thiết bị (+3) + khiếu nại nghiêm trọng (+4) = 7đ
  const c3 = computeChiTietVanDe({
    suCoThietBi: "Hỏng tủ hấp cơm",
    soKhieuNai: 1,
    mucDoNghiemTrong: "Nghiêm trọng",
    tongSuat: 100
  });
  assert.strictEqual(c3.diemVanDe, 7);
  assert.strictEqual(c3.mucDoVanDe, 3);
});

test("mapTransactionRow maps vung_mien, loai_cua_hang, and ten_kenh_ban_hang without hardcoding", async () => {
  const { mapTransactionRow } = await import("../server-api.js");

  // Case 1: Row with DB columns vung_mien, loai_cua_hang, ten_kenh_ban_hang
  const row1 = {
    ma_cua_hang: "K501",
    ten_cua_hang: "A.Kitchen K501",
    vung_mien: "Miền Bắc",
    loai_cua_hang: "Trường học",
    kenh_ban_hang: "B2B",
    ten_kenh_ban_hang: "Khách hàng Doanh nghiệp B2B",
    billing_date: "2026-09-15",
    so_luong: 120,
    thanh_tien_truoc_thue: 3600000,
    chiet_khau: 0,
    gia_von: 2100000,
    dvt: "PHA"
  };

  const mapped1 = mapTransactionRow(row1);
  assert.strictEqual(mapped1.vungMien, "Miền Bắc");
  assert.strictEqual(mapped1.vung_mien, "Miền Bắc");
  assert.strictEqual(mapped1.loaiCuaHang, "Trường học");
  assert.strictEqual(mapped1.loai_cua_hang, "Trường học");
  assert.strictEqual(mapped1.tenKenhBanHang, "Khách hàng Doanh nghiệp B2B");
  assert.strictEqual(mapped1.ten_kenh_ban_hang, "Khách hàng Doanh nghiệp B2B");
  assert.strictEqual(mapped1.site, "A.Kitchen K501");
  assert.strictEqual(mapped1.maSite, "K501");
  assert.strictEqual(mapped1.soLuong, 120);

  // Case 2: Row with null / empty vung_mien and loai_cua_hang - returns empty string without inventing values
  const row2 = {
    ma_cua_hang: "K999",
    ten_cua_hang: "A.Kitchen Mới",
    vung_mien: null,
    loai_cua_hang: undefined,
    kenh_ban_hang: "KenhLe",
    billing_date: "2026-09-16",
    so_luong: 10,
    thanh_tien_truoc_thue: 500000,
    gia_von: 250000
  };

  const mapped2 = mapTransactionRow(row2);
  assert.strictEqual(mapped2.vungMien, "");
  assert.strictEqual(mapped2.vung_mien, "");
  assert.strictEqual(mapped2.loaiCuaHang, "");
  assert.strictEqual(mapped2.loai_cua_hang, "");
  assert.strictEqual(mapped2.tenKenhBanHang, "KenhLe"); // fallback to kenh_ban_hang
  assert.strictEqual(mapped2.ten_kenh_ban_hang, "KenhLe");

  // Case 3: Verify dynamic data - new values from DB are passed directly without hardcoded lookup
  const row3 = {
    ma_cua_hang: "K001",
    ten_cua_hang: "A.Kitchen K001",
    vung_mien: "Vùng Tây Nguyên",
    loai_cua_hang: "Bệnh viện",
    ten_kenh_ban_hang: "Kênh Y Tế",
    billing_date: "2026-09-17"
  };
  const mapped3 = mapTransactionRow(row3);
  assert.strictEqual(mapped3.vungMien, "Vùng Tây Nguyên");
  assert.strictEqual(mapped3.loaiCuaHang, "Bệnh viện");
  assert.strictEqual(mapped3.tenKenhBanHang, "Kênh Y Tế");
});

