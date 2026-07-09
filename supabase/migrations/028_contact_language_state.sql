-- ============================================================
-- 028_contact_language_state.sql — Phase 1 WhatsApp reply flow
--
-- Stores the contact's preferred language and lightweight conversation
-- state for the Phase 1 WhatsApp welcome/menu automation.
-- ============================================================

ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS preferred_language TEXT
    CHECK (preferred_language IN ('en', 'hi', 'gu')),
  ADD COLUMN IF NOT EXISTS conversation_state TEXT
    CHECK (
      conversation_state IS NULL OR
      conversation_state IN ('AWAITING_LANGUAGE_SELECTION', 'MAIN_MENU')
    );

CREATE INDEX IF NOT EXISTS idx_contacts_account_language
  ON contacts (account_id, preferred_language);

CREATE INDEX IF NOT EXISTS idx_contacts_account_conversation_state
  ON contacts (account_id, conversation_state);
