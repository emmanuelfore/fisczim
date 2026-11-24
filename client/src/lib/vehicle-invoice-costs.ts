export type VehicleInvoiceCost = {
  id: number;
  category: string;
  description?: string | null;
  status?: string | null;
  includeInCustomerStatement?: boolean | null;
  customerChargeBaseAmount?: string | number | null;
  baseAmount?: string | number | null;
};

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
