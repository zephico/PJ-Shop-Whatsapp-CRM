-- ============================================================
-- 032_customer_profile_fields_and_purchase_summary.sql
--
-- Fills the remaining schema gaps from the Pradeep Jewellers CRM
-- database design without duplicating existing tables.
--
-- Existing mapping:
--   customers                 -> contacts
--   customer_preferences      -> contact_preferences
--   customer_special_dates    -> contact_special_dates
--   customer_notes            -> contact_notes
--   customer_tags             -> contact_tags + tags
--   conversations             -> conversations + messages
--
-- This migration adds:
--   - the missing customer/profile columns on contacts
--   - purchase_summary as a 1:1 per-contact aggregate table
-- ============================================================

-- ---- contacts: missing customer profile columns -------------
ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS gender TEXT
    CHECK (
      gender IS NULL OR
      gender IN ('male', 'female', 'other', 'prefer_not_to_say')
    ),
  ADD COLUMN IF NOT EXISTS birth_date DATE,
  ADD COLUMN IF NOT EXISTS anniversary_date DATE,
  ADD COLUMN IF NOT EXISTS city TEXT,
  ADD COLUMN IF NOT EXISTS state TEXT,
  ADD COLUMN IF NOT EXISTS marketing_opt_in BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_contacts_account_birth_date
  ON contacts(account_id, birth_date);

CREATE INDEX IF NOT EXISTS idx_contacts_account_anniversary_date
  ON contacts(account_id, anniversary_date);

CREATE INDEX IF NOT EXISTS idx_contacts_account_city
  ON contacts(account_id, city);

CREATE INDEX IF NOT EXISTS idx_contacts_account_state
  ON contacts(account_id, state);

-- ---- purchase_summary ---------------------------------------
CREATE TABLE IF NOT EXISTS purchase_summary (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  total_orders INTEGER NOT NULL DEFAULT 0,
  total_spent NUMERIC(12,2) NOT NULL DEFAULT 0,
  average_order_value NUMERIC(12,2) NOT NULL DEFAULT 0,
  first_purchase_date DATE,
  last_purchase_date DATE,
  favorite_category TEXT,
  loyalty_tier TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(contact_id)
);

CREATE INDEX IF NOT EXISTS idx_purchase_summary_account
  ON purchase_summary(account_id);

CREATE INDEX IF NOT EXISTS idx_purchase_summary_contact
  ON purchase_summary(contact_id);

CREATE INDEX IF NOT EXISTS idx_purchase_summary_account_loyalty
  ON purchase_summary(account_id, loyalty_tier);

ALTER TABLE purchase_summary ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS purchase_summary_select ON purchase_summary;
DROP POLICY IF EXISTS purchase_summary_modify ON purchase_summary;

CREATE POLICY purchase_summary_select ON purchase_summary FOR SELECT USING (
  is_account_member(account_id)
);

CREATE POLICY purchase_summary_modify ON purchase_summary FOR ALL USING (
  is_account_member(account_id, 'agent')
) WITH CHECK (
  is_account_member(account_id, 'agent')
);
