/**
 * textbot sidecar: message I/O only.
 *   Spectrum (iMessage / SMS / RCS, or terminal for local dev)
 *     -> POST {BACKEND_URL}/bot/inbound -> replies -> Spectrum
 *   Backend -> POST :TEXTBOT_PORT/send -> Spectrum (proactive, no-content texts)
 */
import { Spectrum, type Message, type Space } from "spectrum-ts";
import { imessage } from "spectrum-ts/providers/imessage";
import { terminal } from "spectrum-ts/providers/terminal";
import { loadConfig } from "./config";
import { BurstBatcher } from "./batcher";
import { deliver, prepare } from "./handler";
import { makeFetchHandler, type SendFn } from "./server";
import { toPlainText } from "./render";

const config = loadConfig();

interface Transport {
  messages: AsyncIterable<[Space, Message]>;
  send: SendFn;
}

async function cloudTransport(): Promise<Transport> {
  const app = await Spectrum({
    projectId: config.projectId,
    projectSecret: config.projectSecret,
    providers: [imessage.config()],
  });
  return {
    messages: app.messages,
    send: async (to, text) => {
      const im = imessage(app);
      const dm = await im.space.create(await im.user(to));
      await dm.send(toPlainText(text));
    },
  };
}

async function terminalTransport(): Promise<Transport> {
  const app = await Spectrum({ providers: [terminal.config()] });
  return {
    messages: app.messages,
    send: async (to, text) => {
      const space = await terminal(app).space.get("outbound");
      await space.send(`[to ${to}] ${text}`);
    },
  };
}

const { messages, send } =
  config.mode === "cloud" ? await cloudTransport() : await terminalTransport();

Bun.serve({
  port: config.port,
  hostname: config.mode === "cloud" ? "0.0.0.0" : "127.0.0.1",
  fetch: makeFetchHandler(config.serviceSecret, send),
});
if (config.mode === "cloud") {
  console.log(`[textbot] cloud mode; /send on :${config.port}`);
}

const batcher = new BurstBatcher((batch, extras) => deliver(batch, config, extras), config.mergeWindowMs, config.photoHoldMs);
for await (const [space, message] of messages) {
  const item = prepare(space, message, config);
  if (item) batcher.push(item);
}
