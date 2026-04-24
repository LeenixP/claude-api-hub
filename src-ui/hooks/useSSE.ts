import { useState, useEffect, useRef } from 'preact/hooks';
import type { LogEntry } from '../types.js';
import { getLogs } from '../lib/api.js';

interface UseSSEReturn {
  logs: LogEntry[];
  connected: boolean;
}

export function useSSE(): UseSSEReturn {
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

      const token = localStorage.getItem('adminToken') || '';
      const url = token ? `/api/events?token=${encodeURIComponent(token)}` : '/api/events';
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
        retryDelay = Math.min(retryDelay * 2, maxDelay);
        reconnectTimer.current = setTimeout(connect, retryDelay);
      };
    }

    connect();

    return () => {
      mounted.current = false;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      if (esRef.current) { esRef.current.close(); esRef.current = null; }
    };
  }, []);

  return { logs, connected };
}
