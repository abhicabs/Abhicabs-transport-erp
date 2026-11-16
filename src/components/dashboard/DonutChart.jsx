/**
 * DonutChart — Recharts donut with a legend. Same props as before:
 *   data: [{ label, value }], size (px)
 * Used on the Dashboard ("Fleet right now") and on Reports.
 */
import { PieChart, Pie, Cell, Tooltip } from 'recharts';
import { tooltipBox } from './chartTheme';

const PALETTE = ['#FFC107', '#111111', '#22A65A', '#7C3AED', '#DC2626', '#9A9A9A'];

export default function DonutChart({ data, size = 160 }) {
  const total = data.reduce((s, d) => s + (Number(d.value) || 0), 0);
  return (
    <div className="flex items-center gap-5 flex-wrap">
      <div style={{ position: 'relative', width: size, height: size }}>
        <PieChart width={size} height={size}>
          <Pie data={data} dataKey="value" nameKey="label" innerRadius={size * 0.32} outerRadius={size * 0.48}
            paddingAngle={data.length > 1 ? 2 : 0} stroke="none" startAngle={90} endAngle={-270} animationDuration={500}>
            {data.map((d, i) => <Cell key={d.label} fill={PALETTE[i % PALETTE.length]} />)}
          </Pie>
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const d = payload[0].payload;
              return (
                <div style={tooltipBox}>
                  <p style={{ fontWeight: 700 }}>{d.label}</p>
                  <p>{d.value} ({total ? Math.round((d.value / total) * 100) : 0}%)</p>
                </div>
              );
            }}
          />
        </PieChart>
        <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', pointerEvents: 'none', textAlign: 'center' }}>
          <div>
            <p style={{ fontSize: 22, fontWeight: 800, color: '#111', lineHeight: 1 }}>{total}</p>
            <p style={{ fontSize: 11.5, color: '#6B7280', marginTop: 2 }}>total</p>
          </div>
        </div>
      </div>
      <ul className="space-y-2 text-[12.5px]">
        {data.map((d, i) => (
          <li key={d.label} className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: PALETTE[i % PALETTE.length] }} />
            <span className="font-semibold" style={{ color: '#111111' }}>{d.label}</span>
            <span className="font-medium" style={{ color: '#9A9A9A' }}>({d.value})</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
