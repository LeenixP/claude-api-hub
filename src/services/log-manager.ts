import { appendFileSync, mkdirSync, readdirSync } from 'fs';
import { readdir, unlink } from 'fs/promises';
import { homedir } from 'os';
import { join } from 'path';

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
  private logs: LogEntry[] = [];
  private logToFile = false;
  readonly logDir: string;
  private readonly maxLogs: number;
  private readonly maxLogFiles: number;

  constructor(maxLogs = 200, maxLogFiles = 4096) {
    this.maxLogs = maxLogs;
    this.maxLogFiles = maxLogFiles;
    this.logDir = join(homedir(), '.claude-api-hub', 'logs');
    try { mkdirSync(this.logDir, { recursive: true }); } catch {}
  }

  addLog(entry: LogEntry, detail?: LogDetail): void {
    if (this.logToFile && detail) {
      this.cleanLogDir();
      const filename = entry.requestId + '.json';
      const filepath = join(this.logDir, filename);
      try {
        appendFileSync(filepath, JSON.stringify({ ...entry, ...detail }, null, 2), 'utf-8');
        entry.logFile = filepath;
      } catch {}
    }
    this.logs.push(entry);
    if (this.logs.length > this.maxLogs) this.logs.shift();
  }

  getLogs(): LogEntry[] {
    return this.logs.slice().reverse();
  }

  clearLogs(): void {
    this.logs.length = 0;
  }

  isFileLogging(): boolean {
    return this.logToFile;
  }

  toggleFileLogging(): boolean {
    this.logToFile = !this.logToFile;
    return this.logToFile;
  }

  getFileCount(): number {
    try {
      return readdirSync(this.logDir).filter(f => f.endsWith('.json')).length;
    } catch { return 0; }
  }

  get maxFiles(): number {
    return this.maxLogFiles;
  }

  private cleanLogDir(): void {
    readdir(this.logDir).then(files => {
      const jsonFiles = files.filter(f => f.endsWith('.json'));
      if (jsonFiles.length < this.maxLogFiles) return;
      jsonFiles.sort();
      const toDelete = jsonFiles.slice(0, Math.floor(jsonFiles.length / 2));
      Promise.all(toDelete.map(f => unlink(join(this.logDir, f)).catch(() => {}))).catch(() => {});
    }).catch(() => {});
  }
}
