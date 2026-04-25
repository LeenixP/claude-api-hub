import { useState, useCallback } from 'preact/hooks';
import { useLocale } from '../lib/i18n.js';

interface LoginScreenProps {
  onLogin: (token: string, config: any) => void;
}

export function LoginScreen({ onLogin }: LoginScreenProps) {
  const { t } = useLocale();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = useCallback(async (e: Event) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const data = await (await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })).json();
      if (data.success && data.token) {
        localStorage.setItem('adminToken', data.token);
        const cfgRes = await fetch('/api/config', { headers: { 'x-admin-token': data.token } });
        const config = cfgRes.ok ? await cfgRes.json() : null;
        onLogin(data.token, config);
      } else {
        setError('Invalid credentials');
      }
    } catch {
      setError('Invalid credentials');
    } finally {
      setLoading(false);
    }
  }, [password, onLogin]);

  const disabled = loading || !password;

  return (
    <div class="flex items-center justify-center min-h-screen" style="background:var(--color-bg)">
      <form onSubmit={handleSubmit} style="width:400px;padding:40px;border-radius:16px;background:var(--color-surface);border:1px solid var(--color-border);box-shadow:0 20px 60px rgba(0,0,0,0.3)">
        <div style="display:flex;justify-content:center;margin-bottom:28px">
          <div style="width:56px;height:56px;border-radius:14px;display:flex;align-items:center;justify-content:center;background:var(--color-primary);color:var(--color-surface)">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
          </div>
        </div>
        <h1 style="font-size:24px;font-weight:700;text-align:center;color:var(--color-text);margin-bottom:6px">{t('login.title')}</h1>
        <p style="font-size:14px;text-align:center;color:var(--color-text-dim);margin-bottom:28px">{t('login.subtitle')}</p>
        {error && (
          <div style="margin-bottom:16px;padding:12px 16px;border-radius:10px;font-size:13px;background:rgba(255,50,50,0.1);color:var(--color-danger);border:1px solid rgba(255,50,50,0.2)">
            {error}
          </div>
        )}
        <div style="position:relative;margin-bottom:20px">
          <input type={showPassword ? 'text' : 'password'} value={password} autofocus
            onInput={(e: Event) => setPassword((e.target as HTMLInputElement).value)}
            placeholder={t('login.password')} class="form-input" style="padding-right:40px" />
          <button type="button" onClick={() => setShowPassword(v => !v)}
            style="position:absolute;right:10px;top:50%;transform:translateY(-50%);background:none;border:none;cursor:pointer;color:var(--color-text-muted);padding:4px;display:flex;align-items:center"
            title={showPassword ? 'Hide password' : 'Show password'}
            aria-label={showPassword ? 'Hide password' : 'Show password'}>
            {showPassword ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
            )}
          </button>
        </div>
        <button type="submit" disabled={disabled}
          class="btn btn-primary"
          style={`width:100%;height:44px;font-size:15px;opacity:${disabled ? '0.5' : '1'};cursor:${disabled ? 'not-allowed' : 'pointer'}`}>
          {loading ? t('login.signingIn') : t('login.signIn')}
        </button>
      </form>
    </div>
  );
}
