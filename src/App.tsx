import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import Dashboard from '@/pages/Dashboard';
import Editor from '@/pages/Editor';
import CustomerView from '@/pages/CustomerView';
import LibraryEditor from '@/pages/LibraryEditor';
import Settings from '@/pages/Settings';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/proposal/:id" element={<Editor />} />
        <Route path="/view" element={<CustomerView />} />
        <Route path="/library" element={<LibraryEditor />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
