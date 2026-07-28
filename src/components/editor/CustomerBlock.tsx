import type { Proposal } from '@/types';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useProposalStore } from '@/store/useProposalStore';

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      <Input value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

export function CustomerBlock({ proposal }: { proposal: Proposal }) {
  const updateProposal = useProposalStore((s) => s.updateProposal);
  const setCustomer = (patch: Partial<Proposal['customer']>) =>
    updateProposal(proposal.id, { customer: { ...proposal.customer, ...patch } });
  const setProject = (patch: Partial<Proposal['project']>) =>
    updateProposal(proposal.id, { project: { ...proposal.project, ...patch } });

  return (
    <div className="rounded-lg bg-white p-4 shadow-sm">
      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        <div className="space-y-3">
          <div className="section-banner -mx-1 rounded">Customer</div>
          <Field
            label="Full Name"
            value={proposal.customer.fullName}
            onChange={(v) => setCustomer({ fullName: v })}
          />
          <Field
            label="Street Address"
            value={proposal.customer.streetAddress}
            onChange={(v) => setCustomer({ streetAddress: v })}
          />
          <Field
            label="City, State ZIP"
            value={proposal.customer.cityStateZip}
            onChange={(v) => setCustomer({ cityStateZip: v })}
          />
          <Field
            label="Phone"
            value={proposal.customer.phone}
            onChange={(v) => setCustomer({ phone: v })}
          />
          <Field
            label="Email"
            value={proposal.customer.email}
            onChange={(v) => setCustomer({ email: v })}
          />
        </div>
        <div className="space-y-3">
          <div className="section-banner -mx-1 rounded">Project</div>
          <Field
            label="Project Name"
            value={proposal.project.referenceName}
            placeholder="Smith Family Barndominium"
            onChange={(v) => setProject({ referenceName: v })}
          />
          <Field
            label="Street Address"
            value={proposal.project.streetAddress}
            onChange={(v) => setProject({ streetAddress: v })}
          />
          <Field
            label="City, State ZIP"
            value={proposal.project.cityStateZip}
            onChange={(v) => setProject({ cityStateZip: v })}
          />
          <Field
            label="County"
            value={proposal.project.county}
            onChange={(v) => setProject({ county: v })}
          />
        </div>
        <div className="space-y-3">
          <div className="section-banner -mx-1 rounded">Project Manager</div>
          <Field
            label="Project Manager"
            value={proposal.salesRep}
            onChange={(v) => updateProposal(proposal.id, { salesRep: v })}
          />
          <Field
            label="Phone"
            value={proposal.salesRepPhone ?? ''}
            onChange={(v) => updateProposal(proposal.id, { salesRepPhone: v })}
          />
          <Field
            label="Email"
            value={proposal.salesRepEmail ?? ''}
            onChange={(v) => updateProposal(proposal.id, { salesRepEmail: v })}
          />
          <p className="text-xs leading-snug text-brand-steel">
            The email receives the notification when the customer e-signs — without it, the
            signing section is hidden on the customer's link.
          </p>
        </div>
      </div>
    </div>
  );
}
