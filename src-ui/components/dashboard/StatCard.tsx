interface StatCardProps {
  icon: string;
  label: string;
  value: string | number;
  accent?: string;
}

export function StatCard({ icon, label, value, accent = 'var(--color-primary)' }: StatCardProps) {
  return (
    <div class="stat-card">
      <div class="stat-card-icon">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={accent} stroke-width="2" stroke-linecap="round" stroke-linejoin="round" dangerouslySetInnerHTML={{ __html: icon }} />
      </div>
      <div class="stat-card-value">{value}</div>
      <div class="stat-card-label">{label}</div>
    </div>
  );
}
