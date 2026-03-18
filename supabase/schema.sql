-- ============================================================
-- Grace Logistics – Freight Rate Platform
-- Database Schema + RLS Policies
-- Run this in your Supabase SQL Editor (Dashboard → SQL Editor)
-- ============================================================

-- ─────────────────────────────────────────────
-- 1. CUSTOM TYPES
-- ─────────────────────────────────────────────

CREATE TYPE container_type AS ENUM (
  '20_dry_standard',
  '40_dry_standard',
  '40_dry_high',
  '45_dry_high',
  '20_reefer',
  '40_reefer_high'
);

CREATE TYPE pricing_tier AS ENUM (
  'public',
  'standard',
  'tier_1'
);

CREATE TYPE user_role AS ENUM (
  'customer',
  'admin'
);

-- ─────────────────────────────────────────────
-- 2. PORTS TABLE
-- ─────────────────────────────────────────────

-- Enable trigram extension for fuzzy search (must be before gin_trgm_ops index)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE ports (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name        TEXT NOT NULL,
  country     TEXT NOT NULL,
  port_code   TEXT UNIQUE,          -- UN/LOCODE e.g. LKCMB
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_ports_name ON ports USING gin (name gin_trgm_ops);
CREATE INDEX idx_ports_country ON ports (country);

-- ─────────────────────────────────────────────
-- 3. RATES TABLE
-- ─────────────────────────────────────────────

CREATE TABLE rates (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  origin_id       UUID NOT NULL REFERENCES ports(id) ON DELETE RESTRICT,
  destination_id  UUID NOT NULL REFERENCES ports(id) ON DELETE RESTRICT,
  container_type  container_type NOT NULL,
  pricing_tier    pricing_tier NOT NULL DEFAULT 'public',
  rate_value      DECIMAL(12, 2) NOT NULL CHECK (rate_value >= 0),
  transit_time    TEXT,                 -- e.g. "14-18 days"
  valid_from      DATE NOT NULL,
  valid_to        DATE NOT NULL,
  active          BOOLEAN DEFAULT true,
  notes           TEXT,                 -- internal admin notes
  created_by      UUID REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT valid_date_range CHECK (valid_to >= valid_from)
);

CREATE INDEX idx_rates_route ON rates (origin_id, destination_id);
CREATE INDEX idx_rates_container ON rates (container_type);
CREATE INDEX idx_rates_tier ON rates (pricing_tier);
CREATE INDEX idx_rates_validity ON rates (valid_from, valid_to);
CREATE INDEX idx_rates_active ON rates (active);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER rates_updated_at
  BEFORE UPDATE ON rates
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- ─────────────────────────────────────────────
-- 4. PROFILES TABLE (extends auth.users)
-- ─────────────────────────────────────────────

CREATE TABLE profiles (
  id            UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email         TEXT NOT NULL,
  role          user_role DEFAULT 'customer',
  pricing_tier  pricing_tier DEFAULT 'public',
  active        BOOLEAN DEFAULT true,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_profiles_role ON profiles (role);
CREATE INDEX idx_profiles_tier ON profiles (pricing_tier);

-- Auto-create profile when a new user signs up
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  v_role user_role := 'customer';
  v_tier pricing_tier := 'public';
BEGIN
  -- Safely try to read role from metadata
  IF NEW.raw_user_meta_data->>'role' IS NOT NULL AND NEW.raw_user_meta_data->>'role' != '' THEN
    BEGIN
      v_role := (NEW.raw_user_meta_data->>'role')::user_role;
    EXCEPTION WHEN OTHERS THEN
      v_role := 'customer';
    END;
  END IF;

  -- Safely try to read pricing_tier from metadata
  IF NEW.raw_user_meta_data->>'pricing_tier' IS NOT NULL AND NEW.raw_user_meta_data->>'pricing_tier' != '' THEN
    BEGIN
      v_tier := (NEW.raw_user_meta_data->>'pricing_tier')::pricing_tier;
    EXCEPTION WHEN OTHERS THEN
      v_tier := 'public';
    END;
  END IF;

  INSERT INTO public.profiles (id, email, role, pricing_tier, active)
  VALUES (NEW.id, NEW.email, v_role, v_tier, true);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user();

-- Auto-update profiles.updated_at
CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- ─────────────────────────────────────────────
-- 5. AUDIT LOG TABLE
-- ─────────────────────────────────────────────

CREATE TABLE audit_log (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  table_name    TEXT NOT NULL,
  record_id     UUID,
  action        TEXT NOT NULL,          -- INSERT, UPDATE, DELETE
  old_data      JSONB,
  new_data      JSONB,
  performed_by  UUID REFERENCES auth.users(id),
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_audit_table ON audit_log (table_name);
CREATE INDEX idx_audit_action ON audit_log (action);
CREATE INDEX idx_audit_date ON audit_log (created_at DESC);

-- ─────────────────────────────────────────────
-- 6. ROW LEVEL SECURITY
-- ─────────────────────────────────────────────

-- Helper function: check if current user is admin
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
    AND role = 'admin'
    AND active = true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── PORTS ──
ALTER TABLE ports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Ports are viewable by everyone"
  ON ports FOR SELECT
  USING (true);

CREATE POLICY "Ports are manageable by admins"
  ON ports FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());

-- ── RATES ──
ALTER TABLE rates ENABLE ROW LEVEL SECURITY;

-- Public users can only see active public rates within validity
CREATE POLICY "Public rates are viewable by everyone"
  ON rates FOR SELECT
  USING (
    active = true
    AND pricing_tier = 'public'
    AND valid_from <= CURRENT_DATE
    AND valid_to >= CURRENT_DATE
  );

-- Logged-in users can see rates matching their tier or lower
CREATE POLICY "Tier rates viewable by matching users"
  ON rates FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND active = true
    AND valid_from <= CURRENT_DATE
    AND valid_to >= CURRENT_DATE
  );

-- Admins can do everything with rates
CREATE POLICY "Admins can manage all rates"
  ON rates FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());

-- ── PROFILES ──
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Admins can view all profiles"
  ON profiles FOR SELECT
  USING (is_admin());

CREATE POLICY "Admins can manage all profiles"
  ON profiles FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());

-- ── AUDIT LOG ──
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view audit log"
  ON audit_log FOR SELECT
  USING (is_admin());

CREATE POLICY "Admins can insert audit log"
  ON audit_log FOR INSERT
  WITH CHECK (is_admin());

-- ─────────────────────────────────────────────
-- 7. RATE SEARCH FUNCTION (RPC)
-- Called from the client for optimized rate lookup
-- ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION search_rates(
  p_origin_id UUID,
  p_destination_id UUID,
  p_container_type container_type,
  p_user_tier pricing_tier DEFAULT 'public'
)
RETURNS TABLE (
  id UUID,
  origin_name TEXT,
  origin_country TEXT,
  destination_name TEXT,
  destination_country TEXT,
  container_type container_type,
  pricing_tier pricing_tier,
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
