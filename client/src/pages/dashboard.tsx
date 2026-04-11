
import { useAuth } from "@/hooks/use-auth";
import { useInvoices } from "@/hooks/use-invoices";
import { useCompanies } from "@/hooks/use-companies";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  AreaChart, 
  Area,
  Cell,
  Legend
} from "recharts";
import { 
  Building2, 
  Users, 
  FileText, 
  TrendingUp, 
  ArrowUpRight, 
  ArrowDownRight,
  DollarSign,
  Clock,
  CalendarDays,
  Receipt,
  ShoppingCart,
  Plus,
  Settings,
  Server,
  RefreshCw,
  Activity,
  Wifi,
  AlertCircle,
  ShoppingBag,
  Package,
  Key,
  ArrowRight,
  ShieldCheck,
  Store
} from "lucide-react";
import { BranchPickerModal } from "@/components/branch-picker-modal";
import { useBranchContext } from "@/lib/branch-context";
import { api, buildUrl } from "@shared/routes";
import { cn } from "@/lib/utils";
import React, { useMemo } from "react";
import { Link, useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { useDeviceStatus } from "@/hooks/use-device-status";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { DayManagementControls } from "@/components/zimra/day-management-controls";
import { useCurrencies } from "@/hooks/use-currencies";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { format } from "date-fns";

import { useActiveCompany } from "@/hooks/use-active-company";
import { pdf } from "@react-pdf/renderer";
import { FiscalReportPDF } from "@/components/reports/fiscal-report-pdf";
import { useFiscalReport } from "@/hooks/use-reports";
import { saveAs } from "file-saver";
import dayjs from "dayjs";

export default function Dashboard() {
  const { user } = useAuth();
  const { activeCompany, isLoading: isLoadingCompany } = useActiveCompany();
  const { selectedBranchId } = useBranchContext();
  const selectedCompany = activeCompany;
  const { data: invoicesResult, isLoading } = useInvoices(selectedCompany?.id || 0, { limit: 5, branchId: selectedBranchId || undefined });
  const invoices = invoicesResult?.data;
  const [, setLocation] = useLocation();

  const { data: currencies } = useCurrencies(selectedCompany?.id || 0);
  const [reportCurrencyCode, setReportCurrencyCode] = React.useState<string>("USD");

  const consolidatedCurrency = currencies?.find(c => c.code === reportCurrencyCode) || currencies?.find(c => c.code === 'USD');
  const consolidatedRate = Number(consolidatedCurrency?.exchangeRate || 1);
  const consolidatedSymbol = consolidatedCurrency?.symbol || (reportCurrencyCode === 'USD' ? '$' : reportCurrencyCode);

  const { data: aging } = useQuery<any>({
    queryKey: [api.reports.receivablesAging.path, selectedCompany?.id, reportCurrencyCode],
    queryFn: async () => {
      const res = await apiFetch(buildUrl(api.reports.receivablesAging.path, { companyId: selectedCompany?.id }) + `?currency=${reportCurrencyCode}`);
      return res.json();
    },
    enabled: !!selectedCompany?.id,
  });

  const { data: fiscalStats } = useQuery<any>({
    queryKey: [api.reports.fiscalYearStats.path, selectedCompany?.id, reportCurrencyCode],
    queryFn: async () => {
      const res = await apiFetch(buildUrl(api.reports.fiscalYearStats.path, { companyId: selectedCompany?.id }) + `?currency=${reportCurrencyCode}`);
      return res.json();
    },
    enabled: !!selectedCompany?.id,
  });

  const { data: operationalMetrics } = useQuery<any>({
    queryKey: [api.reports.operationalMetrics.path, selectedCompany?.id],
    queryFn: async () => {
      const res = await apiFetch(buildUrl(api.reports.operationalMetrics.path, { companyId: selectedCompany?.id }));
      return res.json();
    },
    enabled: !!selectedCompany?.id,
  });

  const { data: hourlySales } = useQuery<any[]>({
    queryKey: [api.reports.hourlySales.path, selectedCompany?.id],
    queryFn: async () => {
      const res = await apiFetch(buildUrl(api.reports.hourlySales.path, { companyId: selectedCompany?.id }));
      return res.json();
    },
    enabled: !!selectedCompany?.id,
  });

  const { data: stockAlerts } = useQuery<any[]>({
    queryKey: [api.reports.stockAlerts.path, selectedCompany?.id],
    queryFn: async () => {
      const res = await apiFetch(buildUrl(api.reports.stockAlerts.path, { companyId: selectedCompany?.id }));
      return res.json();
    },
    enabled: !!selectedCompany?.id,
  });

  const { data: abcAnalysis } = useQuery<any[]>({
    queryKey: ["/api/companies", selectedCompany?.id, "reports/abc-analysis"],
    queryFn: async () => {
      const res = await apiFetch(`/api/companies/${selectedCompany?.id}/reports/abc-analysis`);
      return res.json();
    },
    enabled: !!selectedCompany?.id,
  });

  const { data: financialSummary } = useQuery<any>({
    queryKey: ["/api/companies", selectedCompany?.id, "reports/financial-summary"],
    queryFn: async () => {
      const res = await apiFetch(`/api/companies/${selectedCompany?.id}/reports/financial-summary`);
      return res.json();
    },
    enabled: !!selectedCompany?.id,
  });

  const { data: revenueData } = useQuery<any[]>({
    queryKey: [api.reports.revenueChart.path, selectedCompany?.id],
    queryFn: async () => {
      const res = await apiFetch(buildUrl(api.reports.revenueChart.path, { id: selectedCompany?.id }));
      return res.json();
    },
    enabled: !!selectedCompany?.id,
  });

  const today = format(new Date(), 'yyyy-MM-dd');
  const { data: todayStats } = useQuery<any>({
    queryKey: [api.reports.financialSummary.path, selectedCompany?.id, today],
    queryFn: async () => {
      const res = await apiFetch(buildUrl(api.reports.financialSummary.path, { companyId: selectedCompany?.id }) + `?from=${today}&to=${today}&drillDown=true`);
      const data = await res.json();
      return {
        totalSales: data.revenue || 0,
        totalReceipts: data.drillDown?.revenueItems?.length || 0
      };
    },
    enabled: !!selectedCompany?.id,
  });

  const { toast } = useToast();
  
  const generateFiscalReport = async (type: 'X' | 'Z') => {
    if (!selectedCompany?.id) return;
    
    toast({
      title: `Generating ${type} Report`,
      description: "Aggregating fiscal data and preparing PDF...",
    });

    try {
      const today = new Date().toISOString().split('T')[0];
      const res = await apiFetch(`/api/companies/${selectedCompany.id}/reports/fiscal-data?date=${today}`);
      if (!res.ok) throw new Error("Failed to fetch report data");
      
      const reportData = await res.json();
      
      const doc = <FiscalReportPDF 
        type={type} 
        data={reportData} 
        company={selectedCompany} 
      />;
      
      const blob = await pdf(doc).toBlob();
      saveAs(blob, `Fiscal-${type}-Report-${dayjs().format('YYYY-MM-DD-HHmm')}.pdf`);
      
      toast({
        title: "Report Downloaded",
        description: `Your ${type} report is ready.`,
      });
    } catch (error: any) {
      toast({
        title: "Report Generation Failed",
        description: error.message,
        variant: "destructive"
      });
    }
  };

  const queryClient = useQueryClient();

  const { mutate: pingZimra, isPending: isPinging } = useMutation({
    mutationFn: async () => {
      if (!selectedCompany?.id) return;
      const res = await apiFetch(`/api/companies/${selectedCompany.id}/zimra/ping`, { method: "POST" });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Ping failed");
      }
      return await res.json();
    },
    onSuccess: (data) => {
      setPingSuccess(true); // Set success state
      queryClient.invalidateQueries({ queryKey: ["companies"] });
    },
    onError: (err: Error) => {
      setPingSuccess(false);
      toast({
        title: "Ping Failed",
        description: err.message,
        variant: "destructive",
      });
    }
  });

  // Track ping success locally for UI state
  const [pingSuccess, setPingSuccess] = React.useState(false);
  const isOnline = pingSuccess;

  // Add API Key Generation Mutation
  const { mutate: generateApiKey, isPending: isGeneratingKey } = useMutation({
    mutationFn: async () => {
      const res = await apiFetch(`/api/companies/${selectedCompany.id}/api-keys/generate`, { method: "POST" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "Failed to generate API Key");
      }
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: "API Key Generated",
        description: "Your new API key has been created successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/user"] });
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Generation Failed",
        description: error.message,
      });
    }
  });

  // Auto-Ping on Mount if Configured
  React.useEffect(() => {
    if (selectedCompany?.fdmsDeviceId) {
      pingZimra();
    }
  }, [selectedCompany?.fdmsDeviceId]);

  const stats = useMemo(() => {
    return {
      total: (fiscalStats?.totalSales || 0),
      pending: (aging?.total || 0),
      count: invoices?.length || 0
    };
  }, [fiscalStats, aging, invoices]);

  // Fiscal Day Alert Logic
  const { data: deviceStatus } = useDeviceStatus(selectedCompany?.id || 0);
  const showTimeAlert = React.useMemo(() => {
    const now = new Date();
    const isPast5PM = now.getHours() >= 17;
    const isFiscalDayOpen = deviceStatus?.fiscalDayOpen;
    return isPast5PM && isFiscalDayOpen;
  }, [deviceStatus]);

  const formatCurrency = (val: number) => {
    try {
      return new Intl.NumberFormat('en-US', { style: 'currency', currency: reportCurrencyCode }).format(val);
    } catch (e) {
      return `${consolidatedSymbol}${val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
  };

  if (!selectedCompany) {
    return (
      <Layout>
        <div className="min-h-[60vh] flex flex-col items-center justify-center text-center p-6 space-y-4">
          <div className="animate-pulse flex flex-col items-center space-y-4">
            <Loader2 className="w-10 h-10 text-slate-200 animate-spin" />
            <p className="text-sm font-black text-slate-400 uppercase tracking-widest">Preparing your dashboard...</p>
          </div>
          <Button 
            onClick={() => setLocation("/onboarding")} 
            variant="outline"
            className="rounded-xl border-slate-200 text-slate-500 font-bold px-8"
          >
            Go to Business Setup
          </Button>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-10 pb-20 animate-in fade-in duration-700">
        {/* Unified Business Pulse Header */}
        <section className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <h1 className="text-4xl font-display font-black text-slate-900 tracking-tight uppercase px-1">
                Dashboard
              </h1>
              <div className="h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.4)] animate-pulse" />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <div className="glass px-4 py-2.5 rounded-full flex items-center gap-3 border-white/20 shadow-sm">
              <div className={cn("w-2.5 h-2.5 rounded-full", pingSuccess ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" : "bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.5)]")} />
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-700">
                {isPinging ? "Pinging..." : (pingSuccess ? "ZIMRA Online" : "ZIMRA Offline")}
              </span>
              <Button variant="ghost" size="icon" className="h-5 w-5 hover:bg-black/5 rounded-full" onClick={() => pingZimra()} disabled={isPinging}>
                <RefreshCw className={cn("w-2.5 h-2.5", isPinging ? "animate-spin" : "")} />
              </Button>
            </div>

            <div className="glass px-4 py-2.5 rounded-full flex items-center gap-3 border-white/20 shadow-sm">
              <CalendarDays className="w-3.5 h-3.5 text-primary" />
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-700">FY {new Date().getFullYear()}</span>
            </div>

            <BranchPickerModal
              companyId={selectedCompany?.id || 0}
              selectedBranchId={selectedBranchId}
              onSelect={(id) => setSelectedBranchId(id)}
              trigger={
                <Button className="btn-gradient h-10 px-6 rounded-full flex items-center gap-2 text-[10px] font-black uppercase tracking-widest shadow-xl active:scale-95 transition-all">
                  <Store className="h-3.5 w-3.5" />
                  {selectedBranchId ? "Switch Location" : "Select Location"}
                </Button>
              }
            />

            {currencies && currencies.length > 0 && (
              <Select value={reportCurrencyCode} onValueChange={setReportCurrencyCode}>
                <SelectTrigger className="w-[100px] h-10 rounded-full bg-white/50 backdrop-blur-md border-white/20 text-[10px] font-black uppercase tracking-widest shadow-sm">
                  <SelectValue placeholder="Currency" />
                </SelectTrigger>
                <SelectContent className="rounded-2xl border-white/20 shadow-2xl">
                  {currencies.map(c => (
                    <SelectItem key={c.id} value={c.code} className="text-[10px] font-bold">{c.code}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </section>

        {showTimeAlert && (
          <Alert variant="destructive" className="bg-rose-50/50 backdrop-blur-md border-rose-200/50 text-rose-800 rounded-3xl p-6 shadow-xl animate-in slide-in-from-top-4 duration-500">
            <Clock className="h-5 w-5 mt-0.5 text-rose-600" />
            <div className="ml-2">
              <AlertTitle className="text-sm font-black uppercase tracking-wider mb-1">Fiscal Day Overdue</AlertTitle>
              <AlertDescription className="text-xs font-medium opacity-90 leading-relaxed">
                Standard reporting hours have ended. Immediate action required: <Link href="/zimra-settings" className="font-black underline decoration-2 underline-offset-4 hover:text-rose-600 transition-colors">Terminate Fiscal Day Session</Link> to maintain automated compliance.
              </AlertDescription>
            </div>
          </Alert>
        )}

        {/* Action Center Grid */}
        <section className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-6">
          {[
            { label: "New Invoice", icon: FileText, path: "/invoices/new", color: "bg-blue-500", shadow: "shadow-blue-200" },
            { label: "Launch POS", icon: Store, path: "/pos", color: "bg-emerald-500", shadow: "shadow-emerald-200" },
            { label: "Add Product", icon: Package, path: "/products", color: "bg-violet-500", shadow: "shadow-violet-200" },
            { label: "Expenses", icon: DollarSign, path: "/expenses", color: "bg-rose-500", shadow: "shadow-rose-200" },
            { label: "Inventory", icon: ShoppingBag, path: "/inventory", color: "bg-cyan-500", shadow: "shadow-cyan-200" },
            { label: "Settings", icon: Settings, path: "/zimra-settings", color: "bg-slate-500", shadow: "shadow-slate-200" },
          ].map((action, i) => (
            <Link key={i} href={action.path}>
              <div className="group glass-card p-6 rounded-[2rem] flex flex-col items-center justify-center text-center hover:bg-slate-900 hover:text-white transition-all duration-300 hover:-translate-y-1 cursor-pointer">
                <div className={cn("p-4 rounded-2xl mb-4 group-hover:scale-110 transition-transform shadow-lg", action.color, action.shadow)}>
                  <action.icon className="w-6 h-6 text-white" />
                </div>
                <span className="text-[10px] font-black uppercase tracking-widest">{action.label}</span>
              </div>
            </Link>
          ))}
        </section>

        {/* Main Sales Analytics & Status */}
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Sales by Day Bar Chart (Takes 2/3 space) */}
          <div className="lg:col-span-2 glass-card rounded-[3rem] overflow-hidden bg-white shadow-2xl border-white/40">
            <div className="p-8 border-b border-slate-50 flex flex-col sm:flex-row sm:items-center justify-between gap-6">
              <div className="space-y-1">
                <h3 className="text-sm font-black uppercase tracking-widest text-slate-900 flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-primary" /> Sales by Day
                </h3>
                <p className="text-xs text-slate-400 font-medium italic">Revenue tracking for the last 30 days</p>
              </div>
            </div>
            <div className="p-8 pt-12 h-[500px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={revenueData || []}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis 
                    dataKey="name" 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{fill: '#94a3b8', fontSize: 10, fontWeight: 800}}
                    dy={15}
                  />
                  <YAxis 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{fill: '#94a3b8', fontSize: 10, fontWeight: 800}}
                    tickFormatter={(val) => consolidatedSymbol + (val >= 1000 ? (val/1000) + 'k' : val)}
                  />
                  <Tooltip 
                    contentStyle={{borderRadius: '24px', border: 'none', boxShadow: '0 25px 50px -12px rgb(0 0 0 / 0.15)', fontSize: '12px', padding: '16px', fontWeight: 'bold'}}
                    cursor={{fill: '#f8fafc'}}
                  />
                  <Bar 
                    dataKey="total" 
                    fill="hsl(var(--primary))" 
                    radius={[8, 8, 0, 0]} 
                    barSize={30}
                    animationDuration={2000}
                  >
                    {revenueData?.map((entry: any, index: number) => (
                      <Cell key={`cell-${index}`} fillOpacity={0.8 + (index / (revenueData.length || 1)) * 0.2} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Status of the Day & Quick Stats (Takes 1/3 space) */}
          <div className="space-y-8">
            <div className="glass-card rounded-[3rem] p-10 shadow-2xl bg-white border-white/40 h-full flex flex-col">
              <div className="space-y-1 mb-10">
                <h3 className="text-base font-black uppercase tracking-widest text-slate-900 flex items-center gap-2">
                  <Activity className="w-5 h-5 text-emerald-500" /> Status of the Day
                </h3>
                <p className="text-xs text-slate-400 font-medium italic">Today's metrics and fiscal state</p>
              </div>

              <div className="flex-1 space-y-6">
                {[
                  { label: "Fiscal Day No.", value: deviceStatus?.fiscalDayNumber || "---", icon: ShieldCheck, color: "text-blue-500" },
                  { label: "Today's Receipts", value: todayStats?.totalReceipts || 0, icon: Receipt, color: "text-emerald-500" },
                  { label: "Today's Revenue", value: formatCurrency(todayStats?.totalSales || 0), icon: DollarSign, color: "text-violet-500" },
                ].map((stat, i) => (
                  <div key={i} className="flex items-center justify-between p-5 rounded-[2rem] bg-slate-50 border border-slate-100/50 hover:bg-white hover:shadow-xl transition-all duration-300 group">
                    <div className="flex items-center gap-4">
                      <div className="p-3 bg-white rounded-2xl shadow-sm border border-slate-100 group-hover:scale-110 transition-transform">
                        <stat.icon className={cn("w-5 h-5", stat.color)} />
                      </div>
                      <span className="text-[11px] font-black uppercase tracking-widest text-slate-400">{stat.label}</span>
                    </div>
                    <span className="text-lg font-black font-display text-slate-900 tracking-tight">{stat.value}</span>
                  </div>
                ))}
              </div>

              <div className="mt-20 pt-10 border-t border-slate-100 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <Button 
                    variant="outline" 
                    className="h-16 rounded-[2rem] border-slate-200 text-[10px] font-black uppercase tracking-[0.2em] flex flex-col gap-1 items-center justify-center hover:bg-slate-900 hover:text-white transition-all shadow-sm"
                    onClick={() => downloadReport('X')}
                  >
                    <FileText className="w-4 h-4" />
                    <span>X Report</span>
                  </Button>
                  <Button 
                    variant="outline" 
                    className="h-16 rounded-[2rem] border-slate-200 text-[10px] font-black uppercase tracking-[0.2em] flex flex-col gap-1 items-center justify-center hover:bg-slate-900 hover:text-white transition-all shadow-sm"
                    onClick={() => downloadReport('Z')}
                  >
                    <ShieldCheck className="w-4 h-4" />
                    <span>Z Report</span>
                  </Button>
                </div>
                <Link href="/financials" className="block pt-2">
                  <Button className="btn-gradient w-full h-16 rounded-[2rem] text-xs font-black uppercase tracking-widest shadow-2xl active:scale-95">
                    View Complete Stats <ArrowRight className="w-4 h-4 ml-3" />
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </section>
      </div>

    </Layout>
  );
}
