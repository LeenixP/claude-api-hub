import { useState, useEffect, useRef, useMemo, useCallback } from 'preact/hooks';
import type { LogEntry } from '../../types.js';
import { formatRelativeTime } from '../../lib/utils.js';

interface TrendChartProps {
  logs: LogEntry[];
  rangeHours: number;
}

interface Bucket { time: number; ok: number; errors: number; total: number; }

export function TrendChart({ logs, rangeHours }: TrendChartProps) {
  const [range, setRange] = useState(rangeHours);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; bucket: Bucket } | null>(null);
  const rafRef = useRef<number>(0);
  const prevDataRef = useRef<{ logs: LogEntry[]; range: number } | null>(null);

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
    const h = 200;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);

    const pad = { top: 12, right: 12, bottom: 28, left: 36 };
    const cw = w - pad.left - pad.right;
    const ch = h - pad.top - pad.bottom;
    const maxTotal = Math.max(1, ...buckets.map(b => b.total));

    ctx.clearRect(0, 0, w, h);

    // Grid
    const style = getComputedStyle(document.documentElement);
    const gridColor = style.getPropertyValue('--color-border').trim() || 'rgba(255,255,255,0.07)';
    const mutedColor = style.getPropertyValue('--color-text-muted').trim() || '#5c6370';
    const primaryColor = style.getPropertyValue('--color-primary').trim() || '#26a9c9';
    const dangerColor = style.getPropertyValue('--color-danger').trim() || '#e74c3c';

    ctx.strokeStyle = gridColor;
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = pad.top + (ch / 4) * i;
      ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(pad.left + cw, y); ctx.stroke();
      ctx.fillStyle = mutedColor;
      ctx.font = '10px -apple-system, sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(String(Math.round(maxTotal * (1 - i / 4))), pad.left - 6, y + 3);
    }

    if (buckets.length === 0) return;

    const barW = cw / buckets.length;

    // Area fill
    const grad = ctx.createLinearGradient(0, pad.top, 0, pad.top + ch);
    grad.addColorStop(0, primaryColor + '30');
    grad.addColorStop(1, primaryColor + '02');
    ctx.beginPath();
    ctx.moveTo(pad.left, pad.top + ch);
    buckets.forEach((b, i) => {
      const x = pad.left + i * barW + barW / 2;
      ctx.lineTo(x, pad.top + ch - (b.total / maxTotal) * ch);
    });
    ctx.lineTo(pad.left + cw, pad.top + ch);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    // Line
    ctx.beginPath();
    ctx.strokeStyle = primaryColor;
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    buckets.forEach((b, i) => {
      const x = pad.left + i * barW + barW / 2;
      const y = pad.top + ch - (b.total / maxTotal) * ch;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // X-axis
    ctx.fillStyle = mutedColor;
    ctx.font = '10px -apple-system, sans-serif';
    ctx.textAlign = 'center';
    const labelCount = range === 1 ? 4 : 6;
    for (let i = 0; i < labelCount; i++) {
      const idx = Math.floor((buckets.length - 1) * (i / (labelCount - 1)));
      const x = pad.left + idx * barW + barW / 2;
      const d = new Date(buckets[idx].time);
      const label = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      ctx.fillText(label, x, h - 8);
    }
  }, [buckets, range]);

  useEffect(() => {
    const dataChanged = !prevDataRef.current || prevDataRef.current.logs !== logs || prevDataRef.current.range !== range;
    prevDataRef.current = { logs, range };
    if (!dataChanged) return;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => { draw(); rafRef.current = 0; });
    const onResize = () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => { draw(); rafRef.current = 0; });
    };
    window.addEventListener('resize', onResize);
    return () => { window.removeEventListener('resize', onResize); if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [draw, logs, range]);

  return (
    <div class="card" style="overflow:hidden">
      <div class="flex items-center justify-between mb-2">
        <div>
          <span style="font-size:13px;font-weight:600;color:var(--color-text)">Requests</span>
          <span style="font-size:12px;color:var(--color-text-muted);margin-left:8px">last {range}h</span>
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
        <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:180px;color:var(--color-text-muted);font-size:13px">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="margin-bottom:8px;opacity:0.3">
            <path d="M3 3v18h18"/><path d="M7 16l4-8 4 4 4-8"/>
          </svg>
          No data yet
        </div>
      ) : (
        <div ref={containerRef} style="position:relative"
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
          <canvas ref={canvasRef} style="display:block;width:100%" />
          {tooltip && (
            <div style="position:absolute;pointer-events:none;left:50%;transform:translate(-50%,-110%);top:0;padding:6px 12px;border-radius:6px;background:var(--color-surface-hover);border:1px solid var(--color-border);font-size:12px;z-index:10;white-space:nowrap">
              <span style="color:var(--color-text-dim)">{formatRelativeTime(new Date(tooltip.bucket.time).toISOString())}</span>
              <span style="color:var(--color-text);margin-left:8px;font-weight:600">Requests: {tooltip.bucket.total}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
