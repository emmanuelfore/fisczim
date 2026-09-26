import React from "react";
import { Button } from "@/components/ui/button";
import { RefreshCw, Trash2, AlertTriangle } from "lucide-react";

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * Catches render crashes anywhere below it (providers, boot gate, routes).
 * Without this, a single throwing component unmounts the whole app and leaves
 * the boot splash parked forever with no explanation.
 */
export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error("[App] Unhandled render error:", error);
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleClearAndReload = async () => {
    try {
      const dbs = (indexedDB as any)?.databases ? await (indexedDB as any).databases() : [];
      await Promise.all((dbs || []).map((d: any) => d?.name
        ? new Promise((res) => {
            const req = indexedDB.deleteDatabase(d.name);
            req.onsuccess = req.onerror = req.onblocked = () => res(null);
          })
        : null));
    } catch {}
    try {
      localStorage.clear();
      sessionStorage.clear();
    } catch {}
    try {
      if ("serviceWorker" in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((r) => r.unregister()));
      }
      if (window.caches) {
        const keys = await window.caches.keys();
        await Promise.all(keys.map((k) => window.caches.delete(k)));
      }
    } catch {}
    window.location.reload();
  };

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-900 text-white p-6">
        <div className="w-full max-w-sm text-center">
          <AlertTriangle className="w-10 h-10 mx-auto text-amber-400" />
          <h1 className="mt-4 text-lg font-bold">Something went wrong starting the app</h1>
          <p className="mt-2 text-sm text-slate-400 break-words">
            {this.state.error.message || "Unexpected error"}
          </p>
          <div className="mt-6 flex gap-2 justify-center">
            <Button
              variant="outline"
              size="sm"
              onClick={this.handleReload}
              className="bg-white/5 border-white/10 text-white hover:bg-white/10"
            >
              <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Reload
            </Button>
            <Button size="sm" onClick={this.handleClearAndReload}>
              <Trash2 className="w-3.5 h-3.5 mr-1.5" /> Clear data & reload
            </Button>
          </div>
        </div>
      </div>
    );
  }
}
