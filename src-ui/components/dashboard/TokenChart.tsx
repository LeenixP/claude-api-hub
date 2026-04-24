import { useState, useEffect, useRef, useMemo, useCallback } from 'preact/hooks';
import type { LogEntry } from '../../types.js';
import { formatTokens } from '../../lib/utils.js';

interface TokenChartProps {
  logs: LogEntry[];
  rangeHours: number;
}

interface TokenBucket { time: number; input: number; output: number; }

export function TokenChart({ logs, rangeHours }: TokenChartProps) {
  const [range, setRange] = useState(rangeHours);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number>(0);
  const prevDataRef = useRef<{ logs: LogEntry[]; range: number } | null>(null);

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
    const h = 200;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);

    const pad = { top: 12, right: 12, bottom: 28, left: 42 };
    const cw = w - pad.left - pad.right;
    const ch = h - pad.top - pad.bottom;
    const maxVal = Math.max(1, ...buckets.map(b => b.input + b.output));

    ctx.clearRect(0, 0, w, h);

    const style = getComputedStyle(document.documentElement);
    const gridColor = style.getPropertyValue('--color-border').trim() || 'rgba(255,255,255,0.07)';
    const mutedColor = style.getPropertyValue('--color-text-muted').trim() || '#5c6370';
    const primaryColor = style.getPropertyValue('--color-primary').trim() || '#26a9c9';
    const successColor = style.getPropertyValue('--color-success').trim() || '#2da44e';

    // Grid
    ctx.strokeStyle = gridColor;
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = pad.top + (ch / 4) * i;
      ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(pad.left + cw, y); ctx.stroke();
      ctx.fillStyle = mutedColor;
      ctx.font = '10px -apple-system, sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(formatTokens(Math.round(maxVal * (1 - i / 4))), pad.left - 6, y + 3);
    }

    if (buckets.length === 0) return;

    const barW = Math.max(2, cw / buckets.length - 2);

    buckets.forEach((b, i) => {
      const x = pad.left + i * (barW + 2) + 1;
      const totalH = ((b.input + b.output) / maxVal) * ch;
      const inputH = (b.input / maxVal) * ch;

      if (inputH > 1) {
        ctx.fillStyle = primaryColor + '70';
        ctx.fillRect(x, pad.top + ch - totalH, barW, inputH);
      }
      if (totalH - inputH > 1) {
        ctx.fillStyle = successColor + '60';
        ctx.fillRect(x, pad.top + ch - totalH + inputH, barW, totalH - inputH);
      }
    });

    // X-axis
    ctx.fillStyle = mutedColor;
    ctx.font = '10px -apple-system, sans-serif';
    ctx.textAlign = 'center';
    const labelCount = range === 1 ? 4 : 6;
    for (let i = 0; i < labelCount; i++) {
      const idx = Math.floor((buckets.length - 1) * (i / (labelCount - 1)));
      const x = pad.left + idx * (barW + 2) + barW / 2;
      const d = new Date(buckets[idx].time);
      ctx.fillText(d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), x, h - 8);
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
          <span style="font-size:13px;font-weight:600;color:var(--color-text)">Tokens</span>
          <span style="font-size:12px;color:var(--color-text-muted);margin-left:8px">last {range}h</span>
        </div>
        <div style="display:flex;align-items:center;gap:12px;font-size:11px;color:var(--color-text-muted)">
          <span style="display:flex;align-items:center;gap:4px"><span style="width:8px;height:8px;border-radius:2px;background:var(--color-primary);opacity:0.7" /> Input</span>
          <span style="display:flex;align-items:center;gap:4px"><span style="width:8px;height:8px;border-radius:2px;background:var(--color-success);opacity:0.6" /> Output</span>
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
        <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:180px;color:var(--color-text-muted);font-size:13px">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="margin-bottom:8px;opacity:0.3">
            <rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/><path d="M9 21V9"/>
          </svg>
          No data yet
        </div>
      ) : (
        <div ref={containerRef}><canvas ref={canvasRef} style="display:block;width:100%" /></div>
      )}
    </div>
  );
}
