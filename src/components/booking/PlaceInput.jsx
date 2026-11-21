/**
 * PlaceInput — address box with suggestions from the backend's maps provider
 * (GET /fares/autocomplete, the same one the rider app uses). Typing freely is
 * still allowed: the backend geocodes whatever address text is sent.
 */
import { useEffect, useRef, useState } from 'react';
import { MapPin } from 'lucide-react';
import { apiClient } from '../../services/apiClient';

export default function PlaceInput({ value, onChange, placeholder, invalid }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [active, setActive] = useState(-1);
  const typedRef = useRef(false);
  const boxRef = useRef(null);

  useEffect(() => {
    if (!typedRef.current) return undefined;
    const q = (value || '').trim();
    if (q.length < 3) { setItems([]); return undefined; }
    const t = setTimeout(async () => {
      try {
        const res = await apiClient.get('/fares/autocomplete', { params: { q } });
        setItems(res?.suggestions || []);
        setOpen(true);
        setActive(-1);
      } catch { setItems([]); }
    }, 300);
    return () => clearTimeout(t);
  }, [value]);

  useEffect(() => {
    const onDoc = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const pick = (s) => { typedRef.current = false; onChange(s.description); setOpen(false); setItems([]); };

  return (
    <div ref={boxRef} style={{ position: 'relative' }}>
      <div className="flex items-center gap-2 rounded-lg border px-3"
        style={{ borderColor: invalid ? '#DC2626' : '#E5E7EB', backgroundColor: '#fff', height: 40 }}>
        <MapPin size={15} style={{ color: '#9CA3AF', flexShrink: 0 }} aria-hidden="true" />
        <input
          value={value}
          onChange={(e) => { typedRef.current = true; onChange(e.target.value); }}
          onFocus={() => items.length && setOpen(true)}
          onKeyDown={(e) => {
            if (!open || !items.length) return;
            if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(items.length - 1, a + 1)); }
            if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
            if (e.key === 'Enter' && active >= 0) { e.preventDefault(); pick(items[active]); }
            if (e.key === 'Escape') setOpen(false);
          }}
          placeholder={placeholder}
          className="flex-1 outline-none text-sm"
          style={{ background: 'transparent', minWidth: 0 }}
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
        />
      </div>
      {open && items.length > 0 && (
        <ul role="listbox" className="absolute left-0 right-0 mt-1 rounded-lg border bg-white overflow-hidden"
          style={{ zIndex: 30, borderColor: '#E5E7EB', boxShadow: '0 8px 24px rgba(17,17,17,0.12)' }}>
          {items.map((s, i) => (
            <li key={s.placeId || s.description} role="option" aria-selected={i === active}>
              <button type="button" onMouseDown={(e) => { e.preventDefault(); pick(s); }}
                className="w-full text-left px-3 py-2 text-sm"
                style={{ backgroundColor: i === active ? '#FFF8E1' : '#fff', color: '#111' }}>
                {s.description}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
