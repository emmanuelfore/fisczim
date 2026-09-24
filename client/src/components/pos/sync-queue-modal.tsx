import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CloudUpload, AlertTriangle, RefreshCw, Clock, CheckCircle2, Skull } from "lucide-react";
import { useEffect, useState } from "react";
import { getDb, resetPendingSaleRetry } from "@/lib/offline-db";

interface SyncQueueModalProps {
  isOpen: boolean;
  onClose: () => void;
  triggerSync: () => void;
  syncStatus: "idle" | "syncing" | "error" | "complete";
  isOnline: boolean;
}

export function SyncQueueModal({ isOpen, onClose, triggerSync, syncStatus, isOnline }: SyncQueueModalProps) {
  const [pendingSales, setPendingSales] = useState<any[]>([]);

  useEffect(() => {
    if (isOpen) {
      loadPendingSales();
    }
  }, [isOpen]);

  const loadPendingSales = async () => {
    const db = await getDb();
    const allPending = await db.getAll("pendingSales");
    // FIFO — oldest first, same order the sync engine uses
    allPending.sort((a: any, b: any) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    setPendingSales(allPending);
  };

  const handleDiscard = async (id: string) => {
    if (confirm("Are you sure you want to discard this pending sale? It will not be synced to the server.")) {
      const db = await getDb();
      await db.delete("pendingSales", id);
      await loadPendingSales();
    }
  };

  const handleRetry = async (id: string) => {
    await resetPendingSaleRetry(id);
    await loadPendingSales();
    triggerSync();
  };

  const statusMeta = (sale: any) => {
    if (sale.status === 'dead') {
      return {
        chip: "Quarantined",
        chipClass: "bg-red-100 text-red-700 border-red-200",
        iconBg: "bg-red-100",
        icon: <Skull className="h-4 w-4 text-red-600" />,
      };
    }
    if (sale.status === 'failed') {
      return {
        chip: sale.retryAt ? `Retrying ${new Date(sale.retryAt).toLocaleTimeString()}` : "Failed",
        chipClass: "bg-orange-100 text-orange-700 border-orange-200",
        iconBg: "bg-orange-100",
        icon: <AlertTriangle className="h-4 w-4 text-orange-600" />,
      };
    }
    return {
      chip: sale.status === 'syncing' ? "Syncing…" : "Pending",
      chipClass: "bg-amber-100 text-amber-700 border-amber-200",
      iconBg: "bg-amber-100",
      icon: <Clock className="h-4 w-4 text-amber-600" />,
    };
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[600px] bg-slate-50 border-slate-200 shadow-2xl rounded-[2rem]">
        <DialogHeader className="pb-4 border-b border-slate-200">
          <DialogTitle className="text-xl font-black text-slate-900 flex items-center gap-3 tracking-tight">
            <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
              <CloudUpload className="h-5 w-5 text-blue-600" />
            </div>
            Offline Sync Queue
          </DialogTitle>
          <DialogDescription className="text-slate-500 font-medium pt-2">
            View transactions stored locally on this device waiting to be pushed to the server.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4 space-y-4 max-h-[50vh] overflow-y-auto pr-2 custom-scrollbar">
          {pendingSales.length === 0 ? (
            <div className="text-center py-10 flex flex-col items-center justify-center opacity-50">
              <CheckCircle2 className="h-12 w-12 text-emerald-500 mb-3" />
              <p className="text-slate-600 font-bold">All caught up!</p>
              <p className="text-sm text-slate-400">No pending transactions in the queue.</p>
            </div>
          ) : (
            pendingSales.map((sale) => {
              const meta = statusMeta(sale);
              const data = sale.invoiceData || {};
              return (
                <div key={sale.id} className="bg-white rounded-xl p-4 shadow-sm border border-slate-100 flex items-start gap-4 transition-all hover:shadow-md">
                  <div className={`mt-1 w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${meta.iconBg}`}>
                    {meta.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1 gap-2">
                      <h3 className="font-bold text-slate-900 truncate">
                        {data.isPos ? 'POS Receipt' : 'Invoice'}
                      </h3>
                      <span className="text-sm font-black text-slate-900 shrink-0">
                        {data.currency || ''} {Number(data.total || 0).toFixed(2)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-slate-500 font-medium mb-2 flex-wrap">
                      <span>{sale.createdAt ? new Date(sale.createdAt).toLocaleString() : ''}</span>
                      <span>•</span>
                      <span>{data.items?.length || 0} items</span>
                      <span>•</span>
                      <span className={`px-2 py-0.5 rounded-full border text-[10px] font-bold ${meta.chipClass}`}>
                        {meta.chip}
                      </span>
                    </div>

                    {sale.error && (
                      <div className="bg-red-50 text-red-600 px-3 py-2 rounded-lg text-xs font-semibold border border-red-100 mb-3">
                        Error: {sale.error}
                      </div>
                    )}

                    {(sale.status === 'dead' || sale.status === 'failed') && (
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-[10px] text-blue-600 hover:text-blue-700 hover:bg-blue-50 border-blue-200"
                          onClick={() => handleRetry(sale.id)}
                          disabled={!isOnline}
                        >
                          <RefreshCw className="h-3 w-3 mr-1" />
                          Retry Now
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-[10px] text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200"
                          onClick={() => handleDiscard(sale.id)}
                        >
                          Discard Transaction
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="pt-4 border-t border-slate-200 flex items-center justify-between">
          <div className="text-sm font-semibold text-slate-500">
            {pendingSales.length} item(s) pending
          </div>
          <Button
            onClick={() => {
              triggerSync();
              onClose();
            }}
            disabled={!isOnline || pendingSales.length === 0 || syncStatus === "syncing"}
            className="bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-lg shadow-blue-500/20"
          >
            {syncStatus === "syncing" ? (
              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <CloudUpload className="h-4 w-4 mr-2" />
            )}
            {syncStatus === "syncing" ? "Syncing..." : "Sync Now"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
