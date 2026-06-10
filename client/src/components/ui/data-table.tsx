import * as React from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface DataTableProps<TData> {
  columns: {
    accessorKey: string;
    header: string;
    cell?: (props: { row: { original: TData } }) => React.ReactNode;
  }[];
  data: TData[];
  isLoading?: boolean;
  onRowClick?: (row: TData) => void;
  selectedId?: number | string | null;
}

export function DataTable<TData extends { id: number | string }>({
  columns,
  data,
  isLoading,
  onRowClick,
  selectedId,
}: DataTableProps<TData>) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-40">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-md border border-slate-100">
      <div className="grid gap-3 p-3 sm:hidden">
        {data.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 px-4 py-8 text-center  font-medium text-slate-400">
            No results found.
          </div>
        ) : (
          data.map((row) => (
            <div
              key={row.id}
              role={onRowClick ? "button" : undefined}
              tabIndex={onRowClick ? 0 : undefined}
              className={cn(
                "w-full rounded-xl border bg-white p-4 text-left shadow-sm transition-colors",
                selectedId === row.id
                  ? "border-primary/30 bg-primary/5"
                  : "border-slate-200 active:bg-slate-50",
                onRowClick ? "cursor-pointer" : "cursor-default",
              )}
              onClick={() => onRowClick?.(row)}
              onKeyDown={(event) => {
                if (!onRowClick) return;
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onRowClick(row);
                }
              }}
            >
              <div className="space-y-3">
                {columns.map((column, index) => (
                  <div
                    key={column.accessorKey}
                    className={cn(
                      "flex min-w-0 items-start justify-between gap-4",
                      index === 0 && "block",
                      index === columns.length - 1 && "justify-end pt-1",
                    )}
                  >
                    {index !== columns.length - 1 && (
                      <span className="max-w-[42%] shrink-0 text-[12px] font-black uppercase tracking-wider text-slate-400">
                        {column.header}
                      </span>
                    )}
                    <div
                      className={cn(
                        "min-w-0 text-right  font-semibold text-slate-800",
                        index === 0 && "mt-1 text-left",
                      )}
                    >
                      {column.cell
                        ? column.cell({ row: { original: row } })
                        : (row as any)[column.accessorKey]}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
      <div className="hidden sm:block">
        <Table>
          <TableHeader className="bg-slate-50/50">
            <TableRow className="hover:bg-transparent border-slate-100">
              {columns.map((column) => (
                <TableHead
                  key={column.accessorKey}
                  className="h-10 px-4 font-semibold text-slate-500 uppercase tracking-wide "
                >
                  {column.header}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-24 text-center text-slate-400  font-medium"
                >
                  No results found.
                </TableCell>
              </TableRow>
            ) : (
              data.map((row) => (
                <TableRow
                  key={row.id}
                  className={cn(
                    "cursor-pointer transition-colors border-slate-50",
                    selectedId === row.id
                      ? "bg-primary/5 hover:bg-primary/10"
                      : "hover:bg-slate-50",
                  )}
                  onClick={() => onRowClick?.(row)}
                >
                  {columns.map((column) => (
                    <TableCell key={column.accessorKey} className="px-4 py-3">
                      {column.cell
                        ? column.cell({ row: { original: row } })
                        : (row as any)[column.accessorKey]}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
