-- Migration 03: Optimized indices for mb51_goods_issue table
-- Replaces legacy disposal_of_goods indices

CREATE INDEX IF NOT EXISTS idx_mb51_posting_date ON mb51_goods_issue (posting_date DESC);
CREATE INDEX IF NOT EXISTS idx_mb51_site_posting_date ON mb51_goods_issue (site, posting_date DESC);
CREATE INDEX IF NOT EXISTS idx_mb51_site_name_posting_date ON mb51_goods_issue (site_name, posting_date DESC);
CREATE INDEX IF NOT EXISTS idx_mb51_entry_unit ON mb51_goods_issue (entry_unit);
