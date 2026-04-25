import { describe, it, expect } from 'vitest';
import { deepMerge } from '../src/utils/deep-merge.js';

describe('deepMerge', () => {
  it('merges flat objects', () => {
    expect(deepMerge({ a: 1 }, { b: 2 })).toEqual({ a: 1, b: 2 });
  });

  it('overwrites existing keys', () => {
    expect(deepMerge({ a: 1 }, { a: 2 })).toEqual({ a: 2 });
  });

  it('recursively merges nested objects', () => {
    expect(deepMerge({ a: { b: 1, c: 2 } }, { a: { b: 3 } })).toEqual({ a: { b: 3, c: 2 } });
  });

  it('replaces arrays wholesale', () => {
    expect(deepMerge({ a: [1, 2] }, { a: [3] })).toEqual({ a: [3] });
  });

  it('does not mutate target or source', () => {
    const target = { a: 1 };
    const source = { b: 2 };
    deepMerge(target, source);
    expect(target).toEqual({ a: 1 });
    expect(source).toEqual({ b: 2 });
  });

  it('handles null values', () => {
    expect(deepMerge({ a: 1 }, { a: null })).toEqual({ a: null });
  });

  it('handles empty objects', () => {
    expect(deepMerge({}, { a: 1 })).toEqual({ a: 1 });
    expect(deepMerge({ a: 1 }, {})).toEqual({ a: 1 });
  });

  it('prevents __proto__ pollution', () => {
    const result = deepMerge({}, JSON.parse('{"__proto__":{"polluted":true}}') as Record<string, unknown>);
    // __proto__ should not be a key on the result object
    expect(Object.prototype.hasOwnProperty.call(result, '__proto__')).toBe(false);
    expect((Object.prototype as any).polluted).toBeUndefined();
  });

  it('prevents constructor pollution', () => {
    const result = deepMerge({}, { constructor: { prototype: { polluted: true } } } as Record<string, unknown>);
    // constructor should not be a key on the result object
    expect(Object.prototype.hasOwnProperty.call(result, 'constructor')).toBe(false);
  });

  it('prevents prototype pollution', () => {
    const result = deepMerge({}, { prototype: { polluted: true } } as Record<string, unknown>);
    expect(result.prototype).toBeUndefined();
  });
});
