import test from "node:test";
import assert from "node:assert/strict";

import {
  PORTION_SITE_RULES,
  isSiteK003,
  isSiteD007,
  getPortionFactor,
  normalizePortionQty
} from "../shared/portion-config.js";

test("Site recognition for K003 and D007", () => {
  assert.equal(isSiteK003("K003"), true);
  assert.equal(isSiteK003("A.Kitchen - Miền Nam"), true);
  assert.equal(isSiteK003("A.Kitchen - Mien Nam"), true);
  assert.equal(isSiteK003("K001"), false);

  assert.equal(isSiteD007("D007"), true);
  assert.equal(isSiteD007("MN Kho Megafarrm"), true);
  assert.equal(isSiteD007("Megafarm"), true);
  assert.equal(isSiteD007("K001"), false);
});

test("Portion factor for K003 (BTP Hub)", () => {
  // 1 KG BTP = 10 portion meals (100g = 1 portion)
  assert.equal(getPortionFactor("K003", "KG"), 10);
  assert.equal(getPortionFactor("A.Kitchen - Miền Nam", "KG"), 10);
  assert.equal(getPortionFactor("K003", "PHA"), 1);
  assert.equal(getPortionFactor("K003", "SUAT"), 1);
  assert.equal(getPortionFactor("K003", "CHY"), 0);
  assert.equal(getPortionFactor("K003", "CHUYEN"), 0);
  assert.equal(getPortionFactor("K003", "TUI"), 0);
  assert.equal(getPortionFactor("K003", ""), 10); // default
});

test("Portion factor for D007 (Megafarrm)", () => {
  // Agricultural raw produce KG = 10 portions
  assert.equal(getPortionFactor("D007", "KG"), 10);
  assert.equal(getPortionFactor("MN Kho Megafarrm", "KG"), 10);
  assert.equal(getPortionFactor("D007", "PHA"), 1);
  assert.equal(getPortionFactor("D007", "SUAT"), 1);

  // Packaging and non-food units must be 0 portions
  const packagingUnits = [
    "CHA", "MIE", "VI", "BIC", "CAY", "GOI",
    "CAN", "BAO", "TUI", "HU", "TRA", "HOP", "KHA", "CHY"
  ];
  for (const u of packagingUnits) {
    assert.equal(getPortionFactor("D007", u), 0, `Unit ${u} for D007 should have factor 0`);
  }
});

test("Portion factor for standard canteen sites", () => {
  assert.equal(getPortionFactor("K001", "PHA"), 1);
  assert.equal(getPortionFactor("K001", "SUAT"), 1);
  assert.equal(getPortionFactor("K001", "KG"), 10);
  assert.equal(getPortionFactor("K001", "CHY"), 0);
  assert.equal(getPortionFactor("K001", "LON"), 0);
});

test("normalizePortionQty with primitive args", () => {
  assert.equal(normalizePortionQty(25.5, "K003", "KG"), 255);
  assert.equal(normalizePortionQty(120, "K001", "PHA"), 120);
  assert.equal(normalizePortionQty(50, "D007", "CHA"), 0);
  assert.equal(normalizePortionQty(15, "D007", "KG"), 150);
});

test("normalizePortionQty with row objects (Foodcost & Est schema)", () => {
  // Row like transactions
  const txK003 = {
    maSite: "K003",
    soLuong: 100,
    dvt: "KG"
  };
  assert.equal(normalizePortionQty(txK003), 1000);

  // Return row
  const txReturn = {
    maSite: "K003",
    soLuong: 10,
    dvt: "KG",
    isReturn: true
  };
  assert.equal(normalizePortionQty(txReturn), -100);

  // Row like transactions_est
  const estD007 = {
    site: "MN Kho Megafarrm",
    so_luong: 80,
    entry_unit: "KG"
  };
  assert.equal(normalizePortionQty(estD007), 800);

  // Row like D007 packaging
  const estD007Pkg = {
    site: "MN Kho Megafarrm",
    so_luong: 500,
    dvt: "BIC"
  };
  assert.equal(normalizePortionQty(estD007Pkg), 0);
});

test("Equivalence between Foodcost and Doanh thu uoc tinh calculations for K003 and D007", () => {
  const sampleDataK003 = [
    { maSite: "K003", site: "A.Kitchen - Miền Nam", soLuong: 500, dvt: "KG", thanhTien: 50000000 },
    { maSite: "K003", site: "A.Kitchen - Miền Nam", soLuong: 30, dvt: "CHY", thanhTien: 3000000 },
    { maSite: "K003", site: "A.Kitchen - Miền Nam", soLuong: 200, dvt: "KG", thanhTien: 20000000 }
  ];

  // Foodcost calculation logic:
  // qtyKG * 10
  const fcKg = sampleDataK003.filter(r => r.dvt === 'KG').reduce((s, r) => s + r.soLuong, 0);
  const fcPortions = fcKg * 10; // 700 * 10 = 7000

  // Standardized helper calculation (used in Doanh thu uoc tinh, Pivot, etc.)
  let estPortions = 0;
  sampleDataK003.forEach(r => {
    estPortions += normalizePortionQty(r.soLuong, r.maSite, r.dvt);
  });

  assert.equal(estPortions, fcPortions);
  assert.equal(estPortions, 7000);

  const sampleDataD007 = [
    { maSite: "D007", site: "MN Kho Megafarrm", soLuong: 150, dvt: "KG", thanhTien: 15000000 },
    { maSite: "D007", site: "MN Kho Megafarrm", soLuong: 400, dvt: "BIC", thanhTien: 400000 },
    { maSite: "D007", site: "MN Kho Megafarrm", soLuong: 200, dvt: "CHA", thanhTien: 600000 },
    { maSite: "D007", site: "MN Kho Megafarrm", soLuong: 50, dvt: "KG", thanhTien: 5000000 }
  ];

  const fcKgD007 = sampleDataD007.filter(r => r.dvt === 'KG').reduce((s, r) => s + r.soLuong, 0);
  const fcPortionsD007 = fcKgD007 * 10; // 200 * 10 = 2000

  let estPortionsD007 = 0;
  sampleDataD007.forEach(r => {
    estPortionsD007 += normalizePortionQty(r.soLuong, r.maSite, r.dvt);
  });

  assert.equal(estPortionsD007, fcPortionsD007);
  assert.equal(estPortionsD007, 2000);
});
