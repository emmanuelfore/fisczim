const HRPayslips = lazy(() => import("@/pages/hr/payslips"));
const HRDashboard = lazy(() => import("@/pages/hr/index"));
import { Switch, Route, Redirect, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useFiscalAuthority } from "@/hooks/use-fiscal-authority";
import NotFound from "@/pages/not-found";
import LandingPage from "@/pages/landing";
import AuthPage from "@/pages/auth";
import ForgotPasswordPage from "@/pages/forgot-password";
import ResetPasswordPage from "@/pages/reset-password";
import OnboardingPage from "@/pages/onboarding";
const Dashboard = lazy(() => import("@/pages/dashboard"));
const BomList = lazy(() => import("@/pages/manufacturing/bom-list"));
const BomForm = lazy(() => import("@/pages/manufacturing/bom-form"));
const ProductionRunList = lazy(() => import("@/pages/manufacturing/production-run-list"));
const ProductionRunForm = lazy(() => import("@/pages/manufacturing/production-run-form"));
const ProductionRunDetails = lazy(() => import("@/pages/manufacturing/production-run-details"));
const WorkCenters = lazy(() => import("@/pages/manufacturing/work-centers"));
const Routings = lazy(() => import("@/pages/manufacturing/routings"));
const ManufacturingDashboard = lazy(() => import("@/pages/manufacturing/index"));
const ManufacturingReports = lazy(() => import("@/pages/manufacturing/reports"));
const MrpDashboard = lazy(() => import("@/pages/manufacturing/mrp-dashboard"));
const StandardCostsPage = lazy(() => import("@/pages/manufacturing/standard-costs"));

const InvoicesPage = lazy(() => import("@/pages/invoices"));
const CreateInvoicePage = lazy(() => import("@/pages/create-invoice"));
const InvoiceDetailsPage = lazy(() => import("@/pages/invoice-details"));
const InvoiceTemplateDesignerPage = lazy(() => import("@/pages/invoice-template-designer"));
const CustomersPage = lazy(() => import("@/pages/customers"));
const CustomerDetailsPage = lazy(() => import("@/pages/customer-details"));
const SuppliersPage = lazy(() => import("@/pages/suppliers"));
const FreightForwardersPage = lazy(() => import("@/pages/freight/forwarders"));
const ConsignmentsPage = lazy(() => import("@/pages/freight/consignments"));
const FreightDashboardPage = lazy(() => import("@/pages/freight/dashboard"));
const FreightReceivingPage = lazy(() => import("@/pages/freight/receiving"));
const FreightReportsPage = lazy(() => import("@/pages/freight/reports"));
const ExpensesPage = lazy(() => import("@/pages/expenses"));
const InventoryTransactionsPage = lazy(() => import("@/pages/inventory-transactions"));
const InventoryAdjustmentsPage = lazy(() => import("@/pages/inventory-adjustments"));
const StockAdjustmentsReportPage = lazy(() => import("@/pages/stock-adjustments-report"));
const InventoryStockCountsPage = lazy(() => import("@/pages/inventory-stock-counts"));
const ProductionPage = lazy(() => import("@/pages/production"));
const InventoryAccountPage = lazy(() => import("@/pages/inventory-account"));
const StockTransfersPage = lazy(() => import("@/pages/stock-transfers"));
const StockTransferFormPage = lazy(() => import("@/pages/stock-transfer-form"));
const StockTransferDetailsPage = lazy(() => import("@/pages/stock-transfer-details"));
const InventoryLocationsPage = lazy(() => import("@/pages/inventory-locations"));
const PurchaseOrdersPage = lazy(() => import("@/pages/purchase-orders"));
const PurchaseOrderFormPage = lazy(() => import("@/pages/purchase-order-form"));
const PurchaseOrderDetailsPage = lazy(() => import("@/pages/purchase-order-details"));
const PurchaseReturnsPage = lazy(() => import("@/pages/purchase-returns"));
const PurchaseReturnFormPage = lazy(() => import("@/pages/purchase-return-form"));
const PurchaseReturnDetailsPage = lazy(() => import("@/pages/purchase-return-details"));
const GrvDetailsPage = lazy(() => import("@/pages/grv-details"));
const CreateGrv = lazy(() => import("@/pages/create-grv"));
const ProductsPage = lazy(() => import("@/pages/products"));
const BulkPriceAdjustmentPage = lazy(() => import("@/pages/bulk-price-adjustment"));
const SerialTrackingPage = lazy(() => import("@/pages/serial-tracking"));
const ServicesPage = lazy(() => import("@/pages/services"));
const TaxConfigPage = lazy(() => import("@/pages/tax-config"));
const SettingsPage = lazy(() => import("@/pages/settings"));
const TaxSettingsPage = lazy(() => import("@/pages/tax-settings"));
const FiscalTestPage = lazy(() => import("@/pages/fiscal-test"));
const CurrencySettingsPage = lazy(() => import("@/pages/currency-settings"));
const TeamSettingsPage = lazy(() => import("@/pages/team-settings"));
const UserProfilePage = lazy(() => import("@/pages/user-profile"));
const AuditLogsPage = lazy(() => import("@/pages/audit-logs"));
const RestaurantLayoutPage = lazy(() => import("@/pages/restaurant-layout"));
const QuotationsPage = lazy(() => import("@/pages/quotations"));
const CreateQuotationPage = lazy(() => import("@/pages/create-quotation"));
const FinancialReportsPage = lazy(() => import("@/pages/financial-reports"));
const DailySalesLedgerPage = lazy(() => import("@/pages/daily-sales-ledger"));
const InventoryReportsPage = lazy(() => import("@/pages/inventory-reports"));
const RecurringInvoicesPage = lazy(() => import("@/pages/recurring-invoices"));
const ZimraLogsPage = lazy(() => import("@/pages/zimra-logs"));
const JobsPage = lazy(() => import("@/pages/jobs"));const ApiLogsPage = lazy(() => import("@/pages/api-logs"));
const POSPage = lazy(() => import("@/pages/pos"));
const MySalesPage = lazy(() => import("@/pages/my-sales"));
const PosReportsPage = lazy(() => import("@/pages/pos-reports"));
const RecentSalesPage = lazy(() => import("@/pages/recent-sales"));
const TaxReportsPage = lazy(() => import("@/pages/tax-reports"));
const BranchReportsPage = lazy(() => import("@/pages/branch-reports"));
const KDSPage = lazy(() => import("@/pages/kds"));
const LiveOrdersPage = lazy(() => import("@/pages/live-orders"));
const OrderStatusPage = lazy(() => import("@/pages/order-status"));
const SubscriptionPage = lazy(() => import("@/pages/subscription"));
import PosLoginPage from "@/pages/pos-login";
const ReportsPage = lazy(() => import("@/pages/reports"));
const BulkAdjustmentPage = lazy(() => import("@/pages/bulk-adjustment"));
const StockTakePage = lazy(() => import("@/pages/stock-take"));
const PaymentsReceivedPage = lazy(() => import("@/pages/payments-received"));
const PaymentPreviewPage = lazy(() => import("@/pages/payment-preview"));
const CustomerStatementsPage = lazy(() => import("@/pages/customer-statements"));
const CashCollectionReportPage = lazy(() => import("@/pages/cash-collection-report-page"));
const BusFleetPage = lazy(() => import("@/pages/bus-fleet"));
const BusTripsPage = lazy(() => import("@/pages/bus-trips"));
const BusTrackingPage = lazy(() => import("@/pages/bus-tracking"));
const BusConductorsPage = lazy(() => import("@/pages/bus-conductors"));
const DailyReportPage = lazy(() => import("@/pages/bus-reports/daily"));
const RangeReportPage = lazy(() => import("@/pages/bus-reports/range"));
const ConductorReportPage = lazy(() => import("@/pages/bus-reports/conductor"));
const CashupReportPage = lazy(() => import("@/pages/bus-reports/cashup"));
const BusTripPerformancePage = lazy(() => import("@/pages/bus-trip-performance"));
const BusManifestPage = lazy(() => import("@/pages/bus-manifest"));
const BusTicketDetailsPage = lazy(() => import("@/pages/bus-ticket-details"));
const BusDashboardPage = lazy(() => import("@/pages/bus-dashboard"));
const AccountingCOAPage = lazy(() => import("@/pages/accounting-coa"));
const AccountingJournalPage = lazy(() => import("@/pages/accounting-journal"));
const TrialBalancePage = lazy(() => import("@/pages/accounting-trial-balance"));
const GeneralLedgerPage = lazy(() => import("@/pages/accounting-ledger"));
const SupplierInvoicesPage = lazy(() => import("@/pages/supplier-invoices"));
const SupplierCreditNotesPage = lazy(() => import("@/pages/supplier-credit-notes"));
const SupplierInvoiceDetailsPage = lazy(() => import("@/pages/supplier-invoice-details"));
const SupplierInvoiceFormPage = lazy(() => import("@/pages/supplier-invoice-form"));
const SalesOrdersPage = lazy(() => import("@/pages/sales-orders"));
const CreateSalesOrderPage = lazy(() => import("@/pages/create-sales-order"));
const SalesOrderDetailsPage = lazy(() => import("@/pages/sales-order-details"));
const CompoundProductsPage = lazy(() => import("@/pages/compound-products"));
const CreateCompoundProductPage = lazy(() => import("@/pages/create-compound-product"));
const SalesOrderReportsPage = lazy(() => import("@/pages/sales-order-reports"));
const StockReceiptPage = lazy(() => import("@/pages/stock-receipt"));
const CashbookPage = lazy(() => import("@/pages/cashbook"));
const AgingReportsPage = lazy(() => import("@/pages/aging-reports"));
const CostCentersPage = lazy(() => import("@/pages/cost-centers"));
const FixedAssetsPage = lazy(() => import("@/pages/fixed-assets"));
const DepreciationRecordsPage = lazy(() => import("@/pages/depreciation-records"));
const FinancialPeriodsPage = lazy(() => import("@/pages/financial-periods"));
const VatReturnPage = lazy(() => import("@/pages/vat-return"));
const BankReconciliationPage = lazy(() => import("@/pages/bank-reconciliation"));
const AccountLedgerPage = lazy(() => import("@/pages/account-drilled-ledger"));
const DebtorAnalysisPage = lazy(() => import("@/pages/debtor-analysis"));
const CreditorAnalysisPage = lazy(() => import("@/pages/creditor-analysis"));
const OpeningBalancesPage = lazy(() => import("@/pages/opening-balances"));
const AccountingAuditTrailPage = lazy(() => import("@/pages/accounting-audit-trail"));
const AllocationWorkbenchPage = lazy(() => import("@/pages/allocation-workbench"));
const AccountingDashboardPage = lazy(() => import("@/pages/accounting-dashboard"));
const AccountingSegmentsPage = lazy(() => import("@/pages/accounting-segments"));
const ApprovalsPage = lazy(() => import("@/pages/approvals"));
const PartnershipSalesReportPage = lazy(() => import("@/pages/partnership-sales-report"));
const HRPayrollRuns = lazy(() => import("@/pages/hr/payroll"));
const HREmployees = lazy(() => import("@/pages/hr/employees"));
const HRLoans = lazy(() => import("@/pages/hr/loans"));
const HRLeave = lazy(() => import("@/pages/hr/leave"));
const HRSetup = lazy(() => import("@/pages/hr/setup"));
const HrRunReport = lazy(() => import("@/pages/hr/run-report"));
const HRZimraReports = lazy(() => import("@/pages/hr/zimra-reports"));
const HRSelfService = lazy(() => import("@/pages/hr/self-service"));
const SuperadminVisibilityPage = lazy(() => import("@/pages/superadmin-visibility"));
const MaterialDocumentLedger = lazy(() => import("@/pages/inventory/reports/ledger"));
const StockOverview = lazy(() => import("@/pages/inventory/reports/overview"));
const HistoricalStock = lazy(() => import("@/pages/inventory/reports/historical"));
const DeadStockReportPage = lazy(() => import("@/pages/inventory/reports/dead-stock"));
const ProductionReportPage = lazy(() => import("@/pages/inventory/reports/production"));
import { useAuth } from "@/hooks/use-auth";
import { usePermissions } from "@/hooks/use-permissions";
import { NAV_PERMISSION_MAP } from "@shared/permissions";
import { auth } from "@/lib/auth";
import { useCompanies } from "@/hooks/use-companies";
import { useActiveCompany } from "@/hooks/use-active-company";
import { Loader2 } from "lucide-react";
import { insertBusRouteSchema, type BusRouteCloud } from "@shared/schema";
import { Suspense, lazy, useEffect, useRef, useState } from "react";
import { getPwaLaunchRedirect } from "@/hooks/use-pwa-install";
import { useIsOnline } from "@/hooks/use-is-online";
import { useBranding } from "@/hooks/use-branding";
import { ThemeManager } from "@/components/theme-manager";
import { getCompanyHomeRoute } from "@/lib/company-home-route";
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

function LoadingScreen({ message = "Loading…" }: { message?: string }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-900 text-white p-6 gap-4">
      <Loader2 className="w-6 h-6 animate-spin text-indigo-400" />
      <p className="text-sm text-slate-300">{message}</p>
      {/* Skeleton blocks: perceived as "content is loading", not "broken". */}
      <div className="w-full max-w-sm space-y-2" aria-hidden="true">
        <div className="h-10 rounded-xl bg-white/5 animate-pulse" />
        <div className="h-10 rounded-xl bg-white/5 animate-pulse [animation-delay:150ms]" />
        <div className="h-10 rounded-xl bg-white/5 animate-pulse [animation-delay:300ms]" />
      </div>
    </div>
  );
}

function ProtectedRoute({
  component: Component,
}: {
  component: React.ComponentType;
}) {
  const { user, isLoading: isLoadingAuth } = useAuth();
  const {
    data: companies,
    isLoading: isLoadingCompanies,
    isError: isCompaniesError,
  } = useCompanies(!!user, user?.id ?? null);
  const { activeCompany, isLoading: isLoadingActiveCompany } = useActiveCompany(
    !!user,
    user?.id ?? null,
  );
  const { canAccessPath, can, isLoading: isLoadingPermissions } = usePermissions();
  const [location, setLocation] = useLocation();
  const isOnline = useIsOnline();
  const hasRedirectedToPosRef = useRef(false);

  const isPosPath = location.startsWith("/pos");
  const isOffline = !isOnline || isCompaniesError;
  const pathPermission = NAV_PERMISSION_MAP[location.split("?")[0]];
  const activeRole = (activeCompany as any)?.role;
  const isCashier = activeRole === "cashier" && !user?.isSuperAdmin;

  const rawLoading =
    isLoadingAuth ||
    (!!user && (isLoadingCompanies || isLoadingActiveCompany || isLoadingPermissions));
  const isLoading = useBoundedLoading(rawLoading);

  useEffect(() => {
    if (
      isOffline &&
      isCashier &&
      !isPosPath &&
      !hasRedirectedToPosRef.current
    ) {
      hasRedirectedToPosRef.current = true;
      setLocation("/pos");
    }
  }, [isOffline, isCashier, isPosPath, setLocation]);

  if (isLoading) return <LoadingScreen />;

  // No user at all — if offline send to /pos (they may have cached data),
  // if online send to /auth
  if (!user) return <Redirect to="/auth" />;

  // Redirect to onboarding if online and company list is definitively empty
  if (!isOffline && companies && companies.length === 0) {
    if (location !== "/onboarding") return <Redirect to="/onboarding" />;
  }

  if (!isOffline && activeCompany && !user?.isSuperAdmin) {
    // Paths that are always accessible to any authenticated company member
    const isAllowedPath =
      isPosPath ||
      location.startsWith("/profile") ||
      location.startsWith("/subscription") ||
      location.startsWith("/approvals");
    if (isCashier && !isAllowedPath) return <Redirect to="/pos" />;
    // canAccessPath now returns false for any path not in NAV_PERMISSION_MAP (deny-by-default).
    // We skip the check for explicitly allowed paths above.
    if (!isAllowedPath && !canAccessPath(location.split("?")[0])) {
      if (can("nav.pos")) return <Redirect to="/pos" />;
      if (can("nav.dashboard")) return <Redirect to="/dashboard" />;
    }

    if (location === "/dashboard") {
      const homeRoute = getCompanyHomeRoute(companies, user);
      if (homeRoute !== "/dashboard") return <Redirect to={homeRoute} />;
    }
  }

  return <Component />;
}

function OnboardingRoute() {
  const { user, isLoading: isLoadingAuth } = useAuth();
  const {
    data: companies,
    isLoading: isLoadingCompanies,
    isError,
  } = useCompanies(!!user, user?.id ?? null);
  const isOnline = useIsOnline();

  const rawLoading = isLoadingAuth || (!!user && isLoadingCompanies);
  const isLoading = useBoundedLoading(rawLoading);

  if (isLoading) return <LoadingScreen />;
  if (!user) return <Redirect to="/auth" />;
  if (!Array.isArray(companies)) return <LoadingScreen />;

  // If offline, onboarding cannot create a company. Only cashiers should be sent to POS.
  if (!isOnline || isError) {
    const role = Array.isArray(companies)
      ? (companies[0] as any)?.role
      : undefined;
    const isCashier = role === "cashier" && !user?.isSuperAdmin;
    return (
      <Redirect
        to={isCashier ? "/pos" : getCompanyHomeRoute(companies, user)}
      />
    );
  }

  // If we have companies, we shouldn't be here
  if (companies && companies.length > 0) {
    return <Redirect to={getCompanyHomeRoute(companies, user)} />;
  }

  return <OnboardingPage />;
}

function AuthRedirect() {
  const { user, isLoading: isLoadingAuth } = useAuth();
  const {
    data: companies,
    isLoading: isLoadingCompanies,
    isError,
  } = useCompanies(!!user, user?.id ?? null);
  const isOnline = useIsOnline();

  const rawLoading = isLoadingAuth || (!!user && isLoadingCompanies);
  const isLoading = useBoundedLoading(rawLoading);

  if (isLoading) return <LoadingScreen />;
  if (!user) return <Redirect to="/auth" />;
  if (!isOnline || isError)
    return <Redirect to={getCompanyHomeRoute(companies, user)} />;
  if (!Array.isArray(companies)) return <LoadingScreen />;

  return <Redirect to={getCompanyHomeRoute(companies, user)} />;
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
    <Suspense fallback={<LoadingScreen />}>
    <Switch>
      <Route path="/auth">{user ? <AuthRedirect /> : <AuthPage />}</Route>
      <Route path="/forgot-password" component={ForgotPasswordPage} />
      <Route path="/reset-password" component={ResetPasswordPage} />
      <Route path="/pos-login" component={PosLoginPage} />

      <Route path="/onboarding" component={OnboardingRoute} />

      <Route path="/dashboard">
        {() => <ProtectedRoute component={Dashboard} />}
      </Route>
      <Route path="/invoices">
        {() => <ProtectedRoute component={InvoicesPage} />}
      </Route>
      <Route path="/invoices/new">
        {() => <ProtectedRoute component={CreateInvoicePage} />}
      </Route>
      <Route path="/invoice-templates">
        {() => <ProtectedRoute component={InvoiceTemplateDesignerPage} />}
      </Route>
      <Route path="/invoices/:id">
        {() => <ProtectedRoute component={InvoiceDetailsPage} />}
      </Route>
      <Route path="/customers">
        {() => <ProtectedRoute component={CustomersPage} />}
      </Route>
      <Route path="/customers/:id">
        {() => <ProtectedRoute component={CustomerDetailsPage} />}
      </Route>
      <Route path="/suppliers">
        {() => <ProtectedRoute component={SuppliersPage} />}
      </Route>
      <Route path="/expenses">
        {() => <ProtectedRoute component={ExpensesPage} />}
      </Route>
      <Route path="/inventory/reports/ledger">
        {() => <ProtectedRoute component={MaterialDocumentLedger} />}
      </Route>
      <Route path="/inventory/reports/overview">
        {() => <ProtectedRoute component={StockOverview} />}
      </Route>
      <Route path="/inventory/reports/historical">
        {() => <ProtectedRoute component={HistoricalStock} />}
      </Route>
      <Route path="/inventory/reports/dead-stock">
        {() => <ProtectedRoute component={DeadStockReportPage} />}
      </Route>
      <Route path="/inventory/reports/production">
        {() => <ProtectedRoute component={ProductionReportPage} />}
      </Route>
      <Route path="/inventory/production">
        {() => <ProtectedRoute component={ProductionPage} />}
      </Route>
      <Route path="/manufacturing/bom">
        {() => <ProtectedRoute component={BomList} />}
      </Route>
      <Route path="/manufacturing/bom/new">
        {() => <ProtectedRoute component={BomForm} />}
      </Route>
      <Route path="/manufacturing/production-runs">
        {() => <ProtectedRoute component={ProductionRunList} />}
      </Route>
      <Route path="/manufacturing/work-orders">
        {() => <Redirect to="/manufacturing/production-runs" />}
      </Route>
      <Route path="/manufacturing/production-runs/new">
        {() => <ProtectedRoute component={ProductionRunForm} />}
      </Route>
      <Route path="/manufacturing/production-runs/:id">
        {() => <ProtectedRoute component={ProductionRunDetails} />}
      </Route>
      <Route path="/manufacturing/work-centers">
        {() => <ProtectedRoute component={WorkCenters} />}
      </Route>
      <Route path="/manufacturing/standard-costs">
        {() => <ProtectedRoute component={StandardCostsPage} />}
      </Route>
      <Route path="/manufacturing/routings">
        {() => <ProtectedRoute component={Routings} />}
      </Route>
      <Route path="/manufacturing/mrp">
        {() => <ProtectedRoute component={MrpDashboard} />}
      </Route>
      <Route path="/manufacturing/reports">
        {() => <ProtectedRoute component={ManufacturingReports} />}
      </Route>
      <Route path="/manufacturing">
        {() => <ProtectedRoute component={ManufacturingDashboard} />}
      </Route>
      <Route path="/inventory/purchase-orders">
        {() => <ProtectedRoute component={PurchaseOrdersPage} />}
      </Route>
      <Route path="/inventory/purchase-orders/new">
        {() => <ProtectedRoute component={PurchaseOrderFormPage} />}
      </Route>
      <Route path="/inventory/purchase-orders/:id">
        {() => <ProtectedRoute component={PurchaseOrderDetailsPage} />}
      </Route>
      <Route path="/inventory/purchase-returns">
        {() => <ProtectedRoute component={PurchaseReturnsPage} />}
      </Route>
      <Route path="/inventory/purchase-returns/new">
        {() => <ProtectedRoute component={PurchaseReturnFormPage} />}
      </Route>
      <Route path="/inventory/purchase-returns/:id">
        {() => <ProtectedRoute component={PurchaseReturnDetailsPage} />}
      </Route>
      <Route path="/inventory">
        {() => <ProtectedRoute component={InventoryTransactionsPage} />}
      </Route>
      <Route path="/inventory/adjustments">
        {() => <ProtectedRoute component={InventoryAdjustmentsPage} />}
      </Route>
      <Route path="/inventory/adjustments/report">
        {() => <ProtectedRoute component={StockAdjustmentsReportPage} />}
      </Route>
      <Route path="/inventory/stock-counts">
        {() => <ProtectedRoute component={InventoryStockCountsPage} />}
      </Route>
      <Route path="/inventory/bulk-adjust">
        {() => <ProtectedRoute component={BulkAdjustmentPage} />}
      </Route>
      <Route path="/inventory/stock-take">
        {() => <ProtectedRoute component={StockTakePage} />}
      </Route>
      <Route path="/inventory/account">
        {() => <ProtectedRoute component={InventoryAccountPage} />}
      </Route>
      <Route path="/inventory/transfers">
        {() => <ProtectedRoute component={StockTransfersPage} />}
      </Route>
      <Route path="/inventory/transfers/new">
        {() => <ProtectedRoute component={StockTransferFormPage} />}
      </Route>
      <Route path="/inventory/transfers/:id">
        {() => <ProtectedRoute component={StockTransferDetailsPage} />}
      </Route>
      <Route path="/inventory/locations">
        {() => <ProtectedRoute component={InventoryLocationsPage} />}
      </Route>
      <Route path="/inventory/grvs/new">
        {() => <ProtectedRoute component={CreateGrv} />}
      </Route>
      <Route path="/inventory/grvs/:id">
        {() => <ProtectedRoute component={GrvDetailsPage} />}
      </Route>
      <Route path="/reports/inventory">
        {() => <ProtectedRoute component={InventoryReportsPage} />}
      </Route>
      <Route path="/reports/financial">
        {() => <ProtectedRoute component={FinancialReportsPage} />}
      </Route>
      <Route path="/reports/daily">
        {() => <ProtectedRoute component={DailySalesLedgerPage} />}
      </Route>
      <Route path="/products/bulk-adjust">
        {() => <ProtectedRoute component={BulkPriceAdjustmentPage} />}
      </Route>
      <Route path="/products">
        {() => <ProtectedRoute component={ProductsPage} />}
      </Route>
      <Route path="/serial-tracking">
        {() => <ProtectedRoute component={SerialTrackingPage} />}
      </Route>
      <Route path="/suppliers">
        {user ? <SuppliersPage /> : <Redirect to="/auth" />}
      </Route>
      <Route path="/freight">
        {user ? <FreightDashboardPage /> : <Redirect to="/auth" />}
      </Route>
      <Route path="/freight/forwarders">
        {user ? <FreightForwardersPage /> : <Redirect to="/auth" />}
      </Route>
      <Route path="/freight/consignments">
        {user ? <ConsignmentsPage /> : <Redirect to="/auth" />}
      </Route>
      <Route path="/freight/receiving">
        {user ? <FreightReceivingPage /> : <Redirect to="/auth" />}
      </Route>
      <Route path="/freight/reports">
        {user ? <FreightReportsPage /> : <Redirect to="/auth" />}
      </Route>
      <Route path="/services">
        {() => <Redirect to="/products" />}
      </Route>
      <Route path="/tax-config">
        {() => <ProtectedRoute component={TaxConfigPage} />}
      </Route>
      <Route path="/settings">
        {() => <ProtectedRoute component={SettingsPage} />}
      </Route>
      <Route path="/approvals">
        {() => <ProtectedRoute component={ApprovalsPage} />}
      </Route>
      <Route path="/currencies">
        {() => <ProtectedRoute component={CurrencySettingsPage} />}
      </Route>
      <Route path="/team-settings">
        {() => <ProtectedRoute component={TeamSettingsPage} />}
      </Route>
      <Route path="/superadmin-visibility">
        {() => <ProtectedRoute component={SuperadminVisibilityPage} />}
      </Route>
      <Route path="/reports/pos">
        {() => <ProtectedRoute component={PosReportsPage} />}
      </Route>
      <Route path="/reports/tax">
        {() => <ProtectedRoute component={TaxReportsPage} />}
      </Route>
      <Route path="/reports/branches">
        {() => <ProtectedRoute component={BranchReportsPage} />}
      </Route>
      <Route path="/reports/customer-statements">
        {() => <ProtectedRoute component={CustomerStatementsPage} />}
      </Route>
      <Route path="/reports/cash-collection">
        {() => <ProtectedRoute component={CashCollectionReportPage} />}
      </Route>
      <Route path="/reports/partnership-sales">
        {() => <ProtectedRoute component={PartnershipSalesReportPage} />}
      </Route>
      <Route path="/reports-module">{() => <Redirect to="/reports" />}</Route>
      <Route path="/reports/:reportKey?">
        {() => <ProtectedRoute component={ReportsPage} />}
      </Route>
      <Route path="/payments-received/:id?">
        {() => <ProtectedRoute component={PaymentsReceivedPage} />}
      </Route>
      <Route path="/payments/:id/preview">
        {() => <ProtectedRoute component={PaymentPreviewPage} />}
      </Route>
      <Route path="/profile">
        {() => <ProtectedRoute component={UserProfilePage} />}
      </Route>
      <Route path="/restaurant/layout">
        {() => <ProtectedRoute component={RestaurantLayoutPage} />}
      </Route>
      <Route path="/tax-settings">
        {() => <ProtectedRoute component={TaxSettingsPage} />}
      </Route>
      <Route path="/zimra-settings">
        {() => <Redirect to="/tax-settings" />}
      </Route>
      <Route path="/zimra-logs">
        {() => <ProtectedRoute component={ZimraLogsPage} />}
      </Route>
      <Route path="/jobs">
        {() => <ProtectedRoute component={JobsPage} />}
      </Route>
      <Route path="/api-logs">
        {() => <ProtectedRoute component={ApiLogsPage} />}
      </Route>
      <Route path="/fiscal-test">
        {() => <ProtectedRoute component={FiscalTestPage} />}
      </Route>
      <Route path="/fdms-test">
        {() => <Redirect to="/fiscal-test" />}
      </Route>
      <Route path="/restaurant/layout">
        {() => <ProtectedRoute component={RestaurantLayoutPage} />}
      </Route>
      <Route path="/quotations">
        {() => <ProtectedRoute component={QuotationsPage} />}
      </Route>
      <Route path="/sales-orders">
        {() => <ProtectedRoute component={SalesOrdersPage} />}
      </Route>
      <Route path="/sales-orders/new">
        <ProtectedRoute component={CreateSalesOrderPage} />
      </Route>
      <Route path="/sales-orders/:id/edit">
        <ProtectedRoute component={CreateSalesOrderPage} />
      </Route>
      <Route path="/sales-orders/:id">
        {() => <ProtectedRoute component={SalesOrderDetailsPage} />}
      </Route>
      <Route path="/compound-products/new">
        {() => <ProtectedRoute component={CreateCompoundProductPage} />}
      </Route>
      <Route path="/compound-products/:id/edit">
        {() => <ProtectedRoute component={CreateCompoundProductPage} />}
      </Route>
      <Route path="/compound-products">
        {() => <ProtectedRoute component={CompoundProductsPage} />}
      </Route>
      <Route path="/sales-order-reports">
        {() => <ProtectedRoute component={SalesOrderReportsPage} />}
      </Route>
      <Route path="/stock-receipt">
        {() => <ProtectedRoute component={StockReceiptPage} />}
      </Route>
      <Route path="/quotations/new">
        {() => <ProtectedRoute component={CreateQuotationPage} />}
      </Route>
      <Route path="/recurring">
        {() => <ProtectedRoute component={RecurringInvoicesPage} />}
      </Route>
      <Route path="/subscription">
        {() => <ProtectedRoute component={SubscriptionPage} />}
      </Route>
      <Route path="/pos/my-sales">
        {() => <ProtectedRoute component={MySalesPage} />}
      </Route>
      <Route path="/pos/reports">{() => <Redirect to="/reports/pos" />}</Route>
      <Route path="/pos/all-sales">
        {() => <ProtectedRoute component={RecentSalesPage} />}
      </Route>
      <Route path="/pos">{() => <ProtectedRoute component={POSPage} />}</Route>
      <Route path="/pos-settings">
        {() => <Redirect to="/settings?tab=pos" />}
      </Route>
      <Route path="/bus/fleet">
        {() => <ProtectedRoute component={BusFleetPage} />}
      </Route>
      <Route path="/bus/dashboard">
        {() => <ProtectedRoute component={BusDashboardPage} />}
      </Route>
      <Route path="/bus/trips">
        {() => <ProtectedRoute component={BusTripsPage} />}
      </Route>
      <Route path="/bus/tracking">
        {() => <ProtectedRoute component={BusTrackingPage} />}
      </Route>
      <Route path="/bus/conductors">
        {() => <ProtectedRoute component={BusConductorsPage} />}
      </Route>
      <Route path="/bus/reports/daily">
        {() => <ProtectedRoute component={DailyReportPage} />}
      </Route>
      <Route path="/bus/reports/range">
        {() => <ProtectedRoute component={RangeReportPage} />}
      </Route>
      <Route path="/bus/reports/conductor">
        {() => <ProtectedRoute component={ConductorReportPage} />}
      </Route>
      <Route path="/bus/reports/cashup">
        {() => <ProtectedRoute component={CashupReportPage} />}
      </Route>
      <Route path="/bus/reports">
        {() => <Redirect to="/bus/reports/daily" />}
      </Route>
      <Route path="/bus/trip-performance">
        {() => <ProtectedRoute component={BusTripPerformancePage} />}
      </Route>
      <Route path="/bus/manifest">
        {() => <ProtectedRoute component={BusManifestPage} />}
      </Route>
      <Route path="/bus/tickets">
        {() => <ProtectedRoute component={BusTicketDetailsPage} />}
      </Route>
      <Route path="/restaurant/kds">
        {() => <ProtectedRoute component={KDSPage} />}
      </Route>
      <Route path="/restaurant/orders">
        {() => <ProtectedRoute component={LiveOrdersPage} />}
      </Route>
      <Route path="/order-status" component={OrderStatusPage} />
      <Route path="/accounting/coa">
        {() => <ProtectedRoute component={AccountingCOAPage} />}
      </Route>
      <Route path="/accounting/segments">
        {() => <ProtectedRoute component={AccountingSegmentsPage} />}
      </Route>
      <Route path="/accounting/dashboard">
        {() => <ProtectedRoute component={AccountingDashboardPage} />}
      </Route>
      <Route path="/accounting/opening-balances">
        {() => <ProtectedRoute component={OpeningBalancesPage} />}
      </Route>
      <Route path="/accounting/journal">
        {() => <ProtectedRoute component={AccountingJournalPage} />}
      </Route>
      <Route path="/accounting/audit-trail">
        {() => <ProtectedRoute component={AccountingAuditTrailPage} />}
      </Route>
      <Route path="/accounting/allocations">
        {() => <ProtectedRoute component={AllocationWorkbenchPage} />}
      </Route>
      <Route path="/accounting/reports/trial-balance">
        {() => <ProtectedRoute component={TrialBalancePage} />}
      </Route>
      <Route path="/accounting/reports/ledger">
        {() => <ProtectedRoute component={GeneralLedgerPage} />}
      </Route>
      <Route path="/accounting/reports/financial">
        {() => <ProtectedRoute component={FinancialReportsPage} />}
      </Route>
      <Route path="/accounting/reports/balance-sheet">
        {() => <ProtectedRoute component={FinancialReportsPage} />}
      </Route>
      <Route path="/accounting/reports/cash-flow">
        {() => <ProtectedRoute component={FinancialReportsPage} />}
      </Route>
      <Route path="/accounting/accounts-receivable">
        {() => <ProtectedRoute component={AgingReportsPage} />}
      </Route>
      <Route path="/accounting/accounts-payable">
        {() => <ProtectedRoute component={AgingReportsPage} />}
      </Route>
      <Route path="/accounting/reports/aging">
        {() => <ProtectedRoute component={AgingReportsPage} />}
      </Route>
      <Route path="/accounting/reports/cost-centers">
        {() => <ProtectedRoute component={CostCentersPage} />}
      </Route>
      <Route path="/accounting/reports/vat-return">
        {() => <ProtectedRoute component={VatReturnPage} />}
      </Route>
      <Route path="/accounting/fixed-assets">
        {() => <ProtectedRoute component={FixedAssetsPage} />}
      </Route>
      <Route path="/accounting/fixed-assets/depreciation">
        {() => <ProtectedRoute component={DepreciationRecordsPage} />}
      </Route>
      <Route path="/accounting/reconciliation">
        {() => <ProtectedRoute component={BankReconciliationPage} />}
      </Route>
      <Route path="/accounting/periods">
        {() => <ProtectedRoute component={FinancialPeriodsPage} />}
      </Route>
      <Route path="/accounting/ledger/:id">
        {() => <ProtectedRoute component={AccountLedgerPage} />}
      </Route>
      <Route path="/accounting/debtors/:id">
        {() => <ProtectedRoute component={DebtorAnalysisPage} />}
      </Route>
      <Route path="/accounting/creditors/:id">
        {() => <ProtectedRoute component={CreditorAnalysisPage} />}
      </Route>
      <Route path="/accounting/cashbook">
        {() => <ProtectedRoute component={CashbookPage} />}
      </Route>
      <Route path="/supplier-invoices">
        {() => <ProtectedRoute component={SupplierInvoicesPage} />}
      </Route>
      <Route path="/supplier-invoices/new">
        {() => <ProtectedRoute component={SupplierInvoiceFormPage} />}
      </Route>
      <Route path="/supplier-invoices/:id">
        {() => <ProtectedRoute component={SupplierInvoiceDetailsPage} />}
      </Route>
      <Route path="/supplier-credit-notes">
        {() => <ProtectedRoute component={SupplierCreditNotesPage} />}
      </Route>
      <Route path="/supplier-credit-notes/new">
        {() => <ProtectedRoute component={SupplierInvoiceFormPage} />}
      </Route>
      <Route path="/payroll">
        {() => <Redirect to="/hr/payroll" />}
      </Route>
      <Route path="/hr">
        {() => <ProtectedRoute component={HRDashboard} />}
      </Route>
      <Route path="/hr/payroll">
        {() => <ProtectedRoute component={HRPayrollRuns} />}
      </Route>
      <Route path="/hr/payroll/:runId/payslips">
        {() => <ProtectedRoute component={HRPayslips} />}
      </Route>
      <Route path="/hr/payroll/:runId/report">
        {() => <ProtectedRoute component={HrRunReport} />}
      </Route>
      <Route path="/hr/employees">
        {() => <ProtectedRoute component={HREmployees} />}
      </Route>
      <Route path="/hr/self-service">
        {() => <ProtectedRoute component={HRSelfService} />}
      </Route>
      <Route path="/hr/loans">
        {() => <ProtectedRoute component={HRLoans} />}
      </Route>
      <Route path="/hr/leave">
        {() => <ProtectedRoute component={HRLeave} />}
      </Route>
      <Route path="/hr/setup">
        {() => <ProtectedRoute component={HRSetup} />}
      </Route>
      <Route path="/hr/setup/:legacy">
        {() => <Redirect to="/hr/setup" />}
      </Route>
      <Route path="/hr/reports/zimra">
        {() => <ProtectedRoute component={HRZimraReports} />}
      </Route>
      <Route path="/hr/reports/remittances">
        {() => <ProtectedRoute component={HRZimraReports} />}
      </Route>
      <Route path="/">{user ? <AuthRedirect /> : <LandingPage />}</Route>
      <Route component={NotFound} />
    </Switch>
    </Suspense>
  );
}

// Bridge: service worker asks for auth token during background sync
function useSwAuthBridge() {
  useEffect(() => {
    if (!navigator.serviceWorker) return;

    const handler = async (event: MessageEvent) => {
      if (event.data?.type !== "GET_AUTH_TOKEN") return;
      try {
        const token = auth.getAccessToken() || localStorage.getItem('access_token');
        event.ports[0]?.postMessage({ token });
      } catch {
        event.ports[0]?.postMessage({ token: null });
      }
    };

    navigator.serviceWorker.addEventListener("message", handler);
    return () =>
      navigator.serviceWorker.removeEventListener("message", handler);
  }, []);
}

function BrandingMeta() {
  const { brand } = useBranding();
  const { authorityName } = useFiscalAuthority();

  useEffect(() => {
    document.title = brand.name + " | " + authorityName + " Compliant Fiscalization";

    // Update favicon dynamically
    let link = document.querySelector("link[rel~='icon']") as HTMLLinkElement;
    if (!link) {
      link = document.createElement("link");
      link.rel = "icon";
      document.getElementsByTagName("head")[0].appendChild(link);
    }
    // Note: We use the same favicon path for simplicity in development,
    // but in production these would be different assets in the build folder.
    // However, the logo is definitely different.
  }, [brand, authorityName]);

  return null;
}

import { BranchProvider } from "./lib/branch-context";
import { LanguageProvider } from "@/lib/i18n";
import { BootSplash } from "@/components/boot-splash";
import { ErrorBoundary } from "@/components/error-boundary";

function App() {
  useSwAuthBridge();
  const [booted, setBooted] = useState(false);
  return (
    <QueryClientProvider client={queryClient}>
      <LanguageProvider>
        <ThemeManager />
        <TooltipProvider>
          <BranchProvider>
            <BrandingMeta />
            <Toaster />
            {/* Boot gate: splash stays until React is actually ready —
                never a blank moment between splash and app. The boundary
                turns render crashes into a recovery screen instead of a
                permanently parked 90% splash. */}
            <ErrorBoundary>
              {!booted ? <BootSplash onReady={() => setBooted(true)} /> : <Router />}
            </ErrorBoundary>
          </BranchProvider>
        </TooltipProvider>
      </LanguageProvider>
    </QueryClientProvider>
  );
}

export default App;
