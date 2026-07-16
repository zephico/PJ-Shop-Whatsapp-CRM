-- ============================================================
-- 029_contact_profile_tables.sql — preferences, special dates,
-- and prompt history for soft-profile collection.
--
-- Goals:
--   - Store per-contact jewellery preferences separately from raw chat.
--   - Store special dates like birthday / anniversary / custom occasion.
--   - Track whether we already asked a contact for a given profile topic
--     so automations do not ask the same thing again.
-- ============================================================

-- ---- contact_preferences --------------------------------------
CREATE TABLE IF NOT EXISTS contact_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  preferred_metal TEXT,
  preferred_purity TEXT,
  preferred_style TEXT,
  preferred_budget_min NUMERIC(12,2),
  preferred_budget_max NUMERIC(12,2),
  favorite_category TEXT,
  favorite_stone TEXT,
  purchase_intent TEXT,
  preferred_occasion TEXT,
  communication_channel TEXT NOT NULL DEFAULT 'whatsapp',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(contact_id)
);

CREATE INDEX IF NOT EXISTS idx_contact_preferences_contact
  ON contact_preferences(contact_id);

ALTER TABLE contact_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS contact_preferences_select ON contact_preferences;
DROP POLICY IF EXISTS contact_preferences_modify ON contact_preferences;

CREATE POLICY contact_preferences_select ON contact_preferences FOR SELECT USING (
  EXISTS (
    SELECT 1
    FROM contacts c
    WHERE c.id = contact_preferences.contact_id
      AND is_account_member(c.account_id)
  )
);

CREATE POLICY contact_preferences_modify ON contact_preferences FOR ALL USING (
  EXISTS (
    SELECT 1
    FROM contacts c
    WHERE c.id = contact_preferences.contact_id
      AND is_account_member(c.account_id, 'agent')
  )
) WITH CHECK (
  EXISTS (
    SELECT 1
    FROM contacts c
    WHERE c.id = contact_preferences.contact_id
      AND is_account_member(c.account_id, 'agent')
  )
);

-- ---- contact_special_dates ------------------------------------
CREATE TABLE IF NOT EXISTS contact_special_dates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  occasion_type TEXT NOT NULL
    CHECK (occasion_type IN ('birthday', 'anniversary', 'custom')),
  occasion_name TEXT,
  occasion_date DATE NOT NULL,
  recurring BOOLEAN NOT NULL DEFAULT TRUE,
  reminder_days_before INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contact_special_dates_contact
  ON contact_special_dates(contact_id);

CREATE INDEX IF NOT EXISTS idx_contact_special_dates_contact_type
  ON contact_special_dates(contact_id, occasion_type);

ALTER TABLE contact_special_dates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS contact_special_dates_select ON contact_special_dates;
DROP POLICY IF EXISTS contact_special_dates_modify ON contact_special_dates;

CREATE POLICY contact_special_dates_select ON contact_special_dates FOR SELECT USING (
  EXISTS (
    SELECT 1
    FROM contacts c
    WHERE c.id = contact_special_dates.contact_id
      AND is_account_member(c.account_id)
  )
);

CREATE POLICY contact_special_dates_modify ON contact_special_dates FOR ALL USING (
  EXISTS (
    SELECT 1
    FROM contacts c
    WHERE c.id = contact_special_dates.contact_id
      AND is_account_member(c.account_id, 'agent')
  )
) WITH CHECK (
  EXISTS (
    SELECT 1
    FROM contacts c
    WHERE c.id = contact_special_dates.contact_id
      AND is_account_member(c.account_id, 'agent')
  )
);

-- ---- contact_prompt_history -----------------------------------
CREATE TABLE IF NOT EXISTS contact_prompt_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  prompt_key TEXT NOT NULL
    CHECK (
      prompt_key IN (
        'birthday',
        'anniversary',
        'custom_occasion',
        'preferred_metal',
        'preferred_purity',
        'preferred_style',
        'preferred_budget',
        'favorite_category',
        'favorite_stone',
        'purchase_intent'
      )
    ),
  status TEXT NOT NULL DEFAULT 'asked'
    CHECK (status IN ('asked', 'answered', 'skipped', 'maybe_later')),
  asked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  answered_at TIMESTAMPTZ,
  source_message_id UUID REFERENCES messages(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(contact_id, prompt_key)
);

CREATE INDEX IF NOT EXISTS idx_contact_prompt_history_contact
  ON contact_prompt_history(contact_id);

CREATE INDEX IF NOT EXISTS idx_contact_prompt_history_contact_status
  ON contact_prompt_history(contact_id, status);

ALTER TABLE contact_prompt_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS contact_prompt_history_select ON contact_prompt_history;
DROP POLICY IF EXISTS contact_prompt_history_modify ON contact_prompt_history;

CREATE POLICY contact_prompt_history_select ON contact_prompt_history FOR SELECT USING (
  EXISTS (
    SELECT 1
    FROM contacts c
    WHERE c.id = contact_prompt_history.contact_id
      AND is_account_member(c.account_id)
  )
);

CREATE POLICY contact_prompt_history_modify ON contact_prompt_history FOR ALL USING (
  EXISTS (
    SELECT 1
    FROM contacts c
    WHERE c.id = contact_prompt_history.contact_id
      AND is_account_member(c.account_id, 'agent')
  )
) WITH CHECK (
  EXISTS (
    SELECT 1
    FROM contacts c
    WHERE c.id = contact_prompt_history.contact_id
      AND is_account_member(c.account_id, 'agent')
  )
);
