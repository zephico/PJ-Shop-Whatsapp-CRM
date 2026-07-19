import { supabaseAdmin } from "@/lib/supabase/admin";
import { decrypt, encrypt, isLegacyFormat } from "@/lib/whatsapp/encryption";
import { sendTextMessage } from "@/lib/whatsapp/meta-api";
import { formatMetaApiError } from "@/lib/whatsapp/meta-send-errors";
import {
  isRecipientNotAllowedError,
  isValidE164,
  phoneVariants,
  sanitizePhoneForMeta,
} from "@/lib/whatsapp/phone-utils";

interface SendTelegramReplyArgs {
  accountId: string;
  conversationId: string;
  replyText: string;
  sourceWhatsAppMessageId: string;
}

interface ConversationRow {
  id: string;
  account_id: string;
  contact: {
    id: string;
    phone: string | null;
    name: string | null;
  } | null;
}

export async function sendWhatsAppReplyFromTelegram(
  args: SendTelegramReplyArgs,
): Promise<{ contactName: string | null; whatsappMessageId: string }> {
  const db = supabaseAdmin();

  const { data: conversation, error: conversationError } = await db
    .from("conversations")
    .select("id, account_id, contact:contacts!conversations_contact_id_fkey(id, phone, name)")
    .eq("id", args.conversationId)
    .eq("account_id", args.accountId)
    .maybeSingle();

  if (conversationError || !conversation) {
    throw new Error("Conversation not found for Telegram reply");
  }

  const conversationRow = conversation as unknown as ConversationRow;
  const contact = conversationRow.contact;
  if (!contact?.phone) {
    throw new Error("Contact phone number not found for Telegram reply");
  }

  const sanitizedPhone = sanitizePhoneForMeta(contact.phone);
  if (!isValidE164(sanitizedPhone)) {
    throw new Error("Contact phone number is not a valid E.164 number");
  }

  const { data: config, error: configError } = await db
    .from("whatsapp_config")
    .select("id, account_id, phone_number_id, access_token")
    .eq("account_id", args.accountId)
    .single();

  if (configError || !config) {
    throw new Error("WhatsApp configuration not found for this account");
  }

  const accessToken = decrypt(config.access_token);
  if (isLegacyFormat(config.access_token)) {
    void db
      .from("whatsapp_config")
      .update({ access_token: encrypt(accessToken) })
      .eq("id", config.id)
      .then(({ error }) => {
        if (error) {
          console.warn("[telegram] access_token GCM upgrade failed:", error.message);
        }
      });
  }

  let waMessageId = "";
  let workingPhone = sanitizedPhone;

  const attempt = async (phone: string): Promise<string> => {
    const result = await sendTextMessage({
      phoneNumberId: config.phone_number_id,
      accessToken,
      to: phone,
      text: args.replyText,
      contextMessageId: args.sourceWhatsAppMessageId || undefined,
    });
    return result.messageId;
  };

  try {
    let lastError: unknown = null;
    for (const variant of phoneVariants(sanitizedPhone)) {
      try {
        waMessageId = await attempt(variant);
        workingPhone = variant;
        lastError = null;
        break;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (!isRecipientNotAllowedError(message)) {
          throw error;
        }
        lastError = error;
        console.warn(`[telegram] recipient variant "${variant}" rejected by Meta, trying next…`);
      }
    }

    if (lastError) throw lastError;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown Meta API error";
    throw new Error(formatMetaApiError(message));
  }

  if (workingPhone !== sanitizedPhone) {
    await db.from("contacts").update({ phone: workingPhone }).eq("id", contact.id);
  }

  const { error: insertError } = await db.from("messages").insert({
    conversation_id: args.conversationId,
    sender_type: "agent",
    content_type: "text",
    content_text: args.replyText,
    message_id: waMessageId,
    status: "sent",
  });

  if (insertError) {
    throw new Error(`Reply sent to WhatsApp but failed to save locally: ${insertError.message}`);
  }

  const now = new Date().toISOString();

  const { error: updateConversationError } = await db
    .from("conversations")
    .update({
      last_message_text: args.replyText,
      last_message_at: now,
      updated_at: now,
    })
    .eq("id", args.conversationId);

  if (updateConversationError) {
    console.error("[telegram] failed to update conversation after reply:", updateConversationError.message);
  }

  const { error: pauseError } = await db
    .from("flow_runs")
    .update({
      status: "paused_by_agent",
      ended_at: now,
      end_reason: "agent_replied",
    })
    .eq("account_id", args.accountId)
    .eq("contact_id", contact.id)
    .eq("status", "active");

  if (pauseError) {
    console.error("[telegram] pause-on-reply failed:", pauseError.message);
  }

  return {
    contactName: contact.name ?? null,
    whatsappMessageId: waMessageId,
  };
}
