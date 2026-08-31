// One duplicate rule for every path that can create a contact (new-proposal
// flow, New contact, Link to CRM, the lead form, the inbound API). Matching
// mirrors /api/inbound-lead: normalized email first, then the last 10 phone
// digits. A name-only hit is a WARNING, never a block — two different John
// Millers in Wayne County is an ordinary Tuesday.
import type { Contact } from '@/lib/crm/types';

export type DuplicateBasis = 'email' | 'phone' | 'name';

export interface DuplicateMatch {
  contact: Contact;
  on: DuplicateBasis;
  /** email/phone are the same person; name alone might not be */
  strong: boolean;
}

const digits = (v: string) => v.replace(/\D/g, '');
const norm = (v: string) => v.trim().toLowerCase();

export function findDuplicateContact(
  contacts: Contact[],
  candidate: { name?: string; email?: string; phone?: string },
  excludeId?: string
): DuplicateMatch | null {
  const email = norm(candidate.email ?? '');
  const phone = digits(candidate.phone ?? '');
  const name = norm(candidate.name ?? '');
  const pool = contacts.filter((c) => c.id !== excludeId);

  if (email) {
    const hit = pool.find((c) => norm(c.email) === email);
    if (hit) return { contact: hit, on: 'email', strong: true };
  }
  if (phone.length >= 7) {
    const tail = phone.slice(-10);
    const hit = pool.find((c) => {
      const cd = digits(c.phone);
      const cd2 = digits(c.phone2 ?? '');
      return (
        (cd.length >= 7 && cd.slice(-10) === tail) ||
        (cd2.length >= 7 && cd2.slice(-10) === tail)
      );
    });
    if (hit) return { contact: hit, on: 'phone', strong: true };
  }
  if (name) {
    const hit = pool.find((c) => norm(c.name) === name);
    if (hit) return { contact: hit, on: 'name', strong: false };
  }
  return null;
}

export const duplicateReason = (m: DuplicateMatch): string =>
  m.on === 'email'
    ? 'same email address'
    : m.on === 'phone'
      ? 'same phone number'
      : 'same name';
