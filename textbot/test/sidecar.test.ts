import { describe, expect, test } from "bun:test";
import type { Message, Space } from "spectrum-ts";
import type { InboundPayload } from "../src/backend";
import { BurstBatcher } from "../src/batcher";
import type { Config } from "../src/config";
import { deliver, prepare, type Prepared, type TurnExtras, type TurnResult } from "../src/handler";
import { SenderQueues } from "../src/queue";
import { channelFor, toPlainText } from "../src/render";
import { makeFetchHandler } from "../src/server";

const config: Config = {
  mode: "cloud", projectId: "p", projectSecret: "s", backendUrl: "http://backend",
  serviceSecret: "secret", port: 0, mergeWindowMs: 0, photoHoldMs: 60_000, testSenderPhone: "+14045550100",
};

function fakeSpace(type = "dm") {
  const sent: any[] = [];
  const space = {
    type,
    send: async (t: unknown) => { sent.push(t); },
    responding: async <T>(fn: () => Promise<T>) => fn(),
  } as unknown as Space;
  return { space, sent };
}

function fakeMessage(content: unknown, over: Record<string, unknown> = {}) {
  return {
    id: "m1", platform: "imessage", direction: "inbound", content,
    sender: { id: "+14045550100", service: "SMS" }, ...over,
  } as unknown as Message;
}

const prep = (space: Space, content: unknown, over = {}) => prepare(space, fakeMessage(content, over), config);
const photo = (bytes = "\xff\xd8photo") => ({
  type: "attachment", id: "a", name: "IMG.jpg", mimeType: "image/jpeg", size: bytes.length,
  read: async () => Buffer.from(bytes),
});

describe("prepare + deliver", () => {
  test("forwards text with channel and sends replies", async () => {
    const { space, sent } = fakeSpace();
    let payload: InboundPayload | undefined;
    const r = await deliver([prep(space, { type: "text", text: "Maria Lopez" })!], config, {},
      async (_u, _s, p) => { payload = p; return { replies: [{ text: "Now reply with your **PIN**." }] }; });
    expect(payload).toMatchObject({ sender: "+14045550100", text: "Maria Lopez", channel: "sms", attachment_count: 0 });
    expect(payload!.images).toBeUndefined();
    expect(sent).toEqual(["Now reply with your PIN."]);
    expect(r).toEqual({ active: false, hold: false });
  });

  test("photos are recognized; other files only counted", () => {
    const p = prep(fakeSpace().space, photo())!;
    expect(p.attachmentCount).toBe(1);
    expect(p.attachments.length).toBe(1);
    const gif = prep(fakeSpace().space, { ...photo(), mimeType: "video/mp4" })!;
    expect(gif.attachmentCount).toBe(1);
    expect(gif.attachments.length).toBe(0);
  });

  test("ignores outbound, groups, and reactions", () => {
    expect(prep(fakeSpace().space, { type: "text", text: "x" }, { direction: "outbound" })).toBeNull();
    expect(prep(fakeSpace("group").space, { type: "text", text: "x" })).toBeNull();
    expect(prep(fakeSpace().space, { type: "reaction", emoji: "x" })).toBeNull();
  });

  test("sends the map image after its text", async () => {
    const { space, sent } = fakeSpace();
    const png = Buffer.from("\x89PNGfake");
    await deliver([prep(space, { type: "text", text: "MAP" })!], config, {}, async () => ({
      replies: [{ text: "Map: Food", image: { data_base64: png.toString("base64"), name: "map.png", mime_type: "image/png" } }],
    }));
    expect(sent[0]).toBe("Map: Food");
    expect(sent.length).toBe(2);
    expect(typeof sent[1]).toBe("object");
  });

  test("backend down -> generic reply with no data", async () => {
    const { space, sent } = fakeSpace();
    await deliver([prep(space, { type: "text", text: "hi" })!], config, {}, async () => { throw new Error("down"); });
    expect(sent[0]).toContain("something went wrong");
  });
});

/** A fake backend for the batcher: records each turn, answers from a script. */
function scripted(answers: ((p: { text: string; extras: TurnExtras }) => TurnResult)[]) {
  const turns: { text: string; extras: TurnExtras }[] = [];
  const deliverFn = async (batch: Prepared[], extras: TurnExtras) => {
    const t = { text: batch.map((p) => p.text).filter(Boolean).join("\n"), extras };
    turns.push(t);
    return (answers[turns.length - 1] ?? (() => ({ active: true, hold: false })))(t);
  };
  return { turns, deliverFn };
}

describe("BurstBatcher", () => {
  const text = (t: string) => prep(fakeSpace().space, { type: "text", text: t })!;
  const pic = (caption = "") => {
    const p = prep(fakeSpace().space, photo())!;
    return caption ? { ...p, text: caption } : p;
  };
  const no = { active: false, hold: false };
  const yes = { active: true, hold: false };

  test("before sign-in, each message is its own turn", async () => {
    const { turns, deliverFn } = scripted([() => no, () => no]);
    const b = new BurstBatcher(deliverFn, 50);
    b.push(text("Maria Lopez"));
    b.push(text("4821"));
    await b.idle();
    expect(turns.map((t) => t.text)).toEqual(["Maria Lopez", "4821"]);
  });

  test("after sign-in, a burst is merged into one turn", async () => {
    const { turns, deliverFn } = scripted([() => yes]);
    const b = new BurstBatcher(deliverFn, 40);
    b.push(text("4821"));
    await b.idle();
    b.push(text("hey"));
    b.push(text("wait"));
    b.push(text("where can I eat tonight"));
    await new Promise((r) => setTimeout(r, 80));
    await b.idle();
    expect(turns.map((t) => t.text)).toEqual(["4821", "hey\nwait\nwhere can I eat tonight"]);
  });

  test("photo before sign-in stays here, then is sent after sign-in", async () => {
    const { turns, deliverFn } = scripted([() => no, () => no, () => yes, () => yes]);
    const b = new BurstBatcher(deliverFn, 0);
    b.push(pic("translate"));                 // not signed in
    await b.idle();
    expect(turns[0]!.extras.images).toBeUndefined();   // bytes withheld
    expect(turns[0]!.extras.imagesWithheld).toBe(true);
    expect(turns[0]!.text).toBe("");                    // caption held with the photo
    b.push(text("Maria Lopez"));
    b.push(text("4821"));                     // backend: signed in
    await b.idle();
    const last = turns[3]!;
    expect(last.text).toBe("translate");      // caption travels with the photo
    expect(last.extras.images?.length).toBe(1);
    expect(last.extras.imagesHeld).toBeFalsy();
  });

  test("hold_images: photos re-sent once with the next message", async () => {
    const { turns, deliverFn } = scripted([
      () => yes,                               // sign-in
      () => ({ active: true, hold: true }),    // photo -> "Reply 1 or 2"
      () => ({ active: true, hold: true }),    // "2" -> reading, offers SAVE
      () => yes,                               // "SAVE"
      () => yes,                               // "menu"
    ]);
    const b = new BurstBatcher(deliverFn, 0);
    for (const item of [text("4821"), pic(), text("2"), text("SAVE"), text("menu")]) {
      b.push(item);
      await b.idle(); // messages arrive one at a time
    }
    expect(turns[1]!.extras.images?.length).toBe(1);
    expect(turns[2]!.extras).toMatchObject({ imagesHeld: true });
    expect(turns[2]!.extras.images?.length).toBe(1);
    expect(turns[3]!.extras).toMatchObject({ imagesHeld: true });
    expect(turns[4]!.extras.images).toBeUndefined(); // dropped after use
  });

  test("new photos replace kept ones", async () => {
    const { turns, deliverFn } = scripted([() => yes, () => ({ active: true, hold: true }), () => yes]);
    const b = new BurstBatcher(deliverFn, 0);
    for (const item of [text("4821"), pic(), pic("1")]) {
      b.push(item);
      await b.idle();
    }
    expect(turns[2]!.extras.imagesHeld).toBeFalsy();
    expect(turns[2]!.extras.images?.length).toBe(1);
  });

  test("photo sent right after the PIN, before the reply, still gets read", async () => {
    const { turns, deliverFn } = scripted([() => no, () => yes, () => yes]);
    const b = new BurstBatcher(deliverFn, 0);
    b.push(text("Maria Lopez"));
    await b.idle();
    b.push(text("4821"));
    b.push(pic("1"));   // sidecar doesn't know yet that the PIN worked
    await b.idle();
    const withPhotos = turns.filter((t) => t.extras.images?.length);
    expect(withPhotos.length).toBe(1);
    expect(withPhotos[0]!.text).toBe("1");
    // the withheld turn carried no caption, so "1" never reached the backend as a command
    expect(turns.filter((t) => t.text === "1").length).toBe(1);
  });

  test("held photos expire; pre-sign-in expiry tells the client", async () => {
    const { space, sent } = fakeSpace();
    const { turns, deliverFn } = scripted([() => no, () => yes]);
    const b = new BurstBatcher(deliverFn, 0, 30);
    b.push({ ...prep(space, photo())! });
    await b.idle();
    await new Promise((r) => setTimeout(r, 60));
    expect(sent).toContain("I didn't get to read your photo. Sign in, then send it again.");
    b.push(text("4821"));
    await b.idle();
    expect(turns.length).toBe(2); // nothing re-sent after expiry
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
