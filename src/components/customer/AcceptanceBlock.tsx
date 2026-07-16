function SignatureColumn({ role }: { role: string }) {
  return (
    <div className="flex-1 min-w-[260px]">
      <div className="signature-line" />
      <div className="mt-1 text-xs font-semibold uppercase tracking-wide text-brand-steel">
        {role}
      </div>
      <div className="mt-5 flex items-end gap-2 text-sm">
        <span className="whitespace-nowrap text-brand-steel">Printed Name:</span>
        <span className="flex-1 border-b border-brand-black" style={{ height: '1.25rem' }} />
      </div>
      <div className="mt-4 flex items-end gap-2 text-sm">
        <span className="whitespace-nowrap text-brand-steel">Date:</span>
        <span className="flex-1 border-b border-brand-black" style={{ height: '1.25rem' }} />
      </div>
    </div>
  );
}

/**
 * Fixed legal-acceptance section rendered at the bottom of every proposal.
 * Not a library card — cannot be toggled, removed, or reordered.
 * v1 workflow is print-and-sign; no digital signature capture by design.
 */
export function AcceptanceBlock() {
  return (
    <section className="acceptance-block mt-8">
      <div className="section-banner">Acceptance</div>
      <div className="border border-t-0 border-brand-gray-light bg-white p-5">
        <p className="text-sm leading-relaxed">
          By signing below, the Owner accepts this proposal and authorizes Post-Frame
          Construction Solutions, LLC to proceed to the contract phase of the project.
        </p>
        <div className="mt-10 flex flex-col gap-10 sm:flex-row sm:gap-8 print:gap-8">
          <SignatureColumn role="Owner Signature" />
          <SignatureColumn role="PFCS Authorized Representative" />
        </div>
      </div>
    </section>
  );
}
