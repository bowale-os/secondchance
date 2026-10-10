import type { Prepared } from "./handler";
import { SenderQueues } from "./queue";

export type Deliver = (batch: Prepared[]) => Promise<boolean>;

/**
 * Before sign-in, every message goes to the backend on its own (a name then a PIN
 * must stay two steps). Once the backend reports the sender is signed in, messages
 * sent within `windowMs` of each other are merged into one turn, so
 * "hey" / "wait" / "where can I eat tonight" becomes one question.
 *
 * Delivery for one sender is always serialized through SenderQueues.
 */
export class BurstBatcher {
  private signedIn = new Map<string, boolean>();
  private pending = new Map<string, { items: Prepared[]; timer: ReturnType<typeof setTimeout> }>();

  constructor(
    private readonly deliver: Deliver,
    private readonly windowMs: number,
    private readonly queues = new SenderQueues(),
  ) {}

  push(item: Prepared): void {
    const key = item.phone;
    if (!this.signedIn.get(key) || this.windowMs <= 0) {
      this.flush(key); // anything already waiting goes first
      this.enqueue(key, [item]);
      return;
    }
    const existing = this.pending.get(key);
    if (existing) clearTimeout(existing.timer);
    const items = existing ? [...existing.items, item] : [item];
    const timer = setTimeout(() => this.flush(key), this.windowMs);
    this.pending.set(key, { items, timer });
  }

  /** Send whatever is waiting for this sender now. */
  flush(key: string): void {
    const p = this.pending.get(key);
    if (!p) return;
    clearTimeout(p.timer);
    this.pending.delete(key);
    this.enqueue(key, p.items);
  }

  private enqueue(key: string, items: Prepared[]): Promise<void> {
    return this.queues.run(key, async () => {
      this.signedIn.set(key, await this.deliver(items));
    });
  }

  /** For tests and shutdown: wait until nothing is pending or in flight. */
  async idle(): Promise<void> {
    for (const key of [...this.pending.keys()]) this.flush(key);
    while (this.queues.size > 0) await new Promise((r) => setTimeout(r, 5));
  }
}
