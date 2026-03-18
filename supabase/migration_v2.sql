-- ============================================================
-- Grace Logistics – Enhancement Migration v2 (FIXED)
-- Run this in Supabase SQL Editor AFTER the initial schema.sql
-- ============================================================

-- ─────────────────────────────────────────────
-- 1. Add company column to profiles
-- ─────────────────────────────────────────────
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS company TEXT;

-- ─────────────────────────────────────────────
-- 2. Drop RLS policies that reference ENUM columns
-- ─────────────────────────────────────────────
DROP POLICY IF EXISTS "Public rates are viewable by everyone" ON rates;
DROP POLICY IF EXISTS "Tier rates viewable by matching users" ON rates;
DROP POLICY IF EXISTS "Admins can manage all rates" ON rates;

-- ─────────────────────────────────────────────
-- 3. Drop the search_rates function (uses ENUM parameter types)
-- ─────────────────────────────────────────────
DROP FUNCTION IF EXISTS search_rates(UUID, UUID, container_type, pricing_tier);

-- ─────────────────────────────────────────────
-- 4. Replace handle_new_user trigger function
--    (remove ENUM type references, add company)
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  v_role TEXT := 'customer';
  v_tier TEXT := 'public';
BEGIN
  IF NEW.raw_user_meta_data->>'role' IS NOT NULL AND NEW.raw_user_meta_data->>'role' != '' THEN
    v_role := NEW.raw_user_meta_data->>'role';
  END IF;

  IF NEW.raw_user_meta_data->>'pricing_tier' IS NOT NULL AND NEW.raw_user_meta_data->>'pricing_tier' != '' THEN
    v_tier := NEW.raw_user_meta_data->>'pricing_tier';
  END IF;

  INSERT INTO public.profiles (id, email, role, pricing_tier, active, company)
  VALUES (
    NEW.id,
    NEW.email,
    v_role,
    v_tier,
    true,
    NULLIF(NEW.raw_user_meta_data->>'company', '')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─────────────────────────────────────────────
-- 5. Drop column defaults BEFORE altering types
--    (defaults reference the ENUM types)
-- ─────────────────────────────────────────────
ALTER TABLE rates ALTER COLUMN container_type DROP DEFAULT;
ALTER TABLE rates ALTER COLUMN pricing_tier DROP DEFAULT;
ALTER TABLE profiles ALTER COLUMN pricing_tier DROP DEFAULT;
ALTER TABLE profiles ALTER COLUMN role DROP DEFAULT;

-- ─────────────────────────────────────────────
-- 6. Convert ENUM columns to TEXT
-- ─────────────────────────────────────────────
ALTER TABLE rates ALTER COLUMN container_type TYPE TEXT;
ALTER TABLE rates ALTER COLUMN pricing_tier TYPE TEXT;
ALTER TABLE profiles ALTER COLUMN pricing_tier TYPE TEXT;
ALTER TABLE profiles ALTER COLUMN role TYPE TEXT;

-- ─────────────────────────────────────────────
-- 7. Set new TEXT defaults
-- ─────────────────────────────────────────────
ALTER TABLE rates ALTER COLUMN pricing_tier SET DEFAULT 'public';
ALTER TABLE profiles ALTER COLUMN pricing_tier SET DEFAULT 'public';
ALTER TABLE profiles ALTER COLUMN role SET DEFAULT 'customer';

-- ─────────────────────────────────────────────
-- 8. Recreate the RLS policies
-- ─────────────────────────────────────────────
CREATE POLICY "Public rates are viewable by everyone"
  ON rates FOR SELECT
  USING (
    active = true
    AND pricing_tier = 'public'
    AND valid_from <= CURRENT_DATE
    AND valid_to >= CURRENT_DATE
  );

CREATE POLICY "Tier rates viewable by matching users"
  ON rates FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND active = true
    AND valid_from <= CURRENT_DATE
    AND valid_to >= CURRENT_DATE
  );

CREATE POLICY "Admins can manage all rates"
  ON rates FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());

-- ─────────────────────────────────────────────
-- 9. Drop old ENUM types (now safe - no dependencies)
-- ─────────────────────────────────────────────
DROP TYPE IF EXISTS container_type;
DROP TYPE IF EXISTS pricing_tier;
DROP TYPE IF EXISTS user_role;

-- ─────────────────────────────────────────────
-- 10. Container Types lookup table
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS container_types (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE,
  label       TEXT NOT NULL,
  active      BOOLEAN DEFAULT true,
  sort_order  INT DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO container_types (name, label, sort_order) VALUES
  ('20_dry_standard', '20'' Dry Standard', 1),
  ('40_dry_standard', '40'' Dry Standard', 2),
  ('40_dry_high', '40'' Dry High Cube', 3),
  ('45_dry_high', '45'' Dry High Cube', 4),
  ('20_reefer', '20'' Reefer', 5),
  ('40_reefer_high', '40'' Reefer High Cube', 6)
ON CONFLICT (name) DO NOTHING;

ALTER TABLE container_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Everyone can view container types"
  ON container_types FOR SELECT USING (true);

CREATE POLICY "Admins can manage container types"
  ON container_types FOR ALL
  USING (is_admin()) WITH CHECK (is_admin());

-- ─────────────────────────────────────────────
-- 11. Pricing Tiers lookup table
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pricing_tiers (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE,
  label       TEXT NOT NULL,
  sort_order  INT DEFAULT 0,
  active      BOOLEAN DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO pricing_tiers (name, label, sort_order) VALUES
  ('public', 'Public', 1),
  ('standard', 'Standard', 2),
  ('tier_1', 'Tier 1', 3)
ON CONFLICT (name) DO NOTHING;

ALTER TABLE pricing_tiers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Everyone can view tiers"
  ON pricing_tiers FOR SELECT USING (true);

CREATE POLICY "Admins can manage tiers"
  ON pricing_tiers FOR ALL
  USING (is_admin()) WITH CHECK (is_admin());

-- ─────────────────────────────────────────────
-- 12. Recreate search_rates with TEXT parameters
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION search_rates(
  p_origin_id UUID,
  p_destination_id UUID,
  p_container_type TEXT,
  p_user_tier TEXT DEFAULT 'public'
)
RETURNS TABLE (
  id UUID,
  origin_name TEXT,
  origin_country TEXT,
  destination_name TEXT,
  destination_country TEXT,
  container_type TEXT,
  pricing_tier TEXT,
  rate_value DECIMAL(12,2),
  transit_time TEXT,
  valid_from DATE,
  valid_to DATE
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    r.id,
    po.name AS origin_name,
    po.country AS origin_country,
    pd.name AS destination_name,
    pd.country AS destination_country,
    r.container_type,
    r.pricing_tier,
    r.rate_value,
    r.transit_time,
    r.valid_from,
    r.valid_to
  FROM rates r
  JOIN ports po ON r.origin_id = po.id
  JOIN ports pd ON r.destination_id = pd.id
  WHERE r.origin_id = p_origin_id
    AND r.destination_id = p_destination_id
    AND r.container_type = p_container_type
    AND r.active = true
    AND r.valid_from <= CURRENT_DATE
    AND r.valid_to >= CURRENT_DATE
    AND r.pricing_tier = p_user_tier
  ORDER BY r.rate_value ASC
  LIMIT 10;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
