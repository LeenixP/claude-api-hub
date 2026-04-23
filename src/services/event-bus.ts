import { EventEmitter } from 'events';

export interface BusEvent {
  type: string;
  data: unknown;
}

type BusCallback = (event: BusEvent) => void;

export class EventBus {
  private emitter = new EventEmitter();
  private static readonly EVENT_NAME = 'bus';

  constructor() {
    this.emitter.setMaxListeners(0);
  }

  emit(type: string, data: unknown): void {
    this.emitter.emit(EventBus.EVENT_NAME, { type, data });
  }

  subscribe(callback: BusCallback): void {
    this.emitter.on(EventBus.EVENT_NAME, callback);
  }

  unsubscribe(callback: BusCallback): void {
    this.emitter.off(EventBus.EVENT_NAME, callback);
  }
}
