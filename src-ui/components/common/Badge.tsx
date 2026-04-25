import type { ComponentChildren } from 'preact';
import { useLocale } from '../../lib/i18n.js';

interface BadgeProps {
  variant: 'on' | 'off' | 'anthropic' | 'openai' | 'oauth' | 'warning';
  children?: ComponentChildren;
}

const variantStyles: Record<BadgeProps['variant'], { bg: string; color: string; border: string; labelKey?: string }> = {
  on: { bg: 'rgba(48,164,108,0.15)', color: 'var(--color-success)', border: 'rgba(48,164,108,0.3)', labelKey: 'common.on' },
  off: { bg: 'rgba(95,99,104,0.15)', color: 'var(--color-text-muted)', border: 'rgba(95,99,104,0.2)', labelKey: 'common.off' },
  anthropic: { bg: 'rgba(42,162,193,0.12)', color: 'var(--color-primary)', border: 'rgba(42,162,193,0.25)', labelKey: 'common.anthropic' },
  openai: { bg: 'rgba(16,163,127,0.12)', color: '#10A37F', border: 'rgba(16,163,127,0.25)', labelKey: 'common.openai' },
  oauth: { bg: 'rgba(139,92,246,0.12)', color: '#8B5CF6', border: 'rgba(139,92,246,0.25)', labelKey: 'common.oauth' },
  warning: { bg: 'rgba(245,124,0,0.12)', color: 'var(--color-warning)', border: 'rgba(245,124,0,0.25)', labelKey: 'common.warning' },
};

export function Badge({ variant, children }: BadgeProps) {
  const { t } = useLocale();
  const s = variantStyles[variant];
  const label = s.labelKey ? t(s.labelKey) : undefined;
  return (
    <span style={`display:inline-flex;align-items:center;padding:4px 12px;border-radius:9999px;font-size:12px;font-weight:600;white-space:nowrap;background:${s.bg};color:${s.color};border:1px solid ${s.border}`}>
      {children ?? label}
    </span>
  );
}
