export function esc(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function debounce<T extends (...args: unknown[]) => void>(fn: T, ms: number): T {
  let timer: ReturnType<typeof setTimeout>;
  return ((...args: unknown[]) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  }) as T;
}

export function formatTokens(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return String(n);
}

export function formatDuration(ms: number): string {
  if (ms >= 1000) return (ms / 1000).toFixed(1) + 's';
  return ms + 'ms';
}

export function relativeTime(dateStr: string | undefined): string | null {
  if (!dateStr) return null;
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  if (isNaN(then)) return null;
  const diffMs = now - then;
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return 'just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour} hour${diffHour > 1 ? 's' : ''} ago`;
  const diffDay = Math.floor(diffHour / 24);
  if (diffDay < 30) return `${diffDay} day${diffDay > 1 ? 's' : ''} ago`;
  const diffMonth = Math.floor(diffDay / 30);
  return `${diffMonth} month${diffMonth > 1 ? 's' : ''} ago`;
}

export function statusLabel(code: number): string {
  if (code >= 200 && code < 300) return 'OK';
  if (code === 400) return 'Bad Request';
  if (code === 401) return 'Unauthorized';
  if (code === 403) return 'Forbidden';
  if (code === 404) return 'Not Found';
  if (code === 429) return 'Rate Limited';
  if (code >= 500) return 'Server Error';
  return 'Error';
}

export function formatRelativeTime(dateStr: string | undefined): string {
  return relativeTime(dateStr) ?? '';
}

export function getTierFromModel(model: string): string {
  const lc = model.toLowerCase();
  if (lc.includes('haiku')) return 'Haiku';
  if (lc.includes('sonnet')) return 'Sonnet';
  if (lc.includes('opus')) return 'Opus';
  return model;
}

/** Highlight JSON string into HTML with color-coded spans. */
export function highlightJson(json: string): string {
  let html = json
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Keys: double-quoted strings immediately followed by colon
  html = html.replace(/"((?:[^"\\]|\\.)*)"\s*:/g,
    '<span style="color:#2AA2C1">"$1"</span>:');

  // Remaining double-quoted strings (values)
  html = html.replace(/"((?:[^"\\]|\\.)*)"/g,
    '<span style="color:#30A46C">"$1"</span>');

  // Numbers
  html = html.replace(/(?<![\w$#])(-?\d+\.?\d*(?:[eE][+-]?\d+)?)(?![\w$])/g,
    '<span style="color:#F59E0B">$1</span>');

  // Booleans and null
  html = html.replace(/\b(true|false|null)\b/g,
    '<span style="color:#8B5CF6">$1</span>');

  return html;
}
