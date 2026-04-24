import { useState, useEffect, useCallback, useRef } from 'preact/hooks';
import type { ProviderConfig } from '../../types.js';
import { Modal } from '../common/Modal.js';
import { showToast } from '../common/Toast.js';
import { Badge } from '../common/Badge.js';
import { Select } from '../common/Select.js';
import { createProvider, updateProvider, probeModels, startKiroAuth, getKiroAuthResult, getKiroAuthStatus, getKiroModels, cancelKiroAuth } from '../../lib/api.js';

interface ProviderModalProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  editId?: string | null;
  editConfig?: ProviderConfig | null;
}

const emptyConfig: ProviderConfig = {
  name: '',
  baseUrl: '',
  apiKey: '',
  models: [],
  defaultModel: '',
  enabled: true,
  providerType: 'standard',
  authMode: 'anthropic',
};

export function ProviderModal({ open, onClose, onSaved, editId, editConfig }: ProviderModalProps) {
  const isEdit = !!editId;
  const [form, setForm] = useState<ProviderConfig>({ ...emptyConfig });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [modelInput, setModelInput] = useState('');
  const [fetchingModels, setFetchingModels] = useState(false);
  const [oauthStatus, setOauthStatus] = useState<'idle' | 'pending' | 'success' | 'error'>('idle');
  const [oauthError, setOauthError] = useState('');
  const pollRef = useRef<number | null>(null);
  const [showApiKey, setShowApiKey] = useState(false);

  useEffect(() => {
    if (open) {
      if (editConfig) {
        const authMode = editConfig.authMode
          || (editConfig.passthrough ? 'anthropic' : 'anthropic');
        setForm({ ...editConfig, authMode });
      } else {
        setForm({ ...emptyConfig });
      }
      setErrors({});
      setModelInput('');
      setOauthStatus('idle');
      setOauthError('');
    }
    return () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } };
  }, [open, editConfig]);

  const handleStartOAuth = useCallback(async (method: string) => {
    updateField('kiroAuthMethod', method as ProviderConfig['kiroAuthMethod']);
    setOauthStatus('pending');
    setOauthError('');
    try {
      const region = form.kiroRegion || 'us-east-1';
      const backendMethod = method === 'aws-builder-id' ? 'builder-id' : method;
      const { authUrl } = await startKiroAuth(backendMethod, region, form.kiroStartUrl);
      if (authUrl) window.open(authUrl, '_blank');
      pollRef.current = window.setInterval(async () => {
        try {
          const result = await getKiroAuthResult();
          if (result.success) {
            if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
            setOauthStatus('success');
            if (result.credsPath) updateField('kiroCredsPath', result.credsPath);
            showToast('OAuth authentication successful', 'success');
            try {
              const { models } = await getKiroModels();
              if (models.length > 0) {
                setForm(prev => ({
                  ...prev,
                  models: [...new Set([...prev.models, ...models])],
                  defaultModel: prev.defaultModel || models[0],
                }));
              }
            } catch { /* ignore */ }
          } else if (result.error && result.error !== 'No pending OAuth result') {
            if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
            setOauthStatus('error');
            setOauthError(result.error);
          }
        } catch { /* keep polling */ }
      }, 2000) as unknown as number;
    } catch (err) {
      setOauthStatus('error');
      setOauthError((err as Error).message);
    }
  }, [form.kiroRegion, form.kiroStartUrl]);

  const handleCancelOAuth = useCallback(async () => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    try { await cancelKiroAuth(); } catch { /* ignore */ }
    setOauthStatus('idle');
  }, []);

  const validate = useCallback((): boolean => {
    const e: Record<string, string> = {};
    if (!form.name.trim()) e.name = 'Name is required';
    if (form.providerType !== 'kiro' && !form.baseUrl.trim()) e.baseUrl = 'Base URL is required';
    if (!form.defaultModel.trim()) e.defaultModel = 'Default model is required';
    if (form.models.length === 0) e.models = 'At least one model is required';
    if (form.providerType === 'kiro' && !form.kiroAuthMethod && !form.kiroCredsPath) e.kiroAuthMethod = 'OAuth method is required';
    setErrors(e);
    return Object.keys(e).length === 0;
  }, [form]);

  const handleSave = useCallback(async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      const key = isEdit ? editId! : form.name.toLowerCase().replace(/\s+/g, '-');
      const saveForm = { ...form };
      if (saveForm.providerType === 'kiro') {
        const region = saveForm.kiroRegion || 'us-east-1';
        saveForm.baseUrl = `https://q.${region}.amazonaws.com`;
        saveForm.authMode = 'oauth';
      }
      if (isEdit) {
        await updateProvider(key, saveForm);
      } else {
        await createProvider(key, saveForm);
      }
      showToast(isEdit ? 'Provider updated' : 'Provider created', 'success');
      onSaved();
      onClose();
    } catch (err) {
      showToast((err as Error).message, 'error');
    } finally {
      setSaving(false);
    }
  }, [form, isEdit, editId, validate, onSaved, onClose]);

  const handleFetchModels = useCallback(async () => {
    if (!form.baseUrl) {
      setErrors(prev => ({ ...prev, baseUrl: 'Base URL is required to fetch models' }));
      return;
    }
    if (!form.apiKey && form.providerType !== 'kiro') {
      setErrors(prev => ({ ...prev, apiKey: 'API Key is required to fetch models' }));
      return;
    }
    setFetchingModels(true);
    try {
      const isPassthrough = form.passthrough || form.authMode === 'anthropic';
      const result = await probeModels(form.baseUrl, form.apiKey || '', isPassthrough) as { models: string[]; warning?: string };
      const ids = result.models || [];
      if (ids.length > 0) {
        setForm(prev => ({
          ...prev,
          models: [...new Set([...prev.models, ...ids])],
          defaultModel: prev.defaultModel || ids[0] || '',
        }));
        showToast(`Fetched ${ids.length} models`, 'success');
      } else {
        showToast(result.warning || 'No models found. Add models manually.', 'info');
      }
    } catch (err) {
      showToast(`Failed to fetch models: ${(err as Error).message}`, 'error');
    } finally {
      setFetchingModels(false);
    }
  }, [form.baseUrl, form.apiKey, form.passthrough, form.authMode, form.providerType]);

  const addModel = useCallback(() => {
    if (!modelInput.trim()) return;
    const m = modelInput.trim();
    if (!form.models.includes(m)) {
      setForm(prev => ({
        ...prev,
        models: [...prev.models, m],
        defaultModel: prev.defaultModel || m,
      }));
    }
    setModelInput('');
  }, [modelInput, form.models]);

  const removeModel = useCallback((m: string) => {
    setForm(prev => ({
      ...prev,
      models: prev.models.filter(x => x !== m),
      defaultModel: prev.defaultModel === m ? (prev.models.find(x => x !== m) || '') : prev.defaultModel,
    }));
  }, []);

  const updateField = useCallback(<K extends keyof ProviderConfig>(field: K, value: ProviderConfig[K]) => {
    setForm(prev => ({ ...prev, [field]: value }));
    setErrors(prev => { const n = { ...prev }; delete n[field]; return n; });
  }, []);

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? 'Edit Provider' : 'Add Provider'} maxWidth="600px">
      <div style="display:flex;flex-direction:column;gap:20px;padding-right:4px">

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
          <div>
            <label class="form-label">ID</label>
            <input type="text" class="form-input"
              value={isEdit ? editId! : form.name.toLowerCase().replace(/\s+/g, '-')}
              disabled={isEdit} placeholder="provider-id" />
          </div>
          <div>
            <label class="form-label">Display Name</label>
            <input type="text" class="form-input"
              value={form.name}
              onInput={e => updateField('name', (e.target as HTMLInputElement).value)}
              style={errors.name ? 'border-color:var(--color-danger)' : ''}
              placeholder="My Provider" />
            {errors.name && <p style="font-size:12px;margin-top:4px;color:var(--color-danger)">{errors.name}</p>}
          </div>
        </div>

        <div>
          <label class="form-label">Provider Type</label>
          <div style="display:flex;gap:10px">
            <button onClick={() => updateField('providerType', 'standard')}
              class="btn" style={`flex:1;${form.providerType !== 'kiro'
                ? 'background:rgba(42,162,193,0.1);color:var(--color-primary);border-color:var(--color-primary)'
                : 'background:var(--color-bg);color:var(--color-text-dim);border-color:var(--color-border)'}`}>
              Standard
            </button>
            <button onClick={() => updateField('providerType', 'kiro')}
              class="btn" style={`flex:1;${form.providerType === 'kiro'
                ? 'background:rgba(42,162,193,0.1);color:var(--color-primary);border-color:var(--color-primary)'
                : 'background:var(--color-bg);color:var(--color-text-dim);border-color:var(--color-border)'}`}>
              Kiro (OAuth)
            </button>
          </div>
        </div>

        <div style="display:flex;align-items:center;gap:10px">
          <input type="checkbox" id="modal-enabled" checked={form.enabled}
            onChange={e => updateField('enabled', (e.target as HTMLInputElement).checked)}
            class="checkbox-custom" />
          <label for="modal-enabled" style="font-size:14px;color:var(--color-text);cursor:pointer">Enabled</label>
        </div>


        {form.providerType !== 'kiro' && (
          <div>
            <label class="form-label">Base URL</label>
            <input type="text" class="form-input"
              value={form.baseUrl}
              onInput={e => updateField('baseUrl', (e.target as HTMLInputElement).value)}
              style={errors.baseUrl ? 'border-color:var(--color-danger)' : ''}
              placeholder="https://api.example.com/v1" />
            {errors.baseUrl && <p style="font-size:12px;margin-top:4px;color:var(--color-danger)">{errors.baseUrl}</p>}
          </div>
        )}

        {form.providerType !== 'kiro' && (
          <div style="position:relative">
            <label class="form-label">API Key</label>
            <input type={showApiKey ? 'text' : 'password'} class="form-input"
              value={form.apiKey || ''}
              onInput={e => updateField('apiKey', (e.target as HTMLInputElement).value)}
              placeholder="sk-..."
              style="padding-right:40px" />
            <button type="button" onClick={() => setShowApiKey(v => !v)}
              style="position:absolute;right:8px;bottom:10px;background:none;border:none;cursor:pointer;color:var(--color-text-muted);padding:4px;display:flex;align-items:center"
              title={showApiKey ? 'Hide API key' : 'Show API key'}>
              {showApiKey ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
              )}
            </button>
          </div>
        )}

        {form.providerType !== 'kiro' && (
          <div>
            <label class="form-label">Protocol</label>
            <div style="display:flex;gap:16px;margin-top:4px">
              {(['anthropic', 'openai'] as const).map(p => (
                <label key={p} style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:14px;color:var(--color-text)">
                  <input type="radio" name="protocol"
                    checked={form.authMode === p}
                    onChange={() => updateField('authMode', p)}
                    style="width:18px;height:18px" />
                  <Badge variant={p} />
                </label>
              ))}
            </div>
          </div>
        )}

        {form.providerType === 'kiro' && (
          <div class="card" style="padding:16px">
            <div class="form-label" style="margin-bottom:12px">Kiro OAuth Configuration</div>
            <div style="display:flex;flex-direction:column;gap:12px">
              <div>
                <label class="form-label">Start URL</label>
                <input type="text" class="form-input"
                  value={form.kiroStartUrl || ''}
                  onInput={e => updateField('kiroStartUrl', (e.target as HTMLInputElement).value)}
                  placeholder="https://view.awsapps.com/start" />
                <p style="font-size:11px;margin-top:4px;color:var(--color-text-muted)">Organization SSO start URL. Leave empty for default.</p>
              </div>
              <div>
                <label class="form-label">Region</label>
                <input type="text" class="form-input"
                  value={form.kiroRegion || ''}
                  onInput={e => updateField('kiroRegion', (e.target as HTMLInputElement).value)}
                  placeholder="us-east-1" />
              </div>
              <div>
                <label class="form-label">Authenticate</label>
                {oauthStatus === 'pending' ? (
                  <div style="display:flex;align-items:center;gap:12px">
                    <svg class="animate-spin" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary)" stroke-width="2"><path d="M21 12a9 9 0 1 1-6.22-8.56" /></svg>
                    <span style="font-size:13px;color:var(--color-text-dim)">Waiting for authentication...</span>
                    <button onClick={handleCancelOAuth} class="btn btn-ghost" style="margin-left:auto;height:32px;font-size:12px">Cancel</button>
                  </div>
                ) : oauthStatus === 'success' ? (
                  <div style="display:flex;align-items:center;gap:8px;padding:10px 14px;border-radius:10px;background:rgba(48,164,108,0.1);border:1px solid rgba(48,164,108,0.2)">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--color-success)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                    <span style="font-size:13px;font-weight:600;color:var(--color-success)">Authenticated</span>
                  </div>
                ) : (
                  <div style="display:flex;gap:8px">
                    {(['google', 'github', 'aws-builder-id'] as const).map(method => (
                      <button key={method} onClick={() => handleStartOAuth(method)}
                        class="btn btn-ghost" style="flex:1;font-size:13px">
                        {method === 'aws-builder-id' ? 'AWS Builder ID' : method.charAt(0).toUpperCase() + method.slice(1)}
                      </button>
                    ))}
                  </div>
                )}
                {oauthStatus === 'error' && oauthError && (
                  <p style="font-size:12px;margin-top:8px;color:var(--color-danger)">{oauthError}</p>
                )}
              </div>
            </div>
          </div>
        )}

        <div>
          <label class="form-label">Models</label>
          <div style="display:flex;gap:10px;margin-bottom:10px">
            <input type="text" class="form-input" style="flex:1"
              value={modelInput}
              onInput={e => setModelInput((e.target as HTMLInputElement).value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addModel(); } }}
              placeholder="model-name" />
            <button onClick={addModel} class="btn btn-accent">Add</button>
            <button onClick={handleFetchModels} disabled={fetchingModels} class="btn btn-ghost">
              {fetchingModels ? '...' : 'Fetch'}
            </button>
          </div>
          {errors.models && <p style="font-size:12px;margin-bottom:8px;color:var(--color-danger)">{errors.models}</p>}
          <div style="display:flex;flex-wrap:wrap;gap:8px">
            {form.models.map(m => (
              <span key={m} class="tag" style="display:inline-flex;align-items:center;gap:6px">
                {m}
                <button onClick={() => removeModel(m)} style="color:var(--color-text-muted);cursor:pointer;background:none;border:none;padding:0;display:flex">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                </button>
              </span>
            ))}
          </div>
        </div>

        <div>
          <label class="form-label">Default Model</label>
          <Select
            value={form.defaultModel}
            onChange={v => updateField('defaultModel', v)}
            placeholder="Select a model..."
            error={!!errors.defaultModel}
            options={form.models.map(m => ({ value: m, label: m }))}
          />
          {errors.defaultModel && <p style="font-size:12px;margin-top:4px;color:var(--color-danger)">{errors.defaultModel}</p>}
        </div>

        <div>
          <label class="form-label">Prefix (optional)</label>
          <input type="text" class="form-input"
            value={Array.isArray(form.prefix) ? form.prefix.join(', ') : form.prefix || ''}
            onInput={e => {
              const val = (e.target as HTMLInputElement).value;
              const parts = val.split(',').map(s => s.trim()).filter(Boolean);
              updateField('prefix', parts.length > 1 ? parts as any : (parts[0] || '') as any);
            }}
            placeholder="prefix-" />
        </div>
      </div>

      <div style="display:flex;align-items:center;justify-content:flex-end;gap:10px;margin-top:24px;padding-top:20px;border-top:1px solid var(--color-border)">
        <button onClick={onClose} class="btn btn-ghost">Cancel</button>
        <button onClick={handleSave} disabled={saving} class="btn btn-primary">
          {saving ? 'Saving...' : isEdit ? 'Update' : 'Create'}
        </button>
      </div>
    </Modal>
  );
}
