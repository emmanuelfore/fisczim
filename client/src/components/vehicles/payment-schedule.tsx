import { format, parseISO } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fmtMoney } from "@/hooks/use-vehicles";
import { paymentSchedulePosition, type PaymentScheduleStatus } from "@/lib/vehicle-schedule";

export type ScheduleRow = { id: number; type: string; dueDate: string; amount: number; open: number };

const statusStyles: Record<PaymentScheduleStatus, { label: string; tone: string }> = {
  paid: { label: "Paid", tone: "bg-emerald-100 text-emerald-800" },
  overdue: { label: "Overdue", tone: "bg-rose-100 text-rose-800" },
  due: { label: "Due today", tone: "bg-amber-100 text-amber-800" },
  partial: { label: "Part paid", tone: "bg-blue-100 text-blue-800" },
  upcoming: { label: "Upcoming", tone: "bg-slate-100 text-slate-700" },
};

export function PaymentSchedule({ lines, currency }: { lines: ScheduleRow[]; currency: string }) {
  const today = format(new Date(), "yyyy-MM-dd");
  const rows = lines.filter(line => line.amount > 0).map(line => ({
    ...line, ...paymentSchedulePosition(line, today),
  }));
  if (!rows.length) return <p className="py-4 text-sm text-slate-600">No payments scheduled yet.</p>;

  return <Table>
    <TableHeader className="hidden sm:table-header-group">
      <TableRow>
        <TableHead>Payment</TableHead><TableHead>Due date</TableHead>
        <TableHead className="text-right">Scheduled</TableHead><TableHead className="text-right">Paid</TableHead><TableHead className="text-right">Outstanding</TableHead>
        <TableHead>Status</TableHead>
      </TableRow>
    </TableHeader>
    <TableBody>{rows.map(row => {
      const { label, tone } = statusStyles[row.status];
      const due = format(parseISO(row.dueDate), "d MMM yyyy");
      const payment = row.type === "deposit" ? "Deposit" : row.type === "balance" ? "Final instalment" : "Instalment";
      return <TableRow key={row.id} className="grid grid-cols-3 items-center sm:table-row">
        <TableCell className="col-span-2 pb-1 font-medium sm:pb-4">
          {payment}<span className="block text-xs font-normal text-slate-600 sm:hidden">{due}</span>
        </TableCell>
        <TableCell className="hidden whitespace-nowrap sm:table-cell">{due}</TableCell>
        <TableCell className="col-start-1 row-start-2 text-right tabular-nums sm:table-cell">
          <span className="block text-xs text-slate-600 sm:hidden">Scheduled</span>{fmtMoney(row.amount, currency)}
        </TableCell>
        <TableCell className="col-start-2 row-start-2 text-right font-medium tabular-nums text-emerald-700">
          <span className="block text-xs font-normal text-slate-600 sm:hidden">Paid</span>{fmtMoney(row.paid, currency)}
        </TableCell>
        <TableCell className={`col-start-3 row-start-2 text-right font-semibold tabular-nums ${row.status === "overdue" ? "text-rose-700" : "text-slate-800"}`}>
          <span className="block text-xs font-normal text-slate-600 sm:hidden">Outstanding</span>{fmtMoney(row.open, currency)}
        </TableCell>
        <TableCell className="col-start-3 row-start-1 whitespace-nowrap pb-1 sm:pb-4"><Badge className={tone}>{label}</Badge></TableCell>
      </TableRow>;
    })}</TableBody>
  </Table>;
}
