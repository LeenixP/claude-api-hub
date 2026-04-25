import { useState, useEffect, useCallback } from 'preact/hooks';
import type { GatewayConfig } from '../types.js';
import { getConfig } from '../lib/api.js';

interface UseAuthReturn {
  authRequired: boolean;
  adminToken: string;
  config: GatewayConfig | null;
  loadError: string | null;
  refreshConfig: () => Promise<void>;
  setAdminToken: (token: string) => void;
  logout: () => void;
}

export function useAuth(): UseAuthReturn {
  const [config, setConfig] = useState<GatewayConfig | null>(null);
  const [authRequired, setAuthRequired] = useState(false);
  const [adminToken, setAdminToken] = useState(() => localStorage.getItem('adminToken') || '');
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        setLoadError(null);
        const res = await fetch('/api/auth/check');
        const data = await res.json();
        if (data.required && !adminToken) { setAuthRequired(true); return; }
        const cfgRes = await fetch('/api/config', {
          headers: adminToken ? { 'x-admin-token': adminToken } : {},
        });
        if (cfgRes.ok) { setConfig(await cfgRes.json()); setLoadError(null); }
        else if (cfgRes.status === 401) setAuthRequired(true);
        else setLoadError(`Config fetch failed: ${cfgRes.status}`);
      } catch (e) {
        setLoadError(`Network error: ${(e as Error).message || 'Cannot reach server'}`);
        setTimeout(() => setLoadError(l => l ? 'Retrying...' : null), 2000);
      }
    })();
  }, [adminToken]);

  useEffect(() => {
    const handler = () => { setAuthRequired(true); setConfig(null); };
    window.addEventListener('api:unauthorized', handler);
    return () => window.removeEventListener('api:unauthorized', handler);
  }, []);

  const refreshConfig = useCallback(async () => {
    try { setConfig(await getConfig()); } catch { /* ignore */ }
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('adminToken');
    setAuthRequired(true);
    setConfig(null);
  }, []);

  return { authRequired, adminToken, config, loadError, refreshConfig, setAdminToken, logout };
}
