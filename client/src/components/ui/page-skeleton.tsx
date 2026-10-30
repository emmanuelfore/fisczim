import { cn } from "@/lib/utils";

interface PageSkeletonProps {
  /** Placeholder table rows. */
  rows?: number;
  /** Number of stat cards; 0 hides the row. */
  stats?: number;
  className?: string;
}

/**
 * Content-shaped placeholder for a page that is still fetching its data.
 * Keeps the layout stable and reads as "filling in", not "stalled".
 */
export function PageSkeleton({ rows = 5, stats = 4, className }: PageSkeletonProps) {
  return (
    <div
      className={cn("mx-auto w-full max-w-7xl p-4 sm:p-6", className)}
      aria-busy="true"
      aria-label="Loading"
    >
      <div className="mb-6 flex items-center justify-between gap-4">
        <div className="space-y-2">
          <div className="h-6 w-40 animate-pulse rounded-md bg-slate-200/80" />
          <div className="h-3 w-64 max-w-full animate-pulse rounded bg-slate-200/50" />
        </div>
        <div className="h-9 w-28 animate-pulse rounded-xl bg-slate-200/60" />
      </div>

      {stats > 0 ? (
        <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: stats }).map((_, i) => (
            <div
              key={i}
              className="h-24 animate-pulse rounded-xl border border-slate-200/60 bg-white"
              style={{ animationDelay: `${i * 90}ms` }}
            />
          ))}
        </div>
      ) : null}

      <div className="space-y-2 rounded-xl border border-slate-200/60 bg-white p-4">
        {Array.from({ length: rows }).map((_, i) => (
          <div
            key={i}
            className="h-10 animate-pulse rounded-lg bg-slate-100"
            style={{ animationDelay: `${i * 70}ms` }}
          />
        ))}
      </div>
    </div>
  );
}

/** Compact variant for detail panels that already sit inside a page shell. */
export function PanelSkeleton({ rows = 4, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn("w-full space-y-2 p-4", className)} aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="h-10 animate-pulse rounded-lg bg-slate-100"
          style={{ animationDelay: `${i * 70}ms` }}
        />
      ))}
    </div>
  );
}

/** Pulse rows sized to drop into a table body or a card without a spinner. */
export function LoadingRows({ rows = 4, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn("w-full space-y-2 py-2", className)} aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="h-10 animate-pulse rounded-lg bg-slate-100"
          style={{ animationDelay: `${i * 70}ms` }}
        />
      ))}
    </div>
  );
}
