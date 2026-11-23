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
