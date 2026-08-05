// Fixed-capacity ring buffer. A plain array + shift() would make every push
// past capacity an O(n) operation (shift re-indexes the whole array), which
// adds up over a long-running agent that keeps emitting events after the
// buffer is full. This keeps push at O(1) by overwriting the oldest slot in
// place and tracking the logical start index instead of moving elements.

export class RingBuffer<T> {
  private readonly items: (T | undefined)[];
  private start = 0;
  private count = 0;
  private dropped = 0;

  constructor(private readonly capacity: number) {
    if (capacity < 1) {
      throw new Error("RingBuffer capacity must be at least 1");
    }
    this.items = new Array(capacity);
  }

  push(item: T): void {
    if (this.count === this.capacity) {
      this.items[this.start] = item;
      this.start = (this.start + 1) % this.capacity;
      this.dropped += 1;
      return;
    }
    const index = (this.start + this.count) % this.capacity;
    this.items[index] = item;
    this.count += 1;
  }

  toArray(): T[] {
    const result: T[] = [];
    for (let i = 0; i < this.count; i += 1) {
      result.push(this.items[(this.start + i) % this.capacity] as T);
    }
    return result;
  }

  /**
   * Snapshot and clear in one synchronous call. JS has no preemption between
   * synchronous statements, so nothing can push() in the middle of this and
   * end up silently dropped or double-drained - the flush loop relies on that.
   */
  drain(): T[] {
    const result = this.toArray();
    this.items.fill(undefined);
    this.start = 0;
    this.count = 0;
    return result;
  }

  get droppedCount(): number {
    return this.dropped;
  }

  get size(): number {
    return this.count;
  }
}
