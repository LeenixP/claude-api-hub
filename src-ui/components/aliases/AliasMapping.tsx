import { useState, useMemo, useCallback, useEffect } from 'preact/hooks';
import type { GatewayConfig } from '../../types.js';
import { saveAliases, saveTierTimeouts } from '../../lib/api.js';
import { showToast } from '../common/Toast.js';
import { Select } from '../common/Select.js';
import { useLocale } from '../../lib/i18n.js';

const TIERS = [
  { key: 'haiku', label: 'Haiku', color: '#30A46C' },
  { key: 'sonnet', label: 'Sonnet', color: '#2AA2C1' },
  { key: 'opus', label: 'Opus', color: '#8B5CF6' },
] as const;

interface AliasMappingProps {
  config: GatewayConfig | null;
  onSaved?: () => void;
}

function FlowDiagram({ aliases }: { aliases: Record<string, string> }) {
  const { t } = useLocale();

  const getTarget = (key: string) => {
    const mapped = aliases[key];
    if (!mapped) return null;
    const idx = mapped.indexOf('/');
    return idx > 0 ? { provider: mapped.substring(0, idx), model: mapped.substring(idx + 1), raw: mapped } : { provider: '', model: mapped, raw: mapped };
  };

  return (
    <div style="position:relative;padding:32px 24px 28px;border-radius:16px;background:var(--color-surface);border:1px solid var(--color-border);overflow:hidden">
      {/* Subtle grid background */}
      <div style="position:absolute;inset:0;opacity:0.03;background-image:radial-gradient(var(--color-text) 1px,transparent 1px);background-size:20px 20px;pointer-events:none" />

      {/* ── Pipeline Header ── */}
      <div style="position:relative;display:flex;align-items:center;justify-content:center;gap:0;margin-bottom:32px">
        {/* Claude Code Node */}
        <div style="display:flex;flex-direction:column;align-items:center;gap:6px">
          <div style="width:52px;height:52px;border-radius:14px;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#64748B,#475569);box-shadow:0 4px 12px rgba(100,116,139,0.3)">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="2" y="3" width="20" height="14" rx="2" ry="2" /><line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" />
            </svg>
          </div>
          <span style="font-size:11px;font-weight:700;color:var(--color-text-muted);letter-spacing:0.5px">Claude Code</span>
        </div>

        {/* Arrow 1 */}
        <div style="display:flex;align-items:center;margin:0 8px;padding-bottom:18px">
          <div style="position:relative;width:48px;height:2px;background:linear-gradient(90deg,#64748B,#F59E0B);border-radius:1px;overflow:hidden">
            <div style="position:absolute;top:-1px;left:0;width:8px;height:4px;border-radius:2px;background:#F59E0B;animation:flowDot 1.5s linear infinite" />
          </div>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="#F59E0B" style="margin-left:-1px"><polygon points="0,0 24,12 0,24" /></svg>
        </div>

        {/* API Hub Node */}
        <div style="display:flex;flex-direction:column;align-items:center;gap:6px">
          <div style="width:52px;height:52px;border-radius:14px;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#F59E0B,#D97706);box-shadow:0 4px 12px rgba(245,158,11,0.3)">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polygon points="12 2 2 7 12 12 22 7 12 2" /><polyline points="2 17 12 22 22 17" /><polyline points="2 12 12 17 22 12" />
            </svg>
          </div>
          <span style="font-size:11px;font-weight:700;color:var(--color-text-muted);letter-spacing:0.5px">API Hub</span>
        </div>

        {/* Arrow 2 */}
        <div style="display:flex;align-items:center;margin:0 8px;padding-bottom:18px">
          <div style="position:relative;width:48px;height:2px;background:linear-gradient(90deg,#F59E0B,#EC4899);border-radius:1px;overflow:hidden">
            <div style="position:absolute;top:-1px;left:0;width:8px;height:4px;border-radius:2px;background:#EC4899;animation:flowDot 1.5s linear infinite;animation-delay:0.3s" />
          </div>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="#EC4899" style="margin-left:-1px"><polygon points="0,0 24,12 0,24" /></svg>
        </div>

        {/* Alias Router Node */}
        <div style="display:flex;flex-direction:column;align-items:center;gap:6px">
          <div style="width:52px;height:52px;border-radius:14px;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#EC4899,#BE185D);box-shadow:0 4px 12px rgba(236,72,153,0.3)">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
            </svg>
          </div>
          <span style="font-size:11px;font-weight:700;color:var(--color-text-muted);letter-spacing:0.5px">{t('alias.flowRoute')}</span>
        </div>
      </div>

      {/* ── Fan-out connector ── */}
      <div style="position:relative;display:flex;justify-content:center;margin-bottom:0">
        <div style="position:relative;width:70%;max-width:520px">
          {/* Vertical stem */}
          <div style="position:absolute;left:50%;top:0;width:2px;height:16px;background:var(--color-border);transform:translateX(-50%)" />
          {/* Horizontal spread bar */}
          <div style="position:absolute;top:16px;left:16.67%;right:16.67%;height:2px;background:var(--color-border)" />
          {/* Three vertical drops */}
          <div style="position:absolute;top:16px;left:16.67%;width:2px;height:16px;background:var(--color-border)" />
          <div style="position:absolute;top:16px;left:50%;width:2px;height:16px;background:var(--color-border);transform:translateX(-50%)" />
          <div style="position:absolute;top:16px;right:16.67%;width:2px;height:16px;background:var(--color-border)" />
        </div>
      </div>

      {/* ── Tier Lanes ── */}
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-top:36px">
        {TIERS.map((tier) => {
          const target = getTarget(tier.key);
          const mapped = !!target;

          return (
            <div key={tier.key} style="display:flex;flex-direction:column;align-items:center;gap:0">
              {/* Tier Card */}
              <div style={`position:relative;width:100%;padding:20px 16px;border-radius:14px;background:${mapped ? `${tier.color}08` : 'var(--color-bg)'};border:1.5px solid ${mapped ? `${tier.color}30` : 'var(--color-border)'};text-align:center;transition:border-color 0.3s,box-shadow 0.3s${mapped ? `;box-shadow:0 0 20px ${tier.color}10` : ''}`}>
                {/* Tier Avatar */}
                <div style={`width:48px;height:48px;margin:0 auto 10px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:900;color:#fff;background:linear-gradient(135deg,${tier.color},${tier.color}CC);box-shadow:0 3px 10px ${tier.color}40`}>
                  {tier.label[0]}
                </div>
                {/* Tier Name */}
                <div style={`font-size:13px;font-weight:800;color:${tier.color};letter-spacing:0.5px;margin-bottom:2px`}>{tier.label}</div>
                <div style="font-size:11px;font-weight:600;color:var(--color-text-muted);font-family:monospace;margin-bottom:12px">claude-{tier.key}</div>

                {/* Divider */}
                <div style={`height:1px;background:linear-gradient(90deg,transparent,${mapped ? tier.color : 'var(--color-border)'},transparent);margin-bottom:12px`} />

                {/* Connection Arrow */}
                <div style="display:flex;justify-content:center;margin-bottom:10px">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={mapped ? tier.color : 'var(--color-border)'} stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <line x1="12" y1="5" x2="12" y2="19" /><polyline points="19 12 12 19 5 12" />
                  </svg>
                </div>

                {/* Target */}
                {mapped ? (
                  <div style={`padding:10px 12px;border-radius:10px;background:${tier.color}10;border:1px solid ${tier.color}25`}>
                    {target!.provider && (
                      <div style="font-size:10px;font-weight:700;color:var(--color-text-muted);text-transform:uppercase;letter-spacing:0.3px;margin-bottom:3px">{target!.provider}</div>
                    )}
                    <div style={`font-size:13px;font-weight:700;color:${tier.color};font-family:monospace;overflow:hidden;text-overflow:ellipsis;white-space:nowrap`} title={target!.raw}>
                      {target!.model}
                    </div>
                  </div>
                ) : (
                  <div style="padding:10px 12px;border-radius:10px;border:1.5px dashed var(--color-border);background:transparent">
                    <div style="font-size:12px;color:var(--color-text-muted);opacity:0.5">{t('alias.notMapped')}</div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* CSS Animations */}
      <style>{`
        @keyframes flowDot {
          0% { left: 0; opacity: 0; }
          10% { opacity: 1; }
          90% { opacity: 1; }
          100% { left: calc(100% - 8px); opacity: 0; }
        }
      `}</style>
    </div>
  );
}

function ScenarioCards() {
  const { t } = useLocale();
  const scenarios = [
    {
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#30A46C" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
      ),
      title: t('alias.sceneBudget'),
      desc: t('alias.sceneBudgetDesc'),
      color: '#30A46C',
    },
    {
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#2AA2C1" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="16 18 22 12 16 6" />
          <polyline points="8 6 2 12 8 18" />
        </svg>
      ),
      title: t('alias.sceneCode'),
      desc: t('alias.sceneCodeDesc'),
      color: '#2AA2C1',
    },
    {
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#8B5CF6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
        </svg>
      ),
      title: t('alias.sceneDeep'),
      desc: t('alias.sceneDeepDesc'),
      color: '#8B5CF6',
    },
  ];

  return (
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;margin-top:16px">
      {scenarios.map((s, i) => (
        <div
          key={i}
          style={`padding:16px;border-radius:12px;background:var(--color-surface);border:1px solid var(--color-border);border-left:3px solid ${s.color}`}
        >
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
            {s.icon}
            <span style="font-size:14px;font-weight:600;color:var(--color-text)">{s.title}</span>
          </div>
          <p style="font-size:12px;color:var(--color-text-muted);margin:0;line-height:1.5">{s.desc}</p>
        </div>
      ))}
    </div>
  );
}

export function AliasMapping({ config, onSaved }: AliasMappingProps) {
  const { t } = useLocale();
  const providers = config ? Object.entries(config.providers) : [];
  const allModels = useMemo(() => {
    const map: Record<string, string[]> = {};
    providers.forEach(([pid, p]) => {
      map[pid] = p.models || [];
    });
    return map;
  }, [providers]);

  const [aliases, setAliases] = useState<Record<string, string>>({});
  const [timeouts, setTimeouts] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);
  const [testingTier, setTestingTier] = useState<string | null>(null);

  useEffect(() => {
    if (!config) return;
    const a: Record<string, string> = {};
    const tm: Record<string, number> = {};
    TIERS.forEach(tier => {
      a[tier.key] = config.aliases?.[tier.key] || '';
      tm[tier.key] = Math.round((config.tierTimeouts?.[tier.key]?.timeoutMs || 60000) / 1000);
    });
    setAliases(a);
    setTimeouts(tm);
  }, [config]);

  const mappedCount = useMemo(() => Object.values(aliases).filter(Boolean).length, [aliases]);

  const getMatchDisplay = useCallback((tierKey: string) => {
    const val = aliases[tierKey];
    if (!val) return t('alias.notMapped');
    const slashIdx = val.indexOf('/');
    if (slashIdx > 0) {
      const pid = val.substring(0, slashIdx);
      const model = val.substring(slashIdx + 1);
      const p = providers.find(([k]) => k === pid);
      return `${p ? (p[1].name || pid) : pid} / ${model}`;
    }
    for (const [pid, p] of providers) {
      if ((p.models || []).includes(val)) {
        return `${p.name || pid} / ${val}`;
      }
    }
    return val;
  }, [aliases, providers, t]);

  const getPreview = useCallback((tierKey: string) => {
    const val = aliases[tierKey];
    if (!val) return null;
    const slashIdx = val.indexOf('/');
    if (slashIdx > 0) {
      const pid = val.substring(0, slashIdx);
      const model = val.substring(slashIdx + 1);
      const p = providers.find(([k]) => k === pid);
      return `claude-${tierKey} → ${p ? (p[1].name || pid) : pid}/${model}`;
    }
    return `claude-${tierKey} → ${val}`;
  }, [aliases, providers]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      await saveAliases(aliases);
      const tierTimeouts: Record<string, { timeoutMs: number }> = {};
      TIERS.forEach(t => {
        tierTimeouts[t.key] = { timeoutMs: (timeouts[t.key] || 60) * 1000 };
      });
      await saveTierTimeouts(tierTimeouts);
      showToast(t('alias.saved'), 'success');
      onSaved?.();
    } catch (err) {
      showToast((err as Error).message, 'error');
    } finally {
      setSaving(false);
    }
  }, [aliases, timeouts, t, onSaved]);

  const handleTestAlias = useCallback(async (tierKey: string) => {
    const val = aliases[tierKey];
    if (!val) {
      showToast(t('alias.warningUnmapped'), 'error');
      return;
    }
    setTestingTier(tierKey);
    try {
      const res = await fetch('/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: `claude-${tierKey}`,
          messages: [{ role: 'user', content: 'Hello' }],
          max_tokens: 10,
        }),
      });
      if (res.ok) {
        showToast(t('alias.testResult') + ': OK', 'success');
      } else {
        const text = await res.text().catch(() => 'Unknown error');
        showToast(t('alias.testResult') + `: ${res.status} ${text}`, 'error');
      }
    } catch (err) {
      showToast(t('alias.testResult') + `: ${(err as Error).message}`, 'error');
    } finally {
      setTestingTier(null);
    }
  }, [aliases, t]);

  return (
    <div>
      <div style="margin-bottom:24px">
        <h2 style="font-size:16px;font-weight:700;color:var(--color-text);margin-bottom:12px">{t('alias.flowTitle')}</h2>
        <FlowDiagram aliases={aliases} />
      </div>

      <div style="margin-bottom:24px">
        <h2 style="font-size:16px;font-weight:700;color:var(--color-text);margin-bottom:12px">{t('alias.scenarios')}</h2>
        <ScenarioCards />
      </div>

      <div class="flex items-center justify-between mb-4">
        <div style="display:flex;align-items:center;gap:8px">
          <p class="section-subtitle" style="margin:0">
            {t('alias.mapped', { count: mappedCount, total: TIERS.length })}
          </p>
          {mappedCount < TIERS.length && (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" title={t('alias.warningUnmapped')}>
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
          )}
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          class="btn btn-primary"
        >
          {saving ? t('alias.saving') : t('alias.saveChanges')}
        </button>
      </div>

      <div style="display:flex;flex-direction:column;gap:32px">
        {TIERS.map(tier => {
          const preview = getPreview(tier.key);
          const isUnmapped = !aliases[tier.key];
          return (
            <div
              key={tier.key}
              class="card"
              style={`padding:28px;border:2px solid var(--color-border);${isUnmapped ? 'border-left:4px solid #F59E0B' : `border-left:4px solid ${tier.color}`}`}
            >
              <div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap">
                <div style="display:flex;flex-direction:column;align-items:center;gap:6px;min-width:72px">
                  <div
                    style={`width:56px;height:56px;border-radius:14px;display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:800;color:#fff;background:${tier.color}`}
                  >
                    {tier.label[0]}
                  </div>
                  <span style={`font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:${tier.color}`}>
                    {tier.label}
                  </span>
                </div>

                <div style="flex:1;min-width:240px">
                  <label class="form-label" style="display:block;margin-bottom:6px">{t('alias.providerModel')}</label>
                  <Select
                    value={aliases[tier.key] || ''}
                    onChange={v => setAliases(prev => ({ ...prev, [tier.key]: v }))}
                    placeholder={t('alias.select')}
                    options={[
                      { value: '', label: t('alias.none') },
                      ...providers.flatMap(([pid, p]) =>
                        (allModels[pid] || p.models || []).map(m => ({
                          value: `${pid}/${m}`,
                          label: m,
                          group: p.name || pid,
                        }))
                      ),
                    ]}
                  />

                  {preview ? (
                    <div style="margin-top:10px;padding:8px 12px;border-radius:8px;background:var(--color-bg);border:1px dashed var(--color-border);display:flex;align-items:center;gap:8px">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={tier.color} stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                      <span style="font-size:12px;color:var(--color-text-muted);font-family:monospace">{preview}</span>
                    </div>
                  ) : (
                    <div style="margin-top:10px;padding:8px 12px;border-radius:8px;background:rgba(245,158,11,0.08);border:1px dashed rgba(245,158,11,0.3);display:flex;align-items:center;gap:8px">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                        <line x1="12" y1="9" x2="12" y2="13" />
                        <line x1="12" y1="17" x2="12.01" y2="17" />
                      </svg>
                      <span style="font-size:12px;color:#F59E0B">{t('alias.warningUnmapped')}</span>
                    </div>
                  )}
                </div>

                <div style="display:flex;flex-direction:column;gap:10px;min-width:120px">
                  <div>
                    <label class="block text-xs font-medium mb-1" style="color:var(--color-text-dim)">{t('alias.timeout')}</label>
                    <div class="flex items-center gap-1">
                      <input
                        type="number"
                        min={1}
                        max={300}
                        value={timeouts[tier.key] || 60}
                        onInput={e => setTimeouts(prev => ({ ...prev, [tier.key]: parseInt((e.target as HTMLInputElement).value) || 60 }))}
                        class="form-input"
                        style="width:100%"
                      />
                      <span class="text-xs" style="color:var(--color-text-muted)">s</span>
                    </div>
                  </div>

                  <button
                    onClick={() => handleTestAlias(tier.key)}
                    disabled={testingTier === tier.key || isUnmapped}
                    class="btn"
                    style={`font-size:12px;padding:6px 12px;height:auto;${isUnmapped ? 'opacity:0.4;cursor:not-allowed' : ''}`}
                  >
                    {testingTier === tier.key ? (
                      <span style="display:flex;align-items:center;gap:6px">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="animation:spin 1s linear infinite">
                          <style>{`@keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}`}</style>
                          <path d="M21 12a9 9 0 1 1-6.22-8.56" />
                        </svg>
                        {t('alias.testing')}
                      </span>
                    ) : (
                      <span style="display:flex;align-items:center;gap:6px">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                          <polyline points="9 11 12 14 22 4" />
                          <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
                        </svg>
                        {t('alias.testAlias')}
                      </span>
                    )}
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
