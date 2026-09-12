import { useQuery } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { HRLayout } from "@/pages/hr/layout";
import { useActiveCompany } from "@/hooks/use-active-company";
import { Loader2, ArrowLeft, Download, FileText, ChevronDown, ChevronRight, Banknote, Landmark, MapPin, FileBarChart2, Printer, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useState } from "react";
import { format } from "date-fns";
import { downloadExcel } from "@/lib/export-utils";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

export default function HRPayslips() {
  const { runId } = useParams();
  const { activeCompany: company } = useActiveCompany();
  const companyId = company?.id;

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
        <div className="flex h-96 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        </div>
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

  const buildPayslipHtml = (p: any) => {
    let snapshot = null;
    try {
      snapshot = typeof p.runData.snapshotData === 'string'
        ? JSON.parse(p.runData.snapshotData)
        : p.runData.snapshotData;
    } catch (e) {}

    return `
      <div class="payslip">
        <div class="header">
          <h1 class="title">PAYSLIP</h1>
          <p class="company">${company?.name || 'Company Name'}</p>
          <p class="company">${format(new Date(run.periodStart), 'MMMM yyyy')}</p>
        </div>

        <div class="grid">
          <div class="col">
            <div class="label">Employee Name</div>
            <div class="value">${p.employee.firstName} ${p.employee.lastName}</div>
            <div class="label">Employee ID</div>
            <div class="value">${p.employee.employeeNumber}</div>
          </div>
          <div class="col">
            <div class="label">National ID</div>
            <div class="value">${p.employee.nationalId || '-'}</div>
            <div class="label">Bank Account</div>
            <div class="value">${p.employee.bankName || '-'} (${p.employee.bankAccountNumber || '-'})</div>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th>Earnings</th>
              <th class="amount">Amount (USD)</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Basic Salary</td>
              <td class="amount">$${parseFloat(p.runData.basicSalary).toFixed(2)}</td>
            </tr>
            ${parseFloat(p.runData.grossSalary) > parseFloat(p.runData.basicSalary) ? `
            <tr>
              <td>Allowances</td>
              <td class="amount">$${(parseFloat(p.runData.grossSalary) - parseFloat(p.runData.basicSalary)).toFixed(2)}</td>
            </tr>` : ''}
            <tr class="total-row">
              <td>Gross Earnings</td>
              <td class="amount">$${parseFloat(p.runData.grossSalary).toFixed(2)}</td>
            </tr>
          </tbody>
        </table>

        <table>
          <thead>
            <tr>
              <th>Deductions</th>
              <th class="amount">Amount (USD)</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>PAYE (ZIMRA)</td>
              <td class="amount">$${parseFloat(p.runData.paye).toFixed(2)}</td>
            </tr>
            <tr>
              <td>NSSA</td>
              <td class="amount">$${parseFloat(p.runData.nssaEmployee).toFixed(2)}</td>
            </tr>
            <tr>
              <td>AIDS Levy</td>
              <td class="amount">$${parseFloat(p.runData.aidsLevy).toFixed(2)}</td>
            </tr>
            <tr class="total-row">
              <td>Total Deductions</td>
              <td class="amount">$${(parseFloat(p.runData.paye) + parseFloat(p.runData.nssaEmployee) + parseFloat(p.runData.aidsLevy)).toFixed(2)}</td>
            </tr>
          </tbody>
        </table>

        <div class="net-pay">
          Net Pay: $${parseFloat(p.runData.netSalary).toFixed(2)}
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
          <title>${title}</title>
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
              <div className="text-2xl font-bold text-slate-900 dark:text-white">${parseFloat(run.totalGross).toLocaleString(undefined, {minimumFractionDigits: 2})}</div>
            </CardContent>
          </Card>
          <Card className="bg-red-50/50 border-red-100 dark:bg-red-900/10 dark:border-red-900/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium text-red-600 dark:text-red-400 uppercase tracking-wider">Total Taxes</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-slate-900 dark:text-white">${payslips.reduce((acc: number, p: any) => acc + parseFloat(p.runData.paye), 0).toLocaleString(undefined, {minimumFractionDigits: 2})}</div>
            </CardContent>
          </Card>
          <Card className="bg-orange-50/50 border-orange-100 dark:bg-orange-900/10 dark:border-orange-900/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium text-orange-600 dark:text-orange-400 uppercase tracking-wider">Total Deductions</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-slate-900 dark:text-white">${parseFloat(run.totalDeductions).toLocaleString(undefined, {minimumFractionDigits: 2})}</div>
            </CardContent>
          </Card>
          <Card className="bg-emerald-50/50 border-emerald-100 dark:bg-emerald-900/10 dark:border-emerald-900/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">Total Net Pay</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-slate-900 dark:text-white">${parseFloat(run.totalNet).toLocaleString(undefined, {minimumFractionDigits: 2})}</div>
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
                        ${parseFloat(p.runData.grossSalary).toLocaleString(undefined, {minimumFractionDigits: 2})}
                      </TableCell>
                      <TableCell className="text-right text-red-600 dark:text-red-400">
                        ${parseFloat(p.runData.paye).toLocaleString(undefined, {minimumFractionDigits: 2})}
                      </TableCell>
                      <TableCell className="text-right font-bold text-emerald-600 dark:text-emerald-400">
                        ${parseFloat(p.runData.netSalary).toLocaleString(undefined, {minimumFractionDigits: 2})}
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
                        </div>
                      </TableCell>
                    </TableRow>
                    
                    {expandedId === p.runData.id && (
                      <TableRow className="bg-slate-50/50 dark:bg-slate-900/20 border-b-2 border-slate-200">
                        <TableCell colSpan={7} className="p-0">
                          <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-8">
                            <div>
                              <h4 className="text-sm font-bold text-slate-900 dark:text-white mb-4 flex items-center border-b pb-2">
                                <Banknote className="mr-2 h-4 w-4 text-emerald-500" /> 
                                Earnings Breakdown
                              </h4>
                              <div className="space-y-3">
                                <div className="flex justify-between text-sm">
                                  <span className="text-slate-600 dark:text-slate-400">Basic Salary</span>
                                  <span className="font-medium">${parseFloat(p.runData.basicSalary).toFixed(2)}</span>
                                </div>
                                {parseFloat(p.runData.grossSalary) > parseFloat(p.runData.basicSalary) && (
                                  <div className="flex justify-between text-sm">
                                    <span className="text-slate-600 dark:text-slate-400">Allowances & Bonuses</span>
                                    <span className="font-medium">${(parseFloat(p.runData.grossSalary) - parseFloat(p.runData.basicSalary)).toFixed(2)}</span>
                                  </div>
                                )}
                                <div className="flex justify-between text-sm font-bold pt-2 border-t mt-2">
                                  <span>Total Gross</span>
                                  <span>${parseFloat(p.runData.grossSalary).toFixed(2)}</span>
                                </div>
                              </div>
                            </div>

                            <div>
                              <h4 className="text-sm font-bold text-slate-900 dark:text-white mb-4 flex items-center border-b pb-2">
                                <Landmark className="mr-2 h-4 w-4 text-red-500" /> 
                                Deductions Breakdown
                              </h4>
                              <div className="space-y-3">
                                <div className="flex justify-between text-sm">
                                  <span className="text-slate-600 dark:text-slate-400">ZIMRA PAYE</span>
                                  <span className="font-medium text-red-600">${parseFloat(p.runData.paye).toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between text-sm">
                                  <span className="text-slate-600 dark:text-slate-400">NSSA</span>
                                  <span className="font-medium text-red-600">${parseFloat(p.runData.nssaEmployee).toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between text-sm">
                                  <span className="text-slate-600 dark:text-slate-400">AIDS Levy</span>
                                  <span className="font-medium text-red-600">${parseFloat(p.runData.aidsLevy).toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between text-sm font-bold pt-2 border-t mt-2">
                                  <span>Total Deductions</span>
                                  <span className="text-red-600">${(parseFloat(p.runData.paye) + parseFloat(p.runData.nssaEmployee) + parseFloat(p.runData.aidsLevy)).toFixed(2)}</span>
                                </div>
                              </div>
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
