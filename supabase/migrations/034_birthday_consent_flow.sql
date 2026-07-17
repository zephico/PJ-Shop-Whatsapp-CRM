-- ============================================================
-- 034_birthday_consent_flow.sql
--
-- Adds contact fields and state support for the optional birthday
-- consent flow used after Talk to Executive.
-- ============================================================

ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS birth_date DATE,
  ADD COLUMN IF NOT EXISTS birth_day INTEGER,
  ADD COLUMN IF NOT EXISTS birth_month INTEGER,
  ADD COLUMN IF NOT EXISTS birth_year INTEGER,
  ADD COLUMN IF NOT EXISTS birthday_opt_in BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS birthday_prompt_status TEXT NOT NULL DEFAULT 'not_asked',
  ADD COLUMN IF NOT EXISTS birthday_source TEXT,
  ADD COLUMN IF NOT EXISTS birthday_captured_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS birthday_invalid_attempts INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS birthday_prompt_conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'contacts'::regclass
      AND conname = 'contacts_birthday_prompt_status_check'
  ) THEN
    ALTER TABLE contacts
      ADD CONSTRAINT contacts_birthday_prompt_status_check
        CHECK (
          birthday_prompt_status IN (
            'not_asked',
            'accepted',
            'maybe_later',
            'declined',
            'completed'
          )
        );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_contacts_account_birthday_prompt_status
  ON contacts(account_id, birthday_prompt_status);

CREATE INDEX IF NOT EXISTS idx_contacts_account_birth_date
  ON contacts(account_id, birth_date);

DO $$
DECLARE
  v_constraint_name TEXT;
BEGIN
  SELECT conname
  INTO v_constraint_name
  FROM pg_constraint
  WHERE conrelid = 'contacts'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%conversation_state%';

  IF v_constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE contacts DROP CONSTRAINT %I', v_constraint_name);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'contacts'::regclass
      AND conname = 'contacts_conversation_state_check'
  ) THEN
    ALTER TABLE contacts
      ADD CONSTRAINT contacts_conversation_state_check
        CHECK (
          conversation_state IS NULL OR
          conversation_state IN (
            'AWAITING_LANGUAGE_SELECTION',
            'MAIN_MENU',
            'BROWSING_JEWELLERY',
            'CUSTOM_JEWELLERY',
            'GOLD_RATE',
            'AWAITING_BIRTHDAY_CONSENT',
            'AWAITING_BIRTHDAY',
            'HUMAN_HANDOFF',
            'FLOW_COMPLETED'
          )
        );
  END IF;
END $$;
