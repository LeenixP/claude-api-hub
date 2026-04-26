import { useState, useEffect, useCallback, useRef } from 'preact/hooks';
import type { ProviderConfig } from '../../types.js';
import { Modal } from '../common/Modal.js';
import { showToast } from '../common/Toast.js';
import { Badge } from '../common/Badge.js';
import { Select } from '../common/Select.js';
import { createProvider, updateProvider, probeModels, startKiroAuth, getKiroAuthResult, getKiroAuthStatus, getKiroModels, cancelKiroAuth } from '../../lib/api.js';
import { useLocale } from '../../lib/i18n.js';

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
  const { t } = useLocale();
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
  const wasOpenRef = useRef(false);
  const editConfigRef = useRef(editConfig);
  editConfigRef.current = editConfig;

  useEffect(() => {
    if (open && !wasOpenRef.current) {
      const cfg = editConfigRef.current;
      if (cfg) {
        const authMode = cfg.authMode
          || (cfg.passthrough ? 'anthropic' : 'anthropic');
        setForm({ ...cfg, authMode });
      } else {
        setForm({ ...emptyConfig });
      }
      setErrors({});
      setModelInput('');
      setOauthStatus('idle');
      setOauthError('');
    }
    wasOpenRef.current = open;
    return () => { if (!open && pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } };
  }, [open]);

  const getOpt = (key: string): string => (form.options?.[key] as string) || '';
  const setOpt = (key: string, value: unknown) => setForm(prev => ({ ...prev, options: { ...prev.options, [key]: value } }));

  const handleStartOAuth = useCallback(async (method: string) => {
    setOpt('kiroAuthMethod', method);
    setOauthStatus('pending');
    setOauthError('');
    try {
      const region = getOpt('kiroRegion') || 'us-east-1';
      const backendMethod = method === 'aws-builder-id' ? 'builder-id' : method;
      const { authUrl } = await startKiroAuth(backendMethod, region, getOpt('kiroStartUrl'));
      if (authUrl) window.open(authUrl, '_blank');
      pollRef.current = window.setInterval(async () => {
        try {
          const result = await getKiroAuthResult();
          if (result.success) {
            if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
            setOauthStatus('success');
            if (result.credsPath) setOpt('kiroCredsPath', result.credsPath);
            showToast(t('modal.oauthSuccess'), 'success');
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
  }, [form.options, t]);

  const handleCancelOAuth = useCallback(async () => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    try { await cancelKiroAuth(); } catch { /* ignore */ }
    setOauthStatus('idle');
  }, []);

  const validate = useCallback((): boolean => {
    const e: Record<string, string> = {};
    if (!form.name.trim()) e.name = t('modal.nameRequired');
    if (form.providerType !== 'kiro' && !form.baseUrl.trim()) e.baseUrl = t('modal.baseUrlRequired');
    if (!form.defaultModel.trim()) e.defaultModel = t('modal.defaultModelRequired');
    if (form.models.length === 0) e.models = t('modal.modelsRequired');
    if (form.providerType === 'kiro' && !getOpt('kiroAuthMethod') && !getOpt('kiroCredsPath')) e.kiroAuthMethod = t('modal.oauthRequired');
    setErrors(e);
    return Object.keys(e).length === 0;
  }, [form, t]);

  const handleSave = useCallback(async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      const key = isEdit ? editId! : form.name.toLowerCase().replace(/\s+/g, '-');
      const saveForm = { ...form };
      if (saveForm.providerType === 'kiro') {
        const region = (saveForm.options?.kiroRegion as string) || 'us-east-1';
        saveForm.baseUrl = `https://q.${region}.amazonaws.com`;
        saveForm.authMode = 'oauth';
      }
      if (isEdit) {
        await updateProvider(key, saveForm);
      } else {
        await createProvider(key, saveForm);
      }
      showToast(isEdit ? t('modal.providerUpdated') : t('modal.providerCreated'), 'success');
      onSaved();
      onClose();
    } catch (err) {
      showToast((err as Error).message, 'error');
    } finally {
      setSaving(false);
    }
  }, [form, isEdit, editId, validate, onSaved, onClose, t]);

  const handleFetchModels = useCallback(async () => {
    if (!form.baseUrl) {
      setErrors(prev => ({ ...prev, baseUrl: t('modal.fetchBaseUrlRequired') }));
      return;
    }
    if (!form.apiKey && form.providerType !== 'kiro') {
      setErrors(prev => ({ ...prev, apiKey: t('modal.fetchApiKeyRequired') }));
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
        showToast(t('modal.fetchedModels', { count: ids.length }), 'success');
      } else {
        showToast(result.warning || t('modal.noModelsFound'), 'info');
      }
    } catch (err) {
      showToast(t('modal.fetchFailed', { error: (err as Error).message }), 'error');
    } finally {
      setFetchingModels(false);
    }
  }, [form.baseUrl, form.apiKey, form.passthrough, form.authMode, form.providerType, t]);

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
    <Modal open={open} onClose={onClose} title={isEdit ? t('modal.editProvider') : t('modal.addProvider')} maxWidth="600px">
      <div style="display:flex;flex-direction:column;gap:20px;padding-right:4px">

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
          <div>
            <label class="form-label" for="provider-modal-id">ID</label>
            <input id="provider-modal-id" type="text" class="form-input"
              value={isEdit ? editId! : form.name.toLowerCase().replace(/\s+/g, '-')}
              disabled={isEdit} placeholder="provider-id" />
          </div>
          <div>
            <label class="form-label" for="provider-modal-name">{t('modal.displayName')}</label>
            <input id="provider-modal-name" type="text" class="form-input"
              value={form.name}
              onInput={e => updateField('name', (e.target as HTMLInputElement).value)}
              style={errors.name ? 'border-color:var(--color-danger)' : ''}
              placeholder={t('modal.namePlaceholder')} />
            {errors.name && <p style="font-size:12px;margin-top:4px;color:var(--color-danger)">{errors.name}</p>}
          </div>
        </div>

        <div>
          <label class="form-label">{t('modal.providerType')}</label>
          <div style="display:flex;gap:10px">
            <button onClick={() => updateField('providerType', 'standard')}
              class="btn" style={`flex:1;${form.providerType !== 'kiro'
                ? 'background:rgba(42,162,193,0.1);color:var(--color-primary);border-color:var(--color-primary)'
                : 'background:var(--color-bg);color:var(--color-text-dim);border-color:var(--color-border)'}`}>
              {t('modal.standard')}
            </button>
            <button onClick={() => updateField('providerType', 'kiro')}
              class="btn" style={`flex:1;${form.providerType === 'kiro'
                ? 'background:rgba(42,162,193,0.1);color:var(--color-primary);border-color:var(--color-primary)'
                : 'background:var(--color-bg);color:var(--color-text-dim);border-color:var(--color-border)'}`}>
              {t('modal.kiroOAuth')}
            </button>
          </div>
        </div>

        <div style="display:flex;align-items:center;gap:10px">
          <input type="checkbox" id="modal-enabled" checked={form.enabled}
            onChange={e => updateField('enabled', (e.target as HTMLInputElement).checked)}
            class="checkbox-custom" />
          <label for="modal-enabled" style="font-size:14px;color:var(--color-text);cursor:pointer">{t('modal.enabled')}</label>
        </div>


        {form.providerType !== 'kiro' && (
          <div>
            <label class="form-label" for="provider-modal-baseurl">{t('modal.baseUrl')}</label>
            <input id="provider-modal-baseurl" type="text" class="form-input"
              value={form.baseUrl}
              onInput={e => updateField('baseUrl', (e.target as HTMLInputElement).value)}
              style={errors.baseUrl ? 'border-color:var(--color-danger)' : ''}
              placeholder="https://api.example.com/v1" />
            {errors.baseUrl && <p style="font-size:12px;margin-top:4px;color:var(--color-danger)">{errors.baseUrl}</p>}
          </div>
        )}

        {form.providerType !== 'kiro' && (
          <div style="position:relative">
            <label class="form-label" for="provider-modal-apikey">{t('modal.apiKey')}</label>
            <input id="provider-modal-apikey" type={showApiKey ? 'text' : 'password'} class="form-input"
              value={form.apiKey || ''}
              onInput={e => updateField('apiKey', (e.target as HTMLInputElement).value)}
              placeholder="sk-..."
              style="padding-right:40px" />
            <button type="button" onClick={() => setShowApiKey(v => !v)}
              style="position:absolute;right:8px;bottom:10px;background:none;border:none;cursor:pointer;color:var(--color-text-muted);padding:4px;display:flex;align-items:center"
              title={showApiKey ? 'Hide API key' : 'Show API key'}
              aria-label={showApiKey ? 'Hide API key' : 'Show API key'}>
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
            <label class="form-label">{t('modal.protocol')}</label>
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
            <div class="form-label" style="margin-bottom:12px">{t('modal.kiroConfig')}</div>
            <div style="display:flex;flex-direction:column;gap:12px">
              <div>
                <label class="form-label" for="provider-modal-starturl">{t('modal.startUrl')}</label>
                <input id="provider-modal-starturl" type="text" class="form-input"
                  value={getOpt('kiroStartUrl')}
                  onInput={e => setOpt('kiroStartUrl', (e.target as HTMLInputElement).value)}
                  placeholder="https://view.awsapps.com/start" />
                <p style="font-size:11px;margin-top:4px;color:var(--color-text-muted)">{t('modal.startUrlHint')}</p>
              </div>
              <div>
                <label class="form-label" for="provider-modal-region">{t('modal.region')}</label>
                <input id="provider-modal-region" type="text" class="form-input"
                  value={getOpt('kiroRegion')}
                  onInput={e => setOpt('kiroRegion', (e.target as HTMLInputElement).value)}
                  placeholder="us-east-1" />
              </div>
              <div>
                <label class="form-label">{t('modal.authenticate')}</label>
                {oauthStatus === 'pending' ? (
                  <div style="display:flex;align-items:center;gap:12px">
                    <svg class="animate-spin" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary)" stroke-width="2"><path d="M21 12a9 9 0 1 1-6.22-8.56" /></svg>
                    <span style="font-size:13px;color:var(--color-text-dim)">{t('modal.waitingAuth')}</span>
                    <button onClick={handleCancelOAuth} class="btn btn-ghost" style="margin-left:auto;height:32px;font-size:12px">{t('modal.cancel')}</button>
                  </div>
                ) : oauthStatus === 'success' ? (
                  <div style="display:flex;align-items:center;gap:8px;padding:10px 14px;border-radius:10px;background:rgba(48,164,108,0.1);border:1px solid rgba(48,164,108,0.2)">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--color-success)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                    <span style="font-size:13px;font-weight:600;color:var(--color-success)">{t('modal.authenticated')}</span>
                  </div>
                ) : (
                  <div style="display:flex;gap:8px">
                    {(['google', 'github', 'aws-builder-id'] as const).map(method => (
                      <button key={method} onClick={() => handleStartOAuth(method)}
                        class="btn btn-ghost" style="flex:1;font-size:13px">
                        {method === 'aws-builder-id' ? t('modal.awsBuilderId') : method.charAt(0).toUpperCase() + method.slice(1)}
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
          <label class="form-label">{t('modal.models')}</label>
          <div style="display:flex;gap:10px;margin-bottom:10px">
            <input type="text" class="form-input" style="flex:1"
              value={modelInput}
              onInput={e => setModelInput((e.target as HTMLInputElement).value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addModel(); } }}
              placeholder="model-name" />
            <button onClick={addModel} class="btn btn-accent">{t('modal.add')}</button>
            <button onClick={handleFetchModels} disabled={fetchingModels} class="btn btn-ghost">
              {fetchingModels ? '...' : t('modal.fetch')}
            </button>
          </div>
          {errors.models && <p style="font-size:12px;margin-bottom:8px;color:var(--color-danger)">{errors.models}</p>}
          <div style="display:flex;flex-wrap:wrap;gap:8px">
            {form.models.map(m => (
              <span key={m} class="tag" style="display:inline-flex;align-items:center;gap:6px">
                {m}
                <button onClick={() => removeModel(m)} style="color:var(--color-text-muted);cursor:pointer;background:none;border:none;padding:0;display:flex"
                  aria-label={`Remove model ${m}`}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                </button>
              </span>
            ))}
          </div>
        </div>

        <div>
          <label class="form-label" for="provider-modal-defaultmodel">{t('modal.defaultModel')}</label>
          <Select
            value={form.defaultModel}
            onChange={v => updateField('defaultModel', v)}
            placeholder={t('modal.selectModel')}
            error={!!errors.defaultModel}
            options={form.models.map(m => ({ value: m, label: m }))}
          />
          {errors.defaultModel && <p style="font-size:12px;margin-top:4px;color:var(--color-danger)">{errors.defaultModel}</p>}
        </div>

        <div>
          <label class="form-label" for="provider-modal-prefix">{t('modal.prefix')}</label>
          <input id="provider-modal-prefix" type="text" class="form-input"
            value={Array.isArray(form.prefix) ? form.prefix.join(', ') : form.prefix || ''}
            onInput={e => {
              const val = (e.target as HTMLInputElement).value;
              const parts = val.split(',').map(s => s.trim()).filter(Boolean);
              updateField('prefix', parts.length > 1 ? parts : (parts[0] || ''));
            }}
            placeholder="prefix-" />
        </div>
      </div>

      <div style="display:flex;align-items:center;justify-content:flex-end;gap:10px;margin-top:24px;padding-top:20px;border-top:1px solid var(--color-border)">
        <button onClick={onClose} class="btn btn-ghost">{t('modal.cancel')}</button>
        <button onClick={handleSave} disabled={saving} class="btn btn-primary">
          {saving ? t('modal.saving') : isEdit ? t('modal.update') : t('modal.create')}
        </button>
      </div>
    </Modal>
  );
}
