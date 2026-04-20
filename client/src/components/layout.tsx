import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useCompanies } from "@/hooks/use-companies";
import {
  LayoutDashboard,
  FileText,
  ClipboardList,
  Users,
  Package,
  Settings,
  LogOut,
  Building2,
  Plus,
  Calculator,
  Briefcase,
  Coins,
  Server,
  UserCog,
  BarChart3,
  Activity,
  CreditCard,
  MonitorCheck,
  TrendingUp,
  ShieldCheck,
  History,
  Receipt,
  Truck,
  Menu,
  Utensils,
  X,
  ArrowRightLeft,
  RefreshCw
} from "lucide-react";
import { useBranding } from "@/hooks/use-branding";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { BranchSwitcher } from "./branch-switcher";
import { DeviceStatusWidget } from "./device-status-widget";

type NavItem = {
  icon: any;
  label: string;
  href?: string;
  children?: {
    icon: any;
    label: string;
    href: string;
    children?: {
      icon: any;
      label: string;
      href: string;
    }[];
  }[];
};

import { useActiveCompany } from "@/hooks/use-active-company";

export function Layout({ children }: { children: React.ReactNode }) {
  const [location, setLocation] = useLocation();
  const { user, logout } = useAuth();
  const { data: companies } = useCompanies(!!user, user?.id ?? null);
  const { activeCompany, activeCompanyId, setCompany } = useActiveCompany(!!user, user?.id ?? null);
  const { brand, currentBrand } = useBranding();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  // Close mobile menu on location change
  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [location]);

  const handleCompanyChange = (id: number) => {
    setCompany(id);
  };

  const selectedCompanyId = activeCompanyId;
  const selectedCompany = activeCompany;

  const activeRole = (activeCompany as any)?.role;
  const roleLabel = user?.isSuperAdmin
    ? "Super Admin"
    : activeRole
      ? String(activeRole).charAt(0).toUpperCase() + String(activeRole).slice(1)
      : "User";

  const allNavItems: NavItem[] = [
    { icon: LayoutDashboard, label: "Dashboard", href: "/dashboard" },
    { icon: MonitorCheck, label: "POS Terminal", href: "/pos" },
    {
      icon: FileText,
      label: "Invoices & Billing",
      children: [
        { icon: FileText, label: "Invoices", href: "/invoices" },
        { icon: ClipboardList, label: "Quotations", href: "/quotations" },
        { icon: RefreshCw, label: "Recurring Invoices", href: "/recurring" },
        { icon: CreditCard, label: "Payments Received", href: "/payments-received" },
      ]
    },
    {
      icon: Users,
      label: "Customers",
      children: [
        { icon: Users, label: "Customer List", href: "/customers" },
        { icon: FileText, label: "Statements", href: "/reports/customer-statements" },
      ]
    },
    {
      icon: Package,
      label: "Inventory",
      children: [
        { icon: Package, label: "Products", href: "/products" },
        { icon: Briefcase, label: "Services", href: "/services" },
        { icon: LayoutDashboard, label: "Goods Received", href: "/inventory/account" },
        { icon: ArrowRightLeft, label: "Stock Adjustments", href: "/inventory/adjustments" },
        { icon: History, label: "Stock Ledger", href: "/inventory" },
        { icon: Truck, label: "Suppliers", href: "/suppliers" },
      ]
    },
    { icon: Calculator, label: "Expenses", href: "/expenses" },
    {
      icon: BarChart3,
      label: "Reports",
      children: [
        { icon: BarChart3, label: "Reports Module", href: "/reports-module" },
        { icon: BarChart3, label: "Analytics", href: "/reports?tab=analytics" },
        { icon: Receipt, label: "Daily Sales", href: "/reports/daily" },
        { icon: TrendingUp, label: "Profit & Loss", href: "/reports/financial" },
        { icon: FileText, label: "Customer Statements", href: "/reports/customer-statements" },
        { icon: Package, label: "Stock Reports", href: "/reports/inventory" },
        { icon: FileText, label: "Tax & ZIMRA", href: "/reports/tax" },
      ]
    },
    {
      icon: Utensils,
      label: "Restaurant",
      children: [
        { icon: LayoutDashboard, label: "Live Orders", href: "/restaurant/orders" },
        { icon: MonitorCheck, label: "Kitchen Display", href: "/restaurant/kds" },
        { icon: Building2, label: "Floor Plan", href: "/restaurant/layout" },
      ]
    },
    {
      icon: ShieldCheck,
      label: "Compliance",
      children: [
        { icon: Server, label: "ZIMRA Device", href: "/settings?tab=zimra" },
        { icon: ClipboardList, label: "Transaction Logs", href: "/zimra-logs" },
        { icon: Activity, label: "FDMS Test", href: "/fdms-test" },
      ]
    },
    {
      icon: Settings,
      label: "Administration",
      children: [
        { icon: UserCog, label: "Team Management", href: "/settings?tab=team" },
        { icon: Settings, label: "General Settings", href: "/settings?tab=profile" },
        { icon: MonitorCheck, label: "POS Configuration", href: "/settings?tab=pos" },
        { icon: Coins, label: "Currencies", href: "/settings?tab=currencies" },
        { icon: CreditCard, label: "Subscription", href: "/subscription" },
      ]
    },
  ];

  const isCashier = !user?.isSuperAdmin && activeRole === 'cashier';

  const navItems = isCashier
    ? [
      {
        icon: MonitorCheck,
        label: "POS Terminal",
        href: "/pos"
      },
      {
        icon: Receipt,
        label: "My Sales History",
        href: "/pos/my-sales"
      }
    ]
    : allNavItems;

  const immersiveRoutes = ["/pos", "/restaurant/kds", "/order-status"];
  const isImmersiveRoute = immersiveRoutes.some((route) => location.startsWith(route));

  if (!user) return null;

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;700;800;900&family=Bricolage+Grotesque:opsz,wght@12..96,400;12..96,600;12..96,700;12..96,800&display=swap');
        
        .fz-admin { font-family: 'Outfit', sans-serif !important; }
        .fz-admin .font-display { font-family: 'Bricolage Grotesque', sans-serif !important; }
        .admin-shell {
          background:
            radial-gradient(980px 320px at 18% -120px, rgba(99,102,241,0.10), transparent 62%),
            radial-gradient(820px 280px at 92% -130px, rgba(14,165,233,0.08), transparent 62%),
            #f8fafc;
        }
        
        .sidebar-scroller::-webkit-scrollbar {
          width: 2px;
          opacity: 0;
          transition: opacity 0.2s;
        }
        .sidebar-scroller:hover::-webkit-scrollbar {
          opacity: 1;
        }
        .sidebar-scroller::-webkit-scrollbar-thumb {
          background: rgba(15,23,42,0.3);
          border-radius: 999px;
          min-height: 24px;
        }
        
        .fz-sidebar { 
          background: #020617 !important; 
          color: white !important; 
          border-right: 1px solid rgba(255,255,255,0.05) !important;
        }
        .fz-sidebar .sidebar-scroller::-webkit-scrollbar-thumb {
          background: rgba(255,255,255,0.35) !important;
        }
        .fz-sidebar .text-slate-800 { color: #f8fafc !important; }
        .fz-sidebar .text-slate-500 { color: #94a3b8 !important; }
        
        .nav-item-tooltip {
          position: absolute;
          left: 100%;
          margin-left: 1rem;
          padding: 0.5rem 0.75rem;
          background: #1e293b;
          color: white;
          border-radius: 0.5rem;
          font-size: 0.75rem;
          font-weight: 700;
          white-space: nowrap;
          pointer-events: none;
          opacity: 0;
          transform: translateX(-10px);
          transition: all 0.2s;
          box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
          z-index: 100;
        }
        .collapsed-item:hover .nav-item-tooltip {
          opacity: 1;
          transform: translateX(0);
        }
        .admin-header::before {
          content: "";
          position: absolute;
          left: -14px;
          top: 0;
          height: 100%;
          width: 14px;
          background: linear-gradient(180deg, rgba(255,255,255,0.92), rgba(255,255,255,0.84));
          border-top-left-radius: 12px;
          border-bottom-left-radius: 12px;
          border-left: 1px solid rgba(148,163,184,0.18);
          border-top: 1px solid rgba(148,163,184,0.12);
          border-bottom: 1px solid rgba(148,163,184,0.12);
        }
        .page-shell > div > h1 {
          letter-spacing: -0.02em;
          font-weight: 900;
        }
      `}</style>

      <div className={cn(
        "min-h-screen bg-slate-50 flex transition-all duration-300 admin-shell",
        currentBrand === "fiscalzone" ? "fz-admin" : "font-sans selection:bg-violet-500/20"
      )}>

      {/* Primary Navigation Sidebar */}
      <aside className={cn(
        "bg-white border-r border-slate-200/60 shadow-[1px_0_10px_rgba(0,0,0,0.02)] flex flex-col fixed inset-y-0 left-0 z-50 transition-all duration-500 ease-in-out",
        isSidebarCollapsed ? "w-20" : "w-64",
        isMobileMenuOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
        currentBrand === "fiscalzone" && "fz-sidebar border-none"
      )}>
        <div className={cn(
          "flex flex-col border-b border-slate-50 relative",
          currentBrand === "fiscalzone" ? "bg-slate-950/20" : "bg-white/50",
          isSidebarCollapsed ? "p-3 items-center" : "p-4"
        )}>
          <div className={cn("flex items-center gap-2 mb-3 transition-all", isSidebarCollapsed ? "justify-center" : "px-1")}>
            {currentBrand === "fiscalzone" ? (
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-white shadow-lg shadow-primary/20">
                  <MonitorCheck className="w-4 h-4" />
                </div>
                {!isSidebarCollapsed && (
                  <span className="text-xl font-black text-slate-800 tracking-tight font-display">
                    Fiscal<span className="text-primary">Zone</span>
                  </span>
                )}
              </div>
            ) : (
              <img src={brand.logo} alt={brand.name} className={cn("transition-all", isSidebarCollapsed ? "h-6 w-6 object-contain" : "h-8")} />
            )}
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <div className={cn(
                "rounded-xl transition-all cursor-pointer group active:scale-95 duration-200",
                currentBrand === "fiscalzone" ? "bg-white/5 border-white/10 hover:bg-white/10" : "bg-slate-50 border border-slate-100 hover:bg-white",
                isSidebarCollapsed ? "p-2" : "p-2.5"
              )}>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-slate-300 overflow-hidden shadow-sm shrink-0">
                    {selectedCompany?.logoUrl ? (
                      <img src={selectedCompany.logoUrl} alt="Logo" className="w-full h-full object-contain" />
                    ) : (
                      <Building2 className="w-5 h-5 text-slate-400" />
                    )}
                  </div>
                  {!isSidebarCollapsed && (
                    <div className="overflow-hidden flex-1 text-left">
                      <p className="text-sm font-black text-slate-800 truncate leading-none mb-1 font-display group-hover:text-primary transition-colors">
                        {selectedCompany ? selectedCompany.name : "Setup"}
                      </p>
                      {selectedCompany && (
                        <div className="flex items-center gap-1.5">
                          <div className={cn("w-1.5 h-1.5 rounded-full", selectedCompany.zimraEnvironment === 'production' ? "bg-emerald-500" : "bg-amber-500")} />
                          <span className={cn("text-[8px] font-black uppercase tracking-widest", selectedCompany.zimraEnvironment === 'production' ? "text-emerald-500" : "text-amber-500")}>
                            {selectedCompany.zimraEnvironment === 'production' ? 'Production' : 'Test Environment'}
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-60 max-h-[400px] overflow-y-auto bg-white border-slate-200 rounded-xl shadow-2xl p-1 z-[60]">
              <div className="px-1 py-1">
                {companies?.map((company) => (
                  <DropdownMenuItem
                    key={company.id}
                    onClick={() => handleCompanyChange(company.id)}
                    className={cn(
                      "flex items-center gap-2.5 p-2 rounded-lg cursor-pointer transition-all duration-200 mb-0.5",
                      selectedCompanyId === company.id ? "bg-slate-900 text-white shadow-md" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                    )}
                  >
                    <div className={`w-6 h-6 rounded flex items-center justify-center text-[8px] font-bold ${selectedCompanyId === company.id ? 'bg-white/10 text-white' : 'bg-slate-100 text-slate-400'}`}>
                      {company.logoUrl ? <img src={company.logoUrl} className="w-full h-full object-contain rounded" /> : company.name.substring(0, 2).toUpperCase()}
                    </div>
                    <span className="truncate flex-1 font-bold font-display text-[12px]">{company.name}</span>
                    {selectedCompanyId === company.id && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuItem onClick={() => setLocation("/onboarding")} className="flex items-center justify-center gap-2 p-2.5 text-white bg-primary font-bold cursor-pointer hover:bg-primary/90 rounded-lg shadow-lg shadow-primary/10 active:scale-95 transition-all text-xs">
                  <Plus className="w-3.5 h-3.5" />
                  <span>Register Enterprise</span>
                </DropdownMenuItem>
              </div>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <nav className={cn("flex-1 py-4 overflow-y-auto sidebar-scroller custom-scrollbar", isSidebarCollapsed ? "px-2" : "px-3")}>
          <div className="space-y-1">
            {navItems.map((item) => {

              if (item.children) {
                const isActiveGroup = item.children.some(child =>
                  location + window.location.search === child.href || (location === child.href && !child.href.includes("?"))
                );

                const [isOpen, setIsOpen] = useState(isActiveGroup);

                useEffect(() => {
                  if (isActiveGroup) setIsOpen(true);
                }, [isActiveGroup]);

                if (isSidebarCollapsed) {
                  return (
                    <DropdownMenu key={item.label}>
                      <DropdownMenuTrigger asChild>
                        <div className={cn(
                          "w-11 h-11 rounded-xl flex items-center justify-center cursor-pointer transition-all duration-300 relative group collapsed-item mx-auto mb-1",
                          isActiveGroup ? "bg-slate-900 text-white shadow-lg" : "text-slate-400 hover:bg-slate-100"
                        )}>
                          <item.icon className="w-5 h-5" />
                          <span className="nav-item-tooltip shadow-2xl">{item.label}</span>
                        </div>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent side="right" align="start" className="w-56 bg-white border-slate-200 rounded-xl shadow-2xl p-1 ml-4 animate-in fade-in slide-in-from-left-2 duration-200">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-3 py-2 border-b border-slate-50 mb-1">{item.label}</p>
                        {item.children.map((child) => {
                          const isChildActive = location + window.location.search === child.href || (location === child.href && !child.href.includes("?"));
                          return (
                            <Link key={child.label} href={child.href}>
                              <div className={cn(
                                "flex items-center gap-3 p-2.5 rounded-lg cursor-pointer transition-all text-xs font-bold mb-0.5",
                                isChildActive ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                              )}>
                                <child.icon className="w-3.5 h-3.5" />
                                <span>{child.label}</span>
                              </div>
                            </Link>
                          );
                        })}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  );
                }

                return (
                  <div key={item.label}>
                    <Collapsible open={isOpen} onOpenChange={setIsOpen} className="space-y-1">
                      <CollapsibleTrigger asChild>
                        <div className={cn(
                          "flex items-center w-full px-3 py-2 rounded-xl text-sm font-bold transition-all duration-200 cursor-pointer select-none group",
                          isActiveGroup
                            ? "bg-slate-900 text-white shadow-lg shadow-slate-900/10"
                            : "text-slate-500 hover:bg-slate-50 hover:text-slate-800"
                        )}>
                          <div className="flex items-center gap-3">
                            <div className={cn(
                              "w-8 h-8 rounded-xl flex items-center justify-center transition-colors shrink-0",
                              isActiveGroup ? "bg-white/10 text-white" : "bg-slate-100 text-slate-400 group-hover:bg-slate-200 group-hover:text-slate-600"
                            )}>
                              <item.icon className="w-4 h-4" />
                            </div>
                            <span className="font-display tracking-tight text-[14px]">{item.label}</span>
                          </div>
                        </div>
                      </CollapsibleTrigger>
                      <CollapsibleContent className="pb-1 transition-all">
                        <div className="ml-4 pl-4 border-l-2 border-slate-100 space-y-1 mt-1">
                          {item.children.map((child) => {
                            const isChildActive = location + window.location.search === child.href || (location === child.href && !child.href.includes("?"));
                            return (
                              <Link key={child.label} href={child.href}>
                                <div className={cn(
                                  "flex items-center gap-3 px-3 py-2 rounded-xl text-[13px] font-bold transition-all duration-150 cursor-pointer",
                                  isChildActive
                                    ? "bg-slate-100 text-slate-900"
                                    : "text-slate-500 hover:text-slate-900 hover:bg-slate-50/50"
                                )}>
                                  <child.icon className={cn("w-4 h-4 shrink-0", isChildActive ? "text-slate-400" : "text-slate-400")} />
                                  <span className="truncate">{child.label}</span>
                                </div>
                              </Link>
                            );
                          })}
                        </div>
                      </CollapsibleContent>
                    </Collapsible>
                  </div>
                );
              }

              const isActive = location === item.href;
              
              if (isSidebarCollapsed) {
                return (
                  <Link key={item.label} href={item.href!}>
                    <div className={cn(
                      "w-11 h-11 rounded-xl flex items-center justify-center cursor-pointer transition-all duration-300 relative group collapsed-item mx-auto mb-1",
                      isActive ? "bg-slate-900 text-white shadow-lg" : "text-slate-400 hover:bg-slate-100"
                    )}>
                      <item.icon className="w-5 h-5" />
                      <span className="nav-item-tooltip shadow-2xl">{item.label}</span>
                    </div>
                  </Link>
                );
              }

              return (
                <div key={item.label}>
                  <Link href={item.href!}>
                    <div className={cn(
                      "flex items-center gap-3 px-3 py-2 rounded-xl text-[14px] font-bold transition-all duration-200 cursor-pointer select-none group",
                      isActive
                        ? "bg-slate-900 text-white shadow-xl shadow-slate-900/20"
                        : "text-slate-500 hover:bg-slate-50 hover:text-slate-800"
                    )}>
                      <div className={cn(
                        "w-8 h-8 rounded-xl flex items-center justify-center shrink-0 transition-colors",
                        isActive ? "bg-white/10 text-white" : "bg-slate-100 text-slate-400 group-hover:bg-slate-200 group-hover:text-slate-600"
                      )}>
                        <item.icon className="w-4 h-4" />
                      </div>
                      <span className="font-display tracking-tight">{item.label}</span>
                    </div>
                  </Link>
                </div>
              );
            })}
          </div>
        </nav>
      </aside>

      {/* Main Administrative Workspace */}
      <div className={cn("flex-1 flex flex-col min-h-screen transition-all duration-500 ease-in-out", isSidebarCollapsed ? "lg:ml-20" : "lg:ml-64")}>

        {/* Top Header */}
        <header className="admin-header h-16 bg-white/90 border-b border-slate-200/60 flex items-center justify-end gap-3 px-4 sm:px-6 z-40 sticky top-0 shadow-sm relative backdrop-blur-xl">
          {/* Mobile Menu Toggle */}
          <Button
            variant="ghost"
            size="icon"
            className="mr-auto lg:hidden bg-slate-100 border border-slate-200 rounded-xl"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          >
            {isMobileMenuOpen ? <X className="w-5 h-5 text-slate-600" /> : <Menu className="w-5 h-5 text-slate-600" />}
          </Button>

          <div className="flex items-center gap-2">
            <div className="hidden md:flex items-center gap-2">
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-slate-200 bg-slate-50">
                <ShieldCheck className="w-3.5 h-3.5 text-slate-600" />
                <span className="text-[10px] font-black uppercase tracking-wide text-slate-700">
                  {roleLabel}
                </span>
              </div>
              {selectedCompany?.id && <DeviceStatusWidget companyId={selectedCompany.id} />}
            </div>
            <BranchSwitcher />

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="h-10 w-10 rounded-full p-0 border-2 border-white hover:border-violet-200 transition-all hover:scale-105 active:scale-95 shadow-sm">
                  <Avatar className="h-9 w-9">
                    <AvatarFallback className="bg-slate-900 text-white text-xs font-black">
                      {user.name?.substring(0, 2).toUpperCase() || "US"}
                    </AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64 bg-white rounded-2xl shadow-2xl border-slate-200 p-2 mt-2">
                <div className="flex items-center justify-start gap-3 p-4 bg-slate-50 rounded-xl mb-2">
                  <div className="h-10 w-10 rounded-full bg-slate-900 flex items-center justify-center text-white font-black text-sm">
                    {user.name?.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex flex-col space-y-0.5 leading-none">
                    <p className="font-bold text-slate-900 font-display">{user.name || "User"}</p>
                    <p className="w-[140px] truncate text-[10px] font-bold text-slate-400 uppercase tracking-wider">{user.email || "No Email"}</p>
                  </div>
                </div>
                <DropdownMenuItem onClick={() => setLocation("/dashboard")} className="p-3 rounded-xl font-bold text-slate-600 cursor-pointer hover:bg-slate-50 hover:text-slate-900 transition-all">
                  <LayoutDashboard className="mr-3 h-4 w-4" />
                  <span>Dashboard Overview</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setLocation("/settings")} className="p-3 rounded-xl font-bold text-slate-600 cursor-pointer hover:bg-slate-50 hover:text-slate-900 transition-all">
                  <Settings className="mr-3 h-4 w-4" />
                  <span>Security & Config</span>
                </DropdownMenuItem>
                <DropdownMenuItem className="p-3 rounded-xl font-bold text-red-600 focus:text-red-700 focus:bg-red-50 hover:bg-red-50 cursor-pointer active:scale-95 transition-all" onClick={() => logout()}>
                  <LogOut className="mr-3 h-4 w-4" />
                  <span>Sign Out Session</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        {/* Password Warning Banner */}
        {user && user.passwordChanged === false && (
          <div className="mx-4 sm:mx-6 mt-3 rounded-xl bg-amber-50 border border-amber-200/60 p-3.5 flex items-center justify-between shadow-sm">
            <div className="flex items-center gap-3 text-amber-800 text-sm font-medium">
              <div className="p-2 bg-amber-100 rounded-lg text-amber-600">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <span><strong>Security Alert:</strong> You are using a temporary password. Please update it immediately.</span>
            </div>
            <Button size="sm" className="h-9 px-4 text-xs font-bold bg-white text-amber-700 border border-amber-200 shadow-sm hover:bg-amber-100 hover:border-amber-300 rounded-lg" onClick={() => setLocation("/profile")}>
              Update Password
            </Button>
          </div>
        )}

        {/* Page Content */}
        <main className="flex-1 p-3 sm:p-5 pt-4 max-w-[1600px] w-full mx-auto">
          {isImmersiveRoute ? (
            children
          ) : (
            <section className="page-shell rounded-[1.5rem] border border-slate-200/70 bg-white/88 backdrop-blur-sm shadow-[0_10px_30px_rgba(15,23,42,0.06)] p-4 sm:p-5 lg:p-6">
              {children}
            </section>
          )}
        </main>
      </div>
    </div>
    </>
  );
}
