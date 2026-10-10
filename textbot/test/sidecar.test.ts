import { describe, expect, test } from "bun:test";
import type { Message, Space } from "spectrum-ts";
import type { Config } from "../src/config";
import { BurstBatcher } from "../src/batcher";
import { deliver, prepare } from "../src/handler";
import { SenderQueues } from "../src/queue";
import { channelFor, toPlainText } from "../src/render";
import { makeFetchHandler } from "../src/server";

const config: Config = {
  mode: "cloud", projectId: "p", projectSecret: "s", backendUrl: "http://backend",
  serviceSecret: "secret", port: 0, mergeWindowMs: 0, testSenderPhone: "+14045550100",
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

const prep = (space: Space, content: unknown, over = {}) =>
  prepare(space, fakeMessage(content, over), config);

describe("prepare + deliver", () => {
  test("forwards text with channel and sends replies", async () => {
    const { space, sent } = fakeSpace();
    let payload: any;
    const active = await deliver([prep(space, { type: "text", text: "Maria Lopez" })!], config,
      async (_u, _s, p) => { payload = p; return { replies: [{ text: "Now reply with your **PIN**." }] }; });
    expect(payload).toMatchObject({ sender: "+14045550100", text: "Maria Lopez", channel: "sms", attachment_count: 0 });
    expect(sent).toEqual(["Now reply with your PIN."]);
    expect(active).toBe(false);
  });

  test("counts attachments without sending bytes", () => {
    const p = prep(fakeSpace().space, { type: "attachment", id: "a", name: "x.jpg", mimeType: "image/jpeg" })!;
    expect(p.attachmentCount).toBe(1);
    expect(p.text).toBe("");
  });

  test("ignores outbound, groups, and reactions", () => {
    expect(prep(fakeSpace().space, { type: "text", text: "x" }, { direction: "outbound" })).toBeNull();
    expect(prep(fakeSpace("group").space, { type: "text", text: "x" })).toBeNull();
    expect(prep(fakeSpace().space, { type: "reaction", emoji: "x" })).toBeNull();
  });

  test("backend down -> generic reply with no data", async () => {
    const { space, sent } = fakeSpace();
    await deliver([prep(space, { type: "text", text: "hi" })!], config, async () => { throw new Error("down"); });
    expect(sent[0]).toContain("something went wrong");
  });
});

describe("BurstBatcher", () => {
  const text = (t: string) => prep(fakeSpace().space, { type: "text", text: t })!;

  test("before sign-in, each message is its own turn", async () => {
    const turns: string[][] = [];
    const b = new BurstBatcher(async (batch) => { turns.push(batch.map((p) => p.text)); return false; }, 50);
    b.push(text("Maria Lopez"));
    b.push(text("4821"));
    await b.idle();
    expect(turns).toEqual([["Maria Lopez"], ["4821"]]);
  });

  test("after sign-in, a burst is merged into one turn", async () => {
    const turns: string[][] = [];
    const b = new BurstBatcher(async (batch) => { turns.push(batch.map((p) => p.text)); return true; }, 40);
    b.push(text("4821"));            // backend says: signed in
    await b.idle();
    b.push(text("hey"));
    b.push(text("wait"));
    b.push(text("where can I eat tonight"));
    await new Promise((r) => setTimeout(r, 80));
    await b.idle();
    expect(turns).toEqual([["4821"], ["hey", "wait", "where can I eat tonight"]]);
  });

  test("merged text reaches the backend one line per message", async () => {
    let payload: any;
    const items = ["hey", "where can I eat"].map(text);
    await deliver(items, config, async (_u, _s, p) => { payload = p; return { replies: [] }; });
    expect(payload.text).toBe("hey\nwhere can I eat");
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
