import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("Site Daily Table - Detailed row expansion and performance fixes", () => {
  const scriptContent = fs.readFileSync("script.js", "utf8");
  const publicScriptContent = fs.readFileSync("public/script.js", "utf8");
  const styleContent = fs.readFileSync("style.css", "utf8");
  const publicStyleContent = fs.readFileSync("public/style.css", "utf8");

  // 1. Check parity between script.js and public/script.js
  assert.ok(scriptContent.includes("renderSiteDailyDetailHtml"), "script.js must contain renderSiteDailyDetailHtml");
  assert.ok(publicScriptContent.includes("renderSiteDailyDetailHtml"), "public/script.js must contain renderSiteDailyDetailHtml");

  // 2. Check table has tblSiteDaily ID and correct structure
  assert.ok(scriptContent.includes('id="tblSiteDaily"'), "Table must have id tblSiteDaily");
  assert.ok(scriptContent.includes('class="detail-row"'), "Table must render detail-row");
  assert.ok(scriptContent.includes('data-for-id='), "Detail-row must have data-for-id");

  // 3. Check groupRowsBySiteDate preserves _subRows and copies details
  assert.ok(scriptContent.includes("_subRows: []"), "groupRowsBySiteDate must initialize _subRows");
  assert.ok(scriptContent.includes("o._subRows.push"), "groupRowsBySiteDate must push to _subRows");
  assert.ok(scriptContent.includes("if (r.lyDoTre && !o.lyDoTre) o.lyDoTre = r.lyDoTre;"), "groupRowsBySiteDate must preserve lyDoTre");
  assert.ok(scriptContent.includes("if (r.tinhTrangNVL && !o.tinhTrangNVL) o.tinhTrangNVL = r.tinhTrangNVL;"), "groupRowsBySiteDate must preserve tinhTrangNVL");

  // 4. Verify no duplicate listener loop on tab-site
  assert.ok(!scriptContent.includes("document.getElementById('tab-site').addEventListener('click'"), "renderSite must NOT attach click listener to static tab-site");
  assert.ok(!publicScriptContent.includes("document.getElementById('tab-site').addEventListener('click'"), "public/script.js must NOT attach click listener to static tab-site");

  // 5. Verify direct DOM toggle using nextElementSibling
  assert.ok(scriptContent.includes("rx.nextElementSibling"), "script.js must use rx.nextElementSibling for fast O(1) DOM toggle");
  assert.ok(publicScriptContent.includes("rx.nextElementSibling"), "public/script.js must use rx.nextElementSibling for fast O(1) DOM toggle");

  // 6. Verify CSS sticky doesn't affect .detail-row
  assert.ok(styleContent.includes("tr:not(.detail-row) td:nth-child(1)"), "style.css must not apply sticky 32px to detail-row");
  assert.ok(styleContent.includes("tr:not(.detail-row) td:nth-child(2)"), "style.css must not apply sticky to detail-row col 2");
  assert.ok(styleContent.includes("tr.detail-row td"), "style.css must explicitly style detail-row td with position static");
  assert.ok(publicStyleContent.includes("tr:not(.detail-row) td:nth-child(1)"), "public/style.css must not apply sticky 32px to detail-row");
});
