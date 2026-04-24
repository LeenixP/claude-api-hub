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

export function getTierFromModel(model: string): string {
  const lc = model.toLowerCase();
  if (lc.includes('haiku')) return 'Haiku';
  if (lc.includes('sonnet')) return 'Sonnet';
  if (lc.includes('opus')) return 'Opus';
  return model;
}
