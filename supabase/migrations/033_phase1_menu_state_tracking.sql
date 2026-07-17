-- ============================================================
-- 033_phase1_menu_state_tracking.sql
--
-- Expands Phase 1 contact state beyond the original language/menu
-- bootstrap and adds lightweight menu dedupe tracking.
-- ============================================================

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

ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS last_menu_type TEXT,
  ADD COLUMN IF NOT EXISTS last_menu_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_processed_inbound_message_id TEXT;

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
            'HUMAN_HANDOFF',
            'FLOW_COMPLETED'
          )
        );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_contacts_account_last_processed_inbound_message
  ON contacts(account_id, last_processed_inbound_message_id);
