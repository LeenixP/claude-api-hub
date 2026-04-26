import { useState, useMemo, useCallback } from 'preact/hooks';
import type { LogEntry } from '../../types.js';
import { formatRelativeTime } from '../../lib/utils.js';
import { useCanvasChart } from '../../hooks/useCanvasChart.js';
import { useLocale } from '../../lib/i18n.js';

interface TrendChartProps {
  logs: LogEntry[];
  rangeHours: number;
}

interface Bucket { time: number; ok: number; errors: number; total: number; }

export function TrendChart({ logs, rangeHours }: TrendChartProps) {
  const { t } = useLocale();
  const [range, setRange] = useState(rangeHours);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; bucket: Bucket } | null>(null);

  const buckets = useMemo(() => {
    const now = Date.now();
    const cutoff = now - range * 60 * 60 * 1000;
    const filtered = logs.filter(l => new Date(l.time).getTime() >= cutoff);
    const bucketCount = range === 1 ? 12 : range === 6 ? 24 : 48;
    const interval = (range * 60 * 60 * 1000) / bucketCount;
    const bs: Bucket[] = [];
    for (let i = 0; i < bucketCount; i++) {
      const start = cutoff + i * interval;
      const end = start + interval;
      const bucketLogs = filtered.filter(l => {
        const t = new Date(l.time).getTime();
        return t >= start && t < end;
      });
      const ok = bucketLogs.filter(l => l.status >= 200 && l.status < 300).length;
      bs.push({ time: start + interval / 2, ok, errors: bucketLogs.length - ok, total: bucketLogs.length });
    }
    return bs;
  }, [logs, range]);

  const drawContent = useCallback((ctx: CanvasRenderingContext2D, w: number, h: number, data: unknown[], progress: number, prev: unknown[], current: unknown[]) => {
    const bs = data as Bucket[];
    const prevTotals = prev as Bucket[];
    const currTotals = current as Bucket[];
    const pad = { top: 12, right: 12, bottom: 28, left: 36 };
    const cw = w - pad.left - pad.right;
    const ch = h - pad.top - pad.bottom;

    const style = getComputedStyle(document.documentElement);
    const mutedColor = style.getPropertyValue('--color-text-muted').trim() || '#5c6370';
    const primaryColor = style.getPropertyValue('--color-primary').trim() || '#26a9c9';

    const barW = cw / bs.length;
    const maxTotal = Math.max(1,
      ...bs.map((_, i) => {
        const p = prevTotals[i]?.total || 0;
        const c = currTotals[i]?.total || 0;
        return p + (c - p) * progress;
      })
    );

    // Y-axis labels
    for (let i = 0; i <= 4; i++) {
      const y = pad.top + (ch / 4) * i;
      ctx.fillText(String(Math.round(maxTotal * (1 - i / 4))), pad.left - 6, y + 3);
    }

    // Area fill with interpolated values
    const grad = ctx.createLinearGradient(0, pad.top, 0, pad.top + ch);
    grad.addColorStop(0, primaryColor + '30');
    grad.addColorStop(1, primaryColor + '02');
    ctx.beginPath();
    ctx.moveTo(pad.left, pad.top + ch);
    bs.forEach((_, i) => {
      const p = prevTotals[i]?.total || 0;
      const c = currTotals[i]?.total || 0;
      const val = p + (c - p) * progress;
      const x = pad.left + i * barW + barW / 2;
      ctx.lineTo(x, pad.top + ch - (val / maxTotal) * ch);
    });
    ctx.lineTo(pad.left + cw, pad.top + ch);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    // Line with interpolated values
    ctx.beginPath();
    ctx.strokeStyle = primaryColor;
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    bs.forEach((_, i) => {
      const p = prevTotals[i]?.total || 0;
      const c = currTotals[i]?.total || 0;
      const val = p + (c - p) * progress;
      const x = pad.left + i * barW + barW / 2;
      const y = pad.top + ch - (val / maxTotal) * ch;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // X-axis
    ctx.fillStyle = mutedColor;
    ctx.font = '10px -apple-system, sans-serif';
    ctx.textAlign = 'center';
    const labelCount = range === 1 ? 4 : 6;
    for (let i = 0; i < labelCount; i++) {
      const idx = Math.floor((bs.length - 1) * (i / (labelCount - 1)));
      const x = pad.left + idx * barW + barW / 2;
      const d = new Date(bs[idx].time);
      const label = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      ctx.fillText(label, x, h - 8);
    }
  }, [range]);

  const { canvasRef, containerRef, adjustTooltipEdge } = useCanvasChart(buckets, { drawContent });

  return (
    <div class="card" style="overflow:hidden;display:flex;flex-direction:column;height:100%">
      <div class="flex items-center justify-between mb-2">
        <div>
          <span style="font-size:13px;font-weight:600;color:var(--color-text);display:flex;align-items:center;gap:6px">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12" /></svg>
            {t('chart.requests')}
          </span>
          <span style="font-size:12px;color:var(--color-text-muted);margin-left:8px">{t('chart.lastHours', { range })}</span>
        </div>
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
      {logs.length === 0 ? (
        <div ref={containerRef} style="position:relative;flex:1;min-height:200px">
          <canvas ref={canvasRef} role="img" aria-label={t('chart.requests')} style="display:block;width:100%;height:100%" />
        </div>
      ) : (
        <div ref={containerRef} style="position:relative;flex:1;min-height:200px"
          onMouseMove={e => {
            const canvas = canvasRef.current; if (!canvas) return;
            const rect = canvas.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const pad = { left: 36, right: 12 };
            const cw = rect.width - pad.left - pad.right;
            const barW = cw / buckets.length;
            const idx = Math.floor((x - pad.left) / barW);
            if (idx >= 0 && idx < buckets.length) setTooltip({ x: e.clientX - rect.left, y: e.clientY - rect.top, bucket: buckets[idx] });
            else setTooltip(null);
          }}
          onMouseLeave={() => setTooltip(null)}>
          <canvas ref={canvasRef} role="img" aria-label={t('chart.requests')} style="display:block;width:100%" />
          {tooltip && (
            <div style={`position:absolute;pointer-events:none;top:${tooltip.y}px;padding:6px 12px;border-radius:6px;background:var(--color-surface-hover);border:1px solid var(--color-border);font-size:12px;z-index:10;white-space:nowrap;transform:translate(-50%,-110%);transition:left 0.05s ease`}
              ref={(el) => adjustTooltipEdge(el, tooltip.x)}>
              <span style="color:var(--color-text-dim)">{formatRelativeTime(new Date(tooltip.bucket.time).toISOString())}</span>
              <span style="color:var(--color-text);margin-left:8px;font-weight:600">{t('chart.requests')}: {tooltip.bucket.total}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
