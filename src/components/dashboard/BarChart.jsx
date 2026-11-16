/**
 * BarChart — simple Recharts bar chart (brand yellow, busiest bar highlighted).
 * Same props as before: data, labelKey = 'label', valueKey = 'value', height = 180.
 * Used on Reports.
 */
import { ResponsiveContainer, BarChart as RBarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { C, axisTick, tooltipBox } from './chartTheme';

export default function BarChart({ data, labelKey = 'label', valueKey = 'value', height = 180 }) {
  const max = Math.max(0, ...data.map((d) => Number(d[valueKey]) || 0));
  return (
    <ResponsiveContainer width="100%" height={height}>
      <RBarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid vertical={false} stroke={C.grid} />
        <XAxis dataKey={labelKey} tick={axisTick} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={8} />
        <YAxis tick={axisTick} tickLine={false} axisLine={false} width={40} allowDecimals={false} />
        <Tooltip cursor={{ fill: 'rgba(17,17,17,0.04)' }}
          content={({ active, payload, label }) => (active && payload?.length ? (
            <div style={tooltipBox}><p style={{ fontWeight: 700 }}>{label}</p><p>{payload[0].value}</p></div>
          ) : null)} />
        <Bar dataKey={valueKey} radius={[5, 5, 0, 0]} maxBarSize={36} animationDuration={500}>
          {data.map((d, i) => <Cell key={i} fill={Number(d[valueKey]) === max ? C.brand : '#FFE082'} />)}
        </Bar>
      </RBarChart>
    </ResponsiveContainer>
  );
}
