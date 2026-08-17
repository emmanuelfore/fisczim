import { Layout } from "@/components/layout";
import { useActiveCompany } from "@/hooks/use-active-company";
import { useUpdateCompany } from "@/hooks/use-companies";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { 
  Save, 
  RefreshCw,
  Building2,
  GitBranch,
  ClipboardCheck,
  Users,
  Lock,
  Landmark,
  Calculator,
  Package,
  Coins,
  Cpu,
  Percent,
  Smartphone,
  CreditCard,
  Utensils,
  Bus,
  Mail,
  Wrench,
  Languages
} from "lucide-react";
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useI18n } from "@/lib/i18n";
import { LanguageSwitcher } from "@/components/language-switcher";

// Import Sub-components
import { OrganizationProfile } from "@/components/settings/organization-profile";
import { ApprovalPoliciesSettings } from "@/components/settings/approval-policies-settings";
import { PartnershipManagement } from "@/components/settings/partnership-management";
import { SecuritySettings } from "@/components/settings/security-settings";
import { BankingSettings } from "@/components/settings/banking-settings";
import { CurrencySettings } from "@/components/settings/currency-settings";
import { TaxComplianceSettings } from "@/components/settings/tax-compliance-settings";
import { ZimraDeviceSettings } from "@/components/settings/zimra-device-settings";
import { PosTerminalSettings } from "@/components/settings/pos-terminal-settings";
import { CommunicationSettings } from "@/components/settings/communication-settings";
import { MaintenanceSettings } from "@/components/settings/maintenance-settings";
import { RestaurantSettings } from "@/components/settings/restaurant-settings";
import { BranchManagement } from "@/components/settings/branch-management";
import { CostCenterManagement } from "@/components/settings/cost-center-management";
import { AccountingSystemSettings } from "@/components/settings/accounting-system-settings";
import { InventorySettings } from "@/components/settings/inventory-settings";
import { BusTicketingSettings } from "@/components/settings/bus-ticketing-settings";
import { DEFAULT_BUS_SETTINGS, normalizeBusSettings } from "@shared/bus-settings";
import { AppModeSettings } from "@/components/settings/app-mode-settings";
import { normalizeAppMode } from "@shared/app-mode";
import { SalesOrdersSettings } from "@/components/settings/sales-orders-settings";

export default function SettingsPage() {
  const { toast } = useToast();
  const { t } = useI18n();
  const { activeCompany, isLoading: isLoadingActive } = useActiveCompany();
  const updateCompany = useUpdateCompany(activeCompany?.id || 0);

  // Deep-linking support via URL query params
  const queryParams = new URLSearchParams(window.location.search);
  const legacyTab = queryParams.get("tab");
  const initialTab = legacyTab || "profile";
  const [activeTab, setActiveTab] = useState(initialTab);

  // Form State for global fields
  const [formData, setFormData] = useState<any>({});

  useEffect(() => {
    if (activeCompany) {
      setFormData({
        name: activeCompany.name || "",
        tradingName: activeCompany.tradingName || "",
        email: activeCompany.email || "",
        phone: activeCompany.phone || "",
        address: activeCompany.address || "",
        city: activeCompany.city || "",
        website: activeCompany.website || "",
        tin: activeCompany.tin || "",
        vatNumber: activeCompany.vatNumber || "",
        bpNumber: activeCompany.bpNumber || "",
        vatEnabled: activeCompany.vatEnabled ?? true,
        vatRegistered: activeCompany.vatRegistered ?? true,
        bankName: activeCompany.bankName || "",
        accountName: activeCompany.accountName || "",
        accountNumber: activeCompany.accountNumber || "",
        branchCode: activeCompany.branchCode || "",
        currency: activeCompany.currency || "USD",
        branchName: activeCompany.branchName || "",
        emailSettings: activeCompany.emailSettings || {
          provider: 'resend',
          apiKey: '',
          fromEmail: '',
          fromName: activeCompany.name || ''
        },
        posSettings: activeCompany.posSettings || {
          terminalId: "",
          receiptHeader: "",
          receiptFooter: "",
          receiptPaperSize: "80mm",
          receiptShowLogo: true,
          requireOverrideForDiscount: false,
          requireOverrideForPriceChange: false,
          requireOverrideForDelete: false,
          requireOverrideForOpenDrawer: false,
          requireOverrideForReports: false,
          requireOverrideForEndShift: false,
          autoPrint: true,
          usePrinterClient: false,
          printingEnabled: true,
          allowSellOutOfStock: false,
          allowedPaymentMethods: ["CASH", "CARD", "ECOCASH", "usd", "zig"],
          defaultCustomerId: "",
          silentPrinting: true,
          printServerUrl: "http://localhost:12312",
          printerName: "",
          secondaryPrinterName: ""
        },
        accountingSettings: activeCompany.accountingSettings || {},
        inventoryValuationMethod: (activeCompany as any).inventoryValuationMethod || "WAC",
        restaurantSettings: activeCompany.restaurantSettings || { enabled: false },
        pharmacySettings: activeCompany.pharmacySettings || { enabled: false },
        busSettings: activeCompany.busSettings || DEFAULT_BUS_SETTINGS,
        appMode: normalizeAppMode((activeCompany as any).appMode),
        primaryColor: activeCompany.primaryColor || "#4f46e5",
      });
    }
  }, [activeCompany]);

  // Update URL when tabs change.
  useEffect(() => {
    const newUrl = `${window.location.pathname}?tab=${activeTab}`;
    window.history.replaceState({ ...window.history.state, as: newUrl, url: newUrl }, '', newUrl);
  }, [activeTab]);

  const handleGlobalSave = async () => {
    try {
      await updateCompany.mutateAsync(formData);
      toast({
        title: t("Configuration Saved"),
        description: t("Your organization settings have been updated successfully."),
        className: "bg-slate-900 text-white border-none rounded-2xl"
      });
    } catch (err: any) {
      toast({
        title: t("Save Failed"),
        description: err.message || t("An unexpected error occurred"),
        variant: "destructive"
      });
    }
  };

  if (isLoadingActive) return <Layout><div className="flex items-center justify-center h-[60vh]"><RefreshCw className="animate-spin w-8 h-8 text-slate-300" /></div></Layout>;
  if (!activeCompany) return <Layout><div className="p-8">No company details available. Please select a company from the sidebar.</div></Layout>;

  const appMode = normalizeAppMode((activeCompany as any).appMode);
  const busSettings = normalizeBusSettings((activeCompany as any).busSettings);
  const isBusOnlyMode = busSettings.enabled || appMode === "bus_ticketing";

  const standardMenuGroups = [
    {
      title: t("Organization"),
      items: [
        { id: "profile", label: t("Profile") },
        { id: "branches", label: t("Branches") },
        { id: "approval-policies", label: t("Approvals") },
        { id: "partnerships", label: t("Partnerships") },
        { id: "security", label: t("Security") },
      ]
    },
    {
      title: t("Financial"),
      items: [
        { id: "banking", label: t("Banking") },
        { id: "accounting", label: t("Accounting") },
        { id: "sales-orders", label: t("Sales Orders") },
        { id: "cost-centers", label: t("Cost Centers") },
        { id: "inventory", label: t("Inventory") },
        { id: "currencies", label: t("Currencies") },
      ]
    },
    {
      title: t("Fiscal (Tax)"),
      items: [
        { id: "zimra", label: t("ZIMRA Device") },
        { id: "tax", label: t("Tax Config") },
      ]
    },
    {
      title: t("Point of Sale"),
      items: [
        { id: "app-mode", label: t("App Mode") },
        { id: "pos", label: t("POS Terminal") },
        { id: "restaurant", label: t("Restaurant") },
        { id: "bus-ticketing", label: t("Bus Ticketing") },
      ]
    },
    {
      title: t("System"),
      items: [
        { id: "language", label: t("Language") },
        { id: "communication", label: t("Communication") },
        ...(activeCompany?.role === 'owner' ? [{ id: "maintenance", label: t("Maintenance") }] : [])
      ]
    }
  ];

  const busOnlyMenuGroups = [
    {
      title: t("Bus Ticketing"),
      items: [
        { id: "app-mode", label: t("App Mode") },
        { id: "bus-ticketing", label: t("Bus Ticketing") },
      ]
    }
  ];

  const menuGroups = isBusOnlyMode ? busOnlyMenuGroups : standardMenuGroups;
  const settingsTabs = menuGroups.flatMap((group) => group.items);
  const activeTabAllowed = settingsTabs.some((item) => item.id === activeTab);
  const visibleActiveTab = activeTabAllowed ? activeTab : "bus-ticketing";

  const renderContent = () => {
    switch (visibleActiveTab) {
      case 'profile': return <OrganizationProfile company={activeCompany} formData={formData} setFormData={setFormData} />;
      case 'branches': return <BranchManagement companyId={activeCompany.id} />;
      case 'approval-policies': return <ApprovalPoliciesSettings companyId={activeCompany.id} />;
      case 'partnerships': return <PartnershipManagement companyId={activeCompany.id} />;
      case 'security': return <SecuritySettings company={activeCompany} />;
      case 'banking': return <BankingSettings formData={formData} setFormData={setFormData} />;
      case 'accounting': return <AccountingSystemSettings companyId={activeCompany.id} formData={formData} setFormData={setFormData} />;
      case 'sales-orders': return <SalesOrdersSettings companyId={activeCompany.id} />;
      case 'cost-centers': return <CostCenterManagement companyId={activeCompany.id} />;
      case 'inventory': return <InventorySettings formData={formData} setFormData={setFormData} />;
      case 'currencies': return <CurrencySettings companyId={activeCompany.id} />;
      case 'tax': return <TaxComplianceSettings companyId={activeCompany.id} formData={formData} setFormData={setFormData} />;
      case 'zimra': return <ZimraDeviceSettings company={activeCompany} />;
      case 'app-mode': return <AppModeSettings formData={formData} setFormData={setFormData} onSave={async (data: any) => {
        await updateCompany.mutateAsync(data);
        toast({
          title: t("App mode saved"),
          description: t("Mobile and admin menus will update after refresh."),
          className: "bg-slate-900 text-white border-none rounded-2xl"
        });
      }} />;
      case 'pos': return <PosTerminalSettings companyId={activeCompany.id} formData={formData} setFormData={setFormData} />;
      case 'restaurant': return <RestaurantSettings company={activeCompany} onUpdate={async (data) => { await updateCompany.mutateAsync(data); }} />;
      case 'bus-ticketing': return <BusTicketingSettings formData={formData} setFormData={setFormData} />;
      case 'communication': return <CommunicationSettings formData={formData} setFormData={setFormData} />;
      case 'language': return (
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-5">
            <h3 className="text-base font-bold text-slate-900">{t("Interface Language")}</h3>
            <p className="text-sm text-slate-500 mt-1">{t("Choose the language used across the system.")}</p>
            <div className="mt-4">
              <LanguageSwitcher />
            </div>
          </div>
        </div>
      );
      case 'maintenance': return <MaintenanceSettings company={activeCompany} />;
      default: return <OrganizationProfile company={activeCompany} formData={formData} setFormData={setFormData} />;
    }
  };

  const showGlobalSave = ['profile', 'banking', 'accounting', 'inventory', 'tax', 'app-mode', 'pos', 'communication', 'restaurant', 'bus-ticketing', 'maintenance'].includes(visibleActiveTab);

  const getItemIcon = (id: string) => {
    switch (id) {
      case "profile": return Building2;
      case "branches": return GitBranch;
      case "approval-policies": return ClipboardCheck;
      case "partnerships": return Users;
      case "security": return Lock;
      case "banking": return Landmark;
      case "accounting": return Calculator;
      case "inventory": return Package;
      case "currencies": return Coins;
      case "zimra": return Cpu;
      case "tax": return Percent;
      case "app-mode": return Smartphone;
      case "pos": return CreditCard;
      case "restaurant": return Utensils;
      case "bus-ticketing": return Bus;
      case "communication": return Mail;
      case "language": return Languages;
      case "maintenance": return Wrench;
      default: return Building2;
    }
  };

const getTabMeta = (id: string) => {
    switch (id) {
      case "profile": return { title: t("Organization Profile"), subtitle: t("Manage your organization details, contact information, and branding.") };
      case "branches": return { title: t("Branches & Cost Centers"), subtitle: t("Set up and manage branches used for cost center reporting.") };
      case "approval-policies": return { title: t("Approval Policies"), subtitle: t("Configure approval request policies and required roles.") };
      case "partnerships": return { title: t("Partnership Settings"), subtitle: t("Manage co-branded partners, logos, and revenue split settings.") };
      case "security": return { title: t("Security & Access Control"), subtitle: t("Configure access rules, password policies, and security settings.") };
      case "banking": return { title: t("Banking Details"), subtitle: t("Manage company banking details and default deposit accounts.") };
      case "accounting": return { title: t("Posting Setup"), subtitle: t("Configure automated transaction postings and defaults.") };
      case "sales-orders": return { title: t("Sales Orders Configuration"), subtitle: t("Configure deposit percentages, preorder rules, and lay-by default durations.") };
      case "inventory": return { title: t("Inventory Controls"), subtitle: t("Configure inventory valuation methods and default controls.") };
      case "currencies": return { title: t("Currencies"), subtitle: t("Set default currencies and manage exchange rates.") };
      case "zimra": return { title: t("ZIMRA Device Settings"), subtitle: t("Configure fiscal device connectivity and ZIMRA settings.") };
      case "tax": return { title: t("Tax Configuration"), subtitle: t("Manage tax categories and VAT configuration.") };
      case "app-mode": return { title: t("App Mode Configuration"), subtitle: t("Switch between standard retail, restaurant, or bus modes.") };
      case "pos": return { title: t("POS Terminal Settings"), subtitle: t("Configure registers, printing, receipts, and tills.") };
      case "restaurant": return { title: t("Restaurant Settings"), subtitle: t("Set up restaurant layout, tables, and KDS settings.") };
      case "bus-ticketing": return { title: t("Bus Ticketing Settings"), subtitle: t("Manage ticketing routes, fleet settings, and conductor configs.") };
      case "communication": return { title: t("Communication Settings"), subtitle: t("Configure email notifications and templates.") };
      case "language": return { title: t("Interface Language"), subtitle: t("Choose the language used across the system.") };
      case "maintenance": return { title: t("System Maintenance"), subtitle: t("Perform system diagnostic tasks and database resets.") };
      default: return { title: t("Settings"), subtitle: t("Manage your system settings and preferences.") };
    }
  };

  const activeTabMeta = getTabMeta(visibleActiveTab);

  return (
    <Layout>
      <div className="flex flex-col lg:flex-row gap-8 items-start mt-4">
        {/* Left Column: Sidebar Settings Navigation */}
        <aside className="w-full lg:w-[260px] shrink-0 bg-white border border-slate-200/80 rounded-2xl p-4 shadow-sm">
          {/* Mobile Select Navigation */}
          <div className="lg:hidden">
            <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-400 px-1 py-1 mb-2">{t("Settings Menu")}</h4>
            <select 
              value={activeTab} 
              onChange={(e) => setActiveTab(e.target.value)}
              className="w-full h-12 bg-slate-50 border border-slate-200 rounded-xl px-4 font-semibold text-slate-700 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            >
              {menuGroups.map((group) => (
                <optgroup key={group.title} label={group.title}>
                  {group.items.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
          
          {/* Desktop Navigation */}
          <div className="hidden lg:block space-y-6">
            {menuGroups.map((group) => (
              <div key={group.title} className="space-y-1.5">
                <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-400 px-3 py-1">{group.title}</h4>
                <nav className="space-y-0.5">
                  {group.items.map((item) => {
                    const Icon = getItemIcon(item.id);
                    const isActive = visibleActiveTab === item.id;
                    return (
                      <button
                        key={item.id}
                        onClick={() => setActiveTab(item.id)}
                        className={`w-full flex items-center justify-between px-3 py-2.5 text-[16px] font-semibold rounded-xl transition-all ${
                          isActive 
                            ? "bg-blue-50 text-blue-600 font-bold"
                            : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <Icon className={`w-[18px] h-[18px] ${isActive ? 'text-blue-600' : 'text-slate-400'}`} />
                          <span className="font-display tracking-tight">{item.label}</span>
                        </div>
                        {isActive && <div className="w-1.5 h-1.5 rounded-full bg-blue-600" />}
                      </button>
                    );
                  })}
                </nav>
              </div>
            ))}
          </div>
        </aside>

        {/* Right Column: Settings Content Container */}
        <div className="flex-1 w-full bg-white border border-slate-200/80 rounded-2xl p-6 md:p-8 shadow-sm min-h-[600px] flex flex-col justify-between">
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-slate-100">
              <div>
                <h2 className="text-xl font-bold text-slate-900">{activeTabMeta.title}</h2>
                <p className="text-sm text-slate-500 mt-0.5">{activeTabMeta.subtitle}</p>
              </div>
              {showGlobalSave && (
                <Button
                  onClick={handleGlobalSave}
                  disabled={updateCompany.isPending}
                  className="h-9 rounded-xl bg-blue-600 hover:bg-blue-700 px-4 text-sm font-semibold text-white transition-colors self-start sm:self-auto"
                >
                  {updateCompany.isPending ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                  {t("Save Changes")}
                </Button>
              )}
            </div>

            <div className="pt-2">
              <AnimatePresence mode="wait">
                <motion.div
                  key={visibleActiveTab}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.18, ease: "easeInOut" }}
                  className="w-full"
                >
                  {renderContent()}
                </motion.div>
              </AnimatePresence>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
