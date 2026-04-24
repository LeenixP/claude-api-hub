import { useState, useEffect, useCallback, useRef } from 'preact/hooks';

interface UseApiOptions {
  immediate?: boolean;
}

export function useApi<T>(url: string | null, options: UseApiOptions = {}) {
  const { immediate = true } = options;
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(immediate && url !== null);
  const abortRef = useRef<AbortController | null>(null);

  const execute = useCallback(async (): Promise<T | null> => {
    if (!url) return null;
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setLoading(true);
    setError(null);

    try {
      const token = localStorage.getItem('adminToken') || '';
      const res = await fetch(url, {
        signal: ctrl.signal,
        headers: {
          ...(token ? { 'x-admin-token': token } : {}),
        },
      });
      if (res.status === 401) {
        setError('Unauthorized');
        window.dispatchEvent(new CustomEvent('api:unauthorized'));
        setLoading(false);
        return null;
      }
      if (!res.ok) {
        const text = await res.text().catch(() => 'Unknown error');
        setError(`${res.status}: ${text}`);
        setLoading(false);
        return null;
      }
      const json = await res.json();
      setData(json);
      setLoading(false);
      return json;
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setError((err as Error).message);
      }
      setLoading(false);
      return null;
    }
  }, [url]);

  useEffect(() => {
    if (immediate && url) {
      execute();
    }
    return () => {
      abortRef.current?.abort();
    };
  }, [url, immediate, execute]);

  return { data, error, loading, execute };
}

export async function apiFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const token = localStorage.getItem('adminToken') || '';
  const res = await fetch(url, {
    ...options,
    headers: {
      ...(token ? { 'x-admin-token': token } : {}),
      ...(options.headers || {}),
    },
  });
  if (res.status === 401) {
    window.dispatchEvent(new CustomEvent('api:unauthorized'));
  }
  return res;
}
