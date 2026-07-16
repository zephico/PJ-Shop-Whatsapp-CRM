-- ============================================================
-- 031_contact_preference_memory.sql — structured multi-record
-- preference memory for contacts.
--
-- Goals:
--   - Keep every relevant jewellery preference mention.
--   - Keep occasion/person context instead of overwriting one field.
--   - Keep simple personal facts extracted from chat.
--   - Preserve a source-message-linked event trail.
-- ============================================================

-- ---- contact_jewellery_preferences ---------------------------
CREATE TABLE IF NOT EXISTS contact_jewellery_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  source_message_id UUID REFERENCES messages(id) ON DELETE SET NULL,
  category TEXT,
  style TEXT,
  metal TEXT,
  purity TEXT,
  stone TEXT,
  budget_min NUMERIC(12,2),
  budget_max NUMERIC(12,2),
  purchase_intent TEXT,
  occasion_type TEXT,
  occasion_person TEXT,
  raw_text TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contact_jewellery_preferences_contact
  ON contact_jewellery_preferences(contact_id);

CREATE INDEX IF NOT EXISTS idx_contact_jewellery_preferences_contact_created
  ON contact_jewellery_preferences(contact_id, created_at DESC);

ALTER TABLE contact_jewellery_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS contact_jewellery_preferences_select ON contact_jewellery_preferences;
DROP POLICY IF EXISTS contact_jewellery_preferences_modify ON contact_jewellery_preferences;

CREATE POLICY contact_jewellery_preferences_select
ON contact_jewellery_preferences FOR SELECT USING (
  EXISTS (
    SELECT 1
    FROM contacts c
    WHERE c.id = contact_jewellery_preferences.contact_id
      AND is_account_member(c.account_id)
  )
);

CREATE POLICY contact_jewellery_preferences_modify
ON contact_jewellery_preferences FOR ALL USING (
  EXISTS (
    SELECT 1
    FROM contacts c
    WHERE c.id = contact_jewellery_preferences.contact_id
      AND is_account_member(c.account_id, 'agent')
  )
) WITH CHECK (
  EXISTS (
    SELECT 1
    FROM contacts c
    WHERE c.id = contact_jewellery_preferences.contact_id
      AND is_account_member(c.account_id, 'agent')
  )
);

-- ---- contact_occasion_mentions -------------------------------
CREATE TABLE IF NOT EXISTS contact_occasion_mentions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  source_message_id UUID REFERENCES messages(id) ON DELETE SET NULL,
  occasion_type TEXT NOT NULL,
  person_label TEXT,
  occasion_date DATE,
  raw_text TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contact_occasion_mentions_contact
  ON contact_occasion_mentions(contact_id);

CREATE INDEX IF NOT EXISTS idx_contact_occasion_mentions_contact_created
  ON contact_occasion_mentions(contact_id, created_at DESC);

ALTER TABLE contact_occasion_mentions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS contact_occasion_mentions_select ON contact_occasion_mentions;
DROP POLICY IF EXISTS contact_occasion_mentions_modify ON contact_occasion_mentions;

CREATE POLICY contact_occasion_mentions_select
ON contact_occasion_mentions FOR SELECT USING (
  EXISTS (
    SELECT 1
    FROM contacts c
    WHERE c.id = contact_occasion_mentions.contact_id
      AND is_account_member(c.account_id)
  )
);

CREATE POLICY contact_occasion_mentions_modify
ON contact_occasion_mentions FOR ALL USING (
  EXISTS (
    SELECT 1
    FROM contacts c
    WHERE c.id = contact_occasion_mentions.contact_id
      AND is_account_member(c.account_id, 'agent')
  )
) WITH CHECK (
  EXISTS (
    SELECT 1
    FROM contacts c
    WHERE c.id = contact_occasion_mentions.contact_id
      AND is_account_member(c.account_id, 'agent')
  )
);

-- ---- contact_personal_facts ---------------------------------
CREATE TABLE IF NOT EXISTS contact_personal_facts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  source_message_id UUID REFERENCES messages(id) ON DELETE SET NULL,
  fact_type TEXT NOT NULL,
  fact_value TEXT NOT NULL,
  related_person TEXT,
  raw_text TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contact_personal_facts_contact
  ON contact_personal_facts(contact_id);

CREATE INDEX IF NOT EXISTS idx_contact_personal_facts_contact_created
  ON contact_personal_facts(contact_id, created_at DESC);

ALTER TABLE contact_personal_facts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS contact_personal_facts_select ON contact_personal_facts;
DROP POLICY IF EXISTS contact_personal_facts_modify ON contact_personal_facts;

CREATE POLICY contact_personal_facts_select
ON contact_personal_facts FOR SELECT USING (
  EXISTS (
    SELECT 1
    FROM contacts c
    WHERE c.id = contact_personal_facts.contact_id
      AND is_account_member(c.account_id)
  )
);

CREATE POLICY contact_personal_facts_modify
ON contact_personal_facts FOR ALL USING (
  EXISTS (
    SELECT 1
    FROM contacts c
    WHERE c.id = contact_personal_facts.contact_id
      AND is_account_member(c.account_id, 'agent')
  )
) WITH CHECK (
  EXISTS (
    SELECT 1
    FROM contacts c
    WHERE c.id = contact_personal_facts.contact_id
      AND is_account_member(c.account_id, 'agent')
  )
);

-- ---- contact_preference_events -------------------------------
CREATE TABLE IF NOT EXISTS contact_preference_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  source_message_id UUID REFERENCES messages(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  event_key TEXT NOT NULL,
  event_value TEXT,
  raw_text TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contact_preference_events_contact
  ON contact_preference_events(contact_id);

CREATE INDEX IF NOT EXISTS idx_contact_preference_events_contact_created
  ON contact_preference_events(contact_id, created_at DESC);

ALTER TABLE contact_preference_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS contact_preference_events_select ON contact_preference_events;
DROP POLICY IF EXISTS contact_preference_events_modify ON contact_preference_events;

CREATE POLICY contact_preference_events_select
ON contact_preference_events FOR SELECT USING (
  EXISTS (
    SELECT 1
    FROM contacts c
    WHERE c.id = contact_preference_events.contact_id
      AND is_account_member(c.account_id)
  )
);

CREATE POLICY contact_preference_events_modify
ON contact_preference_events FOR ALL USING (
  EXISTS (
    SELECT 1
    FROM contacts c
    WHERE c.id = contact_preference_events.contact_id
      AND is_account_member(c.account_id, 'agent')
  )
) WITH CHECK (
  EXISTS (
    SELECT 1
    FROM contacts c
    WHERE c.id = contact_preference_events.contact_id
      AND is_account_member(c.account_id, 'agent')
  )
);
