-- ============================================================
-- Grace Logistics – Migration v4: Commodity Types + Admin Fix
-- Run this in Supabase SQL Editor
-- ============================================================

-- ─────────────────────────────────────────────
-- 1. Confirm admin email (run once)
-- ─────────────────────────────────────────────
UPDATE auth.users
SET email_confirmed_at = NOW(),
    updated_at = NOW()
WHERE email = 'admin@gracelogisticslk.com'
  AND email_confirmed_at IS NULL;

-- ─────────────────────────────────────────────
-- 2. Commodity Types lookup table
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS commodity_types (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE,
  label       TEXT NOT NULL,
  active      BOOLEAN DEFAULT true,
  sort_order  INT DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Seed default commodity types
INSERT INTO commodity_types (name, label, sort_order) VALUES
  ('general_cargo',       'General Cargo',           1),
  ('food_beverages',      'Food & Beverages',        2),
  ('chemicals',           'Chemicals',               3),
  ('textiles_garments',   'Textiles & Garments',     4),
  ('electronics',         'Electronics',             5),
  ('machinery',           'Machinery & Equipment',   6),
  ('automotive',          'Automotive Parts',        7),
  ('building_materials',  'Building Materials',      8),
  ('agriculture',         'Agricultural Products',   9),
  ('pharmaceuticals',     'Pharmaceuticals',        10),
  ('furniture',           'Furniture',              11),
  ('plastics_rubber',     'Plastics & Rubber',      12),
  ('metals',              'Metals & Minerals',      13),
  ('paper_packaging',     'Paper & Packaging',      14),
  ('hazardous',           'Hazardous Goods (DG)',   15),
  ('perishable',          'Perishable Goods',       16),
  ('other',               'Other',                  99)
ON CONFLICT (name) DO NOTHING;

-- ─────────────────────────────────────────────
-- 3. RLS Policies for commodity_types
-- ─────────────────────────────────────────────
ALTER TABLE commodity_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Everyone can view commodity types"
  ON commodity_types FOR SELECT USING (true);

CREATE POLICY "Admins can manage commodity types"
  ON commodity_types FOR ALL
  USING (is_admin()) WITH CHECK (is_admin());
