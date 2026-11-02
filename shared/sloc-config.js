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
