import { EventEmitter } from 'events';

export interface BusEvent {
  type: string;
  data: unknown;
  id: number;
}

type BusCallback = (event: BusEvent) => void;

export class EventBus {
  private emitter = new EventEmitter();
  private static readonly EVENT_NAME = 'bus';
  private eventId = 0;

  constructor() {
    this.emitter.setMaxListeners(100);
  }

  emit(type: string, data: unknown): void {
    this.eventId++;
    this.emitter.emit(EventBus.EVENT_NAME, { type, data, id: this.eventId });
  }

  subscribe(callback: BusCallback): void {
    this.emitter.on(EventBus.EVENT_NAME, callback);
  }

  unsubscribe(callback: BusCallback): void {
    this.emitter.off(EventBus.EVENT_NAME, callback);
  }
}
