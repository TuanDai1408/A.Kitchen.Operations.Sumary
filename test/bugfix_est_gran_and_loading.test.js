import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

test("Bug 1 - Server API: getRevenueEstSummary supports granular and calculates correct date ranges", async (t) => {
  const serverApi = await import("../server-api.js");
  assert.equal(typeof serverApi.getRevenueEstSummary, "function");

  // Test granular = 'month'
  const resMonth = await serverApi.getRevenueEstSummary({ granular: "month", recentBuckets: 4 });
  assert.equal(resMonth.ok, true);
  assert.equal(resMonth.isSummary, true);
  assert.ok(Array.isArray(resMonth.rows));
  assert.ok(resMonth.rows.length > 0);

  const months = [...new Set(resMonth.rows.map(r => r.ngay.slice(0, 7)))].sort();
  assert.ok(months.length >= 2, `Expected at least 2 distinct months, got ${months.length}: ${months.join(", ")}`);
  assert.ok(months.includes("2026-11"), "Should include 2026-11");
  assert.ok(months.includes("2026-10"), "Should include 2026-10");

  // Dims should contain dates and allDates
  assert.ok(Array.isArray(resMonth.dims.dates));
  assert.ok(Array.isArray(resMonth.dims.allDates));
  assert.ok(resMonth.dims.dates.length > 0);

  // Test granular = 'quarter'
  const resQ = await serverApi.getRevenueEstSummary({ granular: "quarter", recentBuckets: 4 });
  assert.equal(resQ.ok, true);
  assert.ok(resQ.rows.length > 0);
  const qMonths = [...new Set(resQ.rows.map(r => r.ngay.slice(0, 7)))].sort();
  assert.ok(qMonths.length >= 4, `Expected at least 4 distinct months in 4 quarters, got ${qMonths.length}`);

  // Test granular = 'week'
  const resW = await serverApi.getRevenueEstSummary({ granular: "week", recentBuckets: 4 });
  assert.equal(resW.ok, true);
  assert.ok(resW.rows.length > 0);
  const wDates = [...new Set(resW.rows.map(r => r.ngay))].sort();
  const dDiffDays = (new Date(wDates[wDates.length - 1]) - new Date(wDates[0])) / 86400000;
  assert.ok(dDiffDays <= 35, `4 weeks should span around 28 days, got ${dDiffDays}`);
});

test("Bug 1 - Client script.js: Granular state, cache clearance, and X-axis format", (t) => {
  const scriptContent = fs.readFileSync(path.join(rootDir, "script.js"), "utf8");

  // 1. granBox click handler sets state first, clears cache, updates dropdown, and calls loadRevenueEst
  assert.ok(scriptContent.includes("RF_EST.gran = newGran;"), "RF_EST.gran must be set before loading");
  assert.ok(scriptContent.includes("RF_EST.siteMetricGran = newGran;"), "RF_EST.siteMetricGran must be synchronized with gran");
  assert.ok(scriptContent.includes("clearAPICache('getRevenueEstSummary');"), "Must clear API cache on granular change");
  assert.ok(scriptContent.includes("loadRevenueEst({ force: true, granular: newGran, recentBuckets: 4 });"), "Must re-fetch with new granular");

  // 2. loadRevenueEst passes granular param
  assert.ok(scriptContent.includes("var estParams = { granular: gran };"), "loadRevenueEst must pass granular in params");

  // 3. X-axis chart format: month -> MM/YYYY (no W36/W37)
  assert.ok(scriptContent.includes("lbl = k ? (k.substring(5, 7) + '/' + k.substring(0, 4)) : '';"), "Month X-axis label must format as MM/YYYY");
  assert.ok(scriptContent.includes("lbl = 'Q' + q.quarter + '/' + q.year;"), "Quarter X-axis label must format as Q{q}/{year}");
});

test("Bug 2 - Client script.js: Loading tied to Promise, watchdog safe, no premature setTimeout", (t) => {
  const scriptContent = fs.readFileSync(path.join(rootDir, "script.js"), "utf8");

  // 1. No premature 3.5s timeout in akShowLoading
  assert.ok(!scriptContent.includes("akLoadingTimeout = setTimeout(function() {\n    akHideLoading();\n  }, 3500);"), "Premature 3.5s auto-hide timeout must be removed");

  // 2. No 280ms fixed setTimeout in renderRevenueEst
  assert.ok(!scriptContent.includes("setTimeout(function(){\n      akHideLoading();"), "Fixed setTimeout 280ms in renderRevenueEst must be removed");

  // 3. _tabLoadSeq is present
  assert.ok(scriptContent.includes("var _tabLoadSeq = {"), "Must have _tabLoadSeq defined");

  // 4. Loading is hidden in .finally() block across tabs
  assert.ok(scriptContent.includes(".finally(function () {"), "loadFoodcostData must use finally block");
  assert.ok(/finally\s*\(\s*function\s*\(\)\s*\{[\s\S]*?seq\s*===\s*_tabLoadSeq\[tabKey\][\s\S]*?akHideLoading/.test(scriptContent), "loadRevenueEst must use finally block with seq check");
  assert.ok(/finally\s*\(\s*function\s*\(\)\s*\{[\s\S]*?seq\s*===\s*_tabLoadSeq\.overview[\s\S]*?akHideLoading/.test(scriptContent), "loadData must use finally block with seq check");
});
