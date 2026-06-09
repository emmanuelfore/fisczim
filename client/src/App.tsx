import { Switch, Route, Redirect, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import LandingPage from "@/pages/landing";
import AuthPage from "@/pages/auth";
import ForgotPasswordPage from "@/pages/forgot-password";
import ResetPasswordPage from "@/pages/reset-password";
import OnboardingPage from "@/pages/onboarding";
import Dashboard from "@/pages/dashboard";
import InvoicesPage from "@/pages/invoices";
import CreateInvoicePage from "@/pages/create-invoice";
import InvoiceDetailsPage from "@/pages/invoice-details";
import InvoiceTemplateDesignerPage from "@/pages/invoice-template-designer";
import CustomersPage from "@/pages/customers";
import CustomerDetailsPage from "@/pages/customer-details";
import SuppliersPage from "@/pages/suppliers";
import ExpensesPage from "@/pages/expenses";
import InventoryTransactionsPage from "@/pages/inventory-transactions";
import InventoryAdjustmentsPage from "@/pages/inventory-adjustments";
import InventoryStockCountsPage from "@/pages/inventory-stock-counts";
import ProductionPage from "@/pages/production";
import InventoryAccountPage from "@/pages/inventory-account";
import PurchaseOrdersPage from "@/pages/purchase-orders";
import GrvDetailsPage from "@/pages/grv-details";
import ProductsPage from "@/pages/products";
import BulkPriceAdjustmentPage from "@/pages/bulk-price-adjustment";
import AutoSparesPage from "@/pages/auto-spares";
import ServicesPage from "@/pages/services";
import TaxConfigPage from "@/pages/tax-config";
import SettingsPage from "@/pages/settings";
import ZimraSettingsPage from "@/pages/zimra-settings";
import FdmsTestPage from "@/pages/fdms-test";
import CurrencySettingsPage from "@/pages/currency-settings";
import TeamSettingsPage from "@/pages/team-settings";
import UserProfilePage from "@/pages/user-profile";
import AuditLogsPage from "@/pages/audit-logs";
import RestaurantLayoutPage from "@/pages/restaurant-layout";
import QuotationsPage from "@/pages/quotations";
import CreateQuotationPage from "@/pages/create-quotation";
import FinancialReportsPage from "@/pages/financial-reports";
import DailySalesLedgerPage from "@/pages/daily-sales-ledger";
import InventoryReportsPage from "@/pages/inventory-reports";
import RecurringInvoicesPage from "@/pages/recurring-invoices";
import ZimraLogsPage from "@/pages/zimra-logs";
import POSPage from "@/pages/pos";
import MySalesPage from "@/pages/my-sales";
import PosReportsPage from "@/pages/pos-reports";
import RecentSalesPage from "@/pages/recent-sales";
import TaxReportsPage from "@/pages/tax-reports";
import KDSPage from "@/pages/kds";
import LiveOrdersPage from "@/pages/live-orders";
import OrderStatusPage from "@/pages/order-status";
import SubscriptionPage from "@/pages/subscription";
import PosLoginPage from "@/pages/pos-login";
import ReportsPage from "@/pages/reports";
import BulkAdjustmentPage from "@/pages/bulk-adjustment";
import StockTakePage from "@/pages/stock-take";
import PaymentsReceivedPage from "@/pages/payments-received";
import PaymentPreviewPage from "@/pages/payment-preview";
import CustomerStatementsPage from "@/pages/customer-statements";
import CashCollectionReportPage from "@/pages/cash-collection-report-page";
import BusFleetPage from "@/pages/bus-fleet";
import BusTripsPage from "@/pages/bus-trips";
import BusConductorsPage from "@/pages/bus-conductors";
import BusReportsPage from "@/pages/bus-reports";
import BusDashboardPage from "@/pages/bus-dashboard";
import AccountingCOAPage from "@/pages/accounting-coa";
import AccountingJournalPage from "@/pages/accounting-journal";
import TrialBalancePage from "@/pages/accounting-trial-balance";
import GeneralLedgerPage from "@/pages/accounting-ledger";
import SupplierInvoicesPage from "@/pages/supplier-invoices";
import CashbookPage from "@/pages/cashbook";
import AgingReportsPage from "@/pages/aging-reports";
import CostCentersPage from "@/pages/cost-centers";
import FixedAssetsPage from "@/pages/fixed-assets";
import FinancialPeriodsPage from "@/pages/financial-periods";
import VatReturnPage from "@/pages/vat-return";
import BankReconciliationPage from "@/pages/bank-reconciliation";
import AccountLedgerPage from "@/pages/account-drilled-ledger";
import DebtorAnalysisPage from "@/pages/debtor-analysis";
import CreditorAnalysisPage from "@/pages/creditor-analysis";
import OpeningBalancesPage from "@/pages/opening-balances";
import AccountingAuditTrailPage from "@/pages/accounting-audit-trail";
import AllocationWorkbenchPage from "@/pages/allocation-workbench";
import AccountingDashboardPage from "@/pages/accounting-dashboard";
import ApprovalsPage from "@/pages/approvals";
import PartnershipSalesReportPage from "@/pages/partnership-sales-report";
import { useAuth } from "@/hooks/use-auth";
import { usePermissions } from "@/hooks/use-permissions";
import { NAV_PERMISSION_MAP } from "@shared/permissions";
import { supabase } from "@/lib/supabase";
import { useCompanies } from "@/hooks/use-companies";
import { useActiveCompany } from "@/hooks/use-active-company";
import { Loader2 } from "lucide-react";
import { insertBusRouteSchema, type BusRouteCloud } from "@shared/schema";
import { useEffect, useRef, useState } from "react";
import { PwaInstallPrompt } from "@/components/pwa-install-prompt";
import { getPwaLaunchRedirect } from "@/hooks/use-pwa-install";
import { useIsOnline } from "@/hooks/use-is-online";
import { useBranding } from "@/hooks/use-branding";
import { ThemeManager } from "@/components/theme-manager";
function useBoundedLoading(loading: boolean, maxMs = 5000): boolean {
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    if (!loading) {
      setTimedOut(false);
      return;
    }
    setTimedOut(false);
    const timer = setTimeout(() => setTimedOut(true), maxMs);
    return () => clearTimeout(timer);
  }, [loading, maxMs]);

  return loading && !timedOut;
}

function LoadingScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <Loader2 className="w-8 h-8 animate-spin text-primary" />
    </div>
  );
}

function ProtectedRoute({ component: Component }: { component: React.ComponentType }) {
  const { user, isLoading: isLoadingAuth } = useAuth();
  const {
    data: companies,
    isLoading: isLoadingCompanies,
    isError: isCompaniesError,
  } = useCompanies(!!user, user?.id ?? null);
  const { activeCompany, isLoading: isLoadingActiveCompany } = useActiveCompany(!!user, user?.id ?? null);
  const { canAccessPath, can, isLoading: isLoadingPermissions } = usePermissions();
  const [location, setLocation] = useLocation();
  const isOnline = useIsOnline();
  const hasRedirectedToPosRef = useRef(false);

  const isPosPath = location.startsWith("/pos");
  const isOffline = !isOnline || isCompaniesError;
  const pathPermission = NAV_PERMISSION_MAP[location.split("?")[0]];

  const rawLoading = isLoadingAuth || (!!user && (isLoadingCompanies || isLoadingActiveCompany || isLoadingPermissions));
  const isLoading = useBoundedLoading(rawLoading);

  useEffect(() => {
    if (isOffline && !isPosPath && !hasRedirectedToPosRef.current) {
      hasRedirectedToPosRef.current = true;
      setLocation("/pos");
    }
  }, [isOffline, isPosPath, setLocation]);

  if (isLoading) return <LoadingScreen />;

  // No user at all — if offline send to /pos (they may have cached data),
  // if online send to /auth
  if (!user) return <Redirect to={isOffline ? "/pos" : "/auth"} />;

  // Redirect to onboarding if online and company list is definitively empty
  if (!isOffline && companies && companies.length === 0) {
    if (location !== "/onboarding") return <Redirect to="/onboarding" />;
  }

  if (!isOffline && activeCompany && !user?.isSuperAdmin) {
    const isAllowedPath =
      isPosPath ||
      location.startsWith("/profile") ||
      location.startsWith("/approvals") ||
      location.startsWith("/settings");
    if (!isAllowedPath && pathPermission && !canAccessPath(location.split("?")[0])) {
      if (can("nav.pos")) return <Redirect to="/pos" />;
      if (can("nav.dashboard")) return <Redirect to="/dashboard" />;
    }
  }

  return <Component />;
}

function OnboardingRoute() {
  const { user, isLoading: isLoadingAuth } = useAuth();
  const { data: companies, isLoading: isLoadingCompanies, isError } = useCompanies(!!user, user?.id ?? null);
  const isOnline = useIsOnline();

  const rawLoading = isLoadingAuth || (!!user && isLoadingCompanies);
  const isLoading = useBoundedLoading(rawLoading);

  if (isLoading) return <LoadingScreen />;
  if (!user) return <Redirect to="/auth" />;
  if (!Array.isArray(companies)) return <LoadingScreen />;
  
  // If offline, we shouldn't attempt onboarding as it requires network to create companies
  if (!isOnline || isError) return <Redirect to="/pos" />;

  // If we have companies, we shouldn't be here
  if (companies && companies.length > 0) {
    const role = (companies[0] as any).role;
    const isCashier = role === "cashier" && !user?.isSuperAdmin;
    return <Redirect to={isCashier ? "/pos" : "/dashboard"} />;
  }

  return <OnboardingPage />;
}

function Router() {
  const { user, isLoading: rawAuthLoading } = useAuth();
  const isOnline = useIsOnline();
  const isLoading = useBoundedLoading(rawAuthLoading);

  // If launched as an installed PWA from /pos, go straight there
  const pwaRedirect = getPwaLaunchRedirect();
  if (pwaRedirect) return <Redirect to={pwaRedirect} />;

  if (isLoading) return <LoadingScreen />;

  return (
    <Switch>
      <Route path="/auth">
        {user ? <Redirect to={isOnline ? "/dashboard" : "/pos"} /> : <AuthPage />}
      </Route>
      <Route path="/forgot-password" component={ForgotPasswordPage} />
      <Route path="/reset-password" component={ResetPasswordPage} />
      <Route path="/pos-login" component={PosLoginPage} />

      <Route path="/onboarding" component={OnboardingRoute} />

      <Route path="/dashboard">{() => <ProtectedRoute component={Dashboard} />}</Route>
      <Route path="/invoices">{() => <ProtectedRoute component={InvoicesPage} />}</Route>
      <Route path="/invoices/new">{() => <ProtectedRoute component={CreateInvoicePage} />}</Route>
      <Route path="/invoice-templates">{() => <ProtectedRoute component={InvoiceTemplateDesignerPage} />}</Route>
      <Route path="/invoices/:id">{() => <ProtectedRoute component={InvoiceDetailsPage} />}</Route>
      <Route path="/customers">{() => <ProtectedRoute component={CustomersPage} />}</Route>
      <Route path="/customers/:id">{() => <ProtectedRoute component={CustomerDetailsPage} />}</Route>
      <Route path="/suppliers">{() => <ProtectedRoute component={SuppliersPage} />}</Route>
      <Route path="/expenses">{() => <ProtectedRoute component={ExpensesPage} />}</Route>
      <Route path="/inventory/production">{() => <ProtectedRoute component={ProductionPage} />}</Route>
      <Route path="/inventory/purchase-orders">{() => <ProtectedRoute component={PurchaseOrdersPage} />}</Route>
      <Route path="/inventory">{() => <ProtectedRoute component={InventoryTransactionsPage} />}</Route>
      <Route path="/inventory/adjustments">{() => <ProtectedRoute component={InventoryAdjustmentsPage} />}</Route>
      <Route path="/inventory/stock-counts">{() => <ProtectedRoute component={InventoryStockCountsPage} />}</Route>
      <Route path="/inventory/bulk-adjust">{() => <ProtectedRoute component={BulkAdjustmentPage} />}</Route>
      <Route path="/inventory/stock-take">{() => <ProtectedRoute component={StockTakePage} />}</Route>
      <Route path="/inventory/account">{() => <ProtectedRoute component={InventoryAccountPage} />}</Route>
      <Route path="/inventory/grvs/:id">{() => <ProtectedRoute component={GrvDetailsPage} />}</Route>
      <Route path="/reports/inventory">{() => <ProtectedRoute component={InventoryReportsPage} />}</Route>
      <Route path="/reports/financial">{() => <ProtectedRoute component={FinancialReportsPage} />}</Route>
      <Route path="/reports/daily">{() => <ProtectedRoute component={DailySalesLedgerPage} />}</Route>
      <Route path="/products/bulk-adjust">{() => <ProtectedRoute component={BulkPriceAdjustmentPage} />}</Route>
      <Route path="/products">{() => <ProtectedRoute component={ProductsPage} />}</Route>
      <Route path="/auto-spares">{() => <ProtectedRoute component={AutoSparesPage} />}</Route>
      <Route path="/services">{() => <ProtectedRoute component={ServicesPage} />}</Route>
      <Route path="/tax-config">{() => <ProtectedRoute component={TaxConfigPage} />}</Route>
      <Route path="/settings">{() => <ProtectedRoute component={SettingsPage} />}</Route>
      <Route path="/approvals">{() => <ProtectedRoute component={ApprovalsPage} />}</Route>
      <Route path="/currencies">{() => <ProtectedRoute component={CurrencySettingsPage} />}</Route>
      <Route path="/team-settings">{() => <ProtectedRoute component={TeamSettingsPage} />}</Route>
      <Route path="/reports/pos">{() => <ProtectedRoute component={PosReportsPage} />}</Route>
      <Route path="/reports/tax">{() => <ProtectedRoute component={TaxReportsPage} />}</Route>
      <Route path="/reports-module">{() => <Redirect to="/reports" />}</Route>
      <Route path="/reports">{() => <ProtectedRoute component={ReportsPage} />}</Route>
      <Route path="/payments-received/:id?">{() => <ProtectedRoute component={PaymentsReceivedPage} />}</Route>
      <Route path="/payments/:id/preview">{() => <ProtectedRoute component={PaymentPreviewPage} />}</Route>
      <Route path="/reports/customer-statements">{() => <ProtectedRoute component={CustomerStatementsPage} />}</Route>
      <Route path="/reports/cash-collection">{() => <ProtectedRoute component={CashCollectionReportPage} />}</Route>
      <Route path="/reports/partnership-sales">{() => <ProtectedRoute component={PartnershipSalesReportPage} />}</Route>
      <Route path="/profile">{() => <ProtectedRoute component={UserProfilePage} />}</Route>
      <Route path="/restaurant/layout">{() => <ProtectedRoute component={RestaurantLayoutPage} />}</Route>
      <Route path="/zimra-settings">{() => <ProtectedRoute component={ZimraSettingsPage} />}</Route>
      <Route path="/zimra-logs">{() => <ProtectedRoute component={ZimraLogsPage} />}</Route>
      <Route path="/fdms-test">{() => <ProtectedRoute component={FdmsTestPage} />}</Route>
      <Route path="/restaurant/layout">{() => <ProtectedRoute component={RestaurantLayoutPage} />}</Route>
      <Route path="/quotations">{() => <ProtectedRoute component={QuotationsPage} />}</Route>
      <Route path="/quotations/new">{() => <ProtectedRoute component={CreateQuotationPage} />}</Route>
      <Route path="/recurring">{() => <ProtectedRoute component={RecurringInvoicesPage} />}</Route>
      <Route path="/subscription">{() => <ProtectedRoute component={SubscriptionPage} />}</Route>
      <Route path="/pos/my-sales">{() => <ProtectedRoute component={MySalesPage} />}</Route>
      <Route path="/pos/reports">{() => <Redirect to="/reports/pos" />}</Route>
      <Route path="/pos/all-sales">{() => <ProtectedRoute component={RecentSalesPage} />}</Route>
      <Route path="/pos">{() => <ProtectedRoute component={POSPage} />}</Route>
      <Route path="/pos-settings">{() => <Redirect to="/settings?tab=pos" />}</Route>
      <Route path="/bus/fleet">{() => <ProtectedRoute component={BusFleetPage} />}</Route>
      <Route path="/bus/dashboard">{() => <ProtectedRoute component={BusDashboardPage} />}</Route>
      <Route path="/bus/trips">{() => <ProtectedRoute component={BusTripsPage} />}</Route>
      <Route path="/bus/conductors">{() => <ProtectedRoute component={BusConductorsPage} />}</Route>
      <Route path="/bus/reports">{() => <ProtectedRoute component={BusReportsPage} />}</Route>
      <Route path="/restaurant/kds">{() => <ProtectedRoute component={KDSPage} />}</Route>
      <Route path="/restaurant/orders">{() => <ProtectedRoute component={LiveOrdersPage} />}</Route>
      <Route path="/order-status" component={OrderStatusPage} />
      <Route path="/accounting/coa">{() => <ProtectedRoute component={AccountingCOAPage} />}</Route>
      <Route path="/accounting/dashboard">{() => <ProtectedRoute component={AccountingDashboardPage} />}</Route>
      <Route path="/accounting/opening-balances">{() => <ProtectedRoute component={OpeningBalancesPage} />}</Route>
      <Route path="/accounting/journal">{() => <ProtectedRoute component={AccountingJournalPage} />}</Route>
      <Route path="/accounting/audit-trail">{() => <ProtectedRoute component={AccountingAuditTrailPage} />}</Route>
      <Route path="/accounting/allocations">{() => <ProtectedRoute component={AllocationWorkbenchPage} />}</Route>
      <Route path="/accounting/reports/trial-balance">{() => <ProtectedRoute component={TrialBalancePage} />}</Route>
      <Route path="/accounting/reports/ledger">{() => <ProtectedRoute component={GeneralLedgerPage} />}</Route>
      <Route path="/accounting/reports/financial">{() => <ProtectedRoute component={FinancialReportsPage} />}</Route>
      <Route path="/accounting/reports/balance-sheet">{() => <ProtectedRoute component={FinancialReportsPage} />}</Route>
      <Route path="/accounting/reports/cash-flow">{() => <ProtectedRoute component={FinancialReportsPage} />}</Route>
      <Route path="/accounting/accounts-receivable">{() => <ProtectedRoute component={AgingReportsPage} />}</Route>
      <Route path="/accounting/accounts-payable">{() => <ProtectedRoute component={AgingReportsPage} />}</Route>
      <Route path="/accounting/reports/aging">{() => <ProtectedRoute component={AgingReportsPage} />}</Route>
      <Route path="/accounting/reports/cost-centers">{() => <ProtectedRoute component={CostCentersPage} />}</Route>
      <Route path="/accounting/reports/vat-return">{() => <ProtectedRoute component={VatReturnPage} />}</Route>
      <Route path="/accounting/fixed-assets">{() => <ProtectedRoute component={FixedAssetsPage} />}</Route>
      <Route path="/accounting/reconciliation">{() => <ProtectedRoute component={BankReconciliationPage} />}</Route>
      <Route path="/accounting/periods">{() => <ProtectedRoute component={FinancialPeriodsPage} />}</Route>
      <Route path="/accounting/ledger/:id">{() => <ProtectedRoute component={AccountLedgerPage} />}</Route>
      <Route path="/accounting/debtors/:id">{() => <ProtectedRoute component={DebtorAnalysisPage} />}</Route>
      <Route path="/accounting/creditors/:id">{() => <ProtectedRoute component={CreditorAnalysisPage} />}</Route>
      <Route path="/accounting/cashbook">{() => <ProtectedRoute component={CashbookPage} />}</Route>
      <Route path="/supplier-invoices">{() => <ProtectedRoute component={SupplierInvoicesPage} />}</Route>
      <Route path="/">
        {user ? <Redirect to={isOnline ? "/dashboard" : "/pos"} /> : <LandingPage />}
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

// Bridge: service worker asks for auth token during background sync
function useSwAuthBridge() {
  useEffect(() => {
    if (!navigator.serviceWorker) return;

    const handler = async (event: MessageEvent) => {
      if (event.data?.type !== 'GET_AUTH_TOKEN') return;
      try {
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token ?? null;
        event.ports[0]?.postMessage({ token });
      } catch {
        event.ports[0]?.postMessage({ token: null });
      }
    };

    navigator.serviceWorker.addEventListener('message', handler);
    return () => navigator.serviceWorker.removeEventListener('message', handler);
  }, []);
}

function BrandingMeta() {
  const { brand } = useBranding();
  
  useEffect(() => {
    document.title = brand.name + " | ZIMRA Compliant Fiscalization";
    
    // Update favicon dynamically
    let link = document.querySelector("link[rel~='icon']") as HTMLLinkElement;
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      document.getElementsByTagName('head')[0].appendChild(link);
    }
    // Note: We use the same favicon path for simplicity in development, 
    // but in production these would be different assets in the build folder.
    // However, the logo is definitely different.
  }, [brand]);

  return null;
}

import { BranchProvider } from "./lib/branch-context";

function App() {
  useSwAuthBridge();
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeManager />
      <TooltipProvider>
        <BranchProvider>
          <BrandingMeta />
          <Toaster />
          <PwaInstallPrompt />
          <Router />
        </BranchProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
