import type { Message, Space } from "spectrum-ts";
import { postInbound, type InboundResult } from "./backend";
import type { Config } from "./config";
import { extract } from "./extract";
import { channelFor, toPlainText } from "./render";

const FALLBACK = "Sorry, something went wrong. Please try again in a few minutes.";

/** One inbound message, reduced to what the backend needs. */
export interface Prepared {
  phone: string;
  text: string;
  attachmentCount: number;
  channel: string;
  messageId: string;
  space: Space;
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
    channel: channelFor(message.platform, serviceOf(message)),
    messageId: message.id,
    space,
  };
}

/** Send one or more messages from the same sender to the backend as a single turn
 * and deliver the replies. Returns whether the sender is signed in afterwards. */
export async function deliver(
  batch: Prepared[],
  config: Config,
  post: typeof postInbound = postInbound,
): Promise<boolean> {
  const last = batch[batch.length - 1];
  if (!last) return false;
  let result: InboundResult;
  try {
    result = await post(config.backendUrl, config.serviceSecret, {
      sender: last.phone,
      text: batch.map((p) => p.text).filter(Boolean).join("\n"),
      channel: last.channel,
      attachment_count: batch.reduce((n, p) => n + p.attachmentCount, 0),
      message_id: last.messageId,
    });
  } catch (err) {
    console.error(`[textbot] backend unavailable: ${(err as Error).message}`);
    await last.space.send(FALLBACK);
    return false;
  }
  if (result.replies.length > 0) {
    await last.space.responding(async () => {
      for (const reply of result.replies) {
        // Plain text so SMS/RCS read the same; markdown is opt-in later.
        await last.space.send(toPlainText(reply.text));
      }
    });
  }
  return result.session_active === true;
}
