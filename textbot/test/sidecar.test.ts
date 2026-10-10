import { describe, expect, test } from "bun:test";
import type { Message, Space } from "spectrum-ts";
import type { Config } from "../src/config";
import { handleMessage } from "../src/handler";
import { SenderQueues } from "../src/queue";
import { channelFor, toPlainText } from "../src/render";
import { makeFetchHandler } from "../src/server";

const config: Config = {
  mode: "cloud", projectId: "p", projectSecret: "s", backendUrl: "http://backend",
  serviceSecret: "secret", port: 0, testSenderPhone: "+14045550100",
};

function fakeSpace(type = "dm") {
  const sent: string[] = [];
  const space = {
    type,
    send: async (t: string) => { sent.push(t); },
    responding: async (fn: () => Promise<void>) => fn(),
  } as unknown as Space;
  return { space, sent };
}

function fakeMessage(content: unknown, over: Partial<Record<string, unknown>> = {}) {
  return {
    id: "m1", platform: "imessage", direction: "inbound", content,
    sender: { id: "+14045550100", service: "SMS" }, ...over,
  } as unknown as Message;
}

describe("handleMessage", () => {
  test("forwards text with channel and sends replies", async () => {
    const { space, sent } = fakeSpace();
    let payload: any;
    await handleMessage(space, fakeMessage({ type: "text", text: "Maria Lopez" }), {
      config,
      post: async (_u, _s, p) => { payload = p; return { replies: [{ text: "Now reply with your **PIN**." }] }; },
    });
    expect(payload).toMatchObject({ sender: "+14045550100", text: "Maria Lopez", channel: "sms", attachment_count: 0 });
    expect(sent).toEqual(["Now reply with your PIN."]);
  });

  test("counts attachments without sending bytes", async () => {
    const { space } = fakeSpace();
    let payload: any;
    await handleMessage(space, fakeMessage({ type: "attachment", id: "a", name: "x.jpg", mimeType: "image/jpeg" }), {
      config, post: async (_u, _s, p) => { payload = p; return { replies: [] }; },
    });
    expect(payload.attachment_count).toBe(1);
    expect(payload.text).toBe("");
  });

  test("ignores outbound, groups, and reactions", async () => {
    let calls = 0;
    const post = async () => { calls++; return { replies: [] }; };
    await handleMessage(fakeSpace().space, fakeMessage({ type: "text", text: "x" }, { direction: "outbound" }), { config, post });
    await handleMessage(fakeSpace("group").space, fakeMessage({ type: "text", text: "x" }), { config, post });
    await handleMessage(fakeSpace().space, fakeMessage({ type: "reaction", emoji: "x" }), { config, post });
    expect(calls).toBe(0);
  });

  test("backend down -> generic reply with no data", async () => {
    const { space, sent } = fakeSpace();
    await handleMessage(space, fakeMessage({ type: "text", text: "hi" }), {
      config, post: async () => { throw new Error("down"); },
    });
    expect(sent[0]).toContain("something went wrong");
  });
});

describe("SenderQueues", () => {
  test("same sender runs in order, others in parallel", async () => {
    const q = new SenderQueues();
    const log: string[] = [];
    const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
    await Promise.all([
      q.run("a", async () => { await wait(30); log.push("a1"); }),
      q.run("a", async () => { log.push("a2"); }),
      q.run("b", async () => { log.push("b1"); }),
    ]);
    expect(log).toEqual(["b1", "a1", "a2"]);
    expect(q.size).toBe(0);
  });
});

describe("render", () => {
  test("plain text for SMS", () => {
    expect(toPlainText("**Bold** and [map](https://x.y/z)")).toBe("Bold and map: https://x.y/z");
  });
  test("channel mapping", () => {
    expect(channelFor("imessage", "iMessage")).toBe("imessage");
    expect(channelFor("imessage", "RCS")).toBe("rcs");
    expect(channelFor("telegram")).toBe("telegram");
  });
});

describe("/send", () => {
  const sent: [string, string][] = [];
  const handler = makeFetchHandler("secret", async (to, text) => { sent.push([to, text]); });
  const req = (body: unknown, auth = "Bearer secret") =>
    new Request("http://x/send", { method: "POST", headers: { authorization: auth }, body: JSON.stringify(body) });

  test("rejects bad secret", async () => {
    expect((await handler(req({ to: "+14045550100", text: "hi" }, "Bearer nope"))).status).toBe(401);
  });
  test("rejects non-E.164", async () => {
    expect((await handler(req({ to: "404-555-0100", text: "hi" }))).status).toBe(422);
  });
  test("sends", async () => {
    expect((await handler(req({ to: "+14045550100", text: "hi" }))).status).toBe(200);
    expect(sent).toEqual([["+14045550100", "hi"]]);
  });
});
