-- ============================================================
-- 030_custom_jewellery_requests.sql — guided intake for
-- image-based custom jewellery requests.
-- ============================================================

CREATE TABLE IF NOT EXISTS custom_jewellery_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'awaiting_category'
    CHECK (
      status IN (
        'awaiting_category',
        'awaiting_image',
        'awaiting_budget',
        'pending_review',
        'confirmed',
        'closed'
      )
    ),
  category TEXT,
  reference_image_url TEXT,
  budget_text TEXT,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_custom_jewellery_requests_contact
  ON custom_jewellery_requests(contact_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_custom_jewellery_requests_conversation
  ON custom_jewellery_requests(conversation_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_custom_jewellery_requests_account_status
  ON custom_jewellery_requests(account_id, status, created_at DESC);

ALTER TABLE custom_jewellery_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS custom_jewellery_requests_select ON custom_jewellery_requests;
DROP POLICY IF EXISTS custom_jewellery_requests_modify ON custom_jewellery_requests;

CREATE POLICY custom_jewellery_requests_select ON custom_jewellery_requests FOR SELECT USING (
  is_account_member(account_id)
);

CREATE POLICY custom_jewellery_requests_modify ON custom_jewellery_requests FOR ALL USING (
  is_account_member(account_id, 'agent')
) WITH CHECK (
  is_account_member(account_id, 'agent')
);
