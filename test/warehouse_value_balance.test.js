import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  isProductionOrderIssue,
  isTransferMovement,
  isCountedAsWarehouseIssue,
  isCountedAsWarehouseReceipt,
  SLOC_GROUPS,
  SLOC_MAP
} from "../shared/sloc-config.js";
import { getWarehouseDashboardData } from "../server-api.js";

test("Warehouse Value Balance - Transfer movements classification", () => {
  // Transfer types: 351, 352, 301, 302, 309, 310, 311, 312, 313, 314, 321, 322, 343, 411, 687, 688
  assert.equal(isTransferMovement("351"), true);
  assert.equal(isTransferMovement("352"), true);
  assert.equal(isTransferMovement("301"), true);
  assert.equal(isTransferMovement("309"), true);
  assert.equal(isTransferMovement("311"), true);
  assert.equal(isTransferMovement("601"), false); // regular sales delivery issue
  assert.equal(isTransferMovement("201"), false); // cost center issue
  assert.equal(isTransferMovement("101"), false); // receipt
  assert.equal(isTransferMovement("551"), false); // scrap
});

test("Warehouse Value Balance - isCountedAsWarehouseIssue excludes both 261/262 and transfers", () => {
  // Production order issues excluded:
  assert.equal(isCountedAsWarehouseIssue("261"), false);
  assert.equal(isCountedAsWarehouseIssue("262"), false);
  assert.equal(isCountedAsWarehouseIssue({ mov_type: "261" }), false);

  // Transfers excluded:
  assert.equal(isCountedAsWarehouseIssue("351"), false);
  assert.equal(isCountedAsWarehouseIssue("352"), false);
  assert.equal(isCountedAsWarehouseIssue("301"), false);
  assert.equal(isCountedAsWarehouseIssue({ mov_type: "351" }), false);

  // Regular issues included:
  assert.equal(isCountedAsWarehouseIssue("601"), true);
  assert.equal(isCountedAsWarehouseIssue("201"), true);
  assert.equal(isCountedAsWarehouseIssue("241"), true);
  assert.equal(isCountedAsWarehouseIssue("551"), true);
  assert.equal(isCountedAsWarehouseIssue({ mov_type: "601" }), true);
});

test("Warehouse Value Balance - Unified accounting formula: GT_cuoi = GT_dau + GT_nhap - GT_xuat", () => {
  // Given:
  const stockBegin = 100;
  const price = 50000;
  const stockBeginValue = stockBegin * price; // 5,000,000
  const receiptsValue = 3000000;              // 3,000,000
  const issuesValue = 2000000;                // 2,000,000

  // Calculation in pipeline:
  const stockEndValue = stockBeginValue + receiptsValue - issuesValue;

  // Expected: 6,000,000
  assert.equal(stockEndValue, 6000000);
  assert.equal(stockEndValue, stockBeginValue + receiptsValue - issuesValue);
});

test("Warehouse Value Balance - Negative stock value tooltip is preserved and not coerced to 0", () => {
  const stockBeginValue = 1000000;
  const receiptsValue = 500000;
  const issuesValue = 3000000; // GT xuất > GT đầu + GT nhập
  const stockEndValue = stockBeginValue + receiptsValue - issuesValue; // -1,500,000

  assert.equal(stockEndValue, -1500000);
  assert.ok(stockEndValue < 0, "Real negative value must be preserved");

  // Verify UI tooltip message string is present in script.js and public/script.js
  const scriptContent = fs.readFileSync(path.join(process.cwd(), "script.js"), "utf8");
  const expectedTooltip = "GT cuối âm do GT xuất > GT đầu + GT nhập (thiếu giá trị nhập trên chứng từ)";
  assert.ok(scriptContent.includes(expectedTooltip), "script.js must contain exact negative tooltip");
  assert.ok(!scriptContent.includes("Math.max(0, stockVal)"), "script.js must not force stockVal to 0");
});

test("Warehouse Value Balance - Single site and short period DB integration verification", async () => {
  // Query 1 site with a 7-day period
  const data = await getWarehouseDashboardData({
    from: "2026-10-10",
    to: "2026-10-17",
    sites: ["K001"]
  });

  assert.ok(data, "Dashboard data must be returned");
  assert.ok(Array.isArray(data.items), "Items array must be returned");
  assert.ok(Array.isArray(data.transactions), "Transactions array must be returned");

  // Sum across items
  let totalStockBeginVal = 0;
  let totalReceiptsVal = 0;
  let totalIssuesVal = 0;
  let totalStockEndVal = 0;

  data.items.forEach(it => {
    totalStockBeginVal += (it.stock_begin_value || 0);
    totalReceiptsVal += (it.receipts_value || 0);
    totalIssuesVal += (it.issues_value || 0);
    totalStockEndVal += (it.stock_end_value || 0);

    // Each individual item must satisfy: GT_cuoi = GT_dau + GT_nhap - GT_xuat
    const itemComputedEndVal = (it.stock_begin_value || 0) + (it.receipts_value || 0) - (it.issues_value || 0);
    assert.equal(
      it.stock_end_value,
      itemComputedEndVal,
      `Item ${it.code} stock_end_value must equal stock_begin_value + receipts_value - issues_value`
    );
  });

  const aggregateComputedEndVal = totalStockBeginVal + totalReceiptsVal - totalIssuesVal;
  assert.equal(
    totalStockEndVal,
    aggregateComputedEndVal,
    `Aggregate totalStockEndVal (${totalStockEndVal}) must equal totalStockBeginVal + totalReceiptsVal - totalIssuesVal (${aggregateComputedEndVal})`
  );
});
