// =========================================================================
// A.KITCHEN DASHBOARD - CÁC HẰNG SỐ NGƯỠNG VÀ TRỌNG SỐ VẤN ĐỀ
// =========================================================================

export interface NguongConfig {
  thatThoatPct: number; // % thất thoát cảnh báo (mặc định > 2%)
  vangPct: number;      // % nhân sự vắng (> 15%)
  phutTre: number;      // số phút giao trễ (> 30p)
  huyPct: number;       // % suất hủy kế hoạch (1.5%)
  foodCostMin: number;  // % food cost min (30%)
  foodCostMax: number;  // % food cost max (40%)
  topKhachHang: number; // số lượng KH top (5)
}

export const DEFAULT_NGUONG: NguongConfig = {
  thatThoatPct: 2,
  vangPct: 15,
  phutTre: 30,
  huyPct: 1.5,
  foodCostMin: 30,
  foodCostMax: 40,
  topKhachHang: 5,
};

// Trọng số cộng điểm sự cố / vấn đề (khớp Code.gs và heatmap script.js)
export const TRONG_SO = {
  thietBi: 3,
  nhanSu: 2,
  khieuNaiNghiemTrong: 4,
  khieuNaiCao: 3,
  khieuNaiKhac: 1,
  giaoTreNhe: 1,
  giaoTreNang: 2, // phutTre > nguong.phutTre
  thatThoat: 2,   // ttp > nguong.thatThoatPct
  nvl: 1,
  chiPhiNgoai: 1,
};

// 4 bậc điểm heatmap (khớp HEAT trong script.js)
export const BAC_DIEM = [
  { mucDo: 0, ten: 'Bình thường', moc: '0đ', min: 0, max: 0 },
  { mucDo: 1, ten: 'Cần lưu ý', moc: '1-2đ', min: 1, max: 2 },
  { mucDo: 2, ten: 'Có vấn đề', moc: '3-5đ', min: 3, max: 5 },
  { mucDo: 3, ten: 'Nghiêm trọng', moc: '≥6đ', min: 6, max: Infinity },
];
