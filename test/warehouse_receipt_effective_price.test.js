import test from "node:test";
import assert from "node:assert";
import {
  mapMb51RowToLegacyStockTx,
  buildIssuePriceIndex,
  resolveIssueReferencePrice,
  enrichTransactionsWithEffectiveReceiptPrices
} from "../server-api.js";

test("Derives effective receipt price from issues using weighted average", () => {
  // Line 1: Issue 10 kg, amount -100,000 (Unit price = 10,000)
  // Line 2: Issue 20 kg, amount -400,000 (Unit price = 20,000)
  // Weighted avg unit price = (100,000 + 400,000) / (10 + 20) = 500,000 / 30 = 16,667 VND/kg
  const transactions = [
    {
      article: "NVL_BO",
      material: "NVL_BO",
      site: "K003",
      sloc: "KL01",
      qty: -10,
      quantity: -10,
      value: -100000,
      amount_lc: -100000,
      mov_type: "201"
    },
    {
      article: "NVL_BO",
      material: "NVL_BO",
      site: "K003",
      sloc: "KL01",
      qty: -20,
      quantity: -20,
      value: -400000,
      amount_lc: -400000,
      mov_type: "201"
    },
    // Receipt line with amount_lc = 0
    {
      article: "NVL_BO",
      material: "NVL_BO",
      site: "K003",
      sloc: "KL01",
      qty: 15,
      quantity: 15,
      value: 0,
      amount_lc: 0,
      mov_type: "101"
    }
  ];

  enrichTransactionsWithEffectiveReceiptPrices(transactions);

  const receipt = transactions[2];
  assert.strictEqual(receipt.is_estimated_price, true);
  assert.strictEqual(receipt.unit_price_ref, 16667);
  assert.strictEqual(receipt.value, 16667 * 15); // 250,005
  assert.strictEqual(receipt.amount_lc_effective, 250005);
  assert.strictEqual(receipt.qty, 15); // quantity untouched
});

test("Receipts with non-zero amount_lc remain untouched", () => {
  const transactions = [
    {
      article: "NVL_GA",
      site: "D007",
      sloc: "RL01",
      qty: -10,
      value: -100000,
      amount_lc: -100000,
      mov_type: "201"
    },
    {
      article: "NVL_GA",
      site: "D007",
      sloc: "RL01",
      qty: 10,
      value: 120000,
      amount_lc: 120000,
      mov_type: "101"
    }
  ];

  enrichTransactionsWithEffectiveReceiptPrices(transactions);

  const receipt = transactions[1];
  assert.strictEqual(receipt.is_estimated_price, false);
  assert.strictEqual(receipt.value, 120000);
  assert.strictEqual(receipt.amount_lc, 120000);
});

test("Excludes mov_type 551 (scrap) and mov_type 261 (GI for order) from regular issue unit price", () => {
  const transactions = [
    // 551 disposal - must NEVER be used for pricing
    {
      article: "NVL_HEO",
      site: "K003",
      sloc: "KL01",
      qty: -5,
      value: -500000, // 100,000/kg (inflated/distorted)
      amount_lc: -500000,
      mov_type: "551"
    },
    // 261 production order issue
    {
      article: "NVL_HEO",
      site: "K003",
      sloc: "KL01",
      qty: -20,
      value: -1600000, // 80,000/kg
      amount_lc: -1600000,
      mov_type: "261"
    },
    // Regular issue 201 - should be the SOLE source of regular price
    {
      article: "NVL_HEO",
      site: "K003",
      sloc: "KL01",
      qty: -10,
      value: -500000, // 50,000/kg
      amount_lc: -500000,
      mov_type: "201"
    },
    // Receipt with amount_lc = 0
    {
      article: "NVL_HEO",
      site: "K003",
      sloc: "KL01",
      qty: 10,
      value: 0,
      amount_lc: 0,
      mov_type: "101"
    }
  ];

  enrichTransactionsWithEffectiveReceiptPrices(transactions);

  const receipt = transactions[3];
  assert.strictEqual(receipt.is_estimated_price, true);
  // Must match the regular issue 201 price (50,000), NOT 551 (100k) and NOT 261 (80k)
  assert.strictEqual(receipt.unit_price_ref, 50000);
  assert.strictEqual(receipt.value, 500000);
});

test("Sloc normalization: RL01 and KL01 belong to same logical warehouse (Kho hàng hóa)", () => {
  const transactions = [
    // Issue was recorded in RL01
    {
      article: "NVL_RAU",
      site: "D007",
      sloc: "RL01",
      qty: -10,
      value: -300000, // 30,000/kg
      amount_lc: -300000,
      mov_type: "201"
    },
    // Receipt was recorded in KL01 at same site D007 with 0 amount
    {
      article: "NVL_RAU",
      site: "D007",
      sloc: "KL01",
      qty: 8,
      value: 0,
      amount_lc: 0,
      mov_type: "101"
    }
  ];

  enrichTransactionsWithEffectiveReceiptPrices(transactions);

  const receipt = transactions[1];
  assert.strictEqual(receipt.is_estimated_price, true);
  assert.strictEqual(receipt.unit_price_ref, 30000);
  assert.strictEqual(receipt.value, 240000);
});

test("Fallback hierarchy: site -> across sites -> prior rows", () => {
  // Scenario 1: Issue exists in another site
  const transactionsAcrossSite = [
    {
      article: "NVL_NAM",
      site: "K003",
      sloc: "KL01",
      qty: -10,
      value: -200000, // 20,000/kg
      amount_lc: -200000,
      mov_type: "201"
    },
    // Receipt in site D007 with zero amount
    {
      article: "NVL_NAM",
      site: "D007",
      sloc: "RL01",
      qty: 5,
      value: 0,
      amount_lc: 0,
      mov_type: "101"
    }
  ];

  enrichTransactionsWithEffectiveReceiptPrices(transactionsAcrossSite);
  assert.strictEqual(transactionsAcrossSite[1].unit_price_ref, 20000);
  assert.strictEqual(transactionsAcrossSite[1].value, 100000);

  // Scenario 2: No issues in period, but issue exists in prior rows
  const transactionsNoIssue = [
    {
      article: "NVL_CA",
      site: "D007",
      sloc: "RL01",
      qty: 4,
      value: 0,
      amount_lc: 0,
      mov_type: "101"
    }
  ];

  const priorRows = [
    {
      material: "NVL_CA",
      site: "D007",
      stor_loc: "RL01",
      quantity: -10,
      amount_lc: -450000, // 45,000/kg
      mov_type: "201"
    }
  ];

  enrichTransactionsWithEffectiveReceiptPrices(transactionsNoIssue, priorRows);
  assert.strictEqual(transactionsNoIssue[0].unit_price_ref, 45000);
  assert.strictEqual(transactionsNoIssue[0].value, 180000);
});

test("Handles no matching issues without throwing or producing NaN/Infinity", () => {
  const transactions = [
    {
      article: "NVL_UNKNOWN",
      site: "K003",
      sloc: "KL01",
      qty: 10,
      value: 0,
      amount_lc: 0,
      mov_type: "101"
    }
  ];

  enrichTransactionsWithEffectiveReceiptPrices(transactions, []);
  assert.strictEqual(transactions[0].is_estimated_price, false);
  assert.strictEqual(transactions[0].value, 0);
  assert.strictEqual(isNaN(transactions[0].value), false);
});
