/** Maximum HTTP request body size (10 MB) */
export const MAX_BODY_SIZE = 10 * 1024 * 1024;

/** Maximum upstream response size for non-streaming requests (50 MB) */
export const MAX_RESPONSE_SIZE = 50 * 1024 * 1024;

/** Maximum response size for GET/health requests (5 MB) */
export const MAX_GET_SIZE = 5 * 1024 * 1024;

/** Maximum number of log rows in SQLite before trimming */
export const MAX_LOG_ROWS = 10_000;

/** Maximum number of per-request JSON log files on disk */
export const MAX_LOG_FILES = 4_096;

/** SQLite WAL checkpoint interval in milliseconds */
export const SQLITE_CHECKPOINT_MS = 60_000;

/** Default stream timeout for upstream requests (2 minutes) */
export const DEFAULT_STREAM_TIMEOUT = 120_000;

/** Default idle timeout for streaming connections (30 seconds) */
export const DEFAULT_STREAM_IDLE_TIMEOUT = 30_000;

/** Default non-stream request timeout (5 minutes) */
export const DEFAULT_REQUEST_TIMEOUT = 300_000;

/** Session token max age (24 hours) */
export const SESSION_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/** Session cleanup interval (1 hour) */
export const SESSION_CLEANUP_MS = 60 * 60 * 1000;

/** Key pool error threshold before disabling a key */
export const KEY_POOL_ERROR_THRESHOLD = 5;

/** Key pool recovery wait time in ms (60 seconds) */
export const KEY_POOL_RECOVERY_MS = 60_000;

/** Key pool recovery check interval (10 seconds) */
export const KEY_POOL_RECOVERY_CHECK_MS = 10_000;

/** Default OAuth token refresh interval (30 minutes) */
export const DEFAULT_TOKEN_REFRESH_MINUTES = 30;

/** Rate limiter window (60 seconds) */
export const RATE_LIMIT_WINDOW_MS = 60_000;

/** HTTPS keep-alive agent max sockets per host */
export const KEEP_ALIVE_MAX_SOCKETS = 50;

/** Dashboard cache max age in seconds (5 minutes) */
export const DASHBOARD_CACHE_MAX_AGE = 300;
