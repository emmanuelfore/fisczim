import { Layout } from "@/components/layout";
import { useActiveCompany } from "@/hooks/use-active-company";
import { useUpdateCompany } from "@/hooks/use-companies";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Save, RefreshCw } from "lucide-react";
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

// Import Sub-components
import { OrganizationProfile } from "@/components/settings/organization-profile";
import { TeamManagement } from "@/components/settings/team-management";
import { RoleManagement } from "@/components/settings/role-management";
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
import { AccountingSystemSettings } from "@/components/settings/accounting-system-settings";
import { InventorySettings } from "@/components/settings/inventory-settings";
import { BusTicketingSettings } from "@/components/settings/bus-ticketing-settings";
import { DEFAULT_BUS_SETTINGS } from "@shared/bus-settings";
import { AppModeSettings } from "@/components/settings/app-mode-settings";
import { normalizeAppMode } from "@shared/app-mode";
import { normalizeBusSettings } from "@shared/bus-settings";

export default function SettingsPage() {
  const { toast } = useToast();
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
        title: "Configuration Saved",
        description: "Your organization settings have been updated successfully.",
        className: "bg-slate-900 text-white border-none rounded-2xl"
      });
    } catch (err: any) {
      toast({
        title: "Save Failed",
        description: err.message || "An unexpected error occurred",
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
      title: "Organization",
      items: [
        { id: "profile", label: "Profile" },
        { id: "branches", label: "Branches" },
        { id: "team", label: "Team" },
        { id: "roles", label: "Roles" },
        { id: "approval-policies", label: "Approvals" },
        { id: "partnerships", label: "Partnerships" },
        { id: "security", label: "Security" },
      ]
    },
    {
      title: "Financial",
      items: [
        { id: "banking", label: "Banking" },
        { id: "accounting", label: "Accounting" },
        { id: "inventory", label: "Inventory" },
        { id: "currencies", label: "Currencies" },
      ]
    },
    {
      title: "Fiscal (Tax)",
      items: [
        { id: "zimra", label: "ZIMRA Device" },
        { id: "tax", label: "Tax Config" },
      ]
    },
    {
      title: "Point of Sale",
      items: [
        { id: "app-mode", label: "App Mode" },
        { id: "pos", label: "POS Terminal" },
        { id: "restaurant", label: "Restaurant" },
        { id: "bus-ticketing", label: "Bus Ticketing" },
      ]
    },
    {
      title: "System",
      items: [
        { id: "communication", label: "Communication" },
        ...(activeCompany?.role === 'owner' ? [{ id: "maintenance", label: "Maintenance" }] : [])
      ]
    }
  ];
  const busOnlyMenuGroups = [
    {
      title: "Bus Ticketing",
      items: [
        { id: "app-mode", label: "App Mode" },
        { id: "bus-ticketing", label: "Bus Ticketing" },
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
      case 'team': return <TeamManagement companyId={activeCompany.id} />;
      case 'roles': return <RoleManagement companyId={activeCompany.id} />;
      case 'approval-policies': return <ApprovalPoliciesSettings companyId={activeCompany.id} />;
      case 'partnerships': return <PartnershipManagement companyId={activeCompany.id} />;
      case 'security': return <SecuritySettings company={activeCompany} />;
      case 'banking': return <BankingSettings formData={formData} setFormData={setFormData} />;
      case 'accounting': return <AccountingSystemSettings companyId={activeCompany.id} formData={formData} setFormData={setFormData} />;
      case 'inventory': return <InventorySettings formData={formData} setFormData={setFormData} />;
      case 'currencies': return <CurrencySettings companyId={activeCompany.id} />;
      case 'tax': return <TaxComplianceSettings companyId={activeCompany.id} formData={formData} setFormData={setFormData} />;
      case 'zimra': return <ZimraDeviceSettings company={activeCompany} />;
      case 'app-mode': return <AppModeSettings formData={formData} setFormData={setFormData} onSave={async (data) => {
        await updateCompany.mutateAsync(data);
        toast({
          title: "App mode saved",
          description: "Mobile and admin menus will update after refresh.",
          className: "bg-slate-900 text-white border-none rounded-2xl"
        });
      }} />;
      case 'pos': return <PosTerminalSettings companyId={activeCompany.id} formData={formData} setFormData={setFormData} />;
      case 'restaurant': return <RestaurantSettings company={activeCompany} onUpdate={async (data) => { await updateCompany.mutateAsync(data); }} />;
      case 'bus-ticketing': return <BusTicketingSettings formData={formData} setFormData={setFormData} />;
      case 'communication': return <CommunicationSettings formData={formData} setFormData={setFormData} />;
      case 'maintenance': return <MaintenanceSettings company={activeCompany} />;
      default: return <OrganizationProfile company={activeCompany} formData={formData} setFormData={setFormData} />;
    }
  };

  const showGlobalSave = ['profile', 'banking', 'accounting', 'inventory', 'tax', 'app-mode', 'pos', 'communication', 'restaurant', 'bus-ticketing', 'maintenance'].includes(visibleActiveTab);

  return (
    <Layout>
      <div className="space-y-4">
        <div className="flex justify-end">
          {showGlobalSave && (
            <Button
              onClick={handleGlobalSave}
              disabled={updateCompany.isPending}
              className="h-9 rounded-[10px] bg-[#2563EB] px-3.5 text-sm font-semibold text-white hover:bg-[#1D4ED8]"
            >
              {updateCompany.isPending ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Save Changes
            </Button>
          )}
        </div>

        <div className="-mx-1 overflow-x-auto border-b border-[#E5E7EB]">
          <div className="flex gap-5 px-1">
            {settingsTabs.map((item) => (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`relative h-10 shrink-0 whitespace-nowrap text-sm font-semibold transition-colors ${
                  visibleActiveTab === item.id
                    ? "text-[#2563EB] after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:rounded-full after:bg-[#2563EB]"
                    : "text-[#64748B] hover:text-[#0F172A]"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        <div className="relative min-h-[600px]">
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
    </Layout>
  );
}

