import { useState, useEffect, useRef, useMemo, useCallback } from 'preact/hooks';
import type { LogEntry } from '../../types.js';

interface TokenChartProps {
  logs: LogEntry[];
  rangeHours: number;
}

interface TokenBucket {
  time: number;
  input: number;
  output: number;
}

export function TokenChart({ logs, rangeHours }: TokenChartProps) {
  const [range, setRange] = useState(rangeHours);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; bucket: TokenBucket } | null>(null);

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

    const padding = { top: 20, right: 16, bottom: 32, left: 48 };
    const chartW = w - padding.left - padding.right;
    const chartH = h - padding.top - padding.bottom;

    const maxVal = Math.max(1, ...buckets.map(b => b.input + b.output));

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
      const label = Math.round(maxVal * (1 - i / 4));
      ctx.fillStyle = 'var(--color-text-muted)';
      ctx.font = '11px sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(label >= 1000 ? (label / 1000).toFixed(1) + 'K' : String(label), padding.left - 6, y + 3);
    }

    if (buckets.length === 0) return;

    const barW = (chartW / buckets.length) * 0.7;
    const gap = (chartW / buckets.length) * 0.3;

    buckets.forEach((b, i) => {
      const x = padding.left + i * (barW + gap) + gap / 2;
      const inputH = (b.input / maxVal) * chartH;
      const outputH = (b.output / maxVal) * chartH;

      // Input tokens (cyan)
      ctx.fillStyle = 'rgba(42,162,193,0.7)';
      ctx.fillRect(x, padding.top + chartH - inputH, barW / 2, inputH);

      // Output tokens (violet)
      ctx.fillStyle = 'rgba(139,92,246,0.7)';
      ctx.fillRect(x + barW / 2, padding.top + chartH - outputH, barW / 2, outputH);
    });

    // X-axis labels
    ctx.fillStyle = 'var(--color-text-muted)';
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'center';
    const labelCount = range === 1 ? 4 : range === 6 ? 6 : 8;
    for (let i = 0; i < labelCount; i++) {
      const idx = Math.floor((buckets.length - 1) * (i / (labelCount - 1)));
      const b = buckets[idx];
      const x = padding.left + idx * (barW + gap) + gap / 2 + barW / 2;
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
    const padding = { top: 20, right: 16, bottom: 32, left: 48 };
    const chartW = rect.width - padding.left - padding.right;
    const barW = (chartW / buckets.length) * 0.7;
    const gap = (chartW / buckets.length) * 0.3;
    const idx = Math.floor((x - padding.left - gap / 2) / (barW + gap));
    if (idx >= 0 && idx < buckets.length) {
      setTooltip({ x: e.clientX - rect.left, y: e.clientY - rect.top, bucket: buckets[idx] });
    } else {
      setTooltip(null);
    }
  }, [buckets]);

  const handleMouseLeave = useCallback(() => setTooltip(null), []);

  return (
    <div class="card overflow-hidden">
      <div class="flex items-center justify-between mb-4">
        <div class="flex items-center gap-3">
          <h3 class="text-sm font-semibold" style="color:var(--color-text)">Token Usage</h3>
          <div class="flex items-center gap-3">
            <span class="flex items-center gap-1 text-xs" style="color:var(--color-text-dim)">
              <span class="inline-block w-2 h-2 rounded-full" style="background:var(--color-primary)" />
              Input
            </span>
            <span class="flex items-center gap-1 text-xs" style="color:var(--color-text-dim)">
              <span class="inline-block w-2 h-2 rounded-full" style="background:#8B5CF6" />
              Output
            </span>
          </div>
        </div>
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
              <span style="color:var(--color-primary)">Input: {tooltip.bucket.input.toLocaleString()}</span>
              <span style="color:#8B5CF6">Output: {tooltip.bucket.output.toLocaleString()}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
