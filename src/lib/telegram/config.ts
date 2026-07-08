function splitCsv(input: string | undefined): string[] {
  return (input ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

export interface TelegramConfig {
  botToken: string | null;
  allowedChatIds: string[];
  allowedUserIds: string[];
  webhookSecret: string | null;
  appUrl: string | null;
}

export function getTelegramConfig(): TelegramConfig {
  return {
    botToken:
      process.env.TELEGRAM_BOT_TOKEN?.trim() ||
      process.env.NEXT_PUBLIC_TELEGRAM_BOT_TOKEN?.trim() ||
      null,
    allowedChatIds: splitCsv(
      process.env.TELEGRAM_ALLOWED_CHAT_IDS ||
        process.env.NEXT_PUBLIC_TELEGRAM_ALLOWED_CHAT_IDS,
    ),
    allowedUserIds: splitCsv(
      process.env.TELEGRAM_ALLOWED_USER_IDS ||
        process.env.NEXT_PUBLIC_TELEGRAM_ALLOWED_USER_IDS,
    ),
    webhookSecret:
      process.env.TELEGRAM_WEBHOOK_SECRET?.trim() ||
      process.env.NEXT_PUBLIC_TELEGRAM_WEBHOOK_SECRET?.trim() ||
      null,
    appUrl:
      process.env.NEXT_PUBLIC_APP_URL?.trim() ||
      process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
      null,
  };
}

export function isTelegramEnabled(
  config: TelegramConfig = getTelegramConfig(),
): boolean {
  return Boolean(config.botToken && config.allowedChatIds.length > 0);
}

export function isAllowedTelegramChat(
  chatId: string,
  config: TelegramConfig = getTelegramConfig(),
): boolean {
  return config.allowedChatIds.includes(chatId);
}

export function isAllowedTelegramUser(
  userId: string | null,
  config: TelegramConfig = getTelegramConfig(),
): boolean {
  if (config.allowedUserIds.length === 0) return true;
  if (!userId) return false;
  return config.allowedUserIds.includes(userId);
}
