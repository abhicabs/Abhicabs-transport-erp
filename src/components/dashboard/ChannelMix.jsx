/**
 * ChannelMix — where bookings came from, as a Recharts donut with the total in
 * the middle, plus a row per source with count, share and completed revenue.
 *
 * channels: [{ channel: 'WEBSITE'|'APP'|'WHATSAPP'|'ADMIN'|'OTHER', bookings, completed, revenue }]
 */
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from 'recharts';
import { tooltipBox } from './chartTheme';

const META = {
  WEBSITE:  { label: 'Website',     color: '#2563EB' },
  APP:      { label: 'App',         color: '#7C3AED' },
  WHATSAPP: { label: 'WhatsApp',    color: '#16A34A' },
  ADMIN:    { label: 'Admin / ERP', color: '#EA580C' },
  OTHER:    { label: 'Other',       color: '#9CA3AF' },
};
const ORDER = ['WEBSITE', 'APP', 'WHATSAPP', 'ADMIN', 'OTHER'];

export default function ChannelMix({ channels = [], formatMoney = (n) => `₹${n}` }) {
  const byKey = Object.fromEntries(channels.map((c) => [c.channel, c]));
  const rows = ORDER.map((k) => ({ key: k, ...META[k], ...(byKey[k] || { bookings: 0, revenue: 0 }) }))
    .filter((r) => r.key !== 'OTHER' || r.bookings > 0);
  const total = rows.reduce((s, r) => s + (r.bookings || 0), 0);

  if (!total) {
    return <p className="text-sm py-6" style={{ color: '#9CA3AF' }}>No bookings in the last 30 days yet.</p>;
  }
  const slices = rows.filter((r) => r.bookings);

  return (
    <div>
      <div style={{ position: 'relative', height: 170 }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={slices} dataKey="bookings" nameKey="label" innerRadius="64%" outerRadius="92%"
              paddingAngle={2} stroke="none" startAngle={90} endAngle={-270} animationDuration={500}>
              {slices.map((r) => <Cell key={r.key} fill={r.color} />)}
            </Pie>
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const r = payload[0].payload;
                return (
                  <div style={tooltipBox}>
                    <p style={{ fontWeight: 700 }}>{r.label}</p>
                    <p>{r.bookings} bookings ({Math.round((r.bookings / total) * 100)}%)</p>
                    <p style={{ color: '#6B7280' }}>{formatMoney(Number(r.revenue) || 0)} completed</p>
                  </div>
                );
              }}
            />
          </PieChart>
        </ResponsiveContainer>
        <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', pointerEvents: 'none', textAlign: 'center' }}>
          <div>
            <p style={{ fontSize: 24, fontWeight: 800, color: '#111', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{total}</p>
            <p style={{ fontSize: 12, color: '#6B7280', marginTop: 2 }}>bookings</p>
          </div>
        </div>
      </div>

      <div className="mt-3">
        {rows.map((r) => (
          <div key={r.key} className="flex items-center gap-3 py-2" style={{ borderTop: '1px solid #F3F4F6' }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: r.color, flexShrink: 0 }} />
            <span className="text-sm flex-1" style={{ color: '#111' }}>{r.label}</span>
            <span className="text-sm font-bold" style={{ color: '#111', fontVariantNumeric: 'tabular-nums', minWidth: 36, textAlign: 'right' }}>{r.bookings}</span>
            <span className="text-xs" style={{ color: '#6B7280', fontVariantNumeric: 'tabular-nums', minWidth: 36, textAlign: 'right' }}>{Math.round((r.bookings / total) * 100)}%</span>
            <span className="text-xs hidden sm:inline" style={{ color: '#6B7280', fontVariantNumeric: 'tabular-nums', minWidth: 80, textAlign: 'right' }}>
              {formatMoney(Number(r.revenue) || 0)}
            </span>
          </div>
        ))}
      </div>
      <p className="text-xs mt-1" style={{ color: '#9CA3AF' }}>
        Bookings made in the last 30 days.<span className="hidden sm:inline"> Amounts are completed trips.</span>
      </p>
    </div>
  );
}
