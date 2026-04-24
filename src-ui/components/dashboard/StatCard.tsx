interface StatCardProps {
  icon: string;
  label: string;
  value: string | number;
  accent?: string;
}

export function StatCard({ icon, label, value, accent = 'var(--color-primary)' }: StatCardProps) {
  return (
    <div class="card card-interactive relative overflow-hidden">
      <div class="absolute left-0 top-3 bottom-3 rounded-r" style={`width:4px;background:${accent}`} />
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;padding-left:12px">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={accent} stroke-width="2" stroke-linecap="round" stroke-linejoin="round" dangerouslySetInnerHTML={{ __html: icon }} />
        <span style="font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.04em;color:var(--color-text-muted)">
          {label}
        </span>
      </div>
      <div class="truncate" style="font-size:32px;font-weight:700;padding-left:12px;color:var(--color-text);line-height:1.2">
        {value}
      </div>
    </div>
  );
}
