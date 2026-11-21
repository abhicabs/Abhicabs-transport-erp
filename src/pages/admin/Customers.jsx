import { useState, useMemo, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Pencil, Phone, Mail, UserPlus, CalendarPlus } from 'lucide-react';
import PageHeader    from '../../components/ui/PageHeader';
import FilterBar     from '../../components/ui/FilterBar';
import DataTable     from '../../components/ui/DataTable';
import IconButton    from '../../components/ui/IconButton';
import Badge         from '../../components/ui/Badge';
import Input         from '../../components/ui/Input';
import CustomerFormDrawer from '../../components/customer/CustomerFormDrawer';
import NewCustomerDrawer from '../../components/customer/NewCustomerDrawer';
import Button from '../../components/ui/Button';
import { adminCustomersService, bookingService } from '../../services';
import { useToast }    from '../../hooks/useToast';
import { useDebounce } from '../../hooks/useDebounce';
import { formatDate, accountTypeLabel } from '../../utils/formatters';
import { PERMISSIONS } from '../../constants';
import { useAuth }   from '../../hooks/useAuth';
import { startOfDayDate, endOfDayDate } from '../../utils/dateRange';
import { getTierForPoints } from '../../lib/loyaltyTiers';

/**
 * Customers / Clients — "All users / Registered / Guest Users" filter.
 *
 * FRONTEND-ONLY: the backend has no "guest" field or filter, so the split is
 * done here. Customers are loaded in pages of 100 (the backend's max limit),
 * with search / account type / sort still applied server-side, then split
 * into Registered vs Guest and paginated locally. That keeps the counts
 * and pagination correct instead of filtering only the 10 rows on screen.
 *
 * A GUEST is a customer created without signing up, recognised by the
 * placeholder email the backend gives such accounts:
 *   - WhatsApp bot  → <digits>@whatsapp.invalid
 *   - phone-only    → phone_<number>@placeholder.local
 *   - legacy guest  → guest.<...>
 * Everyone with a real email is a logged-in (registered) user.
 */
const PAGE_FETCH_LIMIT = 100;   // backend cap for list endpoints
const MAX_PAGES        = 20;    // safety cap → up to 2,000 customers loaded

const SORT_OPTIONS = [
  { value: 'createdAt',     label: 'Joined date'    },
  { value: 'loyaltyPoints', label: 'Loyalty points' },
  { value: 'name',          label: 'Name'           },
];

// Generated addresses (app phone login, WhatsApp bot): the account is real, it just has no email.
function isPlaceholderEmail(email) {
  const e = (email || '').toLowerCase();
  return e.endsWith('@placeholder.local') || e.endsWith('@whatsapp.invalid');
}

function isGuestCustomer(r) {
  if (typeof r?.isGuest === 'boolean') return r.isGuest;
  const email = (r?.user?.email || '').toLowerCase();
  // Fallback only (the backend now sends isGuest). App phone-login and WhatsApp
  // customers have generated emails too, but they are real accounts, not guests.
  return email.endsWith('@guest.invalid')
    || email.startsWith('guest.')
    || email.startsWith('guest-');
}

export default function Customers() {
  const navigate  = useNavigate();
  const toast     = useToast();
  const [addOpen, setAddOpen] = useState(false);
  const bookFor = (c) => navigate(`/admin/bookings?new=1&customer=${c.userId}&cname=${encodeURIComponent(c.name || '')}&cphone=${encodeURIComponent(c.phone || '')}`);
  const handleCustomerAdded = (c, { bookNow, hadAddress } = {}) => {
    if (c.existed) toast.info(`${c.name} is already a customer`);
    else toast.success(`${c.name} added${hadAddress ? '' : '. They appear in this list after their first booking.'}`);
    if (bookNow) bookFor(c);
    else reload();
  };
  const { hasPermission } = useAuth();
  const canManage = hasPermission(PERMISSIONS.CLIENTS_MANAGE);

  // ── Server-side query params ──
  const [search, setSearch]           = useState('');
  const debouncedSearch               = useDebounce(search, 350);
  const [accountType, setAccountType] = useState('');
  const [sortBy, setSortBy]           = useState('createdAt');
  const [sortDir, setSortDir]         = useState('desc');

  // ── Loaded data ──
  const [allRows, setAllRows]   = useState([]);
  const [status, setStatus]     = useState('loading');
  const [error, setError]       = useState(null);
  const [truncated, setTruncated] = useState(false);
  const [reloadTick, setReloadTick] = useState(0);

  // ── Local UI state ──
  const [userType, setUserType] = useState(''); // '' | 'registered' | 'guest'
  const [page, setPage]         = useState(1);
  const [limit, setLimit]       = useState(10);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo]     = useState('');

  // The range applies as soon as a date is picked. "5 Sep to 1 Sep" can only mean 1 Sep to 5 Sep.
  const appliedRange = useMemo(() => {
    let f = dateFrom; let t = dateTo;
    if (f && t && f > t) [f, t] = [t, f];
    return { from: f, to: t };
  }, [dateFrom, dateTo]);
  const dateFiltering = !!(appliedRange.from || appliedRange.to);
  const [editing, setEditing]   = useState(null);

  const reload = useCallback(() => setReloadTick((t) => t + 1), []);

  const clearAllFilters = useCallback(() => {
    setSearch('');
    setUserType('');
    setAccountType('');
    setDateFrom('');
    setDateTo('');
    setSortBy('createdAt');
    setSortDir('desc');
  }, []);

  // Load every page (up to the cap) for the current server-side params.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setStatus('loading');
      setError(null);
      try {
        const collected = [];
        let totalPages = 1;
        let p = 1;
        do {
          const res = await adminCustomersService.list({
            page: p,
            limit: PAGE_FETCH_LIMIT,
            ...(debouncedSearch ? { search: debouncedSearch } : {}),
            ...(accountType ? { accountType } : {}),
            sortBy,
            order: sortDir,
          });
          const rows = res?.data ?? res?.items ?? [];
          collected.push(...rows);
          totalPages = res?.meta?.totalPages ?? res?.pagination?.totalPages ?? 1;
          p += 1;
        } while (p <= totalPages && p <= MAX_PAGES && !cancelled);
        if (cancelled) return;
        setAllRows(collected);
        setTruncated(totalPages > MAX_PAGES);
        setStatus('success');
      } catch (e) {
        if (cancelled) return;
        setError(e);
        setStatus('error');
      }
    })();
    return () => { cancelled = true; };
  }, [debouncedSearch, accountType, sortBy, sortDir, reloadTick]);

  // Any change to what's shown goes back to page 1.
  useEffect(() => { setPage(1); }, [userType, debouncedSearch, accountType, sortBy, sortDir, appliedRange, limit]);

  // ── Split + date filter ──
  const { registeredRows, guestRows } = useMemo(() => {
    const reg = [], guest = [];
    for (const r of allRows) (isGuestCustomer(r) ? guest : reg).push(r);
    return { registeredRows: reg, guestRows: guest };
  }, [allRows]);


  const tabRows = useMemo(() => {
    const base = userType === 'guest' ? guestRows
      : userType === 'registered' ? registeredRows
      : allRows;
    if (!dateFiltering) return base;
    // Whole days in the admin's timezone. `new Date('YYYY-MM-DD')` would start the
    // From day at 05:30 in India (midnight UTC) and drop the first hours of it.
    const from = startOfDayDate(appliedRange.from);
    const to   = endOfDayDate(appliedRange.to);
    return base.filter((r) => {
      const joined = r.createdAt ? new Date(r.createdAt) : null;
      if (!joined) return false;
      if (from && joined < from) return false;
      if (to && joined > to) return false;
      return true;
    });
  }, [userType, allRows, guestRows, registeredRows, dateFiltering, appliedRange]);

  const totalPages = Math.max(1, Math.ceil(tabRows.length / limit));
  const pageRows = useMemo(
    () => tabRows.slice((page - 1) * limit, page * limit),
    [tabRows, page, limit]
  );

  // ── Total Bookings column ──
  // The list endpoint doesn't return a booking count, so it's fetched per
  // VISIBLE row only (GET /admin/bookings?customerId=X&limit=1) and cached.
  const [bookingCounts, setBookingCounts] = useState({});
  // A website guest's real name/phone are on their bookings, not their account.
  // The newer backend sends them on the list; on the current one they're read
  // from the same one-row booking request used for the count below.
  const [guestInfo, setGuestInfo] = useState({});
  const visibleUserIds = pageRows.map((r) => r.userId).join(',');

  useEffect(() => {
    const toFetch = pageRows.filter((r) => r.userId && bookingCounts[r.userId] === undefined);
    if (toFetch.length === 0) return;
    setBookingCounts((prev) => {
      const next = { ...prev };
      for (const r of toFetch) next[r.userId] = 'loading';
      return next;
    });
    toFetch.forEach((r) => {
      bookingService.list({ customerId: r.userId, limit: 1 })
        .then((res) => {
          const total = res?.meta?.total ?? res?.pagination?.total ?? 0;
          setBookingCounts((prev) => ({ ...prev, [r.userId]: total }));
          const b = (res?.data ?? res?.items ?? [])[0];
          if (b && (b.guestName || b.guestPhone)) {
            setGuestInfo((prev) => ({ ...prev, [r.userId]: { name: b.guestName || null, phone: b.guestPhone || null, email: b.guestEmail || null } }));
          }
        })
        .catch(() => {
          setBookingCounts((prev) => ({ ...prev, [r.userId]: 'error' }));
        });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleUserIds]);

  const columns = [
    {
      key: 'name', header: 'Customer',
      render: (r) => {
        const guest = isGuestCustomer(r);
        // Always the person's own name. For a website guest it is the name they
        // typed at checkout (backend: displayName / guestName from their booking),
        // never the word "Guest". Guest-ness is shown in the User column instead.
        const accountName = r.user?.name && !/^guest$/i.test(r.user.name.trim()) ? r.user.name : null;
        const g = guestInfo[r.userId];
        const displayName = r.displayName || r.guestName || (guest && g?.name) || accountName || 'Name not given';
        const contactLine = guest
          ? (r.guestEmail || g?.email || 'No email given')
          : (isPlaceholderEmail(r.user?.email) ? 'No email (phone login)' : (r.user?.email || '—'));
        return (
          <div>
            <p style={{ fontWeight: 600, color: displayName === 'Name not given' ? '#9CA3AF' : '#1F2937' }} className="flex items-center gap-1.5">
              {displayName}
              {r.isLive && (
                <span
                  className="inline-flex items-center gap-1 text-[10.5px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wide"
                  style={{ backgroundColor: '#f0fdf4', color: '#22A65A' }}
                  title="Customer's app is open right now"
                >
                  <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: '#22A65A' }} />
                  Live
                </span>
              )}
            </p>
            <p style={{ fontSize: 13.5, color: '#6B7280' }} className="flex items-center gap-1">
              <Mail size={11} />
              {contactLine}
            </p>
          </div>
        );
      },
    },
    {
      key: 'phone', header: 'Phone',
      render: (r) => (
        <span className="flex items-center gap-1" style={{ fontSize: 13, color: '#6B7280' }}>
          <Phone size={12} />{r.displayPhone || r.user?.phone || r.guestPhone || guestInfo[r.userId]?.phone || '—'}
        </span>
      ),
    },
    {
      key: 'userType', header: 'User',
      render: (r) => (
        isGuestCustomer(r)
          ? <Badge tone="amber">Guest user</Badge>
          : <Badge tone="green">Registered</Badge>
      ),
    },
    {
      key: 'accountType', header: 'Type',
      render: (r) => (
        <Badge tone={r.accountType === 'CORPORATE' ? 'blue' : 'slate'}>
          {accountTypeLabel(r.accountType)}
        </Badge>
      ),
    },
    {
      key: 'loyaltyPoints', header: 'Loyalty', sortable: true,
      render: (r) => {
        const pts = r.loyaltyPoints ?? 0;
        const tier = getTierForPoints(pts);
        return (
          <div>
            <span style={{ fontWeight: 600, color: '#1F2937' }}>{pts} pts</span>
            {tier && (
              <span style={{
                display: 'inline-block', marginLeft: 6, padding: '2px 8px', borderRadius: 6,
                fontSize: 10.5, fontWeight: 800, color: '#fff',
                backgroundColor: tier.color || '#6B7280',
              }}>
                {tier.name}
              </span>
            )}
          </div>
        );
      },
    },
    {
      key: 'totalBookings', header: 'Total Bookings',
      render: (r) => {
        const count = bookingCounts[r.userId];
        if (count === undefined || count === 'loading') {
          return <span style={{ color: '#9CA3AF' }}>…</span>;
        }
        if (count === 'error') {
          return <span style={{ color: '#9CA3AF' }} title="Could not load">—</span>;
        }
        return <span style={{ fontWeight: 600, color: '#1F2937' }}>{count}</span>;
      },
    },
    {
      key: 'createdAt', header: 'Joined', sortable: true,
      render: (r) => formatDate(r.createdAt),
    },
    ...(canManage ? [{
      key: 'actions', header: '', className: 'text-right',
      render: (r) => (
        <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
          <IconButton icon={Pencil} label="Edit" onClick={() => setEditing(r)} />
        </div>
      ),
    }] : []),
  ];

  // Column-header sort. The dropdowns set sortBy / order directly (below),
  // falling back to the defaults when "Clear" empties them — the backend
  // rejects an empty sortBy/order with a 400.
  const handleSort = (key, dir) => {
    if (dir) {
      setSortBy(key || 'createdAt');
      setSortDir(dir);
    } else {
      setSortDir((prev) => (sortBy === key && prev === 'desc' ? 'asc' : 'desc'));
      setSortBy(key || 'createdAt');
    }
  };

  const handleUpdate = async (values) => {
    await adminCustomersService.update(editing.userId, values);
    toast.success('Customer updated');
    setEditing(null);
    reload();
  };


  return (
    <div>
      <PageHeader
        title="Customers"
        description="Registered (logged-in) users and guest users. Use the user filter to separate them."
        actions={<>
          <Button variant="secondary" icon={CalendarPlus} onClick={() => navigate('/admin/bookings?new=1')}>New booking</Button>
          <Button icon={UserPlus} onClick={() => setAddOpen(true)}>Add customer</Button>
        </>}
      />
      <NewCustomerDrawer open={addOpen} onClose={() => setAddOpen(false)} onCreated={handleCustomerAdded} />

      <FilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search name, email or phone…"
        onClear={clearAllFilters}
        extraActive={dateFiltering}
        filters={[
          {
            name: 'userType',
            value: userType,
            onChange: (v) => setUserType(v),
            placeholder: 'All users',
            options: [
              { value: 'registered', label: `Registered (Logged In)${status === 'success' ? ` · ${registeredRows.length}` : ''}` },
              { value: 'guest',      label: `Guest Users${status === 'success' ? ` · ${guestRows.length}` : ''}` },
            ],
          },
          {
            name: 'accountType',
            value: accountType,
            onChange: (v) => setAccountType(v),
            placeholder: 'All account types',
            options: [
              { value: 'RETAIL',    label: 'Personal'  },
              { value: 'CORPORATE', label: 'Corporate' },
            ],
          },
          {
            // Sorting orders the list; it does not narrow it, so it never counts as a filter.
            name: 'sortBy',
            ignoreActive: true,
            value: sortBy,
            onChange: (v) => setSortBy(v || 'createdAt'),
            placeholder: 'Sort by',
            options: SORT_OPTIONS,
          },
          {
            name: 'order',
            ignoreActive: true,
            value: sortDir,
            onChange: (v) => setSortDir(v || 'desc'),
            placeholder: 'Order',
            options: [
              { value: 'desc', label: 'Newest first' },
              { value: 'asc',  label: 'Oldest first' },
            ],
          },
        ]}
        extra={(
          <>
            <label className="flex items-center gap-2" style={{ fontSize: 12, fontWeight: 700, color: '#6B7280' }}>
              Joined from
              <Input type="date" value={dateFrom} max={dateTo || undefined} onChange={(e) => setDateFrom(e.target.value)} style={{ width: 160 }} />
            </label>
            <label className="flex items-center gap-2" style={{ fontSize: 12, fontWeight: 700, color: '#6B7280' }}>
              to
              <Input type="date" value={dateTo} min={dateFrom || undefined} onChange={(e) => setDateTo(e.target.value)} style={{ width: 160 }} />
            </label>
            {truncated && (
              <span className="text-xs text-gray-400">
                Showing the first {PAGE_FETCH_LIMIT * MAX_PAGES} customers for this search — narrow the search to see others.
              </span>
            )}
          </>
        )}
      />

      <DataTable
        columns={columns}
        rows={pageRows}
        rowKey="userId"
        status={status}
        error={error}
        onRetry={reload}
        sortBy={sortBy}
        sortDir={sortDir}
        onSort={handleSort}
        page={page}
        limit={limit}
        total={tabRows.length}
        totalPages={totalPages}
        onPageChange={setPage}
        onLimitChange={(n) => setLimit(Number(n) || 10)}
        onRowClick={(r) => navigate(`/admin/customers/${r.userId}`)}
        emptyTitle={
          dateFiltering
            ? 'No customers joined in this date range'
            : userType === 'guest' ? 'No guest users found'
            : userType === 'registered' ? 'No registered users found'
            : 'No customers found'
        }
        emptyDescription="Try adjusting your search or filters."
      />

      {editing && (
        <CustomerFormDrawer
          open={!!editing}
          customer={editing}
          onClose={() => setEditing(null)}
          onSubmit={handleUpdate}
        />
      )}
    </div>
  );
}
