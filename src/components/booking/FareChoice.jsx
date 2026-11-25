/**
 * FareChoice — how the fare is set when a booking moves to another vehicle class.
 *
 *   Re-quote  → the rate card prices the trip for the new class (default)
 *   Keep      → the customer keeps paying the current fare
 *   Custom    → staff type the fare
 *
 * Keep / Custom need FARE_EDIT (the backend enforces it too) and a reason,
 * which goes on the booking's audit entry and reprice history. Users without
 * FARE_EDIT just see a one-line note that the fare will be re-quoted.
 *
 * value: { fareMode, customFare, reason }   onChange(nextValue)
 * quotedFare: number, null (class has no rate card for this trip) or undefined (not known yet)
 */
import Input from '../ui/Input';
import { useAuth } from '../../hooks/useAuth';
import { PERMISSIONS } from '../../constants';
import { formatCurrency } from '../../utils/formatters';

export const DEFAULT_FARE_CHOICE = { fareMode: 'requote', customFare: '', reason: '' };

export default function FareChoice({ value = DEFAULT_FARE_CHOICE, onChange, currentFare, quotedFare, newClass }) {
  const { hasPermission } = useAuth();
  const canEditFare = hasPermission(PERMISSIONS.FARE_EDIT);
  const set = (patch) => onChange?.({ ...value, ...patch });
  const mode = canEditFare ? (value.fareMode || 'requote') : 'requote';

  if (!canEditFare) {
    return (
      <p className="text-xs" style={{ color: '#6B7280' }}>
        The fare will be re-quoted for {newClass || 'the new class'}
        {quotedFare != null ? <> — <strong>{formatCurrency(quotedFare)}</strong></> : ''}.
      </p>
    );
  }

  const modes = [
    { key: 'requote', label: 'Re-quote', sub: quotedFare != null ? formatCurrency(quotedFare) : 'rate card' },
    { key: 'keep', label: 'Keep fare', sub: currentFare != null ? formatCurrency(currentFare) : 'current' },
    { key: 'custom', label: 'Custom', sub: 'enter amount' },
  ];

  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold" style={{ color: '#374151' }}>Fare for {newClass || 'the new class'}</p>
      <div role="radiogroup" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
        {modes.map((m) => {
          const on = mode === m.key;
          return (
            <button
              key={m.key}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => set({ fareMode: m.key })}
              style={{
                textAlign: 'left', padding: '6px 10px', borderRadius: 8, cursor: 'pointer',
                border: `1px solid ${on ? '#3B65DB' : '#E5E7EB'}`,
                background: on ? '#EEF2FF' : '#fff',
              }}
            >
              <span style={{ display: 'block', fontSize: 12, fontWeight: 600, color: on ? '#3B65DB' : '#111827' }}>{m.label}</span>
              <span style={{ display: 'block', fontSize: 11, color: '#6B7280' }}>{m.sub}</span>
            </button>
          );
        })}
      </div>
      {mode === 'custom' && (
        <Input
          type="number"
          min="1"
          step="1"
          inputMode="decimal"
          placeholder="New fare (₹)"
          value={value.customFare ?? ''}
          onChange={(e) => set({ customFare: e.target.value })}
        />
      )}
      {mode !== 'requote' && (
        <Input
          placeholder="Reason (required) — e.g. free upgrade, agreed on call"
          value={value.reason ?? ''}
          onChange={(e) => set({ reason: e.target.value })}
          maxLength={500}
        />
      )}
      {mode === 'requote' && quotedFare === null && (
        <p className="text-xs" style={{ color: '#92400E' }}>
          If {newClass || 'this class'} has no rate card for this trip the re-quote will fail — keep the fare or enter one instead.
        </p>
      )}
    </div>
  );
}
