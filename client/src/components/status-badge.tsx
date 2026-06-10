import { cn } from "@/lib/utils";

export function StatusBadge({
  status,
  className,
  children,
}: {
  status: string;
  className?: string;
  children?: React.ReactNode;
}) {
  const styles: Record<string, string> = {
    draft: "bg-slate-100 text-slate-700 border-slate-200",
    issued: "bg-blue-50 text-blue-700 border-blue-100",
    paid: "bg-emerald-50 text-emerald-700 border-emerald-100",
    cancelled: "bg-red-50 text-red-700 border-red-100",
    pending: "bg-amber-50 text-amber-700 border-amber-100",
    overdue: "bg-rose-50 text-rose-700 border-rose-100",
    quote: "bg-indigo-50 text-indigo-700 border-indigo-100",
    fiscalized: "bg-emerald-50 text-emerald-700 border-emerald-100",
    fiscalised: "bg-emerald-50 text-emerald-700 border-emerald-100",
    "pending-sync": "bg-amber-50 text-amber-700 border-amber-100",
    failed: "bg-red-50 text-red-700 border-red-100",
    unpaid: "bg-red-50 text-red-700 border-red-100",
    partial: "bg-blue-50 text-blue-700 border-blue-100",
  };

  const style = styles[status.toLowerCase()] || styles.draft;

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase leading-none tracking-[0.04em]",
        style,
        className,
      )}
    >
      {children || status}
    </span>
  );
}
