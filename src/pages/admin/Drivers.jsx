import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Star, PlusCircle, UserPlus, Phone, Mail, IdCard, CheckCircle, XCircle, Eye, FileText, Image, X, AlertTriangle } from 'lucide-react';
import PageHeader    from '../../components/ui/PageHeader';
import PageTabs from '../../components/ui/PageTabs';
import Card          from '../../components/ui/Card';
import Select        from '../../components/ui/Select';
import Button        from '../../components/ui/Button';
import DataTable     from '../../components/ui/DataTable';
import FilterBar     from '../../components/ui/FilterBar';
import Badge         from '../../components/ui/Badge';
import Alert         from '../../components/ui/Alert';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import DriverFormDrawer from '../../components/driver/DriverFormDrawer';
import TemporaryDriverModal from '../../components/driver/TemporaryDriverModal';
import AssignVehicleDrawer from '../../components/driver/AssignVehicleDrawer';
import DateRangeFilter from '../../components/ui/DateRangeFilter';
import { useApi }    from '../../hooks/useApi';
import { useResourceList } from '../../hooks/useResourceList';
import { useToast }  from '../../hooks/useToast';
import { reportsService, driverService, vehicleService } from '../../services';
import { apiClient } from '../../services/apiClient';
import { formatCurrency, formatDate, formatDateTime, titleCase } from '../../utils/formatters';

// Backend listDriversQuerySchema accepts:
//   search, status (online|offline), kycStatus, sortBy, order, page, limit
// ALL SERVER-SIDE.

const KYC_STATUSES = ['PENDING','VERIFIED','REJECTED','SUSPENDED'];
const SORT_OPTIONS = ['createdAt','ratingAvg','licenceExpiry','lastPingAt'];
const KYC_TONE    = { PENDING: 'amber', VERIFIED: 'green', REJECTED: 'red', SUSPENDED: 'slate' };

const DOC_LABELS = {
  LICENCE: 'Driving Licence', AADHAAR: 'Aadhaar Card', PHOTO: 'Driver Photo',
  RC: 'Vehicle RC', INSURANCE: 'Insurance', PUC: 'PUC Certificate',
};

// The three documents a driver must have uploaded before KYC can be
// approved — matches the mobile app's DocumentUploadScreen. Vehicle docs
// (RC/INSURANCE/PUC) are a separate, vehicle-linked concern, not gated here.
const REQUIRED_DRIVER_DOCS = ['LICENCE', 'AADHAAR', 'PHOTO'];

// ── Document Review Modal ───────────────────────────────────────────────────
function DocumentReviewModal({ driver, onClose, onApprove, onReject, actionLoading }) {
  const [selectedDoc, setSelectedDoc] = useState(null);

  // Escape closes the document viewer if one is open, otherwise the review
  // modal itself. Without this the viewer could only be dismissed by clicking
  // the backdrop — Escape is the first thing most people try on a lightbox.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      if (selectedDoc) setSelectedDoc(null);
      else onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedDoc, onClose]);

  const { data, status } = useApi(
    () => apiClient.get(`/admin/drivers/${driver.userId}`),
    [driver.userId]
  );
  const fullDriver = data?.driver || data;
  const documents  = fullDriver?.documents || {};
  const docEntries = Object.entries(documents);
  const missingRequired = REQUIRED_DRIVER_DOCS.filter((docType) => !documents[docType]?.url);
  const canApprove = status !== 'loading' && missingRequired.length === 0;

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onClick={onClose}>
      <div style={{ backgroundColor: '#fff', borderRadius: 16, width: '100%', maxWidth: 700, maxHeight: '90vh', overflow: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}
        onClick={(e) => e.stopPropagation()}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid #F3F4F6', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h2 style={{ fontWeight: 700, fontSize: 18, color: '#1F2937' }}>KYC Review — {driver.user?.name}</h2>
            <p style={{ fontSize: 13, color: '#6B7280', marginTop: 2 }}>{driver.user?.phone} · {driver.user?.email} · Licence: {driver.licenceNumber}</p>
          </div>
          <button onClick={onClose} style={{ padding: 6, borderRadius: 8, color: '#6B7280' }}><X size={20} /></button>
        </div>
        <div style={{ padding: '20px 24px' }}>
          {status === 'loading' && <p style={{ color: '#6B7280', textAlign: 'center', padding: 32 }}>Loading documents…</p>}
          {status !== 'loading' && docEntries.length === 0 && (
            <div style={{ textAlign: 'center', padding: 32 }}>
              <FileText size={40} style={{ color: '#D1D5DB', margin: '0 auto 12px' }} />
              <p style={{ fontWeight: 600, color: '#1F2937' }}>No documents uploaded</p>
            </div>
          )}
          {status !== 'loading' && docEntries.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12, marginBottom: 20 }}>
              {docEntries.map(([docType, doc]) => (
                <div key={docType} style={{ border: '1px solid #E5E7EB', borderRadius: 12, overflow: 'hidden', cursor: 'pointer' }} onClick={() => setSelectedDoc({ docType, doc })}>
                  <div style={{ height: 100, backgroundColor: '#F9FAFB', overflow: 'hidden' }}>
                    {doc.url
                      ? <img src={doc.url} alt={docType} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      : <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}><Image size={28} style={{ color: '#D1D5DB' }} /></div>
                    }
                  </div>
                  <div style={{ padding: '6px 10px' }}>
                    <p style={{ fontSize: 12.5, fontWeight: 600, color: '#1F2937' }}>{DOC_LABELS[docType] || titleCase(docType)}</p>
                    {doc.uploadedAt && <p style={{ fontSize: 11.5, color: '#9CA3AF' }}>{formatDateTime(doc.uploadedAt)}</p>}
                  </div>
                </div>
              ))}
            </div>
          )}
          {status !== 'loading' && missingRequired.length > 0 && (
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', backgroundColor: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 10, padding: '10px 14px', marginBottom: 16 }}>
              <AlertTriangle size={16} style={{ color: '#92400E', marginTop: 1, flexShrink: 0 }} />
              <p style={{ fontSize: 13, color: '#92400E' }}>
                Can't approve yet — missing {missingRequired.map((d) => DOC_LABELS[d] || titleCase(d)).join(', ')}.
              </p>
            </div>
          )}
          <div style={{ backgroundColor: '#F9FAFB', borderRadius: 10, padding: '12px 16px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {[['Full Name', driver.user?.name], ['Phone', driver.user?.phone], ['Email', driver.user?.email], ['Licence', driver.licenceNumber], ['Applied', formatDateTime(driver.createdAt)]].map(([label, value]) => (
                <div key={label}>
                  <p style={{ fontSize: 12.5, color: '#9CA3AF' }}>{label}</p>
                  <p style={{ fontSize: 13, fontWeight: 600, color: '#1F2937' }}>{value || '—'}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div style={{ padding: '16px 24px', borderTop: '1px solid #F3F4F6', display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="dangerOutline" icon={XCircle} loading={actionLoading === `reject-${driver.userId}`} onClick={() => onReject(driver)}>Reject</Button>
          <Button variant="primary" icon={CheckCircle} disabled={!canApprove} loading={actionLoading === `approve-${driver.userId}`} onClick={() => onApprove(driver)}>Approve Driver</Button>
        </div>
      </div>
      {selectedDoc && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 60, backgroundColor: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={() => setSelectedDoc(null)}>
          {/* Explicit close button. Backdrop-click alone was the only way out,
              which is undiscoverable — and it is actively risky here, because
              clicking the image itself does nothing while clicking 2px
              outside it dismisses the viewer. */}
          <button
            type="button"
            aria-label="Close document"
            onClick={(e) => { e.stopPropagation(); setSelectedDoc(null); }}
            style={{
              position: 'fixed', top: 20, right: 24, zIndex: 61,
              width: 40, height: 40, borderRadius: 999,
              border: '1px solid rgba(255,255,255,0.25)',
              backgroundColor: 'rgba(0,0,0,0.55)', color: '#fff',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <X size={20} />
          </button>
          {/* Stop clicks on the image//title from bubbling to the backdrop, so
              the viewer only closes deliberately. */}
          <div style={{ maxWidth: 800, width: '100%', textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
            <p style={{ color: '#fff', fontWeight: 600, marginBottom: 12 }}>{DOC_LABELS[selectedDoc.docType] || selectedDoc.docType}</p>
            <img src={selectedDoc.doc.url} alt={selectedDoc.docType} style={{ maxWidth: '100%', maxHeight: '75vh', borderRadius: 8, objectFit: 'contain' }} />
            <p style={{ color: '#9CA3AF', marginTop: 12, fontSize: 13.5 }}>Press Esc, or click outside the image, to close</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Roster tab ──────────────────────────────────────────────────────────────
function RosterTab() {
  const toast = useToast();
  const navigate = useNavigate();
  // Server-side filters: status (online|offline), kycStatus, search, sortBy, order
  const list  = useResourceList(driverService, {
    filterDefaults: { status: '', kycStatus: '' },
    sortBy: 'createdAt',
    sortDir: 'desc',
    limit: 10,
  });
  const [formOpen,      setFormOpen]      = useState(false);
  const [editing,       setEditing]       = useState(null);
  const [deleting,      setDeleting]      = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [tempFormOpen,  setTempFormOpen]  = useState(false);
  const [assigning,     setAssigning]     = useState(null); // driver row needing a vehicle

  // The backend's driver LIST returns only `assignedVehicleId` -- the vehicle
  // itself (registration number) is on the single-driver endpoint only. The page
  // read `assignedVehicle.registrationNumber`, which is never in the list, so
  // every driver showed "No vehicle assigned" even with a vehicle. Look the
  // registration up in the fleet instead (all pages; the API caps a page at 100, see vehicleService.listAll).
  const [fleetTick, setFleetTick] = useState(0);
  const fleetApi = useApi(async () => {
    const byId = new Map();
    (await vehicleService.listAll()).forEach((v) => byId.set(v.id, v.registrationNumber));
    return byId;
  }, [fleetTick]);
  const fleetById = fleetApi.data || new Map();
  // A vehicle is assigned if the row says so by id OR carries the vehicle itself.
  const hasVehicle = (r) => Boolean(r.assignedVehicle?.registrationNumber || r.assignedVehicleId);
  // Registration number when we can resolve it ('' while the fleet loads, or if it is not in the fleet).
  const vehicleReg = (r) => r.assignedVehicle?.registrationNumber
    || (r.assignedVehicleId ? fleetById.get(r.assignedVehicleId) : '') || '';
  // Vehicles are created / changed by these handlers, so refresh the fleet with the list.
  const reloadAll = () => { list.reload(); setFleetTick((t) => t + 1); };

  const handleSubmit = async (values) => {
    if (editing) { await driverService.update(editing.userId, values); toast.success('Driver updated'); }
    else         { await driverService.create(values);                 toast.success('Driver onboarded'); }
    reloadAll();
  };

  const handleCreateTemporary = async (payload) => {
    await driverService.createTemporary(payload);
    toast.success(`Temporary driver ${payload.name} created${payload.vehicleNumber ? ` — vehicle ${payload.vehicleNumber}` : '. Assign a vehicle when ready.'}`);
    reloadAll();
  };

  const handleAssignVehicle = async (spec) => {
    await driverService.assignVehicle(assigning.userId, spec);
    toast.success('Vehicle assigned');
    reloadAll();
  };

  const handleDeactivate = async () => {
    setDeleteLoading(true);
    try {
      if (deleting.driverType === 'TEMPORARY') {
        await driverService.deleteTemporary(deleting.userId);
        toast.success('Temporary driver removed');
      } else {
        await apiClient.patch(`/admin/drivers/${deleting.userId}/deactivate`, {});
        toast.success('Driver deactivated');
      }
      reloadAll();
    } catch (e) { toast.error(e.message || 'Could not deactivate'); }
    finally { setDeleteLoading(false); setDeleting(null); }
  };

  const handleActivate = async (driver) => {
    try {
      await apiClient.patch(`/admin/drivers/${driver.userId}/activate`, {});
      toast.success(`${driver.user?.name || 'Driver'} activated`);
      reloadAll();
    } catch (e) { toast.error(e.message || 'Could not activate'); }
  };

  const columns = [
    {
      key: 'name', header: 'Driver',
      render: (r) => (
        <div>
          <p style={{ fontWeight: 600, color: '#3B65DB' }} className="hover:underline">{r.user?.name}</p>
          <p style={{ fontSize: 13.5, color: '#6B7280' }} className="flex items-center gap-1"><Phone size={11} />{r.user?.phone}</p>
        </div>
      ),
    },
    {
      key: 'email', header: 'Email',
      render: (r) => r.user?.email ? (
        <span className="flex items-center gap-1" title={r.user.email} style={{ color: '#6B7280', fontSize: 13, maxWidth: 200 }}>
          <Mail size={12} style={{ flexShrink: 0 }} />
          <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.user.email}</span>
        </span>
      ) : <span style={{ color: '#9CA3AF' }}>—</span>,
    },
    {
      key: 'type', header: 'Type',
      render: (r) => r.driverType === 'TEMPORARY'
        ? <Badge tone="purple">Temporary</Badge>
        : <span style={{ color: '#9CA3AF', fontSize: 13 }}>Regular</span>,
    },
    {
      key: 'licenceNumber', header: 'Licence / Vehicle',
      render: (r) => r.driverType === 'TEMPORARY'
        ? (vehicleReg(r)
            ? <span style={{ color: '#1F2937', fontSize: 13 }}>{vehicleReg(r)}</span>
            : hasVehicle(r)
              ? <span style={{ color: '#6B7280', fontSize: 12.5 }}>Vehicle assigned</span>
              : <span style={{ color: '#D97706', fontSize: 12.5, fontWeight: 600 }}>No vehicle yet</span>)
        : (
          <div>
            <p className="flex items-center gap-1 font-mono" style={{ color: '#1F2937', fontSize: 13 }}><IdCard size={12} />{r.licenceNumber}</p>
            {/* A vehicle is optional at registration, so a regular driver can
                legitimately have none — surface that here so ops can assign
                one rather than wondering why the driver can't go online. */}
            {vehicleReg(r)
              ? <p style={{ color: '#6B7280', fontSize: 12.5 }}>{vehicleReg(r)}</p>
              : hasVehicle(r)
                // Assigned, but its number is not resolved (fleet still loading, or not in the loaded fleet).
                ? <p style={{ color: '#6B7280', fontSize: 12.5 }}>Vehicle assigned</p>
                : <p style={{ color: '#D97706', fontSize: 12.5, fontWeight: 600 }}>No vehicle assigned</p>}
          </div>
        ),
    },
    { key: 'kycStatus', header: 'KYC', render: (r) => <Badge tone={KYC_TONE[r.kycStatus] || 'slate'}>{titleCase(r.kycStatus)}</Badge> },
    {
      key: 'isOnline', header: 'Status',
      render: (r) => (
        <div className="flex flex-col gap-1 items-start">
          <span className="flex items-center gap-1.5 text-xs font-semibold" style={{ color: r.isOnline ? '#38B763' : '#9CA3AF' }}>
            <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: r.isOnline ? '#38B763' : '#D1D5DB' }} />
            {r.isOnline ? 'Online' : 'Offline'}
          </span>
          {r.user?.isActive === false && <Badge tone="red">Deactivated</Badge>}
        </div>
      ),
    },
    { key: 'rating', header: 'Rating', render: (r) => r.ratingCount > 0 ? <span style={{ color: '#1F2937' }}>★ {Number(r.ratingAvg ?? 0).toFixed(1)} <span style={{ color: '#9CA3AF' }}>({r.ratingCount})</span></span> : <span style={{ color: '#9CA3AF' }}>—</span> },
    {
      // Header + left alignment so the three slots line up under "Actions".
      // Each slot has a FIXED width: the labels differ ("Change" vs "Assign
      // Vehicle", "Activate" vs "Deactivate"), and right-aligned buttons of
      // different widths pushed Edit / Deactivate to a different x on every row.
      key: 'actions', header: 'Actions',
      render: (r) => (
        // stopPropagation: clicks on these buttons must not also open the driver page.
        <div style={{ display: 'grid', gridTemplateColumns: '128px 60px 96px', gap: 8, alignItems: 'center' }} onClick={(e) => e.stopPropagation()}>
          {/* A vehicle is optional at registration for EVERY driver type, so
              admin can assign one directly to whoever doesn't have one yet. */}
          {hasVehicle(r)
            ? <Button size="sm" variant="secondary" block onClick={() => setAssigning(r)}>Change Vehicle</Button>
            : <Button size="sm" variant="primary" block onClick={() => setAssigning(r)}>Assign Vehicle</Button>}
          {/* Temp drivers skip the full onboarding form entirely — nothing there applies (no phone/licence).
              The empty div keeps their Remove button in the same column as everyone else's. */}
          {r.driverType !== 'TEMPORARY'
            ? <Button size="sm" variant="secondary" block onClick={() => { setEditing(r); setFormOpen(true); }}>Edit</Button>
            : <div />}
          {r.driverType !== 'TEMPORARY' && r.user?.isActive === false ? (
            <Button size="sm" variant="primary" block onClick={() => handleActivate(r)}>Activate</Button>
          ) : (
            <Button size="sm" variant="dangerOutline" block onClick={() => setDeleting(r)}>
              {r.driverType === 'TEMPORARY' ? 'Remove' : 'Deactivate'}
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div>
      <div className="flex justify-end gap-2 mb-3">
        <Button variant="secondary" icon={UserPlus} onClick={() => setTempFormOpen(true)}>Add Temporary Driver</Button>
        <Button icon={PlusCircle} onClick={() => { setEditing(null); setFormOpen(true); }}>Add Driver</Button>
      </div>
      <FilterBar
        search={list.search} onSearchChange={list.onSearchChange}
        searchPlaceholder="Search name, phone or licence…"
        filters={[
          { name: 'status', value: list.filters.status, onChange: (v) => list.setFilter('status', v), placeholder: 'All availability', options: [{ value: 'online', label: '🟢 Online' }, { value: 'offline', label: '⚪ Offline' }] },
          { name: 'kycStatus', value: list.filters.kycStatus, onChange: (v) => list.setFilter('kycStatus', v), placeholder: 'All KYC statuses', options: KYC_STATUSES.map((s) => ({ value: s, label: titleCase(s) })) },
          { name: 'sortBy', value: list.sortBy, onChange: (v) => list.onSort(v, list.sortDir), placeholder: 'Sort by', options: SORT_OPTIONS.map((s) => ({ value: s, label: titleCase(s.replace(/([A-Z])/g, ' $1')) })) },
        ]}
      />
      <DataTable columns={columns} rows={list.rows} rowKey="userId" status={list.status} error={list.error} onRetry={list.refetch}
        onRowClick={(r) => navigate(`/admin/drivers/${r.userId}`)}
        sortBy={list.sortBy} sortDir={list.sortDir} onSort={list.onSort}
        page={list.page} limit={list.meta?.limit} total={list.meta?.total} totalPages={list.meta?.totalPages} onPageChange={list.setPage}
        onLimitChange={list.setLimit}
        emptyTitle="No drivers found" emptyDescription="Try adjusting your filters." />
      <DriverFormDrawer open={formOpen} onClose={() => setFormOpen(false)} initial={editing} onSubmit={handleSubmit} />
      <TemporaryDriverModal open={tempFormOpen} onClose={() => setTempFormOpen(false)} onSubmit={handleCreateTemporary} />
      <AssignVehicleDrawer open={!!assigning} onClose={() => setAssigning(null)} onSubmit={handleAssignVehicle} driver={assigning} />
      <ConfirmDialog open={!!deleting} title={deleting?.driverType === 'TEMPORARY' ? 'Remove temporary driver?' : 'Deactivate this driver?'} description={deleting ? (deleting.driverType === 'TEMPORARY' ? `${deleting.user?.name || deleting.user?.email} will be permanently removed.` : `${deleting.user?.name} will be deactivated and forced offline.`) : ''} confirmLabel={deleting?.driverType === 'TEMPORARY' ? 'Remove' : 'Deactivate'} danger loading={deleteLoading} onClose={() => setDeleting(null)} onConfirm={handleDeactivate} />
    </div>
  );
}

// ── KYC tab ──────────────────────────────────────────────────────────────────
function KycTab() {
  const toast = useToast();
  const [actionLoading, setActionLoading] = useState(null);
  const [reviewDriver,  setReviewDriver]  = useState(null);
  const [rejectDialog,  setRejectDialog]  = useState(null);

  const { data, status, error, refetch } = useApi(
    // submitted:true — kycStatus is PENDING from account creation onward, so
    // without this the queue lists every abandoned half-finished signup
    // alongside real applications. Only drivers who completed every step and
    // pressed Submit have documents.__meta.submittedAt set.
    () => apiClient.get('/admin/drivers', { params: { kycStatus: 'PENDING', submitted: true, limit: 50, page: 1 } }),
    []
  );
  const applications = data?.data ?? data?.items ?? [];

  async function approve(driver) {
    setActionLoading(`approve-${driver.userId}`);
    try {
      await apiClient.patch(`/admin/drivers/${driver.userId}`, { kycStatus: 'VERIFIED' });
      toast.success(`${driver.user?.name} approved`);
      setReviewDriver(null); refetch();
    } catch (e) { toast.error(e.message || 'Could not approve'); }
    finally { setActionLoading(null); }
  }

  async function reject(driver) {
    setActionLoading(`reject-${driver.userId}`);
    try {
      await apiClient.patch(`/admin/drivers/${driver.userId}`, { kycStatus: 'REJECTED' });
      toast.success(`${driver.user?.name} rejected`);
      setRejectDialog(null); setReviewDriver(null); refetch();
    } catch (e) { toast.error(e.message || 'Could not reject'); }
    finally { setActionLoading(null); }
  }

  const columns = [
    { key: 'name', header: 'Applicant', render: (r) => (<div><p style={{ fontWeight: 600, color: '#1F2937' }}>{r.user?.name}</p><p style={{ fontSize: 13.5, color: '#6B7280' }} className="flex items-center gap-1"><Phone size={11} />{r.user?.phone}</p>{r.user?.email && <p style={{ fontSize: 13.5, color: '#6B7280' }} className="flex items-center gap-1"><Mail size={11} />{r.user.email}</p>}</div>) },
    { key: 'licenceNumber', header: 'Licence', render: (r) => (<div><p className="font-mono" style={{ color: '#1F2937', fontSize: 13 }}>{r.licenceNumber}</p>{r.licenceExpiry && <p style={{ color: '#6B7280', fontSize: 12.5 }}>Expires {formatDate(r.licenceExpiry)}</p>}</div>) },
    // submittedAt is when the driver COMPLETED onboarding and pressed Submit —
    // the moment the application actually became reviewable. createdAt is just
    // when the account was made, which can be days earlier, so it is shown as
    // a secondary line rather than as "Applied".
    { key: 'appliedAt', header: 'Submitted', render: (r) => (
      <div>
        <p style={{ color: '#1F2937', fontSize: 13, whiteSpace: 'nowrap' }}>
          {r.submittedAt ? formatDateTime(r.submittedAt) : '—'}
        </p>
        <p style={{ color: '#9CA3AF', fontSize: 12 }}>
          Registered {formatDate(r.createdAt)}
        </p>
      </div>
    ) },
    { key: 'actions', header: '', className: 'text-right', render: (r) => (<div className="flex gap-2 justify-end"><Button size="sm" variant="secondary" icon={Eye} onClick={() => setReviewDriver(r)}>Review</Button><Button size="sm" variant="dangerOutline" icon={XCircle} disabled={!!actionLoading} onClick={() => setRejectDialog(r)}>Reject</Button></div>) },
  ];

  return (
    <div>
      {applications.length > 0 && <Alert type="warning" className="mb-4">{applications.length} application{applications.length > 1 ? 's' : ''} waiting for KYC review. Click "Review" to view documents before approving.</Alert>}
      <DataTable columns={columns} rows={applications} rowKey="userId" status={status} error={error} onRetry={refetch} emptyTitle="No pending applications" emptyDescription="All applications have been reviewed." />
      {reviewDriver && <DocumentReviewModal driver={reviewDriver} onClose={() => setReviewDriver(null)} onApprove={approve} onReject={(d) => setRejectDialog(d)} actionLoading={actionLoading} />}
      <ConfirmDialog open={!!rejectDialog} title="Reject this application?" description={rejectDialog ? `${rejectDialog.user?.name}'s application will be rejected.` : ''} confirmLabel="Reject Application" danger loading={actionLoading === `reject-${rejectDialog?.userId}`} onClose={() => setRejectDialog(null)} onConfirm={() => reject(rejectDialog)} />
    </div>
  );
}

// ── Performance tab ──────────────────────────────────────────────────────────
function PerformanceTab() {
  const navigate = useNavigate();
  const [customRange, setCustomRange] = useState(null); // { from, to } | null
  const [sortBy,  setSortBy]  = useState('completedTrips');
  const [minRate, setMinRate] = useState('');

  // Defaults to last 30 days until the driver picks something else via
  // DateRangeFilter (Today / 7d / 30d / This Month / Custom).
  const range = useMemo(() => {
    if (customRange) return customRange;
    const to = new Date(); const from = new Date(Date.now() - 30 * 86400000);
    return { from: from.toISOString(), to: to.toISOString() };
  }, [customRange]);

  const { data, status, error, refetch } = useApi(() => reportsService.driverPerformance(range), [customRange]);
  const allDrivers = data?.drivers || [];

  const filtered = useMemo(() => {
    let rows = [...allDrivers];
    if (minRate) rows = rows.filter((d) => Number(d.acceptanceRate) * 100 >= Number(minRate));
    rows.sort((a, b) => {
      if (sortBy === 'completedTrips') return Number(b.completedTrips) - Number(a.completedTrips);
      if (sortBy === 'earnings')       return Number(b.earnings) - Number(a.earnings);
      if (sortBy === 'rating')         return Number(b.ratingAvg) - Number(a.ratingAvg);
      return 0;
    });
    return rows;
  }, [allDrivers, sortBy, minRate]);

  const columns = [
    { key: 'name', header: 'Driver', render: (r) => <p style={{ color: '#1F2937', fontWeight: 600 }}>{r.name}</p> },
    { key: 'rating', header: 'Rating', render: (r) => <span className="flex items-center gap-1"><Star size={13} style={{ color: '#F59E0B', fill: '#F59E0B' }} />{Number(r.ratingAvg ?? 0).toFixed(2)} <span style={{ color: '#9CA3AF', fontSize: 13.5 }}>({r.ratingCount ?? 0})</span></span> },
    { key: 'offers', header: 'Offers', render: (r) => <span>{r.offersReceived ?? r.offers ?? 0}</span> },
    { key: 'acceptance', header: 'Acceptance', render: (r) => { const rate = Math.round(Number(r.acceptanceRate ?? 0) * 100); return <Badge tone={rate >= 80 ? 'green' : rate >= 50 ? 'amber' : 'red'}>{rate}%</Badge>; } },
    { key: 'completedTrips', header: 'Completed', render: (r) => <Badge tone="primary">{r.completedTrips ?? 0}</Badge> },
    { key: 'earnings', header: 'Earnings', render: (r) => <span style={{ fontWeight: 600, color: '#1F2937' }}>{formatCurrency(r.earnings ?? 0)}</span> },
  ];

  return (
    <div>
      <div className="flex gap-2 justify-end mb-3 flex-wrap items-center">
        <DateRangeFilter label="Last 30 Days" onChange={setCustomRange} />
        <Select value={sortBy} onChange={(e) => setSortBy(e.target.value)}
          options={[{ value:'completedTrips',label:'Sort: Trips' },{ value:'earnings',label:'Sort: Earnings' },{ value:'rating',label:'Sort: Rating' }]} />
        <Select value={minRate} onChange={(e) => setMinRate(e.target.value)}
          placeholder="Min acceptance"
          options={['50','70','80','90'].map((v) => ({ value: v, label: `≥ ${v}% acceptance` }))} />
      </div>
      <Alert type="info" className="mb-4">Activity-based data. Drivers with no trips in this period won't appear.</Alert>
      <DataTable columns={columns} rows={filtered} status={status} error={error} onRetry={refetch}
        onRowClick={(r) => r.driverId && navigate(`/admin/drivers/${r.driverId}`)} emptyTitle="No driver activity" emptyDescription="No trips in this period. Try a wider date range." />
    </div>
  );
}

// ── Main ─────────────────────────────────────────────────────────────────────
export default function Drivers() {
  const [tab, setTab] = useState('roster');
  const { data: pendingData } = useApi(() => apiClient.get('/admin/drivers', { params: { kycStatus: 'PENDING', submitted: true, limit: 1, page: 1 } }), []);
  const pendingCount = pendingData?.meta?.total ?? pendingData?.pagination?.total ?? 0;

  const tabs = [
    { key: 'roster',      label: 'Roster' },
    { key: 'kyc',         label: 'KYC Applications', badge: pendingCount },
    { key: 'performance', label: 'Performance' },
  ];

  return (
    <div>
      <PageHeader title="Drivers" description="Manage your driver roster, review KYC applications, and track performance." />
      <PageTabs tabs={tabs} value={tab} onChange={setTab} />
      {tab === 'roster'      && <RosterTab />}
      {tab === 'kyc'         && <KycTab />}
      {tab === 'performance' && <PerformanceTab />}
    </div>
  );
}
