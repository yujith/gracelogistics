-- ============================================================
-- migration_v5.sql — Platform Settings (B/L Fee)
-- Run this in your Supabase SQL Editor
-- ============================================================

-- Create platform_settings lookup table
CREATE TABLE IF NOT EXISTS platform_settings (
    key         TEXT PRIMARY KEY,
    value       TEXT NOT NULL,
    label       TEXT NOT NULL,
    description TEXT,
    updated_at  TIMESTAMPTZ DEFAULT now()
);

-- Seed with initial settings
INSERT INTO platform_settings (key, value, label, description) VALUES
    ('bl_fee', '150', 'Bill of Lading (B/L) Fee', 'Fee charged per booking for issuing the Bill of Lading (USD)'),
    ('contact_email', 'niroshan.s@gracelogisticslk.com', 'Booking Contact Email', 'Email address that receives booking requests')
ON CONFLICT (key) DO NOTHING;

-- Enable RLS
ALTER TABLE platform_settings ENABLE ROW LEVEL SECURITY;

-- Public can read settings (needed for rates page to load bl_fee)
CREATE POLICY "Public read platform_settings"
    ON platform_settings FOR SELECT
    TO public
    USING (true);

-- Only admins can update settings
CREATE POLICY "Admin update platform_settings"
    ON platform_settings FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role = 'admin'
        )
    );
