type PaymentLine = {
  amount: number;
  open: number;
  dueDate: string;
};

export type PaymentScheduleStatus = "paid" | "overdue" | "due" | "partial" | "upcoming";

export function paymentSchedulePosition(line: PaymentLine, today: string) {
  const amount = Math.max(0, Math.round(line.amount * 100));
  const open = Math.min(amount, Math.max(0, Math.round(line.open * 100)));
  const paid = amount - open;
  const status: PaymentScheduleStatus = open === 0 ? "paid"
    : line.dueDate < today ? "overdue"
    : line.dueDate === today ? "due"
    : paid > 0 ? "partial" : "upcoming";
  return { paid: paid / 100, open: open / 100, status };
}

export function dealScheduleSummary<T extends PaymentLine>(lines: T[], today: string) {
  let total = 0;
  let balance = 0;
  let dueToday = 0;
  let next: T | undefined;
  for (const line of lines) {
    const amount = Math.round(line.amount * 100);
    if (amount <= 0) continue;
    const open = Math.min(amount, Math.max(0, Math.round(line.open * 100)));
    total += amount;
    balance += open;
    if (line.dueDate <= today) dueToday += open;
    else if (open > 0 && (!next || line.dueDate < next.dueDate)) next = line;
  }
  return { total: total / 100, balance: balance / 100, dueToday: dueToday / 100, next };
}

export function applyReceiptsToPreview<T extends { amount: number; dueDate: string }>(lines: T[], received: number) {
  let remaining = Math.max(0, Math.round(received * 100));
  return [...lines].sort((a, b) => a.dueDate.localeCompare(b.dueDate)).map((line, index) => {
    const amount = Math.max(0, Math.round(line.amount * 100));
    const paid = Math.min(remaining, amount);
    remaining -= paid;
    return { ...line, id: index, open: (amount - paid) / 100 };
  });
}
