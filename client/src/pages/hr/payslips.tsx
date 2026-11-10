import { useQuery } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { HRLayout } from "@/pages/hr/layout";
import { useActiveCompany } from "@/hooks/use-active-company";
import { useFiscalAuthority } from "@/hooks/use-fiscal-authority";
import { Loader2, ArrowLeft, Download, FileText, ChevronDown, ChevronRight, Banknote, Landmark, FileBarChart2, Printer, Mail, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useState } from "react";
import { format } from "date-fns";
import { downloadExcel } from "@/lib/export-utils";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { PageSkeleton } from "@/components/ui/page-skeleton";
import { displayCurrency, formatMoney, sumMoney } from "@shared/currency";
import { jurisdictionForCountry, jurisdictionLevies, STATUTORY_RULE_CODES } from "@shared/statutory/jurisdictions";

/** Payslip text reaches a print window as HTML, so quotes and tags must not survive. */
function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Amounts arrive as decimal strings, so differences are taken in integer cents to
// keep a payslip's listed lines adding up to the cent the run header reports.
const num = (value: unknown): number => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};
const cents = (value: unknown): number => Math.round(num(value) * 100);
const fromCents = (value: number): number => value / 100;

// The server says this out loud when a line was calculated without a band table
// being recorded on it - never guess a table the run did not use.
const TAX_TABLE_UNRECORDED = "Tax table not recorded on this run";

export default function HRPayslips() {
  const { runId } = useParams();
  const { activeCompany: company } = useActiveCompany();
  const companyId = company?.id;
  const fa = useFiscalAuthority();

  const { data, isLoading } = useQuery<any>({
    queryKey: [`/api/companies/${companyId}/payroll/runs/${runId}/payslips`],
    enabled: !!companyId && !!runId,
  });

  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [emailBusy, setEmailBusy] = useState<number[] | "all" | null>(null);
  const { toast } = useToast();

  if (isLoading) {
    return (
      <HRLayout>
        <PageSkeleton />
      </HRLayout>
    );
  }

  if (!data?.run) {
    return (
      <HRLayout>
        <div className="p-8 text-center text-muted-foreground">Run not found.</div>
      </HRLayout>
    );
  }

  const { run, payslips } = data;

  const jurisdiction = jurisdictionForCountry(company?.country);
  const levies = (ruleCode: string) => jurisdictionLevies(jurisdiction, ruleCode);
  // A SPLIT run pays each line in two currencies but still stores its columns in
  // the USD base, so the payslip prints dollars and names the ZiG share below.
  const runMoney = (value: any) => formatMoney(value, displayCurrency(run.currency));

  // The year-to-date arrives already summed in the run's own currency - ZiG and USD
  // are different money and are never added together - so the screen labels it with
  // that currency instead of converting anything.
  const taxYear = String(run.periodEnd).slice(0, 4);
  const ytdCurrency = displayCurrency(run.currency);
  const ytdTitle = `Year to date · ${taxYear} · ${ytdCurrency}`;

  const statutoryRows = (p: any) => {
    const d = p.runData;
    const rows: Array<{ label: string; value: any }> = [
      { label: `PAYE (${fa.authorityShortName})`, value: d.paye },
    ];
    if (levies(STATUTORY_RULE_CODES.nssaPobs)) rows.push({ label: "NSSA", value: d.nssaEmployee });
    if (levies(STATUTORY_RULE_CODES.aidsLevy)) rows.push({ label: "AIDS Levy", value: d.aidsLevy });
    if (levies(STATUTORY_RULE_CODES.nec)) rows.push({ label: "NEC (Employee)", value: d.necEmployee });
    if (levies(STATUTORY_RULE_CODES.pension)) rows.push({ label: "Pension (Employee)", value: d.pensionEmployee });
    return rows;
  };

  // totalDeductions is what the engine charged; the statutory rows alone leave out
  // loans and garnishees, so the difference is shown as its own line instead of
  // silently dropping - otherwise gross minus the listed deductions != net pay.
  const otherDeductions = (p: any) => {
    const listed = statutoryRows(p).reduce((acc: number, row) => acc + cents(row.value), 0);
    return fromCents(cents(p.runData.totalDeductions) - listed);
  };

  const allowancesOf = (p: any) => fromCents(cents(p.runData.grossSalary) - cents(p.runData.basicSalary));

  // "Taxes" is what leaves the payslip for the revenue authority, so it follows the
  // levies this country charges instead of assuming PAYE plus the AIDS levy.
  const taxesOf = (p: any) => fromCents(
    cents(p.runData.paye) + (levies(STATUTORY_RULE_CODES.aidsLevy) ? cents(p.runData.aidsLevy) : 0),
  );
  const totalTaxes = fromCents(payslips.reduce((acc: number, p: any) => acc + cents(taxesOf(p)), 0));

  // The server refuses a bank file for anything else; the button says so first.
  const isPayable = ["APPROVED", "LOCKED"].includes(run.status);

  const buildPayslipHtml = (p: any) => {
    const money = (value: unknown) => escapeHtml(runMoney(value));
    const rows = statutoryRows(p);
    const other = otherDeductions(p);
    const netZig = num(p.runData.netSalaryZig);
    const allowances = allowancesOf(p);

    return `
      <div class="payslip">
        <div class="header">
          <h1 class="title">PAYSLIP</h1>
          <p class="company">${escapeHtml(company?.name || "Company Name")}</p>
          <p class="company">${escapeHtml(format(new Date(run.periodStart), "MMMM yyyy"))}</p>
        </div>

        <div class="grid">
          <div class="col">
            <div class="label">Employee Name</div>
            <div class="value">${escapeHtml(`${p.employee.firstName} ${p.employee.lastName}`)}</div>
            <div class="label">Employee ID</div>
            <div class="value">${escapeHtml(p.employee.employeeNumber)}</div>
          </div>
          <div class="col">
            <div class="label">National ID</div>
            <div class="value">${escapeHtml(p.employee.nationalId || "-")}</div>
            <div class="label">Bank Account</div>
            <div class="value">${escapeHtml(`${p.employee.bankName || "-"} (${p.employee.bankAccountNumber || "-"})`)}</div>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th>Earnings</th>
              <th class="amount">Amount</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Basic Salary</td>
              <td class="amount">${money(p.runData.basicSalary)}</td>
            </tr>
            ${allowances > 0 ? `
            <tr>
              <td>Allowances</td>
              <td class="amount">${money(allowances)}</td>
            </tr>` : ""}
            <tr class="total-row">
              <td>Gross Earnings</td>
              <td class="amount">${money(p.runData.grossSalary)}</td>
            </tr>
          </tbody>
        </table>

        <table>
          <thead>
            <tr>
              <th>Deductions</th>
              <th class="amount">Amount</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map((row) => `
            <tr>
              <td>${escapeHtml(row.label)}</td>
              <td class="amount">${money(row.value)}</td>
            </tr>`).join("")}
            ${Math.abs(other) > 0.004 ? `
            <tr>
              <td>Other Deductions</td>
              <td class="amount">${money(other)}</td>
            </tr>` : ""}
            <tr class="total-row">
              <td>Total Deductions</td>
              <td class="amount">${money(p.runData.totalDeductions)}</td>
            </tr>
          </tbody>
        </table>

        <div class="net-pay">
          Net Pay: ${money(p.runData.netSalary)}
        </div>
        ${run.currency === "SPLIT" && netZig > 0 ? `
        <div class="split">
          Paid in two currencies: ${money(p.runData.netSalaryUsd)} and ${escapeHtml(formatMoney(netZig, "ZWG"))}
        </div>` : ""}

        <div class="ytd">
          <div class="ytd-title">${escapeHtml(ytdTitle)}${p.ytd ? ` — ${p.ytd.runs} run${p.ytd.runs === 1 ? "" : "s"}` : ""}</div>
          ${p.ytd ? `
          <div class="grid">
            <div class="col">
              <div class="label">Gross</div>
              <div class="value">${money(p.ytd.gross)}</div>
            </div>
            <div class="col">
              <div class="label">PAYE</div>
              <div class="value">${money(p.ytd.paye)}</div>
            </div>
            <div class="col">
              <div class="label">NSSA</div>
              <div class="value">${money(p.ytd.nssa)}</div>
            </div>
            <div class="col">
              <div class="label">AIDS levy</div>
              <div class="value">${money(p.ytd.aids)}</div>
            </div>
            <div class="col">
              <div class="label">Net</div>
              <div class="value">${money(p.ytd.net)}</div>
            </div>
          </div>` : `
          <div class="ytd-empty">There is no year-to-date history in ${escapeHtml(ytdCurrency)} for the ${escapeHtml(taxYear)} tax year yet - this is the earliest run of the year on record.</div>`}
        </div>

        <div class="tax-table${p.taxTableLabel === TAX_TABLE_UNRECORDED ? " tax-table-unrecorded" : ""}">
          Tax table used for this month's PAYE: ${escapeHtml(p.taxTableLabel)}
        </div>

        <div class="signoff">
          <div class="sig">
            <div class="sig-line"></div>
            <div class="sig-label">Received by (name and signature)</div>
          </div>
          <div class="sig">
            <div class="sig-line"></div>
            <div class="sig-label">Date</div>
          </div>
        </div>
      </div>
    `;
  };

  const printHtml = (innerHtml: string, title: string) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const html = `
      <html>
        <head>
          <title>${escapeHtml(title)}</title>
          <style>
            body { font-family: system-ui, sans-serif; line-height: 1.5; padding: 40px; color: #1e293b; }
            .payslip { margin: 0 0 40px 0; }
            .payslip + .payslip { page-break-before: always; }
            .header { text-align: center; margin-bottom: 40px; border-bottom: 2px solid #e2e8f0; padding-bottom: 20px; }
            .title { font-size: 24px; font-weight: bold; margin: 0 0 10px 0; }
            .company { font-size: 18px; color: #64748b; margin: 0; }
            .grid { display: flex; justify-content: space-between; margin-bottom: 40px; }
            .col { flex: 1; }
            .label { font-size: 12px; color: #64748b; text-transform: uppercase; font-weight: 600; letter-spacing: 0.05em; }
            .value { font-size: 16px; font-weight: 500; margin-bottom: 15px; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
            th, td { padding: 12px; text-align: left; border-bottom: 1px solid #e2e8f0; }
            th { font-size: 13px; text-transform: uppercase; color: #64748b; font-weight: 600; background: #f8fafc; }
            .amount { text-align: right; }
            .total-row { font-weight: bold; font-size: 16px; background: #f8fafc; }
            .net-pay { font-size: 20px; font-weight: bold; color: #0f172a; text-align: right; margin-top: 20px; padding: 20px; background: #f1f5f9; border-radius: 8px; }
            .split { font-size: 14px; color: #475569; text-align: right; margin-top: 8px; }
            .ytd { margin-top: 30px; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px; }
            .ytd-title { font-size: 12px; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 16px; }
            .ytd .grid { margin-bottom: 0; }
            .ytd .value { margin-bottom: 0; font-size: 14px; }
            .ytd-empty { font-size: 13px; color: #64748b; }
            .tax-table { font-size: 12px; color: #64748b; margin-top: 16px; }
            .tax-table-unrecorded { color: #b45309; font-weight: 600; }
            .signoff { display: flex; justify-content: space-between; gap: 60px; margin-top: 56px; }
            .sig { flex: 1; }
            .sig-line { border-bottom: 1px solid #475569; height: 32px; }
            .sig-label { font-size: 11px; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; margin-top: 6px; }
            @media print { body { padding: 0; } }
          </style>
        </head>
        <body>
          ${innerHtml}
        </body>
      </html>
    `;

    printWindow.document.write(html);
    printWindow.document.close();
    setTimeout(() => {
      printWindow.print();
    }, 500);
  };

  const handlePrint = (p: any) => {
    printHtml(buildPayslipHtml(p), `Payslip - ${p.employee.firstName} ${p.employee.lastName}`);
  };

  const printAll = () => {
    const innerHtml = payslips.map((p: any) => buildPayslipHtml(p)).join('\n');
    printHtml(innerHtml, `Payslips - ${run.periodStart} to ${run.periodEnd}`);
  };

  const emailPayslips = async (employeeIds?: number[]) => {
    const count = employeeIds ? employeeIds.length : payslips.length;
    if (!count) return;
    if (!window.confirm(
      employeeIds
        ? `Email this payslip (${count})?`
        : `Email ${count} payslip${count === 1 ? '' : 's'} to all employees with a registered email address?`
    )) return;

    setEmailBusy(employeeIds ? employeeIds : "all");
    try {
      const res = await apiRequest("POST", `/api/companies/${companyId}/payroll/runs/${runId}/email-payslips`, { employeeIds });
      const result = await res.json();
      const parts = [`Sent: ${result.sent.length}`];
      if (result.skipped.length) parts.push(`skipped ${result.skipped.length} (no email)`);
      if (result.failed.length) parts.push(`failed ${result.failed.length}`);
      toast({ title: "Payslips emailed", description: parts.join(', ') });
    } catch (err: any) {
      toast({ title: "Email failed", description: err.message || "Something went wrong", variant: "destructive" });
    } finally {
      setEmailBusy(null);
    }
  };

  return (
    <HRLayout>
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Link href="/hr/payroll">
            <Button variant="outline" size="icon" className="h-9 w-9">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
              Payroll Run Details
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Period: {format(new Date(run.periodStart), 'MMM d, yyyy')} - {format(new Date(run.periodEnd), 'MMM d, yyyy')}
            </p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Button
              variant="outline"
              onClick={printAll}
              disabled={!payslips?.length}
            >
              <Printer className="mr-2 h-4 w-4" />
              Print All
            </Button>
            <Button
              variant="outline"
              onClick={() => emailPayslips()}
              disabled={emailBusy !== null || !payslips?.length}
            >
              {emailBusy === "all" ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Mail className="mr-2 h-4 w-4" />
              )}
              Email All
            </Button>
            <Link href={`/hr/payroll/${runId}/report`}>
              <Button variant="outline" className="text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800 hover:bg-blue-50 dark:hover:bg-blue-900/20">
                <FileBarChart2 className="mr-2 h-4 w-4" />
                Run Report
              </Button>
            </Link>
            <Button
              variant="outline"
              onClick={() => {
                downloadExcel(`/api/companies/${companyId}/payroll/report/csv?runId=${runId}`, `payroll_report_run_${runId}.csv`);
              }}
            >
              <Download className="mr-2 h-4 w-4" />
              Summary CSV
            </Button>
            <Button
              onClick={() => {
                downloadExcel(`/api/companies/${companyId}/payroll/runs/${runId}/bank-export`, `bank_export_${runId}.csv`);
              }}
              disabled={!isPayable}
              title={isPayable ? "Download the payment file for the bank" : "Approve or lock the run before exporting a payment file"}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              <Download className="mr-2 h-4 w-4" />
              Export Bank File
            </Button>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          <Card className="bg-blue-50/50 border-blue-100 dark:bg-blue-900/10 dark:border-blue-900/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium text-blue-600 dark:text-blue-400 uppercase tracking-wider">Total Gross</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-slate-900 dark:text-white">{runMoney(run.totalGross)}</div>
            </CardContent>
          </Card>
          <Card className="bg-red-50/50 border-red-100 dark:bg-red-900/10 dark:border-red-900/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium text-red-600 dark:text-red-400 uppercase tracking-wider">Total Taxes</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-slate-900 dark:text-white">{runMoney(totalTaxes)}</div>
            </CardContent>
          </Card>
          <Card className="bg-orange-50/50 border-orange-100 dark:bg-orange-900/10 dark:border-orange-900/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium text-orange-600 dark:text-orange-400 uppercase tracking-wider">Total Deductions</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-slate-900 dark:text-white">{runMoney(run.totalDeductions)}</div>
            </CardContent>
          </Card>
          <Card className="bg-emerald-50/50 border-emerald-100 dark:bg-emerald-900/10 dark:border-emerald-900/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">Total Net Pay</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-slate-900 dark:text-white">{runMoney(run.totalNet)}</div>
            </CardContent>
          </Card>
        </div>

        <Card className="border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-slate-50 dark:bg-slate-900/50">
                <TableRow>
                  <TableHead className="w-[40px]"></TableHead>
                  <TableHead>Employee</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead className="text-right">Gross Pay</TableHead>
                  <TableHead className="text-right">Taxes</TableHead>
                  <TableHead className="text-right">Net Pay</TableHead>
                  <TableHead className="text-right pr-6">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payslips?.map((p: any) => (
                  <>
                    <TableRow 
                      key={p.runData.id}
                      className={`cursor-pointer transition-colors hover:bg-slate-50 dark:hover:bg-slate-900/50 ${expandedId === p.runData.id ? 'bg-blue-50/30 dark:bg-blue-900/10' : ''}`}
                      onClick={() => setExpandedId(expandedId === p.runData.id ? null : p.runData.id)}
                    >
                      <TableCell>
                        {expandedId === p.runData.id ? (
                          <ChevronDown className="h-4 w-4 text-slate-500" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-slate-500" />
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="font-medium text-slate-900 dark:text-white">
                          {p.employee.firstName} {p.employee.lastName}
                        </div>
                        <div className="text-xs text-slate-500">{p.employee.employeeNumber}</div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">{p.employee.nationalId || '-'}</div>
                      </TableCell>
                      <TableCell className="text-right font-medium text-slate-700 dark:text-slate-300">
                        {runMoney(p.runData.grossSalary)}
                      </TableCell>
                      <TableCell className="text-right text-red-600 dark:text-red-400">
                        {runMoney(taxesOf(p))}
                      </TableCell>
                      <TableCell className="text-right font-bold text-emerald-600 dark:text-emerald-400">
                        {runMoney(p.runData.netSalary)}
                      </TableCell>
                      <TableCell className="text-right pr-6" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1">
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="h-8 hover:bg-blue-100 hover:text-blue-700 dark:hover:bg-blue-900/50 dark:hover:text-blue-400"
                            onClick={() => handlePrint(p)}
                          >
                            <FileText className="mr-2 h-4 w-4" />
                            Print
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="h-8 hover:bg-emerald-100 hover:text-emerald-700 dark:hover:bg-emerald-900/50 dark:hover:text-emerald-400"
                            disabled={emailBusy !== null}
                            onClick={() => emailPayslips([p.employee.id])}
                          >
                            {emailBusy !== null && Array.isArray(emailBusy) && emailBusy[0] === p.employee.id ? (
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                              <Mail className="mr-2 h-4 w-4" />
                            )}
                            Email
                          </Button>
                          <Button 
                            variant="outline" 
                            size="sm" 
                            className="h-8 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800 hover:bg-blue-50 dark:hover:bg-blue-900/20"
                            onClick={() => downloadExcel(
                              `/api/companies/${companyId}/payroll/report/payslip/${p.employee.id}?runId=${runId}`,
                              `payslip_${p.employee.employeeNumber || p.employee.id}_${run.periodStart.slice(0, 7)}.pdf`
                            )}
                          >
                            <Download className="mr-2 h-4 w-4" />
                            PDF
                          </Button>
                          {fa.isZimbabwe && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 text-amber-600 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/50"
                              title="Download P6 annual certificate for this employee"
                              onClick={() => downloadExcel(
                                `/api/companies/${companyId}/payroll/exports/p6?taxYear=${new Date(run.periodEnd).getFullYear()}&employeeId=${p.employee.id}`,
                                `P6_${p.employee.employeeNumber || p.employee.id}_${new Date(run.periodEnd).getFullYear()}.csv`
                              )}
                            >
                              <FileBarChart2 className="mr-2 h-4 w-4" />
                              P6
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                    
                    {expandedId === p.runData.id && (
                      <TableRow className="bg-slate-50/50 dark:bg-slate-900/20 border-b-2 border-slate-200">
                        <TableCell colSpan={7} className="p-0">
                          <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-8">
                            <div>
                              <h4 className="text-sm font-bold text-slate-900 dark:text-white mb-4 flex items-center border-b pb-2">
                                <Banknote className="mr-2 h-4 w-4 text-emerald-500" />
                                Earnings Breakdown
                              </h4>
                              <div className="space-y-3">
                                <div className="flex justify-between text-sm">
                                  <span className="text-slate-600 dark:text-slate-400">Basic Salary</span>
                                  <span className="font-medium">{runMoney(p.runData.basicSalary)}</span>
                                </div>
                                {allowancesOf(p) > 0 && (
                                  <div className="flex justify-between text-sm">
                                    <span className="text-slate-600 dark:text-slate-400">Allowances & Bonuses</span>
                                    <span className="font-medium">{runMoney(allowancesOf(p))}</span>
                                  </div>
                                )}
                                <div className="flex justify-between text-sm font-bold pt-2 border-t mt-2">
                                  <span>Total Gross</span>
                                  <span>{runMoney(p.runData.grossSalary)}</span>
                                </div>
                              </div>
                            </div>

                            <div>
                              <h4 className="text-sm font-bold text-slate-900 dark:text-white mb-4 flex items-center border-b pb-2">
                                <Landmark className="mr-2 h-4 w-4 text-red-500" />
                                Deductions Breakdown
                              </h4>
                              <div className="space-y-3">
                                {statutoryRows(p).map((row) => (
                                  <div key={row.label} className="flex justify-between text-sm">
                                    <span className="text-slate-600 dark:text-slate-400">{row.label}</span>
                                    <span className="font-medium text-red-600">{runMoney(row.value)}</span>
                                  </div>
                                ))}
                                {Math.abs(otherDeductions(p)) > 0.004 && (
                                  <div className="flex justify-between text-sm">
                                    <span className="text-slate-600 dark:text-slate-400">Other Deductions</span>
                                    <span className="font-medium text-red-600">{runMoney(otherDeductions(p))}</span>
                                  </div>
                                )}
                                <div className="flex justify-between text-sm font-bold pt-2 border-t mt-2">
                                  <span>Total Deductions</span>
                                  <span className="text-red-600">{runMoney(p.runData.totalDeductions)}</span>
                                </div>
                                <div className="flex justify-between text-sm font-bold">
                                  <span>Net Pay</span>
                                  <span className="text-emerald-600">{runMoney(p.runData.netSalary)}</span>
                                </div>
                                {/* The band table behind this month's PAYE, so "what band
                                    was I taxed in?" is answerable on screen, and the
                                    unrecorded case says so instead of guessing. */}
                                <p
                                  className={
                                    p.taxTableLabel === TAX_TABLE_UNRECORDED
                                      ? "text-xs font-medium text-amber-600 dark:text-amber-400 pt-3 border-t border-slate-200/60 dark:border-slate-800"
                                      : "text-xs text-slate-500 dark:text-slate-400 pt-3 border-t border-slate-200/60 dark:border-slate-800"
                                  }
                                >
                                  Tax table used for PAYE: {p.taxTableLabel}
                                </p>
                              </div>
                            </div>

                            <div>
                              <h4 className="text-sm font-bold text-slate-900 dark:text-white mb-4 flex items-center border-b pb-2">
                                <TrendingUp className="mr-2 h-4 w-4 text-blue-500" />
                                {ytdTitle}
                              </h4>
                              {p.ytd ? (
                                <div className="space-y-3">
                                  <div className="text-xs text-slate-500 dark:text-slate-400">
                                    Across {p.ytd.runs} run{p.ytd.runs === 1 ? "" : "s"} in {ytdCurrency}, in this run's currency only.
                                  </div>
                                  {[
                                    { label: "Gross", value: p.ytd.gross },
                                    { label: "PAYE", value: p.ytd.paye },
                                    { label: "NSSA", value: p.ytd.nssa },
                                    { label: "AIDS levy", value: p.ytd.aids },
                                    { label: "Net", value: p.ytd.net },
                                  ].map((row) => (
                                    <div key={row.label} className="flex justify-between text-sm">
                                      <span className="text-slate-600 dark:text-slate-400">{row.label}</span>
                                      <span className="font-medium">{runMoney(row.value)}</span>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <p className="text-sm text-slate-500 dark:text-slate-400">
                                  There is no year-to-date history in {ytdCurrency} for the {taxYear} tax year yet —
                                  this is the earliest run of the year on record.
                                </p>
                              )}
                            </div>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      </div>
    </HRLayout>
  );
}
