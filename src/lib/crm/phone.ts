// Phone normalization, US-first (the business is in Ohio). Stored as E.164
// (+13305550141), displayed as (330) 555-0141. No dependency needed at this
// scale — a real libphonenumber can slot in later if international shows up.

/** Normalize to E.164. Returns null when the input can't be a real phone. */
export function normalizePhone(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const digits = trimmed.replace(/\D/g, '');
  if (trimmed.startsWith('+')) {
    return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null;
  }
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return null;
}

/** True when the stored value dials something real. */
export function isValidPhone(stored: string): boolean {
  return normalizePhone(stored) !== null;
}

/** +13305550141 → (330) 555-0141; anything else returns as typed. */
export function formatPhone(stored: string): string {
  const e164 = normalizePhone(stored);
  if (!e164) return stored;
  const m = e164.match(/^\+1(\d{3})(\d{3})(\d{4})$/);
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : e164;
}
