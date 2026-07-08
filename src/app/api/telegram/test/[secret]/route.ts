import { NextResponse } from "next/server";
import { sendTelegramMessage } from "@/lib/telegram/client";
import { getTelegramConfig, isTelegramEnabled } from "@/lib/telegram/config";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ secret: string }> },
) {
  const { secret } = await params;
  const config = getTelegramConfig();

  if (!config.webhookSecret || secret !== config.webhookSecret) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (!isTelegramEnabled(config) || !config.botToken) {
    return NextResponse.json(
      {
        error: "Telegram integration is not configured",
        hasBotToken: Boolean(config.botToken),
        allowedChatIdsCount: config.allowedChatIds.length,
        hasWebhookSecret: Boolean(config.webhookSecret),
      },
      { status: 503 },
    );
  }

  const chatId = config.allowedChatIds[0];
  if (!chatId) {
    return NextResponse.json(
      { error: "No TELEGRAM_ALLOWED_CHAT_IDS configured" },
      { status: 400 },
    );
  }

  try {
    const { messageId } = await sendTelegramMessage({
      botToken: config.botToken,
      chatId,
      text: "telegram server test",
    });

    return NextResponse.json({
      ok: true,
      chatId,
      messageId,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to send Telegram test message",
      },
      { status: 502 },
    );
  }
}
