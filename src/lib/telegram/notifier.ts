import { sendTelegramMessage } from "@/lib/telegram/client";
import { getTelegramConfig, isTelegramEnabled } from "@/lib/telegram/config";
import {
  buildInboundNotificationText,
  describeMessageForTelegram,
} from "@/lib/telegram/formatters";
import { createTelegramMessageLink } from "@/lib/telegram/message-links";

interface NotifyTelegramIncomingMessageArgs {
  accountId: string;
  conversationId: string;
  contactId: string;
  contactName: string | null;
  contactPhone: string;
  contentType: string;
  contentText: string | null;
  whatsappMessageId: string;
}

export async function notifyTelegramIncomingMessage(
  args: NotifyTelegramIncomingMessageArgs,
): Promise<void> {
  const config = getTelegramConfig();
  if (!isTelegramEnabled(config) || !config.botToken) return;

  const text = buildInboundNotificationText({
    contactName: args.contactName,
    contactPhone: args.contactPhone,
    conversationId: args.conversationId,
    messagePreview: describeMessageForTelegram(args.contentType, args.contentText),
    appUrl: config.appUrl,
  });

  for (const chatId of config.allowedChatIds) {
    try {
      const { messageId } = await sendTelegramMessage({
        botToken: config.botToken,
        chatId,
        text,
      });

      await createTelegramMessageLink({
        accountId: args.accountId,
        conversationId: args.conversationId,
        contactId: args.contactId,
        telegramChatId: chatId,
        telegramMessageId: messageId,
        sourceWhatsAppMessageId: args.whatsappMessageId,
      });
    } catch (error) {
      console.error("[telegram] failed to send inbound notification:", {
        conversationId: args.conversationId,
        chatId,
        error: error instanceof Error ? error.message : error,
      });
    }
  }
}
