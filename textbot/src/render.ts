/** Per-channel rendering. Backend replies are plain text; this keeps SMS safe if
 * markdown slips in, and maps Spectrum's service names to backend channel names. */

export function toPlainText(text: string): string {
  return text
    .replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, "$1: $2") // [label](url) -> label: url
    .replace(/(\*\*|__)(.+?)\1/g, "$2")
    .replace(/(?<![\w*])\*(?!\s)(.+?)\*(?!\w)/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^#{1,6}\s+/gm, "");
}

export function channelFor(platform: string, service?: string): string {
  if (platform === "imessage") {
    switch ((service ?? "").toLowerCase()) {
      case "sms": return "sms";
      case "rcs": return "rcs";
      case "imessage": return "imessage";
      default: return "other";
    }
  }
  if (platform === "whatsapp-business" || platform === "whatsapp") return "whatsapp";
  if (platform === "telegram") return "telegram";
  return "other";
}
