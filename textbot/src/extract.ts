import type { Content } from "spectrum-ts";

export interface Extracted {
  text: string;
  attachmentCount: number;
}

/** Flatten a Spectrum message into the text and attachment count the backend
 * needs. Attachment bytes stay here until photos ship (phase 5). Returns null for
 * content the bot ignores (reactions, typing, read receipts, group events). */
export function extract(content: Content): Extracted | null {
  switch (content.type) {
    case "text":
      return { text: content.text, attachmentCount: 0 };
    case "attachment":
      return { text: "", attachmentCount: 1 };
    case "reply":
    case "effect":
      return extract(content.content as Content);
    case "edit":
      return null; // an edited PIN or name shouldn't be re-processed
    case "group": {
      const parts = content.items
        .map((m) => extract(m.content))
        .filter((e): e is Extracted => e !== null);
      if (parts.length === 0) return null;
      return {
        text: parts.map((p) => p.text).filter(Boolean).join("\n"),
        attachmentCount: parts.reduce((n, p) => n + p.attachmentCount, 0),
      };
    }
    default:
      return null;
  }
}
