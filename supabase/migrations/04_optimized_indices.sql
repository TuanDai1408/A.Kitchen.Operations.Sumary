-- =========================================================================
-- A.KITCHEN DASHBOARD - OPTIMIZED INDICES FOR QUERY PERFORMANCE
-- Migration: 04_optimized_indices.sql
-- =========================================================================

-- 1. Index cho bảng transactions: tăng tốc lọc theo ngày và site
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_transactions_billing_site
  ON transactions (billing_date, ma_cua_hang);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_transactions_billing_ten_site
  ON transactions (billing_date, ten_cua_hang);

-- 2. Index cho bảng transactions_est: tăng tốc lọc theo ngày, site và kỳ
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_transactions_est_billing_site
  ON transactions_est (billing_date, ma_cua_hang);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_transactions_est_ky
  ON transactions_est (ky_uoc_tinh);

-- 3. Index cho bảng report: tăng tốc lọc overview, heatmap và pivot
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_report_ngay_site
  ON report (ngay_bao_cao, ten_site);

-- 4. Index cho mb51_material_docs: tăng tốc tính xuất nhập tồn theo ngày, site và sloc
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_mb51_mat_docs_posting_site_sloc
  ON mb51_material_docs (posting_date, site, stor_loc);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_mb51_mat_docs_material_posting
  ON mb51_material_docs (material, posting_date);

-- 5. Index cho kehoach_pl_thang: tăng tốc đối soát kế hoạch theo site và kỳ
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_kehoach_pl_thang_site_ky
  ON kehoach_pl_thang (site, ky);

-- 6. Index cho mb51_material_docs: tăng tốc tính hủy NVL theo movement type (551/552)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_mb51_mat_docs_posting_mov_site
  ON mb51_material_docs (posting_date, mov_type, site);

