import { and, eq, gte, inArray, lte, ne } from "drizzle-orm";
import { db } from "../db.js";
import { payrollRunEmployees, payrollRuns, payrollTaxTables } from "../../shared/schema.js";

/**
 * The two figures a payslip has to defend without being asked: what the employee has
 * been paid and taxed since the tax year started, and which table of bands produced
 * this month's PAYE.
 *
 * Both used to exist only inside the calculation, which meant a printed slip could not
 * answer the two questions an employee actually asks ("is my year-to-date right?" and
 * "what band was I taxed in?"). They live here so the PDF, the on-screen slip and the
 * payroll register all quote the same numbers instead of each deriving their own.
 */

export interface TaxYearTotals {
  runs: number;
  gross: string;
  paye: string;
  nssa: string;
  aids: string;
  net: string;
}

const EMPTY_TOTALS = (): TaxYearTotals => ({ runs: 0, gross: "0.00", paye: "0.00", nssa: "0.00", aids: "0.00", net: "0.00" });

function centsOf(value: unknown): number {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? Math.round(number * 100) : 0;
}

function moneyOf(cents: number): string {
  return (cents / 100).toFixed(2);
}

/**
 * Tax-year-to-date per employee, in the run's own currency and excluding reversed
 * runs. ZiG and USD are never summed together - they are different money, and a
 * year-to-date figure that mixes them is worse than no figure at all.
 */
export async function taxYearTotalsByEmployee(
  companyId: number,
  employeeIds: number[],
  args: { taxYear: number; currency: string }
): Promise<Map<number, TaxYearTotals>> {
  const totals = new Map<number, TaxYearTotals>();
  if (employeeIds.length === 0) return totals;

  const rows = await db
    .select({
      employeeId: payrollRunEmployees.employeeId,
      grossSalary: payrollRunEmployees.grossSalary,
      paye: payrollRunEmployees.paye,
      nssaEmployee: payrollRunEmployees.nssaEmployee,
      aidsLevy: payrollRunEmployees.aidsLevy,
      netSalary: payrollRunEmployees.netSalary,
    })
    .from(payrollRunEmployees)
    .innerJoin(payrollRuns, eq(payrollRunEmployees.payrollRunId, payrollRuns.id))
    .where(and(
      eq(payrollRuns.companyId, companyId),
      inArray(payrollRunEmployees.employeeId, employeeIds),
      eq(payrollRuns.currency, args.currency),
      ne(payrollRuns.status, "REVERSED"),
      gte(payrollRuns.periodStart, `${args.taxYear}-01-01`),
      lte(payrollRuns.periodEnd, `${args.taxYear}-12-31`)
    ));

  // Running in integer cents keeps the year-to-date exact across however many runs
  // the employee has had; float addition on the rupee/coweb amounts drifts.
  const cents = new Map<number, Record<keyof Omit<TaxYearTotals, "runs">, number>>();
  for (const row of rows) {
    const acc = cents.get(row.employeeId) ?? { gross: 0, paye: 0, nssa: 0, aids: 0, net: 0 };
    acc.gross += centsOf(row.grossSalary);
    acc.paye += centsOf(row.paye);
    acc.nssa += centsOf(row.nssaEmployee);
    acc.aids += centsOf(row.aidsLevy);
    acc.net += centsOf(row.netSalary);
    const next = totals.get(row.employeeId) ?? EMPTY_TOTALS();
    next.runs += 1;
    cents.set(row.employeeId, acc);
    totals.set(row.employeeId, next);
  }
  for (const [employeeId, acc] of cents.entries()) {
    const entry = totals.get(employeeId);
    if (!entry) continue;
    entry.gross = moneyOf(acc.gross);
    entry.paye = moneyOf(acc.paye);
    entry.nssa = moneyOf(acc.nssa);
    entry.aids = moneyOf(acc.aids);
    entry.net = moneyOf(acc.net);
  }
  return totals;
}

/**
 * Name the band table a line was calculated with, from the snapshot taken at the time
 * of the run. If the snapshot has no tax table recorded - any line calculated before
 * this was captured - that is said out loud rather than guessed at, because a payslip
 * that implies a table it did not use is a compliance problem, not a formatting one.
 */
export async function taxTableLabels(
  companyId: number,
  taxConfigIds: Array<number | null | undefined>
): Promise<Map<number, string>> {
  const ids = [...new Set(taxConfigIds.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0))];
  const labels = new Map<number, string>();
  if (ids.length === 0) return labels;

  const tables = await db
    .select({
      id: payrollTaxTables.id,
      companyId: payrollTaxTables.companyId,
      taxYear: payrollTaxTables.taxYear,
      payFrequency: payrollTaxTables.payFrequency,
      version: payrollTaxTables.version,
      effectiveFrom: payrollTaxTables.effectiveFrom,
      sourceReference: payrollTaxTables.sourceReference,
    })
    .from(payrollTaxTables)
    .where(inArray(payrollTaxTables.id, ids));

  for (const table of tables) {
    // Only this company's own tables, or the shared national ones (company_id null).
    if (table.companyId !== null && table.companyId !== companyId) continue;
    labels.set(
      table.id,
      [
        `${table.taxYear} ${table.payFrequency} bands`,
        `v${table.version}`,
        `effective ${table.effectiveFrom}`,
        table.sourceReference ? `source: ${table.sourceReference}` : null,
      ].filter(Boolean).join(" - ")
    );
  }
  return labels;
}

export const TAX_TABLE_UNRECORDED = "Tax table not recorded on this run";

export function labelForSnapshot(snapshot: any, labels: Map<number, string>): string {
  const id = Number(snapshot?.taxConfigId);
  return Number.isInteger(id) && id > 0 ? (labels.get(id) ?? TAX_TABLE_UNRECORDED) : TAX_TABLE_UNRECORDED;
}
