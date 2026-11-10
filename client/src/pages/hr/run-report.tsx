import { useQuery } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { HRLayout } from "@/pages/hr/layout";
import { useActiveCompany } from "@/hooks/use-active-company";
import { useFiscalAuthority } from "@/hooks/use-fiscal-authority";
import { ArrowLeft, Download, Printer, FileBarChart2, Landmark } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format } from "date-fns";
import { downloadExcel } from "@/lib/export-utils";
import { PageSkeleton } from "@/components/ui/page-skeleton";
import { displayCurrency, formatMoney, sumMoney } from "@shared/currency";
import { jurisdictionForCountry, jurisdictionLevies, STATUTORY_RULE_CODES } from "@shared/statutory/jurisdictions";

// The server states this verbatim when a line was calculated without a band table
// recorded on it. Guessing a table the run did not use would be worse than saying
// it is missing, so the register passes the sentence through and styles it.
const TAX_TABLE_UNRECORDED = "Tax table not recorded on this run";

export default function HrRunReport() {
  const { runId } = useParams();
  const { activeCompany: company } = useActiveCompany();
  const companyId = company?.id;
  const fa = useFiscalAuthority();

  const { data, isLoading, isError } = useQuery<any>({
    queryKey: [`/api/companies/${companyId}/payroll/runs/${runId}/report`],
    enabled: !!companyId && !!runId,
  });

  if (isLoading) {
    return (
      <HRLayout>
        <PageSkeleton />
      </HRLayout>
    );
  }

  if (isError || !data?.run) {
    return (
      <HRLayout>
        <div className="p-8 text-center text-muted-foreground">Run report not found.</div>
      </HRLayout>
    );
  }

  const { run, lines, signoff } = data;

  // One band table for the whole register is worth a single line at the top; a run
  // where lines were calculated against different tables has to say which per line.
  const distinctTaxTableLabels: string[] = Array.from(
    new Set<string>(lines.map((l: any) => String(l.taxTableLabel ?? TAX_TABLE_UNRECORDED))),
  );
  const sharedTaxTableLabel = distinctTaxTableLabels.length === 1 ? distinctTaxTableLabels[0] : null;

  // A run is paid in one currency, so every figure on this page carries its
  // sign - "$" was wrong for loti and ZiG payslips.
  const moneyCurrency = displayCurrency(run.currency);
  const money = (v: any) => formatMoney(v, moneyCurrency);

  const sumBy = (pick: (line: any) => any) => sumMoney(lines.map(pick));
  const totals = {
    gross: sumBy((l) => l.runData.grossSalary),
    paye: sumBy((l) => l.runData.paye),
    aids: sumBy((l) => l.runData.aidsLevy),
    nssaEmp: sumBy((l) => l.runData.nssaEmployee),
    nssaEr: sumBy((l) => l.runData.nssaEmployer),
    necEmp: sumBy((l) => l.runData.necEmployee),
    necEr: sumBy((l) => l.runData.necEmployer),
    pensionEmp: sumBy((l) => l.runData.pensionEmployee),
    pensionEr: sumBy((l) => l.runData.pensionEmployer),
    deductions: sumBy((l) => l.runData.totalDeductions),
    net: sumBy((l) => l.runData.netSalary),
    employerCost: sumBy((l) => l.employerCosts?.total),
  };

  const taxes = sumMoney([totals.paye, totals.aids]);

  // Only the levies this country actually charges get their own rows and columns;
  // a Lesotho payslip has no NSSA or AIDS line to report.
  const jurisdiction = jurisdictionForCountry(company?.country);
  const levies = (ruleCode: string) => jurisdictionLevies(jurisdiction, ruleCode);

  const breakdownColumns: Array<{
    label: string;
    className?: string;
    headerClass?: string;
    ytd?: boolean;
    line: (line: any) => any;
    total: number | null;
  }> = [
    { label: "Gross", line: (l) => l.runData.grossSalary, total: totals.gross },
    { label: "Taxable Income", line: (l) => l.snapshot?.taxableIncome ?? l.runData.grossSalary, total: null },
    { label: `PAYE`, className: "text-red-600 dark:text-red-400", line: (l) => l.runData.paye, total: totals.paye },
    ...(levies(STATUTORY_RULE_CODES.nssaPobs)
      ? [{ label: "NSSA", line: (l: any) => l.runData.nssaEmployee, total: totals.nssaEmp }]
      : []),
    ...(levies(STATUTORY_RULE_CODES.aidsLevy)
      ? [{ label: "AIDS Levy", line: (l: any) => l.runData.aidsLevy, total: totals.aids }]
      : []),
    { label: "Net Pay", className: "font-bold text-emerald-600 dark:text-emerald-400", line: (l) => l.runData.netSalary, total: totals.net },
    { label: "Employer Cost", className: "text-purple-600 dark:text-purple-400", line: (l) => l.employerCosts?.total, total: totals.employerCost },
    // Year-to-date, in the run's own currency and already summed server-side -
    // never added across ZiG and USD. A compact gross / PAYE / net trio keeps the
    // existing columns readable; the table scrolls horizontally on narrow screens.
    {
      label: "YTD Gross",
      className: "border-l border-slate-200/70 dark:border-slate-800 text-slate-500 dark:text-slate-400",
      headerClass: "border-l border-slate-200/70 dark:border-slate-800",
      ytd: true,
      line: (l) => l.ytd?.gross,
      total: sumBy((l) => l.ytd?.gross),
    },
    {
      label: "YTD PAYE",
      className: "text-slate-500 dark:text-slate-400",
      ytd: true,
      line: (l) => l.ytd?.paye,
      total: sumBy((l) => l.ytd?.paye),
    },
    {
      label: "YTD Net",
      className: "text-slate-500 dark:text-slate-400",
      ytd: true,
      line: (l) => l.ytd?.net,
      total: sumBy((l) => l.ytd?.net),
    },
  ];

  const monthValue = String(run.periodEnd).slice(0, 7);
  const yearValue = String(run.periodEnd).slice(0, 4);
  const monthLabel = format(new Date(run.periodEnd), "MMMM yyyy");

  // The exports cover the whole month or year, not just this run. Pinning the
  // currency to this run's keeps the download to one return currency instead of
  // failing with MIXED_CURRENCY_PAYROLL when the period also holds ZiG or USD runs.
  const exportCurrencyQuery = `&currency=${encodeURIComponent(String(run.currency))}`;
  const exportCurrencySuffix = `_${run.currency}`;

  const printReport = () => window.print();

  return (
    <HRLayout>
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #run-report, #run-report * { visibility: visible; }
          #run-report { position: absolute; inset: 0; width: 100%; padding: 24px; }
        }
      `}</style>

      <div className="space-y-6">
        <div className="flex items-center gap-4 print:hidden">
          <Link href={`/hr/payroll/${runId}/payslips`}>
            <Button variant="outline" size="icon" className="h-9 w-9">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
              <FileBarChart2 className="h-6 w-6 text-blue-600" />
              Payroll Run Report
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {format(new Date(run.periodStart), "MMM d, yyyy")} - {format(new Date(run.periodEnd), "MMM d, yyyy")}
              {run.payFrequency ? `  •  ${run.payFrequency}` : ""}  •  {run.currency}
            </p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Link href="/hr/reports/zimra">
              <Button variant="outline">
                <Landmark className="mr-2 h-4 w-4" />
                {fa.authorityShortName} Reports
              </Button>
            </Link>
            <Button
              variant="outline"
              onClick={() => downloadExcel(`/api/companies/${companyId}/payroll/report/csv?runId=${runId}`, `payroll_report_run_${runId}.csv`)}
            >
              <Download className="mr-2 h-4 w-4" />
              Summary CSV
            </Button>
            <Button onClick={printReport} className="bg-blue-600 hover:bg-blue-700 text-white">
              <Printer className="mr-2 h-4 w-4" />
              Print Report
            </Button>
          </div>
        </div>

        {/* P2/ITF16/P6/ZIMDEF are ZIMRA filings; a Lesotho run has no equivalent
            return yet, so offering the buttons would only export the wrong form. */}
        {fa.isZimbabwe && (
          <div className="flex flex-wrap items-center gap-2 print:hidden rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/40 px-4 py-3">
            <span className="text-sm font-medium text-slate-500 mr-1">{fa.authorityShortName} exports for this run:</span>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-blue-700 dark:text-blue-400"
              title={`P2 monthly return for ${monthLabel} in ${run.currency}`}
              onClick={() => downloadExcel(`/api/companies/${companyId}/payroll/exports/p2?month=${monthValue}&format=csv${exportCurrencyQuery}`, `P2_${monthValue}${exportCurrencySuffix}.csv`)}
            >
              P2 Return (month)
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-indigo-700 dark:text-indigo-400"
              title={`ITF16 annual return for ${yearValue} in ${run.currency}`}
              onClick={() => downloadExcel(`/api/companies/${companyId}/payroll/exports/itf16?taxYear=${yearValue}${exportCurrencyQuery}`, `ITF16_${yearValue}${exportCurrencySuffix}.csv`)}
            >
              ITF16 (year)
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-amber-700 dark:text-amber-400"
              title={`P6 certificates for ${yearValue} in ${run.currency}`}
              onClick={() => downloadExcel(`/api/companies/${companyId}/payroll/exports/p6?taxYear=${yearValue}${exportCurrencyQuery}`, `P6_${yearValue}${exportCurrencySuffix}.csv`)}
            >
              P6 Certificates (year)
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-rose-700 dark:text-rose-400"
              title={`ZIMDEF & Standards Levy for ${monthLabel} in ${run.currency}`}
              onClick={() => downloadExcel(`/api/companies/${companyId}/payroll/exports/zimdef?month=${monthValue}&format=csv${exportCurrencyQuery}`, `ZIMDEF_${monthValue}${exportCurrencySuffix}.csv`)}
            >
              ZIMDEF (month)
            </Button>
          </div>
        )}

        <div id="run-report" className="space-y-6">
          <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-4">
            <div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">{company?.name || "Payroll Report"}</h2>
              <p className="text-sm text-slate-500">
                Payroll Run #{run.id} • Status: {run.status}
              </p>
            </div>
            <div className="text-right text-sm text-slate-500">
              <div>Generated {format(new Date(), "MMM d, yyyy HH:mm")}</div>
              <div>{lines.length} employee{lines.length === 1 ? "" : "s"}</div>
            </div>
          </div>

          {sharedTaxTableLabel && (
            <p
              className={
                sharedTaxTableLabel === TAX_TABLE_UNRECORDED
                  ? "text-xs font-medium text-amber-600 dark:text-amber-400"
                  : "text-xs text-slate-500 dark:text-slate-400"
              }
            >
              {sharedTaxTableLabel === TAX_TABLE_UNRECORDED
                ? "Tax table not recorded on this run — the band rates behind these PAYE figures are not evidenced here."
                : `Every line on this register was calculated with: ${sharedTaxTableLabel}`}
            </p>
          )}

          <div className="grid gap-4 md:grid-cols-5">
            <Card className="bg-blue-50/50 border-blue-100 dark:bg-blue-900/10 dark:border-blue-900/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-medium text-blue-600 dark:text-blue-400 uppercase tracking-wider">Total Gross</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-slate-900 dark:text-white">{money(totals.gross)}</div>
              </CardContent>
            </Card>
            <Card className="bg-red-50/50 border-red-100 dark:bg-red-900/10 dark:border-red-900/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-medium text-red-600 dark:text-red-400 uppercase tracking-wider">Total Taxes (PAYE+AIDS)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-slate-900 dark:text-white">{money(taxes)}</div>
              </CardContent>
            </Card>
            <Card className="bg-orange-50/50 border-orange-100 dark:bg-orange-900/10 dark:border-orange-900/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-medium text-orange-600 dark:text-orange-400 uppercase tracking-wider">Total Deductions</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-slate-900 dark:text-white">{money(totals.deductions)}</div>
              </CardContent>
            </Card>
            <Card className="bg-emerald-50/50 border-emerald-100 dark:bg-emerald-900/10 dark:border-emerald-900/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-medium text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">Total Net Pay</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-slate-900 dark:text-white">{money(totals.net)}</div>
              </CardContent>
            </Card>
            <Card className="bg-purple-50/50 border-purple-100 dark:bg-purple-900/10 dark:border-purple-900/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-medium text-purple-600 dark:text-purple-400 uppercase tracking-wider">Total Employer Cost</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-slate-900 dark:text-white">{money(totals.employerCost)}</div>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card className="border-slate-200/60 dark:border-slate-800 shadow-sm overflow-hidden">
              <CardHeader className="bg-slate-50/50 dark:bg-slate-900/20 border-b border-slate-100 dark:border-slate-800 py-3">
                <CardTitle className="text-sm">Statutory Summary</CardTitle>
                <CardDescription className="text-xs">Run-wide statutory totals</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableBody>
                    <SummaryRow label={`PAYE (${fa.authorityShortName})`} value={totals.paye} currency={moneyCurrency} />
                    {levies(STATUTORY_RULE_CODES.aidsLevy) && (
                      <SummaryRow label="AIDS Levy" value={totals.aids} currency={moneyCurrency} />
                    )}
                    {levies(STATUTORY_RULE_CODES.nssaPobs) && (
                      <>
                        <SummaryRow label="NSSA (Employee)" value={totals.nssaEmp} currency={moneyCurrency} />
                        <SummaryRow label="NSSA (Employer)" value={totals.nssaEr} currency={moneyCurrency} />
                      </>
                    )}
                    {levies(STATUTORY_RULE_CODES.nec) && (
                      <>
                        <SummaryRow label="NEC (Employee)" value={totals.necEmp} currency={moneyCurrency} />
                        <SummaryRow label="NEC (Employer)" value={totals.necEr} currency={moneyCurrency} />
                      </>
                    )}
                    {levies(STATUTORY_RULE_CODES.pension) && (
                      <>
                        <SummaryRow label="Pension (Employee)" value={totals.pensionEmp} currency={moneyCurrency} />
                        <SummaryRow label="Pension (Employer)" value={totals.pensionEr} currency={moneyCurrency} />
                      </>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card className="border-slate-200/60 dark:border-slate-800 shadow-sm overflow-hidden">
              <CardHeader className="bg-slate-50/50 dark:bg-slate-900/20 border-b border-slate-100 dark:border-slate-800 py-3">
                <CardTitle className="text-sm">Employer Contributions</CardTitle>
                <CardDescription className="text-xs">Costs borne by the employer</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableBody>
                    {levies(STATUTORY_RULE_CODES.zimdef) && (
                      <SummaryRow label="ZIMDEF (1%)" value={sumBy((l) => l.employerCosts?.zimdef)} currency={moneyCurrency} />
                    )}
                    {levies(STATUTORY_RULE_CODES.standardsLevy) && (
                      <SummaryRow label="Standards Development Levy (0.5%)" value={sumBy((l) => l.employerCosts?.standardsLevy)} currency={moneyCurrency} />
                    )}
                    {levies(STATUTORY_RULE_CODES.apwcs) && (
                      <SummaryRow label="APWCS" value={sumBy((l) => l.employerCosts?.apwcs)} currency={moneyCurrency} />
                    )}
                    {levies(STATUTORY_RULE_CODES.nssaPobs) && (
                      <SummaryRow label="NSSA (Employer)" value={totals.nssaEr} currency={moneyCurrency} />
                    )}
                    {levies(STATUTORY_RULE_CODES.nec) && (
                      <SummaryRow label="NEC (Employer)" value={totals.necEr} currency={moneyCurrency} />
                    )}
                    {levies(STATUTORY_RULE_CODES.pension) && (
                      <SummaryRow label="Pension (Employer)" value={totals.pensionEr} currency={moneyCurrency} />
                    )}
                    <SummaryRow label="Total Employer Cost" value={totals.employerCost} currency={moneyCurrency} emphasized />
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>

          <Card className="border-slate-200/60 dark:border-slate-800 shadow-sm overflow-hidden">
            <CardHeader className="bg-slate-50/50 dark:bg-slate-900/20 border-b border-slate-100 dark:border-slate-800 py-3">
              <CardTitle className="text-sm">Employee Breakdown</CardTitle>
              <CardDescription className="text-xs">
                Per-employee earnings, deductions and employer cost, with year-to-date in {moneyCurrency} -
                this run's currency only, ZiG and USD totals are never added together.
              </CardDescription>
            </CardHeader>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    {breakdownColumns.map((column) => (
                      <TableHead key={column.label} className={`text-right ${column.headerClass ?? ""}`}>{column.label}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lines.map((l: any) => (
                    <TableRow key={l.runData.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                      <TableCell>
                        <div className="font-medium text-slate-900 dark:text-white">
                          {l.employee.firstName} {l.employee.lastName}
                        </div>
                        <div className="text-xs text-slate-500">{l.employee.employeeNumber}</div>
                        {/* Lines taxed against different tables name their own; a shared
                            table is stated once above the register instead. */}
                        {!sharedTaxTableLabel && (
                          <div
                            className={
                              l.taxTableLabel === TAX_TABLE_UNRECORDED
                                ? "text-[11px] font-medium text-amber-600 dark:text-amber-400 mt-0.5"
                                : "text-[11px] text-slate-400 dark:text-slate-500 mt-0.5"
                            }
                          >
                            {l.taxTableLabel}
                          </div>
                        )}
                      </TableCell>
                      {breakdownColumns.map((column) => (
                        <TableCell key={column.label} className={`text-right ${column.className ?? ""}`}>
                          {column.ytd && !l.ytd ? (
                            // No history in this currency for this employee - an em dash,
                            // not a zero a manager would have to explain.
                            <span className="text-slate-400 dark:text-slate-500">—</span>
                          ) : (
                            money(column.line(l))
                          )}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                  <TableRow className="bg-slate-50 dark:bg-slate-900/50 font-bold">
                    <TableCell>Total</TableCell>
                    {breakdownColumns.map((column) => (
                      <TableCell key={column.label} className="text-right">
                        {column.total === null ? "" : money(column.total)}
                      </TableCell>
                    ))}
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          </Card>

          {/* The register is signed before it is filed. Prepared-by and date stay as
              blank ruled lines to be written in by hand; approval and lock are only
              blank when the run genuinely has no recorded sign-off. */}
          <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 p-6">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">Sign-off</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 mb-6">
              Keep this page with the payroll records for {monthLabel}.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-10 gap-y-6">
              <SignoffField label="Prepared by" />
              <SignoffField label="Date" />
              <SignoffField
                label="Approval"
                filled={
                  signoff?.approvedBy
                    ? `Approved by ${signoff.approvedBy}${signoff.approvedAt ? ` on ${format(new Date(signoff.approvedAt), "MMM d, yyyy")}` : ""}`
                    : null
                }
              />
              <SignoffField
                label="Lock"
                filled={
                  signoff?.lockedBy
                    ? `Locked by ${signoff.lockedBy}${signoff.lockedAt ? ` on ${format(new Date(signoff.lockedAt), "MMM d, yyyy")}` : ""}`
                    : null
                }
              />
            </div>
          </div>
        </div>
      </div>
    </HRLayout>
  );
}

function SignoffField({ label, filled }: { label: string; filled?: string | null }) {
  return (
    <div>
      <div className="h-8 flex items-end border-b border-slate-400 dark:border-slate-600">
        {filled ? (
          <span className="text-sm font-medium text-slate-900 dark:text-white truncate" title={filled}>
            {filled}
          </span>
        ) : null}
      </div>
      <div className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400 mt-1.5">{label}</div>
    </div>
  );
}

function SummaryRow({ label, value, currency, emphasized }: { label: string; value: number; currency: string; emphasized?: boolean }) {
  return (
    <TableRow className={emphasized ? "bg-purple-50/50 dark:bg-purple-900/10 font-bold" : ""}>
      <TableCell className={emphasized ? "text-purple-700 dark:text-purple-300" : "text-slate-600 dark:text-slate-300"}>{label}</TableCell>
      <TableCell className={`text-right font-mono ${emphasized ? "text-purple-700 dark:text-purple-300" : ""}`}>
        {formatMoney(value, currency)}
      </TableCell>
    </TableRow>
  );
}
