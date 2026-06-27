import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { HRLayout } from "./layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useActiveCompany } from "@/hooks/use-active-company";
import { useAuth } from "@/hooks/use-auth";
import { FileText, Download, Building, Users, Calendar, Calculator, Loader2 } from "lucide-react";

export default function ZimraReports() {
  const { user } = useAuth();
  const { activeCompanyId } = useActiveCompany(!!user, user?.id ?? null);
  const companyId = activeCompanyId ?? null;

  const currentYear = new Date().getFullYear();
  const [taxYear, setTaxYear] = useState<string>(String(currentYear));
  const [month, setMonth] = useState<string>(new Date().toISOString().slice(0, 7));

  // --- REPORT EXPORT HANDLERS ---
  const downloadCSV = (filename: string, content: string) => {
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleItf16 = async () => {
    if (!companyId) return;
    try {
      const res = await fetch(`/api/companies/${companyId}/payroll/exports/itf16?taxYear=${taxYear}`);
      if (!res.ok) throw new Error("Failed to generate ITF16");
      const csv = await res.text();
      downloadCSV(`ITF16_${taxYear}.csv`, csv);
    } catch (e: any) {
      alert("Error: " + e.message);
    }
  };

  const handleP2 = async () => {
    if (!companyId) return;
    try {
      const res = await fetch(`/api/companies/${companyId}/payroll/exports/p2?month=${month}`);
      if (!res.ok) throw new Error("Failed to generate P2");
      const data = await res.json();
      console.log("P2 Data:", data);
      alert(`P2 Report Generated! Total PAYE: $${data.totalPaye}`);
    } catch (e: any) {
      alert("Error: " + e.message);
    }
  };

  const handleZimdef = async () => {
    if (!companyId) return;
    try {
      const res = await fetch(`/api/companies/${companyId}/payroll/exports/zimdef?month=${month}`);
      if (!res.ok) throw new Error("Failed to generate ZIMDEF");
      const data = await res.json();
      console.log("ZIMDEF Data:", data);
      alert(`ZIMDEF Report Generated! Total Due: $${data.totalDue}`);
    } catch (e: any) {
      alert("Error: " + e.message);
    }
  };

  return (
    <HRLayout>
      <div className="flex flex-col gap-6 h-full max-w-5xl mx-auto">
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            ZIMRA Compliance Reports
          </h1>
          <p className="text-slate-500">Generate statutory exports and remittance schedules for Zimbabwe.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

          {/* ITF16 Card */}
          <Card className="border-indigo-100 dark:border-indigo-900/40 shadow-sm relative overflow-hidden group hover:shadow-md transition-all">
            <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-50 dark:bg-indigo-900/10 rounded-bl-full -mr-4 -mt-4 transition-transform group-hover:scale-110" />
            <CardHeader className="pb-3 relative z-10">
              <div className="h-10 w-10 bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 rounded-lg flex items-center justify-center mb-2">
                <FileText className="h-5 w-5" />
              </div>
              <CardTitle>ITF16 Return</CardTitle>
              <CardDescription>Year-end employee tax return (CSV format for e-Taxes portal)</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 relative z-10">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-slate-500 uppercase">Tax Year</label>
                <Select value={taxYear} onValueChange={setTaxYear}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select Year" />
                  </SelectTrigger>
                  <SelectContent>
                    {[0,1,2].map(i => {
                      const y = currentYear - i;
                      return <SelectItem key={y} value={String(y)}>{y}</SelectItem>;
                    })}
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={handleItf16} className="w-full bg-gradient-to-r from-indigo-600 to-blue-600 text-white gap-2">
                <Download className="h-4 w-4" /> Export CSV
              </Button>
            </CardContent>
          </Card>

          {/* P2 Return Card */}
          <Card className="border-emerald-100 dark:border-emerald-900/40 shadow-sm relative overflow-hidden group hover:shadow-md transition-all">
            <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-50 dark:bg-emerald-900/10 rounded-bl-full -mr-4 -mt-4 transition-transform group-hover:scale-110" />
            <CardHeader className="pb-3 relative z-10">
              <div className="h-10 w-10 bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400 rounded-lg flex items-center justify-center mb-2">
                <Building className="h-5 w-5" />
              </div>
              <CardTitle>P2 Monthly Return</CardTitle>
              <CardDescription>Monthly PAYE and AIDS Levy remittance schedule</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 relative z-10">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-slate-500 uppercase">Month</label>
                <Input type="month" value={month} onChange={(e: any) => setMonth(e.target.value)} />
              </div>
              <Button onClick={handleP2} variant="outline" className="w-full gap-2 border-emerald-200 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-900 dark:text-emerald-400 dark:hover:bg-emerald-900/20">
                <Calculator className="h-4 w-4" /> Generate Report
              </Button>
            </CardContent>
          </Card>

          {/* P6 Certificates Card */}
          <Card className="border-amber-100 dark:border-amber-900/40 shadow-sm relative overflow-hidden group hover:shadow-md transition-all">
            <div className="absolute top-0 right-0 w-32 h-32 bg-amber-50 dark:bg-amber-900/10 rounded-bl-full -mr-4 -mt-4 transition-transform group-hover:scale-110" />
            <CardHeader className="pb-3 relative z-10">
              <div className="h-10 w-10 bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400 rounded-lg flex items-center justify-center mb-2">
                <Users className="h-5 w-5" />
              </div>
              <CardTitle>P6 Certificates</CardTitle>
              <CardDescription>Employee annual tax certificates (PDF generation)</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 relative z-10">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-slate-500 uppercase">Tax Year</label>
                <Select value={taxYear} onValueChange={setTaxYear}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select Year" />
                  </SelectTrigger>
                  <SelectContent>
                    {[0,1,2].map(i => {
                      const y = currentYear - i;
                      return <SelectItem key={y} value={String(y)}>{y}</SelectItem>;
                    })}
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={() => alert("P6 PDF Generation coming soon")} variant="outline" className="w-full gap-2 border-amber-200 text-amber-700 hover:bg-amber-50 dark:border-amber-900 dark:text-amber-400 dark:hover:bg-amber-900/20">
                <FileText className="h-4 w-4" /> Generate PDFs
              </Button>
            </CardContent>
          </Card>

          {/* ZIMDEF Levy Card */}
          <Card className="border-rose-100 dark:border-rose-900/40 shadow-sm relative overflow-hidden group hover:shadow-md transition-all">
            <div className="absolute top-0 right-0 w-32 h-32 bg-rose-50 dark:bg-rose-900/10 rounded-bl-full -mr-4 -mt-4 transition-transform group-hover:scale-110" />
            <CardHeader className="pb-3 relative z-10">
              <div className="h-10 w-10 bg-rose-100 dark:bg-rose-900/40 text-rose-600 dark:text-rose-400 rounded-lg flex items-center justify-center mb-2">
                <Calendar className="h-5 w-5" />
              </div>
              <CardTitle>ZIMDEF & Standards Levy</CardTitle>
              <CardDescription>Monthly Manpower and Standards Development return</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 relative z-10">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-slate-500 uppercase">Month</label>
                <Input type="month" value={month} onChange={(e: any) => setMonth(e.target.value)} />
              </div>
              <Button onClick={handleZimdef} variant="outline" className="w-full gap-2 border-rose-200 text-rose-700 hover:bg-rose-50 dark:border-rose-900 dark:text-rose-400 dark:hover:bg-rose-900/20">
                <Calculator className="h-4 w-4" /> Generate Report
              </Button>
            </CardContent>
          </Card>

        </div>
      </div>
    </HRLayout>
  );
}

// Ensure Input is imported, wait, let's add it manually here if it wasn't.
function Input(props: any) {
  return (
    <input 
      {...props} 
      className="flex h-9 w-full rounded-md border border-slate-200 bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-slate-950 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-800 dark:placeholder:text-slate-400 dark:focus-visible:ring-slate-300"
    />
  )
}
