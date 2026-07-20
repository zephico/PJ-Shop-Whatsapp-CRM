-- ============================================================
-- 035_customer_acquisition.sql — UTM / acquisition touchpoint
-- tracking for WhatsApp customers.
--
-- Domain mapping (see 032_customer_profile_fields_and_purchase_summary):
--   customers  -> contacts
--   customer_id on this table references contacts(id).
--
-- Tracks where a customer came from (Instagram, website, Google,
-- walk-in, etc.) and supports multiple touchpoints over time with
-- first-touch / last-touch attribution flags.
--
-- Idempotent — safe to run multiple times.
-- ============================================================

-- ---- customer_acquisition -----------------------------------
CREATE TABLE IF NOT EXISTS customer_acquisition (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  -- Logical customer id; FK targets contacts (the customer record).
  customer_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  source VARCHAR(100) NOT NULL,
  medium VARCHAR(100) NOT NULL,
  campaign VARCHAR(255),
  content VARCHAR(255),
  term VARCHAR(255),
  source_detail VARCHAR(255),
  landing_page TEXT,
  referrer TEXT,
  tracking_code VARCHAR(255),
  click_id VARCHAR(255),
  -- Meta WhatsApp message id (wamid) for the inbound message that
  -- captured this touch; stored as text, not messages.id.
  first_message_id VARCHAR(255),
  touch_type VARCHAR(50) NOT NULL DEFAULT 'first_touch',
  is_first_touch BOOLEAN NOT NULL DEFAULT FALSE,
  is_last_touch BOOLEAN NOT NULL DEFAULT TRUE,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT customer_acquisition_source_not_blank CHECK (btrim(source) <> ''),
  CONSTRAINT customer_acquisition_medium_not_blank CHECK (btrim(medium) <> ''),
  CONSTRAINT customer_acquisition_touch_type_check CHECK (
    touch_type IN (
      'first_touch',
      'last_touch',
      'repeat_touch',
      'conversion_touch'
    )
  ),
  CONSTRAINT customer_acquisition_medium_check CHECK (
    medium IN (
      'organic_social',
      'paid_social',
      'organic_search',
      'paid_search',
      'direct',
      'referral',
      'offline',
      'email',
      'sms',
      'unknown'
    )
  )
);

COMMENT ON TABLE customer_acquisition IS
  'Acquisition and UTM touchpoints for WhatsApp customers. Each row is one attributed touch (first, last, repeat, or conversion). customer_id references contacts.id.';

COMMENT ON COLUMN customer_acquisition.account_id IS
  'Tenant scope — denormalized from contacts.account_id for RLS and reporting.';

COMMENT ON COLUMN customer_acquisition.customer_id IS
  'The customer (contacts.id). ON DELETE CASCADE removes touch history when the contact is deleted.';

COMMENT ON COLUMN customer_acquisition.source IS
  'Acquisition source label (e.g. instagram, google, pradeep_jewellers_website, walk_in). Open VARCHAR — new sources do not require a migration.';

COMMENT ON COLUMN customer_acquisition.medium IS
  'UTM-style medium constrained to organic_social, paid_social, organic_search, paid_search, direct, referral, offline, email, sms, or unknown.';

COMMENT ON COLUMN customer_acquisition.campaign IS
  'Campaign name (utm_campaign), e.g. bridal_collection_2026.';

COMMENT ON COLUMN customer_acquisition.content IS
  'Ad or link variant (utm_content), e.g. reel_04.';

COMMENT ON COLUMN customer_acquisition.term IS
  'Paid search keyword (utm_term) when applicable.';

COMMENT ON COLUMN customer_acquisition.source_detail IS
  'Finer-grained placement, e.g. instagram_bio, click_to_whatsapp_ad, product_page_whatsapp_button.';

COMMENT ON COLUMN customer_acquisition.landing_page IS
  'URL the customer was on before opening WhatsApp, when known.';

COMMENT ON COLUMN customer_acquisition.referrer IS
  'HTTP referrer or upstream referrer string when captured.';

COMMENT ON COLUMN customer_acquisition.tracking_code IS
  'Internal or marketing tracking code (e.g. IG_BIO, PJ_PRODUCT_PAGE).';

COMMENT ON COLUMN customer_acquisition.click_id IS
  'Platform click identifier, e.g. Meta Click-to-WhatsApp ctwa_clid.';

COMMENT ON COLUMN customer_acquisition.first_message_id IS
  'WhatsApp message id (wamid) of the inbound message that created this touch. Unique when set — prevents duplicate rows for the same webhook delivery.';

COMMENT ON COLUMN customer_acquisition.touch_type IS
  'Semantic role of this touch: first_touch, last_touch, repeat_touch, or conversion_touch.';

COMMENT ON COLUMN customer_acquisition.is_first_touch IS
  'True for the single first-touch attribution row per customer (enforced by partial unique index).';

COMMENT ON COLUMN customer_acquisition.is_last_touch IS
  'True for the current last-touch attribution row per customer (enforced by partial unique index).';

COMMENT ON COLUMN customer_acquisition.captured_at IS
  'When the touch was observed (typically first inbound message time).';

-- ---- indexes ------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_customer_acquisition_customer_id
  ON customer_acquisition(customer_id);

CREATE INDEX IF NOT EXISTS idx_customer_acquisition_account_id
  ON customer_acquisition(account_id);

CREATE INDEX IF NOT EXISTS idx_customer_acquisition_source
  ON customer_acquisition(source);

CREATE INDEX IF NOT EXISTS idx_customer_acquisition_medium
  ON customer_acquisition(medium);

CREATE INDEX IF NOT EXISTS idx_customer_acquisition_campaign
  ON customer_acquisition(campaign);

CREATE INDEX IF NOT EXISTS idx_customer_acquisition_tracking_code
  ON customer_acquisition(tracking_code);

CREATE INDEX IF NOT EXISTS idx_customer_acquisition_click_id
  ON customer_acquisition(click_id);

CREATE INDEX IF NOT EXISTS idx_customer_acquisition_captured_at
  ON customer_acquisition(captured_at DESC);

CREATE INDEX IF NOT EXISTS idx_customer_acquisition_customer_captured
  ON customer_acquisition(customer_id, captured_at DESC);

-- One acquisition row per inbound WhatsApp message id.
CREATE UNIQUE INDEX IF NOT EXISTS idx_customer_acquisition_first_message_id
  ON customer_acquisition(first_message_id)
  WHERE first_message_id IS NOT NULL;

-- Only one first-touch attribution row per customer.
CREATE UNIQUE INDEX IF NOT EXISTS idx_customer_acquisition_one_first_touch
  ON customer_acquisition(customer_id)
  WHERE is_first_touch = TRUE;

-- Only one current last-touch attribution row per customer.
CREATE UNIQUE INDEX IF NOT EXISTS idx_customer_acquisition_one_last_touch
  ON customer_acquisition(customer_id)
  WHERE is_last_touch = TRUE;

-- ---- updated_at trigger (reuses 001) ------------------------
DROP TRIGGER IF EXISTS set_updated_at ON customer_acquisition;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON customer_acquisition
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ---- RLS ----------------------------------------------------
ALTER TABLE customer_acquisition ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS customer_acquisition_select ON customer_acquisition;
DROP POLICY IF EXISTS customer_acquisition_modify ON customer_acquisition;

CREATE POLICY customer_acquisition_select ON customer_acquisition
  FOR SELECT USING (
    is_account_member(account_id)
  );

CREATE POLICY customer_acquisition_modify ON customer_acquisition
  FOR ALL USING (
    is_account_member(account_id, 'agent')
  ) WITH CHECK (
    is_account_member(account_id, 'agent')
  );

-- Service role (webhook / backend) bypasses RLS and can INSERT.
