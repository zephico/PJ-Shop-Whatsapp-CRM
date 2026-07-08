function trimText(input: string, maxLength: number): string {
  if (input.length <= maxLength) return input;
  return `${input.slice(0, maxLength - 1).trimEnd()}…`;
}

export function describeMessageForTelegram(
  contentType: string,
  contentText: string | null,
): string {
  if (contentText?.trim()) return trimText(contentText.trim(), 1200);

  switch (contentType) {
    case "image":
      return "[Image]";
    case "video":
      return "[Video]";
    case "audio":
      return "[Audio]";
    case "document":
      return "[Document]";
    case "location":
      return "[Location]";
    case "interactive":
      return "[Interactive reply]";
    default:
      return `[${contentType}]`;
  }
}

interface BuildInboundNotificationArgs {
  contactName: string | null;
  contactPhone: string;
  messagePreview: string;
  conversationId: string;
  appUrl: string | null;
}

export function buildInboundNotificationText(
  args: BuildInboundNotificationArgs,
): string {
  const lines = [
    "New WhatsApp message",
    "",
    `Contact: ${args.contactName?.trim() || "Unknown"}`,
    `Phone: ${args.contactPhone}`,
    `Conversation: ${args.conversationId}`,
    "",
    args.messagePreview,
    "",
    "Reply to this Telegram message to send a WhatsApp reply.",
  ];

  if (args.appUrl) {
    const baseUrl = args.appUrl.replace(/\/+$/, "");
    lines.push(`Open CRM: ${baseUrl}/inbox?c=${args.conversationId}`);
  }

  return lines.join("\n");
}

export function buildTelegramReplyConfirmation(
  contactName: string | null,
  replyText: string,
): string {
  return [
    `Sent WhatsApp reply to ${contactName?.trim() || "contact"}.`,
    "",
    trimText(replyText.trim(), 600),
  ].join("\n");
}
