import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import '@uiw/react-md-editor/markdown-editor.css';
import '@uiw/react-markdown-preview/markdown.css';
import './styles/globals.css';

// Deploys leave long-lived tabs holding references to chunks that no longer
// exist — both of these turn that from a blank screen into a clean reload.
// 1) Vite fires this when a lazy import 404s:
window.addEventListener('vite:preloadError', (e) => {
  e.preventDefault();
  if (!sessionStorage.getItem('pfcs-preload-reloaded')) {
    sessionStorage.setItem('pfcs-preload-reloaded', '1');
    window.location.reload();
  }
});
// 2) When a new service worker takes over mid-session, follow it:
if ('serviceWorker' in navigator) {
  let hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hadController) window.location.reload();
    hadController = true;
  });
}
// clear the reload guards once a page loads successfully
window.setTimeout(() => {
  sessionStorage.removeItem('pfcs-preload-reloaded');
  sessionStorage.removeItem('pfcs-crash-reloaded');
}, 10_000);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
