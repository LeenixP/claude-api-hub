import { useRef, useEffect, useCallback } from 'preact/hooks';
import type { RefObject } from 'preact';

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

interface UseCanvasChartOptions {
  /** Called after grid/skeleton drawing. Receives context, dimensions, data, eased progress, and prev/current raw data arrays. */
  drawContent: (ctx: CanvasRenderingContext2D, w: number, h: number, data: unknown[], progress: number, prev: unknown[], current: unknown[]) => void;
}

export function useCanvasChart(
  data: unknown[],
  options: UseCanvasChartOptions,
) {
  const { drawContent } = options;
  const canvasRef: RefObject<HTMLCanvasElement | null> = useRef(null);
  const containerRef: RefObject<HTMLDivElement | null> = useRef(null);
  const rafRef = useRef(0);
  const animRafRef = useRef(0);
  const animProgressRef = useRef(1);
  const skeletonPhaseRef = useRef(0);
  const prevDataRef = useRef<unknown[]>([]);
  const currentDataRef = useRef<unknown[]>([]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = container.getBoundingClientRect();
    const w = rect.width;
    const h = Math.max(200, rect.height);
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);

    const pad = { top: 12, right: 12, bottom: 28, left: 36 };
    const cw = w - pad.left - pad.right;
    const ch = h - pad.top - pad.bottom;

    const style = getComputedStyle(document.documentElement);
    const gridColor = style.getPropertyValue('--color-border').trim() || 'rgba(255,255,255,0.07)';
    const mutedColor = style.getPropertyValue('--color-text-muted').trim() || '#5c6370';

    // Grid
    ctx.strokeStyle = gridColor;
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = pad.top + (ch / 4) * i;
      ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(pad.left + cw, y); ctx.stroke();
      ctx.fillStyle = mutedColor;
      ctx.font = '10px -apple-system, sans-serif';
      ctx.textAlign = 'right';
    }

    if (data.length === 0) {
      const phase = skeletonPhaseRef.current;
      const grad = ctx.createLinearGradient(pad.left, 0, pad.left + cw, 0);
      grad.addColorStop(0, gridColor + '40');
      grad.addColorStop(Math.max(0, phase - 0.3), gridColor + '80');
      grad.addColorStop(phase, gridColor + '40');
      grad.addColorStop(1, gridColor + '40');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.roundRect(pad.left, pad.top + ch * 0.2, cw, ch * 0.6, 4);
      ctx.fill();
      return;
    }

    const progress = easeOutCubic(animProgressRef.current);
    drawContent(ctx, w, h, data, progress, prevDataRef.current, currentDataRef.current);
  }, [data, drawContent]);

  // Animation loop
  const animate = useCallback(() => {
    if (animProgressRef.current < 1) {
      animProgressRef.current = Math.min(1, animProgressRef.current + 0.016);
      draw();
      animRafRef.current = requestAnimationFrame(animate);
    } else {
      animRafRef.current = 0;
    }
  }, [draw]);

  // Skeleton animation loop
  const animateSkeleton = useCallback(() => {
    if (data.length === 0) {
      skeletonPhaseRef.current = (skeletonPhaseRef.current + 0.008) % 1.3;
      draw();
      animRafRef.current = requestAnimationFrame(animateSkeleton);
    }
  }, [draw, data.length]);

  // Trigger animation when data changes
  useEffect(() => {
    const curr = [...data];
    currentDataRef.current = curr;
    const prev = prevDataRef.current;
    if (prev.length > 0 && prev.length === curr.length) {
      animProgressRef.current = 0;
    } else {
      prevDataRef.current = [...curr];
      animProgressRef.current = 1;
    }

    if (animRafRef.current) cancelAnimationFrame(animRafRef.current);
    if (data.length === 0) {
      animRafRef.current = requestAnimationFrame(animateSkeleton);
    } else {
      animRafRef.current = requestAnimationFrame(animate);
    }

    return () => {
      if (animRafRef.current) cancelAnimationFrame(animRafRef.current);
    };
  }, [data, animate, animateSkeleton]);

  // Finish animation and set prev = current
  useEffect(() => {
    if (animProgressRef.current >= 1) {
      prevDataRef.current = [...currentDataRef.current];
    }
  });

  // MutationObserver for theme changes
  useEffect(() => {
    const observer = new MutationObserver(() => {
      draw();
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });
    return () => observer.disconnect();
  }, [draw]);

  // ResizeObserver for container resize
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(() => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => { draw(); rafRef.current = 0; });
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [draw]);

  // Tooltip edge-correction helper
  const adjustTooltipEdge = useCallback((el: HTMLDivElement | null, tooltipX: number) => {
    if (el && containerRef.current) {
      const containerRect = containerRef.current.getBoundingClientRect();
      const elWidth = el.offsetWidth;
      let left = tooltipX;
      if (left - elWidth / 2 < 4) left = elWidth / 2 + 4;
      if (left + elWidth / 2 > containerRect.width - 4) left = containerRect.width - elWidth / 2 - 4;
      el.style.left = left + 'px';
    }
  }, []);

  return {
    canvasRef,
    containerRef,
    adjustTooltipEdge,
    animProgressRef,
    draw,
  };
}

export { easeOutCubic };
