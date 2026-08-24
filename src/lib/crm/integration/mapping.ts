// The ONE source of truth for mapping between CRM contacts and the proposal
// builder's CustomerInfo — both directions live here and nowhere else.
import type { Contact, ContactSource } from '@/lib/crm/types';
import type { CustomerInfo } from '@/types';

/** Contact → the customer block a new proposal starts with. */
export function contactToCustomerInfo(contact: Contact): CustomerInfo {
  // CustomerInfo splits the address into street + city/state/zip; a CRM
  // address is one line. First comma splits street from the rest.
  const [street, ...rest] = contact.address.split(',');
  return {
    fullName: contact.name,
    streetAddress: (street ?? '').trim(),
    cityStateZip: rest.join(',').trim(),
    phone: contact.phone,
    email: contact.email,
  };
}

/** Proposal's customer block → a new CRM contact ("Create from proposal"). */
export function customerInfoToContact(
  customer: CustomerInfo
): { name: string; email: string; phone: string; address: string; source: ContactSource } {
  return {
    name: customer.fullName.trim() || 'Unnamed customer',
    email: customer.email.trim(),
    phone: customer.phone.trim(),
    address: [customer.streetAddress.trim(), customer.cityStateZip.trim()]
      .filter(Boolean)
      .join(', '),
    source: 'other',
  };
}
