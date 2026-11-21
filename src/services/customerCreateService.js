/**
 * src/services/customerCreateService.js
 *
 * Create a customer from the ERP — with the backend as it is today.
 *
 * The backend has no "create customer" endpoint, but it has two pieces that
 * together do the job the same way the rider app's phone signup does:
 *
 *   1. POST /admin/users  { role: 'USER', name, phone, email, password }
 *      creates the login account. A customer with no email gets the same
 *      generated address phone signup uses — phone_<10 digits>@placeholder.local
 *      — which the backend already recognises as "no real email" (it never
 *      mails it). The password is random and never shown: the customer signs
 *      in to the app with an SMS code to their mobile, which works for any
 *      USER account with that number.
 *
 *   2. The customer profile row (what the Customers list shows) is created by
 *      the backend the first time the account is used: their first booking,
 *      or saving an address. If an address is entered here it is saved, so
 *      the customer appears in the list straight away.
 *
 * Duplicates are checked first, by mobile number, so the same person is not
 * created twice.
 */
import { apiClient } from './apiClient';

/** 10-digit Indian mobile, the same rule the backend uses (sms.service indianMobile). */
export function indianMobile(raw) {
  const digits = String(raw || '').replace(/\D/g, '').slice(-10);
  return /^[6-9]\d{9}$/.test(digits) ? digits : null;
}

function randomPassword() {
  const bytes = new Uint8Array(18);
  (globalThis.crypto || window.crypto).getRandomValues(bytes);
  const body = Array.from(bytes, (b) => 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'[b % 56]).join('');
  return `${body}Aa9`; // satisfies the lower/upper/digit rule
}

const last10 = (p) => String(p || '').replace(/\D/g, '').slice(-10);

/** An existing customer (profile row) with this mobile, if any. */
export async function findCustomerByMobile(mobile) {
  const res = await apiClient.get('/admin/customers', { params: { search: mobile, limit: 10, page: 1 } });
  const rows = res?.data ?? res?.items ?? [];
  const hit = rows.find((c) => last10(c.user?.phone) === mobile);
  return hit ? { userId: hit.userId, name: hit.user?.name, phone: hit.user?.phone, email: hit.user?.email, existed: true } : null;
}

/** An existing USER account (even without a profile row yet) with this mobile's generated email. */
async function findUserByPlaceholder(mobile) {
  const res = await apiClient.get('/admin/users', { params: { search: `phone_${mobile}@`, role: 'USER', limit: 5 } });
  const rows = res?.data ?? res?.items ?? res?.users ?? [];
  const u = rows.find((x) => last10(x.phone) === mobile || String(x.email || '').startsWith(`phone_${mobile}@`));
  return u ? { userId: u.id, name: u.name, phone: u.phone, email: u.email, existed: true } : null;
}

/**
 * @param {{ name: string, phone: string, email?: string,
 *           address?: { line1, city, state, pincode, landmark? } }} input
 * @returns {Promise<{ userId, name, phone, email, existed: boolean }>}
 */
export async function createCustomer({ name, phone, email, address }) {
  const mobile = indianMobile(phone);
  if (!mobile) throw new Error('Enter a valid 10-digit mobile number');
  const cleanName = String(name || '').trim();
  if (cleanName.length < 2) throw new Error('Enter the customer’s name');

  const existing = await findCustomerByMobile(mobile);
  if (existing) return existing;

  const realEmail = String(email || '').trim().toLowerCase();
  const loginEmail = realEmail || `phone_${mobile}@placeholder.local`;

  let user;
  try {
    const res = await apiClient.post('/admin/users', {
      name: cleanName,
      email: loginEmail,
      phone: mobile,
      password: randomPassword(),
      role: 'USER',
      isActive: true,
    });
    user = res?.user || res;
  } catch (e) {
    if (e?.code === 'EMAIL_TAKEN' || e?.status === 409) {
      // Same number already signed up through the app (same generated email).
      if (!realEmail) {
        const found = await findUserByPlaceholder(mobile);
        if (found) return found;
      }
      throw new Error(realEmail
        ? 'Another account already uses this email. Leave email empty or use a different one.'
        : 'An account with this mobile number already exists. Search for it instead.');
    }
    if (e?.status === 403) throw new Error('Only an admin can add customers.');
    throw e;
  }

  if (address?.line1 && address?.city && address?.state && address?.pincode) {
    try {
      await apiClient.post(`/admin/customers/${user.id}/addresses`, {
        label: 'Home',
        line1: address.line1.trim(),
        landmark: address.landmark?.trim() || null,
        city: address.city.trim(),
        state: address.state.trim(),
        pincode: String(address.pincode).trim(),
        isDefault: true,
      });
    } catch { /* the account exists; the address can be added later */ }
  }

  return { userId: user.id, name: user.name || cleanName, phone: user.phone || mobile, email: realEmail || null, existed: false };
}
