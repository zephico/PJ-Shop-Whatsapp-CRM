import type { TelegramSendMessageResponse } from "@/lib/telegram/types";

interface SendTelegramMessageArgs {
  botToken: string;
  chatId: string;
  text: string;
  disableWebPagePreview?: boolean;
}

async function telegramFetch<T>(
  botToken: string,
  method: string,
  body: Record<string, unknown>,
): Promise<T> {
  const response = await fetch(`https://api.telegram.org/bot${botToken}/${method}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const data = (await response.json()) as T & {
    ok?: boolean;
    description?: string;
  };

  if (!response.ok || ("ok" in data && data.ok === false)) {
    throw new Error(
      typeof data.description === "string"
        ? data.description
        : `Telegram API error: ${response.status}`,
    );
  }

  return data;
}

export async function sendTelegramMessage(
  args: SendTelegramMessageArgs,
): Promise<{ messageId: number }> {
  const data = await telegramFetch<TelegramSendMessageResponse>(
    args.botToken,
    "sendMessage",
    {
      chat_id: args.chatId,
      text: args.text,
      disable_web_page_preview: args.disableWebPagePreview ?? true,
    },
  );

  const messageId = data.result?.message_id;
  if (!messageId) {
    throw new Error("Telegram API did not return message_id");
  }

  return { messageId };
}
