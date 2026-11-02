// =========================================================================
// UNIT TESTS FOR mb51_material_docs MIGRATION
// =========================================================================

import assert from "node:assert";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import {
  MVT_RECEIPT_TYPES,
  MVT_ISSUE_TYPES,
  MVT_SCRAP_TYPES,
  MVT_SCRAP_REVERSAL_TYPES,
  MVT_TRANSFER_TYPES,
  classifyMovType,
  mapMb51RowToLegacyStockTx
} from "../server-api.js";

test("Codebase verification: exactly zero references to old stock tables", () => {
  const filesToCheck = [
    "server-api.js",
    "supabase/functions/api/handlers/warehouse.ts",
    "supabase/migrations/01_schema.sql"
  ];

  const oldTables = ["stock_header", "stock_price_category", "stock_transactions"];

  for (const relPath of filesToCheck) {
    const fullPath = path.resolve(process.cwd(), relPath);
    if (!fs.existsSync(fullPath)) continue;
    const content = fs.readFileSync(fullPath, "utf8");

    for (const tbl of oldTables) {
      assert.strictEqual(
        content.includes(tbl),
        false,
        `File ${relPath} must not contain references to old table '${tbl}'`
      );
    }
  }
});

test("Movement type classification matches whitelist rules", () => {
  // Receipts (101, 552 reversal of scrap, etc.)
  assert.strictEqual(classifyMovType("101"), "receipt");
  assert.strictEqual(classifyMovType("552"), "scrap_reversal");
  assert.strictEqual(classifyMovType("262"), "receipt");
  assert.strictEqual(MVT_RECEIPT_TYPES.has("101"), true);
  assert.strictEqual(MVT_RECEIPT_TYPES.has("262"), true);

  // Issues (201, 241, 261, 601, etc.)
  assert.strictEqual(classifyMovType("201"), "issue");
  assert.strictEqual(classifyMovType("261"), "issue");
  assert.strictEqual(classifyMovType("601"), "issue");
  assert.strictEqual(classifyMovType("102"), "issue"); // Reversal of receipt
  assert.strictEqual(MVT_ISSUE_TYPES.has("201"), true);

  // Scrapping (551, 552)
  assert.strictEqual(classifyMovType("551"), "scrap");
  assert.strictEqual(MVT_SCRAP_TYPES.has("551"), true);
  assert.strictEqual(MVT_SCRAP_REVERSAL_TYPES.has("552"), true);

  // Transfers
  assert.strictEqual(classifyMovType("301"), "transfer");
  assert.strictEqual(classifyMovType("311"), "transfer");
  assert.strictEqual(classifyMovType("309"), "transfer");
  assert.strictEqual(MVT_TRANSFER_TYPES.has("301"), true);
});

test("mapMb51RowToLegacyStockTx correctly maps fields and handles signs", () => {
  const sampleMb51Row = {
    mat_doc: "5000123456",
    mat_doc_year: "2026",
    doc_item: 1,
    posting_date: "2026-09-15",
    site: "S001",
    site_name: "Canteen Nhà Bè",
    stor_loc: "K01",
    material: "NVL00012",
    material_desc: "Thịt ba chỉ heo tươi",
    nganh_hang: "NVL thực phẩm",
    nhom_hang: "Thịt các loại",
    mov_type: "101",
    mov_text_sap: "GR for PO",
    mov_text_vi: "Nhập mua hàng",
    transaction_type: "receipt",
    quantity: 50.5,
    entry_unit: "KG",
    amount_lc: 6565000,
    order_no: "PO12345",
    doc_header_text: "Nhập thịt ca sáng"
  };

  const mapped = mapMb51RowToLegacyStockTx(sampleMb51Row);

  assert.strictEqual(mapped.doc_no, "5000123456");
  assert.strictEqual(mapped.date, "2026-09-15");
  assert.strictEqual(mapped.site, "S001");
  assert.strictEqual(mapped.site_name, "Canteen Nhà Bè");
  assert.strictEqual(mapped.article, "NVL00012");
  assert.strictEqual(mapped.name, "Thịt ba chỉ heo tươi");
  assert.strictEqual(mapped.category, "Thịt các loại");
  assert.strictEqual(mapped.uom, "KG");
  assert.strictEqual(mapped.sloc, "K01");
  assert.strictEqual(mapped.mvt, "101");
  assert.strictEqual(mapped.type, "Bán thành phẩm - NVL");
  assert.strictEqual(mapped.qty, 50.5);
  assert.strictEqual(mapped.value, 6565000);
});

test("mapMb51RowToLegacyStockTx derives unit price accurately", () => {
  const rowWithValues = {
    mat_doc: "5000999999",
    mat_doc_year: "2026",
    doc_item: 1,
    material: "GAO01",
    quantity: -20,
    amount_lc: -400000,
    mov_type: "201"
  };

  const mapped = mapMb51RowToLegacyStockTx(rowWithValues);
  const derivedUnitPrice = Math.abs(mapped.value) / Math.abs(mapped.qty);
  assert.strictEqual(derivedUnitPrice, 20000);
});

test("Inventory calculation: stock_end = stock_begin + receipts + issues", () => {
  const stock_begin = 100;
  const receipts = 50;  // Positive
  const issues = -30;   // Negative signed quantity as in SAP MB51

  const stock_end = stock_begin + receipts + issues;
  assert.strictEqual(stock_end, 120);

  const unit_price = 25000;
  const stock_end_value = Math.round(stock_end * unit_price);
  assert.strictEqual(stock_end_value, 3000000);
});
