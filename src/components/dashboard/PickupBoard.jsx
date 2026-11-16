/**
 * PickupBoard — every pickup in the next 12 hours on one time track.
 *
 * Each trip sits at its pickup time and is coloured by how ready it is, so a
 * dispatcher sees at a glance which trips are covered and where the gaps are.
 * Trips close together stack into lanes instead of overlapping. On small
 * screens the track scrolls sideways; the time ruler and legend stay readable.
 */
import { useMemo } from 'react';

export const READINESS = {
  ready:       { label: 'Ready',            fg: '#14532D', bg: '#DCFCE7', bar: '#16A34A' },
  moving:      { label: 'On the road',      fg: '#1E3A8A', bg: '#DBEAFE', bar: '#2563EB' },
  nodriver:    { label: 'No driver',        fg: '#78350F', bg: '#FEF3C7', bar: '#D97706' },
  unassigned:  { label: 'No vehicle',       fg: '#7F1D1D', bg: '#FEE2E2', bar: '#DC2626' },
  confirm:     { label: 'Not confirmed',    fg: '#4C1D95', bg: '#EDE9FE', bar: '#7C3AED' },
};

/** How ready a booking from the staff list is (the list carries its current allocation). */
export function readinessOf(b) {
  if (b.status === 'PENDING') return 'confirm';
  if (['EN_ROUTE', 'REACHED', 'ONGOING', 'ARRIVED'].includes(b.status)) return 'moving';
  // CONFIRMED means no vehicle is held (a released allocation can still be the latest one listed).
  if (b.status === 'CONFIRMED') return 'unassigned';
  const alloc = b.allocations?.[0];
  if (!alloc || alloc.status === 'RELEASED') return 'unassigned';
  if (!alloc.driverId) return 'nodriver';
  return 'ready';
}

const HOUR_PX = 104;        // width of one hour on the track
const CHIP_PX = 132;        // width of a trip chip
const LANE_PX = 46;         // height of one lane
const HOURS = 13;           // 1 hour back + 12 ahead

function place(where) {
  if (!where) return '';
  const s = typeof where === 'string' ? where : (where.address || where.formattedAddress || '');
  return s.split(',')[0].trim();
}

export default function PickupBoard({ bookings, now = Date.now(), onOpen }) {
  const start = useMemo(() => {
    const d = new Date(now);
    d.setMinutes(0, 0, 0);
    return d.getTime() - 60 * 60 * 1000;
  }, [now]);
  const end = start + HOURS * 60 * 60 * 1000;
  const width = HOURS * HOUR_PX;
  const xOf = (t) => ((t - start) / (end - start)) * width;

  // Greedy lane packing: a trip goes in the first lane whose last chip has ended.
  const placed = useMemo(() => {
    const items = bookings
      .map((b) => ({ b, t: new Date(b.pickupAt).getTime() }))
      .filter(({ t }) => t >= start && t <= end)
      .sort((a, c) => a.t - c.t);
    const laneEnds = [];
    return items.map(({ b, t }) => {
      const x = Math.min(xOf(t), width - CHIP_PX);
      let lane = laneEnds.findIndex((endX) => endX + 6 <= x);
      if (lane === -1) { lane = laneEnds.length; laneEnds.push(0); }
      laneEnds[lane] = x + CHIP_PX;
      return { b, t, x, lane, state: readinessOf(b) };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookings, start, end]);

  const lanes = Math.max(1, ...placed.map((p) => p.lane + 1));
  const nowX = xOf(now);
  const hours = Array.from({ length: HOURS + 1 }, (_, i) => start + i * 60 * 60 * 1000);

  return (
    <div>
      <div className="overflow-x-auto" style={{ paddingBottom: 4 }}>
        <div style={{ position: 'relative', width, minWidth: '100%' }}>
          {/* Hour ruler */}
          <div style={{ position: 'relative', height: 22 }}>
            {hours.map((h, i) => (
              <span key={h} style={{
                position: 'absolute', left: i * HOUR_PX, transform: i === 0 ? 'none' : 'translateX(-50%)',
                fontSize: 12, color: '#6B7280', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap',
              }}>
                {new Date(h).toLocaleTimeString('en-IN', { hour: 'numeric', hour12: true })}
              </span>
            ))}
          </div>

          {/* Track */}
          <div style={{
            position: 'relative', height: lanes * LANE_PX + 12, borderRadius: 10,
            backgroundColor: '#F4F4F1',
            backgroundImage: `repeating-linear-gradient(to right, #E6E6E1 0 1px, transparent 1px ${HOUR_PX}px)`,
          }}>
            {/* Past hour, dimmed */}
            <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: Math.max(0, nowX), backgroundColor: 'rgba(17,17,17,0.04)', borderRadius: '10px 0 0 10px' }} />

            {placed.map(({ b, t, x, lane, state }) => {
              const r = READINESS[state];
              return (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => onOpen?.(b)}
                  title={`${b.bookingNumber || ''} ${place(b.pickupAddress)} → ${place(b.dropAddress)} (${r.label})`}
                  className="pickup-chip"
                  style={{
                    position: 'absolute', left: x, top: 6 + lane * LANE_PX, width: CHIP_PX - 4, height: LANE_PX - 8,
                    display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'flex-start',
                    padding: '0 8px 0 10px', borderRadius: 8, border: 'none', cursor: 'pointer', textAlign: 'left',
                    backgroundColor: r.bg, color: r.fg, boxShadow: `inset 3px 0 0 ${r.bar}`,
                  }}
                >
                  <span style={{ fontSize: 12.5, fontWeight: 700, fontVariantNumeric: 'tabular-nums', lineHeight: 1.2 }}>
                    {new Date(t).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true })}
                  </span>
                  <span style={{ fontSize: 11.5, lineHeight: 1.25, maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {place(b.pickupAddress) || b.bookingNumber}
                  </span>
                </button>
              );
            })}

            {/* Now */}
            <div aria-hidden="true" style={{ position: 'absolute', left: nowX, top: -6, bottom: -6, width: 2, backgroundColor: '#FFC107', borderRadius: 2 }} />
            <span style={{
              position: 'absolute', left: nowX, bottom: -24, transform: 'translateX(-50%)',
              fontSize: 11.5, fontWeight: 800, color: '#111', backgroundColor: '#FFC107', padding: '1px 6px', borderRadius: 6,
            }}>Now</span>
          </div>
          <div style={{ height: 26 }} />
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-x-4 gap-y-1.5" style={{ fontSize: 12.5, color: '#4B5563' }}>
        {Object.entries(READINESS).map(([k, r]) => (
          <span key={k} className="inline-flex items-center gap-1.5">
            <span style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: r.bar }} />{r.label}
          </span>
        ))}
      </div>
    </div>
  );
}
