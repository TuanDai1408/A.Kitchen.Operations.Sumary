// =========================================================================
// SHARED TIME RANGE HELPERS (CANTEEN PORTAL)
// Quy chuẩn dùng chung giữa 3 tab Doanh thu:
// - Doanh thu & Foodcost (ALL)
// - Doanh thu & Foodcost (SACN)
// - Doanh thu ước tính
// =========================================================================

export function akGetWeekInfo(dateStr) {
  if (!dateStr) return { key: '', label: '', year: '', startDate: '', endDate: '' };
  const d = new Date(dateStr + 'T00:00:00');
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(d.setDate(diff));
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const mStr = ('0' + monday.getDate()).slice(-2) + '/' + ('0' + (monday.getMonth() + 1)).slice(-2);
  const sStr = ('0' + sunday.getDate()).slice(-2) + '/' + ('0' + (sunday.getMonth() + 1)).slice(-2);
  const startOfYear = new Date(monday.getFullYear(), 0, 1);
  const weekNum = Math.ceil((((monday - startOfYear) / 86400000) + startOfYear.getDay() + 1) / 7);
  const y = monday.getFullYear();
  const m = ('0' + (monday.getMonth() + 1)).slice(-2);
  return {
    key: y + '-W' + ('0' + weekNum).slice(-2),
    label: 'Tuần ' + weekNum + ' (' + mStr + ' - ' + sStr + ')',
    month: y + '-' + m,
    year: String(y),
    startDate: monday.toISOString().slice(0, 10),
    endDate: sunday.toISOString().slice(0, 10)
  };
}

export function akGetQuarterInfo(dateStr) {
  if (!dateStr) return { key: '', label: '', year: '', quarter: 1, startDate: '', endDate: '' };
  const y = dateStr.substring(0, 4);
  const m = parseInt(dateStr.substring(5, 7), 10);
  const q = Math.ceil(m / 3);
  const startMonth = ('0' + ((q - 1) * 3 + 1)).slice(-2);
  const endMonth = ('0' + (q * 3)).slice(-2);
  const lastDay = (q === 1 || q === 4) ? '31' : '30';
  return {
    key: y + '-Q' + q,
    label: 'Quý ' + q + '/' + y,
    year: y,
    quarter: q,
    startDate: y + '-' + startMonth + '-01',
    endDate: y + '-' + endMonth + '-' + lastDay
  };
}

export function akGetMonthInfo(dateStr) {
  if (!dateStr) return { key: '', label: '', year: '', startDate: '', endDate: '' };
  const y = dateStr.substring(0, 4);
  const m = dateStr.substring(5, 7);
  const lastDayDate = new Date(parseInt(y, 10), parseInt(m, 10), 0);
  const lastDay = ('0' + lastDayDate.getDate()).slice(-2);
  return {
    key: y + '-' + m,
    label: 'Tháng ' + m + '/' + y,
    year: y,
    startDate: y + '-' + m + '-01',
    endDate: y + '-' + m + '-' + lastDay
  };
}

export function akGetYearInfo(dateStr) {
  if (!dateStr) return { key: '', label: '', year: '', startDate: '', endDate: '' };
  const y = dateStr.substring(0, 4);
  return {
    key: y,
    label: 'Năm ' + y,
    year: y,
    startDate: y + '-01-01',
    endDate: y + '-12-31'
  };
}

/**
 * Xây dựng danh sách kỳ (periodMap) từ dates theo granularity
 */
export function akBuildPeriodMap(gran, dates) {
  gran = gran || 'week';
  const periodMap = {};
  const validDates = (dates || []).filter(Boolean);

  validDates.forEach(d => {
    let info;
    if (gran === 'week') {
      info = akGetWeekInfo(d);
    } else if (gran === 'quarter') {
      info = akGetQuarterInfo(d);
    } else if (gran === 'year') {
      info = akGetYearInfo(d);
    } else {
      info = akGetMonthInfo(d);
    }
    if (info && info.key && !periodMap[info.key]) {
      periodMap[info.key] = info;
    }
  });

  const sortedKeys = Object.keys(periodMap).sort().reverse();
  return { periodMap, sortedKeys };
}

/**
 * Tính fromDate và toDate chuẩn hóa từ danh sách kỳ đã chọn
 */
export function akCalcPeriodRange(gran, periods, allDates, periodMap) {
  gran = gran || 'week';
  periods = periods || [];
  const dates = (allDates || []).slice().sort();

  if (!periods.length) {
    if (dates.length) {
      return { from: dates[0], to: dates[dates.length - 1] };
    }
    return { from: '', to: '' };
  }

  let minFrom = '';
  let maxTo = '';

  periods.forEach(k => {
    let s = '';
    let e = '';

    if (periodMap && periodMap[k] && periodMap[k].startDate && periodMap[k].endDate) {
      s = periodMap[k].startDate;
      e = periodMap[k].endDate;
    } else if (gran === 'week') {
      const parts = k.split('-W');
      if (parts.length === 2) {
        const yr = parseInt(parts[0], 10);
        const wk = parseInt(parts[1], 10);
        const startOfYear = new Date(yr, 0, 1);
        const dayOffset = (wk - 1) * 7;
        const approx = new Date(startOfYear.getTime() + dayOffset * 86400000);
        const day = approx.getDay();
        const diff = approx.getDate() - day + (day === 0 ? -6 : 1);
        const monday = new Date(approx.setDate(diff));
        const sunday = new Date(monday);
        sunday.setDate(monday.getDate() + 6);
        s = monday.toISOString().slice(0, 10);
        e = sunday.toISOString().slice(0, 10);
      }
    } else if (gran === 'quarter') {
      const partsQ = k.split('-Q');
      if (partsQ.length === 2) {
        const yQ = partsQ[0];
        const qNum = parseInt(partsQ[1], 10);
        const sm = ('0' + ((qNum - 1) * 3 + 1)).slice(-2);
        const em = ('0' + (qNum * 3)).slice(-2);
        const ld = (qNum === 1 || qNum === 4) ? '31' : '30';
        s = yQ + '-' + sm + '-01';
        e = yQ + '-' + em + '-' + ld;
      }
    } else if (gran === 'year') {
      s = k + '-01-01';
      e = k + '-12-31';
    } else {
      // month: YYYY-MM
      const partsM = k.split('-');
      if (partsM.length === 2) {
        const yM = parseInt(partsM[0], 10);
        const mM = parseInt(partsM[1], 10);
        const lastDate = new Date(yM, mM, 0);
        s = k + '-01';
        e = k + '-' + ('0' + lastDate.getDate()).slice(-2);
      }
    }

    if (s && (!minFrom || s < minFrom)) minFrom = s;
    if (e && (!maxTo || e > maxTo)) maxTo = e;
  });

  return { from: minFrom, to: maxTo };
}
