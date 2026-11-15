import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { getWarehouseDashboardData, getWarehouseSummary } from "../server-api.js";

test("Warehouse Recent Month Optimization - only materials with documents in period are returned by default", async () => {
  const res = await getWarehouseDashboardData({
    from: "2026-10-11",
    to: "2026-11-11"
  });

  assert.ok(res.success, "Query must succeed");
  assert.ok(Array.isArray(res.items), "Items must be an array");
  assert.ok(res.items.length > 0, "Must have active items");

  // Every item returned must have movements/transactions in the period
  const dormantItems = res.items.filter(it => (it.doc_count || 0) === 0 && it.receipts === 0 && it.issues_abs === 0);
  assert.equal(
    dormantItems.length,
    0,
    `Must have 0 dormant items without movements in period, but found ${dormantItems.length}`
  );

  // Accounting integrity: stock_end = stock_begin + receipts - issues_abs
  res.items.forEach(it => {
    const calcEnd = it.stock_begin + it.receipts - it.issues_abs;
    assert.ok(
      Math.abs(it.stock_end - calcEnd) < 0.001,
      `Item ${it.code} stock_end must equal stock_begin + receipts - issues_abs`
    );
  });
});

test("Warehouse Recent Month Optimization - getWarehouseSummary aggregates correctly without dormant items", async () => {
  const summary = await getWarehouseSummary({
    from: "2026-10-11",
    to: "2026-11-11"
  });

  assert.ok(summary.success, "Summary query must succeed");
  assert.ok(summary.isSummary, "isSummary must be true");

  const dormantItems = summary.items.filter(it => (it.doc_count || 0) === 0 && it.receipts === 0 && it.issues_abs === 0);
  assert.equal(dormantItems.length, 0, "Summary must have 0 dormant items");
});

test("Warehouse Recent Month Optimization - script.js and public/script.js filter dormant items before consolidation", () => {
  const scriptContent = fs.readFileSync(path.join(process.cwd(), "script.js"), "utf8");
  const publicScriptContent = fs.readFileSync(path.join(process.cwd(), "public", "script.js"), "utf8");

  assert.equal(scriptContent, publicScriptContent, "script.js and public/script.js must be identical");

  // Verify consolidateItemsByCode filters for active documents
  assert.ok(
    scriptContent.includes("var hasDoc = (x.doc_count || 0) > 0 || (x._ct || 0) > 0 || (cnt[x.code] || 0) > 0 || x.receipts !== 0 || x.issues_abs !== 0;"),
    "script.js must check hasDoc before aggregating"
  );
  assert.ok(
    scriptContent.includes("Chỉ hiển thị các nguyên vật liệu có phát sinh chứng từ xuất nhập trong 1 tháng gần nhất"),
    "UI note must mention 1 thang gan nhat"
  );
});
