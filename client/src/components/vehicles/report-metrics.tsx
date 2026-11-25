import type { ReactNode } from "react";

export function ReportMetrics({ metrics }: { metrics: { label: string; value: ReactNode }[] }) {
  return <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
    {metrics.map(metric => <div key={metric.label} className="min-w-0 rounded-lg border bg-white px-4 py-3">
      <dt className="text-sm leading-snug text-slate-600">{metric.label}</dt>
      <dd className="mt-1 break-words text-xl font-semibold leading-tight tabular-nums text-slate-950 sm:text-2xl">{metric.value}</dd>
    </div>)}
  </dl>;
}
