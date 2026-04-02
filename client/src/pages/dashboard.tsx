
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

  const queryClient = useQueryClient();
  const { toast } = useToast();

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
        <div className="min-h-[85vh] flex items-center justify-center p-6 sm:p-12 overflow-hidden relative">
          {/* Background Decorative Elements */}
          <div className="absolute top-[10%] left-[5%] w-64 h-64 bg-violet-500/10 rounded-full blur-[100px] animate-pulse" />
          <div className="absolute bottom-[20%] right-[10%] w-80 h-80 bg-blue-500/10 rounded-full blur-[100px] animate-pulse" />
          
          <div className="max-w-6xl w-full grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20 items-center relative z-10 font-jakarta">
            {/* Left: Content & Actions */}
            <div className="flex flex-col text-center lg:text-left space-y-8 animate-in fade-in slide-in-from-left-8 duration-1000">
              <div className="space-y-4">
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-violet-100 border border-violet-200 text-violet-700 text-xs font-bold uppercase tracking-widest shadow-sm">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  Compliance Made Simple
                </div>
                <h1 className="text-4xl sm:text-6xl font-black text-slate-900 leading-[1.1] tracking-tight">
                  Welcome to <br />
                  <span className="text-gradient">ZimInvoice Pro</span>
                </h1>
                <p className="text-lg text-slate-500 font-medium max-w-xl mx-auto lg:mx-0 leading-relaxed">
                  The ultimate fiscalization platform for Zimbabwe's modern businesses. Let's get you registered and ZIMRA-compliant in minutes.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-lg mx-auto lg:mx-0">
                <div className="glass-card p-5 rounded-2xl flex flex-col items-center lg:items-start text-center lg:text-left">
                  <div className="p-2 bg-violet-600 rounded-xl mb-3 shadow-lg shadow-violet-200">
                    <Building2 className="w-5 h-5 text-white" />
                  </div>
                  <h3 className="text-sm font-bold text-slate-900 mb-1">Company Details</h3>
                  <p className="text-xs text-slate-500">Capture your TIN, BP, and VAT details for official records.</p>
                </div>
                <div className="glass-card p-5 rounded-2xl flex flex-col items-center lg:items-start text-center lg:text-left">
                  <div className="p-2 bg-blue-600 rounded-xl mb-3 shadow-lg shadow-blue-200">
                    <Server className="w-5 h-5 text-white" />
                  </div>
                  <h3 className="text-sm font-bold text-slate-900 mb-1">ZIMRA Sync</h3>
                  <p className="text-xs text-slate-500">Connect your FDMS device and start syncing tax data instantly.</p>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row items-center gap-4 pt-4">
                <Button 
                  onClick={() => setLocation("/onboarding")} 
                  size="lg" 
                  className="btn-gradient w-full sm:w-auto h-14 px-10 text-base font-black rounded-2xl active:scale-95 shadow-2xl"
                >
                  Setup Business Profile
                  <ArrowRight className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" />
                </Button>
                <div className="flex items-center gap-3 px-6 py-3 rounded-2xl border border-slate-200 text-slate-400">
                  <Clock className="w-4 h-4" />
                  <span className="text-xs font-bold uppercase tracking-wider">Takes about 5 mins</span>
                </div>
              </div>
            </div>

            {/* Right: Illustration */}
            <div className="relative group hidden lg:block animate-in fade-in zoom-in duration-1000 delay-200">
              <div className="absolute inset-0 bg-gradient-to-tr from-violet-500/20 to-blue-500/20 rounded-[3rem] blur-3xl group-hover:scale-105 transition-transform duration-700" />
              <div className="relative glass-card p-4 rounded-[3rem] border-white/60 shadow-2xl">
                <img 
                  src="/onboarding_illustration_1775117121192.png" 
                  alt="Onboarding" 
                  className="w-full h-auto rounded-[2.5rem] brightness-105 drop-shadow-2xl"
                />
                
                {/* Float Indicators */}
                <div className="absolute -top-6 -right-6 glass p-4 rounded-2xl shadow-xl animate-bounce duration-[3000ms]">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-green-500 rounded-full flex items-center justify-center text-white font-bold">
                      ✓
                    </div>
                    <div>
                      <div className="text-[10px] font-black text-slate-400 uppercase">Status</div>
                      <div className="text-sm font-black text-slate-900 leading-tight">BP Number Verified</div>
                    </div>
                  </div>
                </div>

                <div className="absolute -bottom-8 -left-8 glass p-5 rounded-2xl shadow-xl animate-pulse">
                  <div className="flex items-center gap-4">
                    <div className="p-2 bg-blue-50 rounded-xl border border-blue-100">
                      <RefreshCw className="w-5 h-5 text-blue-600 animate-spin" />
                    </div>
                    <div>
                      <div className="text-[10px] font-black text-slate-400 uppercase">Synchronizing</div>
                      <div className="text-sm font-black text-slate-900 leading-tight">FDMS Device Active</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-8 pb-12">
        {showTimeAlert && (
          <div className="mb-4">
            <Alert variant="destructive" className="bg-amber-50 border-amber-200 text-amber-800">
              <Clock className="h-4 w-4" />
              <AlertTitle>Fiscal Day is still Open</AlertTitle>
              <AlertDescription>
                It is past 5:00 PM. Please remember to <Link href="/zimra-settings" className="font-bold underline">Close the Fiscal Day</Link> to ensure compliance.
              </AlertDescription>
            </Alert>
          </div>
        )}
        <div className="flex justify-between items-end">
          <div>
            <h1 className="text-3xl font-display font-black text-slate-900 tracking-tight uppercase">Dashboard</h1>
            <p className="text-slate-500 font-medium italic mt-1">Financial overview for the current fiscal year</p>
          </div>
          <div className="flex items-center gap-4">
            <BranchPickerModal
              companyId={selectedCompany?.id || 0}
              selectedBranchId={selectedBranchId}
              onSelect={(id) => setSelectedBranchId(id)}
              trigger={
                <Button variant="outline" size="sm" className="h-9 px-4 gap-2 bg-white border-slate-200 text-slate-700 hover:bg-slate-50 transition-colors shadow-sm rounded-xl">
                  <Store className="h-4 w-4 text-primary" />
                  <span className="text-xs font-black uppercase tracking-widest">
                    {selectedBranchId ? "Switch Branch" : "Select Branch"}
                  </span>
                </Button>
              }
            />

            {currencies && currencies.length > 0 && (
              <Select value={reportCurrencyCode} onValueChange={setReportCurrencyCode}>
                <SelectTrigger className="w-[120px] bg-white border-slate-200">
                  <SelectValue placeholder="Currency" />
                </SelectTrigger>
                <SelectContent>
                  {currencies.map(c => (
                    <SelectItem key={c.id} value={c.code}>{c.code}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <div className="hidden sm:flex bg-white px-4 py-2 rounded-2xl border border-slate-100 shadow-sm items-center gap-2">
              <CalendarDays className="w-4 h-4 text-primary" />
              <span className="text-xs font-black uppercase tracking-widest text-slate-700">Fiscal Year {new Date().getFullYear()}</span>
            </div>
          </div>
        </div>

        {/* Quick Links */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Link href="/invoices?new=true" className="flex items-center gap-3 p-4 bg-white rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-all hover:border-primary/20 group">
            <div className="p-2 bg-primary/10 rounded-xl group-hover:bg-primary/20 transition-colors">
              <Plus className="w-5 h-5 text-primary" />
            </div>
            <span className="font-bold text-slate-700 text-sm">New Invoice</span>
          </Link>
          <Link href="/customers" className="flex items-center gap-3 p-4 bg-white rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-all hover:border-blue-500/20 group">
            <div className="p-2 bg-blue-500/10 rounded-xl group-hover:bg-blue-500/20 transition-colors">
              <Users className="w-5 h-5 text-blue-600" />
            </div>
            <span className="font-bold text-slate-700 text-sm">Customers</span>
          </Link>
          <Link href="/products" className="flex items-center gap-3 p-4 bg-white rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-all hover:border-emerald-500/20 group">
            <div className="p-2 bg-emerald-500/10 rounded-xl group-hover:bg-emerald-500/20 transition-colors">
              <ShoppingCart className="w-5 h-5 text-emerald-600" />
            </div>
            <span className="font-bold text-slate-700 text-sm">Products</span>
          </Link>
          <Link href="/settings" className="flex items-center gap-3 p-4 bg-white rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-all hover:border-purple-500/20 group">
            <div className="p-2 bg-purple-500/10 rounded-xl group-hover:bg-purple-500/20 transition-colors">
              <Settings className="w-5 h-5 text-purple-600" />
            </div>
            <span className="font-bold text-slate-700 text-sm">Settings</span>
          </Link>
        </div>

        {/* Total Receivables Section */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          <Card className="lg:col-span-1 glass-card border-none shadow-xl bg-gradient-to-br from-slate-900 to-slate-800 text-white overflow-hidden relative">
            <div className="absolute top-0 right-0 w-32 h-32 bg-primary/10 rounded-full -mr-16 -mt-16 blur-3xl opacity-50" />
            <CardHeader className="pb-2 relative z-10">
              <CardTitle className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Total Receivables</CardTitle>
            </CardHeader>
            <CardContent className="relative z-10">
              <div className="text-4xl font-black font-display mb-1">{formatCurrency(aging?.total || 0)}</div>
              <div className="flex items-center gap-2 text-xs font-bold text-slate-400">
                <Clock className="w-3 h-3" />
                <span>Across all categories</span>
              </div>
            </CardContent>
          </Card>

          <div className="lg:col-span-3 grid grid-cols-2 sm:grid-cols-5 gap-4">
            {[
              { label: "Current", value: aging?.current, color: "text-emerald-600", bg: "bg-emerald-50" },
              { label: "1-15 Days", value: aging?.days1_15, color: "text-blue-600", bg: "bg-blue-50" },
              { label: "16-30 Days", value: aging?.days16_30, color: "text-amber-600", bg: "bg-amber-50" },
              { label: "31-45 Days", value: aging?.days31_45, color: "text-orange-600", bg: "bg-orange-50" },
              { label: "Above 45 Days", value: aging?.above45, color: "text-rose-600", bg: "bg-rose-50" },
            ].map((item, i) => (
              <Card key={i} className="border-none shadow-sm hover:shadow-md transition-all rounded-2xl overflow-hidden bg-white">
                <CardContent className="p-4 flex flex-col justify-between h-full">
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-2">{item.label}</p>
                  <p className={cn("text-lg font-black font-display", item.color)}>
                    {formatCurrency(item.value || 0)}
                  </p>
                  <div className={cn("w-full h-1 mt-3 rounded-full opacity-30", item.bg.replace('50', '200'))} />
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* Operational Retail Metrics [NEW] */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="border-none shadow-xl rounded-3xl bg-white overflow-hidden group hover:scale-[1.02] transition-transform duration-300">
            <CardHeader className="pb-2">
              <CardTitle className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-2">
                <ShoppingCart className="w-3 h-3 text-blue-500" /> Avg. Transaction (ATV)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-black font-display text-slate-900">
                {formatCurrency(operationalMetrics?.atv || 0)}
              </div>
              <p className="text-[10px] text-slate-500 mt-1 font-medium italic">Average spend per customer</p>
            </CardContent>
          </Card>

          <Card className="border-none shadow-xl rounded-3xl bg-white overflow-hidden group hover:scale-[1.02] transition-transform duration-300">
            <CardHeader className="pb-2">
              <CardTitle className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-2">
                <TrendingUp className="w-3 h-3 text-emerald-500" /> Gross Profit Margin
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-black font-display text-emerald-600">
                {Math.round(operationalMetrics?.profitMargin || 0)}%
              </div>
              <div className="w-full h-1.5 bg-slate-100 rounded-full mt-2 overflow-hidden">
                <div 
                  className="h-full bg-emerald-500 rounded-full" 
                  style={{ width: `${Math.min(100, operationalMetrics?.profitMargin || 0)}%` }}
                />
              </div>
            </CardContent>
          </Card>

          <Card className="border-none shadow-xl rounded-3xl bg-white overflow-hidden group hover:scale-[1.02] transition-transform duration-300">
            <CardHeader className="pb-2">
              <CardTitle className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-2">
                <ShoppingBag className="w-3 h-3 text-purple-500" /> Items per Receipt
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-black font-display text-slate-900">
                {(operationalMetrics?.itemsPerReceipt || 0).toFixed(1)}
              </div>
              <p className="text-[10px] text-slate-500 mt-1 font-medium italic">Average items per basket</p>
            </CardContent>
          </Card>
        </div>

        {/* Charts & Fiscal Summary */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <Card className="lg:col-span-2 border-none shadow-xl rounded-3xl overflow-hidden bg-white">
            <CardHeader className="border-b border-slate-50 flex flex-row items-center justify-between pb-4">
              <div>
                <CardTitle className="text-sm font-black uppercase tracking-widest text-slate-900">Sales and Expenses</CardTitle>
                <p className="text-xs text-slate-400 font-medium mt-1">Monthly performance trend</p>
              </div>
              <div className="flex gap-4">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-primary" />
                  <span className="text-[10px] font-bold uppercase text-slate-500">Sales</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-rose-500" />
                  <span className="text-[10px] font-bold uppercase text-slate-500">Expenses</span>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-8">
              <div className="h-[350px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={fiscalStats?.monthlyData || []}>
                    <defs>
                      <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.1}/>
                        <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                      </linearGradient>
                      <linearGradient id="colorExp" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.1}/>
                        <stop offset="95%" stopColor="#f43f5e" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis 
                      dataKey="month" 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{fill: '#94a3b8', fontSize: 10, fontWeight: 700}}
                      dy={10}
                    />
                    <YAxis 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{fill: '#94a3b8', fontSize: 10, fontWeight: 700}}
                      tickFormatter={(val) => consolidatedSymbol + val}
                    />
                    <Tooltip 
                      contentStyle={{borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', fontSize: '12px'}}
                      cursor={{stroke: 'hsl(var(--primary))', strokeWidth: 2, strokeDasharray: '5 5'}}
                    />
                    <Area type="monotone" dataKey="sales" stroke="hsl(var(--primary))" strokeWidth={3} fillOpacity={1} fill="url(#colorSales)" />
                    <Area type="monotone" dataKey="expenses" stroke="#f43f5e" strokeWidth={3} fillOpacity={1} fill="url(#colorExp)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Hourly Distribution [NEW] */}
          <Card className="border-none shadow-xl rounded-3xl overflow-hidden bg-white">
            <CardHeader className="pb-2">
              <CardTitle className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-2">
                <Clock className="w-3 h-3 text-primary" /> Hourly Sales Heatmap
              </CardTitle>
            </CardHeader>
            <CardContent>
                <div className="h-[300px] w-full mt-4">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={hourlySales?.filter(d => d.total > 0) || []}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis 
                        dataKey="hour" 
                        tickFormatter={(h) => `${h}:00`}
                        axisLine={false}
                        tickLine={false}
                        tick={{fill: '#94a3b8', fontSize: 9, fontWeight: 700}}
                      />
                      <YAxis hide />
                      <Tooltip 
                        contentStyle={{borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)'}}
                        formatter={(val: number) => [formatCurrency(val), "Sales"]}
                        labelFormatter={(h) => `${h}:00`}
                      />
                      <Bar dataKey="total" radius={[4, 4, 0, 0]}>
                        {hourlySales?.filter(d => d.total > 0).map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={index % 2 === 0 ? "hsl(var(--primary))" : "hsl(var(--primary) / 0.6)"} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
            </CardContent>
          </Card>

          <div className="space-y-6">
            <Card className="border-none shadow-xl rounded-3xl bg-white p-6">
              <CardTitle className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-6 flex items-center gap-2">
                <Receipt className="w-3 h-3 text-primary" /> Fiscal Year Summary
              </CardTitle>
              
              <div className="space-y-4">
                {[
                  { label: "Total Sales", value: fiscalStats?.totalSales, color: "text-slate-900", icon: TrendingUp, iconColor: "text-emerald-500" },
                  { label: "Total Receipts", value: fiscalStats?.totalReceipts, color: "text-primary", icon: Receipt, iconColor: "text-primary" },
                  { label: "Total Expenses", value: fiscalStats?.totalExpenses, color: "text-rose-600", icon: ArrowDownRight, iconColor: "text-rose-500" },
                ].map((item, i) => (
                  <div key={i} className="bg-slate-50 p-4 rounded-2xl flex items-center justify-between group hover:bg-slate-100 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className={cn("p-2 rounded-xl bg-white shadow-sm", item.iconColor.replace('text', 'bg').replace('500', '50'))}>
                        <item.icon className={cn("w-4 h-4", item.iconColor)} />
                      </div>
                      <span className="text-xs font-bold text-slate-500 uppercase tracking-tight">{item.label}</span>
                    </div>
                    <span className={cn("text-lg font-black font-display tracking-tight", item.color)}>
                      {formatCurrency(item.value || 0)}
                    </span>
                  </div>
                ))}
              </div>

              {/* Estimated Net */}
              <div className="mt-8 bg-primary/5 p-4 rounded-2xl border border-primary/10">
                <div className="flex justify-between items-end">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-primary/60 mb-1">Estimated Net</p>
                    <p className="text-2xl font-black text-primary font-display">
                      {formatCurrency((fiscalStats?.totalSales || 0) - (fiscalStats?.totalExpenses || 0))}
                    </p>
                  </div>
                  <div className="p-2 bg-primary rounded-xl">
                    <TrendingUp className="w-5 h-5 text-white" />
                  </div>
                </div>
              </div>
            </Card>

            {/* Recent Invoices Section [NEW] */}
            <Card className="lg:col-span-3 border-none shadow-xl rounded-3xl overflow-hidden bg-white">
              <CardHeader className="border-b border-slate-50 flex flex-row items-center justify-between pb-4 px-6 pt-6">
                <div>
                  <CardTitle className="text-sm font-black uppercase tracking-widest text-slate-900">Recent Invoices</CardTitle>
                  <p className="text-xs text-slate-400 font-medium mt-1">Your most recent billing activity</p>
                </div>
                <Link href="/invoices">
                  <Button variant="ghost" size="sm" className="text-[10px] font-black uppercase tracking-widest text-primary hover:bg-primary/5">
                    View All Invoices <ArrowRight className="w-3 h-3 ml-2" />
                  </Button>
                </Link>
              </CardHeader>
              <CardContent className="p-0">
                {!invoices || invoices.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-slate-400">
                    <Receipt className="w-12 h-12 text-slate-100 mb-4" />
                    <p className="text-sm font-bold">No invoices found yet</p>
                    <p className="text-[10px] uppercase tracking-widest mt-1">Start by creating your first sale</p>
                    <Link href="/invoices/new" className="mt-4">
                      <Button size="sm" className="btn-gradient rounded-xl px-6">Create Invoice</Button>
                    </Link>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-50/50">
                          <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Invoice #</th>
                          <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Customer</th>
                          <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Date</th>
                          <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400 text-right">Amount</th>
                          <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Status</th>
                          <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {invoices.map((inv: any) => (
                          <tr key={inv.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors group cursor-pointer" onClick={() => setLocation(`/invoices/${inv.id}`)}>
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-black font-mono text-slate-900">{inv.invoiceNumber}</span>
                                {inv.fiscalCode && <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]" />}
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              <span className="text-xs font-bold text-slate-600">{inv.customer?.name || "Walk-in Customer"}</span>
                            </td>
                            <td className="px-6 py-4">
                              <span className="text-[11px] text-slate-400 font-medium italic">
                                {inv.issueDate ? format(new Date(inv.issueDate), "dd MMM yyyy") : "—"}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-right">
                              <span className="text-xs font-black text-slate-900">{inv.currency} {Number(inv.total).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                            </td>
                            <td className="px-6 py-4">
                              <StatusBadge status={inv.status} />
                            </td>
                            <td className="px-6 py-4 text-right">
                              <ArrowRight className="w-4 h-4 text-slate-200 group-hover:text-primary group-hover:translate-x-1 transition-all" />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>

            <div className="space-y-6">
              <div className="flex items-center justify-between px-1">
                <CardTitle className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-2">
                  <ShieldCheck className="w-3 h-3 text-primary" /> Fiscal Control Center
                </CardTitle>
                <Link href="/zimra-settings" className="text-[10px] font-bold text-primary hover:underline uppercase tracking-tighter">Advanced Settings</Link>
              </div>

              {/* Day Management (Open/Close/Reports) */}
              <DayManagementControls company={selectedCompany} variant="light" />
              
              <div className="grid grid-cols-2 gap-4">
                <Card className={cn("border-none shadow-sm rounded-2xl p-4 transition-all hover:shadow-md", activeCompany?.vatRegistered ? "bg-emerald-50/50" : "bg-slate-50")}>
                  <p className={cn("text-[9px] font-black uppercase tracking-widest mb-1.5", activeCompany?.vatRegistered ? "text-emerald-600/60" : "text-slate-500")}>VAT Status</p>
                  <div className="flex items-center gap-2">
                    <div className={cn("w-2 h-2 rounded-full", activeCompany?.vatRegistered ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" : "bg-slate-400")} />
                    <span className={cn("text-xs font-black uppercase tracking-tight", activeCompany?.vatRegistered ? "text-emerald-700" : "text-slate-600")}>
                      {activeCompany?.vatRegistered ? "Registered" : "Not Registered"}
                    </span>
                  </div>
                </Card>

                <Card className={cn("border-none shadow-sm rounded-2xl p-4 transition-all hover:shadow-md", selectedCompany?.fdmsDeviceId ? "bg-blue-50/50" : "bg-amber-50/50")}>
                  <p className={cn("text-[9px] font-black uppercase tracking-widest mb-1.5", selectedCompany?.fdmsDeviceId ? "text-blue-600/60" : "text-amber-600/60")}>Fiscal Device</p>
                  <div className="flex items-center gap-2">
                    <Server className={cn("w-3 h-3", selectedCompany?.fdmsDeviceId ? "text-blue-500" : "text-amber-500")} />
                    <span className={cn("text-[10px] font-black uppercase tracking-tight truncate", selectedCompany?.fdmsDeviceId ? "text-blue-700" : "text-amber-700")}>
                      {selectedCompany?.fdmsDeviceSerialNo ? selectedCompany.fdmsDeviceSerialNo.substring(0, 10) + '...' : "Not Configured"}
                    </span>
                  </div>
                </Card>

                <Card className={cn("border-none shadow-sm rounded-2xl p-4 transition-all hover:shadow-md", pingSuccess ? "bg-emerald-50/50" : "bg-rose-50/50")}>
                  <p className={cn("text-[9px] font-black uppercase tracking-widest mb-1.5", pingSuccess ? "text-emerald-600/60" : "text-rose-600/60")}>Zimra Server</p>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className={cn("w-2 h-2 rounded-full", pingSuccess ? "bg-emerald-500 animate-pulse" : "bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.4)]")} />
                      <span className={cn("text-xs font-black uppercase tracking-tight", pingSuccess ? "text-emerald-700" : "text-rose-700")}>
                        {isPinging ? "..." : (pingSuccess ? "Online" : "Offline")}
                      </span>
                    </div>
                    <Button variant="ghost" size="icon" className="h-6 w-6 hover:bg-white/50" onClick={() => pingZimra()} disabled={isPinging}>
                      <RefreshCw className={cn("w-3 h-3", isPinging ? "animate-spin text-slate-400" : "text-slate-500")} />
                    </Button>
                  </div>
                </Card>

                <Card className={cn("border-none shadow-sm rounded-2xl p-4 transition-all hover:shadow-md", activeCompany?.apiKey ? "bg-indigo-50/50" : "bg-slate-50")}>
                  <p className={cn("text-[9px] font-black uppercase tracking-widest mb-1.5", activeCompany?.apiKey ? "text-indigo-600/60" : "text-slate-500")}>API Interface</p>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Key className={cn("w-3 h-3", activeCompany?.apiKey ? "text-indigo-500" : "text-slate-400")} />
                      <span className={cn("text-xs font-black uppercase tracking-tight", activeCompany?.apiKey ? "text-indigo-700" : "text-slate-600")}>
                        {activeCompany?.apiKey ? "Active" : "Ready"}
                      </span>
                    </div>
                    <Link href="/settings?tab=pos">
                      <Button variant="ghost" size="icon" className="h-6 w-6 hover:bg-white/50">
                        <ArrowUpRight className="w-3 h-3 text-slate-400" />
                      </Button>
                    </Link>
                  </div>
                </Card>
              </div>
            </div>

            {/* Inventory / Stock Alerts */}
            {stockAlerts && stockAlerts.length > 0 && (
              <Card className="border-none shadow-xl rounded-3xl bg-white p-6 transition-all hover:shadow-2xl">
                <CardTitle className="text-[10px] font-black uppercase tracking-widest text-rose-500 mb-6 flex items-center gap-2">
                  <AlertCircle className="w-3 h-3" /> Low Stock Inventory
                </CardTitle>
                <div className="space-y-4">
                  {stockAlerts.slice(0, 5).map((item, i) => (
                    <div key={i} className="flex justify-between items-center group">
                      <div className="flex flex-col">
                        <span className="text-[13px] font-bold text-slate-800 group-hover:text-primary transition-colors">{item.name}</span>
                        <span className="text-[10px] text-slate-400 font-medium italic">{item.categoryName || "General"}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="flex flex-col items-end">
                          <span className={cn("text-sm font-black", Number(item.stockLevel) <= 0 ? "text-rose-600" : "text-amber-600")}>
                            {Number(item.stockLevel).toFixed(0)}
                          </span>
                          <span className="text-[8px] font-black uppercase tracking-widest text-slate-400">In Stock</span>
                        </div>
                        <ArrowRight className="w-3.5 h-3.5 text-slate-200 group-hover:text-primary transition-all group-hover:translate-x-1" />
                      </div>
                    </div>
                  ))}
                  <Link href="/inventory">
                    <Button variant="ghost" className="w-full h-8 mt-2 text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-primary hover:bg-primary/5">
                      View All Inventory
                    </Button>
                  </Link>
                </div>
              </Card>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}
