import test from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import * as api from "../server-api.js";

test("Site Đa Phúc converts suat_luu_mau to suatLuuMauTruong while other sites use suatLuuMauSite", async () => {
  // Test exportSiteDailyPivotExcel with custom rows
  const mockRows = [
    {
      tenSite: "MB A.Kitchen - Hub Đa Phúc",
      ngayBaoCao: "2026-11-20",
      tenKhachHang: "Trường Tiểu học Đa Phúc",
      suatSang: 100,
      suatTrua: 200,
      suatChieu: 50,
      suatNhanVien: 10,
      suatHuy: 0,
      suatLuuMau: 5,
      suatGiaoVien: 15,
      tongSuat: 360,
      soThatThoat: 2
    },
    {
      tenSite: "MB A.Kitchen - Bếp Tân Long",
      ngayBaoCao: "2026-11-20",
      tenKhachHang: "Canteen Tân Long",
      suatSang: 50,
      suatTrua: 150,
      suatChieu: 0,
      suatNhanVien: 5,
      suatHuy: 2,
      suatLuuMau: 4,
      suatGiaoVien: 0,
      tongSuat: 205,
      soThatThoat: 0
    }
  ];

  const res = await api.exportSiteDailyPivotExcel({ rows: mockRows });
  assert.equal(res.ok, true);
  assert.ok(res.data && res.data.length > 0);
  assert.equal(res.rowCount, 2);

  // Test removeVietnameseTones and accent-free filename
  assert.equal(api.removeVietnameseTones("MB A.Kitchen - Hub Đa Phúc"), "MB_A_Kitchen_Hub_Da_Phuc");
  assert.equal(api.removeVietnameseTones("Bếp Tân Long"), "Bep_Tan_Long");

  const resDaPhuc = await api.exportSiteDailyPivotExcel({ site: "MB A.Kitchen - Hub Đa Phúc", rows: mockRows });
  assert.ok(resDaPhuc.name.includes("Hub_Da_Phuc"), "Filename must be accent-free: Hub_Da_Phuc");
  assert.ok(!/[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđĐ]/.test(resDaPhuc.name), "Filename must not contain any accented characters");

  // Parse Excel buffer back with ExcelJS to inspect cells
  const buffer = Buffer.from(res.data, "base64");
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);

  const ws = wb.getWorksheet("BaoCaoSuatAnPivot");
  assert.ok(ws, "Sheet BaoCaoSuatAnPivot must exist");

  // Check Sheet 2 exists (Executive Pivot Summary)
  const ws2 = wb.getWorksheet("TongHopTheoSite") || wb.getWorksheet("TongHopTheoKhachHang");
  assert.ok(ws2, "Summary sheet 2 must exist");

  // Check Executive Banner & Metadata (Rows 1-3)
  const r1 = ws.getCell("A1");
  assert.ok(r1.value.includes("BÁO CÁO PIVOT"), "Row 1 must have report title");
  assert.equal(r1.font.name, "Aptos");
  assert.equal(r1.font.bold, true);

  const kpiRow = ws.getRow(3);
  assert.ok(kpiRow.getCell(1).value.includes("TỔNG CỘNG"), "Row 3 must have KPI summary banner");

  // Check columns headers (Row 5)
  const headerRow = ws.getRow(5);
  assert.equal(headerRow.getCell(1).value, "Ngày báo cáo");
  assert.equal(headerRow.getCell(2).value, "Site / Bếp");
  assert.equal(headerRow.getCell(3).value, "Khách hàng / Điểm ăn");
  assert.equal(headerRow.getCell(9).value, "Lưu mẫu tại trường");
  assert.equal(headerRow.getCell(10).value, "Lưu mẫu tại site");

  // Check Aptos font on header
  assert.equal(headerRow.getCell(1).font.name, "Aptos");
  assert.equal(headerRow.getCell(1).font.size, 11);
  assert.equal(headerRow.getCell(1).font.bold, true);
  assert.equal(headerRow.getCell(1).fill.fgColor.argb, "FF1F4E79");

  // Data rows start at Row 6
  let daPhucRow = null;
  let tanLongRow = null;
  ws.eachRow((row, rowNumber) => {
    if (rowNumber <= 5) return;
    const siteVal = row.getCell(2).value;
    if (siteVal && siteVal.includes("Đa Phúc")) daPhucRow = row;
    if (siteVal && siteVal.includes("Tân Long")) tanLongRow = row;
  });

  assert.ok(daPhucRow, "Đa Phúc row must be present");
  assert.ok(tanLongRow, "Tân Long row must be present");

  // Đa Phúc: LM tại trường = 5, LM tại site = 0
  assert.equal(daPhucRow.getCell(9).value, 5, "Đa Phúc must have Lưu mẫu tại trường = 5");
  assert.equal(daPhucRow.getCell(10).value, 0, "Đa Phúc must have Lưu mẫu tại site = 0");

  // Tân Long: LM tại trường = 0, LM tại site = 4
  assert.equal(tanLongRow.getCell(9).value, 0, "Tân Long must have Lưu mẫu tại trường = 0");
  assert.equal(tanLongRow.getCell(10).value, 4, "Tân Long must have Lưu mẫu tại site = 4");

  // Check Aptos font on data cells
  assert.equal(daPhucRow.getCell(1).font.name, "Aptos");
  assert.equal(daPhucRow.getCell(1).font.size, 11);
  assert.equal(daPhucRow.getCell(9).font.name, "Aptos");
  assert.equal(daPhucRow.getCell(9).font.size, 11);

  // Total row at bottom (Row 8)
  const totalRow = ws.getRow(8);
  assert.equal(totalRow.getCell(1).value, "TỔNG CỘNG");
  assert.equal(totalRow.getCell(1).font.name, "Aptos");
  assert.equal(totalRow.getCell(1).font.size, 11);
  assert.equal(totalRow.getCell(1).font.bold, true);
  assert.equal(totalRow.getCell(9).value.result, 5, "Total LM trường formula result = 5");
  assert.equal(totalRow.getCell(10).value.result, 4, "Total LM site formula result = 4");

  // Sheet 2: Check Row 1 title and Row 4 header
  const s2r1 = ws2.getCell("A1");
  assert.ok(s2r1.value.includes("BẢNG TỔNG HỢP"), "Sheet 2 Row 1 must have title");
  assert.equal(s2r1.font.name, "Aptos");
  const s2HeaderRow = ws2.getRow(4);
  assert.equal(s2HeaderRow.getCell(1).value, "Site / Hub bếp ăn");
  assert.equal(s2HeaderRow.getCell(1).font.name, "Aptos");
  assert.equal(s2HeaderRow.getCell(1).font.size, 11);
});
