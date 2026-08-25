// /crm/docs/inbound-leads — the integrator hand-out, rendered from the same
// markdown file that lives in the repo (docs/inbound-leads.md). Auth-gated
// like every /crm route; print-friendly via the browser.
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import doc from '../../../docs/inbound-leads.md?raw';

export default function InboundLeadsDoc() {
  return (
    <div className="prose prose-sm max-w-2xl rounded-lg border bg-white p-6 shadow-sm prose-headings:text-brand-black prose-code:before:content-none prose-code:after:content-none">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{doc}</ReactMarkdown>
    </div>
  );
}
