import html2pdf from 'html2pdf.js';
import type { Proposal } from '@/types';
import { lastName } from '@/lib/format';

export function pdfFilename(proposal: Proposal): string {
  const last = lastName(proposal.customer.fullName) || 'Customer';
  return `${proposal.proposalNumber}-${last}.pdf`;
}

/** Render the given element (a customer-view proposal) to a downloaded PDF. */
export async function exportElementToPdf(element: HTMLElement, proposal: Proposal): Promise<void> {
  await html2pdf()
    .set({
      margin: [0.5, 0.5, 0.6, 0.5],
      filename: pdfFilename(proposal),
      image: { type: 'jpeg', quality: 0.96 },
      html2canvas: { scale: 2, useCORS: true, logging: false },
      jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' },
      pagebreak: {
        mode: ['css', 'legacy'],
        avoid: ['.proposal-card', '.acceptance-block', '.payment-block', '.grand-total-block'],
      },
    })
    .from(element)
    .save();
}
