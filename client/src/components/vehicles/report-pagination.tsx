import { Button } from "@/components/ui/button";

export function ReportPagination({ total, pageSize, page, onChange }: {
  total: number; pageSize: number; page: number; onChange: (page: number) => void;
}) {
  const count = Math.max(1, Math.ceil(total / pageSize));
  if (count <= 1) return null;
  return <nav aria-label="Report pages" className="flex flex-wrap items-center justify-between gap-2 border-t px-4 py-3 text-sm">
    <span aria-live="polite">{page * pageSize + 1}–{Math.min((page + 1) * pageSize, total)} of {total}</span>
    <div className="flex items-center gap-2">
      <Button size="sm" variant="outline" onClick={() => onChange(page - 1)} disabled={page === 0}>Previous</Button>
      <Button size="sm" variant="outline" onClick={() => onChange(page + 1)} disabled={page + 1 >= count}>Next</Button>
    </div>
  </nav>;
}
