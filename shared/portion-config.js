// =========================================================================
// SHARED PORTION CONFIGURATION & NORMALIZATION HELPER (CANTEEN PORTAL)
// Quy chuẩn quy đổi số suất ăn thống nhất giữa tất cả các tab
// (Doanh thu & Foodcost ALL/SACN, Doanh thu ước tính, Báo cáo vận hành, v.v.)
// =========================================================================

export const PORTION_SITE_RULES = {
  // Site K003: Hub / Trung tâm chế biến BTP Miền Nam
  // Sản phẩm giao theo KG (bán thành phẩm). Chuẩn Foodcost: 100g = 1 suất -> 1 KG = 10 suất.
  // Đơn vị vận chuyển (CHY) không phải suất ăn.
  K003: {
    code: 'K003',
    name: 'A.Kitchen - Miền Nam',
    aliases: ['A.KITCHEN - MIỀN NAM', 'A.KITCHEN - MIEN NAM', 'MIỀN NAM', 'MIEN NAM'],
    defaultFactor: 10,
    unitFactors: {
      KG: 10,
      PHA: 1,
      SUAT: 1,
      CHY: 0,
      CHUYEN: 0,
      TUI: 0
    }
  },

  // Site D007: Kho trung chuyển rau củ / hàng hóa Megafarrm
  // Chỉ các dòng hàng nông sản theo KG mới quy đổi sang suất ăn (1 KG = 10 suất).
  // Các đơn vị bao bì / phi thực phẩm (CHA, MIE, VI, BIC, CAY, GOI...) là 0 suất.
  D007: {
    code: 'D007',
    name: 'MN Kho Megafarrm',
    aliases: ['MN KHO MEGAFARRM', 'MEGAFARRM', 'MEGAFARM'],
    defaultFactor: 10,
    unitFactors: {
      KG: 10,
      PHA: 1,
      SUAT: 1,
      CHY: 0,
      CHUYEN: 0,
      CHA: 0,
      MIE: 0,
      VI: 0,
      BIC: 0,
      CAY: 0,
      GOI: 0,
      CAN: 0,
      BAO: 0,
      TUI: 0,
      HU: 0,
      TRA: 0,
      HOP: 0,
      KHA: 0
    }
  }
};

/**
 * Kiểm tra xem mã site / tên site có phải là K003 không
 */
export function isSiteK003(siteOrCode) {
  if (!siteOrCode) return false;
  const s = String(siteOrCode).trim().toUpperCase();
  return s === 'K003' || s.includes('MIỀN NAM') || s.includes('MIEN NAM');
}

/**
 * Kiểm tra xem mã site / tên site có phải là D007 không
 */
export function isSiteD007(siteOrCode) {
  if (!siteOrCode) return false;
  const s = String(siteOrCode).trim().toUpperCase();
  return s === 'D007' || s.includes('MEGAFAR');
}

/**
 * Lấy hệ số quy đổi suất dựa trên siteCode và đơn vị tính (ĐVT)
 */
export function getPortionFactor(siteCode, unit) {
  const u = String(unit || '').trim().toUpperCase();
  const s = String(siteCode || '').trim();

  if (u === 'CHY' || u === 'CHUYEN') return 0;
  if (['LON', 'LY', 'CHAI', 'SET'].includes(u)) return 0;

  if (isSiteK003(s)) {
    if (u === 'KG') return 10;
    if (u === 'PHA' || u === 'SUAT') return 1;
    if (!u) return 10;
    return PORTION_SITE_RULES.K003.unitFactors[u] !== undefined
      ? PORTION_SITE_RULES.K003.unitFactors[u]
      : 10;
  }

  if (isSiteD007(s)) {
    if (u === 'KG') return 10;
    if (u === 'PHA' || u === 'SUAT') return 1;
    if (!u) return 10;
    return PORTION_SITE_RULES.D007.unitFactors[u] !== undefined
      ? PORTION_SITE_RULES.D007.unitFactors[u]
      : 0;
  }

  // Canteen sites chuẩn
  if (u === 'PHA' || u === 'SUAT') return 1;
  if (u === 'KG') return 10; // Bán thành phẩm phát sinh tại canteen
  if (!u) return 1;
  return 0;
}

/**
 * Chuẩn hóa số suất ăn từ số lượng thô (rawQty), siteCode và context/ĐVT.
 * Hỗ trợ các kiểu truyền đối số:
 * 1. normalizePortionQty(row)                      // Truyền nguyên đối tượng dòng giao dịch
 * 2. normalizePortionQty(rawQty, siteCode, unit)    // Truyền số lượng, site, ĐVT
 * 3. normalizePortionQty(rawQty, siteCode, context) // context là object { dvt, isReturn, ... }
 */
export function normalizePortionQty(rawQty, siteCode, context) {
  let qty = 0;
  let site = '';
  let unit = '';
  let isReturn = false;

  if (typeof rawQty === 'object' && rawQty !== null) {
    const r = rawQty;
    qty = Number(
      r.soLuong !== undefined
        ? r.soLuong
        : (r.so_luong !== undefined
        ? r.so_luong
        : (r.quantity !== undefined ? r.quantity : (r.salesQty || 0)))
    );
    site = siteCode || r.maSite || r.ma_cua_hang || r.site || r.tenSite || r.ten_cua_hang || '';
    unit =
      (typeof context === 'string'
        ? context
        : (context && (context.dvt || context.entryUnit || context.entry_unit || context.unit))) ||
      r.dvt ||
      r.entryUnit ||
      r.entry_unit ||
      r.unit ||
      '';
    isReturn = Boolean(r.isReturn || r.is_return);
  } else {
    qty = Number(rawQty || 0);
    site = String(siteCode || '').trim();
    if (typeof context === 'string') {
      unit = context;
    } else if (typeof context === 'object' && context !== null) {
      unit = context.dvt || context.entryUnit || context.entry_unit || context.unit || '';
      isReturn = Boolean(context.isReturn || context.is_return);
    }
  }

  if (!qty || isNaN(qty)) return 0;

  const u = String(unit || '').trim().toUpperCase();
  const factor = getPortionFactor(site, u);
  const portionCount = qty * factor;

  return isReturn ? -Math.abs(portionCount) : portionCount;
}
