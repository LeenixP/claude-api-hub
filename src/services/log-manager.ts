import { mkdirSync, readdirSync } from 'fs';
import { readdir, unlink, appendFile } from 'fs/promises';
import { homedir } from 'os';
import { join } from 'path';
import { logger } from '../logger.js';
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
  private stmtGetSetting: ReturnType<InstanceType<typeof DatabaseSync>['prepare']>;
  private stmtSetSetting: ReturnType<InstanceType<typeof DatabaseSync>['prepare']>;

  private eventBus?: EventBus;

  constructor(maxLogs = MAX_LOG_ROWS, maxLogFiles = MAX_LOG_FILES, dbPath?: string, eventBus?: EventBus) {
    this.eventBus = eventBus;
    this.maxLogs = maxLogs;
    this.maxLogFiles = maxLogFiles;
    this.logDir = join(homedir(), '.claude-api-hub', 'logs');
    try { mkdirSync(this.logDir, { recursive: true }); } catch (err) { logger.warn('Failed to create log directory', { error: (err as Error).message }); }

    const resolvedDbPath = dbPath ?? join(homedir(), '.claude-api-hub', 'data.db');
    if (resolvedDbPath !== ':memory:') {
      try { mkdirSync(join(homedir(), '.claude-api-hub'), { recursive: true }); } catch (err) { logger.warn('Failed to create data directory', { error: (err as Error).message }); }
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

    this.stmtInsert = this.db.prepare(`
      INSERT INTO request_logs (request_id, time, claude_model, resolved_model, provider, protocol, target_url, stream, status, duration_ms, input_tokens, output_tokens, error, log_file)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    this.stmtGetLogs = this.db.prepare('SELECT * FROM request_logs ORDER BY id DESC LIMIT ?');
    this.stmtClear = this.db.prepare('DELETE FROM request_logs');
    this.stmtCount = this.db.prepare('SELECT COUNT(*) as cnt FROM request_logs');
    this.stmtTrim = this.db.prepare('DELETE FROM request_logs WHERE id IN (SELECT id FROM request_logs ORDER BY id ASC LIMIT ?)');
    this.stmtGetSetting = this.db.prepare('SELECT value FROM settings WHERE key = ?');
    this.stmtSetSetting = this.db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
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
        .catch((err) => { logger.warn('Failed to write log file', { error: (err as Error).message }); });
    }

    try {
      this.stmtInsert.run(
        entry.requestId, entry.time, entry.claudeModel, entry.resolvedModel,
        entry.provider, entry.protocol, entry.targetUrl, entry.stream ? 1 : 0,
        entry.status, entry.durationMs, entry.inputTokens ?? 0, entry.outputTokens ?? 0,
        entry.error ?? null, entry.logFile ?? null
      );
      this.trimLogs();
      this.eventBus?.emit('log', entry);
    } catch (err) { logger.warn('Failed to write log to database', { error: (err as Error).message }); }
  }

  getLogs(limit = 200): LogEntry[] {
    try {
      const rows = this.stmtGetLogs.all(limit) as Record<string, unknown>[];
      return rows.map(r => this.rowToLogEntry(r));
    } catch (err) { logger.warn('Failed to read logs', { error: (err as Error).message }); return []; }
  }

  clearLogs(): void {
    try { this.stmtClear.run(); } catch (err) { logger.warn('Failed to clear logs', { error: (err as Error).message }); }
    this.logCount = -1;
  }

  isFileLogging(): boolean {
    try {
      const row = this.stmtGetSetting.get('logToFile') as { value: string } | undefined;
      return row?.value === 'true';
    } catch (err) { logger.warn('Failed to read log setting', { error: (err as Error).message }); return false; }
  }

  toggleFileLogging(): boolean {
    const current = this.isFileLogging();
    const next = !current;
    try { this.stmtSetSetting.run('logToFile', next.toString()); } catch (err) { logger.warn('Failed to toggle file logging', { error: (err as Error).message }); }
    return next;
  }

  getFileCount(): number {
    try {
      return readdirSync(this.logDir).filter(f => f.endsWith('.json')).length;
    } catch (err) { logger.warn('Failed to count log files', { error: (err as Error).message }); return 0; }
  }

  get maxFiles(): number {
    return this.maxLogFiles;
  }

  close(): void {
    try { this.db.close(); } catch (err) { logger.warn('Failed to close database', { error: (err as Error).message }); }
  }

  private logCount = -1;

  private trimLogs(): void {
    try {
      if (this.logCount < 0) {
        const row = this.stmtCount.get() as { cnt: number };
        this.logCount = row.cnt;
      }
      this.logCount++;
      if (this.logCount > this.maxLogs + 500) {
        this.stmtTrim.run(this.logCount - this.maxLogs);
        this.logCount = this.maxLogs;
      }
    } catch (err) { logger.warn('Failed to trim logs', { error: (err as Error).message }); }
  }

  private cleanLogDir(): void {
    readdir(this.logDir).then(files => {
      const jsonFiles = files.filter(f => f.endsWith('.json'));
      if (jsonFiles.length < this.maxLogFiles) return;
      jsonFiles.sort();
      const toDelete = jsonFiles.slice(0, Math.floor(jsonFiles.length / 2));
      Promise.all(toDelete.map(f => unlink(join(this.logDir, f)).catch((err) => { logger.warn(`Failed to delete log file ${f}`, { error: (err as Error).message }); }))).catch((err) => { logger.warn('Failed to clean log directory', { error: (err as Error).message }); });
    }).catch((err) => { logger.warn('Failed to read log directory', { error: (err as Error).message }); });
  }
}
