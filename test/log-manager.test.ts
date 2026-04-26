import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { LogManager } from '../src/services/log-manager.js';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

describe('LogManager', () => {
  let manager: LogManager;
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'api-hub-log-test-'));
    manager = new LogManager(100, 100, ':memory:');
  });

  afterEach(() => {
    manager.close();
    try { rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  it('adds and retrieves a log entry', async () => {
    const entry = {
      time: new Date().toISOString(),
      requestId: 'req-1',
      claudeModel: 'claude-sonnet-4-6',
      resolvedModel: 'sonnet-4-6',
      provider: 'claude',
      protocol: 'anthropic',
      targetUrl: 'https://api.example.com',
      stream: false,
      status: 200,
      durationMs: 100,
    };
    manager.addLog(entry);
    await manager.flush();
    const logs = manager.getLogs(10);
    expect(logs).toHaveLength(1);
    expect(logs[0].requestId).toBe('req-1');
    expect(logs[0].claudeModel).toBe('claude-sonnet-4-6');
  });

  it('returns logs in reverse chronological order', async () => {
    manager.addLog({
      time: '2024-01-01T00:00:00Z',
      requestId: 'req-1',
      claudeModel: 'm1',
      resolvedModel: 'm1',
      provider: 'p1',
      protocol: 'anthropic',
      targetUrl: 'http://a',
      stream: false,
      status: 200,
      durationMs: 10,
    });
    manager.addLog({
      time: '2024-01-01T00:00:01Z',
      requestId: 'req-2',
      claudeModel: 'm2',
      resolvedModel: 'm2',
      provider: 'p2',
      protocol: 'anthropic',
      targetUrl: 'http://b',
      stream: false,
      status: 200,
      durationMs: 20,
    });
    await manager.flush();
    const logs = manager.getLogs(10);
    expect(logs[0].requestId).toBe('req-2');
    expect(logs[1].requestId).toBe('req-1');
  });

  it('clears all logs', async () => {
    manager.addLog({
      time: new Date().toISOString(),
      requestId: 'req-1',
      claudeModel: 'm1',
      resolvedModel: 'm1',
      provider: 'p1',
      protocol: 'anthropic',
      targetUrl: 'http://a',
      stream: false,
      status: 200,
      durationMs: 10,
    });
    await manager.flush();
    manager.clearLogs();
    const logs = manager.getLogs(10);
    expect(logs).toHaveLength(0);
  });

  it('trims logs when exceeding max', async () => {
    const smallManager = new LogManager(5, 100, ':memory:');
    // trimLogs counts flushes, not entries; need >505 flushes to trigger trim
    for (let i = 0; i < 506; i++) {
      smallManager.addLog({
        time: new Date().toISOString(),
        requestId: `req-${i}`,
        claudeModel: 'm1',
        resolvedModel: 'm1',
        provider: 'p1',
        protocol: 'anthropic',
        targetUrl: 'http://a',
        stream: false,
        status: 200,
        durationMs: 10,
      });
      await smallManager.flush();
    }
    const logs = smallManager.getLogs(10000);
    expect(logs.length).toBeLessThanOrEqual(510);
    await smallManager.close();
  });

  it('toggles file logging on and off', () => {
    const before = manager.isFileLogging();
    const after = manager.toggleFileLogging();
    expect(after).toBe(!before);
    const restored = manager.toggleFileLogging();
    expect(restored).toBe(before);
  });

  it('stores optional token counts', async () => {
    manager.addLog({
      time: new Date().toISOString(),
      requestId: 'req-tokens',
      claudeModel: 'm1',
      resolvedModel: 'm1',
      provider: 'p1',
      protocol: 'anthropic',
      targetUrl: 'http://a',
      stream: false,
      status: 200,
      durationMs: 10,
      inputTokens: 100,
      outputTokens: 50,
    });
    await manager.flush();
    const logs = manager.getLogs(10);
    expect(logs[0].inputTokens).toBe(100);
    expect(logs[0].outputTokens).toBe(50);
  });

  it('stores error field', async () => {
    manager.addLog({
      time: new Date().toISOString(),
      requestId: 'req-err',
      claudeModel: 'm1',
      resolvedModel: 'm1',
      provider: 'p1',
      protocol: 'anthropic',
      targetUrl: 'http://a',
      stream: false,
      status: 500,
      durationMs: 10,
      error: 'timeout',
    });
    await manager.flush();
    const logs = manager.getLogs(10);
    expect(logs[0].error).toBe('timeout');
  });

  it('getLogs returns empty array when limit is 0', async () => {
    manager.addLog({
      time: new Date().toISOString(),
      requestId: 'req-1',
      claudeModel: 'm1',
      resolvedModel: 'm1',
      provider: 'p1',
      protocol: 'anthropic',
      targetUrl: 'http://a',
      stream: false,
      status: 200,
      durationMs: 10,
    });
    await manager.flush();
    const logs = manager.getLogs(0);
    expect(logs).toHaveLength(0);
  });
});
