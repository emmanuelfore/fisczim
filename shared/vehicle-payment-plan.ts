export type VehiclePaymentTerms = {
  agreedPrice: number;
  depositAmount: number;
  months: number;
  interestType: string;
  interestRate: number;
  adminFee: number;
  startDate: string;
};

export function addVehiclePaymentMonths(iso: string, months: number): string {
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1 + months, 1));
  const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(day, lastDay));
  return date.toISOString().slice(0, 10);
}

export function calculateVehiclePaymentPlan(terms: VehiclePaymentTerms) {
  const { agreedPrice, depositAmount, months, interestType, interestRate, adminFee, startDate } = terms;
  const principal = Math.round((agreedPrice - depositAmount) * 100) / 100;
  if (principal < 0 || months < 1) {
    throw Object.assign(new Error("Deposit and term are invalid"), { status: 400 });
  }

  let financed = principal + adminFee;
  if (interestType === "fixed_amount") financed += interestRate;
  if (interestType === "flat_rate") financed += principal * (interestRate / 100) * (months / 12);
  const monthlyRate = interestType === "percent_pa" ? interestRate / 100 / 12 : 0;
  if (monthlyRate > 0) {
    const growth = Math.pow(1 + monthlyRate, months);
    financed = financed * (monthlyRate * growth) / (growth - 1) * months;
  }

  const financedCents = Math.round(financed * 100);
  const depositCents = Math.round(depositAmount * 100);
  const instalmentCents = Math.floor(financedCents / months);
  const lines = [{ type: "deposit", dueDate: startDate, amount: depositCents / 100 }];
  for (let month = 1; month <= months; month++) {
    const last = month === months;
    const cents = last ? financedCents - instalmentCents * (months - 1) : instalmentCents;
    lines.push({ type: last ? "balance" : "instalment", dueDate: addVehiclePaymentMonths(startDate, month), amount: cents / 100 });
  }
  return {
    lines,
    interest: (financedCents - Math.round((principal + adminFee) * 100)) / 100,
    total: (depositCents + financedCents) / 100,
  };
}
