// /crm/integrations — every way outside systems connect to the CRM, each
// with its hand-out documentation. New connections (configurator, QuickBooks,
// website forms) get a card here.
import { Link } from 'react-router-dom';
import { ChevronRight, Inbox } from 'lucide-react';

const INTEGRATIONS = [
  {
    to: '/crm/integrations/inbound-leads',
    icon: <Inbox className="h-5 w-5 text-brand-orange" />,
    title: 'Inbound leads (API)',
    blurb:
      'Lets the marketing company, Zapier, Facebook Lead Ads, or our website forms push leads straight into the pipeline. Open for the instruction sheet to share with an integrator.',
  },
];

export default function Integrations() {
  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-xl font-bold text-brand-black">Integrations</h1>
      <p className="mt-1 text-sm text-brand-steel">
        Ways other systems connect to the CRM. Each card opens the instructions you hand to
        the person doing the hook-up.
      </p>
      <div className="mt-4 grid gap-2">
        {INTEGRATIONS.map((i) => (
          <Link
            key={i.to}
            to={i.to}
            className="flex items-center gap-3 rounded-lg border bg-white p-4 shadow-sm hover:bg-brand-gray-bg"
          >
            {i.icon}
            <div className="min-w-0 flex-1">
              <div className="font-medium text-brand-black">{i.title}</div>
              <div className="text-sm text-brand-steel">{i.blurb}</div>
            </div>
            <ChevronRight className="h-4 w-4 shrink-0 text-brand-steel/50" />
          </Link>
        ))}
      </div>
    </div>
  );
}
