import { mkdirSync, readdirSync } from 'fs';
import { readdir, unlink, appendFile } from 'fs/promises';
import { homedir } from 'os';
import { join } from 'path';
import { logger } from '../logger.js';
import { getErrorMessage } from '../utils/error.js';
import { DatabaseSync } from 'node:sqlite';
import type { EventBus } from './event-bus.js';
import { MAX_LOG_ROWS, MAX_LOG_FILES } from '../constants.js';

export interface LogEntry {
  time: string;
  requestId: string;
  claudeModel: string;
  resolvedModel: string;
  provider: string;
  protocol: string;
  targetUrl: string;
  stream: boolean;
  status: number;
  durationMs: number;
  inputTokens?: number;
  outputTokens?: number;
  error?: string;
  logFile?: string;
}

export interface LogDetail {
  originalBody?: string;
  requestBody?: string;
  upstreamBody?: string;
  forwardedHeaders?: Record<string, string>;
}

export class LogManager {
  readonly logDir: string;
  private readonly maxLogs: number;
  private readonly maxLogFiles: number;
  private db: InstanceType<typeof DatabaseSync>;
  private stmtInsert: ReturnType<InstanceType<typeof DatabaseSync>['prepare']>;
  private stmtGetLogs: ReturnType<InstanceType<typeof DatabaseSync>['prepare']>;
  private stmtClear: ReturnType<InstanceType<typeof DatabaseSync>['prepare']>;
  private stmtCount: ReturnType<InstanceType<typeof DatabaseSync>['prepare']>;
  private stmtTrim: ReturnType<InstanceType<typeof DatabaseSync>['prepare']>;
  private stmtUpsertStats: ReturnType<InstanceType<typeof DatabaseSync>['prepare']>;
  private stmtGetSetting: ReturnType<InstanceType<typeof DatabaseSync>['prepare']>;
  private stmtSetSetting: ReturnType<InstanceType<typeof DatabaseSync>['prepare']>;

  private eventBus?: EventBus;

  private buffer: Array<{ entry: LogEntry; detail?: LogDetail }> = [];
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private readonly flushIntervalMs = 1000;
  private readonly maxBufferSize = 20;

  constructor(maxLogs = MAX_LOG_ROWS, maxLogFiles = MAX_LOG_FILES, dbPath?: string, eventBus?: EventBus) {
    this.eventBus = eventBus;
    this.maxLogs = maxLogs;
    this.maxLogFiles = maxLogFiles;
    this.logDir = join(homedir(), '.claude-api-hub', 'logs');
    try { mkdirSync(this.logDir, { recursive: true }); } catch (err) { logger.warn('Failed to create log directory', { error: getErrorMessage(err) }); }

    const resolvedDbPath = dbPath ?? join(homedir(), '.claude-api-hub', 'data.db');
    if (resolvedDbPath !== ':memory:') {
      try { mkdirSync(join(homedir(), '.claude-api-hub'), { recursive: true }); } catch (err) { logger.warn('Failed to create data directory', { error: getErrorMessage(err) }); }
    }

    this.db = new DatabaseSync(resolvedDbPath);
    this.db.exec('PRAGMA journal_mode=WAL');
    this.db.exec('PRAGMA busy_timeout=3000');
    this.db.exec('PRAGMA synchronous=NORMAL');
    this.db.exec('PRAGMA cache_size=-8000');
    this.db.exec('PRAGMA temp_store=MEMORY');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS request_logs (
        id             INTEGER PRIMARY KEY AUTOINCREMENT,
        request_id     TEXT    NOT NULL,
        time           TEXT    NOT NULL,
        claude_model   TEXT    NOT NULL DEFAULT '',
        resolved_model TEXT    NOT NULL DEFAULT '',
        provider       TEXT    NOT NULL DEFAULT '',
        protocol       TEXT    NOT NULL DEFAULT '',
        target_url     TEXT    NOT NULL DEFAULT '',
        stream         INTEGER NOT NULL DEFAULT 0,
        status         INTEGER NOT NULL DEFAULT 0,
        duration_ms    INTEGER NOT NULL DEFAULT 0,
        input_tokens   INTEGER DEFAULT 0,
        output_tokens  INTEGER DEFAULT 0,
        error          TEXT,
        log_file       TEXT
      )
    `);
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_logs_time ON request_logs(time)');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS settings (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )
    `);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS aggregated_stats (
        date             TEXT NOT NULL,
        provider         TEXT NOT NULL DEFAULT '',
        model            TEXT NOT NULL DEFAULT '',
        prompt_tokens    INTEGER DEFAULT 0,
        completion_tokens INTEGER DEFAULT 0,
        request_count    INTEGER DEFAULT 0,
        PRIMARY KEY (date, provider, model)
      )
    `);

    this.stmtInsert = this.db.prepare(`
      INSERT INTO request_logs (request_id, time, claude_model, resolved_model, provider, protocol, target_url, stream, status, duration_ms, input_tokens, output_tokens, error, log_file)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    this.stmtUpsertStats = this.db.prepare(`
      INSERT INTO aggregated_stats (date, provider, model, prompt_tokens, completion_tokens, request_count)
      VALUES (?, ?, ?, ?, ?, 1)
      ON CONFLICT(date, provider, model) DO UPDATE SET
        prompt_tokens = prompt_tokens + excluded.prompt_tokens,
        completion_tokens = completion_tokens + excluded.completion_tokens,
        request_count = request_count + 1
    `);
    this.stmtGetLogs = this.db.prepare('SELECT * FROM request_logs ORDER BY id DESC LIMIT ? OFFSET ?');
    this.stmtClear = this.db.prepare('DELETE FROM request_logs');
    this.stmtCount = this.db.prepare('SELECT COUNT(*) as cnt FROM request_logs');
    this.stmtTrim = this.db.prepare('DELETE FROM request_logs WHERE id IN (SELECT id FROM request_logs ORDER BY id ASC LIMIT ?)');
    this.stmtGetSetting = this.db.prepare('SELECT value FROM settings WHERE key = ?');
    this.stmtSetSetting = this.db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');

    this.flushTimer = setInterval(() => {
      this.flush().catch(err => {
        logger.warn('Scheduled log flush failed', { error: getErrorMessage(err) });
      });
    }, this.flushIntervalMs);
  }

  private rowToLogEntry(row: Record<string, unknown>): LogEntry {
    return {
      time: row.time as string,
      requestId: row.request_id as string,
      claudeModel: row.claude_model as string,
      resolvedModel: row.resolved_model as string,
      provider: row.provider as string,
      protocol: row.protocol as string,
      targetUrl: row.target_url as string,
      stream: row.stream === 1,
      status: row.status as number,
      durationMs: row.duration_ms as number,
      inputTokens: (row.input_tokens as number) || undefined,
      outputTokens: (row.output_tokens as number) || undefined,
      error: (row.error as string) || undefined,
      logFile: (row.log_file as string) || undefined,
    };
  }

  addLog(entry: LogEntry, detail?: LogDetail): void {
    if (this.isFileLogging() && detail) {
      this.cleanLogDir();
      const filename = entry.requestId + '.json';
      const filepath = join(this.logDir, filename);
      appendFile(filepath, JSON.stringify({ ...entry, ...detail }, null, 2), 'utf-8')
        .then(() => { entry.logFile = filepath; })
        .catch((err) => { logger.warn('Failed to write log file', { error: getErrorMessage(err) }); });
    }

    this.buffer.push({ entry, detail });
    if (this.buffer.length >= this.maxBufferSize) {
      this.flush().catch(err => {
        logger.warn('Immediate log flush failed', { error: getErrorMessage(err) });
      });
    }
  }

  async flush(): Promise<void> {
    if (this.buffer.length === 0) return;
    const batch = this.buffer.splice(0, this.buffer.length);
    try {
      this.db.exec('BEGIN TRANSACTION');
      for (const { entry } of batch) {
        this.stmtInsert.run(
          entry.requestId, entry.time, entry.claudeModel, entry.resolvedModel,
          entry.provider, entry.protocol, entry.targetUrl, entry.stream ? 1 : 0,
          entry.status, entry.durationMs, entry.inputTokens ?? 0, entry.outputTokens ?? 0,
          entry.error ?? null, entry.logFile ?? null
        );
        // Aggregate into daily stats (not affected by trimLogs)
        const date = entry.time.slice(0, 10);
        this.stmtUpsertStats.run(
          date, entry.provider, entry.resolvedModel,
          entry.inputTokens ?? 0, entry.outputTokens ?? 0,
        );
        this.eventBus?.emit('log', entry);
      }
      this.db.exec('COMMIT');
      this.trimLogs();
    } catch (err) {
      try { this.db.exec('ROLLBACK'); } catch { /* ignore */ }
      logger.warn('Failed to flush logs to database', { error: getErrorMessage(err), count: batch.length });
      this.buffer.unshift(...batch);
      throw err;
    }
  }

  getLogs(limit = 200, offset = 0): LogEntry[] {
    try {
      const rows = this.stmtGetLogs.all(limit, offset) as Record<string, unknown>[];
      return rows.map(r => this.rowToLogEntry(r));
    } catch (err) { logger.warn('Failed to read logs', { error: getErrorMessage(err) }); return []; }
  }

  getLogCount(): number {
    try {
      const row = this.stmtCount.get() as { cnt: number };
      return row.cnt;
    } catch (err) { logger.warn('Failed to count logs', { error: getErrorMessage(err) }); return 0; }
  }

  clearLogs(): void {
    try { this.stmtClear.run(); } catch (err) { logger.warn('Failed to clear logs', { error: getErrorMessage(err) }); }
  }

  isFileLogging(): boolean {
    try {
      const row = this.stmtGetSetting.get('logToFile') as { value: string } | undefined;
      return row?.value === 'true';
    } catch (err) { logger.warn('Failed to read log setting', { error: getErrorMessage(err) }); return false; }
  }

  toggleFileLogging(): boolean {
    const current = this.isFileLogging();
    const next = !current;
    try { this.stmtSetSetting.run('logToFile', next.toString()); } catch (err) { logger.warn('Failed to toggle file logging', { error: getErrorMessage(err) }); }
    return next;
  }

  getFileCount(): number {
    try {
      return readdirSync(this.logDir).filter(f => f.endsWith('.json')).length;
    } catch (err) { logger.warn('Failed to count log files', { error: getErrorMessage(err) }); return 0; }
  }

  get maxFiles(): number {
    return this.maxLogFiles;
  }

  getTokenStats(): {
    summary: { totalTokens: number; promptTokens: number; completionTokens: number; requestCount: number };
    byProvider: Array<{ provider: string; totalTokens: number; promptTokens: number; completionTokens: number; requestCount: number }>;
    byModel: Array<{ model: string; totalTokens: number; promptTokens: number; completionTokens: number; requestCount: number }>;
    daily: Array<{ date: string; totalTokens: number; promptTokens: number; completionTokens: number; requestCount: number }>;
  } {
    try {
      const summaryRow = this.db.prepare(`
        SELECT COALESCE(SUM(prompt_tokens), 0) AS promptTokens,
               COALESCE(SUM(completion_tokens), 0) AS completionTokens,
               COALESCE(SUM(request_count), 0) AS requestCount
        FROM aggregated_stats
      `).get() as { promptTokens: number; completionTokens: number; requestCount: number };
      const summary = {
        totalTokens: summaryRow.promptTokens + summaryRow.completionTokens,
        promptTokens: summaryRow.promptTokens,
        completionTokens: summaryRow.completionTokens,
        requestCount: summaryRow.requestCount,
      };

      const byProviderRows = this.db.prepare(`
        SELECT provider,
               COALESCE(SUM(prompt_tokens), 0) AS promptTokens,
               COALESCE(SUM(completion_tokens), 0) AS completionTokens,
               COALESCE(SUM(request_count), 0) AS requestCount
        FROM aggregated_stats
        WHERE provider != ''
        GROUP BY provider
        ORDER BY SUM(prompt_tokens + completion_tokens) DESC
      `).all() as Array<{ provider: string; promptTokens: number; completionTokens: number; requestCount: number }>;
      const byProvider = byProviderRows.map(r => ({
        provider: r.provider,
        totalTokens: r.promptTokens + r.completionTokens,
        promptTokens: r.promptTokens,
        completionTokens: r.completionTokens,
        requestCount: r.requestCount,
      }));

      const byModelRows = this.db.prepare(`
        SELECT provider,
               model,
               COALESCE(SUM(prompt_tokens), 0) AS promptTokens,
               COALESCE(SUM(completion_tokens), 0) AS completionTokens,
               COALESCE(SUM(request_count), 0) AS requestCount
        FROM aggregated_stats
        WHERE model != ''
        GROUP BY provider, model
        ORDER BY SUM(prompt_tokens + completion_tokens) DESC
      `).all() as Array<{ provider: string; model: string; promptTokens: number; completionTokens: number; requestCount: number }>;
      const byModel = byModelRows.map(r => ({
        provider: r.provider,
        model: r.model,
        totalTokens: r.promptTokens + r.completionTokens,
        promptTokens: r.promptTokens,
        completionTokens: r.completionTokens,
        requestCount: r.requestCount,
      }));

      const dailyRows = this.db.prepare(`
        SELECT date,
               COALESCE(SUM(prompt_tokens), 0) AS promptTokens,
               COALESCE(SUM(completion_tokens), 0) AS completionTokens,
               COALESCE(SUM(request_count), 0) AS requestCount
        FROM aggregated_stats
        WHERE date >= date('now', '-30 days')
        GROUP BY date
        ORDER BY date ASC
      `).all() as Array<{ date: string; promptTokens: number; completionTokens: number; requestCount: number }>;
      const daily = dailyRows.map(r => ({
        date: r.date,
        totalTokens: r.promptTokens + r.completionTokens,
        promptTokens: r.promptTokens,
        completionTokens: r.completionTokens,
        requestCount: r.requestCount,
      }));

      return { summary, byProvider, byModel, daily };
    } catch (err) {
      logger.warn('Failed to get token stats', { error: getErrorMessage(err) });
      return {
        summary: { totalTokens: 0, promptTokens: 0, completionTokens: 0, requestCount: 0 },
        byProvider: [],
        byModel: [],
        daily: [],
      };
    }
  }

  async close(): Promise<void> {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    try {
      await this.flush();
    } catch (err) {
      logger.warn('Failed to flush logs during close', { error: getErrorMessage(err) });
    }
    try { this.db.close(); } catch (err) { logger.warn('Failed to close database', { error: getErrorMessage(err) }); }
  }

  private trimLogs(): void {
    try {
      const row = this.stmtCount.get() as { cnt: number };
      const overflow = row.cnt - this.maxLogs;
      if (overflow > 0) {
        this.stmtTrim.run(overflow);
      }
    } catch (err) { logger.warn('Failed to trim logs', { error: getErrorMessage(err) }); }
  }

  private cleanLogDir(): void {
    readdir(this.logDir).then(files => {
      const jsonFiles = files.filter(f => f.endsWith('.json'));
      if (jsonFiles.length < this.maxLogFiles) return;
      jsonFiles.sort();
      const toDelete = jsonFiles.slice(0, Math.floor(jsonFiles.length / 2));
      Promise.all(toDelete.map(f => unlink(join(this.logDir, f)).catch((err) => { logger.warn(`Failed to delete log file ${f}`, { error: getErrorMessage(err) }); }))).catch((err) => { logger.warn('Failed to clean log directory', { error: getErrorMessage(err) }); });
    }).catch((err) => { logger.warn('Failed to read log directory', { error: getErrorMessage(err) }); });
  }

  // ─── Persistent cumulative totals (survives restarts) ───

  /** Save RateTracker cumulative state to SQLite settings table. */
  saveCumulativeTotals(totals: { totalTokens: number; totalRequests: number; maxQps: number; maxRpm: number; maxTps: number }): void {
    try {
      this.stmtSetSetting.run('totalTokens', String(totals.totalTokens));
      this.stmtSetSetting.run('totalRequests', String(totals.totalRequests));
      this.stmtSetSetting.run('maxQps', String(totals.maxQps));
      this.stmtSetSetting.run('maxRpm', String(totals.maxRpm));
      this.stmtSetSetting.run('maxTps', String(totals.maxTps));
    } catch (err) { logger.warn('Failed to save cumulative totals', { error: getErrorMessage(err) }); }
  }

  /** Load RateTracker cumulative state from SQLite settings table. */
  loadCumulativeTotals(): { totalTokens: number; totalRequests: number; maxQps: number; maxRpm: number; maxTps: number } {
    try {
      const get = (key: string): number => {
        const row = this.stmtGetSetting.get(key) as { value: string } | undefined;
        return row ? parseInt(row.value, 10) || 0 : 0;
      };
      return {
        totalTokens: get('totalTokens'),
        totalRequests: get('totalRequests'),
        maxQps: get('maxQps'),
        maxRpm: get('maxRpm'),
        maxTps: get('maxTps'),
      };
    } catch (err) {
      logger.warn('Failed to load cumulative totals', { error: getErrorMessage(err) });
      return { totalTokens: 0, totalRequests: 0, maxQps: 0, maxRpm: 0, maxTps: 0 };
    }
  }
}
