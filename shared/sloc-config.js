// =========================================================================
// SHARED SLOC CONFIGURATION (QUẢN LÝ KHO CANTEEN)
// Chuẩn hóa tên và nhóm kho con theo quy tắc:
// RL01, KL01 -> Kho hàng hóa
// RL02, KL02 -> Kho VTTH
// RL03, KL03 -> Kho CCDC XD
// RL04       -> Kho cấp đông
// RL05       -> Kho trả hàng
// =========================================================================

export const SLOC_GROUPS = [
  { id: 'hang_hoa', name: 'Kho hàng hóa', codes: ['RL01', 'KL01'], primaryLabel: 'RL01, KL01' },
  { id: 'vtth', name: 'Kho VTTH', codes: ['RL02', 'KL02'], primaryLabel: 'RL02, KL02' },
  { id: 'ccdc_xd', name: 'Kho CCDC XD', codes: ['RL03', 'KL03'], primaryLabel: 'RL03, KL03' },
  { id: 'cap_dong', name: 'Kho cấp đông', codes: ['RL04', 'KL04'], primaryLabel: 'RL04' },
  { id: 'tra_hang', name: 'Kho trả hàng', codes: ['RL05', 'KL05'], primaryLabel: 'RL05' }
];

export const SLOC_MAP = {
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

export function getSlocGroup(code) {
  if (!code) return { id: 'other', name: 'Khác', groupCodes: [] };
  const c = String(code).trim().toUpperCase();
  return SLOC_MAP[c] || { id: c, name: c, groupCodes: [c] };
}

export function getSlocName(code) {
  if (!code) return '';
  const c = String(code).trim().toUpperCase();
  return SLOC_MAP[c]?.name || c;
}

export function getSlocDisplayName(code, withCode = true) {
  if (!code) return '';
  const c = String(code).trim().toUpperCase();
  const info = SLOC_MAP[c];
  if (!info) return c;
  return withCode ? `${info.name} (${c})` : info.name;
}

// =========================================================================
// QUY TẮC PHÂN LOẠI GIAO DỊCH VÀ CÔNG THỨC BẢO TOÀN GIÁ TRỊ KHO:
//
// 1. CÔNG THỨC BẮT BUỘC (UNIFIED PIPELINE):
//    GT_cuoi = GT_dau + GT_nhap - GT_xuat
//    SL_cuoi = SL_dau + SL_nhap - SL_xuat
//
// 2. GT_dau (Tồn đầu kỳ):
//    Tính từ toàn bộ các dòng phát sinh TRƯỚC fromDate (posting_date < fromDate)
//    trong cùng phạm vi bộ lọc (site, sloc, material). Không mặc định = 0.
//
// 3. GT_nhap (Nhập trong kỳ):
//    Tổng giá trị các dòng nhập kho hợp lệ (101, 501, 561, Z09, Z15... và reversal 602, 552).
//    Nếu amount_lc = 0: quy đổi từ đơn giá xuất (amount_lc_effective).
//    Reversal nhập (102, 122) có dấu âm bù trừ tự nhiên vào GT_nhap.
//    LOẠI TRỪ: transfer (351, 352, 301, 309...).
//
// 4. GT_xuat (Xuất trong kỳ):
//    Tổng giá trị các dòng xuất kho thực tế (601 xuất bán/giao hàng, 201 xuất chi phí, 241 CCDC, 551 hủy).
//    LOẠI TRỪ TUYỆT ĐỐI:
//      - mov_type 261, 262: Xuất cho lệnh sản xuất.
//      - mov_type 351, 352, 301, 309, 311...: Điều chuyển nội bộ/in-transit,
//        tránh làm tăng GT xuất một phía gây âm ảo (vì leg 101 tương ứng đã nhập).
//
// 5. GT_cuoi (Tồn cuối kỳ):
//    GT_cuoi = GT_dau + GT_nhap - GT_xuat
// =========================================================================

export function isProductionOrderIssue(mov_type) {
  if (!mov_type) return false;
  const m = String(mov_type).trim().toUpperCase();
  return m === "261" || m === "262" || m.startsWith("261 ") || m.startsWith("262 ") || m.startsWith("261-") || m.startsWith("262-");
}

export function isTransferMovement(mov_type) {
  if (!mov_type) return false;
  const m = String(mov_type).trim().toUpperCase();
  return m === "351" || m === "352" || m === "301" || m === "302" ||
         m === "309" || m === "310" || m === "311" || m === "312" ||
         m === "313" || m === "314" || m === "321" || m === "322" ||
         m === "343" || m === "411" || m === "687" || m === "688";
}

export function isCountedAsWarehouseIssue(rowOrMvt) {
  const m = typeof rowOrMvt === "object" && rowOrMvt !== null
    ? (rowOrMvt.mov_type || rowOrMvt.mvt)
    : rowOrMvt;
  if (!m) return false;
  if (isProductionOrderIssue(m)) return false;
  if (isTransferMovement(m)) return false;
  return true;
}

export function isCountedAsWarehouseReceipt(rowOrMvt) {
  const m = typeof rowOrMvt === "object" && rowOrMvt !== null
    ? (rowOrMvt.mov_type || rowOrMvt.mvt)
    : rowOrMvt;
  if (!m) return false;
  if (isProductionOrderIssue(m)) return false;
  if (isTransferMovement(m)) return false;
  return true;
}
