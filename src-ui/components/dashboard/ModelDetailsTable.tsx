import { useMemo, useState } from 'preact/hooks';
import type { TokenStats, GatewayConfig } from '../../types.js';
import { formatTokens, relativeTime } from '../../lib/utils.js';
import { Select } from '../common/Select.js';
import { useLocale } from '../../lib/i18n.js';

interface ModelDetailsTableProps {
  tokenStats: TokenStats | null;
  config?: GatewayConfig | null;
}

type SortField = 'totalTokens' | 'requestCount' | 'promptTokens' | 'completionTokens' | 'provider' | 'model';
type SortDir = 'asc' | 'desc';

const PAGE_SIZE = 15;

export function ModelDetailsTable({ tokenStats, config }: ModelDetailsTableProps) {
  const { t } = useLocale();
  const [search, setSearch] = useState('');
  const [sortField, setSortField] = useState<SortField>('totalTokens');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [page, setPage] = useState(0);

  const modelToProvider = useMemo(() => {
    const map = new Map<string, string>();
    if (!config) return map;
    for (const [, pc] of Object.entries(config.providers)) {
      const label = pc.name || '';
      for (const m of pc.models || []) {
        map.set(m, label);
      }
    }
    return map;
  }, [config]);

  const filtered = useMemo(() => {
    const byModel = tokenStats?.byModel || [];
    const kw = search.trim().toLowerCase();
    let list = kw
      ? byModel.filter(m => m.provider.toLowerCase().includes(kw) || m.model.toLowerCase().includes(kw))
      : byModel.slice();

    list.sort((a, b) => {
      if (sortField === 'provider' || sortField === 'model') {
        const av = String(a[sortField] || '');
        const bv = String(b[sortField] || '');
        return sortDir === 'desc' ? bv.localeCompare(av) : av.localeCompare(bv);
      }
      const av = Number(a[sortField] || 0);
      const bv = Number(b[sortField] || 0);
      return sortDir === 'desc' ? bv - av : av - bv;
    });

    return list;
  }, [tokenStats, search, sortField, sortDir]);

  const pageCount = Math.ceil(filtered.length / PAGE_SIZE);
  const safePage = Math.min(page, Math.max(pageCount - 1, 0));
  const paged = filtered.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);

  function handleSort(field: SortField) {
    if (sortField === field) {
      setSortDir(d => d === 'desc' ? 'asc' : 'desc');
    } else {
      setSortField(field);
      setSortDir('desc');
    }
    setPage(0);
  }

  function SortIcon({ field }: { field: SortField }) {
    if (sortField !== field) return null;
    return <span style="margin-left:2px">{sortDir === 'desc' ? '▼' : '▲'}</span>;
  }

  if (!tokenStats || !tokenStats.byModel?.length) {
    return null;
  }

  return (
    <div class="card" style="padding:0;margin-top:24px">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;padding:16px 20px;border-bottom:1px solid var(--color-border)">
        <div style="font-size:14px;font-weight:600;color:var(--color-text);display:flex;align-items:center;gap:6px">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M9 3H5a2 2 0 0 0-2 2v4m6-6h10a2 2 0 0 1 2 2v4M9 3v18m0 0h10a2 2 0 0 0 2-2V9M9 21H5a2 2 0 0 1-2-2V9m0 0h18" />
          </svg>
          {t('modelDetail.title')}
          <span style="font-size:11px;font-weight:400;color:var(--color-text-muted)">({tokenStats.byModel.length})</span>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <input
            type="search"
            placeholder={t('modelDetail.search')}
            value={search}
            onInput={(e: any) => { setSearch(e.currentTarget.value); setPage(0); }}
            style="height:32px;padding:0 10px;border-radius:6px;border:1px solid var(--color-border);background:var(--color-bg);color:var(--color-text);font-size:12px;width:180px;outline:none"
          />
          <div style="min-width:200px">
          <Select
            value={`${sortField}-${sortDir}`}
            onChange={v => {
              const [f, d] = v.split('-');
              setSortField(f as SortField);
              setSortDir(d as SortDir);
              setPage(0);
            }}
            options={[
              { value: 'totalTokens-desc', label: t('modelDetail.sortTotalDesc') },
              { value: 'requestCount-desc', label: t('modelDetail.sortRequestsDesc') },
              { value: 'promptTokens-desc', label: t('modelDetail.sortPromptDesc') },
              { value: 'completionTokens-desc', label: t('modelDetail.sortCompletionDesc') },
              { value: 'provider-asc', label: t('modelDetail.sortProviderAsc') },
              { value: 'model-asc', label: t('modelDetail.sortModelAsc') },
            ]}
          />
          </div>
        </div>
      </div>

      <div style="overflow-x:auto">
        <table style="width:100%;table-layout:fixed;border-collapse:collapse;font-size:13px">
          <colgroup>
            <col style="width:12%" />
            <col style="width:30%" />
            <col style="width:10%" />
            <col style="width:12%" />
            <col style="width:12%" />
            <col style="width:12%" />
            <col style="width:12%" />
          </colgroup>
          <thead>
            <tr>
              {(['provider', 'model', 'requestCount', 'promptTokens', 'completionTokens', 'totalTokens', 'lastUsed'] as const).map(col => {
                const i18nKey: Record<string, string> = {
                  provider: 'modelDetail.provider',
                  model: 'modelDetail.model',
                  requestCount: 'modelDetail.requests',
                  promptTokens: 'modelDetail.prompt',
                  completionTokens: 'modelDetail.completion',
                  totalTokens: 'modelDetail.total',
                  lastUsed: 'modelDetail.lastUsed',
                };
                const fieldMap: Record<string, SortField | null> = {
                  provider: 'provider',
                  model: 'model',
                  requestCount: 'requestCount',
                  promptTokens: 'promptTokens',
                  completionTokens: 'completionTokens',
                  totalTokens: 'totalTokens',
                  lastUsed: null,
                };
                const sortField_ = fieldMap[col];
                return (
                  <th
                    key={col}
                    onClick={sortField_ ? () => handleSort(sortField_) : undefined}
                    style={{
                      textAlign: 'left',
                      padding: '10px 14px',
                      fontSize: 11,
                      fontWeight: 600,
                      color: 'var(--color-text-muted)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.3px',
                      borderBottom: '1px solid var(--color-border)',
                      cursor: sortField_ ? 'pointer' : 'default',
                      userSelect: 'none',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {t(i18nKey[col])}
                    {sortField_ && <SortIcon field={sortField_} />}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {paged.length === 0 ? (
              <tr>
                <td colspan="7" style="text-align:center;padding:32px;color:var(--color-text-muted);font-size:13px">
                  {t('modelDetail.noMatching')}
                </td>
              </tr>
            ) : (
              paged.map((m, i) => {
                const pv = m.provider || modelToProvider.get(m.model) || '-';
                return (
                  <tr key={`${m.provider}-${m.model}`}>
                    <td style="padding:10px 14px;border-bottom:1px solid var(--color-border);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
                      <span style="display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:4px;background:var(--color-bg);font-size:11px;font-weight:500;color:var(--color-text-muted)">{pv}</span>
                    </td>
                    <td style="padding:10px 14px;border-bottom:1px solid var(--color-border);font-weight:500;color:var(--color-text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{m.model}</td>
                    <td style="padding:10px 14px;border-bottom:1px solid var(--color-border);font-family:monospace;font-size:12px;overflow:hidden;text-overflow:ellipsis">{m.requestCount.toLocaleString()}</td>
                    <td style="padding:10px 14px;border-bottom:1px solid var(--color-border);font-family:monospace;font-size:12px;overflow:hidden;text-overflow:ellipsis">{formatTokens(m.promptTokens)}</td>
                    <td style="padding:10px 14px;border-bottom:1px solid var(--color-border);font-family:monospace;font-size:12px;overflow:hidden;text-overflow:ellipsis">{formatTokens(m.completionTokens)}</td>
                    <td style="padding:10px 14px;border-bottom:1px solid var(--color-border);font-family:monospace;font-size:12px;font-weight:600;overflow:hidden;text-overflow:ellipsis">{formatTokens(m.totalTokens)}</td>
                    <td style="padding:10px 14px;border-bottom:1px solid var(--color-border);font-size:12px;color:var(--color-text-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">{relativeTime(m.lastUsedAt) || '-'}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {pageCount > 1 && (
        <div style="display:flex;align-items:center;justify-content:center;gap:8px;padding:12px 20px;border-top:1px solid var(--color-border)">
          <button
            onClick={() => setPage(p => Math.max(0, p - 1))}
            disabled={safePage === 0}
            style="height:28px;padding:0 10px;border-radius:4px;border:1px solid var(--color-border);background:var(--color-bg);color:var(--color-text);font-size:11px;cursor:pointer;opacity:1"
          >
            ←
          </button>
          {Array.from({ length: pageCount }, (_, i) => (
            <button
              key={i}
              onClick={() => setPage(i)}
              style={{
                height: 28,
                minWidth: 28,
                borderRadius: 4,
                border: i === safePage ? '1px solid var(--color-primary)' : '1px solid var(--color-border)',
                background: i === safePage ? 'var(--color-primary)' : 'var(--color-bg)',
                color: i === safePage ? 'white' : 'var(--color-text)',
                fontSize: 11,
                cursor: 'pointer',
              }}
            >
              {i + 1}
            </button>
          ))}
          <button
            onClick={() => setPage(p => Math.min(pageCount - 1, p + 1))}
            disabled={safePage >= pageCount - 1}
            style="height:28px;padding:0 10px;border-radius:4px;border:1px solid var(--color-border);background:var(--color-bg);color:var(--color-text);font-size:11px;cursor:pointer"
          >
            →
          </button>
        </div>
      )}
    </div>
  );
}
