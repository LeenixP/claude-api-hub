import { useState, useMemo, useCallback } from 'preact/hooks';
import type { LogEntry } from '../../types.js';
import { formatTokens } from '../../lib/utils.js';
import { useCanvasChart } from '../../hooks/useCanvasChart.js';
import { useLocale } from '../../lib/i18n.js';

interface TokenChartProps {
  logs: LogEntry[];
  rangeHours: number;
}

interface TokenBucket { time: number; input: number; output: number; }

export function TokenChart({ logs, rangeHours }: TokenChartProps) {
  const { t } = useLocale();
  const [range, setRange] = useState(rangeHours);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; label: string; value: string } | null>(null);

  const buckets = useMemo(() => {
    const now = Date.now();
    const cutoff = now - range * 60 * 60 * 1000;
    const filtered = logs.filter(l => new Date(l.time).getTime() >= cutoff);
    const bucketCount = range === 1 ? 12 : range === 6 ? 24 : 48;
    const interval = (range * 60 * 60 * 1000) / bucketCount;
    const bs: TokenBucket[] = [];
    for (let i = 0; i < bucketCount; i++) {
      const start = cutoff + i * interval;
      const end = start + interval;
      const bucketLogs = filtered.filter(l => {
        const t = new Date(l.time).getTime();
        return t >= start && t < end;
      });
      bs.push({
        time: start + interval / 2,
        input: bucketLogs.reduce((s, l) => s + (l.inputTokens || 0), 0),
        output: bucketLogs.reduce((s, l) => s + (l.outputTokens || 0), 0),
      });
    }
    return bs;
  }, [logs, range]);

  const drawContent = useCallback((ctx: CanvasRenderingContext2D, w: number, h: number, data: unknown[], progress: number, prev: unknown[], current: unknown[]) => {
    const bs = data as TokenBucket[];
    const prevBuckets = prev as TokenBucket[];
    const currBuckets = current as TokenBucket[];
    const pad = { top: 12, right: 12, bottom: 28, left: 42 };
    const cw = w - pad.left - pad.right;
    const ch = h - pad.top - pad.bottom;

    const style = getComputedStyle(document.documentElement);
    const mutedColor = style.getPropertyValue('--color-text-muted').trim() || '#5c6370';
    const primaryColor = style.getPropertyValue('--color-primary').trim() || '#26a9c9';
    const successColor = style.getPropertyValue('--color-success').trim() || '#2da44e';

    const barW = Math.max(2, cw / bs.length - 2);

    const maxVal = Math.max(1,
      ...bs.map((_, i) => {
        const inputVal = (prevBuckets[i]?.input || 0) + ((currBuckets[i]?.input || 0) - (prevBuckets[i]?.input || 0)) * progress;
        const outputVal = (prevBuckets[i]?.output || 0) + ((currBuckets[i]?.output || 0) - (prevBuckets[i]?.output || 0)) * progress;
        return inputVal + outputVal;
      })
    );

    for (let i = 0; i <= 4; i++) {
      const y = pad.top + (ch / 4) * i;
      ctx.fillText(formatTokens(Math.round(maxVal * (1 - i / 4))), pad.left - 6, y + 3);
    }

    bs.forEach((_, i) => {
      const inputVal = (prevBuckets[i]?.input || 0) + ((currBuckets[i]?.input || 0) - (prevBuckets[i]?.input || 0)) * progress;
      const outputVal = (prevBuckets[i]?.output || 0) + ((currBuckets[i]?.output || 0) - (prevBuckets[i]?.output || 0)) * progress;
      const totalVal = inputVal + outputVal;

      const x = pad.left + i * (barW + 2) + 1;
      const totalH = (totalVal / maxVal) * ch;
      const inputH = (inputVal / maxVal) * ch;

      if (inputH > 1) {
        ctx.fillStyle = primaryColor + '70';
        ctx.fillRect(x, pad.top + ch - totalH, barW, inputH);
      }
      if (totalH - inputH > 1) {
        ctx.fillStyle = successColor + '60';
        ctx.fillRect(x, pad.top + ch - totalH + inputH, barW, totalH - inputH);
      }
    });

    ctx.fillStyle = mutedColor;
    ctx.font = '10px -apple-system, sans-serif';
    ctx.textAlign = 'center';
    const labelCount = range === 1 ? 4 : 6;
    for (let i = 0; i < labelCount; i++) {
      const idx = Math.floor((bs.length - 1) * (i / (labelCount - 1)));
      const x = pad.left + idx * (barW + 2) + barW / 2;
      const d = new Date(bs[idx].time);
      ctx.fillText(d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), x, h - 8);
    }
  }, [range]);

  const { canvasRef, containerRef, adjustTooltipEdge } = useCanvasChart(buckets, { drawContent });

  const totalInput = buckets.reduce((s, b) => s + b.input, 0);
  const totalOutput = buckets.reduce((s, b) => s + b.output, 0);
  const totalAll = totalInput + totalOutput;

  return (
    <div class="card" style="overflow:hidden;display:flex;flex-direction:column;height:100%">
      <div class="flex items-center justify-between mb-2">
        <div>
          <span style="font-size:13px;font-weight:600;color:var(--color-text);display:flex;align-items:center;gap:6px">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" /></svg>
            {t('chart.tokens')}
          </span>
          <span style="font-size:12px;color:var(--color-text-muted);margin-left:8px">{t('chart.lastHours', { range })}</span>
        </div>
        <div style="display:flex;align-items:center;gap:12px;font-size:11px;color:var(--color-text-muted)">
          <span style="display:flex;align-items:center;gap:4px"><span style="width:8px;height:8px;border-radius:2px;background:var(--color-primary);opacity:0.7" /> {t('chart.input')}</span>
          <span style="display:flex;align-items:center;gap:4px"><span style="width:8px;height:8px;border-radius:2px;background:var(--color-success);opacity:0.6" /> {t('chart.output')}</span>
          <div class="flex gap-1">
            {[1, 6, 24].map(h => (
              <button key={h} onClick={() => setRange(h)}
                style={`padding:3px 10px;border-radius:5px;font-size:11px;font-weight:600;cursor:pointer;border:none;${
                  range === h ? 'background:var(--color-primary);color:#fff' : 'background:none;color:var(--color-text-muted)'
                }`}>
                {h}h
              </button>
            ))}
          </div>
        </div>
      </div>
      {logs.length === 0 ? (
        <div ref={containerRef} style="position:relative;flex:1;min-height:200px">
          <canvas ref={canvasRef} role="img" aria-label={t('chart.tokens')} style="display:block;width:100%;height:100%" />
        </div>
      ) : (
        <div ref={containerRef} style="position:relative;flex:1;min-height:200px"
          onMouseMove={e => {
            const canvas = canvasRef.current; if (!canvas) return;
            const rect = canvas.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const pad = { left: 42, right: 12 };
            const cw = rect.width - pad.left - pad.right;
            const barW = Math.max(2, cw / buckets.length - 2);
            const idx = Math.floor((x - pad.left) / (barW + 2));
            if (idx >= 0 && idx < buckets.length) {
              const b = buckets[idx];
              const d = new Date(b.time);
              setTooltip({
                x: e.clientX - rect.left,
                y: e.clientY - rect.top,
                label: d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                value: `${t('chart.input')}: ${formatTokens(b.input)} / ${t('chart.output')}: ${formatTokens(b.output)}`,
              });
            } else {
              setTooltip(null);
            }
          }}
          onMouseLeave={() => setTooltip(null)}>
          <canvas ref={canvasRef} role="img" aria-label={t('chart.tokens')} style="display:block;width:100%" />
          {tooltip && (
            <div style={`position:absolute;pointer-events:none;top:${tooltip.y}px;padding:6px 12px;border-radius:6px;background:var(--color-surface-hover);border:1px solid var(--color-border);font-size:12px;z-index:10;white-space:nowrap;transform:translate(-50%,-110%);transition:left 0.05s ease`}
              ref={(el) => adjustTooltipEdge(el, tooltip.x)}>
              <span style="color:var(--color-text-dim)">{tooltip.label}</span>
              <span style="color:var(--color-text);margin-left:8px;font-weight:600">{tooltip.value}</span>
            </div>
          )}
        </div>
      )}
      {logs.length > 0 && (
        <div style="display:flex;gap:16px;margin-top:12px;font-size:12px;color:var(--color-text-muted)">
          <span>{t('chart.input')}: {formatTokens(totalInput)}</span>
          <span>{t('chart.output')}: {formatTokens(totalOutput)}</span>
          <span>{t('stats.totalTokens')}: {formatTokens(totalAll)}</span>
        </div>
      )}
    </div>
  );
}
