import LZString from 'lz-string';
import type { CompanySettings, CompanySnapshot, Proposal, SharePayload } from '@/types';

/** Data-URL logos beyond this size are omitted from share links to keep URLs practical. */
export const MAX_EMBEDDED_LOGO_CHARS = 80_000;

export function companySnapshot(settings: CompanySettings): CompanySnapshot {
  const { companyName, tagline, address, phone, email, logoUrl } = settings;
  const embedLogo =
    !logoUrl.startsWith('data:') || logoUrl.length <= MAX_EMBEDDED_LOGO_CHARS;
  return {
    companyName,
    tagline,
    address,
    phone,
    email,
    logoUrl: embedLogo ? logoUrl : undefined,
  };
}

export function encodeProposal(proposal: Proposal, settings: CompanySettings): string {
  const payload: SharePayload = { v: 1, p: proposal, c: companySnapshot(settings) };
  return LZString.compressToEncodedURIComponent(JSON.stringify(payload));
}

export function buildShareUrl(proposal: Proposal, settings: CompanySettings): string {
  return `${window.location.origin}/view#p=${encodeProposal(proposal, settings)}`;
}

export function decodeShareHash(hash: string): SharePayload | null {
  const match = hash.match(/[#&]p=([^&]+)/);
  if (!match) return null;
  try {
    const json = LZString.decompressFromEncodedURIComponent(match[1]);
    if (!json) return null;
    const payload = JSON.parse(json) as SharePayload;
    if (!payload || payload.v !== 1 || !payload.p || !Array.isArray(payload.p.cards)) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}
