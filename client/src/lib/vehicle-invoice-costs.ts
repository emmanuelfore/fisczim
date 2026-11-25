export type VehicleInvoiceCost = {
  id: number;
  category: string;
  description?: string | null;
  status?: string | null;
  includeInCustomerStatement?: boolean | null;
  customerChargeBaseAmount?: string | number | null;
  baseAmount?: string | number | null;
};

export function vehicleDealTotals(costs: { amount: number }[], fee: number, deal?: {
  price: string;
  paid: number;
  status: string;
  scheduleTotal: string | null;
}) {
  if (!deal) return [];
  const itemized = Math.round((costs.reduce((sum, cost) => sum + cost.amount, 0) + fee) * 100) / 100;
  const price = Number(deal.price);
  const difference = Math.round((price - itemized) * 100) / 100;
  const total = Number(deal.scheduleTotal ?? price);
  return [
    { label: "Processing fee", amount: fee },
    { label: "Itemized vehicle total", amount: itemized },
    ...(difference ? [{ label: "Difference from itemized total", amount: difference }] : []),
    { label: deal.status === "draft" ? "Draft agreement price" : "Agreement price", amount: price },
    ...(deal.scheduleTotal != null ? [{ label: "Total on payment plan", amount: total }] : []),
    { label: "Customer payments received", amount: deal.paid },
    { label: total >= deal.paid ? "Remaining agreement balance" : "Customer credit", amount: Math.abs(total - deal.paid) },
  ];
}

export function vehicleInvoiceDisbursements(
  costs: VehicleInvoiceCost[] | undefined,
  exchangeRate: string | number | null | undefined,
) {
  const rate = Number(exchangeRate) || 1;
  return (costs ?? [])
    .filter(cost => cost.includeInCustomerStatement === true && cost.status !== "cancelled")
    .map(cost => ({
      id: cost.id,
      description: [cost.category.replace(/_/g, " "), cost.description].filter(Boolean).join(" — "),
      amount: Math.round(Number(cost.customerChargeBaseAmount ?? cost.baseAmount ?? 0) * rate * 100) / 100,
    }));
}
