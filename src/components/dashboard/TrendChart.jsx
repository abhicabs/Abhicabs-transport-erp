/**
 * TrendChart — this period vs the previous period, built on Recharts.
 *
 * data:   [{ label, value, prev }]   (prev optional)
 * type:   'bar' | 'line'
 * format: (n) => string              (axis + tooltip)
 */
import {
  ResponsiveContainer, ComposedChart, Bar, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';
import { C, axisTick, tooltipBox } from './chartTheme';

function TrendTooltip({ active, payload, label, format, valueName, prevName }) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  const change = row.prev ? Math.round(((row.value - row.prev) / row.prev) * 100) : null;
  return (
    <div style={tooltipBox}>
      <p style={{ fontWeight: 700, marginBottom: 4 }}>{label}</p>
      <p>{valueName}: <strong>{format(row.value || 0)}</strong></p>
      {row.prev != null && <p style={{ color: C.muted }}>{prevName}: {format(row.prev || 0)}</p>}
      {change != null && (
        <p style={{ fontWeight: 700, color: change >= 0 ? '#15803D' : '#B91C1C', marginTop: 2 }}>
          {change >= 0 ? '▲' : '▼'} {Math.abs(change)}%
        </p>
      )}
    </div>
  );
}

/** Round gridlines: a 1/2/5 × 10^k step giving about 4 lines. */
function niceTicks(top) {
  const raw = Math.max(1, top) / 4;
  const exp = Math.pow(10, Math.floor(Math.log10(raw)));
  const f = raw / exp;
  const step = Math.max(1, (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * exp);
  const max = step * Math.max(1, Math.ceil(top / step));
  return { max, ticks: Array.from({ length: Math.round(max / step) + 1 }, (_, i) => i * step) };
}

export default function TrendChart({
  data, type = 'bar', format = (n) => String(n), valueName = 'This period', prevName = 'Previous period', height = 290,
}) {
  const hasPrev = data.some((d) => d.prev != null);
  const { max, ticks } = niceTicks(Math.max(0, ...data.map((d) => Math.max(d.value || 0, d.prev || 0))));
  return (
    <div role="img" aria-label={`${valueName}: ${data.map((d) => `${d.label} ${format(d.value)}`).join(', ')}`}>
      <ResponsiveContainer width="100%" height={height}>
        <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barGap={-18} barCategoryGap="28%">
          <CartesianGrid vertical={false} stroke={C.grid} />
          <XAxis dataKey="label" tick={axisTick} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={10} />
          <YAxis tick={axisTick} tickLine={false} axisLine={false} width={56} domain={[0, max]} ticks={ticks} tickFormatter={format} />
          <Tooltip
            cursor={type === 'bar' ? { fill: 'rgba(17,17,17,0.04)' } : { stroke: C.ink, strokeOpacity: 0.15 }}
            content={<TrendTooltip format={format} valueName={valueName} prevName={prevName} />}
          />
          <Legend
            verticalAlign="bottom" height={28} iconSize={10}
            wrapperStyle={{ fontSize: 12.5, color: '#4B5563' }}
            formatter={(v) => <span style={{ color: '#4B5563' }}>{v}</span>}
          />
          {type === 'bar' ? (
            <>
              {hasPrev && <Bar dataKey="prev" name={prevName} fill={C.prev} radius={[5, 5, 0, 0]} maxBarSize={40} isAnimationActive={false} />}
              <Bar dataKey="value" name={valueName} fill={C.brand} radius={[5, 5, 0, 0]} maxBarSize={30}
                activeBar={{ fill: C.brandDark }} animationDuration={500} />
            </>
          ) : (
            <>
              <Area dataKey="value" name={valueName} type="monotone" stroke={C.ink} strokeWidth={2.5}
                fill={C.brand} fillOpacity={0.16} dot={{ r: 3, fill: C.ink, strokeWidth: 0 }}
                activeDot={{ r: 5, fill: C.brand, stroke: C.ink, strokeWidth: 1.5 }} animationDuration={500} />
              {hasPrev && <Line dataKey="prev" name={prevName} type="monotone" stroke={C.prevLine} strokeWidth={2}
                strokeDasharray="5 5" dot={false} activeDot={false} isAnimationActive={false} />}
            </>
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
