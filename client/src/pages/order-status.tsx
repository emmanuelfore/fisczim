import { useActiveCompany } from "@/hooks/use-active-company";
import { useOrderStatus } from "@/hooks/use-invoices";
import { Badge } from "@/components/ui/badge";
import { Utensils, CheckCircle2, Loader2, PlayCircle, Clock } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";

export default function OrderStatus() {
  const searchParams = new URLSearchParams(window.location.search);
  const companyUrlId = searchParams.get("companyId");
  const { activeCompanyId } = useActiveCompany();
  const companyId = companyUrlId ? parseInt(companyUrlId) : activeCompanyId;

  // Live clock that actually ticks
  const [currentTime, setCurrentTime] = useState(new Date());
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Auto-polling every 5 seconds so the screen stays live
  const { data: orders, isLoading, refetch: refetchOrders } = useOrderStatus(companyId || 0);
  useEffect(() => {
    const poll = setInterval(() => refetchOrders(), 5000);
    return () => clearInterval(poll);
  }, [refetchOrders]);

  // Fetch company name for branding
  const { data: company } = useQuery({
    queryKey: ["/api/companies", companyId],
    queryFn: async () => {
      if (!companyId) return null;
      const res = await apiFetch(`/api/companies/${companyId}`);
      if (!res.ok) return null;
      return res.json();
    },
    enabled: Boolean(companyId),
    staleTime: 60_000,
  });

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-zinc-950">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  const preparing =
    orders?.filter(
      (o: any) => o.orderStatus === "preparing" || o.orderStatus === "pending",
    ) || [];
  const ready = orders?.filter((o: any) => o.orderStatus === "ready") || [];

  return (
    <div className="min-h-screen overflow-hidden bg-zinc-950 font-sans text-zinc-100">
      <div className="flex h-screen flex-col">
        {/* Header */}
        <header className="flex h-24 items-center justify-between border-b border-zinc-800/50 bg-zinc-900/80 px-10 py-6 backdrop-blur-md shrink-0">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/30">
              <Utensils className="h-8 w-8" />
            </div>
            <div>
              <h1 className="text-3xl font-extrabold tracking-tight text-white uppercase italic">
                {company?.name || "Order Board"}
              </h1>
              <p className="text-xs font-bold tracking-widest text-zinc-500 uppercase mt-0.5">
                Live Order Status
              </p>
            </div>
          </div>
          <div className="text-right flex items-center gap-3">
            <Clock className="h-5 w-5 text-zinc-600" />
            <div>
              <p className="text-xs font-semibold tracking-widest text-zinc-500 uppercase">
                Current Time
              </p>
              <p className="text-2xl font-mono font-bold text-zinc-200">
                {currentTime.toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                })}
              </p>
            </div>
          </div>
        </header>

        {/* Main Columns */}
        <div className="flex flex-1 overflow-hidden">
          {/* Preparing Column */}
          <div className="flex flex-1 flex-col border-r border-zinc-800/40 bg-zinc-900/10">
            <div className="flex items-center gap-3 bg-amber-500/5 border-b border-amber-500/10 px-10 py-6 shadow-inner shrink-0">
              <PlayCircle className="h-8 w-8 text-amber-500" />
              <div>
                <h2 className="text-4xl font-black tracking-tighter text-amber-400 uppercase italic">
                  Preparing
                </h2>
                <p className="text-xs font-bold text-amber-600/60 uppercase tracking-widest">
                  {preparing.length} order{preparing.length !== 1 ? 's' : ''}
                </p>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-8">
              <div className="flex flex-wrap gap-6">
                <AnimatePresence mode="popLayout">
                  {preparing.map((order: any) => (
                    <motion.div
                      key={order.id}
                      initial={{ opacity: 0, scale: 0.5 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 1.5, rotate: 10 }}
                      transition={{
                        type: "spring",
                        stiffness: 300,
                        damping: 20,
                      }}
                      className="group flex flex-col items-center gap-3"
                    >
                      <div className="flex h-32 w-32 items-center justify-center rounded-3xl border-2 border-amber-500/20 bg-amber-500/5 shadow-lg shadow-amber-500/5">
                        <span className="text-5xl font-black text-amber-400 font-mono">
                          {order.orderNumber?.replace("#", "")}
                        </span>
                      </div>
                      {order.items && order.items.length > 0 && (
                        <div className="max-w-[128px] text-center">
                          {order.items.slice(0, 2).map((item: any, idx: number) => (
                            <p key={idx} className="text-[10px] font-bold text-amber-600/60 truncate">
                              {Math.round(item.quantity)}× {item.productName || item.description}
                            </p>
                          ))}
                          {order.items.length > 2 && (
                            <p className="text-[9px] text-amber-600/40 font-bold">+{order.items.length - 2} more</p>
                          )}
                        </div>
                      )}
                    </motion.div>
                  ))}
                </AnimatePresence>
                {preparing.length === 0 && (
                  <div className="flex flex-1 items-center justify-center pt-20 text-zinc-600 opacity-20">
                    <p className="text-2xl font-bold uppercase italic">
                      No Orders Preparing
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Ready Column */}
          <div className="flex flex-1 flex-col bg-zinc-900/30">
            <div className="flex items-center gap-3 bg-emerald-500/10 border-b border-emerald-500/10 px-10 py-6 shadow-inner shrink-0">
              <CheckCircle2 className="h-8 w-8 text-emerald-500" />
              <div>
                <h2 className="text-4xl font-black tracking-tighter text-emerald-400 uppercase italic">
                  Ready!
                </h2>
                <p className="text-xs font-bold text-emerald-600/60 uppercase tracking-widest">
                  {ready.length} order{ready.length !== 1 ? 's' : ''} to collect
                </p>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-8">
              <div className="flex flex-wrap gap-6">
                <AnimatePresence mode="popLayout">
                  {ready.map((order: any) => (
                    <motion.div
                      key={order.id}
                      initial={{ opacity: 0, scale: 0.5, y: -50 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.5, y: 100 }}
                      transition={{
                        type: "spring",
                        stiffness: 400,
                        damping: 15,
                      }}
                      className="group flex flex-col items-center gap-3"
                    >
                      <div className="relative flex h-44 w-44 items-center justify-center rounded-[2.5rem] border-4 border-emerald-500/40 bg-emerald-500/20 shadow-2xl shadow-emerald-500/20 ring-4 ring-emerald-500/10">
                        <span className="text-8xl font-black text-white font-mono drop-shadow-lg">
                          {order.orderNumber?.replace("#", "")}
                        </span>
                        <motion.div
                          animate={{ opacity: [0, 1, 0] }}
                          transition={{ repeat: Infinity, duration: 1.5 }}
                          className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-emerald-400"
                        />
                      </div>
                      {order.items && order.items.length > 0 && (
                        <div className="max-w-[176px] text-center">
                          {order.items.slice(0, 3).map((item: any, idx: number) => (
                            <p key={idx} className="text-xs font-bold text-emerald-400/60 truncate">
                              {Math.round(item.quantity)}× {item.productName || item.description}
                            </p>
                          ))}
                          {order.items.length > 3 && (
                            <p className="text-[10px] text-emerald-400/40 font-bold">+{order.items.length - 3} more</p>
                          )}
                        </div>
                      )}
                    </motion.div>
                  ))}
                </AnimatePresence>
                {ready.length === 0 && (
                  <div className="flex flex-1 items-center justify-center pt-20 text-zinc-600 opacity-20">
                    <p className="text-2xl font-bold uppercase italic font-mono">
                      No Orders Ready
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Footer Ticker */}
        <footer className="h-12 border-t border-zinc-800/50 bg-zinc-900/80 flex items-center overflow-hidden backdrop-blur-sm shrink-0">
          <div className="animate-marquee whitespace-nowrap flex items-center gap-16 px-8">
            <span className="text-sm font-bold tracking-widest text-zinc-500 uppercase">
              🍽️ Please present your order number at the counter when called
            </span>
            <span className="text-sm font-bold tracking-widest text-zinc-500 uppercase">
              ✅ Orders marked READY are available for collection
            </span>
            <span className="text-sm font-bold tracking-widest text-zinc-500 uppercase">
              🍽️ Please present your order number at the counter when called
            </span>
            <span className="text-sm font-bold tracking-widest text-zinc-500 uppercase">
              ✅ Orders marked READY are available for collection
            </span>
          </div>
        </footer>
      </div>

      <style>{`
        @keyframes marquee {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .animate-marquee {
          animation: marquee 25s linear infinite;
        }
      `}</style>
    </div>
  );
}
