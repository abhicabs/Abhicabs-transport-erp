/**
 * Shared look for every Recharts chart in the ERP, so all charts match the
 * ABHI CABS brand (yellow #FFC107 on ink #111) and one change restyles them all.
 */
export const C = {
  brand: '#FFC107',
  brandDark: '#E6AC00',
  ink: '#111111',
  grid: '#EEEEEA',
  prev: '#E2E2DC',
  prevLine: '#B0B0A8',
  axis: '#8A8A85',
  muted: '#6B7280',
};

export const axisTick = { fontSize: 12, fill: C.axis };

/** Card-style tooltip box used by every chart. */
export const tooltipBox = {
  backgroundColor: '#FFFFFF',
  border: '1px solid #E8E8E4',
  borderRadius: 10,
  padding: '8px 12px',
  boxShadow: '0 6px 20px rgba(17,17,17,0.10)',
  fontSize: 12.5,
  color: C.ink,
};
