import { supabaseAdmin } from "@/lib/supabase/admin";

interface CreateTelegramMessageLinkArgs {
  accountId: string;
  conversationId: string;
  contactId: string;
  telegramChatId: string;
  telegramMessageId: number;
  sourceWhatsAppMessageId: string;
}

export async function createTelegramMessageLink(
  args: CreateTelegramMessageLinkArgs,
): Promise<void> {
  const { error } = await supabaseAdmin().from("telegram_message_links").insert({
    account_id: args.accountId,
    conversation_id: args.conversationId,
    contact_id: args.contactId,
    telegram_chat_id: args.telegramChatId,
    telegram_message_id: args.telegramMessageId,
    source_whatsapp_message_id: args.sourceWhatsAppMessageId,
  });

  if (error) {
    throw new Error(error.message);
  }
}

export interface TelegramMessageLink {
  account_id: string;
  conversation_id: string;
  contact_id: string;
  source_whatsapp_message_id: string;
}

export async function findTelegramMessageLink(
  telegramChatId: string,
  telegramMessageId: number,
): Promise<TelegramMessageLink | null> {
  const { data, error } = await supabaseAdmin()
    .from("telegram_message_links")
    .select("account_id, conversation_id, contact_id, source_whatsapp_message_id")
    .eq("telegram_chat_id", telegramChatId)
    .eq("telegram_message_id", telegramMessageId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}
