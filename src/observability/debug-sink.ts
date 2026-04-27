import type { DebugEvent, DebugSink } from "../core/types.js";

export class InMemoryDebugSink implements DebugSink {
  private readonly events: DebugEvent[] = [];

  emit(event: DebugEvent): void {
    this.events.push(event);
  }

  getTrace(requestId?: string): DebugEvent[] {
    if (!requestId) return [...this.events];
    return this.events.filter((event) => event.requestId === requestId);
  }

  clear(): void {
    this.events.length = 0;
  }
}
