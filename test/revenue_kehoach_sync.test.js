import { test } from 'node:test';
import assert from 'node:assert';
import { getRevenueSummary, getKeHoachData } from '../server-api.js';

test('Revenue ALL vs Ke Hoach - Data synchronization parity across months', async () => {
  const kh = await getKeHoachData();
  assert.ok(kh && kh.ok, 'getKeHoachData returned ok');

  const testMonths = ['2026-01', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11'];

  for (const m of testMonths) {
    const from = `${m}-01`;
    const parts = m.split('-');
    const lastDay = new Date(parts[0], parts[1], 0).getDate();
    const to = `${m}-${String(lastDay).padStart(2, '0')}`;

    const rev = await getRevenueSummary({ from, to });
    assert.ok(rev && rev.ok, `getRevenueSummary returned ok for ${m}`);

    const per = kh.periods.find(p => p.key === m);
    assert.ok(per, `Found period ${m} in Ke Hoach`);

    const khTong = per.bySite[kh.siteTong];
    assert.ok(khTong, `Found siteTong in period ${m}`);

    // 1. Doanh thu thuần (Net Revenue)
    const diffNet = Math.abs(rev.kpis.netRevenue - khTong.DoanhThu.actual);
    assert.ok(
      diffNet < 0.01,
      `Month ${m}: Doanh thu thuần difference must be 0 (got rev=${rev.kpis.netRevenue}, kh=${khTong.DoanhThu.actual}, diff=${diffNet})`
    );

    // 2. Food Cost
    const diffFC = Math.abs(rev.kpis.foodCost - khTong.FoodCost.actualVal);
    assert.ok(
      diffFC < 0.01,
      `Month ${m}: Food Cost difference must be 0 (got rev=${rev.kpis.foodCost}, kh=${khTong.FoodCost.actualVal}, diff=${diffFC})`
    );

    // 3. Số suất ăn (Portions / SanLuongTong)
    const diffPortions = Math.abs(rev.kpis.planPortionQty - khTong.SanLuongTong.actual);
    assert.ok(
      diffPortions < 0.01,
      `Month ${m}: Số suất ăn difference must be 0 (got rev=${rev.kpis.planPortionQty}, kh=${khTong.SanLuongTong.actual}, diff=${diffPortions})`
    );
  }

  // Full Year 2026 Parity
  const rev2026 = await getRevenueSummary({ from: '2026-01-01', to: '2026-12-31' });
  let khTotalNet = 0;
  let khTotalFC = 0;
  let khTotalPortions = 0;
  kh.periods.forEach(p => {
    if (p.key.startsWith('2026')) {
      const st = p.bySite[kh.siteTong];
      khTotalNet += st.DoanhThu.actual;
      khTotalFC += st.FoodCost.actualVal;
      khTotalPortions += st.SanLuongTong.actual;
    }
  });

  assert.ok(
    Math.abs(rev2026.kpis.netRevenue - khTotalNet) < 0.01,
    `Full Year 2026: Net Revenue must match (rev=${rev2026.kpis.netRevenue}, kh=${khTotalNet})`
  );
  assert.ok(
    Math.abs(rev2026.kpis.foodCost - khTotalFC) < 0.01,
    `Full Year 2026: Food Cost must match (rev=${rev2026.kpis.foodCost}, kh=${khTotalFC})`
  );
  assert.ok(
    Math.abs(rev2026.kpis.planPortionQty - khTotalPortions) < 0.01,
    `Full Year 2026: Portions must match (rev=${rev2026.kpis.planPortionQty}, kh=${khTotalPortions})`
  );
});
