import { t } from '../i18n';

const lines = [
  { color: 'var(--online)', points: '5,130 70,112 135,118 200,80 265,86 330,52 395,40' },
  { color: 'var(--store)', points: '5,120 70,124 135,96 200,102 265,70 330,76 395,58' },
];

export function SalesChart() {
  return (
    <section className="card chart">
      <h2>{t.chart}</h2>
      <div className="legend">
        <span style={{ color: 'var(--online)' }}>{t.online}</span>
        <span style={{ color: 'var(--store)' }}>{t.inStore}</span>
      </div>
      <svg aria-label={t.chart} role="img" viewBox="0 0 400 170">
        <g stroke="var(--line)" strokeWidth="1">
          {[20, 70, 120, 165].map((y) => (
            <line key={y} x1="0" x2="400" y1={y} y2={y} />
          ))}
        </g>
        {lines.map(({ color, points }) => (
          <polyline
            fill="none"
            key={color}
            points={points}
            stroke={color}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="3.5"
          />
        ))}
      </svg>
    </section>
  );
}
