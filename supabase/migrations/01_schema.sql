-- =========================================================================
-- A.KITCHEN DASHBOARD - POSTGRESQL SCHEMA FOR SUPABASE
-- Migration: 01_schema.sql
-- =========================================================================

-- Enable pgcrypto / uuid-ossp if needed
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. DATA VERSION & AUDIT
CREATE TABLE IF NOT EXISTS data_version (
  id SERIAL PRIMARY KEY,
  version TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  server_time TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed initial version record
INSERT INTO data_version (id, version, updated_at, server_time)
VALUES (1, '1.0.0', now(), now())
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS access_log (
  id BIGSERIAL PRIMARY KEY,
  action TEXT NOT NULL,
  token_used TEXT,
  params JSONB DEFAULT '{}'::jsonb,
  ip TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_access_log_created_at ON access_log (created_at DESC);

-- 2. REPORT: Báo cáo vận hành hàng ngày theo site
CREATE TABLE IF NOT EXISTS report (
  id BIGSERIAL PRIMARY KEY,
  dau_thoi_gian TIMESTAMPTZ DEFAULT now(),
  ten_site TEXT NOT NULL,
  ngay_bao_cao DATE NOT NULL,
  nguoi_bao_cao TEXT,
  suat_sang NUMERIC NOT NULL DEFAULT 0,
  suat_trua NUMERIC NOT NULL DEFAULT 0,
  suat_chieu NUMERIC NOT NULL DEFAULT 0,
  suat_nhan_vien NUMERIC NOT NULL DEFAULT 0,
  suat_huy NUMERIC NOT NULL DEFAULT 0,
  tong_suat NUMERIC NOT NULL DEFAULT 0,
  ten_khach_hang TEXT,
  suat_luu_mau NUMERIC NOT NULL DEFAULT 0,
  suat_giao_vien NUMERIC NOT NULL DEFAULT 0,
  gio_giao TEXT,
  giao_tre BOOLEAN DEFAULT false,
  phut_tre NUMERIC DEFAULT 0,
  ly_do_tre TEXT,
  tinh_trang_nvl TEXT,
  nvl_bat_thuong BOOLEAN DEFAULT false,
  su_co_thiet_bi TEXT,
  so_that_thoat NUMERIC NOT NULL DEFAULT 0,
  nguyen_nhan_that_thoat TEXT,
  ns_co_mat NUMERIC NOT NULL DEFAULT 0,
  ns_vang NUMERIC NOT NULL DEFAULT 0,
  ns_tang_ca NUMERIC NOT NULL DEFAULT 0,
  su_co_nhan_su TEXT,
  so_khieu_nai NUMERIC NOT NULL DEFAULT 0,
  so_khen_ngoi NUMERIC NOT NULL DEFAULT 0,
  phan_loai_kn TEXT,
  muc_do_nghiem_trong TEXT,
  chi_tiet_y_kien TEXT,
  so_tien_ly_do_chi_phi TEXT,
  co_chi_phi_ngoai BOOLEAN DEFAULT false,
  so_tien_chi_phi NUMERIC NOT NULL DEFAULT 0,
  ly_do_chi_phi TEXT,
  hinh_anh TEXT,
  de_xuat TEXT,
  muc_do_van_de INTEGER DEFAULT 0,
  diem_van_de INTEGER DEFAULT 0,
  ly_do_van_de TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_report_ngay_bao_cao ON report (ngay_bao_cao DESC);
CREATE INDEX IF NOT EXISTS idx_report_site_ngay ON report (ten_site, ngay_bao_cao DESC);
CREATE INDEX IF NOT EXISTS idx_report_nguoi_bao_cao ON report (nguoi_bao_cao);
CREATE INDEX IF NOT EXISTS idx_report_ten_khach_hang ON report (ten_khach_hang);

-- 3. TRANSACTIONS: Dữ liệu hóa đơn / bán hàng / food cost
CREATE TABLE IF NOT EXISTS transactions (
  id BIGSERIAL PRIMARY KEY,
  ten_cua_hang TEXT NOT NULL,
  ma_cua_hang TEXT NOT NULL,
  ten_khach_hang TEXT,
  billing_date DATE NOT NULL,
  so_luong NUMERIC NOT NULL DEFAULT 0,
  dvt TEXT,
  thanh_tien_truoc_thue NUMERIC NOT NULL DEFAULT 0,
  chiet_khau NUMERIC NOT NULL DEFAULT 0,
  thanh_tien NUMERIC NOT NULL DEFAULT 0,
  gia_von NUMERIC NOT NULL DEFAULT 0,
  nhom_sp TEXT,
  nganh_hang TEXT,
  kenh_ban_hang TEXT,
  nv_kinh_doanh TEXT,
  ten_sp TEXT,
  so_hoa_don TEXT,
  so_billing_goc TEXT,
  loai_chung_tu_billing TEXT,
  ly_do_tra_hang TEXT,
  is_return BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_transactions_billing_date ON transactions (billing_date DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_ten_cua_hang ON transactions (ten_cua_hang);
CREATE INDEX IF NOT EXISTS idx_transactions_ma_cua_hang ON transactions (ma_cua_hang);
CREATE INDEX IF NOT EXISTS idx_transactions_kenh ON transactions (kenh_ban_hang);
CREATE INDEX IF NOT EXISTS idx_transactions_nhom_sp ON transactions (nhom_sp);

-- 4. OPEX INPUT: Chi phí vận hành theo site và kỳ
CREATE TABLE IF NOT EXISTS opex_input (
  id BIGSERIAL PRIMARY KEY,
  site TEXT NOT NULL,
  period TEXT NOT NULL, -- 'YYYY-MM' hoặc 'ALL'
  amount NUMERIC NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_opex_site_period ON opex_input (site, period);

-- 5. DISPOSAL OF GOODS: Hủy hàng hóa NVL / BTP
CREATE TABLE IF NOT EXISTS disposal_of_goods (
  id BIGSERIAL PRIMARY KEY,
  ngay_lap DATE NOT NULL,
  ten_site TEXT NOT NULL,
  ma_site TEXT,
  ma_code TEXT,
  ten_sp TEXT,
  loai_hang TEXT,
  qty_kg NUMERIC NOT NULL DEFAULT 0,
  don_gia NUMERIC NOT NULL DEFAULT 0,
  value NUMERIC GENERATED ALWAYS AS (qty_kg * don_gia) STORED,
  ly_do TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_disposal_ngay_lap ON disposal_of_goods (ngay_lap DESC);
CREATE INDEX IF NOT EXISTS idx_disposal_ten_site ON disposal_of_goods (ten_site);

-- 6. KẾ HOẠCH DỰ ÁN, P&L VÀ THAM SỐ
CREATE TABLE IF NOT EXISTS kehoach_duan (
  id SERIAL PRIMARY KEY,
  site TEXT NOT NULL UNIQUE,
  ten_du_an TEXT,
  quan_ly TEXT,
  ngay_trinh TEXT,
  version TEXT,
  tong_san_luong_12t NUMERIC DEFAULT 0,
  tong_doanh_thu_12t NUMERIC DEFAULT 0,
  gross_margin_pct NUMERIC DEFAULT 0,
  ebitda_12t NUMERIC DEFAULT 0,
  ebitda_margin_pct NUMERIC DEFAULT 0,
  hoan_von_thang NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS kehoach_pl_thang (
  id SERIAL PRIMARY KEY,
  site TEXT NOT NULL,
  period TEXT NOT NULL, -- e.g. '2025-01'
  period_label TEXT,    -- e.g. 'Tháng 01/2025'
  doanh_thu_plan NUMERIC DEFAULT 0,
  san_luong_plan NUMERIC DEFAULT 0,
  food_cost_plan_val NUMERIC DEFAULT 0,
  lai_gop_plan NUMERIC DEFAULT 0,
  vat_tu_tieu_hao_plan NUMERIC DEFAULT 0,
  ebitda_plan NUMERIC DEFAULT 0,
  huy_pct_plan NUMERIC DEFAULT 1.5,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_kehoach_pl_site_period ON kehoach_pl_thang (site, period);

CREATE TABLE IF NOT EXISTS kehoach_thamso (
  id SERIAL PRIMARY KEY,
  site TEXT NOT NULL,
  tham_so TEXT NOT NULL,
  gia_tri TEXT,
  ghi_chu TEXT
);

CREATE INDEX IF NOT EXISTS idx_kehoach_thamso_site ON kehoach_thamso (site);

-- 7. QUẢN LÝ KHO (STOCK HEADER, TRANSACTIONS, PRICE CATEGORY)
CREATE TABLE IF NOT EXISTS stock_header (
  id BIGSERIAL PRIMARY KEY,
  site TEXT NOT NULL,
  site_name TEXT,
  article TEXT NOT NULL,
  name TEXT NOT NULL,
  category TEXT,
  uom TEXT,
  stock_begin NUMERIC DEFAULT 0,
  receipts NUMERIC DEFAULT 0,
  issues NUMERIC DEFAULT 0,
  stock_end NUMERIC DEFAULT 0,
  price NUMERIC DEFAULT 0,
  stock_end_value NUMERIC DEFAULT 0,
  consumption_per_day NUMERIC DEFAULT 0,
  days_of_stock NUMERIC,
  status TEXT DEFAULT 'binh_thuong',
  has_mismatch BOOLEAN DEFAULT false,
  reconciliation_diff NUMERIC DEFAULT 0,
  period_from DATE,
  period_to DATE,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stock_header_site_article ON stock_header (site, article);

CREATE TABLE IF NOT EXISTS stock_transactions (
  id BIGSERIAL PRIMARY KEY,
  site TEXT,
  site_name TEXT,
  article TEXT NOT NULL,
  name TEXT,
  category TEXT,
  type TEXT,
  sloc TEXT,
  date DATE,
  mvt TEXT,
  mvt_label TEXT,
  qty NUMERIC DEFAULT 0,
  value NUMERIC DEFAULT 0,
  doc_no TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stock_tx_date ON stock_transactions (date DESC);
CREATE INDEX IF NOT EXISTS idx_stock_tx_article ON stock_transactions (article);
CREATE INDEX IF NOT EXISTS idx_stock_tx_sloc ON stock_transactions (sloc);

CREATE TABLE IF NOT EXISTS stock_price_category (
  id SERIAL PRIMARY KEY,
  article TEXT NOT NULL UNIQUE,
  name TEXT,
  category TEXT,
  uom TEXT,
  price NUMERIC DEFAULT 0
);

-- 8. DINH DƯỠNG SUẤT ĂN
CREATE TABLE IF NOT EXISTS dinhduong_100g (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  category TEXT NOT NULL,
  kcal NUMERIC NOT NULL DEFAULT 0,
  protein NUMERIC NOT NULL DEFAULT 0,
  fat NUMERIC NOT NULL DEFAULT 0,
  carb NUMERIC NOT NULL DEFAULT 0,
  fiber NUMERIC NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS menu_dinhduong (
  id SERIAL PRIMARY KEY,
  day_label TEXT NOT NULL,
  ca TEXT NOT NULL,
  dish_label TEXT NOT NULL,
  components JSONB NOT NULL DEFAULT '[]'::jsonb,
  thu_tu INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_menu_day_ca ON menu_dinhduong (day_label, ca);

-- 9. TRIGGERS: Tự động đổi version khi có report mới
CREATE OR REPLACE FUNCTION update_data_version_trigger()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE data_version
  SET version = EXTRACT(EPOCH FROM now())::TEXT,
      updated_at = now(),
      server_time = now()
  WHERE id = 1;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_report_version ON report;
CREATE TRIGGER trg_report_version
AFTER INSERT OR UPDATE OR DELETE ON report
FOR EACH STATEMENT
EXECUTE FUNCTION update_data_version_trigger();
