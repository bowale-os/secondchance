import type { ImagePayload } from "./backend";
import { loadImages, type Prepared, type TurnExtras, type TurnResult } from "./handler";
import { SenderQueues } from "./queue";

export type Deliver = (batch: Prepared[], extras: TurnExtras) => Promise<TurnResult>;

const EXPIRED_NOTICE = "I didn't get to read your photo. Sign in, then send it again.";

interface Held {
  images: Promise<ImagePayload[]>;
  caption: string;
  /** until_signin: never sent to the backend yet. next_turn: backend asked us to keep them. */
  mode: "until_signin" | "next_turn";
  last: Prepared;
  timer: ReturnType<typeof setTimeout>;
}

/**
 * Per sender:
 * - Before sign-in, every message goes alone (name, then PIN), and photos are held here,
 *   never sent to the backend. After sign-in they are sent as their own turn.
 * - After sign-in, messages within `windowMs` are merged into one turn (one line each),
 *   and several photos in a burst become one multi-page job.
 * - When the backend replies hold_images, the turn's photos are kept and re-sent once with
 *   the next message (for "1 / 2" or SAVE), flagged images_held.
 * Held photos are dropped after `holdMs`.
 */
export class BurstBatcher {
  private signedIn = new Map<string, boolean>();
  private pending = new Map<string, { items: Prepared[]; timer: ReturnType<typeof setTimeout> }>();
  private held = new Map<string, Held>();

  constructor(
    private readonly deliver: Deliver,
    private readonly windowMs: number,
    private readonly holdMs = 10 * 60_000,
    private readonly queues = new SenderQueues(),
  ) {}

  push(item: Prepared): void {
    const key = item.phone;
    if (!this.signedIn.get(key)) {
      let toSend = item;
      if (item.attachments.length) {
        this.hold(key, "until_signin", loadImages([item]), item.text, item);
        // The caption travels with the photos, never on its own (it isn't a name, PIN or command).
        toSend = { ...item, attachments: [], text: "" };
      }
      this.flush(key);
      this.enqueue(key, [toSend], toSend !== item);
      return;
    }
    if (this.windowMs <= 0) {
      this.enqueue(key, [item]);
      return;
    }
    const existing = this.pending.get(key);
    if (existing) clearTimeout(existing.timer);
    const items = existing ? [...existing.items, item] : [item];
    this.pending.set(key, { items, timer: setTimeout(() => this.flush(key), this.windowMs) });
  }

  /** Send whatever is waiting for this sender now. */
  flush(key: string): void {
    const p = this.pending.get(key);
    if (!p) return;
    clearTimeout(p.timer);
    this.pending.delete(key);
    this.enqueue(key, p.items);
  }

  private hold(key: string, mode: Held["mode"], images: Promise<ImagePayload[]>, caption: string, last: Prepared) {
    this.drop(key);
    const timer = setTimeout(() => {
      if (this.held.get(key)?.timer !== timer) return;
      this.held.delete(key);
      if (mode === "until_signin") void last.space.send(EXPIRED_NOTICE).catch(() => {});
    }, this.holdMs);
    this.held.set(key, { images, caption, mode, last, timer });
  }

  private drop(key: string): Held | undefined {
    const h = this.held.get(key);
    if (h) {
      clearTimeout(h.timer);
      this.held.delete(key);
    }
    return h;
  }

  private enqueue(key: string, items: Prepared[], withheld = false): Promise<void> {
    return this.queues.run(key, async () => {
      const extras: TurnExtras = { imagesWithheld: withheld };
      const own = withheld ? [] : await loadImages(items);
      const h = this.held.get(key);
      if (own.length) {
        extras.images = own;
        if (h?.mode === "next_turn") this.drop(key); // new photos replace kept ones
      } else if (h?.mode === "next_turn") {
        this.drop(key);
        extras.images = await h.images;
        extras.imagesHeld = true;
      }

      const result = await this.deliver(items, extras);
      this.signedIn.set(key, result.active);

      if (result.hold && extras.images?.length) {
        const last = items[items.length - 1]!;
        this.hold(key, result.active ? "next_turn" : "until_signin", Promise.resolve(extras.images), "", last);
      }
      const waiting = this.held.get(key);
      if (result.active && waiting?.mode === "until_signin") {
        this.drop(key);
        const images = await waiting.images;
        if (images.length) {
          const last = items[items.length - 1] ?? waiting.last;
          void this.enqueue(key, [{ ...last, text: waiting.caption, attachments: [], attachmentCount: images.length, preloaded: images }]);
        }
      }
    });
  }

  /** For tests and shutdown: wait until nothing is pending or in flight. */
  async idle(): Promise<void> {
    for (const key of [...this.pending.keys()]) this.flush(key);
    while (this.queues.size > 0) await new Promise((r) => setTimeout(r, 5));
  }
}
