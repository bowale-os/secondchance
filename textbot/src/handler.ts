import type { Message, Space } from "spectrum-ts";
import { postInbound, type InboundResult } from "./backend";
import type { Config } from "./config";
import { extract } from "./extract";
import { channelFor, toPlainText } from "./render";

const FALLBACK = "Sorry, something went wrong. Please try again in a few minutes.";

export interface Deps {
  config: Config;
  post?: typeof postInbound;
}

/** Who sent this, as a phone number the backend can look up. */
export function senderPhone(message: Message, config: Config): string | null {
  if (message.platform === "terminal") return config.testSenderPhone;
  const id = message.sender?.id ?? "";
  return id || null;
}

function serviceOf(message: Message): string | undefined {
  const sender = message.sender as { service?: string } | undefined;
  return sender?.service;
}

export async function handleMessage(space: Space, message: Message, deps: Deps): Promise<void> {
  const { config } = deps;
  const post = deps.post ?? postInbound;
  if (message.direction !== "inbound") return;
  if ((space as { type?: string }).type === "group") return; // DMs only

  const phone = senderPhone(message, config);
  const body = extract(message.content);
  if (!phone || !body) return;

  const channel = channelFor(message.platform, serviceOf(message));
  let result: InboundResult;
  try {
    result = await post(config.backendUrl, config.serviceSecret, {
      sender: phone,
      text: body.text,
      channel,
      attachment_count: body.attachmentCount,
      message_id: message.id,
    });
  } catch (err) {
    console.error(`[textbot] backend unavailable: ${(err as Error).message}`);
    await space.send(FALLBACK);
    return;
  }

  if (result.replies.length === 0) return;
  await space.responding(async () => {
    for (const reply of result.replies) {
      // SMS/RCS and unknown channels get plain text; markdown is opt-in later.
      await space.send(toPlainText(reply.text));
    }
  });
}
