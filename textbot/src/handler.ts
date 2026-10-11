import { attachment, type Message, type Space } from "spectrum-ts";
import { postInbound, type ImagePayload, type InboundResult } from "./backend";
import type { Config } from "./config";
import { type AttachmentRef, extract, MAX_BYTES, MAX_IMAGES } from "./extract";
import { channelFor, toPlainText } from "./render";

const FALLBACK = "Sorry, something went wrong. Please try again in a few minutes.";

/** One inbound message, reduced to what the backend needs. */
export interface Prepared {
  phone: string;
  text: string;
  attachmentCount: number;
  attachments: AttachmentRef[];
  /** Already-read images (photos we held and are now sending). */
  preloaded?: ImagePayload[];
  channel: string;
  messageId: string;
  space: Space;
}

export interface TurnExtras {
  images?: ImagePayload[];
  imagesHeld?: boolean;
  imagesWithheld?: boolean;
}

export interface TurnResult {
  active: boolean;
  hold: boolean;
}

/** Who sent this, as a phone number the backend can look up. */
export function senderPhone(message: Message, config: Config): string | null {
  if (message.platform === "terminal") return config.testSenderPhone;
  const id = message.sender?.id ?? "";
  return id || null;
}

function serviceOf(message: Message): string | undefined {
  return (message.sender as { service?: string } | undefined)?.service;
}

/** Null for messages the bot ignores: outbound, group chats, reactions, etc. */
export function prepare(space: Space, message: Message, config: Config): Prepared | null {
  if (message.direction !== "inbound") return null;
  if ((space as { type?: string }).type === "group") return null; // DMs only
  const phone = senderPhone(message, config);
  const body = extract(message.content);
  if (!phone || !body) return null;
  return {
    phone,
    text: body.text,
    attachmentCount: body.attachmentCount,
    attachments: body.attachments,
    channel: channelFor(message.platform, serviceOf(message)),
    messageId: message.id,
    space,
  };
}

/** Read the photos in a batch (max 5, 10 MB each). Unreadable ones are skipped. */
export async function loadImages(batch: Prepared[]): Promise<ImagePayload[]> {
  const out: ImagePayload[] = [];
  for (const p of batch) {
    if (p.preloaded) out.push(...p.preloaded);
    for (const a of p.attachments) {
      if (out.length >= MAX_IMAGES) break;
      try {
        const bytes = Buffer.from(await a.read());
        if (bytes.length > MAX_BYTES) continue;
        out.push({ data_base64: bytes.toString("base64"), mime_type: a.mimeType, name: a.name });
      } catch (err) {
        console.error(`[textbot] couldn't read attachment: ${(err as Error).message}`);
      }
    }
  }
  return out.slice(0, MAX_IMAGES);
}

/** Send one or more messages from the same sender to the backend as a single turn
 * and deliver the replies. */
export async function deliver(
  batch: Prepared[],
  config: Config,
  extras: TurnExtras = {},
  post: typeof postInbound = postInbound,
): Promise<TurnResult> {
  const last = batch[batch.length - 1];
  if (!last) return { active: false, hold: false };
  let result: InboundResult;
  try {
    result = await last.space.responding(() =>
      post(config.backendUrl, config.serviceSecret, {
        sender: last.phone,
        text: batch.map((p) => p.text).filter(Boolean).join("\n"),
        channel: last.channel,
        attachment_count: batch.reduce((n, p) => n + p.attachmentCount, 0),
        message_id: last.messageId,
        ...(extras.images?.length ? { images: extras.images } : {}),
        ...(extras.imagesHeld ? { images_held: true } : {}),
        ...(extras.imagesWithheld ? { images_withheld: true } : {}),
      }),
    );
  } catch (err) {
    console.error(`[textbot] backend unavailable: ${(err as Error).message}`);
    await last.space.send(FALLBACK);
    return { active: false, hold: false };
  }
  for (const reply of result.replies) {
    // Plain text so SMS/RCS read the same; markdown is opt-in later.
    if (reply.text) await last.space.send(toPlainText(reply.text));
    for (const file of [reply.image, reply.audio]) {
      if (!file) continue;
      await last.space.send(
        attachment(Buffer.from(file.data_base64, "base64"), { name: file.name, mimeType: file.mime_type }),
      );
    }
  }
  return { active: result.session_active === true, hold: result.hold_images === true };
}
