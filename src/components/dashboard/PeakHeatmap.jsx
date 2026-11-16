/**
 * PeakHeatmap — pickups by weekday (rows) and hour (columns), India time, as a
 * Recharts scatter chart drawn with square cells. Darker = more trips.
 *
 * cells: [{ dow: 0-6 (0 = Sunday), hour: 0-23, bookings }]
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { ResponsiveContainer, ScatterChart, Scatter, XAxis, YAxis, Tooltip } from 'recharts';
import { axisTick, tooltipBox } from './chartTheme';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DOW_OF = [1, 2, 3, 4, 5, 6, 0]; // row index → Postgres day-of-week
const SCALE = ['#F4F4F1', '#FFF3C4', '#FFE38A', '#FFD24D', '#FFC107', '#E6A100', '#8A6200'];
const HEIGHT = 7 * 30 + 40;

const hourLabel = (h) => `${h % 12 === 0 ? 12 : h % 12}${h < 12 ? 'am' : 'pm'}`;

const MARGIN = { top: 4, right: 6, bottom: 4, left: 0 };
const Y_AXIS_W = 40;
const X_AXIS_H = 30; // Recharts' default top axis height

/** A rounded tile filling its hour × day slot; Recharts gives the slot centre (cx, cy). */
function Tile({ cx, cy, payload, cellW, cellH }) {
  return <rect x={cx - cellW / 2} y={cy - cellH / 2} width={cellW} height={cellH} rx={4} fill={payload.fill} />;
}

export default function PeakHeatmap({ cells = [] }) {
  // Tile size follows the chart's real width, so the grid has no gaps at any size.
  const boxRef = useRef(null);
  const [width, setWidth] = useState(800);
  useEffect(() => {
    const el = boxRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const cellW = Math.max(8, (width - MARGIN.left - MARGIN.right - Y_AXIS_W) / 24 - 3);
  const cellH = (HEIGHT - MARGIN.top - MARGIN.bottom - X_AXIS_H) / 7 - 4;

  const { data, max, busiest } = useMemo(() => {
    const map = new Map(cells.map((c) => [`${c.dow}:${c.hour}`, c.bookings]));
    const m = Math.max(0, ...cells.map((c) => c.bookings));
    const shade = (v) => (!v ? SCALE[0] : SCALE[Math.min(SCALE.length - 1, 1 + Math.floor((v / m) * (SCALE.length - 1.0001)))]);
    const all = [];
    DAYS.forEach((day, row) => {
      for (let hour = 0; hour < 24; hour += 1) {
        const v = map.get(`${DOW_OF[row]}:${hour}`) || 0;
        all.push({ hour, row, day, bookings: v, fill: shade(v) });
      }
    });
    const top = [...all].sort((a, b) => b.bookings - a.bookings).slice(0, 3);
    return { data: all, max: m, busiest: top };
  }, [cells]);

  if (!max) return <p className="text-sm py-6" style={{ color: '#9CA3AF' }}>Not enough trips yet to show busy times.</p>;

  return (
    <div>
      <p className="sm:hidden text-xs mb-2" style={{ color: '#9CA3AF' }}>Swipe sideways to see all hours.</p>
      <div className="overflow-x-auto">
        <div ref={boxRef} style={{ minWidth: 640 }} role="img" aria-label={`Busiest: ${busiest.map((b) => `${b.day} ${hourLabel(b.hour)}`).join(', ')}`}>
          <ResponsiveContainer width="100%" height={HEIGHT}>
            <ScatterChart margin={MARGIN}>
              <XAxis type="number" dataKey="hour" domain={[-0.5, 23.5]} ticks={[0, 3, 6, 9, 12, 15, 18, 21]}
                tickFormatter={hourLabel} tick={axisTick} tickLine={false} axisLine={false} orientation="top" height={X_AXIS_H} />
              <YAxis type="number" dataKey="row" domain={[-0.5, 6.5]} ticks={[0, 1, 2, 3, 4, 5, 6]} reversed
                tickFormatter={(r) => DAYS[r]} tick={axisTick} tickLine={false} axisLine={false} width={Y_AXIS_W} />
              <Tooltip
                cursor={false}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const p = payload[0].payload;
                  return (
                    <div style={tooltipBox}>
                      <p style={{ fontWeight: 700 }}>{p.day} {hourLabel(p.hour)}–{hourLabel((p.hour + 1) % 24)}</p>
                      <p>{p.bookings} pickup{p.bookings === 1 ? '' : 's'}</p>
                    </div>
                  );
                }}
              />
              <Scatter data={data} shape={(props) => <Tile {...props} cellW={cellW} cellH={cellH} />} isAnimationActive={false} />
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 flex-wrap mt-2" style={{ fontSize: 12.5 }}>
        <span style={{ color: '#374151' }}>
          Busiest: {busiest.map((b, i) => <strong key={i}>{i ? ', ' : ''}{b.day} {hourLabel(b.hour)}</strong>)}
        </span>
        <span className="inline-flex items-center gap-1.5" style={{ color: '#6B7280' }}>
          Fewer {SCALE.map((c) => <span key={c} style={{ width: 14, height: 10, borderRadius: 2, backgroundColor: c }} />)} More
        </span>
      </div>
    </div>
  );
}
