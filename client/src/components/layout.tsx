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
  RefreshCw,
  Bell,
  Search
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
import { useState, useEffect, useMemo } from "react";
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

export function Layout({
  children,
  hideHeaderTitle = false,
  headerTitle,
  headerSubtitle,
}: {
  children: React.ReactNode;
  hideHeaderTitle?: boolean;
  headerTitle?: string;
  headerSubtitle?: string;
}) {
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
        { icon: Package, label: "Stock Counts", href: "/inventory/stock-counts" },
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
        { icon: CreditCard, label: "Cash Collection", href: "/reports/cash-collection" },
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
  const pageMeta = useMemo(() => {
    const search = typeof window !== "undefined" ? window.location.search : "";

    if (location.startsWith("/dashboard")) return { title: "Dashboard", subtitle: "" };
    if (location.startsWith("/invoices/new")) return { title: "Create Invoice", subtitle: "Prepare and fiscalise a customer invoice." };
    if (location.match(/^\/invoices\/\d+/)) return { title: "Invoice Details", subtitle: "Review, print, fiscalise, and manage invoice payments." };
    if (location.startsWith("/invoices")) return { title: "Invoices", subtitle: "Manage, track, and fiscalise customer invoices." };
    if (location.startsWith("/quotations/new")) return { title: "Create Quotation", subtitle: "Prepare a customer quotation before invoicing." };
    if (location.startsWith("/quotations")) return { title: "Quotations", subtitle: "Create, manage, and convert customer quotations." };
    if (location.startsWith("/recurring")) return { title: "Recurring Invoices", subtitle: "Manage scheduled billing and repeat invoices." };
    if (location.startsWith("/payments-received")) return { title: "Payments Received", subtitle: "Track customer payments and invoice balances." };
    if (location.startsWith("/customers/")) return { title: "Customer Details", subtitle: "Review customer history, invoices, and statements." };
    if (location.startsWith("/customers")) return { title: "Customers", subtitle: "Manage your client base and customer records." };
    if (location.startsWith("/suppliers")) return { title: "Suppliers", subtitle: "Manage supplier records and procurement contacts." };
    if (location.startsWith("/products")) return { title: "Products", subtitle: "Manage inventory items, pricing, tax, and stock controls." };
    if (location.startsWith("/services")) return { title: "Services", subtitle: "Manage service offerings for invoices and sales." };
    if (location.startsWith("/inventory/adjustments")) return { title: "Stock Adjustments", subtitle: "Record corrections, shrinkage, damage, and stock movements." };
    if (location.startsWith("/inventory/stock-counts")) return { title: "Stock Counts", subtitle: "Run and review physical inventory counts." };
    if (location.startsWith("/inventory/bulk-adjust")) return { title: "Bulk Adjustment", subtitle: "Apply inventory changes across multiple products." };
    if (location.startsWith("/inventory/stock-take")) return { title: "Stock Take", subtitle: "Count inventory and reconcile stock positions." };
    if (location.startsWith("/inventory/account")) return { title: "Goods Received", subtitle: "Track received goods and inventory account movements." };
    if (location.startsWith("/inventory/grvs")) return { title: "Goods Received Voucher", subtitle: "Review received goods and supplier delivery details." };
    if (location.startsWith("/inventory")) return { title: "Stock Ledger", subtitle: "Review inventory transactions and stock movement history." };
    if (location.startsWith("/expenses")) return { title: "Expenses", subtitle: "Track operating expenses and business costs." };
    if (location.startsWith("/tax-config")) return { title: "Tax Configuration", subtitle: "Manage ZIMRA fiscalisation and tax categories." };
    if (location.startsWith("/settings")) {
      if (search.includes("tab=zimra")) return { title: "ZIMRA Device", subtitle: "Configure fiscal device credentials and FDMS connectivity." };
      if (search.includes("tab=team")) return { title: "Team Management", subtitle: "Manage users, roles, and business access." };
      if (search.includes("tab=pos")) return { title: "POS Configuration", subtitle: "Configure tills, printing, and point-of-sale preferences." };
      if (search.includes("tab=currencies")) return { title: "Currencies", subtitle: "Manage currency settings and exchange rates." };
      return { title: "Settings", subtitle: "Manage company profile, security, compliance, and system preferences." };
    }
    if (location.startsWith("/currencies")) return { title: "Currencies", subtitle: "Manage currency settings and exchange rates." };
    if (location.startsWith("/team-settings")) return { title: "Team Management", subtitle: "Manage users, roles, and business access." };
    if (location.startsWith("/subscription")) return { title: "Subscription & Licensing", subtitle: "Manage hardware bindings for ZIMRA production access." };
    if (location.startsWith("/profile")) return { title: "User Profile", subtitle: "Manage your account, security, and preferences." };
    if (location.startsWith("/zimra-logs")) return { title: "Transaction Logs", subtitle: "Review FDMS communication and fiscal submission history." };
    if (location.startsWith("/zimra-settings")) return { title: "ZIMRA Settings", subtitle: "Manage fiscal device and ZIMRA configuration." };
    if (location.startsWith("/fdms-test")) return { title: "FDMS Test", subtitle: "Test fiscal device connectivity and FDMS responses." };
    if (location.startsWith("/reports/financial")) return { title: "Profit & Loss", subtitle: "Review revenue, expenses, and profitability." };
    if (location.startsWith("/reports/daily")) return { title: "Daily Sales", subtitle: "Review daily sales and fiscal activity." };
    if (location.startsWith("/reports/inventory")) return { title: "Stock Reports", subtitle: "Analyse inventory movement, valuation, and stock health." };
    if (location.startsWith("/reports/tax")) return { title: "Tax & ZIMRA Reports", subtitle: "Review fiscal, tax, and compliance reporting." };
    if (location.startsWith("/reports/customer-statements")) return { title: "Customer Statements", subtitle: "Generate and review customer account statements." };
    if (location.startsWith("/reports/cash-collection")) return { title: "Cash Collection", subtitle: "Track cash collection and payment activity." };
    if (location.startsWith("/reports/pos")) return { title: "POS Reports", subtitle: "Review point-of-sale performance and cashier activity." };
    if (location.startsWith("/reports")) return { title: "Reports", subtitle: "Analyse sales, customers, taxes, inventory, and financial performance." };
    if (location.startsWith("/restaurant/orders")) return { title: "Live Orders", subtitle: "Monitor restaurant orders and service flow." };
    if (location.startsWith("/restaurant/kds")) return { title: "Kitchen Display", subtitle: "Manage kitchen order preparation and fulfilment." };
    if (location.startsWith("/restaurant/layout")) return { title: "Floor Plan", subtitle: "Manage restaurant tables and layout." };
    if (location.startsWith("/pos/my-sales")) return { title: "My Sales History", subtitle: "Review your recent POS sales and receipts." };
    if (location.startsWith("/pos/all-sales")) return { title: "Recent Sales", subtitle: "Review recent POS transactions and receipt activity." };
    if (location.startsWith("/pos")) return { title: "POS Terminal", subtitle: "Process sales, payments, and fiscal receipts." };
    return { title: "Dashboard", subtitle: "" };
  }, [location]);
  const pageTitle = headerTitle || pageMeta.title;
  const pageSubtitle = headerSubtitle !== undefined ? headerSubtitle : pageMeta.subtitle;

  if (!user) return null;

  return (
    <>
      <style>{`
        .fz-admin,
        .admin-blueprint {
          font-family: var(--font-sans) !important;
        }
        .fz-admin .font-display,
        .admin-blueprint .font-display {
          font-family: var(--font-display) !important;
        }
        .admin-shell {
          background: #F8FAFC;
          color: #0F172A;
        }

        .admin-blueprint .admin-sidebar {
          background: #FFFFFF !important;
          color: #0F172A !important;
          border-right: 1px solid #E5E7EB !important;
          box-shadow: none !important;
        }
        .admin-blueprint .admin-sidebar .text-slate-800 { color: #0F172A !important; }
        .admin-blueprint .admin-sidebar .text-slate-500 { color: #374151 !important; }
        .admin-blueprint .admin-sidebar .bg-slate-100 { background: #F1F5F9 !important; }
        .admin-blueprint .admin-sidebar .border-slate-50,
        .admin-blueprint .admin-sidebar .border-slate-100,
        .admin-blueprint .admin-sidebar .border-slate-200,
        .admin-blueprint .admin-sidebar .border-slate-200\\/60 {
          border-color: #E5E7EB !important;
        }
        .admin-blueprint .admin-sidebar .bg-slate-900 {
          background: #EEF4FF !important;
          color: #2563EB !important;
          box-shadow: none !important;
        }
        .admin-blueprint .admin-sidebar .hover\\:bg-slate-50:hover {
          background: #F3F4F6 !important;
        }
        .admin-blueprint .nav-item {
          transform: translateX(0);
          transition: transform 0.2s ease, background-color 0.2s ease, color 0.2s ease;
        }
        .admin-blueprint .nav-item:hover {
          transform: translateX(1px);
        }

        .sidebar-scroller {
          overflow: visible !important;
          scrollbar-width: none;
        }
        .sidebar-scroller::-webkit-scrollbar {
          display: none;
        }
        
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
        .admin-blueprint .admin-header {
          background: rgba(248, 250, 252, 0.94) !important;
          border-bottom: none !important;
          backdrop-filter: blur(16px);
        }
        .admin-blueprint .page-shell {
          border-radius: 0 !important;
          border: none !important;
          background: transparent !important;
          box-shadow: none !important;
        }
        .admin-blueprint .shadcn-card {
          background: #FFFFFF;
          border-color: #E5E7EB;
          box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
        }
        .admin-blueprint label {
          color: #334155;
          font-weight: 650;
        }
        .page-shell > div > h1 {
          letter-spacing: -0.02em;
          font-weight: 750;
        }
      `}</style>

      <div className={cn(
        "min-h-screen bg-slate-50 flex transition-all duration-300 admin-shell admin-blueprint",
        currentBrand === "fiscalzone" ? "fz-admin" : "font-sans selection:bg-blue-500/20"
      )}>

      {/* Primary Navigation Sidebar */}
      <aside className={cn(
        "admin-sidebar bg-white border-r border-slate-200/60 shadow-[1px_0_10px_rgba(0,0,0,0.02)] flex min-h-screen shrink-0 flex-col fixed inset-y-0 left-0 z-50 transition-all duration-500 ease-in-out lg:relative lg:inset-auto lg:translate-x-0",
        isSidebarCollapsed ? "w-20" : "w-[240px]",
        isMobileMenuOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
      )}>
        <div className={cn(
          "relative h-[88px] flex items-center bg-white",
          isSidebarCollapsed ? "px-3 justify-center" : "px-4"
        )}>
          <div className={cn("flex items-center gap-2 transition-all w-full", isSidebarCollapsed ? "justify-center" : "px-1")}>
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
              <img src={brand.logo} alt={brand.name} className={cn("transition-all rounded-lg", isSidebarCollapsed ? "h-6 w-6 object-contain" : "h-8")} />
            )}
          </div>

        </div>

        <nav className={cn("flex-1 py-4 sidebar-scroller", isSidebarCollapsed ? "px-2" : "px-3")}>
          <div className="space-y-2">
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
                          "w-11 h-11 rounded-[10px] flex items-center justify-center cursor-pointer transition-all duration-300 relative group collapsed-item mx-auto mb-1 nav-item",
                        isActiveGroup ? "bg-[#EEF4FF] text-[#2563EB] shadow-none" : "text-[#1F2937] hover:bg-slate-100"
                        )}>
                          <item.icon className="w-[18px] h-[18px]" />
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
                                "flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-all text-[13px] font-medium mb-1 nav-sub-item",
                                isChildActive ? "bg-[#EEF4FF] text-[#2563EB]" : "text-[#6B7280] hover:bg-slate-50 hover:text-[#111827]"
                              )}>
                                <child.icon className="w-[18px] h-[18px]" />
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
                          "flex items-center w-full px-3 py-2.5 rounded-[10px] text-[13px] font-semibold transition-all duration-200 cursor-pointer select-none group nav-item",
                          isActiveGroup
                            ? "bg-[#EEF4FF] text-[#2563EB] shadow-none"
                            : "text-[#1F2937] hover:bg-slate-50 hover:text-[#111827]"
                        )}>
                          <div className="flex items-center gap-3 min-w-0">
                            <item.icon className={cn("w-[18px] h-[18px] shrink-0", isActiveGroup ? "text-[#2563EB]" : "text-[#6B7280] group-hover:text-[#111827]")} />
                            <span className="font-display tracking-tight text-[13px]">{item.label}</span>
                          </div>
                          <span className="ml-auto pl-3">
                            <svg
                              className={cn("w-4 h-4 transition-transform", isOpen ? "rotate-180" : "rotate-0")}
                              viewBox="0 0 20 20"
                              fill="currentColor"
                              aria-hidden="true"
                            >
                              <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.168l3.71-3.94a.75.75 0 1 1 1.08 1.04l-4.25 4.5a.75.75 0 0 1-1.08 0l-4.25-4.5a.75.75 0 0 1 .02-1.06Z" clipRule="evenodd" />
                            </svg>
                          </span>
                        </div>
                      </CollapsibleTrigger>
                      <CollapsibleContent className="pb-1 transition-all">
                        <div className="ml-5 pl-3 border-l-2 border-slate-100 space-y-1 mt-1 nav-dropdown">
                          {item.children.map((child) => {
                            const isChildActive = location + window.location.search === child.href || (location === child.href && !child.href.includes("?"));
                            return (
                              <Link key={child.label} href={child.href}>
                                <div className={cn(
                                  "flex items-center gap-3 px-2.5 py-2 rounded-lg text-[12.5px] font-semibold transition-all duration-150 cursor-pointer nav-sub-item",
                                  isChildActive
                                    ? "bg-[#EEF4FF] text-[#2563EB]"
                                    : "text-[#6B7280] hover:text-[#111827] hover:bg-slate-50/50"
                                )}>
                                  <child.icon className={cn("w-[18px] h-[18px] shrink-0", isChildActive ? "text-[#2563EB]" : "text-[#9CA3AF]")} />
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
                      "w-11 h-11 rounded-[10px] flex items-center justify-center cursor-pointer transition-all duration-300 relative group collapsed-item mx-auto mb-1 nav-item",
                      isActive ? "bg-[#EEF4FF] text-[#2563EB] shadow-none" : "text-[#1F2937] hover:bg-slate-100"
                    )}>
                      <item.icon className="w-[18px] h-[18px]" />
                      <span className="nav-item-tooltip shadow-2xl">{item.label}</span>
                    </div>
                  </Link>
                );
              }

              return (
                <div key={item.label}>
                  <Link href={item.href!}>
                    <div className={cn(
                      "flex items-center gap-3 px-3 py-2.5 rounded-[10px] text-[13px] font-semibold transition-all duration-200 cursor-pointer select-none group nav-item",
                      isActive
                        ? "bg-[#EEF4FF] text-[#2563EB] shadow-none"
                        : "text-[#1F2937] hover:bg-slate-50 hover:text-[#111827]"
                    )}>
                      <item.icon className={cn("w-[18px] h-[18px] shrink-0", isActive ? "text-[#2563EB]" : "text-[#6B7280] group-hover:text-[#111827]")} />
                      <span className="font-display tracking-tight">{item.label}</span>
                    </div>
                  </Link>
                </div>
              );
            })}
          </div>
        </nav>

        <div className={cn("sticky bottom-0 z-20 mt-auto border-t border-[#E5E7EB] bg-white", isSidebarCollapsed ? "p-2" : "p-3 space-y-3")}>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <div className={cn(
                "transition-all cursor-pointer group active:scale-95 duration-200 bg-white border border-[#E5E7EB] hover:bg-white",
                isSidebarCollapsed
                  ? "mx-auto flex h-11 w-11 items-center justify-center rounded-[10px]"
                  : "rounded-xl p-2.5"
              )}>
                <div className={cn("flex items-center", isSidebarCollapsed ? "justify-center" : "gap-3")}>
                  <div className={cn(
                    "rounded-full bg-white border border-slate-200 flex items-center justify-center text-slate-300 overflow-hidden shadow-sm shrink-0",
                    isSidebarCollapsed ? "h-8 w-8" : "w-10 h-10"
                  )}>
                    {selectedCompany?.logoUrl ? (
                      <img src={selectedCompany.logoUrl} alt="Logo" className="w-full h-full object-contain" />
                    ) : (
                      <Building2 className={cn("text-slate-400", isSidebarCollapsed ? "w-4 h-4" : "w-5 h-5")} />
                    )}
                  </div>
                  {!isSidebarCollapsed && (
                    <div className="overflow-hidden flex-1 text-left">
                      <p className="text-sm font-black text-slate-800 truncate leading-none mb-1 font-display group-hover:text-primary transition-colors">
                        {selectedCompany ? selectedCompany.name : "Setup"}
                      </p>
                      {selectedCompany && (
                        <div className="flex items-center gap-1.5">
                          <div className={cn("w-1.5 h-1.5 rounded-full", selectedCompany.zimraEnvironment === "production" ? "bg-emerald-500" : "bg-amber-500")} />
                          <span className={cn("text-[8px] font-black uppercase tracking-widest", selectedCompany.zimraEnvironment === "production" ? "text-emerald-500" : "text-amber-500")}>
                            {selectedCompany.zimraEnvironment === "production" ? "Production" : "Test Environment"}
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" side={isSidebarCollapsed ? "right" : "top"} className="w-60 max-h-[400px] overflow-y-auto bg-white border-slate-200 rounded-xl shadow-2xl p-1 z-[60]">
              <div className="px-1 py-1">
                {companies?.map((company) => (
                  <DropdownMenuItem
                    key={company.id}
                    onClick={() => handleCompanyChange(company.id)}
                    className={cn(
                      "flex items-center gap-2.5 p-2 rounded-lg cursor-pointer transition-all duration-200 mb-0.5",
                      selectedCompanyId === company.id ? "bg-[#EEF4FF] text-[#2563EB] shadow-none" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                    )}
                  >
                    <div className={`w-6 h-6 rounded flex items-center justify-center text-[8px] font-bold ${selectedCompanyId === company.id ? "bg-[#DBEAFE] text-[#1D4ED8]" : "bg-slate-100 text-slate-400"}`}>
                      {company.logoUrl ? <img src={company.logoUrl} className="w-full h-full object-contain rounded" /> : company.name.substring(0, 2).toUpperCase()}
                    </div>
                    <span className="truncate flex-1 font-medium font-display text-[14px]">{company.name}</span>
                    {selectedCompanyId === company.id && <div className="w-1.5 h-1.5 rounded-full bg-[#2563EB]" />}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuItem onClick={() => setLocation("/onboarding")} className="flex items-center justify-center gap-2 p-2.5 text-white bg-[#2563EB] font-bold cursor-pointer hover:bg-[#1D4ED8] rounded-[10px] shadow-sm active:scale-95 transition-all text-xs">
                  <Plus className="w-3.5 h-3.5" />
                  <span>Register Enterprise</span>
                </DropdownMenuItem>
              </div>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </aside>

      {/* Main Administrative Workspace */}
      <div className="flex-1 flex flex-col min-h-screen min-w-0 transition-all duration-500 ease-in-out">

        {/* Top Header */}
        <header className="admin-header h-[80px] bg-[#F8FAFC] flex items-center justify-between gap-3 px-4 sm:px-6 z-40 sticky top-0 relative">
          {/* Mobile Menu Toggle */}
          <Button
            variant="ghost"
            size="icon"
            className="mr-auto lg:hidden bg-slate-100 border border-slate-200 rounded-xl"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          >
            {isMobileMenuOpen ? <X className="w-5 h-5 text-slate-600" /> : <Menu className="w-5 h-5 text-slate-600" />}
          </Button>

          <div className="hidden min-w-0 flex-1 items-center gap-4 lg:flex">
            <div className="min-w-0">
              <h1 className="truncate text-[22px] font-bold leading-tight tracking-[-0.015em] text-[#0F172A]">{pageTitle}</h1>
              {pageSubtitle ? (
                <p className="mt-1 truncate text-[13px] font-medium text-[#64748B]">{pageSubtitle}</p>
              ) : null}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="hidden xl:flex items-center h-10 px-3 rounded-[10px] border border-[#E5E7EB] bg-white min-w-[280px] shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
              <Search className="w-4 h-4 text-[#64748B]" />
              <input
                aria-label="Search"
                placeholder="Search anything..."
                className="ml-2 flex-1 text-sm text-[#0f172a] placeholder:text-[#94a3b8] bg-transparent outline-none"
              />
              <span className="text-[11px] font-semibold text-[#64748B] bg-[#F8FAFC] border border-[#E5E7EB] rounded px-2 py-0.5">Ctrl + K</span>
            </div>

            <Button variant="ghost" size="icon" className="h-10 w-10 rounded-full border border-[#E5E7EB] bg-white text-[#64748B] shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
              <Bell className="w-4 h-4" />
            </Button>

            <div className="hidden md:flex items-center gap-2">
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
                  <div className="h-9 w-9 rounded-full bg-[#2563EB] flex items-center justify-center text-white font-semibold text-sm">
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
        <main className={cn(
          "flex-1 max-w-[1600px] w-full mx-auto",
          "px-4 pb-4 pt-1 sm:px-7 sm:pb-8 sm:pt-1"
        )}>
          {isImmersiveRoute ? (
            children
          ) : (
            <section className="page-shell p-0">
              {children}
            </section>
          )}
        </main>
      </div>
    </div>
    </>
  );
}
