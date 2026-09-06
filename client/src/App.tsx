import HRPayslips from "@/pages/hr/payslips";
import HRDashboard from "@/pages/hr/index";
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
import Dashboard from "@/pages/dashboard";
import BomList from "@/pages/manufacturing/bom-list";
import BomForm from "@/pages/manufacturing/bom-form";
import ProductionRunList from "@/pages/manufacturing/production-run-list";
import ProductionRunForm from "@/pages/manufacturing/production-run-form";
import ProductionRunDetails from "@/pages/manufacturing/production-run-details";
import WorkCenters from "@/pages/manufacturing/work-centers";
import Routings from "@/pages/manufacturing/routings";
import ManufacturingDashboard from "@/pages/manufacturing/index";
import ManufacturingReports from "@/pages/manufacturing/reports";
import MrpDashboard from "@/pages/manufacturing/mrp-dashboard";
import StandardCostsPage from "@/pages/manufacturing/standard-costs";

import InvoicesPage from "@/pages/invoices";
import CreateInvoicePage from "@/pages/create-invoice";
import InvoiceDetailsPage from "@/pages/invoice-details";
import InvoiceTemplateDesignerPage from "@/pages/invoice-template-designer";
import CustomersPage from "@/pages/customers";
import CustomerDetailsPage from "@/pages/customer-details";
import SuppliersPage from "@/pages/suppliers";
import FreightForwardersPage from "@/pages/freight/forwarders";
import ConsignmentsPage from "@/pages/freight/consignments";
import FreightDashboardPage from "@/pages/freight/dashboard";
import FreightReceivingPage from "@/pages/freight/receiving";
import FreightReportsPage from "@/pages/freight/reports";
import ExpensesPage from "@/pages/expenses";
import InventoryTransactionsPage from "@/pages/inventory-transactions";
import InventoryAdjustmentsPage from "@/pages/inventory-adjustments";
import StockAdjustmentsReportPage from "@/pages/stock-adjustments-report";
import InventoryStockCountsPage from "@/pages/inventory-stock-counts";
import ProductionPage from "@/pages/production";
import InventoryAccountPage from "@/pages/inventory-account";
import StockTransfersPage from "@/pages/stock-transfers";
import StockTransferFormPage from "@/pages/stock-transfer-form";
import StockTransferDetailsPage from "@/pages/stock-transfer-details";
import InventoryLocationsPage from "@/pages/inventory-locations";
import PurchaseOrdersPage from "@/pages/purchase-orders";
import PurchaseOrderFormPage from "@/pages/purchase-order-form";
import PurchaseOrderDetailsPage from "@/pages/purchase-order-details";
import PurchaseReturnsPage from "@/pages/purchase-returns";
import PurchaseReturnFormPage from "@/pages/purchase-return-form";
import PurchaseReturnDetailsPage from "@/pages/purchase-return-details";
import GrvDetailsPage from "@/pages/grv-details";
import CreateGrv from "@/pages/create-grv";
import ProductsPage from "@/pages/products";
import BulkPriceAdjustmentPage from "@/pages/bulk-price-adjustment";
import SerialTrackingPage from "@/pages/serial-tracking";
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
import JobsPage from "@/pages/jobs";import ApiLogsPage from "@/pages/api-logs";
import POSPage from "@/pages/pos";
import MySalesPage from "@/pages/my-sales";
import PosReportsPage from "@/pages/pos-reports";
import RecentSalesPage from "@/pages/recent-sales";
import TaxReportsPage from "@/pages/tax-reports";
import BranchReportsPage from "@/pages/branch-reports";
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
import BusTrackingPage from "@/pages/bus-tracking";
import BusConductorsPage from "@/pages/bus-conductors";
import DailyReportPage from "@/pages/bus-reports/daily";
import RangeReportPage from "@/pages/bus-reports/range";
import ConductorReportPage from "@/pages/bus-reports/conductor";
import CashupReportPage from "@/pages/bus-reports/cashup";
import BusTripPerformancePage from "@/pages/bus-trip-performance";
import BusManifestPage from "@/pages/bus-manifest";
import BusTicketDetailsPage from "@/pages/bus-ticket-details";
import BusDashboardPage from "@/pages/bus-dashboard";
import AccountingCOAPage from "@/pages/accounting-coa";
import AccountingJournalPage from "@/pages/accounting-journal";
import TrialBalancePage from "@/pages/accounting-trial-balance";
import GeneralLedgerPage from "@/pages/accounting-ledger";
import SupplierInvoicesPage from "@/pages/supplier-invoices";
import SupplierCreditNotesPage from "@/pages/supplier-credit-notes";
import SupplierInvoiceDetailsPage from "@/pages/supplier-invoice-details";
import SupplierInvoiceFormPage from "@/pages/supplier-invoice-form";
import SalesOrdersPage from "@/pages/sales-orders";
import CreateSalesOrderPage from "@/pages/create-sales-order";
import SalesOrderDetailsPage from "@/pages/sales-order-details";
import CompoundProductsPage from "@/pages/compound-products";
import CreateCompoundProductPage from "@/pages/create-compound-product";
import SalesOrderReportsPage from "@/pages/sales-order-reports";
import StockReceiptPage from "@/pages/stock-receipt";
import CashbookPage from "@/pages/cashbook";
import AgingReportsPage from "@/pages/aging-reports";
import CostCentersPage from "@/pages/cost-centers";
import FixedAssetsPage from "@/pages/fixed-assets";
import DepreciationRecordsPage from "@/pages/depreciation-records";
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
import AccountingSegmentsPage from "@/pages/accounting-segments";
import ApprovalsPage from "@/pages/approvals";
import PartnershipSalesReportPage from "@/pages/partnership-sales-report";
import HRPayrollRuns from "@/pages/hr/payroll";
import HREmployees from "@/pages/hr/employees";
import HRLoans from "@/pages/hr/loans";
import HRLeave from "@/pages/hr/leave";
import HRSetup from "@/pages/hr/setup";
import HrRunReport from "@/pages/hr/run-report";
import HRZimraReports from "@/pages/hr/zimra-reports";
import HRSelfService from "@/pages/hr/self-service";
import SuperadminVisibilityPage from "@/pages/superadmin-visibility";
import MaterialDocumentLedger from "@/pages/inventory/reports/ledger";
import StockOverview from "@/pages/inventory/reports/overview";
import HistoricalStock from "@/pages/inventory/reports/historical";
import DeadStockReportPage from "@/pages/inventory/reports/dead-stock";
import ProductionReportPage from "@/pages/inventory/reports/production";
import { useAuth } from "@/hooks/use-auth";
import { usePermissions } from "@/hooks/use-permissions";
import { NAV_PERMISSION_MAP } from "@shared/permissions";
import { auth } from "@/lib/auth";
import { useCompanies } from "@/hooks/use-companies";
import { useActiveCompany } from "@/hooks/use-active-company";
import { Loader2 } from "lucide-react";
import { insertBusRouteSchema, type BusRouteCloud } from "@shared/schema";
import { useEffect, useRef, useState } from "react";
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

function LoadingScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <Loader2 className="w-8 h-8 animate-spin text-primary" />
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
      <Route path="/zimra-settings">
        {() => <ProtectedRoute component={ZimraSettingsPage} />}
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
      <Route path="/fdms-test">
        {() => <ProtectedRoute component={FdmsTestPage} />}
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

function App() {
  useSwAuthBridge();
  return (
    <QueryClientProvider client={queryClient}>
      <LanguageProvider>
        <ThemeManager />
        <TooltipProvider>
          <BranchProvider>
            <BrandingMeta />
            <Toaster />
            <Router />
          </BranchProvider>
        </TooltipProvider>
      </LanguageProvider>
    </QueryClientProvider>
  );
}

export default App;
