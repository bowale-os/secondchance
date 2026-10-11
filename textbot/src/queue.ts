/**
 * One queue per sender: messages from the same number are handled strictly in
 * order (a name followed quickly by a PIN must hit the backend as two steps),
 * while different senders run in parallel.
 *
 * Bursts are not merged into one turn here. Sign-in needs each message on its
 * own; photo batching (phase 5) will collect attachments separately.
 */
export class SenderQueues {
  private tails = new Map<string, Promise<void>>();

  run(key: string, task: () => Promise<void>): Promise<void> {
    const prev = this.tails.get(key) ?? Promise.resolve();
    const next = prev.then(task).catch((err) => {
      console.error(`[textbot] handler failed: ${(err as Error).message}`);
    });
    this.tails.set(key, next);
    next.finally(() => {
      if (this.tails.get(key) === next) this.tails.delete(key);
    });
    return next;
  }

  get size(): number {
    return this.tails.size;
  }
}
