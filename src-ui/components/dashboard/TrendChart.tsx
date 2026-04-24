import { useState, useEffect, useRef, useMemo, useCallback } from 'preact/hooks';
import type { LogEntry } from '../../types.js';

interface TrendChartProps {
  logs: LogEntry[];
  rangeHours: number;
}

interface Bucket {
  time: number;
  ok: number;
  errors: number;
  total: number;
}

export function TrendChart({ logs, rangeHours }: TrendChartProps) {
  const [range, setRange] = useState(rangeHours);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
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

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = container.getBoundingClientRect();
    const w = rect.width;
    const h = 220;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);

    const padding = { top: 20, right: 16, bottom: 32, left: 40 };
    const chartW = w - padding.left - padding.right;
    const chartH = h - padding.top - padding.bottom;

    const maxTotal = Math.max(1, ...buckets.map(b => b.total));
    const maxErrors = Math.max(1, ...buckets.map(b => b.errors));

    ctx.clearRect(0, 0, w, h);

    // Grid lines
    ctx.strokeStyle = 'var(--color-border)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = padding.top + (chartH / 4) * i;
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(padding.left + chartW, y);
      ctx.stroke();
      const label = Math.round(maxTotal * (1 - i / 4));
      ctx.fillStyle = 'var(--color-text-muted)';
      ctx.font = '11px sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(String(label), padding.left - 6, y + 3);
    }

    if (buckets.length === 0) return;

    const barW = chartW / buckets.length;

    // OK area gradient
    const okGrad = ctx.createLinearGradient(0, padding.top, 0, padding.top + chartH);
    okGrad.addColorStop(0, 'rgba(42,162,193,0.35)');
    okGrad.addColorStop(1, 'rgba(42,162,193,0.02)');

    // Draw OK area
    ctx.beginPath();
    ctx.moveTo(padding.left, padding.top + chartH);
    buckets.forEach((b, i) => {
      const x = padding.left + i * barW + barW / 2;
      const y = padding.top + chartH - (b.total / maxTotal) * chartH;
      if (i === 0) ctx.lineTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.lineTo(padding.left + chartW, padding.top + chartH);
    ctx.closePath();
    ctx.fillStyle = okGrad;
    ctx.fill();

    // Draw OK line
    ctx.beginPath();
    ctx.strokeStyle = 'var(--color-primary)';
    ctx.lineWidth = 2;
    buckets.forEach((b, i) => {
      const x = padding.left + i * barW + barW / 2;
      const y = padding.top + chartH - (b.total / maxTotal) * chartH;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // Error area
    if (maxErrors > 0) {
      const errGrad = ctx.createLinearGradient(0, padding.top, 0, padding.top + chartH);
      errGrad.addColorStop(0, 'rgba(255,82,82,0.25)');
      errGrad.addColorStop(1, 'rgba(255,82,82,0.02)');
      ctx.beginPath();
      ctx.moveTo(padding.left, padding.top + chartH);
      buckets.forEach((b, i) => {
        const x = padding.left + i * barW + barW / 2;
        const y = padding.top + chartH - (b.errors / maxTotal) * chartH;
        if (i === 0) ctx.lineTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.lineTo(padding.left + chartW, padding.top + chartH);
      ctx.closePath();
      ctx.fillStyle = errGrad;
      ctx.fill();

      ctx.beginPath();
      ctx.strokeStyle = 'var(--color-danger)';
      ctx.lineWidth = 1.5;
      buckets.forEach((b, i) => {
        const x = padding.left + i * barW + barW / 2;
        const y = padding.top + chartH - (b.errors / maxTotal) * chartH;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    }

    // X-axis labels
    ctx.fillStyle = 'var(--color-text-muted)';
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'center';
    const labelCount = range === 1 ? 4 : range === 6 ? 6 : 8;
    for (let i = 0; i < labelCount; i++) {
      const idx = Math.floor((buckets.length - 1) * (i / (labelCount - 1)));
      const b = buckets[idx];
      const x = padding.left + idx * barW + barW / 2;
      const d = new Date(b.time);
      const label = range === 1
        ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        : d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      ctx.fillText(label, x, h - 10);
    }
  }, [buckets, range]);

  useEffect(() => {
    draw();
    const onResize = () => draw();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [draw]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const padding = { top: 20, right: 16, bottom: 32, left: 40 };
    const chartW = rect.width - padding.left - padding.right;
    const barW = chartW / buckets.length;
    const idx = Math.floor((x - padding.left) / barW);
    if (idx >= 0 && idx < buckets.length) {
      const bucket = buckets[idx];
      setTooltip({ x: e.clientX - rect.left, y: e.clientY - rect.top, bucket });
    } else {
      setTooltip(null);
    }
  }, [buckets]);

  const handleMouseLeave = useCallback(() => setTooltip(null), []);

  return (
    <div class="card overflow-hidden">
      <div class="flex items-center justify-between mb-4">
        <h3 class="text-sm font-semibold" style="color:var(--color-text)">Request Trend</h3>
        <div class="flex gap-1">
          {[1, 6, 24].map(h => (
            <button
              key={h}
              onClick={() => setRange(h)}
              class="px-2 py-1 rounded text-xs font-medium transition-colors"
              style={range === h
                ? 'background:var(--color-primary);color:#fff'
                : 'background:var(--color-bg);color:var(--color-text-dim)'
              }
            >
              {h}H
            </button>
          ))}
        </div>
      </div>
      <div ref={containerRef} class="relative" onMouseMove={handleMouseMove} onMouseLeave={handleMouseLeave}>
        <canvas ref={canvasRef} />
        {tooltip && (
          <div
            class="absolute pointer-events-none rounded-lg px-3 py-2 text-xs shadow-lg z-10"
            style="background:var(--color-surface-hover);border:1px solid var(--color-border);transform:translate(-50%, -110%);left:50%"
          >
            <div class="font-medium mb-1" style="color:var(--color-text)">
              {new Date(tooltip.bucket.time).toLocaleString()}
            </div>
            <div class="flex items-center gap-3">
              <span style="color:var(--color-primary)">OK: {tooltip.bucket.ok}</span>
              <span style="color:var(--color-danger)">Errors: {tooltip.bucket.errors}</span>
              <span style="color:var(--color-text-dim)">Total: {tooltip.bucket.total}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
