-- ============================================================
-- Grace Logistics – Migration v3: Name fields + Audit fix
-- Run this in Supabase SQL Editor
-- ============================================================

-- ─────────────────────────────────────────────
-- 1. Add first_name and last_name to profiles
-- ─────────────────────────────────────────────
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS first_name TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS last_name TEXT;

-- ─────────────────────────────────────────────
-- 2. Add performed_by_email to audit_log for readability
-- ─────────────────────────────────────────────
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS performed_by_email TEXT;

-- Backfill existing audit entries with emails from profiles
UPDATE audit_log al
SET performed_by_email = p.email
FROM profiles p
WHERE al.performed_by = p.id
  AND al.performed_by_email IS NULL;

-- ─────────────────────────────────────────────
-- 3. Update handle_new_user to store first/last name
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

  INSERT INTO public.profiles (id, email, role, pricing_tier, active, company, first_name, last_name)
  VALUES (
    NEW.id,
    NEW.email,
    v_role,
    v_tier,
    true,
    NULLIF(NEW.raw_user_meta_data->>'company', ''),
    NULLIF(NEW.raw_user_meta_data->>'first_name', ''),
    NULLIF(NEW.raw_user_meta_data->>'last_name', '')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
