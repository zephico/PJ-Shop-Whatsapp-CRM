-- ============================================================
-- 027_telegram_message_links.sql — Telegram bot reply mapping
--
-- Stores Telegram message ids emitted for inbound WhatsApp
-- notifications so Telegram replies can be routed back to the
-- correct CRM conversation.
-- ============================================================

CREATE TABLE IF NOT EXISTS telegram_message_links (
  id                         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id                 uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  conversation_id            uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  contact_id                 uuid NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  telegram_chat_id           text NOT NULL,
  telegram_message_id        bigint NOT NULL,
  source_whatsapp_message_id text NOT NULL,
  created_at                 timestamptz NOT NULL DEFAULT now(),
  UNIQUE (telegram_chat_id, telegram_message_id)
);

CREATE INDEX IF NOT EXISTS telegram_message_links_account_id_idx
  ON telegram_message_links (account_id);

CREATE INDEX IF NOT EXISTS telegram_message_links_conversation_id_idx
  ON telegram_message_links (conversation_id);

CREATE INDEX IF NOT EXISTS telegram_message_links_chat_message_idx
  ON telegram_message_links (telegram_chat_id, telegram_message_id);

ALTER TABLE telegram_message_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS telegram_message_links_select ON telegram_message_links;
CREATE POLICY telegram_message_links_select ON telegram_message_links FOR SELECT
  USING (is_account_member(account_id));
