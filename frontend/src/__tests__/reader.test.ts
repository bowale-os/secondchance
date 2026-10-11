import { describe, expect, it } from "vitest";
import { ndjsonLines, processPaper } from "../api/reader";
import { isUnsaved, keepReducer, parseMarkdown, type KeepState } from "../lib/reader";
import type { ProgressEvent } from "../types/reader";

function streamOf(chunks: string[]) {
  const enc = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(c) {
      for (const ch of chunks) c.enqueue(enc.encode(ch));
      c.close();
    },
  });
}

type Fake = NonNullable<NonNullable<Parameters<typeof processPaper>[3]>["fetchImpl"]>;

async function run(fetchImpl: Fake, signal?: AbortSignal) {
  const events: ProgressEvent[] = [];
  await processPaper(async () => "token", [], (e) => events.push(e), { fetchImpl, baseUrl: "http://api.test", signal });
  return events;
}

const ok = (chunks: string[]) => (async () => ({ ok: true, status: 200, body: streamOf(chunks), json: async () => ({}) })) as Fake;

describe("NDJSON stream", () => {
  it("joins lines split across network chunks", async () => {
    const lines: string[] = [];
    for await (const l of ndjsonLines(streamOf(['{"a":', '1}\n{"b"', ':2}\n\n{"c":3}']))) lines.push(l);
    expect(lines).toEqual(['{"a":1}', '{"b":2}', '{"c":3}']);
  });

  it("hands each event over as it arrives", async () => {
    expect(await run(ok(['{"stage":"reading"}\n', '{"stage":"done","receipt":"r"}\n'])))
      .toEqual([{ stage: "reading" }, { stage: "done", receipt: "r" }]);
  });

  it("sends the pages as a form with the bearer token", async () => {
    let seen: RequestInit | undefined;
    await run((async (_url: string, init: RequestInit) => {
      seen = init;
      return { ok: true, status: 200, body: streamOf(['{"stage":"done"}\n']), json: async () => ({}) };
    }) as Fake);
    expect(seen?.body).toBeInstanceOf(FormData);
    expect(seen?.headers).toEqual({ Authorization: "Bearer token" });
  });

  it("reports a dropped connection", async () => {
    const events = await run(ok(['{"stage":"reading"}\n']));
    expect(events[events.length - 1]).toMatchObject({ stage: "error", message: expect.stringMatching(/connection dropped/) });
  });

  it("explains being offline, and shows the server's own words for 429 and 413", async () => {
    expect((await run((async () => { throw new TypeError("Failed to fetch"); }) as Fake))[0])
      .toMatchObject({ stage: "error", message: expect.stringMatching(/internet connection/) });
    const limited = (async () => ({
      ok: false, status: 429, body: null, json: async () => ({ detail: "Demasiados papeles a la vez." }),
    })) as Fake;
    expect((await run(limited))[0]).toEqual({ stage: "error", message: "Demasiados papeles a la vez." });
  });

  it("stays quiet when the person cancelled", async () => {
    const controller = new AbortController();
    controller.abort();
    expect(await run((async () => { throw new DOMException("aborted", "AbortError"); }) as Fake, controller.signal)).toEqual([]);
  });
});

describe("Keep bar", () => {
  const start: KeepState = { status: "choosing" };

  it("keeps: choosing → saving → kept", () => {
    const saving = keepReducer(start, { type: "keep" });
    expect(saving).toEqual({ status: "saving" });
    expect(keepReducer(saving, { type: "saved", readingId: "r1" })).toEqual({ status: "kept", readingId: "r1" });
  });

  it("lets a failed save be retried or dropped", () => {
    const failed = keepReducer({ status: "saving" }, { type: "failed", message: "expired" });
    expect(failed).toEqual({ status: "error", message: "expired" });
    expect(keepReducer(failed, { type: "keep" })).toEqual({ status: "saving" });
    expect(keepReducer(failed, { type: "drop" })).toEqual({ status: "dropped" });
  });

  it("makes kept and dropped final, and ignores clicks while saving", () => {
    const kept: KeepState = { status: "kept", readingId: "r1" };
    expect(keepReducer(kept, { type: "drop" })).toBe(kept);
    expect(keepReducer({ status: "dropped" }, { type: "keep" })).toEqual({ status: "dropped" });
    expect(keepReducer({ status: "saving" }, { type: "drop" })).toEqual({ status: "saving" });
  });

  it("warns before leaving only while the choice is still open", () => {
    expect(isUnsaved(start)).toBe(true);
    expect(isUnsaved({ status: "error", message: "x" })).toBe(true);
    expect(isUnsaved({ status: "kept", readingId: "r1" })).toBe(false);
    expect(isUnsaved({ status: "dropped" })).toBe(false);
  });
});

describe("simple version", () => {
  it("reads headings, bullets and paragraphs, and drops bold markers", () => {
    expect(parseMarkdown("## What this is\nA **parole** paper.\n\n- Pay $30.00\n* Call")).toEqual([
      { kind: "heading", text: "What this is" },
      { kind: "para", text: "A parole paper." },
      { kind: "bullet", text: "Pay $30.00" },
      { kind: "bullet", text: "Call" },
    ]);
  });
});
