import { useState, useEffect, useRef, useCallback } from 'preact/hooks';
import type { LogEntry } from '../types.js';
import { getLogs } from '../lib/api.js';

interface UseSSEReturn {
  logs: LogEntry[];
  connected: boolean;
  clearLogs: () => void;
}

export function useSSE(adminToken: string): UseSSEReturn {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [connected, setConnected] = useState(false);
  const esRef = useRef<EventSource | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;

    getLogs().then(history => {
      if (mounted.current && history.length > 0) {
        setLogs(history.slice(0, 500));
      }
    }).catch(() => {});

    let retryDelay = 1000;
    const maxDelay = 30000;

    function connect() {
      if (!mounted.current) return;
      if (esRef.current) esRef.current.close();

      const url = adminToken ? `/api/events?token=${encodeURIComponent(adminToken)}` : '/api/events';
      const es = new EventSource(url);
      esRef.current = es;

      es.onopen = () => {
        if (!mounted.current) return;
        setConnected(true);
        retryDelay = 1000;
      };

      es.addEventListener('log', (e: MessageEvent) => {
        if (!mounted.current) return;
        try {
          const entry: LogEntry = JSON.parse(e.data);
          setLogs(prev => [entry, ...prev].slice(0, 500));
        } catch {}
      });

      es.onerror = () => {
        if (!mounted.current) return;
        setConnected(false);
        es.close();
        esRef.current = null;
        // Add ±25% jitter to prevent thundering herd
        const jitter = retryDelay * 0.25 * (Math.random() * 2 - 1);
        const delay = retryDelay + jitter;
        retryDelay = Math.min(retryDelay * 2, maxDelay);
        reconnectTimer.current = setTimeout(connect, delay);
      };
    }

    connect();

    return () => {
      mounted.current = false;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      if (esRef.current) { esRef.current.close(); esRef.current = null; }
    };
  }, [adminToken]);

  const clearLogs = useCallback(() => setLogs([]), []);

  return { logs, connected, clearLogs };
}
