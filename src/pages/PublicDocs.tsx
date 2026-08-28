// /docs/inbound-leads — the PUBLIC integrator hand-out. Deliberately outside
// every auth gate: this is the page we send to the marketing company. Same
// markdown as the CRM's Integrations copy; contains no keys or secrets
// (keys are delivered by text/call, never in the doc).
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import doc from '../../docs/inbound-leads.md?raw';

export default function PublicDocs() {
  return (
    <div className="light-scope min-h-screen bg-brand-gray-bg py-8">
      <main className="mx-auto max-w-2xl px-4">
        <div className="prose prose-sm max-w-none rounded-lg border bg-white p-6 shadow-sm prose-headings:text-brand-black prose-code:before:content-none prose-code:after:content-none">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{doc}</ReactMarkdown>
        </div>
        <p className="mt-4 text-center text-xs text-brand-steel">
          Post-Frame Construction Solutions, LLC · Orrville, Ohio
        </p>
      </main>
    </div>
  );
}
