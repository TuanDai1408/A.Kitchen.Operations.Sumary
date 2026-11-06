// =========================================================================
// WAREHOUSE DERIVED RECEIPT PRICING (QUẢN LÝ KHO CANTEEN)
// Sửa cách tính giá trị nhập (GT nhập) khi dòng nhập có amount_lc = 0.
// Rule:
// 1. Xác định đơn giá tham chiếu từ các dòng XUẤT cùng ngữ cảnh:
//    - Cùng material (mã NVL)
//    - Cùng site (ưu tiên cùng nhóm kho Sloc, nới ra cùng site)
//    - Trong kỳ filter (nới ra kỳ trước / priorRows nếu không có trong kỳ)
//    - Loại trừ mov_type = '551' (hủy) và mov_type = '261' (lệnh SX) khỏi nguồn giá thường
//    - Đơn giá tham chiếu = bình quân gia quyền theo abs(quantity) của các dòng xuất
// 2. Với dòng nhập amount_lc = 0: amount_lc_effective = unit_price_ref * quantity
// 3. Dòng nhập đã có amount_lc != 0: giữ nguyên
// 4. Dòng xuất: không đổi
// =========================================================================

import { getSlocGroup, isProductionOrderIssue } from './sloc-config.js';

export function isIssueMovement(mov_type, qty) {
  const q = Number(qty !== undefined ? qty : 0);
  if (q < 0) return true;
  const m = String(mov_type || "").trim().toUpperCase();
  if (m === "351") return true;
  return false;
}

export function isDisposalMovement(mov_type) {
  const m = String(mov_type || "").trim().toUpperCase();
  return m === "551" || m === "553" || m === "555" || m === "89C";
}

function addAccum(map, key, amtAbs, qtyAbs) {
  if (!map[key]) {
    map[key] = { totalAmt: 0, totalQty: 0, count: 0 };
  }
  map[key].totalAmt += amtAbs;
  map[key].totalQty += qtyAbs;
  map[key].count++;
}

function getWeightedPriceFromMap(map, key) {
  const stat = map[key];
  if (!stat || stat.totalQty <= 0 || stat.totalAmt <= 0) return 0;
  return Math.round(stat.totalAmt / stat.totalQty);
}

/**
 * Xây dựng các bản đồ thống kê giá xuất để phục vụ tham chiếu
 */
export function buildIssuePriceIndex(rowsOrTransactions) {
  const regularSlocMap = {};
  const regularSiteMap = {};
  const regularMatMap = {};

  const fallbackSiteMap = {};
  const fallbackMatMap = {};

  (rowsOrTransactions || []).forEach(r => {
    const mat = String(r.material || r.article || "").trim();
    if (!mat) return;

    const mvt = String(r.mov_type || r.mvt || "").trim().toUpperCase();
    let q = Number(r.quantity !== undefined ? r.quantity : (r.qty !== undefined ? r.qty : 0));
    let amt = Number(r.amount_lc !== undefined && r.amount_lc !== null ? r.amount_lc : (r.value !== undefined ? r.value : 0));

    // Chuẩn hóa 351/352 nếu là raw mb51 row
    if (mvt === "351" && q > 0) {
      q = -q;
      amt = -Math.abs(amt);
    } else if (mvt === "352" && q < 0) {
      q = Math.abs(q);
      amt = Math.abs(amt);
    }

    // Chỉ xét dòng XUẤT (q < 0)
    if (q >= 0) return;

    // Tuyệt đối loại trừ dòng hủy 551 (và các mã hủy liên quan)
    if (isDisposalMovement(mvt)) return;

    const amtAbs = Math.abs(amt);
    const qtyAbs = Math.abs(q);
    if (amtAbs <= 0 || qtyAbs <= 0) return;

    const site = String(r.site || "").trim();
    const sloc = String(r.stor_loc || r.sloc || "").trim().toUpperCase();
    const slocGroupId = getSlocGroup(sloc).id || sloc;

    const keySloc = `${mat}|${site}|${slocGroupId}`;
    const keySite = `${mat}|${site}`;
    const keyMat = mat;

    const isProdOrder = isProductionOrderIssue(mvt);

    if (!isProdOrder) {
      // Dòng xuất thường (không phải 551, không phải 261) -> ưu tiên số 1
      addAccum(regularSlocMap, keySloc, amtAbs, qtyAbs);
      addAccum(regularSiteMap, keySite, amtAbs, qtyAbs);
      addAccum(regularMatMap, keyMat, amtAbs, qtyAbs);
    } else {
      // Dòng xuất khác (ví dụ 261) -> chỉ dùng fallback khi không còn xuất nào khác
      addAccum(fallbackSiteMap, keySite, amtAbs, qtyAbs);
      addAccum(fallbackMatMap, keyMat, amtAbs, qtyAbs);
    }
  });

  return {
    regularSlocMap,
    regularSiteMap,
    regularMatMap,
    fallbackSiteMap,
    fallbackMatMap
  };
}

/**
 * Tìm đơn giá tham chiếu theo thứ tự ưu tiên
 */
export function resolveIssueReferencePrice(mat, site, sloc, periodIndex, priorIndex = null) {
  const cleanMat = String(mat || "").trim();
  if (!cleanMat) return 0;
  const cleanSite = String(site || "").trim();
  const cleanSloc = String(sloc || "").trim().toUpperCase();
  const slocGroupId = getSlocGroup(cleanSloc).id || cleanSloc;

  const keySloc = `${cleanMat}|${cleanSite}|${slocGroupId}`;
  const keySite = `${cleanMat}|${cleanSite}`;
  const keyMat = cleanMat;

  // 1. Trong kỳ: Xuất thường cùng slocGroup -> cùng site -> cùng material
  if (periodIndex) {
    let p = getWeightedPriceFromMap(periodIndex.regularSlocMap, keySloc);
    if (p > 0) return p;
    p = getWeightedPriceFromMap(periodIndex.regularSiteMap, keySite);
    if (p > 0) return p;
    p = getWeightedPriceFromMap(periodIndex.regularMatMap, keyMat);
    if (p > 0) return p;
  }

  // 2. Trước kỳ (priorRows): Xuất thường cùng slocGroup -> cùng site -> cùng material
  if (priorIndex) {
    let p = getWeightedPriceFromMap(priorIndex.regularSlocMap, keySloc);
    if (p > 0) return p;
    p = getWeightedPriceFromMap(priorIndex.regularSiteMap, keySite);
    if (p > 0) return p;
    p = getWeightedPriceFromMap(priorIndex.regularMatMap, keyMat);
    if (p > 0) return p;
  }

  // 3. Fallback trong kỳ (nếu không có xuất thường, chấp nhận xuất khác ngoại trừ 551)
  if (periodIndex) {
    let p = getWeightedPriceFromMap(periodIndex.fallbackSiteMap, keySite);
    if (p > 0) return p;
    p = getWeightedPriceFromMap(periodIndex.fallbackMatMap, keyMat);
    if (p > 0) return p;
  }

  // 4. Fallback trước kỳ
  if (priorIndex) {
    let p = getWeightedPriceFromMap(priorIndex.fallbackSiteMap, keySite);
    if (p > 0) return p;
    p = getWeightedPriceFromMap(priorIndex.fallbackMatMap, keyMat);
    if (p > 0) return p;
  }

  return 0;
}

/**
 * Áp dụng đơn giá tham chiếu cho danh sách transactions (mutates and returns)
 */
export function enrichTransactionsWithEffectiveReceiptPrices(transactions, priorRows = []) {
  if (!Array.isArray(transactions) || !transactions.length) {
    return transactions || [];
  }

  const periodIndex = buildIssuePriceIndex(transactions);
  const priorIndex = (Array.isArray(priorRows) && priorRows.length) ? buildIssuePriceIndex(priorRows) : null;

  transactions.forEach(t => {
    const q = Number(t.quantity !== undefined ? t.quantity : (t.qty !== undefined ? t.qty : 0));
    const rawAmt = Number(t.amount_lc !== undefined && t.amount_lc !== null ? t.amount_lc : (t.value !== undefined ? t.value : 0));

    // Chỉ xử lý dòng NHẬP (q > 0) có giá trị = 0 hoặc null
    const isReceipt = q > 0;
    const hasZeroAmount = rawAmt === 0;

    if (isReceipt && hasZeroAmount) {
      const mat = t.material || t.article;
      const site = t.site || "";
      const sloc = t.stor_loc || t.sloc || "";

      const refPrice = resolveIssueReferencePrice(mat, site, sloc, periodIndex, priorIndex);
      if (refPrice > 0) {
        const amtEffective = Math.round(refPrice * Math.abs(q));
        t.is_estimated_price = true;
        t.unit_price_ref = refPrice;
        t.price = refPrice;
        t.effective_unit_price = refPrice;
        t.amount_lc_effective = amtEffective;
        t.value = amtEffective;
        // Cập nhật amount_lc thành giá trị hữu hiệu
        t.amount_lc = amtEffective;
      } else {
        t.is_estimated_price = false;
        t.amount_lc_effective = 0;
      }
    } else {
      t.is_estimated_price = false;
      t.amount_lc_effective = t.value !== undefined ? t.value : rawAmt;
    }
  });

  return transactions;
}
