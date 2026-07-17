import * as React from "react";

import { cn } from "@/lib/utils";

const Table = React.forwardRef<
  HTMLTableElement,
  React.HTMLAttributes<HTMLTableElement>
>(({ className, ...props }, ref) => (
  <ResponsiveTable ref={ref} className={className} {...props} />
));
Table.displayName = "Table";

const ResponsiveTable = React.forwardRef<
  HTMLTableElement,
  React.HTMLAttributes<HTMLTableElement>
>(({ className, ...props }, forwardedRef) => {
  const tableRef = React.useRef<HTMLTableElement | null>(null);

  React.useEffect(() => {
    const table = tableRef.current;
    if (!table) return;

    const applyLabels = () => {
      const headers = Array.from(table.querySelectorAll("thead th")).map(
        (header) => (header.textContent || "").replace(/\s+/g, " ").trim(),
      );
      if (table.getAttribute("data-mobile-cards") !== "false") {
        table.dataset.mobileCards = headers.some(Boolean) ? "true" : "false";
      }

      Array.from(table.querySelectorAll("tbody tr")).forEach((row) => {
        Array.from(row.children).forEach((cell, index) => {
          if (!(cell instanceof HTMLElement)) return;
          const span = Number(cell.getAttribute("colspan") || "1");
          if (span > 1) {
            cell.dataset.mobileFull = "true";
            return;
          }
          const label = headers[index];
          if (label) {
            cell.dataset.label = label;
          }
        });
      });
    };

    applyLabels();
    const observer = new MutationObserver(applyLabels);
    observer.observe(table, {
      childList: true,
      subtree: true,
      characterData: true,
    });
    return () => observer.disconnect();
  }, [props.children]);

  return (
    <div className="responsive-table-shell relative w-full overflow-x-auto">
      <table
        ref={(node) => {
          tableRef.current = node;
          if (typeof forwardedRef === "function") {
            forwardedRef(node);
          } else if (forwardedRef) {
            forwardedRef.current = node;
          }
        }}
        className={cn("responsive-table w-full caption-bottom ", className)}
        {...props}
      />
    </div>
  );
});
ResponsiveTable.displayName = "ResponsiveTable";

const TableHeader = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <thead
    ref={ref}
    className={cn(
      "[&_tr]:border-b [&_tr]:border-[#E5E7EB] [&_tr]:bg-[#F8FAFC]",
      className,
    )}
    {...props}
  />
));
TableHeader.displayName = "TableHeader";

const TableBody = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tbody
    ref={ref}
    className={cn("[&_tr:last-child]:border-0", className)}
    {...props}
  />
));
TableBody.displayName = "TableBody";

const TableFooter = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tfoot
    ref={ref}
    className={cn(
      "border-t bg-muted/50 font-medium [&>tr]:last:border-b-0",
      className,
    )}
    {...props}
  />
));
TableFooter.displayName = "TableFooter";

const TableRow = React.forwardRef<
  HTMLTableRowElement,
  React.HTMLAttributes<HTMLTableRowElement>
>(({ className, ...props }, ref) => (
  <tr
    ref={ref}
    className={cn(
      "border-b border-[#F1F5F9] transition-colors hover:bg-[#F8FAFC] data-[state=selected]:bg-[#EFF6FF]",
      className,
    )}
    {...props}
  />
));
TableRow.displayName = "TableRow";

const TableHead = React.forwardRef<
  HTMLTableCellElement,
  React.ThHTMLAttributes<HTMLTableCellElement>
>(({ className, ...props }, ref) => (
  <th
    ref={ref}
    className={cn(
      "h-11 px-4 text-left align-middle  font-semibold uppercase tracking-wide text-[#64748B] [&:has([role=checkbox])]:pr-0",
      className,
    )}
    {...props}
  />
));
TableHead.displayName = "TableHead";

const TableCell = React.forwardRef<
  HTMLTableCellElement,
  React.TdHTMLAttributes<HTMLTableCellElement>
>(({ className, ...props }, ref) => (
  <td
    ref={ref}
    className={cn(
      "px-4 py-3 align-middle  font-medium text-[#334155] [&:has([role=checkbox])]:pr-0",
      className,
    )}
    {...props}
  />
));
TableCell.displayName = "TableCell";

const TableCaption = React.forwardRef<
  HTMLTableCaptionElement,
  React.HTMLAttributes<HTMLTableCaptionElement>
>(({ className, ...props }, ref) => (
  <caption
    ref={ref}
    className={cn("mt-4  text-muted-foreground", className)}
    {...props}
  />
));
TableCaption.displayName = "TableCaption";

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
};
