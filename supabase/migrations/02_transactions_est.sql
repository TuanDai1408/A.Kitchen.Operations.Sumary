-- =========================================================================
-- A.KITCHEN DASHBOARD - TRANSACTIONS_EST SCHEMA & POLICIES
-- Migration: 02_transactions_est.sql
-- Bảng lưu trữ doanh thu ước tính và đối soát kế hoạch P&L
-- =========================================================================

CREATE TABLE IF NOT EXISTS transactions_est (
  id BIGSERIAL PRIMARY KEY,
  vung_mien TEXT,
  loai_cua_hang TEXT,
  ma_cua_hang TEXT,
  ten_cua_hang TEXT NOT NULL,
  ma_kh TEXT,
  ten_kh TEXT,
  nganh_hang TEXT,
  nhom_sp TEXT,
  ma_sp TEXT,
  ten_sp TEXT,
  so_hoa_don TEXT,
  ngay_tao_billing DATE,
  reference TEXT,
  so_luong NUMERIC NOT NULL DEFAULT 0,
  dvt TEXT,
  don_gia_khong_thue NUMERIC DEFAULT 0,
  don_gia_co_thue_ck NUMERIC DEFAULT 0,
  tien_te TEXT DEFAULT 'VND',
  ck_sau_thue NUMERIC DEFAULT 0,
  phan_tram_thue NUMERIC DEFAULT 0,
  tien_thue NUMERIC DEFAULT 0,
  thanh_tien_truoc_thue NUMERIC NOT NULL DEFAULT 0,
  tong_tien_billing NUMERIC NOT NULL DEFAULT 0,
  gia_von NUMERIC NOT NULL DEFAULT 0,
  billing_date DATE NOT NULL,
  loai_chung_tu_billing TEXT,
  so_chung_tu_billing TEXT,
  trang_thai_billing TEXT,
  loai_chung_tu_giao_hang TEXT,
  so_don_hang TEXT,
  trang_thai_so TEXT,
  tk_doanh_thu TEXT,
  tk_cong_no TEXT,
  thoi_han_thanh_toan TEXT,
  nv_kinh_doanh TEXT,
  hinh_thuc_thanh_toan TEXT,
  ly_do_tra_hang TEXT,
  so_billing_goc TEXT,
  kenh_ban_hang TEXT,
  ten_kenh_ban_hang TEXT,
  ck_truoc_thue NUMERIC DEFAULT 0,
  don_gia_co_thue_tru_ck NUMERIC DEFAULT 0,
  so_hddt_goc TEXT,
  is_estimate BOOLEAN DEFAULT true,
  ky_uoc_tinh TEXT,
  nguon_uoc_tinh TEXT,
  ghi_chu TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_transactions_est_billing_date ON transactions_est (billing_date DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_est_site ON transactions_est (ten_cua_hang);
CREATE INDEX IF NOT EXISTS idx_transactions_est_vung ON transactions_est (vung_mien);
CREATE INDEX IF NOT EXISTS idx_transactions_est_loai ON transactions_est (loai_cua_hang);

-- Policy & Permissions: cho phép đọc
ALTER TABLE transactions_est ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'transactions_est' AND policyname = 'Allow read transactions_est'
  ) THEN
    CREATE POLICY "Allow read transactions_est" ON transactions_est FOR SELECT USING (true);
  END IF;
END $$;
