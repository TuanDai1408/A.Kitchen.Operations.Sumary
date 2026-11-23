import assert from "node:assert";
import test from "node:test";
import { getWarehouseDashboardData } from "../server-api.js";

test("Warehouse Stock Continuity - from 2026-10-01 to date correctly computes opening stock and zero ending stock for Qua Chieu K505", async () => {
  const result = await getWarehouseDashboardData({ from: "2026-10-01", site: "K505" });
  assert.ok(result && Array.isArray(result.items), "Items array returned");

  const item = result.items.find(x => x.code === "5100003498");
  assert.ok(item, "Material 5100003498 exists in K505");

  // Opening stock from Sep 2026: Receipts 137,252 - Issues 137,222 = 30
  assert.strictEqual(item.stock_begin, 30, "Opening stock before 2026-10-01 must be 30");

  // Receipts in Oct-Nov: 65,099
  assert.strictEqual(item.receipts, 65099, "Receipts in period must be 65,099");

  // Issues in Oct-Nov: 65,129
  assert.strictEqual(item.issues_abs, 65129, "Issues in period must be 65,129");

  // Ending stock: 30 + 65,099 - 65,129 = 0
  assert.strictEqual(item.stock_end, 0, "Ending stock must be exactly 0, not surplus");
});

test("Warehouse Stock Table - All items with non-zero ending stock match transaction documents and conservation formula 100%", async () => {
  const result = await getWarehouseDashboardData({ from: "2026-10-01", site: "K505" });
  assert.ok(result && Array.isArray(result.items));

  const txGroup = new Map();
  result.transactions.forEach(t => {
    const key = `${t.site || ""}|${t.article}`;
    if (!txGroup.has(key)) txGroup.set(key, { pos: 0, neg: 0 });
    const g = txGroup.get(key);
    if (t.qty >= 0) g.pos += t.qty;
    else g.neg += Math.abs(t.qty);
  });

  const nonZeroItems = result.items.filter(it => Math.abs(it.stock_end) > 0.001);
  assert.ok(nonZeroItems.length > 0, "Must have non-zero items to audit");

  for (const it of nonZeroItems) {
    const key = `${it.site || ""}|${it.code}`;
    const g = txGroup.get(key) || { pos: 0, neg: 0 };

    assert.ok(
      Math.abs(it.receipts - g.pos) <= 0.001,
      `Item ${it.code} receipts (${it.receipts}) must match positive transactions (${g.pos})`
    );
    assert.ok(
      Math.abs(it.issues_abs - g.neg) <= 0.001,
      `Item ${it.code} issues_abs (${it.issues_abs}) must match negative transactions (${g.neg})`
    );
    const expectedEnd = it.stock_begin + it.receipts - it.issues_abs;
    assert.ok(
      Math.abs(it.stock_end - expectedEnd) <= 0.001,
      `Item ${it.code} stock_end (${it.stock_end}) must match stock_begin + receipts - issues (${expectedEnd})`
    );
  }
});
