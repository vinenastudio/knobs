import { t } from '../i18n';

export function StatCard({
  change,
  label,
  value,
}: {
  change: number;
  label: string;
  value: string;
}) {
  return (
    <section className="card stat">
      <small>{label}</small>
      <strong>{value}</strong>
      <em>
        +{change}% {t.fromLastWeek}
      </em>
      <div className="bar">
        <span style={{ animationDelay: `${-change / 10}s` }} />
      </div>
    </section>
  );
}
