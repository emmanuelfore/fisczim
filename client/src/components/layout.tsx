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
  TrendingDown,
  LineChart,
  Target,
  ShieldCheck,
  History,
  Receipt,
  Truck,
  Menu,
  Utensils,
  X,
  ArrowRightLeft,
  Factory,
  RefreshCw,
  Bell,
  Search,
  Bus,
  MapPin,
  CalendarDays,
  Clock,
  ClipboardCheck,
  UserRoundCheck,
  BarChart2,
  Scale,
  Palette,
  FileSpreadsheet,
  PanelLeftClose,
  PanelLeftOpen,
  Eye,
  Construction,
  Wrench,
  Settings2,
  ShoppingBag,
  ShoppingCart,
  AlertTriangle,
} from "lucide-react";
import { useBranding } from "@/hooks/use-branding";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useState, useEffect, useMemo, useRef } from "react";
import { cn } from "@/lib/utils";
import { BranchSwitcher } from "./branch-switcher";
import { DeviceStatusWidget } from "./device-status-widget";
import { usePendingGdns } from "@/hooks/use-grvs";
import { useToast } from "@/hooks/use-toast";
import {
  isBusFeatureEnabled,
  normalizeBusSettings,
} from "@shared/bus-settings";
import { normalizeAppMode } from "@shared/app-mode";

type NavItem = {
  icon: any;
  label: string;
  href?: string;
  children?: {
    icon: any;
    label: string;
    href?: string;
    children?: {
      icon: any;
      label: string;
      href: string;
    }[];
  }[];
};

import { useActiveCompany } from "@/hooks/use-active-company";
import { usePermissions, usePendingApprovalsCount } from "@/hooks/use-permissions";

function filterNavItems(items: NavItem[], canAccessPath: (href: string) => boolean): NavItem[] {
  return items
    .map((item) => {
      if (item.children?.length) {
        const children = filterNavItems(item.children as NavItem[], canAccessPath) as NavItem["children"];
        if (!children?.length) return null;
        return { ...item, children };
      }
      if (item.href && !canAccessPath(item.href)) return null;
      return item;
    })
    .filter(Boolean) as NavItem[];
}

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
  const { activeCompany, activeCompanyId, setCompany } = useActiveCompany(
    !!user,
    user?.id ?? null,
  );
  const { brand, currentBrand } = useBranding();
  const { toast } = useToast();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [openNavGroups, setOpenNavGroups] = useState<Record<string, boolean>>(
    {},
  );
  const autoOpenedNavGroupsRef = useRef<Set<string>>(new Set());
  const [openSubNavGroups, setOpenSubNavGroups] = useState<Record<string, boolean>>({});
  const autoOpenedSubNavGroupsRef = useRef<Set<string>>(new Set());
  const seenPendingGdnCountRef = useRef<number | null>(null);

  // Close mobile menu on location change
  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [location]);

  useEffect(() => {
    if (typeof document === "undefined") return;

    const enhanceTables = () => {
      document.querySelectorAll("table").forEach((table) => {
        const headers = Array.from(table.querySelectorAll("thead th")).map(
          (header) => (header.textContent || "").replace(/\s+/g, " ").trim(),
        );
        if (!headers.some(Boolean)) return;

        table.setAttribute("data-mobile-cards", "true");
        table.querySelectorAll("tbody tr").forEach((row) => {
          Array.from(row.children).forEach((cell, index) => {
            if (!(cell instanceof HTMLElement)) return;
            const span = Number(cell.getAttribute("colspan") || "1");
            if (span > 1) {
              cell.dataset.mobileFull = "true";
              return;
            }
            const label = headers[index];
            if (label) cell.dataset.label = label;
          });
        });
      });
    };

    enhanceTables();
    const observer = new MutationObserver(enhanceTables);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });
    return () => observer.disconnect();
  }, [location]);

  const handleCompanyChange = (id: number) => {
    setCompany(id);
  };

  const selectedCompanyId = activeCompanyId;
  const selectedCompany = activeCompany;

  const activeRole = (activeCompany as any)?.role;
  const appMode = normalizeAppMode((activeCompany as any)?.appMode);
  const busSettings = normalizeBusSettings((activeCompany as any)?.busSettings);
  const isBusOnlyMode = busSettings.enabled || appMode === "bus_ticketing";
  const busOperationsChildren = [
    ...(isBusFeatureEnabled(busSettings, "tripManagement")
      ? [{ icon: Clock, label: "Trip Scheduling", href: "/bus/trips" }]
      : []),
  ];
  const busSetupChildren = [
    ...(isBusFeatureEnabled(busSettings, "fleetManagement") ||
    isBusFeatureEnabled(busSettings, "fareMatrix")
      ? [{ icon: Bus, label: "Fleet & Routes", href: "/bus/fleet" }]
      : []),
    ...(isBusFeatureEnabled(busSettings, "conductorManagement")
      ? [{ icon: UserRoundCheck, label: "Conductors", href: "/bus/conductors" }]
      : []),
  ];
  const busReportChildren = [
    ...(isBusFeatureEnabled(busSettings, "reports")
      ? [
          {
            icon: BarChart2,
            label: "Daily Report",
            href: "/bus/reports?mode=daily",
          },
          {
            icon: TrendingUp,
            label: "Range Report",
            href: "/bus/reports?mode=range",
          },
          {
            icon: UserRoundCheck,
            label: "Conductor Report",
            href: "/bus/reports?mode=conductor",
          },
        ]
      : []),
  ];
  const busSettingsChildren = [
    { icon: Settings, label: "App Mode", href: "/settings?tab=app-mode" },
    { icon: Bus, label: "Bus Module", href: "/settings?tab=bus-ticketing" },
  ];
  const roleLabel = user?.isSuperAdmin
    ? "Super Admin"
    : activeRole
      ? String(activeRole).charAt(0).toUpperCase() + String(activeRole).slice(1)
      : "User";
  const isSystemAdmin = String(user?.email || "").toLowerCase() === "admin@zimra.co.zw";
  const posNavItems: NavItem[] = [
    { icon: LayoutDashboard, label: "Dashboard", href: "/dashboard" },
    {
      icon: MonitorCheck,
      label: "Sales",
      children: [
        { icon: MonitorCheck, label: "POS Terminal", href: "/pos" },
        { icon: FileText, label: "Invoices", href: "/invoices" },
        {
          icon: Palette,
          label: "Invoice Templates",
          href: "/invoice-templates",
        },
        { icon: RefreshCw, label: "Recurring Invoices", href: "/recurring" },
        {
          icon: CreditCard,
          label: "Payments Received",
          href: "/payments-received",
        },
        { icon: Users, label: "Customer List", href: "/customers" },
        {
          icon: BarChart3,
          label: "Sales Reports",
          children: [
            { icon: LayoutDashboard, label: "Reports Hub", href: "/reports" },
            { icon: BarChart3, label: "Sales Summary", href: "/reports/sales" },
            { icon: Users, label: "Sales by Customer", href: "/reports/sales-by-customer" },
            { icon: Package, label: "Sales by Item", href: "/reports/sales-by-item" },
            { icon: Receipt, label: "Daily Sales Ledger", href: "/reports/daily" },
            { icon: MonitorCheck, label: "POS Reports", href: "/reports/pos" },
          ]
        },
        {
          icon: FileText,
          label: "Receivable Reports",
          children: [
            { icon: Clock, label: "AR Aging Summary", href: "/reports/ar-aging-summary" },
            { icon: Users, label: "Customer Balances", href: "/reports/customer-balance-summary" },
            { icon: FileText, label: "Receivable Details", href: "/reports/receivable-details" },
            { icon: FileText, label: "Customer Statements", href: "/reports/customer-statements" },
          ]
        },
        {
          icon: CreditCard,
          label: "Payment Reports",
          children: [
            { icon: CreditCard, label: "Payments Received", href: "/reports/payments-received" },
            { icon: Coins, label: "Cash Collection", href: "/reports/cash-collection" },
          ]
        },
      ],
    },
    {
      icon: ClipboardList,
      label: "Procurement",
      children: [
        {
          icon: ClipboardList,
          label: "Purchase Orders",
          href: "/inventory/purchase-orders",
        },
        {
          icon: ClipboardCheck,
          label: "Goods Received",
          href: "/inventory/account",
        },
        {
          icon: ArrowRightLeft,
          label: "Purchase Returns",
          href: "/inventory/purchase-returns",
        },
        { icon: Truck, label: "Suppliers", href: "/suppliers" },
        {
          icon: ShoppingCart,
          label: "Procurement Reports",
          children: [
            { icon: ShoppingCart, label: "Purchases Report", href: "/reports/purchase-report" },
          ]
        },
      ],
    },
    {
      icon: Package,
      label: "Inventory",
      children: [
        { icon: Package, label: "Products & Services", href: "/products" },
        {
          icon: ShieldCheck,
          label: "Serial & Warranty Items",
          href: "/serial-tracking",
        },
        {
          icon: ArrowRightLeft,
          label: "Stock Transfers",
          href: "/inventory/transfers",
        },
        {
          icon: MapPin,
          label: "Locations",
          href: "/inventory/locations",
        },
        
        {
          icon: ArrowRightLeft,
          label: "Stock Adjustments",
          href: "/inventory/adjustments",
        },
        {
          icon: History,
          label: "Past Adjustments",
          href: "/inventory/adjustments/report",
        },
        {
          icon: Package,
          label: "Stock Counts",
          href: "/inventory/stock-counts",
        },
        { icon: History, label: "Stock Ledger", href: "/inventory" },
        {
          icon: LineChart,
          label: "Inventory Reports",
          children: [
            { icon: Activity, label: "Transaction Ledger", href: "/inventory/reports/ledger" },
            { icon: Target, label: "Stock Overview", href: "/inventory/reports/overview" },
            { icon: History, label: "Historical Stock Balance", href: "/inventory/reports/historical" },
            { icon: AlertTriangle, label: "Dead Stock Report", href: "/inventory/reports/dead-stock" },
            { icon: ShoppingBag, label: "Stock on Hand", href: "/reports/stock-on-hand" },
            { icon: Activity, label: "Low Stock Alerts", href: "/reports/stock-alerts" },
            { icon: History, label: "Inventory Movements", href: "/reports/inventory-movements" },
            { icon: TrendingUp, label: "Profit Margins", href: "/reports/profit-margins-product" },
            { icon: Package, label: "Stock Movement", href: "/reports/stock-movement" },
          ]
        },
      ],
    },
    {
      icon: Factory,
      label: "Manufacturing",
      children: [
        { icon: LayoutDashboard, label: "Mfg Dashboard", href: "/manufacturing" },
        { icon: TrendingUp, label: "MRP Analysis", href: "/manufacturing/mrp" },
        { icon: Construction, label: "Bill of Materials", href: "/manufacturing/bom" },
        { icon: Wrench, label: "Work Orders", href: "/manufacturing/work-orders" },
        { icon: Building2, label: "Work Centers", href: "/manufacturing/work-centers" },
        { icon: ClipboardList, label: "Routings", href: "/manufacturing/routings" },
        { icon: Factory, label: "Production Runs", href: "/inventory/production" },
      ],
    },
    {
      icon: Calculator,
      label: "Finance",
      children: [
        {
          icon: LayoutDashboard,
          label: "Finance Dashboard",
          href: "/accounting/dashboard",
        },
        { icon: ClipboardList, label: "Chart of Accounts", href: "/accounting/coa" },
        { icon: History, label: "Journal Vouchers", href: "/accounting/journal" },
        { icon: CreditCard, label: "Cashbook", href: "/accounting/cashbook" },
        { icon: ArrowRightLeft, label: "Bank Reconciliation", href: "/accounting/reconciliation" },
        { icon: Receipt, label: "Supplier Bills", href: "/supplier-invoices" },
        { icon: Receipt, label: "Supplier Credit Notes", href: "/supplier-credit-notes" },
        { icon: ArrowRightLeft, label: "Payment Allocation", href: "/accounting/allocations" },
        { icon: Calculator, label: "Expenses", href: "/expenses" },
        {
          icon: Settings,
          label: "Configuration",
          children: [
            { icon: BarChart3, label: "Accounting Segments", href: "/accounting/segments" },
            { icon: CalendarDays, label: "Financial Periods", href: "/accounting/periods" },
            { icon: Scale, label: "Opening Balances", href: "/accounting/opening-balances" },
          ],
        },
        {
          icon: Calculator,
          label: "Financial Reports",
          children: [
            { icon: TrendingUp, label: "Profit & Loss", href: "/accounting/reports/financial?tab=pl" },
            { icon: TrendingUp, label: "Balance Sheet", href: "/accounting/reports/financial?tab=bs" },
            { icon: TrendingUp, label: "Cash Flow", href: "/accounting/reports/financial?tab=cf" },
            { icon: TrendingUp, label: "Trial Balance", href: "/accounting/reports/trial-balance" },
            { icon: History, label: "General Ledger", href: "/accounting/reports/ledger" },
          ]
        },
      ],
    },
    {
      icon: Briefcase,
      label: "Fixed Assets",
      children: [
        { icon: ClipboardList, label: "Asset Registry", href: "/accounting/fixed-assets" },
        { icon: History, label: "Depreciation Records", href: "/accounting/fixed-assets/depreciation" },
      ],
    },
    {
      icon: Briefcase,
      label: "HR & Payroll",
      children: [
        { icon: FileSpreadsheet, label: "Payroll Workbench", href: "/payroll" },
        { icon: Users, label: "Employees", href: "/payroll?tab=employees" },
        { icon: CalendarDays, label: "Leave", href: "/payroll?tab=leave" },
        {
          icon: CreditCard,
          label: "Loans & Advances",
          href: "/payroll?tab=loans",
        },
      ],
    },
    {
      icon: ShieldCheck,
      label: "Tax & Compliance",
      children: [
        { icon: Server, label: "ZIMRA Device Settings", href: "/settings?tab=zimra" },
        { icon: ClipboardList, label: "Transaction Logs", href: "/zimra-logs" },
        { icon: Activity, label: "FDMS Test", href: "/fdms-test" },
        { icon: FileText, label: "Tax & ZIMRA Report", href: "/reports/tax" },
        { icon: Coins, label: "VAT Returns", href: "/accounting/reports/vat-return" },
        {
          icon: ShieldCheck,
          label: "Tax Reports",
          children: [
            { icon: FileText, label: "Tax Summary", href: "/reports/tax-summary" },
            { icon: History, label: "Posting Audit Trail", href: "/accounting/audit-trail" },
          ]
        },
      ],
    },
    {
      icon: Utensils,
      label: "Restaurant",
      children: [
        {
          icon: LayoutDashboard,
          label: "Live Orders",
          href: "/restaurant/orders",
        },
        {
          icon: MonitorCheck,
          label: "Kitchen Display",
          href: "/restaurant/kds",
        },
        { icon: Building2, label: "Floor Plan", href: "/restaurant/layout" },
      ],
    },
    {
      icon: Settings,
      label: "Administration",
      children: [
        {
          icon: CalendarDays,
          label: "Operational Reports",
          children: [
            { icon: FileText, label: "Daily Report", href: "/reports/operational-daily" },
            { icon: FileText, label: "Weekly Report", href: "/reports/operational-weekly" },
            { icon: FileText, label: "Monthly Report", href: "/reports/operational-monthly" },
          ]
        },
        {
          icon: ClipboardCheck,
          label: "Approvals",
          href: "/approvals",
        },
        {
          icon: UserCog,
          label: "User Management",
          href: "/team-settings",
        },
        {
          icon: Settings,
          label: "Posting Setup",
          href: "/settings?tab=accounting",
        },
        {
          icon: Settings,
          label: "General Settings",
          href: "/settings",
        },
        ...(isSystemAdmin
          ? [
              {
                icon: Eye,
                label: "Super Admin Visibility",
                href: "/superadmin-visibility",
              },
            ]
          : []),
      ],
    },
  ];

  const restaurantNavItems: NavItem[] = [
    { icon: LayoutDashboard, label: "Dashboard", href: "/dashboard" },
    { icon: MonitorCheck, label: "Restaurant POS", href: "/pos" },
    {
      icon: Utensils,
      label: "Restaurant",
      children: [
        {
          icon: LayoutDashboard,
          label: "Live Orders",
          href: "/restaurant/orders",
        },
        {
          icon: MonitorCheck,
          label: "Kitchen Display",
          href: "/restaurant/kds",
        },
        { icon: Building2, label: "Floor Plan", href: "/restaurant/layout" },
      ],
    },
    { icon: Package, label: "Menu Items", href: "/products" },
    { icon: Truck, label: "Suppliers", href: "/suppliers" },
    { icon: Users, label: "Customers", href: "/customers" },
    {
      icon: BarChart3,
      label: "Reports",
      children: [
        { icon: LayoutDashboard, label: "Reports Dashboard", href: "/reports" },
        { icon: Receipt, label: "Daily Sales", href: "/reports/daily" },
        { icon: ShieldCheck, label: "Tax & ZIMRA Report", href: "/reports/tax" },
      ],
    },
    { icon: UserCog, label: "User Management", href: "/team-settings" },
    { icon: Settings, label: "Settings", href: "/settings?tab=app-mode" },
  ];

  const busNavItems: NavItem[] = [
    { icon: LayoutDashboard, label: "Bus Dashboard", href: "/bus/dashboard" },
    ...(busOperationsChildren.length > 0
      ? [
          {
            icon: CalendarDays,
            label: "Operations",
            children: busOperationsChildren,
          },
        ]
      : []),
    ...(busSetupChildren.length > 0
      ? [
          {
            icon: ClipboardCheck,
            label: "Setup",
            children: busSetupChildren,
          },
        ]
      : []),
    ...(busReportChildren.length > 0
      ? [
          {
            icon: BarChart3,
            label: "Reports",
            children: busReportChildren,
          },
        ]
      : []),
    { icon: UserCog, label: "User Management", href: "/team-settings" },
    { icon: Settings, label: "Bus Settings", children: busSettingsChildren },
  ];

  const allNavItems: NavItem[] = isBusOnlyMode
    ? busNavItems
    : appMode === "restaurant"
      ? restaurantNavItems
      : posNavItems;

  const { canAccessPath } = usePermissions();
  const { data: pendingApprovalCount = 0 } = usePendingApprovalsCount();
  const isCashier = !user?.isSuperAdmin && activeRole === "cashier";
  const { data: pendingGdns = [] } = usePendingGdns(
    isCashier ? 0 : selectedCompanyId || 0,
  );
  const pendingGdnCount = pendingGdns.length;

  useEffect(() => {
    if (isCashier) return;
    if (seenPendingGdnCountRef.current === null) {
      seenPendingGdnCountRef.current = pendingGdnCount;
      return;
    }
    if (pendingGdnCount > seenPendingGdnCountRef.current) {
      toast({
        title: "Pending GDN requires verification",
        description: `${pendingGdnCount} GDN${pendingGdnCount === 1 ? "" : "s"} waiting for admin confirmation.`,
      });
    }
    seenPendingGdnCountRef.current = pendingGdnCount;
  }, [isCashier, pendingGdnCount, toast]);

  const navItems = isCashier
    ? [
        {
          icon: MonitorCheck,
          label: "POS Terminal",
          href: "/pos",
        },
        {
          icon: Receipt,
          label: "My Sales History",
          href: "/pos/my-sales",
        },
      ]
    : filterNavItems(allNavItems, canAccessPath);

  const immersiveRoutes = ["/pos", "/restaurant/kds", "/order-status"];
  const isImmersiveRoute = immersiveRoutes.some((route) =>
    location.startsWith(route),
  );
  const pageMeta = useMemo(() => {
    const search = typeof window !== "undefined" ? window.location.search : "";

    if (location.startsWith("/dashboard"))
      return {
        title: "Dashboard",
        subtitle: "Review business performance, alerts, and daily activity.",
      };
    if (location.startsWith("/invoices/new"))
      return {
        title: "Create Invoice",
        subtitle: "Prepare, validate, and fiscalise a customer invoice.",
      };
    if (location.startsWith("/invoice-templates"))
      return {
        title: "Invoice Templates",
        subtitle:
          "Design branded invoice layouts and set your default template.",
      };
    if (location.match(/^\/invoices\/\d+/))
      return {
        title: "Invoice Details",
        subtitle: "Review, print, fiscalise, and manage invoice payments.",
      };
    if (location.startsWith("/invoices"))
      return {
        title: "Invoices",
        subtitle: "Manage, track, and fiscalise customer invoices.",
      };
    if (location.startsWith("/quotations/new"))
      return {
        title: "Create Quotation",
        subtitle: "Prepare a customer quotation before invoicing.",
      };
    if (location.startsWith("/quotations"))
      return {
        title: "Quotations",
        subtitle: "Create, manage, and convert customer quotations.",
      };
    if (location.startsWith("/recurring"))
      return {
        title: "Recurring Invoices",
        subtitle: "Manage scheduled billing and repeat invoices.",
      };
    if (location.startsWith("/payments/") && location.includes("/preview"))
      return {
        title: "Payment Receipt Preview",
        subtitle: "Preview, print, and download a customer payment receipt.",
      };
    if (location.startsWith("/payments-received"))
      return {
        title: "Payments Received",
        subtitle: "Track customer payments and invoice balances.",
      };
    if (location.startsWith("/customers/"))
      return {
        title: "Customer Details",
        subtitle: "Review customer history, invoices, and statements.",
      };
    if (location.startsWith("/customers"))
      return {
        title: "Customers",
        subtitle: "Manage your client base and customer records.",
      };
    if (location.startsWith("/suppliers"))
      return {
        title: "Suppliers",
        subtitle: "Manage supplier records and procurement contacts.",
      };
    if (location.startsWith("/products/bulk-adjust"))
      return {
        title: "Bulk Price Adjustment",
        subtitle: "Review and apply price changes across product groups.",
      };
    if (location.startsWith("/products"))
      return {
        title: "Products & Services",
        subtitle: "Manage inventory items, services, pricing, tax, and stock controls.",
      };
    if (location.startsWith("/serial-tracking"))
      return {
        title: "Serial & Warranty Items",
        subtitle:
          "Manage serialized products, warranties, lay-bys, and compatibility notes.",
      };
    if (location.startsWith("/services"))
      return {
        title: "Products & Services",
        subtitle: "Manage service offerings for invoices and sales.",
      };
    if (location.startsWith("/inventory/adjustments/report"))
      return {
        title: "Past Stock Adjustments",
        subtitle: "Review committed stock adjustment history and reasons.",
      };
    if (location.startsWith("/inventory/adjustments"))
      return {
        title: "Stock Adjustments",
        subtitle: "Record corrections, shrinkage, damage, and stock movements.",
      };
    if (location.startsWith("/inventory/production"))
      return {
        title: "Production",
        subtitle: "Convert raw materials into finished stock.",
      };
    if (location.startsWith("/inventory/stock-counts"))
      return {
        title: "Stock Counts",
        subtitle: "Run and review physical inventory counts.",
      };
    if (location.startsWith("/inventory/bulk-adjust"))
      return {
        title: "Bulk Adjustment",
        subtitle: "Apply inventory changes across multiple products.",
      };
    if (location.startsWith("/inventory/stock-take"))
      return {
        title: "Stock Take",
        subtitle: "Count inventory and reconcile stock positions.",
      };
    if (location.startsWith("/inventory/purchase-orders"))
      return {
        title: "Purchase Orders",
        subtitle:
          "Create and track supplier purchase orders before goods are received.",
      };
    if (location.startsWith("/inventory/purchase-returns"))
      return {
        title: "Purchase Returns",
        subtitle: "Manage and track returns to suppliers.",
      };
    if (location.startsWith("/inventory/account"))
      return {
        title: "Goods Received",
        subtitle: "Track received goods and inventory account movements.",
      };
    if (location.startsWith("/inventory/grvs"))
      return {
        title: "Goods Received Voucher",
        subtitle: "Review received goods and supplier delivery details.",
      };
    if (location.startsWith("/inventory/locations"))
      return {
        title: "Inventory Locations",
        subtitle: "Manage warehouses, branch stores, shop floors, and delivery vans. Stock is tracked per location.",
      };
    if (location.startsWith("/inventory"))
      return {
        title: "Stock Ledger",
        subtitle: "Review inventory transactions and stock movement history.",
      };
    if (location.startsWith("/supplier-credit-notes"))
      return {
        title: "Supplier Credit Notes",
        subtitle: "Manage and track accounts payable credit notes from suppliers.",
      };
    if (location.startsWith("/expenses"))
      return {
        title: "Expenses",
        subtitle: "Track operating expenses and business costs.",
      };
    if (location.startsWith("/payroll"))
      return {
        title: "Payroll & HR",
        subtitle:
          "Manage staff records, payroll runs, leave, loans, and statutory deductions.",
      };
    if (location.startsWith("/tax-config"))
      return {
        title: "Tax Configuration",
        subtitle: "Manage ZIMRA fiscalisation and tax categories.",
      };
    if (location.startsWith("/pos-settings"))
      return {
        title: "POS Configuration",
        subtitle: "Configure tills, printing, receipts, and sales controls.",
      };
    if (location.startsWith("/settings")) {
      if (search.includes("tab=zimra"))
        return {
          title: "ZIMRA Device",
          subtitle:
            "Configure fiscal device credentials and FDMS connectivity.",
        };
      if (search.includes("tab=team"))
        return {
          title: "Team Management",
          subtitle: "Manage users, roles, and business access.",
        };
      if (search.includes("tab=roles"))
        return {
          title: "Role Management",
          subtitle: "Define custom roles and permissions.",
        };
      if (search.includes("tab=approvals"))
        return {
          title: "Approval Policies",
          subtitle: "Configure which actions need approval.",
        };
      if (search.includes("tab=partnerships"))
        return {
          title: "Partnerships",
          subtitle: "Manage co-branded partners, logos, and revenue share rules.",
        };
      if (search.includes("tab=branches"))
        return {
          title: "Branch Setup",
          subtitle: "Manage physical locations and fiscal endpoints.",
        };
      if (search.includes("tab=cost-centers"))
        return {
          title: "Cost Center Setup",
          subtitle: "Manage cost centers used for budgeting and accounting dimensions.",
        };
      if (search.includes("tab=accounting"))
        return {
          title: "System Postings",
          subtitle:
            "Configure the default accounts used by automatic transactions.",
        };
      if (search.includes("tab=pos"))
        return {
          title: "POS Configuration",
          subtitle: "Configure tills, printing, and point-of-sale preferences.",
        };
      if (search.includes("tab=currencies"))
        return {
          title: "Currencies",
          subtitle: "Manage currency settings and exchange rates.",
        };
      return {
        title: "Settings",
        subtitle:
          "Manage company profile, security, compliance, and system preferences.",
      };
    }
    if (location.startsWith("/currencies"))
      return {
        title: "Currencies",
        subtitle: "Manage currency settings and exchange rates.",
      };
    if (location.startsWith("/team-settings"))
      return {
        title: "Team Management",
        subtitle: "Manage users, roles, and business access.",
      };
    if (location.startsWith("/approvals"))
      return {
        title: pendingApprovalCount > 0 ? `Approvals (${pendingApprovalCount})` : "Approvals",
        subtitle: "Review and approve sensitive business actions.",
      };
    if (location.startsWith("/reports/partnership-sales"))
      return {
        title: "Partnership Sales",
        subtitle: "Review co-branded sales and revenue splits.",
      };
    if (location.startsWith("/superadmin-visibility"))
      return {
        title: "Super Admin Visibility",
        subtitle: "Control which companies other superadmins can access.",
      };
    if (location.startsWith("/subscription"))
      return {
        title: "Subscription & Licensing",
        subtitle: "Manage hardware bindings for ZIMRA production access.",
      };
    if (location.startsWith("/profile"))
      return {
        title: "User Profile",
        subtitle: "Manage your account, security, and preferences.",
      };
    if (location.startsWith("/zimra-logs"))
      return {
        title: "Transaction Logs",
        subtitle: "Review FDMS communication and fiscal submission history.",
      };
    if (location.startsWith("/zimra-settings"))
      return {
        title: "ZIMRA Settings",
        subtitle: "Manage fiscal device and ZIMRA configuration.",
      };
    if (location.startsWith("/fdms-test"))
      return {
        title: "FDMS Test",
        subtitle: "Test fiscal device connectivity and FDMS responses.",
      };
    if (location.startsWith("/accounting/coa"))
      return {
        title: "Chart of Accounts",
        subtitle: "Manage your business accounts and financial structure.",
      };
    if (location.startsWith("/accounting/dashboard"))
      return {
        title: "Accounting Dashboard",
        subtitle:
          "Review accounting position, period status, allocations, and alerts.",
      };
    if (location.startsWith("/accounting/opening-balances"))
      return {
        title: "Opening Balances",
        subtitle:
          "Post and lock migration balances from a previous accounting system.",
      };
    if (location.startsWith("/accounting/audit-trail"))
      return {
        title: "Posting Audit Trail",
        subtitle:
          "Review journal source documents, debit and credit lines, actors, and reversals.",
      };
    if (location.startsWith("/accounting/allocations"))
      return {
        title: "Payment Allocation",
        subtitle: "Allocate receipts and payments across invoices and bills.",
      };
    if (location.startsWith("/accounting/ledger/"))
      return {
        title: "Account Ledger",
        subtitle:
          "Drill into the transaction history for an individual account.",
      };
    if (location.startsWith("/accounting/cashbook"))
      return {
        title: "Cashbook",
        subtitle: "Record and review cash and bank movements.",
      };
    if (location.startsWith("/accounting/reconciliation"))
      return {
        title: "Bank Reconciliation",
        subtitle: "Match bank statement lines to ledger transactions.",
      };
    if (location.startsWith("/accounting/fixed-assets/depreciation"))
      return {
        title: "Depreciation Records",
        subtitle: "Review automatic and manual asset depreciation history.",
      };
    if (location.startsWith("/accounting/fixed-assets"))
      return {
        title: "Fixed Assets",
        subtitle: "Manage PPE, depreciation, and asset registers.",
      };
    if (location.startsWith("/accounting/periods"))
      return {
        title: "Open / Close Financial Periods",
        subtitle:
          "Create periods, close periods, reopen periods, and run year-end close.",
      };
    if (location.startsWith("/accounting/journal"))
      return {
        title: "General Journal",
        subtitle: "Review and record manual journal entries and transactions.",
      };
    if (location.startsWith("/accounting/reports/trial-balance"))
      return {
        title: "Trial Balance",
        subtitle: "Review unadjusted account balances as of a specific date.",
      };
    if (location.startsWith("/accounting/reports/ledger"))
      return {
        title: "General Ledger",
        subtitle: "Review detailed transaction history for specific accounts.",
      };
    if (location.startsWith("/accounting/reports/balance-sheet"))
      return {
        title: "Balance Sheet",
        subtitle: "Review assets, liabilities, and equity.",
      };
    if (location.startsWith("/accounting/reports/cash-flow"))
      return {
        title: "Cash Flow Statement",
        subtitle: "Review operating, investing, and financing cash movement.",
      };
    if (location.startsWith("/accounting/reports/financial"))
      return {
        title: "Financial Statements",
        subtitle: "Review profit or loss, financial position, and cash flows.",
      };
    if (location.startsWith("/accounting/reports/aging"))
      return {
        title: "Aging Reports",
        subtitle: "Review receivables and payables aging.",
      };
    if (location.startsWith("/accounting/debtors/"))
      return {
        title: "Debtor Analysis",
        subtitle: "Review customer liquidity, balances, and payment behavior.",
      };
    if (location.startsWith("/accounting/creditors/"))
      return {
        title: "Creditor Analysis",
        subtitle: "Review supplier liabilities, balances, and payment behavior.",
      };
    if (location.startsWith("/accounting/accounts-receivable"))
      return {
        title: "Accounts Receivable",
        subtitle:
          "Review debtors, outstanding balances, and receivables aging.",
      };
    if (location.startsWith("/accounting/accounts-payable"))
      return {
        title: "Accounts Payable",
        subtitle: "Review creditors, supplier balances, and payables aging.",
      };
    if (location.startsWith("/accounting/reports/vat-return"))
      return {
        title: "VAT Returns",
        subtitle: "Review output VAT, input VAT, and net VAT payable.",
      };
    if (location.startsWith("/accounting/reports/cost-centers"))
      return {
        title: "Cost Centers",
        subtitle: "Review income and expense performance by center.",
      };
    if (location.startsWith("/supplier-invoices"))
      return {
        title: "Supplier Bills",
        subtitle: "Manage supplier invoices, payables, and payments.",
      };
    if (location.startsWith("/reports/financial"))
      return {
        title: "Profit & Loss",
        subtitle: "Review revenue, expenses, and profitability.",
      };
    if (location.startsWith("/reports/daily"))
      return {
        title: "Daily Sales",
        subtitle: "Review daily sales and fiscal activity.",
      };
    if (location.startsWith("/reports/inventory"))
      return {
        title: "Stock Reports",
        subtitle: "Analyse inventory movement, valuation, and stock health.",
      };
    if (location.startsWith("/reports/branches"))
      return {
        title: "Branch Performance",
        subtitle: "Compare branch sales, stock, transfers, and operations.",
      };
    if (location.startsWith("/reports/tax"))
      return {
        title: "Tax & ZIMRA Reports",
        subtitle: "Review fiscal, tax, and compliance reporting.",
      };
    if (location.startsWith("/reports/customer-statements"))
      return {
        title: "Customer Statements",
        subtitle: "Generate and review customer account statements.",
      };
    if (location.startsWith("/reports/cash-collection"))
      return {
        title: "Cash Collection",
        subtitle: "Track cash collection and payment activity.",
      };
    if (location.startsWith("/reports/pos"))
      return {
        title: "POS Reports",
        subtitle: "Review point-of-sale performance and cashier activity.",
      };
    if (location.startsWith("/reports"))
      return {
        title: "Reports",
        subtitle:
          "Analyse sales, customers, taxes, inventory, and financial performance.",
      };
    if (location.startsWith("/bus/dashboard"))
      return {
        title: "Bus Dashboard",
        subtitle: "Review ticketing activity, dispatch, and cash position.",
      };
    if (location.startsWith("/bus/conductors"))
      return {
        title: "Bus Conductors",
        subtitle: "Manage conductor mobile access.",
      };
    if (location.startsWith("/bus/reports"))
      return {
        title: "Bus Reports",
        subtitle: "Review ticket revenue and conductor performance.",
      };
    if (location.startsWith("/bus/trips"))
      return { title: "Bus Trips", subtitle: "Dispatch and review bus trips." };
    if (location.startsWith("/bus/fleet"))
      return {
        title: "Bus Fleet",
        subtitle: "Manage buses, routes, and fares.",
      };
    if (location.startsWith("/restaurant/orders"))
      return {
        title: "Live Orders",
        subtitle: "Monitor restaurant orders and service flow.",
      };
    if (location.startsWith("/restaurant/kds"))
      return {
        title: "Kitchen Display",
        subtitle: "Manage kitchen order preparation and fulfilment.",
      };
    if (location.startsWith("/restaurant/layout"))
      return {
        title: "Floor Plan",
        subtitle: "Manage restaurant tables and layout.",
      };
    if (location.startsWith("/pos/my-sales"))
      return {
        title: "My Sales History",
        subtitle: "Review your recent POS sales and receipts.",
      };
    if (location.startsWith("/pos/all-sales"))
      return {
        title: "Recent Sales",
        subtitle: "Review recent POS transactions and receipt activity.",
      };
    if (location.startsWith("/pos"))
      return {
        title: "POS Terminal",
        subtitle: "Process sales, payments, and fiscal receipts.",
      };
    return {
      title: "Dashboard",
      subtitle: "Review business performance, alerts, and daily activity.",
    };
  }, [location, pendingApprovalCount]);
  const pageTitle = headerTitle || pageMeta.title;
  const pageSubtitle =
    headerSubtitle !== undefined ? headerSubtitle : pageMeta.subtitle;

  const currentPathWithSearch =
    typeof window !== "undefined"
      ? location + window.location.search
      : location;
  const isHrefActive = (href?: string) =>
    !!href &&
    (currentPathWithSearch === href ||
      (location === href && !href.includes("?")));
  const isChildGroupActive = (
    child: NonNullable<NavItem["children"]>[number],
  ) =>
    isHrefActive(child.href) ||
    !!child.children?.some((grandchild) => isHrefActive(grandchild.href));

  useEffect(() => {
    const activeGroups = navItems
      .filter((item) => item.children?.some(isChildGroupActive))
      .map((item) => item.label);

    if (activeGroups.length > 0) {
      setOpenNavGroups((current) => {
        let changed = false;
        const next = { ...current };
        for (const label of activeGroups) {
          if (
            current[label] === undefined &&
            !autoOpenedNavGroupsRef.current.has(label)
          ) {
            next[label] = true;
            autoOpenedNavGroupsRef.current.add(label);
            changed = true;
          }
        }
        return changed ? next : current;
      });
    }

    // Auto-open active subclasses/sub-nav folders
    const activeSubGroups: string[] = [];
    navItems.forEach((item) => {
      if (item.children) {
        item.children.forEach((child) => {
          if (child.children?.length) {
            const isSubActive = child.children.some((grandchild) => isHrefActive(grandchild.href));
            if (isSubActive) {
              activeSubGroups.push(`${item.label}:${child.label}`);
            }
          }
        });
      }
    });

    if (activeSubGroups.length > 0) {
      setOpenSubNavGroups((current) => {
        let changed = false;
        const next = { ...current };
        for (const key of activeSubGroups) {
          if (
            current[key] === undefined &&
            !autoOpenedSubNavGroupsRef.current.has(key)
          ) {
            next[key] = true;
            autoOpenedSubNavGroupsRef.current.add(key);
            changed = true;
          }
        }
        return changed ? next : current;
      });
    }
  }, [navItems, currentPathWithSearch]);

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
          background: #0f172a !important;
          color: #f8fafc !important;
          border-right: 1px solid #1e293b !important;
          box-shadow: none !important;
        }
        .admin-blueprint .admin-sidebar .text-slate-800 { color: #f8fafc !important; }
        .admin-blueprint .admin-sidebar .text-slate-500 { color: #94a3b8 !important; }
        .admin-blueprint .admin-sidebar .bg-slate-100 { background: #1e293b !important; }
        .admin-blueprint .admin-sidebar .border-slate-50,
        .admin-blueprint .admin-sidebar .border-slate-100,
        .admin-blueprint .admin-sidebar .border-slate-200,
        .admin-blueprint .admin-sidebar .border-slate-200\/60 {
          border-color: #1e293b !important;
        }
        .admin-blueprint .admin-sidebar .bg-slate-900 {
          background: rgba(73, 37, 238, 0.15) !important;
          color: #ffffff !important;
          box-shadow: none !important;
        }
        .admin-blueprint .admin-sidebar .hover\:bg-slate-50:hover {
          background: #1e293b !important;
        }
        .admin-blueprint .nav-item {
          transform: translateX(0);
          transition: transform 0.2s ease, background-color 0.2s ease, color 0.2s ease;
        }
        .admin-blueprint .nav-item:hover {
          transform: translateX(1px);
        }

        .sidebar-scroller {
          overflow-y: auto !important;
          scrollbar-width: thin;
          scrollbar-color: #E2E8F0 transparent;
        }
        .sidebar-scroller::-webkit-scrollbar {
          width: 4px;
          height: 4px;
        }
        .sidebar-scroller::-webkit-scrollbar-thumb {
          background-color: #E2E8F0;
          border-radius: 20px;
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
        .admin-blueprint .text-xs {
          font-size: 13px !important;
          line-height: 1.125rem !important;
        }
        .page-shell > div > h1 {
          letter-spacing: -0.02em;
          font-weight: 750;
        }
      `}</style>

      <div
        className={cn(
          "min-h-screen bg-slate-50 flex transition-all duration-300 admin-shell admin-blueprint",
          currentBrand === "fiscalzone"
            ? "fz-admin"
            : "font-sans selection:bg-blue-500/20",
        )}
      >
        {/* Primary Navigation Sidebar */}
        <aside
          className={cn(
            "admin-sidebar bg-[#0f172a] border-r border-slate-800/60 shadow-[1px_0_10px_rgba(0,0,0,0.02)] flex shrink-0 flex-col overflow-hidden transition-all duration-500 ease-in-out",
            "fixed inset-y-0 left-0 z-50 lg:inset-y-0 lg:h-screen lg:max-h-screen",
            isSidebarCollapsed ? "w-20" : "w-[264px]",
            isMobileMenuOpen
              ? "translate-x-0"
              : "-translate-x-full lg:translate-x-0",
          )}
        >
          <div
            className={cn(
              "relative h-[68px] flex items-center bg-[#0f172a]",
              isSidebarCollapsed ? "px-3 justify-center" : "px-4",
            )}
          >
            <div
              className={cn(
                "flex items-center gap-2 transition-all w-full",
                isSidebarCollapsed ? "justify-center" : "px-1",
              )}
            >
              {currentBrand === "fiscalzone" ? (
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-white shadow-lg shadow-primary/20">
                    <MonitorCheck className="w-4 h-4" />
                  </div>
                  {!isSidebarCollapsed && (
                    <span className="text-xl font-black text-white tracking-tight font-display">
                      Fiscal<span className="text-primary">Zone</span>
                    </span>
                  )}
                </div>
              ) : (
                <img
                  src={brand.logo}
                  alt={brand.name}
                  className={cn(
                    "transition-all rounded-lg",
                    isSidebarCollapsed ? "h-6 w-6 object-contain" : "h-8",
                  )}
                />
              )}
            </div>
            <Button
              variant="ghost"
              size="icon"
              className={cn(
                "absolute right-2 top-1/2 hidden h-8 w-8 -translate-y-1/2 rounded-[10px] border border-slate-700 bg-slate-800 text-slate-400 shadow-[0_1px_2px_rgba(0,0,0,0.1)] hover:bg-slate-700 hover:text-white lg:inline-flex",
                isSidebarCollapsed && "right-1/2 translate-x-1/2",
              )}
              onClick={() => setIsSidebarCollapsed((value) => !value)}
              aria-label={
                isSidebarCollapsed
                  ? "Expand admin drawer"
                  : "Minimise admin drawer"
              }
              title={isSidebarCollapsed ? "Expand drawer" : "Minimise drawer"}
            >
              {isSidebarCollapsed ? (
                <PanelLeftOpen className="h-4 w-4" />
              ) : (
                <PanelLeftClose className="h-4 w-4" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-2 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 rounded-[10px] border border-slate-700 bg-slate-800 text-slate-400 shadow-[0_1px_2px_rgba(0,0,0,0.1)] hover:bg-slate-700 hover:text-white lg:hidden"
              onClick={() => setIsMobileMenuOpen(false)}
              aria-label="Close admin drawer"
              title="Close drawer"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          <nav
            className={cn(
              "min-h-0 flex-1 pb-4 pt-1 sidebar-scroller",
              isSidebarCollapsed ? "px-2" : "px-3",
            )}
          >
            <div className="space-y-1.5">
              {navItems.map((item) => {
                if (item.children) {
                  const isActiveGroup = item.children.some(isChildGroupActive);
                  const isOpen = openNavGroups[item.label] ?? false;
                  const setIsOpen = (open: boolean) => {
                    setOpenNavGroups((current) => ({
                      ...current,
                      [item.label]: open,
                    }));
                  };

                  if (isSidebarCollapsed) {
                    return (
                      <DropdownMenu key={item.label}>
                        <DropdownMenuTrigger asChild>
                          <div
                            className={cn(
                              "w-11 h-11 rounded-[10px] flex items-center justify-center cursor-pointer transition-all duration-300 relative group collapsed-item mx-auto mb-1 nav-item",
                              isActiveGroup
                                ? "bg-slate-800/80 text-white shadow-[inset_3px_0_0_#4925ee]"
                                : "text-slate-400 hover:bg-slate-800/50 hover:text-white",
                            )}
                          >
                            <item.icon className="w-[18px] h-[18px]" />
                            <span className="nav-item-tooltip shadow-2xl">
                              {item.label}
                            </span>
                          </div>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent
                          side="right"
                          align="start"
                          className="w-56 bg-slate-900 border-slate-800 rounded-xl shadow-2xl p-1 ml-4 animate-in fade-in slide-in-from-left-2 duration-200"
                        >
                          <p className="text-[12px] font-black text-slate-400 uppercase tracking-widest px-3 py-2 border-b border-slate-50 mb-1">
                            {item.label}
                          </p>
                          {item.children.map((child) => {
                            if (child.children?.length) {
                              return (
                                <div key={child.label} className="mb-2">
                                  <p className="flex items-center gap-2 px-3 py-1.5 text-[12px] font-black uppercase tracking-widest text-slate-400">
                                    <child.icon className="w-3.5 h-3.5" />
                                    <span>{child.label}</span>
                                  </p>
                                  <div className="space-y-1">
                                    {child.children.map((grandchild) => {
                                      const isGrandchildActive = isHrefActive(
                                        grandchild.href,
                                      );
                                      return (
                                        <Link
                                          key={grandchild.label}
                                          href={grandchild.href}
                                        >
                                          <div
                                            className={cn(
                                              "flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-all  font-medium nav-sub-item",
                                              isGrandchildActive
                                                ? "bg-slate-800/80 text-white shadow-[inset_3px_0_0_#4925ee]"
                                                : "text-slate-400 hover:bg-slate-800/50 hover:text-white",
                                            )}
                                          >
                                            <grandchild.icon
                                              className={cn(
                                                "w-[18px] h-[18px]",
                                                isGrandchildActive
                                                  ? "text-[#2563EB]"
                                                  : "text-[#94A3B8]",
                                              )}
                                            />
                                            <span>{grandchild.label}</span>
                                          </div>
                                        </Link>
                                      );
                                    })}
                                  </div>
                                </div>
                              );
                            }

                            const isChildActive = isHrefActive(child.href);
                            return child.href ? (
                              <Link key={child.label} href={child.href}>
                                <div
                                  className={cn(
                                    "flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-all  font-medium mb-1 nav-sub-item",
                                    isChildActive
                                      ? "bg-slate-800/80 text-white shadow-[inset_3px_0_0_#4925ee]"
                                      : "text-slate-400 hover:bg-slate-800/50 hover:text-white",
                                  )}
                                >
                                  <child.icon
                                    className={cn(
                                      "w-[18px] h-[18px]",
                                      isChildActive
                                        ? "text-[#2563EB]"
                                        : "text-[#94A3B8]",
                                    )}
                                  />
                                  <span>{child.label}</span>
                                </div>
                              </Link>
                            ) : null;
                          })}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    );
                  }

                  return (
                    <div key={item.label}>
                      <Collapsible
                        open={isOpen}
                        onOpenChange={setIsOpen}
                        className="space-y-1"
                      >
                        <CollapsibleTrigger asChild>
                          <div
                            className={cn(
                              "flex items-center w-full px-3 py-2.5 rounded-[10px] text-[16px] font-semibold transition-all duration-200 cursor-pointer select-none group nav-item",
                              isActiveGroup
                                ? "bg-slate-800/80 text-white shadow-[inset_3px_0_0_#4925ee]"
                                : "text-slate-400 hover:bg-slate-800/50 hover:text-white",
                            )}
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <item.icon
                                className={cn(
                                  "w-[18px] h-[18px] shrink-0",
                                  isActiveGroup
                                    ? "text-[#2563EB]"
                                    : "text-[#94A3B8] group-hover:text-[#475569]",
                                )}
                              />
                              <span className="font-display tracking-tight text-[16px]">
                                {item.label}
                              </span>
                            </div>
                            <span className="ml-auto pl-3">
                              <svg
                                className={cn(
                                  "w-4 h-4 transition-transform",
                                  isOpen ? "rotate-180" : "rotate-0",
                                )}
                                viewBox="0 0 20 20"
                                fill="currentColor"
                                aria-hidden="true"
                              >
                                <path
                                  fillRule="evenodd"
                                  d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.168l3.71-3.94a.75.75 0 1 1 1.08 1.04l-4.25 4.5a.75.75 0 0 1-1.08 0l-4.25-4.5a.75.75 0 0 1 .02-1.06Z"
                                  clipRule="evenodd"
                                />
                              </svg>
                            </span>
                          </div>
                        </CollapsibleTrigger>
                        <CollapsibleContent className="pb-1 transition-all">
                          <div className="ml-4 pl-3 border-l-2 border-slate-100 space-y-1 mt-1 nav-dropdown">
                            {item.children.map((child) => {
                              if (child.children?.length) {
                                const isNestedActive = child.children.some(
                                  (grandchild) => isHrefActive(grandchild.href),
                                );
                                const subGroupKey = `${item.label}:${child.label}`;
                                const isSubOpen = openSubNavGroups[subGroupKey] ?? false;
                                const setSubOpen = (open: boolean) => {
                                  setOpenSubNavGroups((current) => ({
                                    ...current,
                                    [subGroupKey]: open,
                                  }));
                                };

                                return (
                                  <div
                                    key={child.label}
                                    className="pt-1.5 first:pt-0"
                                  >
                                    <Collapsible
                                      open={isSubOpen}
                                      onOpenChange={setSubOpen}
                                      className="space-y-1"
                                    >
                                      <CollapsibleTrigger asChild>
                                        <div
                                          className={cn(
                                            "flex items-center w-full px-2.5 py-2.5 rounded-lg font-medium transition-all duration-150 cursor-pointer select-none group/sub nav-sub-item",
                                            isNestedActive
                                              ? "bg-slate-800/30 text-white"
                                              : "text-slate-400 hover:bg-slate-800/50 hover:text-white",
                                          )}
                                        >
                                          <div className="flex items-center gap-3 min-w-0">
                                            <child.icon
                                              className={cn(
                                                "w-[18px] h-[18px] shrink-0",
                                                isNestedActive
                                                  ? "text-[#2563EB]"
                                                  : "text-[#94A3B8] group-hover/sub:text-[#475569]",
                                              )}
                                            />
                                            <span className="truncate">
                                              {child.label}
                                            </span>
                                          </div>
                                          <span className="ml-auto pl-3">
                                            <svg
                                              className={cn(
                                                "w-3.5 h-3.5 transition-transform duration-200 text-slate-500 group-hover/sub:text-slate-300",
                                                isSubOpen ? "rotate-180" : "rotate-0",
                                              )}
                                              viewBox="0 0 20 20"
                                              fill="currentColor"
                                              aria-hidden="true"
                                            >
                                              <path
                                                fillRule="evenodd"
                                                d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.168l3.71-3.94a.75.75 0 1 1 1.08 1.04l-4.25 4.5a.75.75 0 0 1-1.08 0l-4.25-4.5a.75.75 0 0 1 .02-1.06Z"
                                                clipRule="evenodd"
                                              />
                                            </svg>
                                          </span>
                                        </div>
                                      </CollapsibleTrigger>
                                      <CollapsibleContent className="pb-1 transition-all duration-200">
                                        <div className="ml-4 pl-3.5 border-l border-slate-800/80 space-y-1 mt-1 nav-dropdown">
                                          {child.children.map((grandchild) => {
                                            const isGrandchildActive = isHrefActive(
                                              grandchild.href,
                                            );
                                            return (
                                              <Link
                                                key={grandchild.label}
                                                href={grandchild.href}
                                              >
                                                <div
                                                  className={cn(
                                                    "flex items-center gap-3 px-2.5 py-2.5 rounded-lg font-medium transition-all duration-150 cursor-pointer nav-sub-item",
                                                    isGrandchildActive
                                                      ? "bg-slate-800/80 text-white shadow-[inset_3px_0_0_#4925ee]"
                                                      : "text-slate-400 hover:bg-slate-800/50 hover:text-white",
                                                  )}
                                                >
                                                  <grandchild.icon
                                                    className={cn(
                                                      "w-[18px] h-[18px] shrink-0",
                                                      isGrandchildActive
                                                        ? "text-[#2563EB]"
                                                        : "text-[#94A3B8]",
                                                    )}
                                                  />
                                                  <span className="truncate">
                                                    {grandchild.label}
                                                  </span>
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

                              const isChildActive = isHrefActive(child.href);
                              return child.href ? (
                                <Link key={child.label} href={child.href}>
                                  <div
                                    className={cn(
                                      "flex items-center gap-3 px-2.5 py-2.5 rounded-lg  font-medium transition-all duration-150 cursor-pointer nav-sub-item",
                                      isChildActive
                                        ? "bg-slate-800/80 text-white shadow-[inset_3px_0_0_#4925ee]"
                                        : "text-slate-400 hover:bg-slate-800/50 hover:text-white",
                                    )}
                                  >
                                    <child.icon
                                      className={cn(
                                        "w-[18px] h-[18px] shrink-0",
                                        isChildActive
                                          ? "text-[#2563EB]"
                                          : "text-[#94A3B8]",
                                      )}
                                    />
                                    <span className="truncate">
                                      {child.label}
                                    </span>
                                  </div>
                                </Link>
                              ) : null;
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
                      <div
                        className={cn(
                          "w-11 h-11 rounded-[10px] flex items-center justify-center cursor-pointer transition-all duration-300 relative group collapsed-item mx-auto mb-1 nav-item",
                          isActive
                            ? "bg-slate-800/80 text-white shadow-[inset_3px_0_0_#4925ee]"
                            : "text-slate-400 hover:bg-slate-800/50 hover:text-white",
                        )}
                      >
                        <item.icon className="w-[18px] h-[18px]" />
                        <span className="nav-item-tooltip shadow-2xl">
                          {item.label}
                        </span>
                      </div>
                    </Link>
                  );
                }

                return (
                  <div key={item.label}>
                    <Link href={item.href!}>
                      <div
                        className={cn(
                          "flex items-center gap-3 px-3 py-2.5 rounded-[10px] text-[16px] font-semibold transition-all duration-200 cursor-pointer select-none group nav-item",
                          isActive
                            ? "bg-slate-800/80 text-white shadow-[inset_3px_0_0_#4925ee]"
                            : "text-slate-400 hover:bg-slate-800/50 hover:text-white",
                        )}
                      >
                        <item.icon
                          className={cn(
                            "w-[18px] h-[18px] shrink-0",
                            isActive
                              ? "text-[#2563EB]"
                              : "text-[#94A3B8] group-hover:text-[#475569]",
                          )}
                        />
                        <span className="font-display tracking-tight">
                          {item.label}
                        </span>
                      </div>
                    </Link>
                  </div>
                );
              })}
            </div>
          </nav>

          <div
            className={cn(
              "sticky bottom-0 z-20 mt-auto border-t border-slate-800/60 bg-[#0f172a]",
              isSidebarCollapsed ? "p-2" : "p-3 space-y-3",
            )}
          >
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <div
                  className={cn(
                    "transition-all cursor-pointer group active:scale-95 duration-200 border border-slate-800/60 bg-slate-800/30 hover:bg-slate-800/60 hover:border-slate-700",
                    isSidebarCollapsed
                      ? "mx-auto flex h-11 w-11 items-center justify-center rounded-[10px]"
                      : "rounded-xl p-2.5",
                  )}
                >
                  <div
                    className={cn(
                      "flex items-center",
                      isSidebarCollapsed ? "justify-center" : "gap-3",
                    )}
                  >
                    <div
                      className={cn(
                        "rounded-full bg-[#0f172a] border border-slate-700 flex items-center justify-center text-slate-300 overflow-hidden shadow-sm shrink-0",
                        isSidebarCollapsed ? "h-8 w-8" : "w-10 h-10",
                      )}
                    >
                      {selectedCompany?.logoUrl ? (
                        <img
                          src={selectedCompany.logoUrl}
                          alt="Logo"
                          className="w-full h-full object-contain"
                        />
                      ) : (
                        <Building2
                          className={cn(
                            "text-slate-400",
                            isSidebarCollapsed ? "w-4 h-4" : "w-5 h-5",
                          )}
                        />
                      )}
                    </div>
                    {!isSidebarCollapsed && (
                      <div className="overflow-hidden flex-1 text-left">
                        <p className=" font-bold text-white truncate leading-none mb-1.5 font-display group-hover:text-[#4925ee] transition-colors">
                          {selectedCompany ? selectedCompany.name : "Setup"}
                        </p>
                        {selectedCompany && (
                          <div className="flex items-center gap-1.5">
                            <div
                              className={cn(
                                "w-1.5 h-1.5 rounded-full",
                                selectedCompany.zimraEnvironment ===
                                  "production"
                                  ? "bg-emerald-500"
                                  : "bg-amber-500",
                              )}
                            />
                            <span
                              className={cn(
                                "text-[10px] font-bold uppercase tracking-wider",
                                selectedCompany.zimraEnvironment ===
                                  "production"
                                  ? "text-emerald-600"
                                  : "text-amber-600",
                              )}
                            >
                              {selectedCompany.zimraEnvironment === "production"
                                ? "Production"
                                : "Test Environment"}
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="start"
                side={isSidebarCollapsed ? "right" : "top"}
                className="w-60 max-h-[400px] overflow-y-auto bg-white border-slate-200 rounded-xl shadow-2xl p-1 z-[60]"
              >
                <div className="px-1 py-1">
                  {companies?.map((company) => (
                    <DropdownMenuItem
                      key={company.id}
                      onClick={() => handleCompanyChange(company.id)}
                      className={cn(
                        "flex items-center gap-2.5 p-2 rounded-lg cursor-pointer transition-all duration-200 mb-0.5",
                        selectedCompanyId === company.id
                          ? "bg-[#EEF4FF] text-[#2563EB] shadow-none"
                          : "text-slate-600 hover:bg-slate-50 hover:text-slate-900",
                      )}
                    >
                      <div
                        className={`w-6 h-6 rounded flex items-center justify-center text-[8px] font-bold ${selectedCompanyId === company.id ? "bg-[#DBEAFE] text-[#1D4ED8]" : "bg-slate-100 text-slate-400"}`}
                      >
                        {company.logoUrl ? (
                          <img
                            src={company.logoUrl}
                            className="w-full h-full object-contain rounded"
                          />
                        ) : (
                          company.name.substring(0, 2).toUpperCase()
                        )}
                      </div>
                      <span className="truncate flex-1 font-medium font-display text-[14px]">
                        {company.name}
                      </span>
                      {selectedCompanyId === company.id && (
                        <div className="w-1.5 h-1.5 rounded-full bg-[#2563EB]" />
                      )}
                    </DropdownMenuItem>
                  ))}
                  <DropdownMenuItem
                    onClick={() => setLocation("/onboarding")}
                    className="flex items-center justify-center gap-2 p-2.5 text-white bg-[#2563EB] font-bold cursor-pointer hover:bg-[#1D4ED8] rounded-[10px] shadow-sm active:scale-95 transition-all text-xs"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Register Enterprise</span>
                  </DropdownMenuItem>
                </div>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </aside>

        {/* Main Administrative Workspace */}
        <div
          className={cn(
            "flex-1 flex flex-col min-h-screen min-w-0 transition-all duration-500 ease-in-out",
            isSidebarCollapsed ? "lg:ml-20" : "lg:ml-[264px]",
          )}
        >
          {/* Top Header */}
          <header className="admin-header h-[80px] bg-[#F8FAFC] flex items-center justify-between gap-3 px-4 sm:px-6 z-40 sticky top-0 relative">
            {/* Mobile Menu Toggle */}
            <Button
              variant="ghost"
              size="icon"
              className="mr-auto lg:hidden bg-slate-100 border border-slate-200 rounded-xl"
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            >
              {isMobileMenuOpen ? (
                <X className="w-5 h-5 text-slate-600" />
              ) : (
                <Menu className="w-5 h-5 text-slate-600" />
              )}
            </Button>

            {!hideHeaderTitle && (
              <div className="hidden min-w-0 flex-1 items-center gap-4 lg:flex">
                <div className="min-w-0">
                  <h1 className="truncate text-[24px] font-bold leading-tight tracking-[-0.015em] text-[#0F172A]">
                    {pageTitle}
                  </h1>
                  {pageSubtitle ? (
                    <p className="mt-1 truncate  text-muted-foreground">
                      {pageSubtitle}
                    </p>
                  ) : null}
                </div>
              </div>
            )}

            <div className="ml-auto flex items-center gap-2">
              <div className="hidden xl:flex items-center h-10 px-3 rounded-[10px] border border-[#E5E7EB] bg-white min-w-[280px] shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
                <Search className="w-4 h-4 text-[#64748B]" />
                <input
                  aria-label="Search"
                  placeholder="Search anything..."
                  className="ml-2 flex-1  text-[#0f172a] placeholder:text-[#94a3b8] bg-transparent outline-none"
                />
                <span className="text-[11px] font-semibold text-[#64748B] bg-[#F8FAFC] border border-[#E5E7EB] rounded px-2 py-0.5">
                  Ctrl + K
                </span>
              </div>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="relative h-10 w-10 rounded-full border border-[#E5E7EB] bg-white text-[#64748B] shadow-[0_1px_2px_rgba(15,23,42,0.04)]"
                  >
                    <Bell className="w-4 h-4" />
                    {pendingGdnCount > 0 && !isCashier && (
                      <span className="absolute -right-1 -top-1 min-w-5 h-5 rounded-full bg-amber-500 px-1.5 text-[10px] font-black leading-5 text-white shadow-sm">
                        {pendingGdnCount > 9 ? "9+" : pendingGdnCount}
                      </span>
                    )}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  className="w-80 bg-white rounded-2xl shadow-2xl border-slate-200 p-2 mt-2"
                >
                  <div className="px-3 py-2 border-b border-slate-100 mb-1">
                    <p className=" font-black text-slate-900">System Alerts</p>
                    <p className="text-[11px] font-semibold text-slate-500">
                      Operational items that need attention.
                    </p>
                  </div>
                  {!isCashier && pendingGdnCount > 0 ? (
                    <DropdownMenuItem
                      onClick={() => setLocation("/inventory/account")}
                      className="p-3 rounded-xl cursor-pointer focus:bg-amber-50"
                    >
                      <div className="flex items-start gap-3">
                        <div className="h-9 w-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
                          <ClipboardCheck className="h-4 w-4" />
                        </div>
                        <div>
                          <p className=" font-black text-slate-900">
                            {pendingGdnCount} pending GDN
                            {pendingGdnCount === 1 ? "" : "s"}
                          </p>
                          <p className="text-[11px] font-semibold text-slate-500">
                            Review cashier delivery notes and post stock.
                          </p>
                        </div>
                      </div>
                    </DropdownMenuItem>
                  ) : (
                    <div className="p-5 text-center">
                      <p className=" font-black text-slate-700">
                        No active alerts
                      </p>
                      <p className="text-[11px] font-semibold text-slate-500 mt-1">
                        Pending GDNs and other system alerts will appear here.
                      </p>
                    </div>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>

              <div className="hidden md:flex items-center gap-2">
                {selectedCompany?.id && (
                  <DeviceStatusWidget companyId={selectedCompany.id} />
                )}
              </div>
              <BranchSwitcher />

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    className="h-10 w-10 rounded-full p-0 border-2 border-white hover:border-violet-200 transition-all hover:scale-105 active:scale-95 shadow-sm"
                  >
                    <Avatar className="h-9 w-9">
                      <AvatarFallback className="bg-slate-900 text-white text-xs font-black">
                        {user.name?.substring(0, 2).toUpperCase() || "US"}
                      </AvatarFallback>
                    </Avatar>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  className="w-64 bg-white rounded-2xl shadow-2xl border-slate-200 p-2 mt-2"
                >
                  <div className="flex items-center justify-start gap-3 p-4 bg-slate-50 rounded-xl mb-2">
                    <div className="h-9 w-9 rounded-full bg-[#2563EB] flex items-center justify-center text-white font-semibold ">
                      {user.name?.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex flex-col space-y-0.5 leading-none">
                      <p className="font-bold text-slate-900 font-display">
                        {user.name || "User"}
                      </p>
                      <p className="w-[140px] truncate text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                        {user.email || "No Email"}
                      </p>
                    </div>
                  </div>
                  <DropdownMenuItem
                    onClick={() => setLocation("/dashboard")}
                    className="p-3 rounded-xl font-bold text-slate-600 cursor-pointer hover:bg-slate-50 hover:text-slate-900 transition-all"
                  >
                    <LayoutDashboard className="mr-3 h-4 w-4" />
                    <span>Dashboard Overview</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => setLocation("/settings")}
                    className="p-3 rounded-xl font-bold text-slate-600 cursor-pointer hover:bg-slate-50 hover:text-slate-900 transition-all"
                  >
                    <Settings className="mr-3 h-4 w-4" />
                    <span>Security & Config</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="p-3 rounded-xl font-bold text-red-600 focus:text-red-700 focus:bg-red-50 hover:bg-red-50 cursor-pointer active:scale-95 transition-all"
                    onClick={() => logout()}
                  >
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
              <div className="flex items-center gap-3 text-amber-800  font-medium">
                <div className="p-2 bg-amber-100 rounded-lg text-amber-600">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <span>
                  <strong>Security Alert:</strong> You are using a temporary
                  password. Please update it immediately.
                </span>
              </div>
              <Button
                size="sm"
                className="h-9 px-4 text-xs font-bold bg-white text-amber-700 border border-amber-200 shadow-sm hover:bg-amber-100 hover:border-amber-300 rounded-lg"
                onClick={() => setLocation("/profile")}
              >
                Update Password
              </Button>
            </div>
          )}

          {!isCashier &&
            pendingGdnCount > 0 &&
            !location.startsWith("/inventory/account") && (
              <div className="mx-4 sm:mx-6 mt-3 rounded-xl bg-amber-50 border border-amber-200/70 p-3.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 shadow-sm">
                <div className="flex items-center gap-3 text-amber-900  font-medium">
                  <div className="p-2 bg-amber-100 rounded-lg text-amber-700">
                    <Clock className="w-5 h-5" />
                  </div>
                  <span>
                    <strong>GDN Alert:</strong> {pendingGdnCount} delivery note
                    {pendingGdnCount === 1 ? "" : "s"} waiting for admin
                    verification.
                  </span>
                </div>
                <Button
                  size="sm"
                  className="h-9 px-4 text-xs font-bold bg-white text-amber-700 border border-amber-200 shadow-sm hover:bg-amber-100 hover:border-amber-300 rounded-lg"
                  onClick={() => setLocation("/inventory/account")}
                >
                  Review GDNs
                </Button>
              </div>
            )}

          {/* Page Content */}
          <main
            className={cn(
              "flex-1 max-w-[1600px] w-full mx-auto",
              "px-4 pb-4 pt-1 sm:px-7 sm:pb-8 sm:pt-1",
            )}
          >
            {isImmersiveRoute ? (
              children
            ) : (
              <section className="page-shell p-0">{children}</section>
            )}
          </main>
        </div>
      </div>
    </>
  );
}
