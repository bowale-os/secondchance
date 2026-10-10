import type { Content } from "spectrum-ts";

/** A file the client sent, read lazily (bytes stay in the sidecar until needed). */
export interface AttachmentRef {
  name: string;
  mimeType: string;
  size?: number;
  read: () => Promise<Uint8Array | Buffer>;
}

export interface Extracted {
  text: string;
  attachmentCount: number;
  attachments: AttachmentRef[];
}

const READABLE = /^(image\/(jpeg|png|webp|heic|heif)|application\/pdf)$/i;
export const MAX_BYTES = 10 * 1024 * 1024;
export const MAX_IMAGES = 5;

/** Photos/PDFs the backend can read. Other files still count toward attachmentCount. */
export function isReadable(a: { mimeType: string; size?: number }): boolean {
  return READABLE.test(a.mimeType) && (a.size === undefined || a.size <= MAX_BYTES);
}

/** Flatten a Spectrum message into text plus attachments. Returns null for content the
 * bot ignores (reactions, typing, read receipts, group events, edits). */
export function extract(content: Content): Extracted | null {
  switch (content.type) {
    case "text":
      return { text: content.text, attachmentCount: 0, attachments: [] };
    case "attachment": {
      const ref: AttachmentRef = {
        name: content.name, mimeType: content.mimeType, size: content.size,
        read: () => content.read(),
      };
      return { text: "", attachmentCount: 1, attachments: isReadable(ref) ? [ref] : [] };
    }
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
        attachments: parts.flatMap((p) => p.attachments),
      };
    }
    default:
      return null;
  }
}
