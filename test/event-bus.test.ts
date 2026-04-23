import { describe, it, expect } from 'vitest';
import { EventBus } from '../src/services/event-bus.js';

describe('EventBus', () => {
  it('delivers events to subscribers', () => {
    const bus = new EventBus();
    const received: unknown[] = [];
    bus.subscribe(e => received.push(e));
    bus.emit('test', { msg: 'hello' });
    expect(received).toEqual([{ type: 'test', data: { msg: 'hello' } }]);
  });

  it('stops delivering after unsubscribe', () => {
    const bus = new EventBus();
    const received: unknown[] = [];
    const cb = (e: unknown) => received.push(e);
    bus.subscribe(cb);
    bus.emit('a', 1);
    bus.unsubscribe(cb);
    bus.emit('b', 2);
    expect(received).toHaveLength(1);
  });

  it('delivers to multiple subscribers independently', () => {
    const bus = new EventBus();
    const r1: unknown[] = [];
    const r2: unknown[] = [];
    bus.subscribe(e => r1.push(e));
    bus.subscribe(e => r2.push(e));
    bus.emit('x', 42);
    expect(r1).toHaveLength(1);
    expect(r2).toHaveLength(1);
    expect(r1[0]).toEqual(r2[0]);
  });
});
