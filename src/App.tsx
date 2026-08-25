import { Suspense, lazy } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import Dashboard from '@/pages/Dashboard';
import Editor from '@/pages/Editor';
import CustomerView from '@/pages/CustomerView';
import LibraryEditor from '@/pages/LibraryEditor';
import Settings from '@/pages/Settings';
import CrmLayout from '@/pages/crm/CrmLayout';
import Contacts from '@/pages/crm/Contacts';
import ContactDetail from '@/pages/crm/ContactDetail';
import Pipeline from '@/pages/crm/Pipeline';
import Tasks from '@/pages/crm/Tasks';
import Team from '@/pages/crm/Team';
const Reports = lazy(() => import('@/pages/crm/Reports'));
const InboundLeadsDoc = lazy(() => import('@/pages/crm/InboundLeadsDoc'));
const Integrations = lazy(() => import('@/pages/crm/Integrations'));
import { Toaster } from '@/components/ui/toast';
import { useBuilderCloudSync } from '@/lib/builderSync';

function BuilderSync() {
  useBuilderCloudSync();
  return null;
}

export default function App() {
  return (
    <BrowserRouter>
      <BuilderSync />
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/proposal/:id" element={<Editor />} />
        <Route path="/view" element={<CustomerView />} />
        <Route path="/library" element={<LibraryEditor />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/crm" element={<CrmLayout />}>
          <Route index element={<Contacts />} />
          <Route path="contacts/:id" element={<ContactDetail />} />
          <Route path="pipeline" element={<Pipeline />} />
          <Route path="tasks" element={<Tasks />} />
          <Route path="team" element={<Team />} />
          <Route
            path="reports"
            element={
              <Suspense fallback={<p className="text-sm text-brand-steel">Loading reports…</p>}>
                <Reports />
              </Suspense>
            }
          />
          <Route
            path="integrations"
            element={
              <Suspense fallback={<p className="text-sm text-brand-steel">Loading…</p>}>
                <Integrations />
              </Suspense>
            }
          />
          <Route
            path="integrations/inbound-leads"
            element={
              <Suspense fallback={<p className="text-sm text-brand-steel">Loading…</p>}>
                <InboundLeadsDoc />
              </Suspense>
            }
          />
          {/* legacy path — printed links keep working */}
          <Route path="docs/inbound-leads" element={<Navigate to="/crm/integrations/inbound-leads" replace />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <Toaster />
    </BrowserRouter>
  );
}
