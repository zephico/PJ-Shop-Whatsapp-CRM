import { NextResponse } from "next/server";
import { sendTelegramMessage } from "@/lib/telegram/client";
import {
  getTelegramConfig,
  isAllowedTelegramChat,
  isAllowedTelegramUser,
  isTelegramEnabled,
} from "@/lib/telegram/config";
import { buildTelegramReplyConfirmation } from "@/lib/telegram/formatters";
import { findTelegramMessageLink } from "@/lib/telegram/message-links";
import { sendWhatsAppReplyFromTelegram } from "@/lib/telegram/reply";
import type { TelegramMessage, TelegramUpdate } from "@/lib/telegram/types";

function getInboundTelegramMessage(update: TelegramUpdate): TelegramMessage | null {
  return update.message ?? null;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ secret: string }> },
) {
  const { secret } = await params;
  const config = getTelegramConfig();

  if (!config.webhookSecret || secret !== config.webhookSecret) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ secret: string }> },
) {
  const { secret } = await params;
  const config = getTelegramConfig();

  if (!config.webhookSecret || secret !== config.webhookSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isTelegramEnabled(config) || !config.botToken) {
    return NextResponse.json(
      { error: "Telegram integration is not configured" },
      { status: 503 },
    );
  }

  let update: TelegramUpdate;
  try {
    update = (await request.json()) as TelegramUpdate;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const message = getInboundTelegramMessage(update);
  if (!message) {
    return NextResponse.json({ ok: true });
  }

  const chatId = String(message.chat.id);
  const userId = message.from ? String(message.from.id) : null;
  if (!isAllowedTelegramChat(chatId, config) || !isAllowedTelegramUser(userId, config)) {
    return NextResponse.json({ ok: true });
  }

  if (message.from?.is_bot) {
    return NextResponse.json({ ok: true });
  }

  const text = message.text?.trim();
  if (!text) {
    return NextResponse.json({ ok: true });
  }

  if (text === "/start") {
    await sendTelegramMessage({
      botToken: config.botToken,
      chatId,
      text: "Reply to a Telegram notification from this bot to send a WhatsApp reply from the CRM.",
    });
    return NextResponse.json({ ok: true });
  }

  const replyToMessageId = message.reply_to_message?.message_id;
  if (!replyToMessageId) {
    await sendTelegramMessage({
      botToken: config.botToken,
      chatId,
      text: "Reply to a Telegram notification message from this bot to send a WhatsApp reply.",
    });
    return NextResponse.json({ ok: true });
  }

  try {
    const link = await findTelegramMessageLink(chatId, replyToMessageId);
    if (!link) {
      await sendTelegramMessage({
        botToken: config.botToken,
        chatId,
        text: "I could not match that reply to a CRM conversation. Reply directly to the original notification message.",
      });
      return NextResponse.json({ ok: true });
    }

    const result = await sendWhatsAppReplyFromTelegram({
      accountId: link.account_id,
      conversationId: link.conversation_id,
      replyText: text,
      sourceWhatsAppMessageId: link.source_whatsapp_message_id,
    });

    await sendTelegramMessage({
      botToken: config.botToken,
      chatId,
      text: buildTelegramReplyConfirmation(result.contactName, text),
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[telegram] reply relay failed:", {
      chatId,
      replyToMessageId,
      error: error instanceof Error ? error.message : error,
    });

    await sendTelegramMessage({
      botToken: config.botToken,
      chatId,
      text:
        error instanceof Error
          ? `Failed to send WhatsApp reply: ${error.message}`
          : "Failed to send WhatsApp reply.",
    });

    return NextResponse.json({ ok: true });
  }
}
