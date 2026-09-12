import { useQuery } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { HRLayout } from "@/pages/hr/layout";
import { useActiveCompany } from "@/hooks/use-active-company";
import { Loader2, ArrowLeft, Download, Printer, FileBarChart2, Landmark } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format } from "date-fns";
import { downloadExcel } from "@/lib/export-utils";

const money = (v: any) =>
  Number(v || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function HrRunReport() {
  const { runId } = useParams();
  const { activeCompany: company } = useActiveCompany();
  const companyId = company?.id;

  const { data, isLoading, isError } = useQuery<any>({
    queryKey: [`/api/companies/${companyId}/payroll/runs/${runId}/report`],
    enabled: !!companyId && !!runId,
  });

  if (isLoading) {
    return (
      <HRLayout>
        <div className="flex h-96 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        </div>
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

  const { run, lines } = data;

  const totals = lines.reduce((acc: any, l: any) => {
    acc.gross += Number(l.runData.grossSalary) || 0;
    acc.paye += Number(l.runData.paye) || 0;
    acc.aids += Number(l.runData.aidsLevy) || 0;
    acc.nssaEmp += Number(l.runData.nssaEmployee) || 0;
    acc.nssaEr += Number(l.runData.nssaEmployer) || 0;
    acc.necEmp += Number(l.runData.necEmployee) || 0;
    acc.necEr += Number(l.runData.necEmployer) || 0;
    acc.pensionEmp += Number(l.runData.pensionEmployee) || 0;
    acc.pensionEr += Number(l.runData.pensionEmployer) || 0;
    acc.deductions += Number(l.runData.totalDeductions) || 0;
    acc.net += Number(l.runData.netSalary) || 0;
    acc.employerCost += Number(l.employerCosts?.total) || 0;
    return acc;
  }, {
    gross: 0, paye: 0, aids: 0, nssaEmp: 0, nssaEr: 0, necEmp: 0, necEr: 0,
    pensionEmp: 0, pensionEr: 0, deductions: 0, net: 0, employerCost: 0,
  });

  const taxes = totals.paye + totals.aids;

  const monthValue = String(run.periodEnd).slice(0, 7);
  const yearValue = String(run.periodEnd).slice(0, 4);
  const monthLabel = format(new Date(run.periodEnd), "MMMM yyyy");

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
                ZIMRA Reports
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

        <div className="flex flex-wrap items-center gap-2 print:hidden rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/40 px-4 py-3">
          <span className="text-sm font-medium text-slate-500 mr-1">ZIMRA exports for this run:</span>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-blue-700 dark:text-blue-400"
            title={`P2 monthly return for ${monthLabel}`}
            onClick={() => downloadExcel(`/api/companies/${companyId}/payroll/exports/p2?month=${monthValue}&format=csv`, `P2_${monthValue}.csv`)}
          >
            P2 Return (month)
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-indigo-700 dark:text-indigo-400"
            title={`ITF16 annual return for ${yearValue}`}
            onClick={() => downloadExcel(`/api/companies/${companyId}/payroll/exports/itf16?taxYear=${yearValue}`, `ITF16_${yearValue}.csv`)}
          >
            ITF16 (year)
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-amber-700 dark:text-amber-400"
            title={`P6 certificates for ${yearValue}`}
            onClick={() => downloadExcel(`/api/companies/${companyId}/payroll/exports/p6?taxYear=${yearValue}`, `P6_${yearValue}.csv`)}
          >
            P6 Certificates (year)
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-rose-700 dark:text-rose-400"
            title={`ZIMDEF & Standards Levy for ${monthLabel}`}
            onClick={() => downloadExcel(`/api/companies/${companyId}/payroll/exports/zimdef?month=${monthValue}&format=csv`, `ZIMDEF_${monthValue}.csv`)}
          >
            ZIMDEF (month)
          </Button>
        </div>

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

          <div className="grid gap-4 md:grid-cols-5">
            <Card className="bg-blue-50/50 border-blue-100 dark:bg-blue-900/10 dark:border-blue-900/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-medium text-blue-600 dark:text-blue-400 uppercase tracking-wider">Total Gross</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-slate-900 dark:text-white">${money(totals.gross)}</div>
              </CardContent>
            </Card>
            <Card className="bg-red-50/50 border-red-100 dark:bg-red-900/10 dark:border-red-900/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-medium text-red-600 dark:text-red-400 uppercase tracking-wider">Total Taxes (PAYE+AIDS)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-slate-900 dark:text-white">${money(taxes)}</div>
              </CardContent>
            </Card>
            <Card className="bg-orange-50/50 border-orange-100 dark:bg-orange-900/10 dark:border-orange-900/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-medium text-orange-600 dark:text-orange-400 uppercase tracking-wider">Total Deductions</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-slate-900 dark:text-white">${money(totals.deductions)}</div>
              </CardContent>
            </Card>
            <Card className="bg-emerald-50/50 border-emerald-100 dark:bg-emerald-900/10 dark:border-emerald-900/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-medium text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">Total Net Pay</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-slate-900 dark:text-white">${money(totals.net)}</div>
              </CardContent>
            </Card>
            <Card className="bg-purple-50/50 border-purple-100 dark:bg-purple-900/10 dark:border-purple-900/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-medium text-purple-600 dark:text-purple-400 uppercase tracking-wider">Total Employer Cost</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-slate-900 dark:text-white">${money(totals.employerCost)}</div>
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
                    <SummaryRow label="PAYE (ZIMRA)" value={totals.paye} />
                    <SummaryRow label="AIDS Levy" value={totals.aids} />
                    <SummaryRow label="NSSA (Employee)" value={totals.nssaEmp} />
                    <SummaryRow label="NSSA (Employer)" value={totals.nssaEr} />
                    <SummaryRow label="NEC (Employee)" value={totals.necEmp} />
                    <SummaryRow label="NEC (Employer)" value={totals.necEr} />
                    <SummaryRow label="Pension (Employee)" value={totals.pensionEmp} />
                    <SummaryRow label="Pension (Employer)" value={totals.pensionEr} />
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
                    <SummaryRow label="ZIMDEF (1%)" value={lines.reduce((s: number, l: any) => s + (l.employerCosts?.zimdef || 0), 0)} />
                    <SummaryRow label="Standards Development Levy (0.5%)" value={lines.reduce((s: number, l: any) => s + (l.employerCosts?.standardsLevy || 0), 0)} />
                    <SummaryRow label="APWCS" value={lines.reduce((s: number, l: any) => s + (l.employerCosts?.apwcs || 0), 0)} />
                    <SummaryRow label="NSSA (Employer)" value={totals.nssaEr} />
                    <SummaryRow label="NEC (Employer)" value={totals.necEr} />
                    <SummaryRow label="Pension (Employer)" value={totals.pensionEr} />
                    <SummaryRow label="Total Employer Cost" value={totals.employerCost} emphasized />
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>

          <Card className="border-slate-200/60 dark:border-slate-800 shadow-sm overflow-hidden">
            <CardHeader className="bg-slate-50/50 dark:bg-slate-900/20 border-b border-slate-100 dark:border-slate-800 py-3">
              <CardTitle className="text-sm">Employee Breakdown</CardTitle>
              <CardDescription className="text-xs">Per-employee earnings, deductions and employer cost</CardDescription>
            </CardHeader>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead className="text-right">Gross</TableHead>
                    <TableHead className="text-right">Taxable Income</TableHead>
                    <TableHead className="text-right">PAYE</TableHead>
                    <TableHead className="text-right">NSSA</TableHead>
                    <TableHead className="text-right">AIDS Levy</TableHead>
                    <TableHead className="text-right">Net Pay</TableHead>
                    <TableHead className="text-right">Employer Cost</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lines.map((l: any) => {
                    const snapshotTaxable = l.snapshot?.taxableIncome;
                    return (
                      <TableRow key={l.runData.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                        <TableCell>
                          <div className="font-medium text-slate-900 dark:text-white">
                            {l.employee.firstName} {l.employee.lastName}
                          </div>
                          <div className="text-xs text-slate-500">{l.employee.employeeNumber}</div>
                        </TableCell>
                        <TableCell className="text-right">${money(l.runData.grossSalary)}</TableCell>
                        <TableCell className="text-right">${money(snapshotTaxable ?? l.runData.grossSalary)}</TableCell>
                        <TableCell className="text-right text-red-600 dark:text-red-400">${money(l.runData.paye)}</TableCell>
                        <TableCell className="text-right">${money(l.runData.nssaEmployee)}</TableCell>
                        <TableCell className="text-right">${money(l.runData.aidsLevy)}</TableCell>
                        <TableCell className="text-right font-bold text-emerald-600 dark:text-emerald-400">${money(l.runData.netSalary)}</TableCell>
                        <TableCell className="text-right text-purple-600 dark:text-purple-400">${money(l.employerCosts?.total)}</TableCell>
                      </TableRow>
                    );
                  })}
                  <TableRow className="bg-slate-50 dark:bg-slate-900/50 font-bold">
                    <TableCell>Total</TableCell>
                    <TableCell className="text-right">${money(totals.gross)}</TableCell>
                    <TableCell className="text-right"></TableCell>
                    <TableCell className="text-right">${money(totals.paye)}</TableCell>
                    <TableCell className="text-right">${money(totals.nssaEmp)}</TableCell>
                    <TableCell className="text-right">${money(totals.aids)}</TableCell>
                    <TableCell className="text-right">${money(totals.net)}</TableCell>
                    <TableCell className="text-right">${money(totals.employerCost)}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          </Card>
        </div>
      </div>
    </HRLayout>
  );
}

function SummaryRow({ label, value, emphasized }: { label: string; value: number; emphasized?: boolean }) {
  return (
    <TableRow className={emphasized ? "bg-purple-50/50 dark:bg-purple-900/10 font-bold" : ""}>
      <TableCell className={emphasized ? "text-purple-700 dark:text-purple-300" : "text-slate-600 dark:text-slate-300"}>{label}</TableCell>
      <TableCell className={`text-right font-mono ${emphasized ? "text-purple-700 dark:text-purple-300" : ""}`}>
        ${money(value)}
      </TableCell>
    </TableRow>
  );
}
