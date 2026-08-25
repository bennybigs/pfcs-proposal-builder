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
import { Toaster } from '@/components/ui/toast';

export default function App() {
  return (
    <BrowserRouter>
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
            path="docs/inbound-leads"
            element={
              <Suspense fallback={<p className="text-sm text-brand-steel">Loading…</p>}>
                <InboundLeadsDoc />
              </Suspense>
            }
          />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <Toaster />
    </BrowserRouter>
  );
}
