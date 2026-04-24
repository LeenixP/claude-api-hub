import { useState, useMemo, useCallback, useEffect } from 'preact/hooks';
import type { GatewayConfig } from '../../types.js';
import { saveAliases, saveTierTimeouts } from '../../lib/api.js';
import { showToast } from '../common/Toast.js';
import { Select } from '../common/Select.js';

const TIERS = [
  { key: 'haiku', label: 'Haiku', color: '#30A46C' },
  { key: 'sonnet', label: 'Sonnet', color: '#2AA2C1' },
  { key: 'opus', label: 'Opus', color: '#8B5CF6' },
] as const;

interface AliasMappingProps {
  config: GatewayConfig | null;
}

export function AliasMapping({ config }: AliasMappingProps) {
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

  useEffect(() => {
    if (!config) return;
    const a: Record<string, string> = {};
    const t: Record<string, number> = {};
    TIERS.forEach(tier => {
      a[tier.key] = config.aliases?.[tier.key] || '';
      t[tier.key] = Math.round((config.tierTimeouts?.[tier.key]?.timeoutMs || 60000) / 1000);
    });
    setAliases(a);
    setTimeouts(t);
  }, [config]);

  const getMatchDisplay = useCallback((tierKey: string) => {
    const model = aliases[tierKey];
    if (!model) return 'Not mapped';
    for (const [pid, p] of providers) {
      if ((p.models || []).includes(model)) {
        return `${p.name || pid} / ${model}`;
      }
    }
    return model;
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
      showToast('Aliases saved', 'success');
    } catch (err) {
      showToast((err as Error).message, 'error');
    } finally {
      setSaving(false);
    }
  }, [aliases, timeouts]);

  return (
    <div>
      <div class="flex items-center justify-between mb-4">
        <div>
          <p class="section-subtitle">{Object.values(aliases).filter(Boolean).length} of {TIERS.length} tiers mapped</p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          class="btn btn-primary"
        >
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>

      <div class="space-y-3">
        {TIERS.map(tier => (
          <div
            key={tier.key}
            class="card flex items-center gap-4"
          >
            <div
              class="flex-shrink-0 w-20 py-1 rounded text-center text-xs font-bold uppercase tracking-wider"
              style={`background:${tier.color}20;color:${tier.color}`}
            >
              {tier.label}
            </div>

            <div class="flex-1 min-w-0">
              <label class="form-label">Provider / Model</label>
              <Select
                value={aliases[tier.key] || ''}
                onChange={v => setAliases(prev => ({ ...prev, [tier.key]: v }))}
                placeholder="— Select —"
                options={[
                  { value: '', label: '— None —' },
                  ...providers.flatMap(([pid, p]) =>
                    (allModels[pid] || p.models || []).map(m => ({
                      value: m, label: m, group: p.name || pid,
                    }))
                  ),
                ]}
              />
              <p class="truncate" style="font-size:12px;margin-top:6px;color:var(--color-text-muted)">
                {getMatchDisplay(tier.key)}
              </p>
            </div>

            <div class="w-24 flex-shrink-0">
              <label class="block text-xs font-medium mb-1" style="color:var(--color-text-dim)">Timeout</label>
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
          </div>
        ))}
      </div>
    </div>
  );
}
