// The blank-screen killer. Any render crash shows a real message with a
// Reload button instead of a silent void — and the first crash after a
// deploy auto-reloads once, since stale chunks are the usual culprit.
import React from 'react';

interface State {
  error: Error | null;
}

const RELOAD_FLAG = 'pfcs-crash-reloaded';

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error): void {
    // A stale tab requesting chunks from an old deploy dies exactly like
    // this — one automatic reload fixes it. Guard against reload loops.
    const stale =
      /Loading chunk|dynamically imported module|Importing a module script failed/i.test(
        error.message
      );
    if (stale && !sessionStorage.getItem(RELOAD_FLAG)) {
      sessionStorage.setItem(RELOAD_FLAG, '1');
      window.location.reload();
    }
  }

  render() {
    if (!this.state.error) {
      return this.props.children;
    }
    return (
      <div className="flex min-h-screen items-center justify-center bg-brand-gray-bg p-6">
        <div className="max-w-sm rounded-lg border bg-white p-6 text-center shadow-sm">
          <h1 className="font-heading text-xl font-bold uppercase tracking-wide text-brand-black">
            Something broke
          </h1>
          <p className="mt-2 text-sm text-brand-steel">
            Usually this just means the app updated underneath an open tab. Reloading fixes it —
            nothing is lost.
          </p>
          <p className="mt-2 break-words rounded bg-brand-gray-bg p-2 text-left text-[11px] text-brand-steel">
            {this.state.error.message}
          </p>
          <button
            onClick={() => {
              sessionStorage.removeItem(RELOAD_FLAG);
              window.location.reload();
            }}
            className="mt-4 rounded-md bg-brand-orange px-5 py-2 text-sm font-semibold text-white hover:brightness-95"
          >
            Reload
          </button>
        </div>
      </div>
    );
  }
}
