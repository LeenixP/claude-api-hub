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
  if (diffSec < 10) return 'just now';
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}h ago`;
  const diffDay = Math.floor(diffHour / 24);
  if (diffDay < 30) return `${diffDay}d ago`;
  const diffMonth = Math.floor(diffDay / 30);
  if (diffMonth < 12) return `${diffMonth}mo ago`;
  const diffYear = Math.floor(diffMonth / 12);
  return `${diffYear}y ago`;
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

export interface JsonToken {
  text: string;
  type: 'key' | 'string' | 'number' | 'boolean' | 'null' | 'punctuation';
}

export function highlightJson(json: string): JsonToken[] {
  const tokens: JsonToken[] = [];
  let i = 0;
  while (i < json.length) {
    const ch = json[i];
    // Whitespace
    if (ch === ' ' || ch === '\n' || ch === '\r' || ch === '\t') {
      tokens.push({ text: ch, type: 'punctuation' });
      i++;
      continue;
    }
    // String (key or value)
    if (ch === '"') {
      let str = '"';
      i++;
      while (i < json.length && json[i] !== '"') {
        if (json[i] === '\\') { str += json[i++] || ''; }
        str += json[i++] || '';
      }
      str += '"';
      i++;
      // Check if this is a key (followed by colon)
      let j = i;
      while (j < json.length && (json[j] === ' ' || json[j] === '\t')) j++;
      const isKey = json[j] === ':';
      tokens.push({ text: str, type: isKey ? 'key' : 'string' });
      continue;
    }
    // Number
    if (ch === '-' || (ch >= '0' && ch <= '9')) {
      let num = '';
      while (i < json.length && /[0-9eE.+\-]/.test(json[i])) {
        num += json[i++];
      }
      tokens.push({ text: num, type: 'number' });
      continue;
    }
    // Boolean / null
    if (json.slice(i, i + 4) === 'true') {
      tokens.push({ text: 'true', type: 'boolean' });
      i += 4;
      continue;
    }
    if (json.slice(i, i + 5) === 'false') {
      tokens.push({ text: 'false', type: 'boolean' });
      i += 5;
      continue;
    }
    if (json.slice(i, i + 4) === 'null') {
      tokens.push({ text: 'null', type: 'null' });
      i += 4;
      continue;
    }
    // Punctuation { } [ ] , :
    tokens.push({ text: ch, type: 'punctuation' });
    i++;
  }
  return tokens;
}
