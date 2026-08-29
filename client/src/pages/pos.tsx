import { PosLayout } from "@/components/pos-layout";
import { useCustomers, useCreateCustomer } from "@/hooks/use-customers";
import { useProducts } from "@/hooks/use-products";
import { useCreateInvoice } from "@/hooks/use-invoices";
import { useCurrencies } from "@/hooks/use-currencies";
import { useCompany } from "@/hooks/use-companies";
import { useTaxConfig } from "@/hooks/use-tax-config";
import { useToast } from "@/hooks/use-toast";
import { useOffline } from "@/hooks/use-offline";
import { useProductSerials } from "@/hooks/use-auto-spares";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { apiFetch } from "@/lib/api";
import {
  cacheShift,
  getCachedShift,
  addPendingShiftAction,
  getPendingShifts,
  addOfflineHold,
  getOfflineHolds,
  removeOfflineHold,
  setLastCacheTime,
  addPendingSale,
  getCachedZimraConfig,
  getCachedFiscalSequence,
  cacheFiscalSequence,
  generateOfflineReport,
} from "@/lib/offline-db";
import { generateOfflineFiscalData, resolveTaxCode } from "@/lib/fiscalization-offline";
import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import {
  Search,
  ShoppingCart,
  Trash2,
  Plus,
  Minus,
  CreditCard,
  Banknote,
  UserPlus,
  Loader2,
  Package,
  Tag,
  Pause,
  Play,
  History,
  Calculator,
  Printer,
  CheckCircle2,
  XCircle,
  ChevronRight,
  ChevronLeft,
  ChevronDown,
  ChevronUp,
  Fullscreen,
  HelpCircle,
  User,
  Settings as SettingsIcon,
  LogOut,
  FileText,
  Receipt,
  Clock,
  LayoutGrid,
  ShoppingBag,
  Filter,
  WifiOff,
  Wifi,
  CloudUpload,
  AlertTriangle,
  Pin,
  Download,
  Store,
  List,
  PieChart,
} from "lucide-react";
import { RefreshCw, ClipboardCheck, Users } from "lucide-react";
import { POSReceipt } from "@/components/pos-receipt";
import { Receipt48 } from "@/components/pos/receipt-48";
import { ManagerOverride } from "@/components/pos/manager-override";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { DialogDescription } from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  SheetClose,
} from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MySalesModal } from "@/components/pos/my-sales-modal";
import { SyncQueueModal } from "@/components/pos/sync-queue-modal";
import { PDFDownloadLink } from "@react-pdf/renderer";
import { FiscalReportPDF } from "@/components/reports/fiscal-report-pdf";
import { pdf } from "@react-pdf/renderer";
import { saveAs } from "file-saver";
import dayjs from "dayjs";
import { BranchPickerModal } from "@/components/branch-picker-modal";
import { PrinterService } from "@/lib/printer/printer-service";
import { ReceiptTemplate } from "@/lib/printer/receipt-template";
import { useBranchContext } from "@/lib/branch-context";
import { Switch } from "@/components/ui/switch";
import { EscPosVisualizer } from "@/components/EscPosVisualizer";

interface CartItem {
  productId: number;
  name: string;
  price: number;
  quantity: number;
  discountAmount: number; // Applied to this line
  taxRate: number;
  taxTypeId?: number | null;
  hsCode?: string;
  cartItemId?: string;
  serialNumber?: string;
}

import { normalizeAppMode } from "@shared/app-mode";
import { RestaurantTableMap } from "@/components/pos/restaurant-table-map";

import { useAuth } from "@/hooks/use-auth";

// Refresh the local offline fiscal-sequence cache from the server's
// authoritative counters. Always attempts the live fetch and only falls
// back to the existing cache on failure — this prevents offline claims from
// minting numbers out of a stale sequence (which ZIMRA flags Red).
async function refreshCachedFiscalSequence(companyId: number): Promise<any | undefined> {
  try {
    const res = await apiFetch(`/api/companies/${companyId}/zimra/sequence`);
    if (res.ok) {
      const seq = await res.json();
      if (seq && typeof seq.lastReceiptGlobalNo === "number") {
        await cacheFiscalSequence(companyId, seq);
        return seq;
      }
    }
  } catch (e) {
    console.warn("[POS] Failed to refresh fiscal sequence from server:", e);
  }
  return getCachedFiscalSequence(companyId);
}

export default function POSPage() {
  const { user, logout } = useAuth();
  const { selectedBranchId, setSelectedBranchId } = useBranchContext();
  const queryClient = useQueryClient();
  // Use state so companyId is reactive — handles the case where selectedCompanyId
  // is set just before this component mounts (offline login race condition).
  const [companyId, setCompanyId] = useState<number>(() =>
    parseInt(localStorage.getItem("selectedCompanyId") || "0"),
  );
  useEffect(() => {
    if (companyId) return; // already have a valid id
    // Poll briefly in case offline login set it just after mount
    const t = setInterval(() => {
      const id = parseInt(localStorage.getItem("selectedCompanyId") || "0");
      if (id) {
        setCompanyId(id);
        clearInterval(t);
      }
    }, 100);
    setTimeout(() => clearInterval(t), 3000); // stop after 3s
    return () => clearInterval(t);
  }, [companyId]);
  const { data: company } = useCompany(companyId);
  const isCashier = (company as any)?.role === "cashier";
  const { data: products, isLoading: isLoadingProducts } =
    useProducts(companyId, selectedBranchId || undefined);
  const { data: serialNumbers = [] } = useProductSerials(companyId, undefined, "IN_STOCK");

  // Emergency fallback: if React Query returns nothing but we have a companyId,
  // read directly from IndexedDB. This handles edge cases where the query
  // completes but returns empty due to timing issues.
  const [cachedProductsFallback, setCachedProductsFallback] = useState<any[]>(
    [],
  );
  const [cachedCompanyFallback, setCachedCompanyFallback] = useState<any>(null);
  const [cachedCustomersFallback, setCachedCustomersFallback] = useState<any[]>(
    [],
  );
  useEffect(() => {
    if (!companyId) return;
    import("@/lib/offline-db").then(
      ({
        getCachedProducts,
        getCachedCompanySettings,
        getCachedCompaniesList,
        getCachedCustomers,
      }) => {
        // Products
        getCachedProducts(companyId).then((cached) => {
          if (cached && cached.length > 0) {
            console.log(
              `[POS] Direct cache read: ${cached.length} products for company ${companyId}`,
            );
            setCachedProductsFallback(cached);
          }
        });
        // Company
        getCachedCompanySettings(companyId).then(async (cached) => {
          if (cached) {
            setCachedCompanyFallback(cached);
            return;
          }
          const list = await getCachedCompaniesList();
          const fromList = list?.find(
            (c: any) => c.id === companyId || c.id === String(companyId),
          );
          if (fromList) setCachedCompanyFallback(fromList);
        });
        // Customers
        getCachedCustomers(companyId).then((cached) => {
          if (cached && cached.length > 0) {
            console.log(
              `[POS] Direct cache read: ${cached.length} customers for company ${companyId}`,
            );
            setCachedCustomersFallback(cached);
          }
        });
      },
    );
  }, [companyId]);
  const { data: customers } = useCustomers(companyId);
  const { data: currencies } = useCurrencies(companyId);
  const { taxTypes } = useTaxConfig(companyId);
  const createInvoice = useCreateInvoice(companyId);

  // Offline support
  const {
    isOnline,
    pendingSalesCount,
    syncStatus,
    syncProgress,
    triggerSync,
    refreshPendingCount,
    lastCacheTime,
    refreshCacheTime,
  } = useOffline(companyId);

  // When we come back online (or first confirm online), refresh all POS data queries
  const prevIsOnlineRef = useRef<boolean | null>(null);
  const runOnIdle = useCallback((fn: () => void, timeout = 1200) => {
    if (typeof window !== "undefined" && "requestIdleCallback" in window) {
      (window as any).requestIdleCallback(() => fn(), { timeout });
    } else {
      globalThis.setTimeout(fn, 0);
    }
  }, []);

  useEffect(() => {
    const prev = prevIsOnlineRef.current;
    prevIsOnlineRef.current = isOnline;
    if (prev === false && isOnline && companyId) {
      // Invalidate using partial key prefixes that match the actual query keys
      runOnIdle(() =>
        queryClient.invalidateQueries({ queryKey: ["/api/companies"] }),
      );
      runOnIdle(() =>
        queryClient.invalidateQueries({
          queryKey: ["/api/companies/:companyId/products", companyId],
        }),
      );
      runOnIdle(() =>
        queryClient.invalidateQueries({
          queryKey: ["/api/companies/:companyId/customers", companyId],
        }),
      );
      runOnIdle(() =>
        queryClient.invalidateQueries({
          queryKey: ["/api/companies/:companyId/currencies", companyId],
        }),
      );
      runOnIdle(() =>
        queryClient.invalidateQueries({
          queryKey: ["/api/tax/types", companyId],
        }),
      );
      // Keep the offline sequence cache aligned with the live counters now
      // that we are online again.
      runOnIdle(() =>
        refreshCachedFiscalSequence(companyId).catch(() => {}),
      );
    }
  }, [isOnline, companyId, queryClient, runOnIdle]);

  // Resolved data — hooks handle caching and fallback; direct IDB reads are emergency fallback
  const resolvedProducts =
    products && products.length > 0 ? products : cachedProductsFallback;
  const resolvedCustomers =
    customers && customers.length > 0 ? customers : cachedCustomersFallback;
  const resolvedCurrencies = currencies || [];
  const resolvedTaxTypes = taxTypes?.data || [];
  const resolvedCompany = company ?? cachedCompanyFallback;
  const { toast } = useToast();

  // Customer Creation State
  const createCustomer = useCreateCustomer(companyId);
  const [isQuickAddCustomerOpen, setIsQuickAddCustomerOpen] = useState(false);
  const [selectedTableId, setSelectedTableId] = useState<number | undefined>();
  const [newCustomer, setNewCustomer] = useState({
    name: "",
    phone: "",
    email: "",
    tin: "",
    vatNumber: "",
  });
  const [isCreatingCustomer, setIsCreatingCustomer] = useState(false);

  const handleQuickAddCustomer = async () => {
    if (!newCustomer.name)
      return toast({ title: "Name required", variant: "destructive" });
    setIsCreatingCustomer(true);
    try {
      const result = await createCustomer.mutateAsync({
        name: newCustomer.name,
        phone: newCustomer.phone,
        email: newCustomer.email,
        tin: newCustomer.tin,
        vatNumber: newCustomer.vatNumber,
        isActive: true,
        customerType: "individual",
        currency: "USD",
      });
      setSelectedCustomerId(result.id.toString());
      setIsQuickAddCustomerOpen(false);
      setNewCustomer({ name: "", phone: "", email: "", tin: "", vatNumber: "" });
      toast({
        title: "Customer Added",
        description: `${result.name} is now selected.`,
      });
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setIsCreatingCustomer(false);
    }
  };

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("All");
  const [productViewMode, setProductViewMode] = useState<"grid" | "list">("grid");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>("");
  const [orderDiscount, setOrderDiscount] = useState<number>(0);

  // Restaurant Workflow State
  const [coversCount, setCoversCount] = useState<number>(1);
  const [isCoversDialogOpen, setIsCoversDialogOpen] = useState(false);
  const [pendingTableSelection, setPendingTableSelection] = useState<any>(null);
  const [activeDraftInvoiceId, setActiveDraftInvoiceId] = useState<number | undefined>();
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState("CASH");
  const [isProcessing, setIsProcessing] = useState(false);
  const isProcessingRef = useRef(false);
  const [lastSuccessfulInvoice, setLastSuccessfulInvoice] = useState<any>(null);
  const [activeView, setActiveView] = useState<"products" | "cart">("products");
  const [paidAmount, setPaidAmount] = useState<string>("");
  const [splitPayments, setSplitPayments] = useState<
    Array<{ method: string; amount: number }>
  >([]);
  const [cartAnimation, setCartAnimation] = useState(false);
  const [splitMethod, setSplitMethod] = useState<string>("CASH");
  const [splitAmount, setSplitAmount] = useState<string>("");
  const [selectedCurrencyCode, setSelectedCurrencyCode] =
    useState<string>("USD");
  const [isFiscalized, setIsFiscalized] = useState(true);
  const [pendingPrintQueue, setPendingPrintQueue] = useState<number[]>([]);
  const pendingPrintEnqueuedAtRef = useRef<Record<number, number>>({});
  const BACKGROUND_PRINT_MAX_WAIT_MS = 45_000;
  const isInvoiceReadyForPrint = useCallback((invoice: any) => {
    const fdmsStatus = (invoice?.fdmsStatus || "").toString().toLowerCase();
    return Boolean(
      invoice?.qrCodeData ||
      invoice?.receiptQRData ||
      invoice?.fiscalCode ||
      invoice?.verificationCode ||
      invoice?.syncedWithFdms ||
      fdmsStatus === "fiscalized" ||
      fdmsStatus === "failed",
    );
  }, []);

  // UX: Pinned Products
  const [pinnedProducts, setPinnedProducts] = useState<number[]>(() => {
    try {
      return JSON.parse(localStorage.getItem("pos_pinned_products") || "[]");
    } catch {
      return [];
    }
  });

  // UX: Fast moving items frequency
  const [posItemFrequencies, setPosItemFrequencies] = useState<Record<number, number>>(() => {
    try {
      return JSON.parse(localStorage.getItem('pos_item_frequency') || '{}');
    } catch {
      return {};
    }
  });

  const togglePinProduct = (e: React.MouseEvent, productId: number) => {
    e.stopPropagation();
    setPinnedProducts((prev) => {
      const next = prev.includes(productId)
        ? prev.filter((id) => id !== productId)
        : [...prev, productId];
      localStorage.setItem("pos_pinned_products", JSON.stringify(next));
      return next;
    });
  };

  // UX: Auto-focus the paidAmount input when Checkout opens
  useEffect(() => {
    if (isCheckoutOpen) {
      setTimeout(() => {
        const input = document.getElementById("checkout-paid-amount");
        if (input) input.focus();
      }, 100);
      setSplitPayments([]);
      setSplitAmount("");
    }
  }, [isCheckoutOpen]);

  // Barcode scanner — use refs to avoid stale closure issues
  const barcodeBufferRef = useRef("");
  const lastCharTimeRef = useRef(0);
  const lastScannedProductRef = useRef<{
    productId: number;
    time: number;
  } | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  // posSettingsRef: always holds latest posSettings so barcode useEffect closure is NEVER stale
  const posSettingsRef = useRef({
    variableWeightBarcodeRules: [] as any[],
    quantityDecimalPlaces: 2,
  });
  // resolvedProductsRef: always holds latest products so barcode closure is NEVER stale
  const resolvedProductsRef = useRef<any[]>([]);

  const [heldSales, setHeldSales] = useState<any[]>([]);
  const [isHoldsModalOpen, setIsHoldsModalOpen] = useState(false);
  const [isSyncQueueModalOpen, setIsSyncQueueModalOpen] = useState(false);
  const [currentShift, setCurrentShift] = useState<any>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isShiftModalOpen, setIsShiftModalOpen] = useState(false);
  const [shiftModalType, setShiftModalType] = useState<"OPEN" | "CLOSE">(
    "OPEN",
  );
  const [shiftBalance, setShiftBalance] = useState("");
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Custom quantity/reverse-price dialog state (replaces browser prompt())
  const [qtyDialog, setQtyDialog] = useState<{
    open: boolean;
    productId: number;
    productName: string;
    currentQty: number;
    mode: "qty" | "total";
    unitPrice: number;
    discountAmount: number;
  } | null>(null);
  const [qtyDialogInput, setQtyDialogInput] = useState("");

  const [isCreditNoteOpen, setIsCreditNoteOpen] = useState(false);
  const [cnSearchQuery, setCnSearchQuery] = useState("");
  const [cnSearchResults, setCnSearchResults] = useState<any[]>([]);
  const [cnSearching, setCnSearching] = useState(false);
  const [cnProcessing, setCnProcessing] = useState(false);
  const [cnType, setCnType] = useState<"credit" | "debit">("credit");
  const [cnActiveInvoice, setCnActiveInvoice] = useState<any>(null);
  const [cnSelectedItems, setCnSelectedItems] = useState<
    { productId: number; quantity: number; originalItem: any }[]
  >([]);
  const [cnReason, setCnReason] = useState("");

  // X/Z Report modal
  const [isReportOpen, setIsReportOpen] = useState(false);
  const [isMySalesPinAuthorized, setIsMySalesPinAuthorized] = useState(false);
  const [reportData, setReportData] = useState<any>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportType, setReportType] = useState<"x" | "z">("x");
  const [isItemizedExpanded, setIsItemizedExpanded] = useState(true);

  // Reprint receipts
  const [isReprintOpen, setIsReprintOpen] = useState(false);
  const [reprintList, setReprintList] = useState<any[]>([]);
  const [reprintListLoading, setReprintListLoading] = useState(false);
  const [reprintInvoice, setReprintInvoice] = useState<any>(null);
  const [availablePrinters, setAvailablePrinters] = useState<any[]>([]);
  const [posSettings, setPosSettings] = useState({
    printingEnabled: true,
    autoPrint: localStorage.getItem("pos_auto_print") !== "false",
    terminalId: localStorage.getItem("pos_terminal_id") || "POS-T01",
    silentPrinting: localStorage.getItem("pos_silent_printing") !== "false",
    printerName: localStorage.getItem("pos_printer_name") || "",
    secondaryPrinterName:
      localStorage.getItem("pos_secondary_printer_name") || "",
    paperSize: localStorage.getItem("pos_paper_size") || "",
    printServerUrl:
      localStorage.getItem("pos_print_server") || "http://localhost:3001",
    nativeEscPos: true,
    simulationMode: localStorage.getItem("pos_simulation_mode") === "true",
    printerWidth: parseInt(localStorage.getItem("pos_printer_width") || "32"),
    cashDrawerEnabled: localStorage.getItem("pos_cash_drawer") === "true",
    autoCut: localStorage.getItem("pos_auto_cut") !== "false",
    feedLines: parseInt(localStorage.getItem("pos_feed_lines") || "1"),
    openDrawerOnPrint:
      localStorage.getItem("pos_open_drawer_on_print") === "true",
    doubleHeightHeader:
      localStorage.getItem("pos_double_height_header") !== "false",
    quantityDecimalPlaces: parseInt(
      localStorage.getItem("pos_quantity_decimals") || "2",
    ),
    variableWeightBarcodeRules: [
      {
        id: "rule-1",
        name: "Scale Items (Prefix 20)",
        enabled: true,
        prefix: "20",
        totalLength: 13,
        skuStart: 2,
        skuLength: 4,
        quantityStart: 6,
        quantityLength: 6,
        quantityDivisor: 1000,
      },
    ],
  });
  // Printer simulation output
  const [simulationData, setSimulationData] = useState<Uint8Array | null>(null);
  const addToCartAudioContextRef = useRef<AudioContext | null>(null);

  const { data: zimraStatusData } = useQuery({
    queryKey: ["zimraStatus", companyId],
    queryFn: async () => {
      const url = selectedBranchId 
        ? `/api/companies/${companyId}/zimra/status?branchId=${selectedBranchId}` 
        : `/api/companies/${companyId}/zimra/status`;
      const res = await apiFetch(url);
      if (!res.ok) return null;
      return await res.json();
    },
    enabled: Boolean(companyId) && Boolean(isOnline),
    staleTime: 30_000,
    retry: 1,
  });
  const isFiscalDayOpen = useMemo(() => {
    const status = zimraStatusData?.fiscalDayStatus;
    if (status)
      return status === "FiscalDayOpened" || status === "FiscalDayCloseFailed";
    if (typeof company?.fiscalDayOpen === "boolean")
      return company.fiscalDayOpen;
    return false;
  }, [zimraStatusData?.fiscalDayStatus, company?.fiscalDayOpen]);
  const canViewZReport = !currentShift;

  // Sync ref every render — barcode scanner closure reads this instead of posSettings directly
  posSettingsRef.current = {
    variableWeightBarcodeRules: posSettings.variableWeightBarcodeRules,
    quantityDecimalPlaces: posSettings.quantityDecimalPlaces,
  };
  resolvedProductsRef.current = resolvedProducts || [];

  // Default to "Walk-in Customer"
  const resetToDefaultCustomer = () => {
    if (resolvedCustomers && resolvedCustomers.length > 0) {
      const walkIn = resolvedCustomers.find(
        (x: any) =>
          x.name.toLowerCase().includes("walk-in") ||
          x.name.toLowerCase().includes("guest"),
      );
      setSelectedCustomerId(walkIn ? walkIn.id.toString() : "");
    } else {
      setSelectedCustomerId("");
    }
  };

  useEffect(() => {
    if (
      !selectedCustomerId &&
      resolvedCustomers &&
      resolvedCustomers.length > 0
    ) {
      const walkIn = resolvedCustomers.find(
        (x: any) =>
          x.name.toLowerCase().includes("walk-in") ||
          x.name.toLowerCase().includes("guest"),
      );
      if (walkIn) {
        setSelectedCustomerId(walkIn.id.toString());
      }
    }
  }, [resolvedCustomers, selectedCustomerId]);

  // Manager Override State
  const [pendingOverride, setPendingOverride] = useState<{
    type:
      | "DISCOUNT"
      | "VOID_CART"
      | "REMOVE_ITEM"
      | "PRICE_CHANGE"
      | "OPEN_DRAWER"
      | "TOGGLE_FISCAL"
      | "VIEW_REPORT"
      | "VIEW_MY_SALES"
      | "END_SESSION";
    data: any;
  } | null>(null);

  // ─── POS Session Persistence ──────────────────────────────────────────
  // Load persisted state on mount
  useEffect(() => {
    if (!companyId) return;
    const prefix = `pos_session_${companyId}_`;

    try {
      const savedCart = localStorage.getItem(`${prefix}cart`);
      const savedCustomerId = localStorage.getItem(`${prefix}customerId`);
      const savedDiscount = localStorage.getItem(`${prefix}discount`);
      const savedCurrency = localStorage.getItem(`${prefix}currency`);
      const savedPaymentMethod = localStorage.getItem(`${prefix}paymentMethod`);

      if (savedCart) setCart(JSON.parse(savedCart));
      if (savedCustomerId && savedCustomerId !== "null" && savedCustomerId !== "undefined") setSelectedCustomerId(savedCustomerId);
      if (savedDiscount) setOrderDiscount(parseFloat(savedDiscount));
      if (savedCurrency) setSelectedCurrencyCode(savedCurrency);
      if (savedPaymentMethod) setPaymentMethod(savedPaymentMethod);
    } catch (e) {
      console.error("[POS] Failed to load persisted session:", e);
    }
  }, [companyId]);

  // Save state on every change
  useEffect(() => {
    if (!companyId) return;
    const prefix = `pos_session_${companyId}_`;

    localStorage.setItem(`${prefix}cart`, JSON.stringify(cart));
    localStorage.setItem(`${prefix}customerId`, selectedCustomerId);
    localStorage.setItem(`${prefix}discount`, orderDiscount.toString());
    localStorage.setItem(`${prefix}currency`, selectedCurrencyCode);
    localStorage.setItem(`${prefix}paymentMethod`, paymentMethod);

    // Persist detailed printer settings
    localStorage.setItem("pos_auto_print", posSettings.autoPrint.toString());
    localStorage.setItem("pos_terminal_id", posSettings.terminalId);
    localStorage.setItem(
      "pos_silent_printing",
      posSettings.silentPrinting.toString(),
    );
    localStorage.setItem("pos_printer_name", posSettings.printerName);
    localStorage.setItem(
      "pos_printer_width",
      posSettings.printerWidth.toString(),
    );
    localStorage.setItem(
      "pos_native_esc_pos",
      posSettings.nativeEscPos.toString(),
    );
    localStorage.setItem("pos_auto_cut", posSettings.autoCut.toString());
    localStorage.setItem("pos_feed_lines", posSettings.feedLines.toString());
    localStorage.setItem(
      "pos_open_drawer_on_print",
      posSettings.openDrawerOnPrint.toString(),
    );
    localStorage.setItem(
      "pos_double_height_header",
      posSettings.doubleHeightHeader.toString(),
    );
  }, [
    companyId,
    cart,
    selectedCustomerId,
    orderDiscount,
    selectedCurrencyCode,
    paymentMethod,
    posSettings,
  ]);

  const clearPersistedSession = () => {
    if (!companyId) return;
    const prefix = `pos_session_${companyId}_`;
    localStorage.removeItem(`${prefix}cart`);
    localStorage.removeItem(`${prefix}customerId`);
    localStorage.removeItem(`${prefix}discount`);
    localStorage.removeItem(`${prefix}currency`);
    localStorage.removeItem(`${prefix}paymentMethod`);
  };

  // Derived data
  const categories = useMemo(() => {
    if (!resolvedProducts || resolvedProducts.length === 0) return ["All"];
    const cats = new Set(
      resolvedProducts.map((p: any) => p.category || "Uncategorized"),
    );
    return ["All", ...Array.from(cats)];
  }, [resolvedProducts]);

  const filteredProducts = useMemo(() => {
    if (!resolvedProducts || resolvedProducts.length === 0) return [];
    return resolvedProducts
      .filter((p: any) => {
        // Exclude products explicitly marked as not for sale (e.g. raw materials)
        if (p.isForSale === false) return false;
        const matchesSearch =
          p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          (p.sku && p.sku.toLowerCase().includes(searchQuery.toLowerCase()));
        const matchesCategory =
          selectedCategory === "All" || p.category === selectedCategory;
        return matchesSearch && matchesCategory;
      })
      .sort((a: any, b: any) => {
        const aPinned = pinnedProducts.includes(a.id);
        const bPinned = pinnedProducts.includes(b.id);
        if (aPinned && !bPinned) return -1;
        if (!aPinned && bPinned) return 1;

        const aFreq = posItemFrequencies[a.id] || 0;
        const bFreq = posItemFrequencies[b.id] || 0;
        if (aFreq !== bFreq) {
          return bFreq - aFreq;
        }

        // Optionally, sort alphabetically if neither pinned or both pinned
        return a.name.localeCompare(b.name);
      });
  }, [resolvedProducts, searchQuery, selectedCategory, pinnedProducts, posItemFrequencies]);

  // ── Display limit: show first 40 items; show all when searching/filtering ──
  const INITIAL_LIMIT = 40;
  const pagedProducts = useMemo(
    () =>
      searchQuery || selectedCategory !== "All"
        ? filteredProducts
        : filteredProducts.slice(0, INITIAL_LIMIT),
    [filteredProducts, searchQuery, selectedCategory],
  );
  // ─────────────────────────────────────────────────────────────────────────

  const currencyInfo = useMemo(() => {
    if (selectedCurrencyCode === "USD") return { symbol: "$", rate: 1 };
    const cur = (resolvedCurrencies || []).find(
      (c: any) => c.code === selectedCurrencyCode,
    );
    return {
      symbol: cur?.symbol || selectedCurrencyCode,
      rate: Number(cur?.exchangeRate || 1),
    };
  }, [selectedCurrencyCode, resolvedCurrencies]);

  const fmt = (val: number) => {
    const converted = val * currencyInfo.rate;
    return `${currencyInfo.symbol}${converted.toFixed(2)}`;
  };

  const taxInclusive = company?.vatEnabled ?? false;

  const { subtotal, taxAmount } = useMemo(() => {
    let sub = 0;
    let tax = 0;

    cart.forEach((item) => {
      const lineTotal = Number((item.price * item.quantity - item.discountAmount).toFixed(2));
      const rate = item.taxRate / 100;

      if (taxInclusive) {
        // Price includes tax: Tax = Total - (Total / (1 + Rate))
        const taxPortion = Number((lineTotal - lineTotal / (1 + rate)).toFixed(2));
        const netPortion = Number((lineTotal - taxPortion).toFixed(2));
        sub += netPortion;
        tax += taxPortion;
      } else {
        // Price excludes tax: Tax = Total * Rate
        const taxPortion = Number((lineTotal * rate).toFixed(2));
        sub += lineTotal;
        tax += taxPortion;
      }
    });

    return { subtotal: Number(sub.toFixed(2)), taxAmount: Number(tax.toFixed(2)) };
  }, [cart, taxInclusive]);

  const total = Number(Math.max(0, subtotal + taxAmount - orderDiscount).toFixed(2));
  const playAddToCartSound = useCallback(() => {
    try {
      const AudioCtx =
        window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;

      if (!addToCartAudioContextRef.current) {
        addToCartAudioContextRef.current = new AudioCtx();
      }

      const ctx = addToCartAudioContextRef.current;
      if (!ctx) return;
      if (ctx.state === "suspended") {
        void ctx.resume().catch(() => {});
      }

      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "triangle";
      osc.frequency.setValueAtTime(880, now);
      osc.frequency.exponentialRampToValueAtTime(1320, now + 0.06);

      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.08, now + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.09);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.1);
    } catch {
      // Sound feedback is optional; never block POS flow on audio issues.
    }
  }, []);

  // Handlers
  const addToCart = (product: any) => {
    const settings = company?.posSettings as any;
    const allowOutOfStock = settings?.allowOutOfStockSales ?? false;

    setCart((prev) => {
      const existing = prev.find((item) => item.productId === product.id);
      if (existing && !product.serialTrackingEnabled) {
        return prev.map((item) =>
          item.productId === product.id
            ? { ...item, quantity: item.quantity + 1 }
            : item,
        );
      }

      let taxRate = company?.vatRegistered ? Number(product.taxRate ?? 15) : 0;
      if (company?.vatRegistered && product.taxCategoryId && taxTypes.data) {
        const category = taxTypes.data.find(
          (t: any) => t.id === product.taxCategoryId,
        );
        if (category) taxRate = Number(category.rate);
      }

      const cartItemId = product.serialTrackingEnabled
        ? `${product.id}-${Date.now()}-${Math.random()}`
        : String(product.id);

      return [
        ...prev,
        {
          cartItemId,
          productId: product.id,
          name: product.name,
          price: Number(product.price),
          quantity: product.serialTrackingEnabled ? 1 : (product.initialQuantity || 1),
          discountAmount: 0,
          taxRate: taxRate,
          taxTypeId: product.taxTypeId,
          hsCode: product.hsCode,
          serialNumber: undefined,
        },
      ];
    });
    playAddToCartSound();
    setCartAnimation(true);
    setTimeout(() => setCartAnimation(false), 300);
    setSearchQuery("");
    setSelectedCategory("All");
  };

  const addWeightedToCart = (product: any, quantity: number) => {
    const settings = company?.posSettings as any;
    const allowOutOfStock = settings?.allowOutOfStockSales ?? false;

    // Strict Stock Check
    if (
      product &&
      product.isTracked &&
      !product.hasRecipe &&
      !allowOutOfStock
    ) {
      const inCart =
        cart.filter((item) => item.productId === product.id).reduce((sum, item) => sum + item.quantity, 0);
      const newTotal = inCart + quantity;
      if (newTotal > Number(product.stockLevel || 0)) {
        toast({
          title: "Insufficient Stock",
          description: `Cannot add ${quantity.toFixed(3)} units. Only ${product.stockLevel || 0} available.`,
          variant: "destructive",
          // ... rest of toast options ...
        });
        return;
      }
    }

    setCart((prev) => {
      const existing = prev.find((item) => item.productId === product.id);
      if (existing && !product.serialTrackingEnabled) {
        return prev.map((item) =>
          item.productId === product.id
            ? { ...item, quantity: item.quantity + quantity }
            : item,
        );
      }

      let taxRate = company?.vatRegistered ? Number(product.taxRate ?? 15) : 0;
      if (company?.vatRegistered && product.taxCategoryId && taxTypes.data) {
        const category = taxTypes.data.find(
          (t: any) => t.id === product.taxCategoryId,
        );
        if (category) taxRate = Number(category.rate);
      }

      const cartItemId = product.serialTrackingEnabled
        ? `${product.id}-${Date.now()}-${Math.random()}`
        : String(product.id);

      return [
        ...prev,
        {
          cartItemId,
          productId: product.id,
          name: product.name,
          price: Number(product.price),
          quantity: product.serialTrackingEnabled ? 1 : quantity,
          discountAmount: 0,
          taxRate: taxRate,
          taxTypeId: product.taxTypeId,
          hsCode: product.hsCode,
          serialNumber: undefined,
        },
      ];
    });
    playAddToCartSound();
    setCartAnimation(true);
    setTimeout(() => setCartAnimation(false), 300);
    setSearchQuery("");
    setSelectedCategory("All");
  };

  const applyLineDiscount = (cartItemId: string, amount: number) => {
    setCart((prev) =>
      prev.map((item) =>
        (item.cartItemId || String(item.productId)) === cartItemId
          ? { ...item, discountAmount: amount }
          : item,
      ),
    );
  };

  // ─── Barcode Scanner (keyboard wedge / HID mode) ──────────────────────
  // Uses refs to avoid stale closures. Handles scanners up to 100ms/char.
  // Works even when search input is focused.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const now = Date.now();
      const gap = now - lastCharTimeRef.current;
      const inInput =
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement;
      const modalOpen =
        isCheckoutOpen ||
        isShiftModalOpen ||
        isHoldsModalOpen ||
        isSettingsOpen ||
        !!pendingOverride;

      // ── Keyboard shortcuts (only when not typing in an input and no modal) ──
      if (!inInput && !modalOpen) {
        switch (e.key) {
          case "Enter":
          case "F10":
            e.preventDefault();
            if (cart.length > 0) handleCheckout();
            return;
          case "F1":
            e.preventDefault();
            searchInputRef.current?.focus();
            searchInputRef.current?.select();
            return;
          case "F2":
          case "F4":
            e.preventDefault();
            handleClearCart();
            return;
          case "F3":
            e.preventDefault();
            if (cart.length > 0) holdOrder();
            return;
          case "Escape":
            setSearchQuery("");
            searchInputRef.current?.blur();
            return;
          case "+":
          case "=":
            e.preventDefault();
            if (cart.length > 0) {
              const lastItem = cart[cart.length - 1];
              updateQuantity(lastItem.cartItemId || String(lastItem.productId), 1);
            }
            return;
          case "-":
            e.preventDefault();
            if (cart.length > 0) {
              const lastItem = cart[cart.length - 1];
              updateQuantity(lastItem.cartItemId || String(lastItem.productId), -1);
            }
            return;
        }
      }

      // Global Enter key to complete checkout when modal is open
      if ((e.key === "Enter" || e.key === "F10") && isCheckoutOpen && !isProcessing) {
        e.preventDefault();
        if (!paidAmount) {
          setPaidAmount(total.toString());
        } else {
          processOrder();
        }
        return;
      }

      // Escape closes checkout modal
      if (e.key === "Escape" && isCheckoutOpen) {
        setIsCheckoutOpen(false);
        return;
      }

      // ── Barcode accumulation — chars arriving < 100ms apart are from a scanner ──
      if (gap > 100) {
        barcodeBufferRef.current = e.key === "Enter" ? "" : e.key;
      } else {
        if (e.key === "Enter") {
          const barcode = barcodeBufferRef.current.trim();
          barcodeBufferRef.current = "";
          if (barcode.length < 2) return;

          // ── Configurable Variable Weight Barcode Handling ──
          const weightRules: any[] =
            posSettingsRef.current.variableWeightBarcodeRules || [];
          const matchedRule = weightRules.find(
            (r: any) =>
              r.enabled &&
              barcode.startsWith(r.prefix) &&
              barcode.length === r.totalLength,
          );
          if (matchedRule) {
            const productSku = barcode.substring(
              matchedRule.skuStart,
              matchedRule.skuStart + matchedRule.skuLength,
            );
            const qtyRaw = parseInt(
              barcode.substring(
                matchedRule.quantityStart,
                matchedRule.quantityStart + matchedRule.quantityLength,
              ),
            );
            const quantity = qtyRaw / (matchedRule.quantityDivisor || 1000);

            const weightedFound = resolvedProductsRef.current?.find(
              (p: any) =>
                p.sku === productSku ||
                p.barcode === productSku ||
                p.barcode === barcode,
            );
            if (weightedFound) {
              addWeightedToCart(weightedFound, quantity);
              const uom =
                (weightedFound as any).unitOfMeasure ||
                (matchedRule.quantityDivisor === 1000 ? "kg" : "units");
              toast({
                title: "✓ Weighted Item",
                description: `${weightedFound.name} (${quantity.toFixed(posSettingsRef.current.quantityDecimalPlaces ?? 3)} ${uom})`,
              });
              if (searchQuery) setSearchQuery("");
              return;
            }
          }

          const found = resolvedProducts?.find(
            (p: any) => p.barcode === barcode || p.sku === barcode,
          );
          if (found) {
            const prev = lastScannedProductRef.current;
            if (prev && prev.productId === found.id && now - prev.time < 2000 && !found.serialTrackingEnabled) {
              const existingItem = cart.find((c) => c.productId === found.id);
              if (existingItem) {
                updateQuantity(existingItem.cartItemId || String(existingItem.productId), 1);
              } else {
                addToCart(found);
              }
            } else {
              addToCart(found);
              toast({ title: "✓ Scanned", description: found.name });
            }
            lastScannedProductRef.current = { productId: found.id, time: now };
            if (searchQuery) setSearchQuery("");
          } else {
            setSearchQuery(barcode);
            searchInputRef.current?.focus();
            toast({
              title: "Not found",
              description: `No product for: ${barcode}`,
              variant: "destructive",
            });
          }
        } else if (e.key.length === 1) {
          barcodeBufferRef.current += e.key;
        }
      }
      lastCharTimeRef.current = now;
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    resolvedProducts,
    cart,
    isCheckoutOpen,
    isShiftModalOpen,
    isHoldsModalOpen,
    isSettingsOpen,
    pendingOverride,
    searchQuery,
    isQuickAddCustomerOpen,
  ]);

  // ─── Electron serial/USB barcode scanner ──────────────────────────────
  useEffect(() => {
    if (!window.electronAPI) return;
    const handler = (barcode: string) => {
      const trimmed = barcode.trim();
      if (!trimmed) return;
      const found = resolvedProducts?.find(
        (p: any) => p.barcode === trimmed || p.sku === trimmed,
      );

      // ── Configurable Variable Weight Barcode Handling ──
      const weightRulesE: any[] =
        posSettingsRef.current.variableWeightBarcodeRules || [];
      const matchedRuleE = weightRulesE.find(
        (r: any) =>
          r.enabled &&
          trimmed.startsWith(r.prefix) &&
          trimmed.length === r.totalLength,
      );
      if (matchedRuleE) {
        const productSku = trimmed.substring(
          matchedRuleE.skuStart,
          matchedRuleE.skuStart + matchedRuleE.skuLength,
        );
        const qtyRaw = parseInt(
          trimmed.substring(
            matchedRuleE.quantityStart,
            matchedRuleE.quantityStart + matchedRuleE.quantityLength,
          ),
        );
        const quantity = qtyRaw / (matchedRuleE.quantityDivisor || 1000);

        const weightedFound = resolvedProductsRef.current?.find(
          (p: any) =>
            p.sku === productSku ||
            p.barcode === productSku ||
            p.barcode === trimmed,
        );
        if (weightedFound) {
          addWeightedToCart(weightedFound, quantity);
          const uomE =
            (weightedFound as any).unitOfMeasure ||
            (matchedRuleE.quantityDivisor === 1000 ? "kg" : "units");
          toast({
            title: "✓ Weighted Item",
            description: `${weightedFound.name} (${quantity.toFixed(posSettingsRef.current.quantityDecimalPlaces ?? 3)} ${uomE})`,
          });
          return;
        }
      }

      if (found) {
        const now = Date.now();
        const prev = lastScannedProductRef.current;
        if (prev && prev.productId === found.id && now - prev.time < 2000 && !found.serialTrackingEnabled) {
          const existingItem = cart.find((c) => c.productId === found.id);
          if (existingItem) {
            updateQuantity(existingItem.cartItemId || String(existingItem.productId), 1);
          } else {
            addToCart(found);
          }
        } else {
          addToCart(found);
          toast({ title: "✓ Scanned", description: found.name });
        }
        lastScannedProductRef.current = { productId: found.id, time: now };
      } else {
        setSearchQuery(trimmed);
        searchInputRef.current?.focus();
        toast({
          title: "Not found",
          description: `No product for: ${trimmed}`,
          variant: "destructive",
        });
      }
    };
    window.electronAPI.onBarcodeScan(handler);
    return () => window.electronAPI?.offBarcodeScan?.(handler);
  }, [resolvedProducts]);

  // Pre-cache manager PIN hashes for offline verification (Electron only)
  useEffect(() => {
    if (!window.electronAPI || !isOnline || !companyId) return;
    apiFetch(`/api/companies/${companyId}/auth/manager-pin-hashes`)
      .then((res) => (res.ok ? res.json() : null))
      .then((hashes) => {
        if (hashes && hashes.length > 0) {
          window.electronAPI!.cacheManagerPins(companyId, hashes);
        }
      })
      .catch(() => {
        /* non-critical — silently ignore */
      });
  }, [companyId, isOnline]);

  const updateQuantity = (cartItemId: string, delta: number) => {
    const cartItem = cart.find((item) => (item.cartItemId || String(item.productId)) === cartItemId);
    if (!cartItem) return;
    const product = resolvedProducts?.find((p: any) => p.id === cartItem.productId);
    if (product?.serialTrackingEnabled) return; // Prevent changing quantity of serial-tracked items

    setCart((prev) =>
      prev.map((item) => {
        if ((item.cartItemId || String(item.productId)) === cartItemId) {
          const newQty = item.quantity + delta;
          if (newQty < 1) return item;

          // Stock Validation
          const allowOutOfStock =
            (company?.posSettings as any)?.allowOutOfStockSales ?? false;
          if (
            product?.isTracked &&
            !product.hasRecipe &&
            !allowOutOfStock &&
            newQty > Number(product.stockLevel)
          ) {
            toast({
              title: "Limit Reached",
              description: `Maximum stock for ${product.name} is ${product.stockLevel}`,
              variant: "destructive",
            });
            return item;
          }

          return { ...item, quantity: newQty };
        }
        return item;
      }),
    );
  };

  const removeFromCart = (cartItemId: string) => {
    const settings = company?.posSettings as any;
    if (settings?.requireOverrideForDelete) {
      setPendingOverride({ type: "REMOVE_ITEM", data: cartItemId });
    } else {
      setCart((prev) => prev.filter((item) => (item.cartItemId || String(item.productId)) !== cartItemId));
    }
  };

  const updatePrice = (cartItemId: string, newPrice: number) => {
    const settings = company?.posSettings as any;
    if (settings?.requireOverrideForPriceChange) {
      setPendingOverride({
        type: "PRICE_CHANGE",
        data: { cartItemId, price: newPrice },
      });
    } else {
      setCart((prev) =>
        prev.map((item) =>
          (item.cartItemId || String(item.productId)) === cartItemId ? { ...item, price: newPrice } : item,
        ),
      );
    }
  };

  const handleOpenDrawer = () => {
    const settings = company?.posSettings as any;
    if (settings?.requireOverrideForOpenDrawer) {
      setPendingOverride({ type: "OPEN_DRAWER", data: null });
    } else {
      toast({
        title: "Drawer Opened",
        description: "Cash drawer opened successfully",
      });
      // triggerOpenDrawer();
    }
  };

  const fetchShift = async () => {
    if (isOnline) {
      try {
        const res = await apiFetch(
          `/api/pos/shifts/current?companyId=${companyId}`,
        );
        if (res.ok) {
          const shiftData = await res.json();
          setCurrentShift(shiftData);
          if (companyId) await cacheShift(companyId, shiftData);
          return;
        }
        // 401 = offline auth session — fall through to cache
      } catch (e) {
        console.error("Failed to fetch shift from API", e);
      }
    }
    // Offline or auth-offline fallback
    if (companyId) {
      const cached = await getCachedShift(companyId);
      if (cached) setCurrentShift(cached);
    }
  };

  const fetchHeldSales = async () => {
    let serverHolds: any[] = [];
    let offlineHolds: any[] = [];

    if (isOnline) {
      try {
        const res = await apiFetch(`/api/pos/holds?companyId=${companyId}`);
        if (res.ok) serverHolds = await res.json();
        // 401 = offline auth session — skip server holds, use local only
      } catch (e) {
        console.error("Failed to fetch holds from API", e);
      }
    }

    if (companyId) {
      const local = await getOfflineHolds(companyId);
      offlineHolds = local.map((h) => ({
        ...h,
        id: h.id, // Keep original ID
        _offline: true,
        holdName: `${h.holdName} (Offline)`,
      }));
    }

    setHeldSales([...serverHolds, ...offlineHolds]);
  };

  const openShift = async () => {
    const shiftData = {
      companyId,
      openingBalance: shiftBalance || "0",
      status: "OPEN",
      openedAt: new Date().toISOString(),
      openedBy: user?.id,
      totalSales: "0",
      totalTax: "0",
      _provisional: !isOnline,
    };

    try {
      if (isOnline) {
        const res = await apiFetch("/api/pos/shifts/open", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            companyId,
            openingBalance: shiftBalance || "0",
          }),
        });
        if (res.ok) {
          toast({
            title: "Shift Opened",
            description: `Register opened with $${shiftBalance}`,
          });
          setIsShiftModalOpen(false);
          setShiftBalance("");
          fetchShift();
          return;
        }
      } else {
        // Offline fallback
        const provisionalShiftId = await addPendingShiftAction(
          companyId,
          "open",
          { openingBalance: shiftBalance || "0" },
          selectedBranchId,
        );
        const provisionalShift = { ...shiftData, id: provisionalShiftId };
        setCurrentShift(provisionalShift);
        await cacheShift(companyId, provisionalShift);
        toast({
          title: "Shift Opened (Offline)",
          description: "Provisional shift started. Will sync when online.",
        });
        setIsShiftModalOpen(false);
        setShiftBalance("");
        return;
      }
    } catch (e) {
      if (!isOnline) {
        // Secondary check for offline if network failed mid-request
        const provisionalShiftId = await addPendingShiftAction(
          companyId,
          "open",
          { openingBalance: shiftBalance || "0" },
          selectedBranchId,
        );
        const provisionalShift = { ...shiftData, id: provisionalShiftId };
        setCurrentShift(provisionalShift);
        await cacheShift(companyId, provisionalShift);
        toast({
          title: "Shift Opened (Offline)",
          description: "Connection lost. Provisional shift started.",
        });
        setIsShiftModalOpen(false);
        setShiftBalance("");
        return;
      }
      toast({
        title: "Error",
        description: "Failed to open shift",
        variant: "destructive",
      });
    }
  };

  const handleCloseShift = async () => {
    if (!currentShift) return;
    try {
      if (isOnline && !currentShift._provisional) {
        const res = await apiFetch(`/api/pos/shifts/${currentShift.id}/close`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ closingBalance: shiftBalance || "0" }),
        });
        if (res.ok) {
          toast({
            title: "Session Closed",
            description: "Shift closed successfully",
          });
          const shiftId = currentShift.id;
          setCurrentShift(null);
          await cacheShift(companyId, null);
          setIsShiftModalOpen(false);
          setShiftBalance("");
          fetchShift();

          // Automatically show the X-report
          handleLoadReport("x");
          return;
        }
      } else {
        // Offline fallback or closing a provisional shift
        await addPendingShiftAction(
          companyId,
          "close",
          {
            shiftId: currentShift.id,
            closingBalance: shiftBalance || "0",
          },
          selectedBranchId,
        );
        setCurrentShift(null);
        await cacheShift(companyId, null);
        toast({
          title: "Session Closed (Offline)",
          description: "Closing queued. Reconciliation will sync later.",
        });
        setIsShiftModalOpen(false);
        setShiftBalance("");
        handleLoadReport("x");
        return;
      }
    } catch (e) {
      if (!isOnline) {
        await addPendingShiftAction(
          companyId,
          "close",
          {
            shiftId: currentShift.id,
            closingBalance: shiftBalance || "0",
          },
          selectedBranchId,
        );
        setCurrentShift(null);
        await cacheShift(companyId, null);
        toast({
          title: "Session Closed (Offline)",
          description: "Connection lost. Closing queued.",
        });
        setIsShiftModalOpen(false);
        setShiftBalance("");
        handleLoadReport("x");
        return;
      }
      toast({
        title: "Error",
        description: "Failed to close shift",
        variant: "destructive",
      });
    }
  };

  const handleTableSelect = async (table: any) => {
    if (table.status === "available") {
      setPendingTableSelection(table);
      setCoversCount(table.capacity > 0 ? table.capacity : 2);
      setIsCoversDialogOpen(true);
    } else if (table.status === "occupied" && table.currentInvoiceId) {
      try {
        const res = await apiFetch(`/api/invoices/${table.currentInvoiceId}`);
        if (!res.ok) throw new Error("Failed to fetch ticket");
        const invoice = await res.json();
        
        // Rebuild cart
        const cartItems = invoice.items.map((item: any) => ({
          productId: item.product?.id || item.productId,
          name: item.product?.name || item.description,
          price: Number(item.unitPrice),
          quantity: Number(item.quantity),
          discountAmount: Number(item.discountAmount || 0),
          modifiers: item.modifiers || [],
          taxRate: item.taxRate !== null && item.taxRate !== undefined ? Number(item.taxRate) : undefined,
          taxTypeId: item.taxTypeId,
          serialNumber: item.serialNumber,
        }));
        
        setCart(cartItems);
        setSelectedTableId(table.id);
        setActiveDraftInvoiceId(table.currentInvoiceId);
        setCoversCount(invoice.covers || 1);
        setActiveView("cart");
        toast({ title: "Ticket Reopened", description: `Reopened ticket for ${table.tableName}` });
      } catch (err: any) {
        toast({ title: "Error", description: err.message, variant: "destructive" });
      }
    } else {
      setSelectedTableId(table.id);
    }
  };

  const sendRestaurantOrder = async () => {
    if (!selectedTableId) return;
    if (cart.length === 0) return toast({ title: "Cart empty", variant: "destructive" });
    
    setIsProcessing(true);
    try {
      const payload = {
        companyId,
        branchId: currentShift?.branchId || undefined,
        shiftId: currentShift?.id || undefined,
        customerId: selectedCustomerId ? parseInt(selectedCustomerId) : (company?.posSettings as any)?.defaultCustomerId || undefined,
        status: "draft",
        orderStatus: "pending",
        isPos: true,
        tableId: selectedTableId,
        covers: coversCount,
        subtotal: subtotal.toString(),
        taxAmount: taxAmount.toString(),
        total: total.toString(),
        currency: selectedCurrencyCode || "USD",
        items: cart.map(item => ({
          productId: item.productId,
          description: item.name,
          quantity: item.quantity.toString(),
          unitPrice: item.price.toString(),
          taxRate: item.taxRate !== undefined ? item.taxRate.toString() : "0",
          taxTypeId: item.taxTypeId || null,
          lineTotal: ((item.price * item.quantity) - item.discountAmount).toFixed(2),
          discountAmount: item.discountAmount?.toString() || "0",
          modifiers: (item as any).modifiers || [],
          serialNumber: item.serialNumber,
        }))
      };

      let invoiceId = activeDraftInvoiceId;
      if (invoiceId) {
        const res = await apiFetch(`/api/invoices/${invoiceId}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error("Failed to update ticket");
      } else {
        const res = await apiFetch("/api/invoices", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error("Failed to create ticket");
        const newInvoice = await res.json();
        invoiceId = newInvoice.id;
      }
      
      await apiFetch(`/api/restaurant/tables/${selectedTableId}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "occupied", currentInvoiceId: invoiceId })
      });
      
      toast({ title: "Sent to Kitchen", description: "Order sent successfully." });
      
      setCart([]);
      setActiveDraftInvoiceId(undefined);
      setSelectedTableId(undefined);
      setActiveView("products");
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCheckout = async () => {
    if (cart.length === 0) {
      toast({
        title: "Cart Empty",
        description: "Add items to cart first.",
        variant: "destructive",
      });
      return;
    }
    if (!selectedCustomerId) {
      // Find a "Cash Customer" or prompt
      const cashCustomer = resolvedCustomers?.find(
        (c: any) =>
          c.name.toLowerCase().includes("cash") ||
          c.name.toLowerCase().includes("walk-in"),
      );
      if (cashCustomer) {
        setSelectedCustomerId(cashCustomer.id.toString());
      } else {
        toast({
          title: "Customer Required",
          description: "Please select or create a customer.",
          variant: "destructive",
        });
        return;
      }
    }
    setIsCheckoutOpen(true);
  };

  const processOrder = async () => {
    if (isProcessingRef.current) return;
    isProcessingRef.current = true;
    let finalCustomerId = selectedCustomerId;
    if (finalCustomerId === "null" || finalCustomerId === "undefined") {
      finalCustomerId = "";
    }
    const settings = company?.posSettings as any;
    if (!finalCustomerId && settings?.defaultCustomerId) {
      finalCustomerId = settings.defaultCustomerId.toString();
    }

    const parsedCustomerId = parseInt(finalCustomerId);
    if (!parsedCustomerId || isNaN(parsedCustomerId)) {
      toast({
        title: "Customer Required",
        description: "Please select a valid customer before checkout.",
        variant: "destructive",
      });
      isProcessingRef.current = false;
      return;
    }
    finalCustomerId = parsedCustomerId.toString();
    setIsProcessing(true);
    let invoiceData: any = null;
    const checkoutAttemptId = `pos-${companyId}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

    const sumTendersValue = parseFloat(paidAmount || "0");
    const isLaybySale = paymentMethod === "LAYBY";
    const sumTenders = isLaybySale
      ? sumTendersValue
      : paymentMethod === "CREDIT" || splitPayments.length > 0
        ? splitPayments.length > 0
          ? splitPayments.reduce((acc, p) => acc + p.amount, 0)
          : total
        : sumTendersValue > 0
          ? sumTendersValue
          : total;

    // CREDIT sales require a real (non-default) customer — no walk-in credit accounts
    const isDefaultCustomer = resolvedCustomers
      ?.find((c: any) => c.id.toString() === finalCustomerId)
      ?.name.toLowerCase()
      .match(/walk-in|guest/);
    if ((paymentMethod === "CREDIT" || isLaybySale) && isDefaultCustomer) {
      toast({
        title: "Customer Required",
        description:
          "Account sales and lay-bys require a named customer. Please select a customer before proceeding.",
        variant: "destructive",
      });
      setIsProcessing(false);
      return;
    }

    const currencyInfoLocal = resolvedCurrencies?.find(
      (c: any) => c.code === selectedCurrencyCode,
    ) || { code: "USD", exchangeRate: "1" };
    const exchangeRate = Number(currencyInfoLocal.exchangeRate) || 1;

    if (
      paymentMethod !== "CREDIT" &&
      !isLaybySale &&
      sumTenders < (total * exchangeRate) - 0.05
    ) {
      toast({
        title: "Insufficient Payment",
        description: `Received amount is less than total payable (${fmt(total)})`,
        variant: "destructive",
      });
      setIsProcessing(false);
      return;
    }

    const prepareNextSaleImmediately = () => {
      try {
        const itemFreq = { ...posItemFrequencies };
        cart.forEach(item => {
          itemFreq[item.productId] = (itemFreq[item.productId] || 0) + item.quantity;
        });
        localStorage.setItem('pos_item_frequency', JSON.stringify(itemFreq));
        setPosItemFrequencies(itemFreq);
      } catch (e) {
        console.error("Failed to update item frequency", e);
      }

      setCart([]);
      setOrderDiscount(0);
      resetToDefaultCustomer();
      setPaidAmount("");
      setSplitPayments([]);
      setIsCheckoutOpen(false);
      setActiveView("products");
      setSelectedTableId(undefined);
      setActiveDraftInvoiceId(undefined);
    };

    try {
      const currency = resolvedCurrencies?.find(
        (c: any) => c.code === selectedCurrencyCode,
      ) || { code: "USD", exchangeRate: "1" };
      invoiceData = {
        companyId,
        branchId: selectedBranchId,
        customerId: !isNaN(parsedCustomerId) && parsedCustomerId ? parsedCustomerId : (settings?.defaultCustomerId || undefined),
        issueDate: new Date(),
        dueDate: new Date(),
        notes: "POS Transaction",
        currency: currency.code,
        exchangeRate: currency.exchangeRate,
        paymentMethod: splitPayments.length > 0 ? "SPLIT" : paymentMethod,
        splitPayments: splitPayments.length > 0 ? splitPayments : undefined,
        status: "issued",
        isPos: true,
        idempotencyKey: checkoutAttemptId,
        isFiscalized: isFiscalized,
        createdBy: user?.id,
        discountAmount: orderDiscount.toString(),
        transactionType: "FiscalInvoice",
        subtotal: subtotal.toString(),
        taxAmount: taxAmount.toString(),
        total: total.toString(),
        taxInclusive: taxInclusive,
        items: cart.map((item) => ({
          productId: item.productId,
          description: item.name,
          quantity: item.quantity.toString(),
          unitPrice: item.price.toString(),
          discountAmount: item.discountAmount.toString(),
          taxRate: item.taxRate.toString(),
          lineTotal: (
            item.price * item.quantity -
            item.discountAmount
          ).toFixed(2),
          taxTypeId: item.taxTypeId,
          serialNumber: item.serialNumber,
        })),
      };

      // ─── Offline fallback: queue sale locally ────────────────────
      if (isLaybySale) {
        if (!isOnline) {
          toast({
            title: "Online Required",
            description:
              "Lay-bys need a live connection so stock and deposits stay in sync.",
            variant: "destructive",
          });
          return;
        }
        const expiryDate = new Date();
        expiryDate.setDate(expiryDate.getDate() + 90);
        const laybyRes = await apiFetch(`/api/companies/${companyId}/laybys`, {
          method: "POST",
          body: JSON.stringify({
            customerId: !isNaN(parsedCustomerId) && parsedCustomerId ? parsedCustomerId : (settings?.defaultCustomerId || undefined),
            branchId: selectedBranchId,
            subtotal: subtotal.toString(),
            taxAmount: taxAmount.toString(),
            total: total.toString(),
            depositRequired: sumTenders.toString(),
            currency: currency.code,
            expiryDate,
            notes: "POS Lay-by",
            items: cart.map((item) => ({
              productId: item.productId,
              description: item.name,
              quantity: item.quantity.toString(),
              unitPrice: item.price.toString(),
              taxRate: item.taxRate.toString(),
              lineTotal: (
                item.price * item.quantity -
                item.discountAmount
              ).toFixed(2),
              serialNumber: item.serialNumber,
            })),
          }),
        });
        if (!laybyRes.ok) {
          const error = await laybyRes
            .json()
            .catch(() => ({ message: "Failed to create lay-by" }));
          throw new Error(error.message || "Failed to create lay-by");
        }
        const layby = await laybyRes.json();
        if (sumTenders > 0) {
          const paymentRes = await apiFetch(
            `/api/companies/${companyId}/laybys/${layby.id}/payments`,
            {
              method: "POST",
              body: JSON.stringify({
                amount: sumTenders.toString(),
                currency: currency.code,
                paymentMethod: splitPayments.length > 0 ? "SPLIT" : "CASH",
                notes: "POS lay-by deposit",
              }),
            },
          );
          if (!paymentRes.ok) {
            const error = await paymentRes
              .json()
              .catch(() => ({ message: "Lay-by created but deposit failed" }));
            throw new Error(
              error.message || "Lay-by created but deposit failed",
            );
          }
        }
        toast({
          title: "Lay-by Created",
          description: `${layby.laybyNumber} saved with ${fmt(sumTenders)} deposit.`,
        });
        prepareNextSaleImmediately();
        clearPersistedSession();
        return;
      }

      if (!isOnline) {
        const offlineRef = `OFFLINE-${Date.now().toString().slice(-6)}`;
        let fiscalData: any = {};
        let posRef = offlineRef;
        if (isFiscalized) {
          try {
            const zimraConfig = await getCachedZimraConfig(companyId);
            const fiscalSequence = await refreshCachedFiscalSequence(companyId);
            if (zimraConfig?.zimraPrivateKey && fiscalSequence) {
              const nextGlobalNo = fiscalSequence.lastReceiptGlobalNo + 1;
              const nextDailyCount = fiscalSequence.dailyReceiptCount + 1;
              const dateObj = new Date();
              const dateLocal = new Date(dateObj.getTime() - (dateObj.getTimezoneOffset() * 60000));
              const receiptDate = dateLocal.toISOString().slice(0, 19);

              const taxesMap = new Map<number, any>();
              for (const item of invoiceData.items) {
                const taxId = item.taxTypeId || 1;
                const taxRate = Number(item.taxRate);
                const lineTotal = Number(item.lineTotal);
                const taxAmount = taxInclusive ? Number((lineTotal - (lineTotal / (1 + (taxRate / 100)))).toFixed(2)) : Number((lineTotal * (taxRate / 100)).toFixed(2));
                const salesWithTax = taxInclusive ? lineTotal : Number((lineTotal + taxAmount).toFixed(2));
                
                if (!taxesMap.has(taxId)) {
                  taxesMap.set(taxId, { taxID: taxId, taxCode: resolveTaxCode(taxId), taxPercent: taxRate, taxAmount: 0, salesAmountWithTax: 0 });
                }
                const t = taxesMap.get(taxId);
                t.taxAmount = Number((t.taxAmount + taxAmount).toFixed(2));
                t.salesAmountWithTax = Number((t.salesAmountWithTax + salesWithTax).toFixed(2));
              }

              const receiptDataParams = {
                receiptType: "FISCALINVOICE",
                receiptCurrency: currency.code,
                receiptGlobalNo: nextGlobalNo,
                receiptDate: receiptDate,
                receiptTotal: Number(total),
                receiptTaxes: Array.from(taxesMap.values())
              };

              const offlineSig = generateOfflineFiscalData({
                receiptData: receiptDataParams,
                previousReceiptHash: fiscalSequence.lastFiscalHash,
                deviceId: zimraConfig.fdmsDeviceId,
                privateKeyPem: zimraConfig.zimraPrivateKey
              });

              fiscalData = {
                receiptGlobalNo: nextGlobalNo,
                receiptCounter: nextDailyCount,
                fiscalSignature: offlineSig.signature,
                receiptDeviceSignature: offlineSig.hash,
                qrUrl: zimraConfig.qrUrl ? `${zimraConfig.qrUrl}?verify=${offlineSig.verificationCode}` : null
              };

              posRef = `${nextGlobalNo}`; // POS receipt number is global no.

              // Update local sequence
              await cacheFiscalSequence(companyId, {
                ...fiscalSequence,
                lastReceiptGlobalNo: nextGlobalNo,
                dailyReceiptCount: nextDailyCount,
                lastFiscalHash: offlineSig.hash
              });
            }
          } catch (e) {
            console.error("Failed to generate offline fiscal signature", e);
          }
        }

        const payloadToQueue = { ...invoiceData, ...fiscalData };
        const offlineId = await addPendingSale(
          companyId,
          payloadToQueue,
          selectedBranchId,
        );
        const offInvoice = {
          id: offlineId,
          ...payloadToQueue,
          _offline: true,
          invoiceNumber: posRef,
          customerReference: posRef,
          paymentAmount: sumTenders,
          change: sumTenders - (total * exchangeRate),
        };
        if (posSettings.printingEnabled) {
          setLastSuccessfulInvoice(offInvoice);
        } else {
          toast({
            title: "Sale Queued Offline",
            description: `Pending sale ${offlineId} was saved locally and will sync when online.`,
          });
          setActiveView("products");
        }
        prepareNextSaleImmediately();
        clearPersistedSession();

        // Register Background Sync
        if ("serviceWorker" in navigator && "SyncManager" in window) {
          runOnIdle(() => {
            navigator.serviceWorker.ready
              .then((reg) => {
                return (reg as any).sync.register("sync-sales");
              })
              .catch((err) =>
                console.error("[Sync] Registration failed:", err),
              );
          });
        }

        runOnIdle(() => {
          refreshPendingCount().catch((err) =>
            console.error("[POS] refreshPendingCount failed:", err),
          );
        });
        return;
      }

      let result;
      if (activeDraftInvoiceId) {
        const res = await apiFetch(`/api/invoices/${activeDraftInvoiceId}`, {
          method: "PATCH",
          body: JSON.stringify({ ...invoiceData, status: "issued" })
        });
        if (!res.ok) {
           const dbError = await res.json().catch(() => ({}));
           throw new Error(dbError.message || "Failed to checkout draft ticket");
        }
        result = await res.json();
        if (selectedTableId) {
          await apiFetch(`/api/restaurant/tables/${selectedTableId}`, {
            method: "PATCH", body: JSON.stringify({ status: "available", currentInvoiceId: null })
          }).catch(e => console.error("Failed to release table", e));
        }
      } else {
        result = await createInvoice.mutateAsync(invoiceData as any);
      }

      // Keep the offline sequence cache aligned after a successful online sale.
      runOnIdle(() =>
        refreshCachedFiscalSequence(companyId).catch(() => {}),
      );

      // Save successful online sale to offline sales history for reprinting
      try {
        const { addSalesHistory } = await import("@/lib/offline-db");
        // Ensure items are included so they can be viewed/printed offline
        const offlineSaleRecord = {
          ...result,
          items: result.items && result.items.length > 0 ? result.items : invoiceData.items,
        };
        await addSalesHistory(companyId, [offlineSaleRecord]);
      } catch (e) {
        console.error("Failed to save to offline sales history", e);
      }
      
      // Refresh products to reflect new stock levels
      runOnIdle(() => {
        queryClient.invalidateQueries({
          queryKey: ["/api/companies/:companyId/products", companyId],
        });
      });

      // Cash drawer: open after successful sale when running in Electron and enabled
      if (window.electronAPI && posSettings.cashDrawerEnabled) {
        const printerName =
          localStorage.getItem("pos_printer_name") || undefined;
        window.electronAPI.openCashDrawer(printerName).catch(console.error);
      }
      if (posSettings.printingEnabled) {
        setLastSuccessfulInvoice({
          ...result,
          paymentAmount: sumTenders,
          change: sumTenders - (total * exchangeRate),
        });
      } else {
        toast({
          title: "Success",
          description: "Order processed successfully",
        });
        setActiveView("products");
      }

      prepareNextSaleImmediately();
      clearPersistedSession();
    } catch (error: any) {
      // If the error looks like a network failure, queue offline
      if (!navigator.onLine || error.message === "Failed to fetch") {
        try {
          const payload = invoiceData || {
            companyId,
            branchId: selectedBranchId,
            customerId: !isNaN(parsedCustomerId) && parsedCustomerId ? parsedCustomerId : (settings?.defaultCustomerId || undefined),
            issueDate: new Date(),
            dueDate: new Date(),
            notes: "POS Transaction",
            currency: selectedCurrencyCode,
            exchangeRate: "1",
            paymentMethod: splitPayments.length > 0 ? "SPLIT" : paymentMethod,
            splitPayments: splitPayments.length > 0 ? splitPayments : undefined,
            status: "issued",
            isPos: true,
            idempotencyKey: checkoutAttemptId,
            isFiscalized: isFiscalized,
            createdBy: user?.id,
            discountAmount: orderDiscount.toString(),
            transactionType: "FiscalInvoice",
            subtotal: subtotal.toString(),
            taxAmount: taxAmount.toString(),
            total: total.toString(),
            taxInclusive: taxInclusive,
            items: cart.map((item) => ({
              productId: item.productId,
              description: item.name,
              quantity: item.quantity.toString(),
              unitPrice: item.price.toString(),
              discountAmount: item.discountAmount.toString(),
              taxRate: item.taxRate.toString(),
              lineTotal: (
                item.price * item.quantity -
                item.discountAmount
              ).toFixed(2),
              taxTypeId: item.taxTypeId,
              serialNumber: item.serialNumber,
            })),
          };
          const offlineRef = `OFFLINE-${Date.now().toString().slice(-6)}`;
          let fiscalData: any = {};
          let posRef = offlineRef;
          
          if (isFiscalized) {
            try {
              const zimraConfig = await getCachedZimraConfig(companyId);
              const fiscalSequence = await refreshCachedFiscalSequence(companyId);
              if (zimraConfig?.zimraPrivateKey && fiscalSequence) {
                const nextGlobalNo = fiscalSequence.lastReceiptGlobalNo + 1;
                const nextDailyCount = fiscalSequence.dailyReceiptCount + 1;
                const dateObj = new Date();
                const dateLocal = new Date(dateObj.getTime() - (dateObj.getTimezoneOffset() * 60000));
                const receiptDate = dateLocal.toISOString().slice(0, 19);

                const taxesMap = new Map<number, any>();
                for (const item of payload.items) {
                  const taxId = item.taxTypeId || 1;
                  const taxRate = Number(item.taxRate);
                  const lineTotal = Number(item.lineTotal);
                  const taxAmount = taxInclusive ? Number((lineTotal - (lineTotal / (1 + (taxRate / 100)))).toFixed(2)) : Number((lineTotal * (taxRate / 100)).toFixed(2));
                  const salesWithTax = taxInclusive ? lineTotal : Number((lineTotal + taxAmount).toFixed(2));
                  
                  if (!taxesMap.has(taxId)) {
                    taxesMap.set(taxId, { taxID: taxId, taxCode: resolveTaxCode(taxId), taxPercent: taxRate, taxAmount: 0, salesAmountWithTax: 0 });
                  }
                  const t = taxesMap.get(taxId);
                  t.taxAmount = Number((t.taxAmount + taxAmount).toFixed(2));
                  t.salesAmountWithTax = Number((t.salesAmountWithTax + salesWithTax).toFixed(2));
                }

                const receiptDataParams = {
                  receiptType: "FISCALINVOICE",
                  receiptCurrency: selectedCurrencyCode,
                  receiptGlobalNo: nextGlobalNo,
                  receiptDate: receiptDate,
                  receiptTotal: Number(total),
                  receiptTaxes: Array.from(taxesMap.values())
                };

                const offlineSig = generateOfflineFiscalData({
                  receiptData: receiptDataParams,
                  previousReceiptHash: fiscalSequence.lastFiscalHash,
                  deviceId: zimraConfig.fdmsDeviceId,
                  privateKeyPem: zimraConfig.zimraPrivateKey
                });

                fiscalData = {
                  receiptGlobalNo: nextGlobalNo,
                  receiptCounter: nextDailyCount,
                  fiscalSignature: offlineSig.signature,
                  receiptDeviceSignature: offlineSig.hash,
                  qrCodeData: zimraConfig.qrUrl ? `${zimraConfig.qrUrl}?verify=${offlineSig.verificationCode}` : null
                };

                posRef = `${nextGlobalNo}`;

                await cacheFiscalSequence(companyId, {
                  ...fiscalSequence,
                  lastReceiptGlobalNo: nextGlobalNo,
                  dailyReceiptCount: nextDailyCount,
                  lastFiscalHash: offlineSig.hash
                });
              }
            } catch (e) {
              console.error("Failed to generate offline fiscal signature in catch block", e);
            }
          }

          const payloadToQueue = { ...payload, ...fiscalData };
          const offlineId = await addPendingSale(
            companyId,
            payloadToQueue,
            selectedBranchId,
          );
          
          const offInvoice = {
            id: offlineId,
            ...payloadToQueue,
            _offline: true,
            invoiceNumber: posRef,
            customerReference: posRef,
            paymentAmount: sumTenders,
            change: sumTenders - (total * exchangeRate),
          };
          if (posSettings.printingEnabled) {
            setLastSuccessfulInvoice(offInvoice);
          } else {
            toast({
              title: "Sale Queued Offline",
              description: `Connection lost. Pending sale ${offlineId} was saved locally and will sync when online.`,
            });
            setActiveView("products");
          }
          prepareNextSaleImmediately();
          clearPersistedSession();

          // Register Background Sync
          if ("serviceWorker" in navigator && "SyncManager" in window) {
            runOnIdle(() => {
              navigator.serviceWorker.ready
                .then((reg) => {
                  return (reg as any).sync.register("sync-sales");
                })
                .catch((err) =>
                  console.error("[Sync] Registration failed:", err),
                );
            });
          }

          runOnIdle(() => {
            refreshPendingCount().catch((err) =>
              console.error("[POS] refreshPendingCount failed:", err),
            );
          });
          return;
        } catch (offlineError) {
          toast({
            title: "Error",
            description: "Failed to save sale offline",
            variant: "destructive",
          });
          return;
        }
      }
      // Handle NO_ACTIVE_SHIFT error specifically
      if (
        error.message?.includes("No active shift") ||
        error.code === "NO_ACTIVE_SHIFT"
      ) {
        toast({
          title: "Shift Required",
          description: "Please open a shift before processing sales",
          variant: "destructive",
        });
        // Prompt user to open shift
        setShiftModalType("OPEN");
        setIsShiftModalOpen(true);
      } else if (
        error.name === "AbortError" ||
        error.message?.includes("aborted")
      ) {
        toast({
          title: "Request Timed Out",
          description:
            "The request took too long or was interrupted. Please check your connection and try again.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Error",
          description: error.message || "Could not process transaction",
          variant: "destructive",
        });
      }
    } finally {
      isProcessingRef.current = false;
      setIsProcessing(false);
    }
  };

  const holdOrder = async () => {
    if (cart.length === 0) return;
    try {
      if (isOnline) {
        const res = await apiFetch("/api/pos/holds", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            companyId,
            cartData: cart,
            holdName: `Hold ${new Date().toLocaleTimeString()}`,
          }),
        });
        if (!res.ok) throw new Error("Failed to hold sale");
      } else {
        // Offline hold
        await addOfflineHold(
          companyId,
          cart,
          selectedCustomerId,
          `Hold ${new Date().toLocaleTimeString()}`,
        );
      }

      setCart([]);
      setSelectedCustomerId("");
      toast({
        title: isOnline ? "Held" : "Held (Offline)",
        description: "Sale parked successfully",
      });
      fetchHeldSales();
    } catch (e: any) {
      // Fallback to offline if API fails
      try {
        await addOfflineHold(
          companyId,
          cart,
          selectedCustomerId,
          `Hold ${new Date().toLocaleTimeString()}`,
        );
        setCart([]);
        setSelectedCustomerId("");
        toast({
          title: "Held (Offline)",
          description: "Connection lost. Sale parked locally.",
        });
        fetchHeldSales();
      } catch (offlineErr) {
        toast({
          title: "Error",
          description: "Failed to hold sale",
          variant: "destructive",
        });
      }
    }
  };

  const resumeHold = async (hold: any) => {
    try {
      if (hold._offline) {
        await removeOfflineHold(hold.id);
      } else if (isOnline) {
        const res = await apiFetch(`/api/pos/holds/${hold.id}`, {
          method: "DELETE",
        });
        if (!res.ok) throw new Error("Failed to remove hold");
      } else {
        toast({
          title: "Online Hold",
          description: "Must be online to resume cloud holds",
          variant: "destructive",
        });
        return;
      }

      setCart(hold.cartData);
      setSelectedCustomerId(hold.customerId?.toString() || "");
      setIsHoldsModalOpen(false);
      fetchHeldSales();
    } catch (e) {
      toast({
        title: "Error",
        description: "Failed to resume sale",
        variant: "destructive",
      });
    }
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch((e) => {
        toast({
          title: "Fullscreen Error",
          description: "Your browser blocked fullscreen mode.",
          variant: "destructive",
        });
      });
      setIsFullscreen(true);
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
        setIsFullscreen(false);
      }
    }
  };

  useEffect(() => {
    const handleFullscreenChange = () =>
      setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () =>
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  // Sync Settings from Company
  useEffect(() => {
    const src = company;
    if (src?.posSettings) {
      const settings = src.posSettings as any;
      setPosSettings((prev) => ({
        ...prev,
        printingEnabled: settings.printingEnabled ?? true,
        autoPrint: settings.autoPrint ?? true,
        silentPrinting: settings.silentPrinting ?? true,
        printServerUrl: settings.printServerUrl || "http://localhost:12312",
        printerName: prev.printerName || settings.printerName || "",
        secondaryPrinterName:
          prev.secondaryPrinterName || settings.secondaryPrinterName || "",
        nativeEscPos: prev.nativeEscPos || (settings.nativeEscPos ?? false),
        printerWidth: settings.printerWidth ?? prev.printerWidth,
        cashDrawerEnabled: settings.cashDrawerEnabled ?? false,
        quantityDecimalPlaces: settings.quantityDecimalPlaces ?? 2,
        variableWeightBarcodeRules:
          settings.variableWeightBarcodeRules ??
          prev.variableWeightBarcodeRules,
      }));
    }
  }, [company]);

  // Auto-Print Effect: Optimized for speed
  useEffect(() => {
    if (
      lastSuccessfulInvoice &&
      posSettings.printingEnabled &&
      posSettings.autoPrint
    ) {
      // Check if we have fiscal data. If not, queue for background printing.
      const hasFiscalData =
        !isFiscalized || isInvoiceReadyForPrint(lastSuccessfulInvoice);

      if (!hasFiscalData) {
        console.warn(
          `[POS] Fiscal data not ready on immediate response for invoice ${lastSuccessfulInvoice.id}; attempting one immediate refresh before printing.`,
        );
        (async () => {
          let invoiceToPrint = lastSuccessfulInvoice;
          try {
            const res = await apiFetch(
              `/api/invoices/${lastSuccessfulInvoice.id}`,
            );
            if (res.ok) {
              const contentType = res.headers.get("content-type") || "";
              if (contentType.includes("application/json")) {
                invoiceToPrint = await res.json();
              }
            }
          } catch (err) {
            console.warn(
              `[POS] Immediate fiscal refresh failed for invoice ${lastSuccessfulInvoice.id}:`,
              err,
            );
          }

          if (!isInvoiceReadyForPrint(invoiceToPrint)) {
            console.warn(
              `[POS] Printing invoice ${invoiceToPrint.invoiceNumber || invoiceToPrint.id} without fiscal fields.`,
            );
          }

          handleSilentPrint(invoiceToPrint, {
            suppressNotifications: true,
          }).catch(console.error);
        })();
        setLastSuccessfulInvoice(null);
        setActiveView("products");
        return;
      }

      // Always use native ESC/POS — no window.print() fallback
      handleSilentPrint(undefined, { suppressNotifications: true }).catch(
        console.error,
      );
      setLastSuccessfulInvoice(null);
      setActiveView("products");
    }
  }, [
    lastSuccessfulInvoice,
    posSettings.printingEnabled,
    posSettings.autoPrint,
    isFiscalized,
    isInvoiceReadyForPrint,
  ]);

  // 🚀 Background Print Queue Worker
  useEffect(() => {
    if (pendingPrintQueue.length === 0) return;

    const pollInterval = setInterval(async () => {
      const currentQueue = [...pendingPrintQueue];
      for (const invoiceId of currentQueue) {
        try {
          const res = await apiFetch(`/api/invoices/${invoiceId}`);
          if (!res.ok) {
            if (
              res.status === 404 ||
              res.status === 401 ||
              res.status === 403
            ) {
              console.warn(
                `[POS] Background Printing: removing invoice ${invoiceId} from queue (status ${res.status})`,
              );
              setPendingPrintQueue((prev) =>
                prev.filter((id) => id !== invoiceId),
              );
              delete pendingPrintEnqueuedAtRef.current[invoiceId];
            }
            continue;
          }

          const contentType = res.headers.get("content-type") || "";
          if (!contentType.includes("application/json")) {
            const payload = await res.text();
            throw new Error(
              `[POS] Background print expected JSON for invoice ${invoiceId}, got "${contentType}" (${payload.slice(0, 120)})`,
            );
          }

          const invoice = await res.json();

          if (isInvoiceReadyForPrint(invoice)) {
            console.log(
              `[POS] Background Printing: Invoice ${invoiceId} ready! Printing now...`,
            );

            // Trigger print
            handleSilentPrint(invoice, { suppressNotifications: true }).catch(
              console.error,
            );

            // Remove from queue
            setPendingPrintQueue((prev) =>
              prev.filter((id) => id !== invoiceId),
            );
            delete pendingPrintEnqueuedAtRef.current[invoiceId];

            if (
              (invoice.fdmsStatus || "").toString().toLowerCase() === "failed"
            ) {
              console.warn(
                `[POS] Invoice ${invoice.invoiceNumber} printed but fiscalization failed.`,
              );
            }
          } else {
            const enqueuedAt =
              pendingPrintEnqueuedAtRef.current[invoiceId] ?? Date.now();
            const waitedMs = Date.now() - enqueuedAt;
            if (waitedMs >= BACKGROUND_PRINT_MAX_WAIT_MS) {
              console.warn(
                `[POS] Background Printing: Invoice ${invoiceId} timed out waiting for ZIMRA after ${Math.round(waitedMs / 1000)}s. Printing fallback receipt.`,
              );
              handleSilentPrint(invoice, { suppressNotifications: true }).catch(
                console.error,
              );
              setPendingPrintQueue((prev) =>
                prev.filter((id) => id !== invoiceId),
              );
              delete pendingPrintEnqueuedAtRef.current[invoiceId];
              console.warn(
                `[POS] Printed invoice ${invoice.invoiceNumber || invoiceId} after timeout waiting for fiscal fields.`,
              );
            }
          }
        } catch (err) {
          console.warn(
            `[POS] Background Print Loop Error for invoice ${invoiceId}:`,
            err,
          );
        }
      }
    }, 2000); // Poll every 2 seconds

    return () => clearInterval(pollInterval);
  }, [pendingPrintQueue, companyId, posSettings, isInvoiceReadyForPrint]);

  // Fetch available printers when POS loads
  useEffect(() => {
    const fetchPrinters = async () => {
      try {
        if (window.electronAPI) {
          const data = await window.electronAPI.getPrinters();
          setAvailablePrinters(Array.isArray(data) ? data : []);
        } else {
          const response = await fetch(
            `${posSettings.printServerUrl}/printers`,
          );
          if (response.ok) {
            const data = await response.json();
            setAvailablePrinters(Array.isArray(data) ? data : []);
          }
        }
      } catch (error) {
        console.error("Failed to fetch printers:", error);
      }
    };
    fetchPrinters();
  }, [isSettingsOpen, posSettings.printServerUrl]);

  // Persist local printer selection & paper size override
  useEffect(() => {
    if (posSettings.printerName) {
      localStorage.setItem("pos_printer_name", posSettings.printerName);
    } else {
      localStorage.removeItem("pos_printer_name");
    }

    if (posSettings.secondaryPrinterName) {
      localStorage.setItem(
        "pos_secondary_printer_name",
        posSettings.secondaryPrinterName,
      );
    } else {
      localStorage.removeItem("pos_secondary_printer_name");
    }

    if (posSettings.paperSize) {
      localStorage.setItem("pos_paper_size", posSettings.paperSize);
    } else {
      localStorage.removeItem("pos_paper_size");
    }
  }, [
    posSettings.printerName,
    posSettings.secondaryPrinterName,
    posSettings.paperSize,
  ]);

  // Persist local toggles
  useEffect(() => {
    localStorage.setItem(
      "pos_auto_print",
      posSettings.autoPrint ? "true" : "false",
    );
    localStorage.setItem("pos_terminal_id", posSettings.terminalId);
    localStorage.setItem(
      "pos_silent_printing",
      posSettings.silentPrinting ? "true" : "false",
    );
    localStorage.setItem("pos_print_server", posSettings.printServerUrl);
    localStorage.setItem(
      "pos_native_esc_pos",
      posSettings.nativeEscPos ? "true" : "false",
    );
    localStorage.setItem(
      "pos_simulation_mode",
      posSettings.simulationMode ? "true" : "false",
    );
    localStorage.setItem(
      "pos_printer_width",
      posSettings.printerWidth.toString(),
    );
    localStorage.setItem(
      "pos_cash_drawer",
      posSettings.cashDrawerEnabled ? "true" : "false",
    );
    localStorage.setItem(
      "pos_quantity_decimals",
      posSettings.quantityDecimalPlaces.toString(),
    );
  }, [
    posSettings.autoPrint,
    posSettings.terminalId,
    posSettings.silentPrinting,
    posSettings.printServerUrl,
    posSettings.cashDrawerEnabled,
    posSettings.quantityDecimalPlaces,
  ]);

  const handleSilentPrint = async (
    invOverride?: any,
    options?: { suppressNotifications?: boolean; elementId?: string },
  ) => {
    const suppressNotifications = options?.suppressNotifications ?? false;
    const targetElementId = options?.elementId || "silent-receipt-48";
    const notify = (args: Parameters<typeof toast>[0]) => {
      if (!suppressNotifications) toast(args);
    };
    const inv = invOverride || lastSuccessfulInvoice;
    if (!inv) return;

    const isTestPrint = inv._testPrint === true;
    const logPrefix = isTestPrint ? "[TEST PRINT]" : "[PRINT]";

    console.group(
      `%c${logPrefix} Starting print job`,
      "color: #6366f1; font-weight: bold; font-size: 12px",
    );
    console.log("Invoice:", inv.invoiceNo || inv.id);
    console.log("Settings:", {
      nativeEscPos: posSettings.nativeEscPos,
      printerName: posSettings.printerName || "(default)",
      secondaryPrinterName: posSettings.secondaryPrinterName || "(disabled)",
      printerWidth: posSettings.printerWidth,
      autoCut: posSettings.autoCut,
      feedLines: posSettings.feedLines,
      openDrawerOnPrint: posSettings.openDrawerOnPrint,
      doubleHeightHeader: posSettings.doubleHeightHeader,
      printServerUrl: posSettings.printServerUrl,
      useElectron: !!(window as any).electronAPI,
    });
    const printersToPrint = Array.from(
      new Set([
        posSettings.printerName || "",
        posSettings.secondaryPrinterName || "",
      ]),
    );

    // --- Native ESC/POS Printing ---
    // Test prints always use this path (they have their own data, no DOM element needed).
    if (posSettings.nativeEscPos || isTestPrint) {
      console.log(`%c${logPrefix} → Path: Native ESC/POS`, "color: #6366f1");
      if (isTestPrint && !posSettings.nativeEscPos) {
        console.log(
          `%c${logPrefix} → (nativeEscPos is OFF but this is a test — using ESC/POS encoder anyway)`,
          "color: #f59e0b",
        );
      }
      try {
        console.log(
          `%c${logPrefix} → Encoding receipt bytes...`,
          "color: #94a3b8",
        );
        // Normalize items — API may return them as different keys depending on endpoint
        const invItems = inv.items || inv.lineItems || inv.invoiceItems || [];
        const encoded = ReceiptTemplate.formatFiscalReceipt(
          {
            company: resolvedCompany || {
              name: "TEST COMPANY",
              tin: "123456789",
              vatNumber: "VAT001",
            },
            branch: company?.branches?.find(
              (b: any) => b.id === (inv.branchId || selectedBranchId),
            ),
            invoice: inv,
            customer: resolvedCustomers?.find(
              (c: any) => c.id === inv.customerId,
            ),
            items: invItems,
            user: user,
          },
          {
            width: posSettings.printerWidth,
            autoCut: posSettings.autoCut,
            feedLines: posSettings.feedLines,
            openDrawer: posSettings.openDrawerOnPrint,
            doubleHeightHeader: posSettings.doubleHeightHeader,
          },
        );
        console.log(
          `%c${logPrefix} → Encoded ${encoded.byteLength} bytes`,
          "color: #22c55e",
        );

        const transport = (window as any).electronAPI
          ? "Electron IPC"
          : `Print Agent (${posSettings.printServerUrl})`;
        console.log(
          `%c${logPrefix} → Sending via: ${transport}`,
          "color: #94a3b8",
        );

        const success = await PrinterService.printRaw(encoded, {
          useElectron: !!(window as any).electronAPI,
          printServerUrl:
            posSettings.printServerUrl ||
            (companyId ? `http://localhost:3001` : undefined),
          printerName: posSettings.printerName || undefined,
        });
        const secondaryPrinter = (
          posSettings.secondaryPrinterName || ""
        ).trim();
        const primaryPrinter = (posSettings.printerName || "").trim();

        if (success) {
          if (secondaryPrinter && secondaryPrinter !== primaryPrinter) {
            const encodedSecond = ReceiptTemplate.formatFiscalReceipt(
              {
                company: resolvedCompany || {
                  name: "TEST COMPANY",
                  tin: "123456789",
                  vatNumber: "VAT001",
                },
                branch: company?.branches?.find(
                  (b: any) => b.id === (inv.branchId || selectedBranchId),
                ),
                invoice: inv,
                customer: resolvedCustomers?.find(
                  (c: any) => c.id === inv.customerId,
                ),
                items: invItems,
                user: user,
              },
              {
                width: posSettings.printerWidth,
                autoCut: posSettings.autoCut,
                feedLines: posSettings.feedLines,
                openDrawer: false,
                doubleHeightHeader: posSettings.doubleHeightHeader,
              },
            );
            await PrinterService.printRaw(encodedSecond, {
              useElectron: !!(window as any).electronAPI,
              printServerUrl:
                posSettings.printServerUrl ||
                (companyId ? `http://localhost:3001` : undefined),
              printerName: secondaryPrinter,
            });
          }
          console.log(
            `%c${logPrefix} ✓ Print job accepted by driver`,
            "color: #22c55e; font-weight: bold",
          );
          console.groupEnd();
          const printerCount =
            secondaryPrinter && secondaryPrinter !== primaryPrinter ? 2 : 1;
          notify({
            title: isTestPrint ? "Test Print Sent" : "Printed",
            description: `Native ESC/POS print job successful (${printerCount} printer${printerCount > 1 ? "s" : ""})`,
          });
          return;
        } else {
          console.warn(
            `%c${logPrefix} ✗ Driver returned false — printer unreachable`,
            "color: #ef4444",
          );
          console.groupEnd();
          notify({
            title: "Print Failed",
            description:
              "Could not reach USB printer, Electron API, or Print Agent. Check connections.",
            variant: "destructive",
          });
        }
      } catch (err: any) {
        console.error(
          `%c${logPrefix} ✗ Exception thrown:`,
          "color: #ef4444; font-weight: bold",
          err,
        );
        console.groupEnd();
        notify({
          title: "Print Error",
          description: err.message,
          variant: "destructive",
        });
      }
      return;
    }

    console.log(`%c${logPrefix} → Path: HTML / Print Agent`, "color: #f59e0b");

    let receiptElement = document.getElementById(targetElementId);
    console.log(
      `%c${logPrefix} → Looking for DOM receipt element #${targetElementId}`,
      "color: #94a3b8",
    );

    // Retry logic if element is not yet in DOM
    if (!receiptElement) {
      console.warn(
        `%c${logPrefix} → Element not found yet, retrying up to 5 times...`,
        "color: #f59e0b",
      );
      for (let i = 0; i < 5; i++) {
        await new Promise((resolve) => setTimeout(resolve, 200));
        receiptElement = document.getElementById(targetElementId);
        if (receiptElement) break;
      }
    }

    if (!receiptElement) {
      notify({
        title: "Print Error",
        description: "Receipt element not found. Please try again.",
        variant: "destructive",
      });
      console.error(
        `%c${logPrefix} ✗ DOM element still not found after retries`,
        "color: #ef4444",
      );
      console.groupEnd();
      return;
    }

    console.log(
      `%c${logPrefix} → Receipt element found, building HTML...`,
      "color: #94a3b8",
    );
    try {
      // Grab all styles from current page so Tailwind classes work in hidden window
      const styles = Array.from(
        document.querySelectorAll('style, link[rel="stylesheet"]'),
      )
        .map((s) => {
          if (s.tagName === "LINK")
            return `<link rel="stylesheet" href="${(s as HTMLLinkElement).href}">`;
          return s.outerHTML;
        })
        .join("");
      const receiptHtml = receiptElement.outerHTML;
      const html = `<!DOCTYPE html><html><head><meta charset="utf-8">${styles}</head><body class="bg-white p-0 m-0" style="margin:0;padding:0;">${receiptHtml}</body></html>`;

      const htmlTargets = printersToPrint.length > 0 ? printersToPrint : [""];

      for (const pName of htmlTargets) {
        const targetPrinter = pName || undefined;

        if (window.electronAPI) {
          console.log(
            `%c${logPrefix} → Sending to Electron: printer="${targetPrinter || "default"}"`,
            "color: #94a3b8",
          );
          await window.electronAPI.printReceipt(html, targetPrinter);
          console.log(
            `%c${logPrefix} ✓ Electron printReceipt call dispatched`,
            "color: #22c55e",
          );
        } else {
          const printController = new AbortController();
          const printTimeout = setTimeout(() => printController.abort(), 60000);

          try {
            const response = await fetch(
              `${posSettings.printServerUrl}/print`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  html,
                  printerName: targetPrinter,
                }),
                signal: printController.signal,
              },
            );

            if (!response.ok) {
              const err = await response.json();
              throw new Error(err.error || "Failed to send print job");
            }
          } finally {
            clearTimeout(printTimeout);
          }
        }
      }

      console.log(
        `%c${logPrefix} ✓ All printers dispatched`,
        "color: #22c55e; font-weight: bold",
      );
      console.groupEnd();
      notify({
        title: "Sent to Printer(s)",
        description: `Print job sent to ${htmlTargets.length} printer(s).`,
      });
    } catch (error: any) {
      console.error(
        `%c${logPrefix} ✗ Exception:`,
        "color: #ef4444; font-weight: bold",
        error,
      );
      console.groupEnd();
      notify({
        title: "Print Failed",
        description:
          "Print server not reachable or error occurred. Is the middleware running?",
        variant: "destructive",
      });
      // Fallback to manual print if it fails?
      // window.print();
    }
  };

  // Set Default Customer
  useEffect(() => {
    const settings = company?.posSettings as any;
    if (settings?.defaultCustomerId && !selectedCustomerId && customers) {
      // Only set if exists in customers list
      const exists = resolvedCustomers.find(
        (c: any) => c.id.toString() === settings.defaultCustomerId,
      );
      if (exists) {
        setSelectedCustomerId(settings.defaultCustomerId);
      }
    }
  }, [company, customers, selectedCustomerId]);

  // Auto-select valid payment method
  useEffect(() => {
    const settings = company?.posSettings as any;
    const allowed = settings?.allowedPaymentMethods;

    if (allowed && allowed.length > 0) {
      if (!allowed.includes(paymentMethod)) {
        setPaymentMethod(allowed[0]);
      }
    }
  }, [company, paymentMethod]);

  useEffect(() => {
    fetchHeldSales();
    fetchShift();
  }, [companyId]);

  const handleOrderDiscountChange = (val: string) => {
    const amount = parseFloat(val) || 0;
    const settings = company?.posSettings as any;

    // Logic: Require override if enabled in settings OR if discount is high
    if (
      settings?.requireOverrideForDiscount ||
      (amount > 0 && subtotal > 0 && amount > subtotal * 0.1)
    ) {
      setPendingOverride({ type: "DISCOUNT", data: amount });
    } else {
      setOrderDiscount(amount);
    }
  };

  const handleClearCart = () => {
    if (cart.length === 0) return;
    const settings = company?.posSettings as any;

    if (settings?.requireOverrideForDelete) {
      setPendingOverride({ type: "VOID_CART", data: null });
    } else {
      setCart([]);
      setOrderDiscount(0);
      resetToDefaultCustomer();
    }
  };

  // ── Reprint receipts ─────────────────────────────────────────────────────
  const handleReprintLast = async () => {
    setIsReprintOpen(true);
    setReprintListLoading(true);
    setReprintList([]);
    try {
      const res = await apiFetch(
        `/api/pos/last-receipt?companyId=${companyId}`,
      );
      if (res.ok) setReprintList(await res.json());
      else
        toast({ title: "No receipts found for today", variant: "destructive" });
    } catch {
      toast({ title: "Failed to load receipts", variant: "destructive" });
    }
    setReprintListLoading(false);
  };

  // ── Credit / Debit Note search ────────────────────────────────────────────
  const handleCnSearch = async (queryOverride?: string) => {
    const q = typeof queryOverride === 'string' ? queryOverride : cnSearchQuery;
    setCnSearching(true);
    try {
      const res = await apiFetch(
        `/api/pos/invoice-search?companyId=${companyId}&q=${encodeURIComponent(q)}`,
      );
      if (res.ok) setCnSearchResults(await res.json());
    } catch {
      /* ignore */
    }
    setCnSearching(false);
  };

  useEffect(() => {
    if (isCreditNoteOpen) {
      handleCnSearch("");
    }
  }, [isCreditNoteOpen]);

  const handleSelectInvoiceForReturn = async (inv: any) => {
    setCnProcessing(true);
    try {
      const res = await apiFetch(`/api/invoices/${inv.id}`);
      if (res.ok) {
        const fullInv = await res.json();
        setCnActiveInvoice(fullInv);
        setCnSelectedItems(
          fullInv.items.map((it: any) => ({
            productId: it.productId,
            quantity: Number(it.quantity),
            originalItem: it,
          })),
        );
      }
    } catch {
      toast({
        title: "Error",
        description: "Could not fetch invoice details",
        variant: "destructive",
      });
    }
    setCnProcessing(false);
  };

  const handleIssueItemizedReturn = async () => {
    setCnProcessing(true);
    try {
      const itemsToReturn = cnSelectedItems
        .filter((s) => s.quantity > 0)
        .map((s) => {
          const originalLineTotal =
            Number(s.originalItem.unitPrice) * s.quantity;
          return {
            ...s.originalItem,
            quantity: s.quantity.toString(),
            lineTotal: originalLineTotal.toString(),
          };
        });

      if (itemsToReturn.length === 0) {
        toast({
          title: "Empty Return",
          description: "Select at least one item to return",
          variant: "destructive",
        });
        setCnProcessing(false);
        return;
      }

      if (!cnReason.trim()) {
        toast({
          title: "Reason Required",
          description: `Please provide a reason for this ${cnType === "credit" ? "Credit" : "Debit"} Note.`,
          variant: "destructive",
        });
        setCnProcessing(false);
        return;
      }

      const endpoint = `/api/invoices/${cnActiveInvoice?.id}/${cnType === "credit" ? "credit-note" : "debit-note"}`;
      const res = await apiFetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: itemsToReturn, reason: cnReason }),
      });

      if (!res.ok) {
        const err = await res.json();
        toast({
          title: "Failed",
          description: err.message,
          variant: "destructive",
        });
        setCnProcessing(false);
        return;
      }
      const note = await res.json();
      toast({
        title:
          cnType === "credit" ? "Credit Note Created" : "Debit Note Created",
        description: `${note.invoiceNumber} — issued successfully`,
      });
      setIsCreditNoteOpen(false);
      setCnSearchQuery("");
      setCnSearchResults([]);
      setCnActiveInvoice(null);
      setCnReason("");
      // Show receipt for the note
      setReprintInvoice({ ...note, originalInvoice: cnActiveInvoice });
    } catch {
      toast({
        title: "Error",
        description: "Could not create note",
        variant: "destructive",
      });
    }
    setCnProcessing(false);
  };

  // ── X / Z Report ─────────────────────────────────────────────────────────
  const handleLoadReport = async (type: "x" | "z") => {
    if (type === "z" && !canViewZReport) {
      const needsClose: string[] = [];
      if (currentShift) needsClose.push("the open shift");
      if (isFiscalDayOpen) needsClose.push("the fiscal day");
      const confirmClose = window.confirm(
        `Z-Report is only available after closing ${needsClose.join(" and ")}.\n\nDo you want to close now?`,
      );
      if (!confirmClose) return;

      if (currentShift) {
        setShiftModalType("CLOSE");
        setShiftBalance("");
        setIsShiftModalOpen(true);
        toast({
          title: "Close Shift Required",
          description:
            "Close the active shift first, then generate the Z-Report.",
        });
        return;
      }

      if (isFiscalDayOpen) {
        try {
          const closeRes = await apiFetch(
            `/api/companies/${companyId}/zimra/day/close`,
            {
              method: "POST",
            },
          );
          if (!closeRes.ok) {
            const err = await closeRes.json().catch(() => null);
            throw new Error(err?.message || "Failed to close fiscal day");
          }
          toast({
            title: "Fiscal Day Closed",
            description: "Generating Z-Report now.",
          });
        } catch (closeErr: any) {
          toast({
            title: "Closure Scheduled",
            description: "Your day closure is processing quietly in the background.",
          });
          return;
        }
      }
    }

    setReportType(type);
    setReportLoading(true);
    setReportData(null);
    setIsItemizedExpanded(true);
    setIsReportOpen(true);
    try {
      const today = new Date().toISOString().split("T")[0];
      let reportGenerated = false;

      if (isOnline) {
        try {
          const res = await apiFetch(
            `/api/companies/${companyId}/reports/fiscal-data?date=${today}`,
          );
          if (!res.ok) {
            const err = await res.json();
            throw new Error(err.message);
          } else {
            setReportData(await res.json());
            reportGenerated = true;
          }
        } catch (apiErr: any) {
          console.warn("[Report] API fetch failed, falling back to local DB:", apiErr.message);
        }
      }

      if (!reportGenerated) {
        // Offline native calculation
        const localData = await generateOfflineReport(companyId, today);
        setReportData(localData);
        if (!isOnline) {
          toast({
            title: "Offline Report Generated",
            description: "Calculated natively using locally cached sales.",
          });
        }
      }
    } catch (e: any) {
      setReportData({ error: e.message });
    }
    setReportLoading(false);
  };
  // ─────────────────────────────────────────────────────────────────────────

  const handleOverrideSuccess = (manager: any) => {
    if (!pendingOverride) return;

    if (pendingOverride.type === "DISCOUNT") {
      setOrderDiscount(pendingOverride.data);
      toast({
        title: "Discount Authorized",
        description: `Approved by ${manager.name}`,
      });
    } else if (pendingOverride.type === "VOID_CART") {
      setCart([]);
      setOrderDiscount(0);
      resetToDefaultCustomer();
      toast({
        title: "Cart Cleared",
        description: `Void approved by ${manager.name}`,
      });
    } else if (pendingOverride.type === "REMOVE_ITEM") {
      const productId = pendingOverride.data;
      setCart((prev) => prev.filter((item) => item.productId !== productId));
      toast({
        title: "Item Removed",
        description: `Approved by ${manager.name}`,
      });
    } else if (pendingOverride.type === "PRICE_CHANGE") {
      const { productId, price } = pendingOverride.data;
      setCart((prev) =>
        prev.map((item) =>
          item.productId === productId ? { ...item, price } : item,
        ),
      );
      toast({
        title: "Price Updated",
        description: `Approved by ${manager.name}`,
      });
    } else if (pendingOverride.type === "OPEN_DRAWER") {
      toast({
        title: "Drawer Opened",
        description: `Approved by ${manager.name}`,
      });
      // triggerOpenDrawer();
    } else if (pendingOverride.type === "TOGGLE_FISCAL") {
      setIsFiscalized((prev) => !prev);
      toast({
        title: "Fiscal Mode Updated",
        description: `Authorized by ${manager.name}`,
      });
    } else if (pendingOverride.type === "VIEW_REPORT") {
      handleLoadReport(pendingOverride.data);
    } else if (pendingOverride.type === "VIEW_MY_SALES") {
      setIsMySalesPinAuthorized(true);
    } else if (pendingOverride.type === "END_SESSION") {
      setShiftModalType("CLOSE");
      setShiftBalance("");
      setIsShiftModalOpen(true);
    }
    setPendingOverride(null);
  };

  // Tactile Numpad Component
  function Numpad({
    value,
    onChange,
    onEnter,
  }: {
    value: string;
    onChange: (val: string) => void;
    onEnter?: () => void;
  }) {
    const buttons = [
      "1",
      "2",
      "3",
      "4",
      "5",
      "6",
      "7",
      "8",
      "9",
      "0",
      ".",
      "DEL",
    ];
    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-1 p-1 md:p-2 bg-slate-50/50 rounded-xl border border-slate-100">
        {buttons.map((btn) => (
          <Button
            key={btn}
            variant="ghost"
            className={cn(
              "h-7 md:h-10 font-black text-[10px]  rounded-lg transition-all active:scale-95",
              btn === "DEL"
                ? "text-red-500 hover:bg-red-50"
                : "bg-white shadow-sm border border-slate-200/50 text-slate-700 hover:bg-slate-50",
            )}
            onClick={() => {
              if (btn === "DEL") onChange(value.slice(0, -1));
              else if (btn === "." && value.includes(".")) return;
              else onChange(value + btn);
            }}
          >
            {btn}
          </Button>
        ))}
      </div>
    );
  }

  // Sub-component defined inside to have access to POSPage state
  function CartSection() {
    return (
      <div className="flex flex-col h-full bg-white relative overflow-hidden">
        {/* Premium Cart Header */}
        <div className="pt-6 pb-3 px-6 border-b border-slate-100 flex items-center justify-between shrink-0 bg-white z-10 sticky top-0">
          <div className="flex flex-col">
            <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
              Current Order
            </h3>
            <p className="text-[11px] uppercase tracking-widest text-slate-400 font-black">
              ID: #POS-{new Date().getTime().toString().slice(-6)}
            </p>
          </div>
          <Badge
            variant="secondary"
            className="bg-primary/5 text-primary font-black border-none px-3 py-1 text-xs rounded-lg"
          >
            {cart
              .reduce((a, b) => a + b.quantity, 0)
              .toFixed(posSettings.quantityDecimalPlaces)}{" "}
            Items
          </Badge>
        </div>

        {/* Customer Selector - changeable from the order summary */}
        <div className="px-3 py-2 shrink-0 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <User className="h-4 w-4" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">
                Customer
              </p>
              <p className="text-xs font-black text-slate-800 truncate">
                {resolvedCustomers?.find(
                  (c: any) => c.id.toString() === selectedCustomerId,
                )?.name || "Guest"}
              </p>
            </div>
            <Select
              value={selectedCustomerId}
              onValueChange={setSelectedCustomerId}
            >
              <SelectTrigger
                className="h-8 w-auto gap-1 border-none bg-slate-100 hover:bg-slate-200 rounded-lg px-2 font-black text-[11px]"
                title="Change customer"
              >
                <span className="max-w-[70px] truncate">Change</span>
                <ChevronDown className="h-3 w-3" />
              </SelectTrigger>
              <SelectContent className="rounded-xl border-slate-200 shadow-2xl">
                {resolvedCustomers?.map((c: any) => (
                  <SelectItem
                    key={c.id}
                    value={c.id.toString()}
                    className="focus:bg-primary/5 rounded-lg py-2.5"
                  >
                    <div className="font-bold text-slate-700">{c.name}</div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-lg bg-slate-100 text-slate-600 hover:text-emerald-600"
              title="Select Walk-in"
              onClick={() => {
                const walkIn = resolvedCustomers?.find(
                  (c: any) =>
                    c.name.toLowerCase().includes("walk-in") ||
                    c.name.toLowerCase().includes("cash"),
                );
                if (walkIn) setSelectedCustomerId(walkIn.id.toString());
                else
                  toast({
                    title: "No Walk-in Customer",
                    description: "Create 'Walk-in' first.",
                  });
              }}
            >
              <UserPlus className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <ScrollArea className="flex-1 px-3 py-3 overflow-y-auto">
          {cart.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-[300px] text-slate-300">
              <ShoppingCart className="h-8 w-8 opacity-20 mb-3" />
              <p className="text-xs font-black text-slate-400">Cart is Empty</p>
            </div>
          ) : (
            <div className="space-y-1">
              {cart.map((item) => {
                const cartProduct = resolvedProducts?.find(
                  (p: any) => p.id === item.productId,
                );
                const itemId = item.cartItemId || String(item.productId);
                return (
                  <div
                    key={itemId}
                    className="group relative bg-white hover:bg-slate-50 p-2 rounded-xl border border-slate-100/50 transition-all duration-200 shadow-sm flex flex-col gap-2"
                  >
                    <div className="flex items-center gap-3 w-full">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <h4 className="text-[11px] font-black text-slate-800 truncate leading-none">
                            {item.name}
                          </h4>
                          <button
                            className="text-[11px] font-black text-slate-900 shrink-0 hover:text-primary transition-colors hover:underline"
                            title="Click to set target total"
                            onClick={() => {
                              if (cartProduct?.serialTrackingEnabled) return;
                              setQtyDialog({
                                open: true,
                                productId: item.productId,
                                productName: item.name,
                                currentQty: item.quantity,
                                mode: "total",
                                unitPrice: item.price,
                                discountAmount: item.discountAmount,
                              });
                              setQtyDialogInput(
                                (
                                  item.price * item.quantity -
                                  item.discountAmount
                                ).toFixed(2),
                              );
                            }}
                            disabled={cartProduct?.serialTrackingEnabled}
                          >
                            $
                            {(
                              item.price * item.quantity -
                              item.discountAmount
                            ).toFixed(2)}
                          </button>
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <button
                            className="text-[11px] font-bold text-slate-400 hover:text-primary transition-colors hover:underline"
                            onClick={() => {
                              const newPriceStr = prompt(
                                "Enter new price:",
                                item.price.toString(),
                              );
                              if (newPriceStr) {
                                const p = parseFloat(newPriceStr);
                                if (!isNaN(p)) updatePrice(itemId, p);
                              }
                            }}
                          >
                            ${item.price.toFixed(2)}
                          </button>
                          {item.discountAmount > 0 && (
                            <span className="text-[10px] font-black text-emerald-600 bg-emerald-50 px-1 rounded">
                              -{item.discountAmount.toFixed(2)}
                            </span>
                          )}
                          {(() => {
                            if (!cartProduct?.isTracked) return null;
                            return (
                              <span className="text-[9px] font-black text-slate-300 bg-slate-50 px-1 rounded uppercase tracking-tighter">
                                {cartProduct.hasRecipe
                                  ? "Source stock"
                                  : `Stock: ${(cartProduct.stockLevel || 0) - (cart.filter((c) => c.productId === item.productId).reduce((sum, c) => sum + c.quantity, 0))}`}
                              </span>
                            );
                          })()}
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <div className="flex items-center bg-slate-100 rounded-lg p-0.5">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 hover:bg-white rounded-md p-0"
                            onClick={() => updateQuantity(itemId, -1)}
                            disabled={cartProduct?.serialTrackingEnabled}
                          >
                            <Minus className="h-3.5 w-3.5 text-slate-600" />
                          </Button>
                          <button
                            className="text-xs font-black w-10 text-center text-slate-700 hover:text-primary transition-colors hover:underline px-1"
                            title="Click to set exact quantity"
                            onClick={() => {
                              if (cartProduct?.serialTrackingEnabled) return;
                              setQtyDialog({
                                open: true,
                                productId: item.productId,
                                productName: item.name,
                                currentQty: item.quantity,
                                mode: "qty",
                                unitPrice: item.price,
                                discountAmount: item.discountAmount,
                              });
                              setQtyDialogInput(item.quantity.toString());
                            }}
                            disabled={cartProduct?.serialTrackingEnabled}
                          >
                            {item.quantity % 1 === 0
                              ? item.quantity
                              : item.quantity.toFixed(
                                  posSettings.quantityDecimalPlaces,
                                )}
                          </button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 hover:bg-white rounded-md p-0"
                            onClick={() => updateQuantity(itemId, 1)}
                            disabled={cartProduct?.serialTrackingEnabled}
                          >
                            <Plus className="h-3.5 w-3.5 text-slate-600" />
                          </Button>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg"
                          onClick={() => removeFromCart(itemId)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>

                    {cartProduct?.serialTrackingEnabled && (
                      <div className="w-full mt-1">
                        <Select
                          value={item.serialNumber || ""}
                          onValueChange={(val) => {
                            setCart((prev) =>
                              prev.map((c) =>
                                (c.cartItemId || String(c.productId)) === itemId
                                  ? { ...c, serialNumber: val }
                                  : c
                              )
                            );
                          }}
                        >
                          <SelectTrigger className="h-8 text-[11px] w-full bg-slate-50 border-slate-200 rounded-lg">
                            <SelectValue placeholder="Select Serial Number" />
                          </SelectTrigger>
                          <SelectContent>
                            {serialNumbers
                              .filter(
                                (s: any) =>
                                  s.productId === item.productId &&
                                  (s.status === "IN_STOCK" || s.serialNumber === item.serialNumber),
                              )
                              .map((s: any) => (
                                <SelectItem key={s.id} value={s.serialNumber}>
                                  {s.serialNumber}
                                </SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>

        {/* Tactical Footer - Ultra Compact Fixed/Afloat */}
        <div className="mt-auto p-3 bg-white/95 backdrop-blur-md border-t border-slate-100 space-y-2 shrink-0 shadow-[0_-10px_40px_rgba(0,0,0,0.08)] z-20 sticky bottom-0">
          <div className="space-y-1.5">
            <div className="flex justify-between text-[10px] font-black text-slate-400 uppercase tracking-widest">
              <span>Subtotal</span>
              <span className="text-slate-600">{fmt(subtotal)}</span>
            </div>
            <div className="flex justify-between text-[10px] font-black text-slate-400 uppercase tracking-widest">
              <span>Tax (VAT)</span>
              <span className="text-slate-600">{fmt(taxAmount)}</span>
            </div>

            {orderDiscount > 0 && (
              <div className="flex justify-between text-[10px] font-black text-emerald-600 bg-emerald-50 p-2 rounded-xl border border-emerald-100 items-center">
                <span className="flex items-center gap-1.5">
                  <Tag className="h-3.5 w-3.5" /> Discount
                </span>
                <span>-{fmt(orderDiscount)}</span>
              </div>
            )}

            <div className="flex items-center gap-2 pt-1 group">
              <div className="relative flex-1">
                <Tag className="h-3.5 w-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-300 group-hover:text-primary transition-colors" />
                <Input
                  type="number"
                  placeholder="Order Discount..."
                  className="h-9 pl-9 bg-slate-50/50 border-none rounded-lg focus:ring-4 focus:ring-primary/10 transition-all text-xs font-bold group-hover:bg-slate-100"
                  value={orderDiscount || ""}
                  onChange={(e) => handleOrderDiscountChange(e.target.value)}
                />
              </div>
              <Button
                variant="outline"
                size="icon"
                className="h-9 w-9 border-slate-200 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg"
                onClick={handleClearCart}
                disabled={cart.length === 0}
                title="Clear Cart"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>

            <div className="flex justify-between items-center py-1.5 border-t border-slate-100 border-dashed mt-1.5">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">
                Total
              </span>
              <div className="text-right">
                <p className="text-xl font-black text-slate-900 tracking-tight leading-none">
                  {fmt(total)}
                </p>
                <p className="text-[9px] font-bold text-emerald-600 mt-0.5 uppercase tracking-widest">
                  {currencyInfo.symbol} {selectedCurrencyCode}
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {normalizeAppMode(resolvedCompany?.appMode) === "restaurant" && selectedTableId ? (
              <Button
                variant="outline"
                className="h-12 gap-2 font-black uppercase tracking-widest text-[10px] border-orange-200 bg-orange-50 text-orange-600 hover:bg-orange-100 hover:text-orange-700 transition-all rounded-xl shadow-sm active:scale-95 group"
                disabled={cart.length === 0 || isProcessing}
                onClick={sendRestaurantOrder}
              >
                <ClipboardCheck className="h-4 w-4 group-hover:scale-110 transition-transform" />
                Send
              </Button>
            ) : (
              <Button
                variant="outline"
                className="h-12 gap-2 font-black uppercase tracking-widest text-[10px] border-slate-200 hover:bg-slate-50 transition-all rounded-xl shadow-sm active:scale-95 group"
                disabled={cart.length === 0}
                onClick={holdOrder}
              >
                <Pause className="h-4 w-4 text-slate-400 group-hover:text-primary transition-colors" />
                Hold
              </Button>
            )}
            <Button
              className="h-12 gap-2 font-black uppercase tracking-widest text-[10px] bg-primary hover:bg-primary/90 text-white transition-all rounded-xl shadow-lg shadow-primary/20 active:scale-95 group"
              disabled={cart.length === 0 || isProcessing}
              onClick={handleCheckout}
            >
              <ShoppingCart className={cn("h-4 w-4 group-hover:scale-110 transition-transform duration-300", cartAnimation && "scale-150 text-white animate-pulse")} />
              Checkout
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <PosLayout>
      <div className="flex flex-col h-screen overflow-hidden bg-slate-50/50 print:hidden">
        <SyncQueueModal 
          isOpen={isSyncQueueModalOpen} 
          onClose={() => setIsSyncQueueModalOpen(false)} 
          triggerSync={triggerSync} 
          syncStatus={syncStatus} 
          isOnline={isOnline} 
        />

        {/* Manager Override Dialog */}
        <ManagerOverride
          isOpen={!!pendingOverride}
          onClose={() => setPendingOverride(null)}
          onAuthorized={handleOverrideSuccess}
          title={
            pendingOverride?.type === "DISCOUNT"
              ? "Authorize Discount"
              : pendingOverride?.type === "VOID_CART"
                ? "Authorize Void"
                : pendingOverride?.type === "REMOVE_ITEM"
                  ? "Authorize Delete"
                  : pendingOverride?.type === "PRICE_CHANGE"
                    ? "Authorize Price Change"
                    : pendingOverride?.type === "VIEW_REPORT" || pendingOverride?.type === "VIEW_MY_SALES"
                      ? "Authorize View Reports"
                      : pendingOverride?.type === "END_SESSION"
                        ? "Authorize End Session"
                        : "Manager Authorization"
          }
          description={
            pendingOverride?.type === "DISCOUNT"
              ? "Manager PIN required for discount"
              : pendingOverride?.type === "VOID_CART"
                ? "Manager PIN required to void cart"
                : pendingOverride?.type === "REMOVE_ITEM"
                  ? "Manager PIN required to remove item"
                  : pendingOverride?.type === "PRICE_CHANGE"
                    ? "Manager PIN required to change price"
                    : pendingOverride?.type === "VIEW_REPORT" || pendingOverride?.type === "VIEW_MY_SALES"
                      ? "Manager PIN required to view sales & reports"
                      : pendingOverride?.type === "END_SESSION"
                        ? "Manager PIN required to end session"
                        : "Manager PIN required to proceed"
          }
        />

        {/* ─── Stale Data Warning ─── */}
        {lastCacheTime && Date.now() - lastCacheTime > 24 * 60 * 60 * 1000 && (
          <div className="px-3 md:px-6 py-2 pt-10 md:pt-2 bg-red-600 text-white shrink-0 z-40 print:hidden flex items-center justify-center gap-2 text-[10px] font-bold uppercase tracking-tighter animate-pulse">
            <AlertTriangle className="h-3 w-3" />
            Warning: Offline data is over 24h old. Refresh required for accurate
            pricing/stock.
            <Button
              variant="link"
              className="h-auto p-0 text-white underline text-[10px] font-black"
              onClick={() => window.location.reload()}
            >
              Refresh Now
            </Button>
          </div>
        )}

        {/* ─── Offline / Sync Status Banner ─── */}
        {(!isOnline || pendingSalesCount > 0 || syncStatus === "syncing") && (
          <div
            className={cn(
              "px-3 md:px-6 py-2 pt-10 md:pt-2 shrink-0 z-40 print:hidden transition-colors animate-in slide-in-from-top-2 duration-300 cursor-pointer hover:opacity-90",
              !isOnline
                ? "bg-amber-500 text-white"
                : syncStatus === "syncing"
                  ? "bg-blue-500 text-white"
                  : "bg-emerald-500 text-white",
            )}
            onClick={() => setIsSyncQueueModalOpen(true)}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-black uppercase tracking-widest">
                {!isOnline ? (
                  <>
                    <WifiOff className="h-4 w-4" /> Offline Mode — Sales will be
                    queued
                  </>
                ) : syncStatus === "syncing" ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Syncing{" "}
                    {syncProgress.synced}/{syncProgress.total}...
                  </>
                ) : (
                  <>
                    <CloudUpload className="h-4 w-4" /> {pendingSalesCount}{" "}
                    Pending Sale{pendingSalesCount !== 1 ? "s" : ""}
                  </>
                )}
              </div>
              {isOnline &&
                pendingSalesCount > 0 &&
                syncStatus !== "syncing" && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-3 text-[10px] font-black text-white hover:bg-white/20 rounded-lg"
                    onClick={() => triggerSync()}
                  >
                    <RefreshCw className="h-3 w-3 mr-1" /> Sync Now
                  </Button>
                )}
            </div>
            {/* Sync Progress Bar */}
            {syncStatus === "syncing" && syncProgress.total > 0 && (
              <div className="w-full bg-white/20 rounded-full h-1.5 mt-2 overflow-hidden">
                <div
                  className="h-full bg-white rounded-full transition-all duration-500 ease-out"
                  style={{
                    width: `${(syncProgress.synced / syncProgress.total) * 100}%`,
                  }}
                />
              </div>
            )}
          </div>
        )}

        {/* High-End Command Center Header */}
        <div className="bg-white/80 border-b border-slate-200/40 px-3 md:px-6 py-1.5 md:py-2 pt-10 md:pt-2 shrink-0 backdrop-blur-xl sticky top-0 z-30 shadow-[0_1px_3px_0_rgba(0,0,0,0.02)] transition-all overflow-hidden">
          <div className="flex flex-col md:flex-row gap-1 md:gap-4 items-stretch md:items-center max-w-full overflow-hidden">
            <div className="flex gap-2 items-center">
              {/* Brand & Context - Hyper Compact on Mobile */}
              <div className="flex items-center justify-between md:justify-start gap-2 md:gap-4 shrink-0 flex-1 md:flex-none">
                <div className="flex items-center gap-2 md:gap-3">
                  <div className="w-8 h-8 md:w-10 md:h-10 bg-slate-900 rounded-xl md:rounded-xl flex items-center justify-center shadow-lg shrink-0">
                    <Package className="h-4 w-4 md:h-5 md:w-5 text-white" />
                  </div>
                  <div className="flex flex-col">
                    <h1 className="text-xs  font-black text-slate-900 leading-none truncate max-w-[80px] md:max-w-[120px] lg:max-w-[160px]">
                      {(resolvedCompany?.name || "POS")
                        .split(" ")
                        .slice(0, 2)
                        .join(" ")}
                    </h1>
                    <div className="flex items-center gap-1.5 mt-0.5 md:mt-1">
                      <div
                        className={cn(
                          "flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[7px] md:text-[8px] font-black uppercase tracking-wider border transition-all",
                          isOnline
                            ? "bg-emerald-50 text-emerald-600 border-emerald-100/50 shadow-[0_0_10px_rgba(16,185,129,0.1)]"
                            : "bg-amber-50 text-amber-600 border-amber-100/50",
                        )}
                      >
                        {isOnline ? (
                          <>
                            <Wifi className="h-2.5 w-2.5" /> Online
                          </>
                        ) : (
                          <>
                            <WifiOff className="h-2.5 w-2.5" /> Offline
                          </>
                        )}
                      </div>

                      {/* 🚀 Background Print Queue Status */}
                      {pendingPrintQueue.length > 0 && (
                        <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[7px] md:text-[8px] font-black uppercase tracking-wider bg-blue-50 text-blue-600 border border-blue-100/50 animate-pulse shadow-[0_0_10px_rgba(59,130,246,0.1)]">
                          <Loader2 className="h-2.5 w-2.5 animate-spin" />
                          {pendingPrintQueue.length} Printing
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Mobile Customer Selector (Compact) */}
                <div className="md:hidden">
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 px-2 gap-1 text-xs font-bold text-slate-700 bg-slate-100/50 hover:bg-slate-100 rounded-lg border border-slate-200/50"
                      >
                        <User className="h-3 w-3 text-slate-500" />
                        <span className="truncate max-w-[60px]">
                          {resolvedCustomers
                            ?.find(
                              (c: any) =>
                                c.id.toString() === selectedCustomerId,
                            )
                            ?.name.split(" ")[0] || "Guest"}
                        </span>
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="w-[90%] rounded-2xl">
                      <DialogHeader>
                        <DialogTitle>Select Customer</DialogTitle>
                        <DialogDescription className="sr-only">
                          Choose a customer for this transaction.
                        </DialogDescription>
                      </DialogHeader>
                      <div className="space-y-4 py-4">
                        <Button
                          variant="outline"
                          className="w-full justify-start gap-2 h-12"
                          onClick={() => {
                            const walkIn = resolvedCustomers?.find(
                              (c: any) =>
                                c.name.toLowerCase().includes("walk-in") ||
                                c.name.toLowerCase().includes("cash"),
                            );
                            if (walkIn)
                              setSelectedCustomerId(walkIn.id.toString());
                          }}
                        >
                          <UserPlus className="h-4 w-4" />
                          <span>Select Walk-in / Cash</span>
                        </Button>
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <Label>Search Customer</Label>
                            <Button
                              variant="link"
                              className="h-auto p-0 text-primary text-[10px] font-black uppercase"
                              onClick={() => setIsQuickAddCustomerOpen(true)}
                            >
                              + Quick Add
                            </Button>
                          </div>
                          <Select
                            value={selectedCustomerId}
                            onValueChange={setSelectedCustomerId}
                          >
                            <SelectTrigger className="h-12">
                              <SelectValue placeholder="Select Customer" />
                            </SelectTrigger>
                            <SelectContent>
                              {resolvedCustomers?.map((c: any) => (
                                <SelectItem key={c.id} value={c.id.toString()}>
                                  {c.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </DialogContent>
                  </Dialog>
                </div>

                {/* Mobile Total Indicator */}
                {activeView === "products" && (
                  <div className="md:hidden flex items-center gap-2 bg-emerald-50 px-2 py-1 rounded-lg border border-emerald-100 shrink-0">
                    <span className="text-[10px] font-black text-emerald-700">
                      {fmt(total)}
                    </span>
                  </div>
                )}
              </div>

              {/* Open Drawer Button (Visible next to logo) - Commented out for now
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 px-2 min-[1232px]:px-3 rounded-lg border border-slate-200/50 text-slate-600 hover:bg-white hover:shadow-sm hover:border-slate-300 transition-all font-black text-[10px] gap-1.5 bg-slate-50/30 group"
                                    onClick={handleOpenDrawer}
                                >
                                    <Banknote className="h-3.5 w-3.5 text-emerald-500 group-hover:scale-110 transition-transform" />
                                    <span className="hidden min-[1232px]:inline tracking-tight">Open Drawer</span>
                                </Button>
                            */}
              {/* Mobile Holds Button (Visible next to logo) */}
              <Button
                variant="outline"
                size="sm"
                className="md:hidden h-8 w-8 p-0 rounded-lg border-slate-200 shrink-0 relative"
                onClick={() => setIsHoldsModalOpen(true)}
              >
                <History className="h-4 w-4 text-slate-500" />
                {heldSales.length > 0 && (
                  <span className="absolute -top-1 -right-1 h-2.5 w-2.5 bg-primary rounded-full ring-2 ring-white" />
                )}
              </Button>
              {/* Mobile Menu Trigger (New Location) */}
              <div className="md:hidden flex items-center gap-2">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <div className="h-8 w-8 rounded-xl bg-slate-900 flex items-center justify-center text-white cursor-pointer hover:bg-slate-800 transition-all shadow-lg group relative">
                      <SettingsIcon className="h-4 w-4 opacity-70 group-hover:rotate-90 transition-transform" />
                      {/* Shift Status Indicator Dot */}
                      <div
                        className={cn(
                          "absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full border border-white",
                          currentShift ? "bg-emerald-500" : "bg-red-500",
                        )}
                      />
                    </div>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="end"
                    className="w-64 rounded-2xl p-2 shadow-2xl border-slate-100"
                  >
                    <DropdownMenuLabel className="flex flex-col gap-1 p-3">
                      <span className="text-[10px] uppercase tracking-widest text-slate-400 font-black">
                        Terminal Info
                      </span>
                      <span className=" font-black text-slate-900">
                        {company?.name || "Premium POS"}
                      </span>
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold text-slate-400">
                          ID: {companyId}
                        </span>
                        <Badge
                          variant={currentShift ? "default" : "destructive"}
                          className="h-4 text-[9px] px-1"
                        >
                          {currentShift ? "SHIFT OPEN" : "SHIFT CLOSED"}
                        </Badge>
                      </div>
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator className="bg-slate-50" />

                    <DropdownMenuItem
                      className="p-3 rounded-xl focus:bg-slate-50 cursor-pointer"
                      onClick={() => setIsHoldsModalOpen(true)}
                    >
                      <History className="h-4 w-4 mr-3 text-slate-500" />
                      <div className="flex flex-col">
                        <span className=" font-bold text-slate-700">
                          Held Sales{" "}
                          {heldSales.length > 0 && `(${heldSales.length})`}
                        </span>
                        <span className="text-[10px] text-slate-400">
                          Recall parked transactions
                        </span>
                      </div>
                    </DropdownMenuItem>

                    <MySalesModal
                      companyId={companyId}
                      company={company}
                      posSettings={posSettings}
                      user={user}
                      open={isMySalesPinAuthorized}
                      onOpenChange={setIsMySalesPinAuthorized}
                      trigger={
                        <DropdownMenuItem
                          className="p-3 rounded-xl focus:bg-slate-50 cursor-pointer"
                          onSelect={(e) => {
                            if (isCashier && (company?.posSettings as any)?.requireOverrideForReports && !isMySalesPinAuthorized) {
                              e.preventDefault();
                              setPendingOverride({ type: "VIEW_MY_SALES", data: null });
                            }
                          }}
                        >
                          <Receipt className="h-4 w-4 mr-3 text-slate-500" />
                          <div className="flex flex-col">
                            <span className=" font-bold text-slate-700 flex items-center">
                              My Sales {isCashier && (company?.posSettings as any)?.requireOverrideForReports && <Pin className="h-2.5 w-2.5 opacity-50 ml-2" />}
                            </span>
                            <span className="text-[10px] text-slate-400">
                              View & Reprint Receipts
                            </span>
                          </div>
                        </DropdownMenuItem>
                      }
                    />

                    {currentShift ? (
                      <DropdownMenuItem
                        className="p-3 rounded-xl focus:bg-red-50 cursor-pointer text-red-600"
                        onClick={() => {
                          if (isCashier && (company?.posSettings as any)?.requireOverrideForEndShift) {
                            setPendingOverride({ type: "END_SESSION", data: null });
                          } else {
                            setShiftModalType("CLOSE");
                            setShiftBalance("");
                            setIsShiftModalOpen(true);
                          }
                        }}
                      >
                        <XCircle className="h-4 w-4 mr-3" />
                        <div className="flex flex-col">
                          <span className=" font-bold flex items-center">End Shift {isCashier && (company?.posSettings as any)?.requireOverrideForEndShift && <Pin className="h-2.5 w-2.5 opacity-50 ml-2" />}</span>
                          <span className="text-[10px] opacity-70">
                            Close register & Z-Report
                          </span>
                        </div>
                      </DropdownMenuItem>
                    ) : (
                      <DropdownMenuItem
                        className="p-3 rounded-xl focus:bg-emerald-50 cursor-pointer text-emerald-600"
                        onClick={() => {
                          setShiftModalType("OPEN");
                          setShiftBalance("");
                          setIsShiftModalOpen(true);
                        }}
                      >
                        <Play className="h-4 w-4 mr-3" />
                        <div className="flex flex-col">
                          <span className=" font-bold">Open Shift</span>
                          <span className="text-[10px] opacity-70">
                            Start new service period
                          </span>
                        </div>
                      </DropdownMenuItem>
                    )}

                    <DropdownMenuSeparator className="bg-slate-50" />
                    <DropdownMenuItem
                      className="p-3 rounded-xl focus:bg-blue-50 cursor-pointer"
                      onClick={handleReprintLast}
                    >
                      <Printer className="h-4 w-4 mr-3 text-blue-500" />
                      <div className="flex flex-col">
                        <span className=" font-bold">Reprint Last Receipt</span>
                        <span className="text-[10px] text-slate-400">
                          Reprint most recent sale
                        </span>
                      </div>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="p-3 rounded-xl focus:bg-amber-50 cursor-pointer"
                      onClick={() => {
                        setCnType("credit");
                        setIsCreditNoteOpen(true);
                      }}
                    >
                      <FileText className="h-4 w-4 mr-3 text-amber-500" />
                      <div className="flex flex-col">
                        <span className=" font-bold">Credit / Debit Note</span>
                        <span className="text-[10px] text-slate-400">
                          Issue return or adjustment
                        </span>
                      </div>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="p-3 rounded-xl focus:bg-purple-50 cursor-pointer"
                      onClick={() => {
                        if (isCashier && (company?.posSettings as any)?.requireOverrideForReports) {
                          setPendingOverride({ type: "VIEW_REPORT", data: "x" });
                        } else {
                          handleLoadReport("x");
                        }
                      }}
                    >
                      <LayoutGrid className="h-4 w-4 mr-3 text-purple-500" />
                      <div className="flex flex-col">
                        <span className=" font-bold flex items-center">X-Report {isCashier && (company?.posSettings as any)?.requireOverrideForReports && <Pin className="h-2.5 w-2.5 opacity-50 ml-2" />}</span>
                        <span className="text-[10px] text-slate-400">
                          Current day summary
                        </span>
                      </div>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator className="bg-slate-50" />
                    <DropdownMenuItem
                      className="p-3 rounded-xl focus:bg-slate-50 cursor-pointer text-slate-400"
                      onClick={() => setIsSettingsOpen(true)}
                    >
                      <SettingsIcon className="h-4 w-4 mr-3" />
                      <span className=" font-bold">Device Settings</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="p-3 rounded-xl focus:bg-red-50 cursor-pointer text-red-600"
                      onClick={logout}
                    >
                      <LogOut className="h-4 w-4 mr-3" />
                      <span className=" font-bold">Sign Out</span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>

            {/* Elite Search Bar - Full width on mobile */}
            <div className="relative flex-1 group flex items-center gap-2">
              <div className="relative flex-1">
                <div className="absolute inset-0 left-0 pl-4 flex items-center pointer-events-none">
                  <Search className="h-4 w-4 md:h-5 md:w-5 text-slate-400 group-focus-within:text-primary transition-colors" />
                </div>
                <Input
                  autoFocus
                  ref={searchInputRef}
                  placeholder="Search... (F1)"
                  className="pl-9 md:pl-10 h-9 md:h-11 w-full bg-slate-100/40 border-none rounded-xl text-xs  font-bold text-slate-800 focus:bg-white focus:ring-4 focus:ring-primary/10 transition-all shadow-inner placeholder:text-slate-400"
                  value={searchQuery}
                  onKeyDown={(e) => {
                    if (e.key !== "Enter") return;
                    const query = searchQuery.trim();
                    if (!query) return;
                    e.preventDefault();

                    // Read rules from both posSettings state and ref (covers all sources)
                    const weightRules: any[] =
                      (posSettings as any).variableWeightBarcodeRules ||
                      posSettingsRef.current.variableWeightBarcodeRules ||
                      [];
                    const matchedRule = weightRules.find(
                      (r: any) =>
                        r.enabled &&
                        query.startsWith(r.prefix) &&
                        query.length === r.totalLength,
                    );
                    if (matchedRule) {
                      const productSku = query.substring(
                        matchedRule.skuStart,
                        matchedRule.skuStart + matchedRule.skuLength,
                      );
                      const qtyRaw = parseInt(
                        query.substring(
                          matchedRule.quantityStart,
                          matchedRule.quantityStart +
                            matchedRule.quantityLength,
                        ),
                      );
                      const quantity =
                        qtyRaw / (matchedRule.quantityDivisor || 1000);
                      const allProducts: any[] =
                        resolvedProductsRef.current.length > 0
                          ? resolvedProductsRef.current
                          : resolvedProducts || [];
                      const weightedFound = allProducts.find(
                        (p: any) =>
                          p.sku === productSku ||
                          p.barcode === productSku ||
                          p.barcode === query,
                      );
                      if (weightedFound) {
                        addWeightedToCart(weightedFound, quantity);
                        setSearchQuery("");
                        const uomS =
                          (weightedFound as any).unitOfMeasure ||
                          (matchedRule.quantityDivisor === 1000
                            ? "kg"
                            : "units");
                        toast({
                          title: "✓ Weighted Item",
                          description: `${weightedFound.name} — ${quantity.toFixed(posSettingsRef.current.quantityDecimalPlaces ?? 3)} ${uomS}`,
                        });
                      } else {
                        toast({
                          title: "Product Not Found",
                          description: `Rule "${matchedRule.name}" matched. SKU decoded: "${productSku}". Ensure a product has exactly this SKU.`,
                          variant: "destructive",
                        });
                      }
                      return;
                    }

                    // Exact SKU or barcode match
                    const queryLower = query.toLowerCase();
                    const directMatch = (resolvedProducts as any[]).find(
                      (p: any) =>
                        p.sku?.toLowerCase() === queryLower ||
                        p.barcode?.toLowerCase() === queryLower,
                    );
                    if (directMatch) {
                      addToCart(directMatch);
                      setSearchQuery("");
                      toast({
                        title: "✓ Added to cart",
                        description: directMatch.name,
                      });
                      return;
                    }

                    // Single visible match
                    if (filteredProducts.length === 1) {
                      addToCart(filteredProducts[0]);
                      setSearchQuery("");
                      toast({
                        title: "✓ Added to cart",
                        description: filteredProducts[0].name,
                      });
                    }
                  }}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
                <div className="absolute right-3 hidden md:flex items-center gap-1 text-[10px] font-bold text-slate-300 pointer-events-none">
                  <kbd className="px-1.5 py-0.5 bg-white rounded border border-slate-100">
                    enter
                  </kbd>
                </div>
              </div>

              {/* Global Currency Switcher - Hyper Compact */}
              <div className="flex bg-slate-100/60 p-0.5 rounded-lg shrink-0 border border-slate-200/30">
                {["USD", "ZWG"].map((cc) => (
                  <button
                    key={cc}
                    onClick={() => setSelectedCurrencyCode(cc)}
                    className={cn(
                      "px-2 py-1 rounded-md text-[9px] font-black transition-all",
                      selectedCurrencyCode === cc
                        ? "bg-white text-primary shadow-sm border border-slate-100"
                        : "text-slate-400 hover:text-slate-600",
                    )}
                  >
                    {cc}
                  </button>
                ))}
              </div>

              {/* Grid / List View Toggle - Always Visible */}
              <div className="flex bg-slate-100/60 p-0.5 rounded-lg shrink-0 border border-slate-200/30">
                <button
                  onClick={() => setProductViewMode("grid")}
                  title="Grid View"
                  className={cn(
                    "p-1.5 rounded-md transition-all flex items-center justify-center",
                    productViewMode === "grid"
                      ? "bg-white text-primary shadow-sm border border-slate-100"
                      : "text-slate-400 hover:text-slate-600",
                  )}
                >
                  <LayoutGrid className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setProductViewMode("list")}
                  title="List View"
                  className={cn(
                    "p-1.5 rounded-md transition-all flex items-center justify-center",
                    productViewMode === "list"
                      ? "bg-white text-primary shadow-sm border border-slate-100"
                      : "text-slate-400 hover:text-slate-600",
                  )}
                >
                  <List className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Mobile Category Filter Trigger */}
              <div className="md:hidden">
                <Sheet>
                  <SheetTrigger asChild>
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-10 w-10 rounded-xl border-slate-200 bg-white shadow-sm"
                    >
                      <Filter
                        className={cn(
                          "h-4 w-4",
                          selectedCategory !== "All Products"
                            ? "text-primary"
                            : "text-slate-500",
                        )}
                      />
                      {selectedCategory !== "All Products" && (
                        <span className="absolute -top-1 -right-1 h-2.5 w-2.5 bg-primary rounded-full ring-2 ring-white" />
                      )}
                    </Button>
                  </SheetTrigger>
                  <SheetContent
                    side="bottom"
                    className="h-[80vh] rounded-t-[2rem] p-0 flex flex-col"
                  >
                    <div className="p-6 pb-2 border-b border-slate-100">
                      <SheetHeader className="text-left">
                        <SheetTitle className="text-lg font-black text-slate-900">
                          Filter Categories
                        </SheetTitle>
                      </SheetHeader>
                    </div>
                    <div className="flex-1 overflow-y-auto p-6">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {categories.map((cat) => (
                          <Button
                            key={cat}
                            variant={
                              selectedCategory === cat ? "default" : "outline"
                            }
                            onClick={() => setSelectedCategory(cat)}
                            className={cn(
                              "h-auto py-4 flex flex-col gap-2 items-center justify-center rounded-2xl border transition-all",
                              selectedCategory === cat
                                ? "bg-primary text-white shadow-lg shadow-primary/20 border-primary"
                                : "bg-white text-slate-500 border-slate-100 hover:border-primary/20 hover:bg-slate-50",
                            )}
                          >
                            <Tag
                              className={cn(
                                "h-6 w-6",
                                selectedCategory === cat
                                  ? "text-white"
                                  : "text-slate-300",
                              )}
                            />
                            <span className="font-bold text-xs text-center">
                              {cat}
                            </span>
                          </Button>
                        ))}
                      </div>
                    </div>
                    <div className="p-6 border-t border-slate-100 bg-slate-50">
                      <SheetClose asChild>
                        <Button className="w-full h-12 rounded-xl font-black uppercase tracking-widest text-xs">
                          Apply Filter
                        </Button>
                      </SheetClose>
                    </div>
                  </SheetContent>
                </Sheet>
              </div>
            </div>

            {/* Integrated Controls & Profile - Compacted to prevent scrolling */}
            <div className="flex items-center gap-1 shrink-0">
              {/* Customer Selector - Premium */}
              <div className="flex items-center gap-0.5 bg-slate-100/40 p-0.5 rounded-lg border border-slate-200/20 shrink-0">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 rounded-md bg-white shadow-sm border border-slate-200 text-slate-600 hover:text-primary hover:bg-white p-0"
                  onClick={() => {
                    const walkIn = resolvedCustomers?.find(
                      (c: any) =>
                        c.name.toLowerCase().includes("walk-in") ||
                        c.name.toLowerCase().includes("cash"),
                    );
                    if (walkIn) setSelectedCustomerId(walkIn.id.toString());
                    else
                      toast({
                        title: "No Walk-in Customer",
                        description: "Create 'Walk-in' first.",
                      });
                  }}
                  title="Select Walk-in"
                >
                  <UserPlus className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 rounded-md bg-white shadow-sm border border-slate-200 text-slate-600 hover:text-emerald-600 hover:bg-white p-0"
                  onClick={() => setIsQuickAddCustomerOpen(true)}
                  title="Add New Customer"
                >
                  <Plus className="h-4 w-4" />
                </Button>
                <Select
                  value={selectedCustomerId}
                  onValueChange={setSelectedCustomerId}
                >
                  <SelectTrigger
                    className="h-8 border-none bg-transparent hover:bg-slate-200/30 transition-all font-bold text-slate-700 px-2 flex items-center gap-1.5"
                    title="Select Customer"
                  >
                    <User className="h-4 w-4 text-slate-500 shrink-0" />
                    <span className="truncate text-xs max-w-[80px]">
                      {resolvedCustomers
                        ?.find((c: any) => c.id.toString() === selectedCustomerId)
                        ?.name.split(" ")[0] || "Guest"}
                    </span>
                  </SelectTrigger>
                  <SelectContent className="rounded-xl border-slate-200 shadow-2xl">
                    {resolvedCustomers?.map((c: any) => (
                      <SelectItem
                        key={c.id}
                        value={c.id.toString()}
                        className="focus:bg-primary/5 rounded-lg py-2.5"
                      >
                        <div className="font-bold text-slate-700">{c.name}</div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="h-6 w-px bg-slate-200 mx-0.5 hidden lg:block" />

              {/* Quick Action Pills - Compact */}
              <div className="flex items-center gap-1">
                <button
                  onClick={() => {
                    if (isCashier) {
                      setPendingOverride({ type: "TOGGLE_FISCAL", data: null });
                    } else {
                      setIsFiscalized((prev) => !prev);
                      toast({
                        title: isFiscalized ? "Fiscal OFF" : "Fiscal ON",
                        description: isFiscalized
                          ? "Invoices will not be fiscalized"
                          : "Invoices will be fiscalized",
                      });
                    }
                  }}
                  title={
                    isCashier
                      ? "Manager PIN required to toggle fiscal mode"
                      : "Toggle fiscal mode"
                  }
                  className={cn(
                    "h-8 px-2 min-[1232px]:px-3 gap-1 min-[1232px]:gap-1.5 rounded-lg border transition-all font-bold flex items-center text-[10px]",
                    isFiscalized
                      ? "bg-emerald-50 border-emerald-200/50 text-emerald-700 hover:bg-emerald-100"
                      : "bg-slate-50 border-slate-200/40 text-slate-400 hover:bg-slate-100",
                  )}
                >
                  <div
                    className={cn(
                      "w-2 h-2 rounded-full shrink-0",
                      isFiscalized ? "bg-emerald-500" : "bg-slate-300",
                    )}
                  />
                  <span className="hidden min-[1232px]:inline">Fiscal</span>
                  {isCashier && <Pin className="h-2.5 w-2.5 opacity-50 ml-1" />}
                </button>

                <Button
                  variant="outline"
                  className="h-8 px-2 min-[1232px]:px-3 gap-1 min-[1232px]:gap-1.5 border-slate-200/40 rounded-lg hover:bg-slate-50 transition-all font-bold group bg-white/50"
                  onClick={() => setIsHoldsModalOpen(true)}
                >
                  <div className="relative">
                    <History className="h-3.5 w-3.5 text-slate-500 group-hover:rotate-[-45deg] transition-transform" />
                    {heldSales.length > 0 && (
                      <span className="absolute -top-1 -right-1 h-2 w-2 bg-primary rounded-full ring-2 ring-white" />
                    )}
                  </div>
                  <span className="text-slate-600 text-[10px] hidden min-[1232px]:inline">
                    Holds
                  </span>
                  <Badge
                    variant="secondary"
                    className="h-4 bg-slate-100/80 text-slate-500 border-none px-1 font-black text-[9px]"
                  >
                    {heldSales.length}
                  </Badge>
                </Button>

                {/* Fullscreen Toggle (Desktop Only) */}
                <Button
                  variant="outline"
                  size="icon"
                  className={cn(
                    "h-9 w-9 rounded-md border-slate-200 transition-all shadow-sm shrink-0 hidden min-[1232px]:flex",
                    isFullscreen
                      ? "bg-primary text-white border-primary"
                      : "bg-white text-slate-500 hover:text-primary",
                  )}
                  onClick={toggleFullscreen}
                >
                  <Fullscreen className="h-5 w-5" />
                </Button>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <div className="h-9 w-9 rounded-md bg-slate-900 flex items-center justify-center text-white cursor-pointer hover:bg-slate-800 transition-all shadow-lg group relative shrink-0">
                      <SettingsIcon className="h-4 w-4 opacity-70 group-hover:rotate-90 transition-transform" />
                    </div>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="end"
                    className="w-64 rounded-2xl p-2 shadow-2xl border-slate-100"
                  >
                    <DropdownMenuLabel className="flex flex-col gap-1 p-3">
                      <span className="text-[10px] uppercase tracking-widest text-slate-400 font-black">
                        Terminal Info
                      </span>
                      <span className=" font-black text-slate-900">
                        {company?.name || "Premium POS"}
                      </span>
                      <span className="text-[10px] font-bold text-slate-400">
                        ID: {companyId} | POS-T01
                      </span>
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator className="bg-slate-50" />
                    <DropdownMenuItem
                      className="p-3 rounded-xl focus:bg-slate-50 cursor-pointer"
                      onClick={() => setIsHoldsModalOpen(true)}
                    >
                      <History className="h-4 w-4 mr-3 text-slate-500" />
                      <div className="flex flex-col">
                        <span className=" font-bold text-slate-700">
                          Held Sales
                        </span>
                        <span className="text-[10px] text-slate-400">
                          Recall parked transactions
                        </span>
                      </div>
                    </DropdownMenuItem>

                    <MySalesModal
                      companyId={companyId}
                      company={company}
                      posSettings={posSettings}
                      user={user}
                      open={isMySalesPinAuthorized}
                      onOpenChange={setIsMySalesPinAuthorized}
                      trigger={
                        <DropdownMenuItem
                          className="p-3 rounded-xl focus:bg-slate-50 cursor-pointer"
                          onSelect={(e) => {
                            if (isCashier && (company?.posSettings as any)?.requireOverrideForReports && !isMySalesPinAuthorized) {
                              e.preventDefault();
                              setPendingOverride({ type: "VIEW_MY_SALES", data: null });
                            }
                          }}
                        >
                          <Receipt className="h-4 w-4 mr-3 text-slate-500" />
                          <div className="flex flex-col">
                            <span className=" font-bold text-slate-700 flex items-center">
                              My Sales {isCashier && (company?.posSettings as any)?.requireOverrideForReports && <Pin className="h-2.5 w-2.5 opacity-50 ml-2" />}
                            </span>
                            <span className="text-[10px] text-slate-400">
                              View & Reprint Receipts
                            </span>
                          </div>
                        </DropdownMenuItem>
                      }
                    />

                    {currentShift ? (
                      <DropdownMenuItem
                        className="p-3 rounded-xl focus:bg-red-50 cursor-pointer text-red-600"
                        onClick={() => {
                          if (isCashier && (company?.posSettings as any)?.requireOverrideForEndShift) {
                            setPendingOverride({ type: "END_SESSION", data: null });
                          } else {
                            setShiftModalType("CLOSE");
                            setShiftBalance("");
                            setIsShiftModalOpen(true);
                          }
                        }}
                      >
                        <XCircle className="h-4 w-4 mr-3" />
                        <div className="flex flex-col">
                          <span className=" font-bold flex items-center">End Session {isCashier && (company?.posSettings as any)?.requireOverrideForEndShift && <Pin className="h-2.5 w-2.5 opacity-50 ml-2" />}</span>
                          <span className="text-[10px] opacity-70">
                            Close register & X-Report
                          </span>
                        </div>
                      </DropdownMenuItem>
                    ) : (
                      <DropdownMenuItem
                        className="p-3 rounded-xl focus:bg-emerald-50 cursor-pointer text-emerald-600"
                        onClick={() => {
                          setShiftModalType("OPEN");
                          setShiftBalance("");
                          setIsShiftModalOpen(true);
                        }}
                      >
                        <Play className="h-4 w-4 mr-3" />
                        <div className="flex flex-col">
                          <span className=" font-bold">Open Session</span>
                          <span className="text-[10px] opacity-70">
                            Start new service period
                          </span>
                        </div>
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuSeparator className="bg-slate-50" />
                    <DropdownMenuItem
                      className="p-3 rounded-xl focus:bg-slate-50 cursor-pointer min-[1232px]:hidden"
                      onClick={toggleFullscreen}
                    >
                      <Fullscreen className="h-4 w-4 mr-3 text-slate-500" />
                      <div className="flex flex-col">
                        <span className=" font-bold text-slate-700">
                          {isFullscreen
                            ? "Exit Fullscreen"
                            : "Enter Fullscreen"}
                        </span>
                        <span className="text-[10px] text-slate-400">
                          Maximize POS workspace
                        </span>
                      </div>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator className="bg-slate-50" />
                    <DropdownMenuItem
                      className="p-3 rounded-xl focus:bg-blue-50 cursor-pointer"
                      onClick={handleReprintLast}
                    >
                      <Printer className="h-4 w-4 mr-3 text-blue-500" />
                      <div className="flex flex-col">
                        <span className=" font-bold">Reprint Last Receipt</span>
                        <span className="text-[10px] text-slate-400">
                          Reprint most recent sale
                        </span>
                      </div>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="p-3 rounded-xl focus:bg-amber-50 cursor-pointer"
                      onClick={() => {
                        setCnType("credit");
                        setIsCreditNoteOpen(true);
                      }}
                    >
                      <FileText className="h-4 w-4 mr-3 text-amber-500" />
                      <div className="flex flex-col">
                        <span className=" font-bold">Credit / Debit Note</span>
                        <span className="text-[10px] text-slate-400">
                          Issue return or adjustment
                        </span>
                      </div>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="p-3 rounded-xl focus:bg-purple-50 cursor-pointer"
                      onClick={() => {
                        if (isCashier && (company?.posSettings as any)?.requireOverrideForReports) {
                          setPendingOverride({ type: "VIEW_REPORT", data: "x" });
                        } else {
                          handleLoadReport("x");
                        }
                      }}
                    >
                      <LayoutGrid className="h-4 w-4 mr-3 text-purple-500" />
                      <div className="flex flex-col">
                        <span className=" font-bold flex items-center">X-Report {isCashier && (company?.posSettings as any)?.requireOverrideForReports && <Pin className="h-2.5 w-2.5 opacity-50 ml-2" />}</span>
                        <span className="text-[10px] text-slate-400">
                          Current day summary
                        </span>
                      </div>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator className="bg-slate-50" />
                    <DropdownMenuItem
                      className="p-3 rounded-xl focus:bg-slate-50 cursor-pointer text-slate-400"
                      onClick={() => setIsSettingsOpen(true)}
                    >
                      <SettingsIcon className="h-4 w-4 mr-3" />
                      <span className=" font-bold">Device Settings</span>
                    </DropdownMenuItem>
                    <div className="h-px bg-slate-50 my-1" />
                    <DropdownMenuItem
                      className="p-3 rounded-xl focus:bg-red-50 cursor-pointer text-red-600"
                      onClick={() => logout()}
                    >
                      <LogOut className="h-4 w-4 mr-3" />
                      <span className=" font-bold">Log out</span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>

                {/* Persistent Total Indicator for Scannability */}
                <div className="h-11 px-5 rounded-2xl bg-emerald-50 border border-emerald-100 flex items-center gap-3 shadow-sm ml-2">
                  <Calculator className="h-4 w-4 text-emerald-600" />
                  <div className="flex flex-col">
                    <span className="text-[10px] font-black uppercase tracking-widest text-emerald-600/60 leading-none">
                      Total
                    </span>
                    <span className="text-base font-black text-emerald-700 leading-none mt-1">
                      {fmt(total)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col md:flex-row overflow-hidden pb-0 md:pb-0 h-full relative">
          {normalizeAppMode(resolvedCompany?.appMode) === "restaurant" && !selectedTableId ? (
            <div className={cn(
              "flex-1 flex flex-col overflow-hidden p-2 md:p-4",
              activeView === "cart" ? "hidden" : "flex",
            )}>
              <RestaurantTableMap 
                companyId={companyId} 
                onSelectTable={handleTableSelect}
                selectedTableId={selectedTableId}
              />
              <Dialog open={isCoversDialogOpen} onOpenChange={setIsCoversDialogOpen}>
                <DialogContent className="max-w-[320px] rounded-[2.5rem] p-8 border-none shadow-2xl bg-white">
                  <div className="flex flex-col gap-5 text-center">
                    <div className="bg-slate-100 p-4 rounded-full w-20 h-20 mx-auto flex items-center justify-center -mb-2">
                       <Users className="w-10 h-10 text-slate-400" />
                    </div>
                    <div>
                      <h2 className="text-2xl font-black text-slate-900 tracking-tight">Party Size</h2>
                      <p className="text-sm text-slate-500 font-bold mt-1 uppercase tracking-widest">Table • {pendingTableSelection?.tableName}</p>
                    </div>
                    <div className="flex items-center justify-center gap-6 mt-4 mb-2">
                       <Button variant="outline" className="w-14 h-14 rounded-2xl bg-slate-50 shadow-sm border-slate-200 hover:bg-slate-100 hover:border-slate-300" onClick={() => setCoversCount(Math.max(1, coversCount - 1))}><Minus className="w-6 h-6 text-slate-600" /></Button>
                       <span className="text-5xl font-black text-slate-800 w-16 whitespace-nowrap">{coversCount}</span>
                       <Button variant="outline" className="w-14 h-14 rounded-2xl bg-slate-50 shadow-sm border-slate-200 hover:bg-slate-100 hover:border-slate-300" onClick={() => setCoversCount(coversCount + 1)}><Plus className="w-6 h-6 text-slate-600" /></Button>
                    </div>
                    <Button 
                      className="mt-2 h-14 rounded-2xl font-black tracking-widest uppercase bg-primary hover:bg-primary/90 text-white shadow-xl shadow-primary/20 transition-all active:scale-95"
                      onClick={() => {
                        setSelectedTableId(pendingTableSelection?.id);
                        setIsCoversDialogOpen(false);
                      }}
                    >
                      Open Table
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          ) : (
            <>
              {/* Products Grid */}
              <div
                className={cn(
                  "flex-1 flex flex-col overflow-hidden p-2 md:p-4",
                  activeView === "cart" ? "hidden md:flex" : "flex",
                )}
              >
            {/* Product Filter/Tabs (High End Pills) - Hidden on Mobile now */}
            <div className="flex justify-between items-center pr-2 gap-2">
            <div
              className={cn(
                "flex gap-1 overflow-x-auto pb-2 shrink-0 px-1 mt-0.5 hidden md:flex custom-scrollbar items-center",
                activeView === "cart" ? "hidden md:flex" : "hidden md:flex",
              )}
            >
              {normalizeAppMode(company?.appMode) === "restaurant" && selectedTableId && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSelectedTableId(undefined)}
                  className="rounded-md mr-2 whitespace-nowrap h-7 md:h-8 px-2 md:px-3 text-[9px] md:text-[10px] font-black transition-all border-slate-300 text-slate-700 uppercase tracking-tighter"
                >
                  <ChevronLeft className="w-3 h-3 mr-1" /> Map
                </Button>
              )}
              {categories.map((cat) => (
                <Button
                  key={cat}
                  variant={selectedCategory === cat ? "default" : "outline"}
                  onClick={() => setSelectedCategory(cat)}
                  className={cn(
                    "rounded-md whitespace-nowrap h-7 md:h-8 px-2 md:px-3 text-[9px] md:text-[10px] font-black transition-all border uppercase tracking-tighter",
                    selectedCategory === cat
                      ? "bg-primary text-white shadow-sm border-primary"
                      : "bg-white text-slate-500 border-slate-100/40 hover:bg-slate-50 hover:text-slate-700 hover:border-slate-200",
                  )}
                  size="sm"
                >
                  {cat}
                </Button>
              ))}
            </div>
            
            <div className="flex items-center gap-1 bg-slate-100/50 p-1 rounded-lg border border-slate-200/50 mb-2">
              <button
                onClick={() => setProductViewMode("grid")}
                className={cn(
                  "p-1.5 rounded-md transition-all",
                  productViewMode === "grid" ? "bg-white text-primary shadow-sm" : "text-slate-400 hover:text-slate-600"
                )}
              >
                <LayoutGrid className="w-4 h-4" />
              </button>
              <button
                onClick={() => setProductViewMode("list")}
                className={cn(
                  "p-1.5 rounded-md transition-all",
                  productViewMode === "list" ? "bg-white text-primary shadow-sm" : "text-slate-400 hover:text-slate-600"
                )}
              >
                <List className="w-4 h-4" />
              </button>
            </div>
            </div>

            <style>{`
                            /* Fine-tuned Premium Scrollbar */
                            *::-webkit-scrollbar {
                                height: 5px;
                                width: 5px;
                                transition: all 0.2s ease;
                            }
                            *::-webkit-scrollbar-track {
                                background: transparent;
                            }
                            *::-webkit-scrollbar-thumb {
                                background: rgba(148, 163, 184, 0.15);
                                border-radius: 20px;
                            }
                            *::-webkit-scrollbar-thumb:hover {
                                background: rgba(148, 163, 184, 0.35);
                            }
                            /* Category-specific adjustments */
                            .custom-scrollbar {
                                scrollbar-width: thin;
                            }
                        `}</style>

            <ScrollArea className="flex-1 -mx-2 px-2">
              {isLoadingProducts && resolvedProducts.length === 0 ? (
                <div className="flex items-center justify-center min-h-[400px]">
                  <div className="flex flex-col items-center gap-4">
                    <Loader2 className="h-10 w-10 animate-spin text-primary" />
                    <p className="text-slate-400 font-medium">
                      Loading Inventory...
                    </p>
                  </div>
                </div>
              ) : resolvedProducts.length === 0 ? (
                <div className="flex items-center justify-center min-h-[400px]">
                  <div className="flex flex-col items-center gap-4 text-center px-6">
                    <Package className="h-12 w-12 text-slate-200" />
                    <div>
                      <p className="text-slate-500 font-bold ">
                        No products available
                      </p>
                      {!isOnline && (
                        <p className="text-amber-600 text-xs mt-1 font-medium">
                          Offline — no cached products found.
                          <br />
                          Connect to internet and log in online to cache
                          products.
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  {/* Mobile View */}
                  <div
                    className={cn(
                      "md:hidden gap-1.5 pb-24 px-1 select-none touch-manipulation",
                      productViewMode === "list" ? "flex flex-col" : "grid grid-cols-2 sm:grid-cols-3"
                    )}
                  >
                    {(pagedProducts as any[]).map((product) => {
                      const hash = product.name
                        .split("")
                        .reduce(
                          (acc: number, char: string) =>
                            char.charCodeAt(0) + ((acc << 5) - acc),
                          0,
                        );
                      const hue = Math.abs(hash % 360);
                      const bgColor = `hsl(${hue}, 70%, 95%)`;
                      const iconColor = `hsl(${hue}, 60%, 60%)`;
                      return (
                        <div
                          key={product.id}
                          className={cn(
                            "bg-white p-1.5 rounded-xl border border-slate-100/80 shadow-sm flex active:scale-95 transition-all relative overflow-hidden group",
                            productViewMode === "grid" ? "flex-col gap-1" : "flex-row items-center justify-between gap-3 h-14"
                          )}
                          onClick={() => addToCart(product)}
                        >
                          <div
                            className={cn(
                              "rounded-md flex items-center justify-center shrink-0 relative overflow-hidden",
                              productViewMode === "grid" ? "aspect-[4/5] w-full" : "h-10 w-10 rounded-lg"
                            )}
                            style={{
                              backgroundColor: product.imageUrl
                                ? "#f8fafc"
                                : bgColor,
                            }}
                          >
                            {product.imageUrl ? (
                              <img
                                src={product.imageUrl}
                                alt={product.name}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <Package
                                className="h-4 w-4"
                                style={{ color: iconColor }}
                              />
                            )}
                            {product.isTracked &&
                              !product.hasRecipe &&
                              Number(product.stockLevel) <= 0 && (
                                <div className="absolute top-0.5 right-0.5 bg-red-500 text-[5px] font-black h-2.5 px-1 rounded-sm flex items-center text-white uppercase">
                                  OUT
                                </div>
                              )}
                            {product.isTracked &&
                              !product.hasRecipe &&
                              Number(product.stockLevel) > 0 &&
                              Number(product.stockLevel) <=
                                Number(product.lowStockThreshold) && (
                                <div className="absolute top-0.5 right-0.5 bg-amber-500 text-[5px] font-black h-2.5 px-1 rounded-sm flex items-center text-white uppercase">
                                  LOW
                                </div>
                              )}
                            {product.isTracked && product.hasRecipe && (
                              <div className="absolute top-0.5 right-0.5 bg-indigo-500 text-[5px] font-black h-2.5 px-1 rounded-sm flex items-center text-white uppercase">
                                SRC
                              </div>
                            )}
                          </div>
                          <div className={cn("flex flex-1", productViewMode === "grid" ? "flex-col gap-0.5 pb-0.5" : "flex-row items-center justify-between pr-1")}>
                            <h4 className={cn("font-black text-slate-800 leading-tight", productViewMode === "grid" ? "text-[8px] line-clamp-1 px-0.5" : "text-xs line-clamp-1")}>
                              {product.name}
                            </h4>
                            <div className="flex items-center justify-between">
                              <span className={cn("font-black text-slate-900", productViewMode === "grid" ? "text-[9px]" : "text-xs")}>
                                {fmt(product.price)}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Desktop View */}
                  <div
                    className={cn("hidden md:grid gap-2 pb-8", productViewMode === "list" ? "grid-cols-1" : "")}
                    style={
                      productViewMode === "grid" ? {
                        gridTemplateColumns:
                          "repeat(auto-fill, minmax(140px, 1fr))",
                      } : {}
                    }
                  >
                    {(pagedProducts as any[]).map((product) => {
                      const hash = product.name
                        .split("")
                        .reduce(
                          (acc: number, char: string) =>
                            char.charCodeAt(0) + ((acc << 5) - acc),
                          0,
                        );
                      const hue = Math.abs(hash % 360);
                      const bgColor = `hsl(${hue}, 70%, 95%)`;
                      const iconColor = `hsl(${hue}, 60%, 60%)`;
                      return (
                        <Card
                          key={product.id}
                          className={cn("cursor-pointer group relative overflow-hidden flex border border-slate-100 bg-white rounded-xl transition-all duration-200 hover:shadow-lg shadow-sm", productViewMode === "grid" ? "flex-col" : "flex-row h-20 items-center")}
                          onClick={() => addToCart(product)}
                        >
                          <CardContent className={cn("p-0 flex w-full", productViewMode === "grid" ? "flex-col h-full" : "flex-row items-center h-full")}>
                            <div
                              className={cn("flex items-center justify-center shrink-0 relative overflow-hidden", productViewMode === "grid" ? "aspect-square max-h-24 w-full" : "h-16 w-16 mx-2 rounded-lg")}
                              style={{
                                backgroundColor: product.imageUrl
                                  ? "#f8fafc"
                                  : bgColor,
                              }}
                            >
                              {product.imageUrl ? (
                                <img
                                  src={product.imageUrl}
                                  alt={product.name}
                                  className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                                />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center">
                                  <Package
                                    className="h-6 w-6 md:h-8 md:w-8"
                                    style={{ color: iconColor }}
                                  />
                                </div>
                              )}
                              {product.isTracked &&
                                !product.hasRecipe &&
                                Number(product.stockLevel) <= 0 && (
                                  <Badge className="absolute top-2 right-2 bg-red-500 text-[8px] font-black h-4 px-1 border-none">
                                    OUT
                                  </Badge>
                                )}
                              {product.isTracked &&
                                !product.hasRecipe &&
                                Number(product.stockLevel) > 0 &&
                                Number(product.stockLevel) <=
                                  Number(product.lowStockThreshold) && (
                                  <Badge className="absolute top-2 right-2 bg-amber-500 text-[8px] font-black h-4 px-1 border-none">
                                    LOW
                                  </Badge>
                                )}
                              {product.isTracked && product.hasRecipe && (
                                <Badge className="absolute top-2 right-2 bg-indigo-500 text-[8px] font-black h-4 px-1 border-none">
                                  SRC
                                </Badge>
                              )}
                              <div className="absolute inset-0 bg-primary/5 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center shadow-lg">
                                  <Plus className="h-5 w-5 text-primary" />
                                </div>
                              </div>
                              <button
                                onClick={(e) => togglePinProduct(e, product.id)}
                                className={cn(
                                  "absolute top-2 left-2 w-6 h-6 rounded-full flex items-center justify-center transition-all bg-white/80 backdrop-blur-sm",
                                  pinnedProducts.includes(product.id)
                                    ? "text-primary opacity-100 shadow-sm"
                                    : "text-slate-400 opacity-0 group-hover:opacity-100 hover:text-primary hover:bg-white",
                                )}
                              >
                                <Pin
                                  className="h-3 w-3"
                                  fill={
                                    pinnedProducts.includes(product.id)
                                      ? "currentColor"
                                      : "none"
                                  }
                                />
                              </button>
                            </div>
                            <div className={cn("flex flex-1 bg-white relative", productViewMode === "grid" ? "flex-col p-2" : "flex-row items-center justify-between p-3 h-full")}>
                              <h4 className={cn("font-black text-slate-800 line-clamp-2 group-hover:text-primary transition-colors leading-tight", productViewMode === "grid" ? "text-[10px] md:text-[11px] mb-1 min-h-[1.5rem] md:min-h-[1.75rem]" : "text-xs md:text-sm flex-1")}>
                                {product.name}
                              </h4>
                              <div className={cn("flex items-center", productViewMode === "grid" ? "justify-between mt-auto" : "gap-4")}>
                                <p className={cn("font-black text-slate-900", productViewMode === "grid" ? "text-xs" : "text-sm")}>
                                  {fmt(product.price)}
                                </p>
                                {product.isTracked && (
                                  <span
                                    className={cn(
                                      "text-[8px] md:text-[9px] font-bold",
                                      product.hasRecipe
                                        ? "text-indigo-500"
                                        : Number(product.stockLevel) <=
                                            Number(product.lowStockThreshold)
                                          ? "text-red-500"
                                          : "text-slate-400",
                                    )}
                                  >
                                    {product.hasRecipe
                                      ? "SRC"
                                      : Number(product.stockLevel)}
                                  </span>
                                )}
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                </>
              )}
            </ScrollArea>
          </div>

          {/* Cart Sidebar/View */}
          <div
            className={cn(
              "flex flex-col w-full md:w-[350px] lg:w-[400px] border-l border-slate-200 bg-white md:relative absolute inset-0 z-40 md:z-auto bg-white mb-[70px] md:mb-0",
              activeView === "products" ? "hidden md:flex" : "flex",
            )}
          >
            <CartSection />
          </div>
          </>
          )}
        </div>

        {/* Mobile Bottom Navigation - Native App Style */}
        <div className="md:hidden fixed bottom-0 left-0 right-0 h-[75px] bg-white/80 backdrop-blur-2xl border-t border-slate-100/50 flex items-center justify-around z-50 px-6 shadow-[0_-10px_40px_rgba(0,0,0,0.06)] select-none">
          <button
            onClick={() => setActiveView("products")}
            className={cn(
              "flex flex-col items-center gap-1 transition-all duration-300 px-6 py-2 rounded-3xl relative",
              activeView === "products" ? "text-primary" : "text-slate-400",
            )}
          >
            {activeView === "products" && (
              <div className="absolute inset-0 bg-primary/10 rounded-3xl animate-in zoom-in-95 duration-200" />
            )}
            <LayoutGrid
              className={cn(
                "h-5 w-5 relative z-10",
                activeView === "products" ? "fill-primary/20" : "",
              )}
            />
            <span className="text-[9px] font-black uppercase tracking-widest relative z-10">
              Products
            </span>
          </button>

          <button
            onClick={() => setActiveView("cart")}
            className={cn(
              "flex flex-col items-center gap-1 transition-all duration-300 px-6 py-2 rounded-3xl relative",
              activeView === "cart" ? "text-primary" : "text-slate-400",
            )}
          >
            {activeView === "cart" && (
              <div className="absolute inset-0 bg-primary/10 rounded-3xl animate-in zoom-in-95 duration-200" />
            )}
            <div className="relative z-10">
              <ShoppingCart
                className={cn(
                  "h-5 w-5",
                  activeView === "cart" ? "fill-primary/20" : "",
                )}
              />
              {cart.length > 0 && (
                <span className="absolute -top-1.5 -right-1.5 h-4 min-w-[16px] px-1 bg-red-500 text-white text-[8px] font-black rounded-full flex items-center justify-center ring-2 ring-white">
                  {cart.reduce((a, b) => a + b.quantity, 0)}
                </span>
              )}
            </div>
            <span className="text-[9px] font-black uppercase tracking-widest relative z-10">
              Checkout
            </span>
          </button>
        </div>

        {/* Modals & Dialogs */}
        <div className="pos-modals">
          {/* Elite Single-Box Checkout - "Square" Inspired Design */}
          <Dialog open={isCheckoutOpen} onOpenChange={setIsCheckoutOpen}>
            <DialogContent className="max-w-[95vw] md:max-w-[420px] max-h-[95vh] p-0 overflow-hidden border-none rounded-[2rem] md:rounded-[2.5rem] shadow-2xl bg-white flex flex-col">
              <DialogHeader className="sr-only">
                <DialogTitle>Checkout</DialogTitle>
                <DialogDescription>Complete payment</DialogDescription>
              </DialogHeader>

              <div className="p-3 sm:p-4 md:p-6 flex flex-col gap-2 sm:gap-3 md:gap-4 overflow-y-auto no-scrollbar h-full">
                {/* Header: Amount Focus */}
                <div className="space-y-2 sm:space-y-4 text-center">
                  <div className="space-y-0.5 sm:space-y-1">
                    <span className="text-[9px] sm:text-[10px] font-black uppercase tracking-[0.3em] text-slate-400">
                      Total Due
                    </span>
                    <div className="flex items-center justify-center gap-2">
                      <h2 className="text-2xl sm:text-3xl font-black text-slate-900 leading-none tracking-tight">
                        {fmt(total)}
                      </h2>
                      <Badge
                        variant="outline"
                        className="text-[8px] bg-slate-50 border-slate-200 text-slate-500 font-black h-5 uppercase tracking-tighter"
                      >
                        {selectedCurrencyCode}
                      </Badge>
                    </div>
                  </div>

                  <div className="relative group max-w-[240px] sm:max-w-[280px] mx-auto py-0 sm:py-1">
                    <div className="absolute inset-0 bg-primary/5 rounded-2xl blur-xl opacity-0 group-focus-within:opacity-100 transition-opacity" />
                    <div className="relative">
                      <span className="absolute left-0 top-1/2 -translate-y-1/2 text-xl sm:text-2xl font-black text-slate-200 group-focus-within:text-primary transition-colors">
                        $
                      </span>
                      <Input
                        id="checkout-paid-amount"
                        type="number"
                        placeholder="Enter payment"
                        value={paidAmount}
                        onChange={(e) => setPaidAmount(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === "F10") {
                            e.preventDefault();
                            if (!isProcessing && (paymentMethod === "CREDIT" || paidAmount || splitPayments.length > 0)) {
                              processOrder();
                            }
                          }
                        }}
                        className="h-10 sm:h-12 pl-8 pr-8 text-2xl sm:text-3xl font-black bg-transparent border-none text-slate-900 text-center shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 placeholder:text-slate-100"
                      />
                      {paidAmount && (
                        <button
                          onClick={() => setPaidAmount("")}
                          className="absolute right-0 top-1/2 -translate-y-1/2 text-slate-200 hover:text-red-500 transition-colors"
                        >
                          <XCircle className="w-5 h-5 sm:w-6 h-6" />
                        </button>
                      )}
                    </div>
                    <div className="h-0.5 w-full bg-slate-100 group-focus-within:bg-primary transition-colors duration-500 mt-0.5" />
                  </div>
                  {/* Quick Cash Buttons */}
                  <div className="flex gap-2 justify-center mt-2 overflow-x-auto no-scrollbar pb-1 px-4 max-w-[320px] mx-auto">
                    {[10, 20, 50, 100].map(amt => (
                      <button
                        key={amt}
                        onClick={() => setPaidAmount(amt.toString())}
                        className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-black rounded-lg text-xs transition-colors shrink-0 shadow-sm active:scale-95"
                      >
                        +{amt}
                      </button>
                    ))}
                    <button
                        onClick={() => setPaidAmount(total.toString())}
                        className="px-3 py-1.5 bg-primary/10 hover:bg-primary/20 text-primary font-black rounded-lg text-xs transition-colors shrink-0 shadow-sm active:scale-95"
                    >
                      Exact
                    </button>
                  </div>
                </div>

                {/* Main Interactive: Large Pro Numpad */}
                {/* <div className="flex flex-col items-center justify-center scale-90 sm:scale-95 py-0">
                                    <Numpad value={paidAmount} onChange={setPaidAmount} />
                                </div> */}

                {/* Payment Method Strip */}
                <div className="space-y-3 sm:space-y-6">
                  <div className="flex gap-2 items-center overflow-x-auto no-scrollbar py-1 px-1">
                    {[
                      { id: "CASH", icon: Banknote, label: "Cash" },
                      { id: "CARD", icon: CreditCard, label: "Card" },
                      { id: "CREDIT", icon: FileText, label: "Credit" },
                      { id: "LAYBY", icon: Receipt, label: "Lay-by" },
                      { id: "ECOCASH", icon: ShoppingBag, label: "EcoCash" },
                      { id: "SPLIT", icon: PieChart, label: "Split" }
                    ]
                      .filter((m) => {
                        const allowed = (company?.posSettings as any)
                          ?.allowedPaymentMethods;
                        return (
                          !allowed ||
                          allowed.length === 0 ||
                          allowed.includes(m.id) ||
                          m.id === "SPLIT"
                        );
                      })
                      .map((method) => (
                        <Button
                          key={method.id}
                          variant={
                            paymentMethod === method.id ? "default" : "outline"
                          }
                          className={cn(
                            "h-9 sm:h-10 px-4 sm:px-6 rounded-xl sm:rounded-2xl flex items-center gap-2 sm:gap-3 font-black uppercase text-[9px] sm:text-[10px] transition-all border-none shrink-0 shadow-sm",
                            paymentMethod === method.id
                              ? "bg-slate-900 text-white shadow-lg scale-100"
                              : "bg-slate-50 text-slate-400 hover:bg-slate-100",
                          )}
                          onClick={() => setPaymentMethod(method.id as any)}
                        >
                          <method.icon
                            className={cn(
                              "h-3.5 w-3.5 sm:h-4 w-4",
                              paymentMethod === method.id
                                ? "text-primary"
                                : "text-slate-300",
                            )}
                          />
                          {method.label}
                        </Button>
                      ))}
                  </div>

                  {/* Split Payments UI */}
                  {paymentMethod === "SPLIT" && (
                    <div className="px-4 sm:px-6">
                      <div className="bg-slate-50/80 border border-slate-100 p-3 sm:p-4 rounded-2xl flex flex-col gap-3 shadow-inner">
                        <div className="flex gap-2">
                          <select
                            value={splitMethod}
                            onChange={(e) => setSplitMethod(e.target.value)}
                            className="bg-white border-none rounded-xl text-xs font-black px-3 focus:ring-2 focus:ring-primary h-10 w-24 text-slate-700 shadow-sm"
                          >
                            <option value="CASH">Cash</option>
                            <option value="CARD">Card</option>
                            <option value="ECOCASH">EcoCash</option>
                          </select>
                          <Input
                            type="number"
                            placeholder="Amount"
                            value={splitAmount}
                            onChange={(e) => setSplitAmount(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                if (!splitAmount || isNaN(Number(splitAmount)) || Number(splitAmount) <= 0) return;
                                setSplitPayments([...splitPayments, { method: splitMethod, amount: Number(splitAmount) }]);
                                setSplitAmount("");
                              }
                            }}
                            className="h-10 bg-white border-none text-sm font-black flex-1 focus-visible:ring-2 focus-visible:ring-primary shadow-sm"
                          />
                          <Button
                            className="h-10 px-4 rounded-xl font-black text-[10px] uppercase shadow-md"
                            onClick={() => {
                              if (!splitAmount || isNaN(Number(splitAmount)) || Number(splitAmount) <= 0) return;
                              setSplitPayments([...splitPayments, { method: splitMethod, amount: Number(splitAmount) }]);
                              setSplitAmount("");
                            }}
                          >
                            Add
                          </Button>
                        </div>
                        {splitPayments.length > 0 && (
                          <div className="flex flex-col gap-2 mt-2">
                            {splitPayments.map((p, i) => (
                              <div key={i} className="flex justify-between items-center bg-white px-4 py-2 rounded-xl text-xs font-black border border-slate-100 shadow-sm animate-in fade-in slide-in-from-bottom-2">
                                <span className="text-slate-500 uppercase tracking-widest text-[9px]">{p.method}</span>
                                <span className="text-slate-900 text-sm">{fmt(p.amount)}</span>
                                <button
                                  onClick={() => setSplitPayments(splitPayments.filter((_, idx) => idx !== i))}
                                  className="text-slate-300 hover:text-red-500 transition-colors p-1"
                                >
                                  <XCircle className="w-5 h-5" />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Results & Finish Block */}
                  <div className="space-y-2 sm:space-y-4">
                    {paymentMethod === "CREDIT" || paymentMethod === "LAYBY" ? (
                      <div className="flex items-center justify-between px-4 sm:px-6 py-2 sm:py-3 bg-blue-50 rounded-2xl sm:rounded-3xl border border-blue-100 animate-in zoom-in-95">
                        <div className="flex flex-col">
                          <span className="text-[9px] sm:text-[10px] font-black uppercase tracking-widest text-blue-600">
                            {paymentMethod === "LAYBY"
                              ? "Lay-by Deposit"
                              : "Accounts Receivable"}
                          </span>
                          <span className="text-[10px] sm:text-xs font-medium text-blue-500">
                            {paymentMethod === "LAYBY"
                              ? "Stock is reserved until final payment"
                              : "Invoice will stay open until paid"}
                          </span>
                        </div>
                        <FileText className="h-5 w-5 sm:h-6 w-6 text-blue-600 opacity-40" />
                      </div>
                    ) : (
                      (parseFloat(paidAmount || "0") > 0 ||
                        splitPayments.length > 0) && (
                        <div className="flex items-center justify-between px-4 sm:px-6 py-2 sm:py-3 bg-emerald-50 rounded-2xl sm:rounded-3xl border border-emerald-100 animate-in zoom-in-95">
                          <span className="text-[9px] sm:text-[10px] font-black uppercase tracking-widest text-emerald-600">
                            Change Due
                          </span>
                          <div className="flex items-center gap-2 sm:gap-3">
                            <h3 className="text-xl sm:text-2xl font-black text-emerald-700">
                              {(() => {
                                const sumParams =
                                  splitPayments.reduce(
                                    (a, b) => a + b.amount,
                                    0,
                                  ) + parseFloat(paidAmount || "0");
                                const req =
                                  total *
                                  Number(
                                    currencies?.find(
                                      (c) => c.code === selectedCurrencyCode,
                                    )?.exchangeRate || 1,
                                  );
                                const change = Math.max(0, sumParams - req);
                                const currencyInfoLocal = currencies?.find((c) => c.code === selectedCurrencyCode) || { symbol: "$", code: "USD" };
                                return `+ ${currencyInfoLocal.symbol || currencyInfoLocal.code}${change.toFixed(2)}`;
                              })()}
                            </h3>
                            <Banknote className="h-5 w-5 sm:h-6 w-6 text-emerald-500 opacity-30" />
                          </div>
                        </div>
                      )
                    )}

                    <div className="flex gap-2 sm:gap-4">
                      <Button
                        variant="ghost"
                        className="h-10 sm:h-12 px-4 sm:px-8 rounded-xl sm:rounded-2xl font-black uppercase text-[9px] sm:text-[10px] text-slate-400 hover:text-red-500"
                        onClick={() => setIsCheckoutOpen(false)}
                      >
                        Cancel
                      </Button>
                      <Button
                        disabled={
                          isProcessing ||
                          (paymentMethod !== "CREDIT" &&
                            !paidAmount &&
                            splitPayments.length === 0)
                        }
                        className="flex-1 h-10 sm:h-12 rounded-2xl sm:rounded-3xl bg-slate-900 hover:bg-black text-white font-black uppercase tracking-[0.1em] sm:tracking-[0.2em] shadow-xl transition-all active:scale-[0.98] group"
                        onClick={processOrder}
                      >
                        {isProcessing ? (
                          <Loader2 className="h-5 w-5 animate-spin mx-auto" />
                        ) : (
                          <div className="flex items-center justify-center gap-3">
                            <span>
                              {paymentMethod === "LAYBY"
                                ? "Create Lay-by"
                                : "Complete Payment"}
                            </span>
                            <ChevronRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
                          </div>
                        )}
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </DialogContent>
          </Dialog>

          {/* Held Sales (Restored with Elite Styling) */}
          <Dialog open={isHoldsModalOpen} onOpenChange={setIsHoldsModalOpen}>
            <DialogContent className="sm:max-w-[500px] border-none rounded-[2rem] shadow-2xl p-0 overflow-hidden">
              <DialogHeader className="sr-only">
                <DialogTitle>Transaction Success</DialogTitle>
                <DialogDescription>
                  Your transaction has been processed successfully.
                </DialogDescription>
              </DialogHeader>
              <div className="bg-slate-900 p-8 text-white">
                <h3 className="text-xl font-black flex items-center gap-3">
                  <History className="h-6 w-6 text-primary" />
                  Held Transactions
                </h3>
                <p className="text-xs text-slate-500 mt-2 font-bold uppercase tracking-widest">
                  Resume or void parked sales
                </p>
              </div>
              <div className="p-6 space-y-4 max-h-[500px] overflow-y-auto bg-slate-50">
                {heldSales.length === 0 ? (
                  <div className="text-center py-12">
                    <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-sm">
                      <Pause className="h-6 w-6 text-slate-200" />
                    </div>
                    <p className="text-slate-400 font-black uppercase text-[10px] tracking-widest">
                      No held sales found
                    </p>
                  </div>
                ) : (
                  heldSales.map((hold) => (
                    <div
                      key={hold.id}
                      className="flex items-center justify-between p-5 bg-white border border-slate-100 rounded-2xl hover:border-primary/30 transition-all group shadow-sm"
                    >
                      <div>
                        <p className="font-black text-slate-900">
                          {hold.holdName}
                        </p>
                        <div className="flex items-center gap-3 mt-1">
                          <span className="text-[10px] font-bold text-slate-400">
                            {new Date(hold.createdAt).toLocaleTimeString()}
                          </span>
                          <Badge
                            variant="secondary"
                            className="h-5 text-[9px] bg-slate-100 text-slate-500 border-none font-black"
                          >
                            {hold.cartData.length} Items
                          </Badge>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        onClick={() => resumeHold(hold)}
                        className="h-10 px-5 gap-2 rounded-xl bg-slate-900 hover:bg-black text-white font-black text-xs"
                      >
                        <Play className="h-3 w-3 text-primary" /> Resume
                      </Button>
                    </div>
                  ))
                )}
              </div>
            </DialogContent>
          </Dialog>

          {/* Success/Confetti Modal */}
          {/* Advanced Shift Control Modal */}
          <Dialog open={isShiftModalOpen} onOpenChange={setIsShiftModalOpen}>
            <DialogContent className="sm:max-w-[425px] rounded-[2rem] border-none shadow-2xl p-0 overflow-hidden">
              <DialogHeader className="sr-only">
                <DialogTitle>Apply Discount</DialogTitle>
                <DialogDescription>
                  Enter a percentage or fixed amount to apply a discount to this
                  order.
                </DialogDescription>
              </DialogHeader>
              <div
                className={cn(
                  "p-8 text-white",
                  shiftModalType === "OPEN" ? "bg-emerald-600" : "bg-red-600",
                )}
              >
                <h3 className="text-xl font-black flex items-center gap-3">
                  {shiftModalType === "OPEN" ? (
                    <Play className="h-6 w-6 text-white" />
                  ) : (
                    <XCircle className="h-6 w-6 text-white" />
                  )}
                  {shiftModalType === "OPEN"
                    ? "Open New Session"
                    : "Close Current Session"}
                </h3>
                <p className="text-xs opacity-80 mt-2 font-bold uppercase tracking-widest text-white/70">
                  {shiftModalType === "OPEN"
                    ? "Initialize register balance"
                    : "Perform X-Report & reconciliation"}
                </p>
              </div>
              <div className="p-8 space-y-6 bg-white">
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                    {shiftModalType === "OPEN"
                      ? "Float / Opening Balance"
                      : "Actual Counted Cash"}
                  </label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 font-black text-slate-300">
                      $
                    </span>
                    <Input
                      type="number"
                      value={shiftBalance}
                      onChange={(e) => setShiftBalance(e.target.value)}
                      className="h-14 pl-8 text-lg font-black bg-slate-50 border-none rounded-xl focus:ring-4 focus:ring-primary/5 transition-all outline-none"
                      placeholder="0.00"
                    />
                  </div>
                </div>
                <Button
                  className={cn(
                    "w-full h-14 rounded-xl font-black uppercase tracking-widest shadow-xl transition-all active:scale-95 text-white",
                    shiftModalType === "OPEN"
                      ? "bg-emerald-600 hover:bg-emerald-700"
                      : "bg-red-600 hover:bg-red-700",
                  )}
                  onClick={
                    shiftModalType === "OPEN" ? openShift : handleCloseShift
                  }
                >
                  {shiftModalType === "OPEN"
                    ? "Start Service"
                    : "Close Shift & Harmonize"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          {/* ── Custom Quantity / Reverse Price Dialog ── */}
          <Dialog
            open={!!qtyDialog?.open}
            onOpenChange={(open) => {
              if (!open) setQtyDialog(null);
            }}
          >
            <DialogContent className="sm:max-w-[340px] rounded-[2rem] border-none shadow-2xl p-0 overflow-hidden">
              <DialogHeader className="sr-only">
                <DialogTitle>
                  {qtyDialog?.mode === "qty"
                    ? "Set Quantity"
                    : "Set Target Total"}
                </DialogTitle>
                <DialogDescription>
                  Enter a value to update this cart item.
                </DialogDescription>
              </DialogHeader>
              <div
                className={`p-6 text-white ${qtyDialog?.mode === "qty" ? "bg-slate-900" : "bg-indigo-600"}`}
              >
                <p className="text-[10px] font-black uppercase tracking-widest opacity-60 mb-1">
                  {qtyDialog?.mode === "qty"
                    ? "Set Quantity"
                    : "Reverse Pricing — Set Total"}
                </p>
                <h3 className="text-lg font-black leading-tight truncate">
                  {qtyDialog?.productName}
                </h3>
                {qtyDialog?.mode === "total" && (
                  <p className="text-xs opacity-70 mt-1">
                    @ ${qtyDialog.unitPrice.toFixed(2)} / unit
                  </p>
                )}
              </div>
              <div className="p-6 bg-white space-y-4">
                <div className="relative">
                  {qtyDialog?.mode === "total" && (
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-black text-lg">
                      $
                    </span>
                  )}
                  <input
                    type="number"
                    autoFocus
                    step="any"
                    min="0"
                    value={qtyDialogInput}
                    onChange={(e) => setQtyDialogInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        document.getElementById("qty-dialog-confirm")?.click();
                      }
                    }}
                    className={`w-full h-16 rounded-2xl border border-slate-200 text-2xl font-black text-center bg-slate-50 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all ${qtyDialog?.mode === "total" ? "pl-8" : ""}`}
                    placeholder={qtyDialog?.mode === "qty" ? "0.000" : "0.00"}
                  />
                </div>
                {qtyDialog &&
                  qtyDialogInput &&
                  !isNaN(parseFloat(qtyDialogInput)) && (
                    <div className="bg-slate-50 rounded-xl p-3 text-center">
                      {qtyDialog.mode === "qty" ? (
                        <p className=" font-bold text-slate-600">
                          Line Total ={" "}
                          <span className="text-slate-900 font-black">
                            $
                            {(
                              parseFloat(qtyDialogInput) * qtyDialog.unitPrice -
                              qtyDialog.discountAmount
                            ).toFixed(2)}
                          </span>
                        </p>
                      ) : (
                        <p className=" font-bold text-slate-600">
                          Qty ={" "}
                          <span className="text-slate-900 font-black">
                            {(
                              (parseFloat(qtyDialogInput) +
                                qtyDialog.discountAmount) /
                              qtyDialog.unitPrice
                            ).toFixed(posSettings.quantityDecimalPlaces)}
                          </span>
                        </p>
                      )}
                    </div>
                  )}
                <div className="flex gap-3">
                  <Button
                    variant="outline"
                    className="flex-1 h-12 rounded-xl font-black border-slate-200"
                    onClick={() => setQtyDialog(null)}
                  >
                    Cancel
                  </Button>
                  <Button
                    id="qty-dialog-confirm"
                    className="flex-[2] h-12 rounded-xl font-black btn-gradient"
                    onClick={() => {
                      if (!qtyDialog) return;
                      const val = parseFloat(qtyDialogInput);
                      if (isNaN(val) || val < 0) return;
                      if (qtyDialog.mode === "qty") {
                        setCart((prev) =>
                          prev.map((it) =>
                            it.productId === qtyDialog.productId
                              ? { ...it, quantity: val }
                              : it,
                          ),
                        );
                      } else {
                        if (qtyDialog.unitPrice > 0) {
                          const newQty =
                            (val + qtyDialog.discountAmount) /
                            qtyDialog.unitPrice;
                          setCart((prev) =>
                            prev.map((it) =>
                              it.productId === qtyDialog.productId
                                ? {
                                    ...it,
                                    quantity: Number(
                                      newQty.toFixed(
                                        posSettings.quantityDecimalPlaces + 1,
                                      ),
                                    ),
                                  }
                                : it,
                            ),
                          );
                        }
                      }
                      setQtyDialog(null);
                    }}
                  >
                    {qtyDialog?.mode === "qty" ? "Set Quantity" : "Apply"}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>

          {/* Terminal Settings Modal */}
          <Dialog open={isSettingsOpen} onOpenChange={setIsSettingsOpen}>
            <DialogContent className="sm:max-w-[650px] rounded-[3rem] border-none shadow-2xl p-0 overflow-hidden outline-none">
              <DialogHeader className="sr-only">
                <DialogTitle>Terminal Settings</DialogTitle>
                <DialogDescription>
                  Configure local POS settings like printing preferences and
                  terminal ID.
                </DialogDescription>
              </DialogHeader>

              <div className="p-6 bg-slate-900 text-white flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-black flex items-center gap-3">
                    <SettingsIcon className="h-6 w-6 text-primary" />
                    Terminal Settings
                  </h3>
                  <p className="text-[10px] text-slate-500 mt-1 font-black uppercase tracking-widest">
                    Local POS Configuration
                  </p>
                </div>
                <div className="px-4 py-2 bg-white/5 rounded-2xl border border-white/10">
                  <p className="text-[9px] text-slate-400 font-black uppercase tracking-widest mb-0.5">
                    Terminal Status
                  </p>
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="text-xs font-black text-emerald-500 uppercase">
                      {posSettings.terminalId}
                    </span>
                  </div>
                </div>
              </div>

              <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6 bg-white">
                <div className="space-y-4">
                  <div className="p-4 bg-slate-50 rounded-3xl border border-slate-100 space-y-3">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block px-1">
                      System Identity
                    </label>
                    <div className="relative">
                      <Label className="text-[9px] font-black absolute -top-2 left-3 bg-slate-50 px-1 text-slate-400 z-10">
                        Terminal ID
                      </Label>
                      <Input
                        value={posSettings.terminalId}
                        onChange={(e) =>
                          setPosSettings((prev) => ({
                            ...prev,
                            terminalId: e.target.value,
                          }))
                        }
                        className="h-11 text-xs font-black bg-white border-slate-200 rounded-xl px-4 focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="flex flex-col gap-2 p-3 bg-slate-50 rounded-2xl border border-slate-100">
                      <Label className="text-[10px] font-black text-slate-500 uppercase">
                        Auto-Print
                      </Label>
                      <Button
                        variant="ghost"
                        className={cn(
                          "h-9 rounded-xl font-black text-[10px] transition-all w-full",
                          posSettings.autoPrint
                            ? "bg-primary text-white"
                            : "bg-white text-slate-400 border border-slate-200",
                        )}
                        onClick={() =>
                          setPosSettings((prev) => ({
                            ...prev,
                            autoPrint: !prev.autoPrint,
                          }))
                        }
                      >
                        {posSettings.autoPrint ? "ENABLED" : "DISABLED"}
                      </Button>
                    </div>
                    <div className="flex flex-col gap-2 p-3 bg-emerald-50/50 rounded-2xl border border-emerald-100">
                      <Label className="text-[10px] font-black text-emerald-600 uppercase">
                        Silent Print
                      </Label>
                      <Button
                        variant="ghost"
                        className={cn(
                          "h-9 rounded-xl font-black text-[10px] transition-all w-full",
                          posSettings.silentPrinting
                            ? "bg-emerald-500 text-white"
                            : "bg-white text-emerald-400 border border-emerald-100",
                        )}
                        onClick={() =>
                          setPosSettings((prev) => ({
                            ...prev,
                            silentPrinting: !prev.silentPrinting,
                          }))
                        }
                      >
                        {posSettings.silentPrinting ? "ACTIVE" : "OFF"}
                      </Button>
                    </div>
                  </div>

                  <Button
                    variant="outline"
                    className="w-full h-12 rounded-2xl border-indigo-100 text-indigo-600 font-black text-xs uppercase tracking-widest hover:bg-indigo-50 flex items-center justify-center gap-2"
                    onClick={async () => {
                      console.clear();
                      console.log(
                        "%c━━━ TEST PRINT INITIATED ━━━",
                        "color: #6366f1; font-size: 14px; font-weight: bold",
                      );
                      const dummyInvoice = {
                        id: 0,
                        invoiceNo: "TEST-0001",
                        issueDate: new Date().toISOString(),
                        total: 10.0,
                        currency: "USD",
                        items: [
                          {
                            description: "Test Product",
                            quantity: 1,
                            unitPrice: 10.0,
                            lineTotal: 10.0,
                            taxRate: 15,
                          },
                        ],
                        verificationCode: "TEST-PRINT-SUCCESS",
                        receiptCounter: 1,
                        receiptGlobalNo: 1,
                        _simulation: true,
                        _testPrint: true,
                      };
                      await handleSilentPrint(dummyInvoice);
                    }}
                  >
                    <Printer className="h-4 w-4" />
                    Run Test Print
                  </Button>
                </div>

                <div className="space-y-4">
                  <div className="p-4 bg-indigo-50/50 rounded-3xl border border-indigo-100 space-y-3">
                    <Label className="text-[10px] font-black text-indigo-700 uppercase tracking-widest block">
                      ESC/POS Settings
                    </Label>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div className="flex items-center justify-between p-2 bg-white rounded-xl border border-indigo-50">
                        <Label className="text-[9px] font-black text-slate-500 uppercase">
                          Auto-Cut
                        </Label>
                        <Switch
                          checked={posSettings.autoCut}
                          onCheckedChange={(v) =>
                            setPosSettings((prev) => ({ ...prev, autoCut: v }))
                          }
                          className="scale-75 data-[state=checked]:bg-indigo-600"
                        />
                      </div>
                      <div className="flex items-center justify-between p-2 bg-white rounded-xl border border-indigo-50">
                        <Label className="text-[9px] font-black text-slate-500 uppercase">
                          Cash Drawer
                        </Label>
                        <Switch
                          checked={posSettings.openDrawerOnPrint}
                          onCheckedChange={(v) =>
                            setPosSettings((prev) => ({
                              ...prev,
                              openDrawerOnPrint: v,
                            }))
                          }
                          className="scale-75 data-[state=checked]:bg-indigo-600"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div className="flex items-center justify-between p-2 bg-white rounded-xl border border-indigo-50">
                        <Label className="text-[9px] font-black text-slate-500 uppercase">
                          Large Header
                        </Label>
                        <Switch
                          checked={posSettings.doubleHeightHeader}
                          onCheckedChange={(v) =>
                            setPosSettings((prev) => ({
                              ...prev,
                              doubleHeightHeader: v,
                            }))
                          }
                          className="scale-75 data-[state=checked]:bg-indigo-600"
                        />
                      </div>
                      <div className="flex items-center justify-between p-2 bg-white rounded-xl border border-indigo-50">
                        <Label className="text-[9px] font-black text-slate-500 uppercase">
                          Feed Lines
                        </Label>
                        <Input
                          type="number"
                          value={posSettings.feedLines}
                          onChange={(e) =>
                            setPosSettings((prev) => ({
                              ...prev,
                              feedLines: parseInt(e.target.value) || 0,
                            }))
                          }
                          className="w-12 h-6 p-0 text-center text-[10px] font-black bg-slate-50 border-none outline-none"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="text-[8px] font-black uppercase tracking-widest text-indigo-400 block mb-1 px-1">
                        Paper Width
                      </label>
                      <div className="flex gap-1 p-1 bg-white rounded-xl border border-indigo-100">
                        {[
                          { w: 32, label: "32ch · 58mm" },
                          { w: 42, label: "42ch · 80mm" },
                          { w: 48, label: "48ch" },
                        ].map(({ w, label }) => (
                          <button
                            key={w}
                            onClick={() =>
                              setPosSettings((prev) => ({
                                ...prev,
                                printerWidth: w,
                              }))
                            }
                            className={cn(
                              "flex-1 h-7 rounded-lg text-[8px] font-black transition-all",
                              posSettings.printerWidth === w
                                ? "bg-indigo-600 text-white"
                                : "text-indigo-300 hover:bg-indigo-50",
                            )}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="p-4 bg-slate-900 rounded-3xl space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="text-[9px] font-black uppercase tracking-widest text-slate-500">
                        Target Printer
                      </label>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-[8px] font-black text-slate-400 hover:text-white"
                        onClick={async () => {
                          try {
                            if (window.electronAPI) {
                              const data =
                                await window.electronAPI.getPrinters();
                              setAvailablePrinters(
                                Array.isArray(data) ? data : [],
                              );
                            } else {
                              const response = await fetch(
                                `${posSettings.printServerUrl}/printers`,
                              );
                              if (response.ok) {
                                const data = await response.json();
                                setAvailablePrinters(
                                  Array.isArray(data) ? data : [],
                                );
                              }
                            }
                          } catch (e) {
                            console.error(e);
                          }
                        }}
                      >
                        <RefreshCw className="h-3 w-3 mr-1" /> RELOAD
                      </Button>
                    </div>
                    <Select
                      value={posSettings.printerName || "default"}
                      onValueChange={(val) =>
                        setPosSettings((prev) => ({
                          ...prev,
                          printerName: val === "default" ? "" : val,
                        }))
                      }
                    >
                      <SelectTrigger className="h-10 text-[10px] font-black bg-white/5 border-white/10 text-white rounded-xl focus:ring-0 outline-none">
                        <SelectValue placeholder="System Default" />
                      </SelectTrigger>
                      <SelectContent className="rounded-2xl border-slate-800 bg-slate-900 text-white">
                        <SelectItem
                          value="default"
                          className="text-[10px] font-black"
                        >
                          System Default
                        </SelectItem>
                        {availablePrinters.map((p: any) => (
                          <SelectItem
                            key={p.name}
                            value={p.name}
                            className="text-[10px] font-black"
                          >
                            {p.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <label className="text-[9px] font-black uppercase tracking-widest text-slate-500 mt-2 block">
                      Second Printer (Optional)
                    </label>
                    <Select
                      value={posSettings.secondaryPrinterName || "disabled"}
                      onValueChange={(val) =>
                        setPosSettings((prev) => ({
                          ...prev,
                          secondaryPrinterName: val === "disabled" ? "" : val,
                        }))
                      }
                    >
                      <SelectTrigger className="h-10 text-[10px] font-black bg-white/5 border-white/10 text-white rounded-xl focus:ring-0 outline-none">
                        <SelectValue placeholder="Disabled" />
                      </SelectTrigger>
                      <SelectContent className="rounded-2xl border-slate-800 bg-slate-900 text-white">
                        <SelectItem
                          value="disabled"
                          className="text-[10px] font-black"
                        >
                          Disabled
                        </SelectItem>
                        {availablePrinters.map((p: any) => (
                          <SelectItem
                            key={`secondary-${p.name}`}
                            value={p.name}
                            className="text-[10px] font-black"
                          >
                            {p.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
              <div className="p-6 bg-slate-50 border-t border-slate-100">
                <Button
                  className="w-full h-12 rounded-[1.5rem] bg-slate-900 hover:bg-black text-white font-black uppercase tracking-widest shadow-xl transition-all active:scale-95"
                  onClick={() => setIsSettingsOpen(false)}
                >
                  Update Configuration
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          {/* Success/Confetti Modal */}
          <Dialog
            open={!!lastSuccessfulInvoice}
            onOpenChange={() => {
              setLastSuccessfulInvoice(null);
              setActiveView("products");
            }}
          >
            <DialogContent className="sm:max-w-[450px] p-0 overflow-hidden border-none rounded-[3rem] shadow-2xl outline-none">
              <DialogHeader className="sr-only">
                <DialogTitle>Sale Complete</DialogTitle>
                <DialogDescription>
                  Transaction processed successfully. You can now print the
                  receipt.
                </DialogDescription>
              </DialogHeader>
              <div className="bg-emerald-500 p-12 text-center text-white relative print:hidden">
                <div className="absolute top-0 left-0 w-full h-full opacity-10 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-white to-transparent" />
                <div className="relative z-10 flex flex-col items-center">
                  <div
                    className={cn(
                      "w-24 h-24 backdrop-blur-xl rounded-full flex items-center justify-center mb-6 shadow-2xl ring-4 ring-white/10 scale-110",
                      lastSuccessfulInvoice?._offline
                        ? "bg-amber-500/30"
                        : "bg-white/20",
                    )}
                  >
                    {lastSuccessfulInvoice?._offline ? (
                      <WifiOff className="h-12 w-12 text-white" />
                    ) : (
                      <CheckCircle2 className="h-12 w-12 text-white" />
                    )}
                  </div>
                  <h3 className="text-3xl font-black leading-tight mb-2">
                    {lastSuccessfulInvoice?._offline
                      ? "Saved Offline"
                      : "Sale Perfect!"}
                  </h3>
                  <p className="text-emerald-100  font-bold uppercase tracking-widest">
                    {lastSuccessfulInvoice?._offline
                      ? "Will sync when reconnected"
                      : lastSuccessfulInvoice?.fiscalCode
                        ? "Transaction Fiscalized"
                        : "Sale Complete"}
                  </p>
                </div>
              </div>
              <div className="p-10 bg-white space-y-8 flex flex-col items-center">
                <div className="hidden print:block w-full">
                  <Receipt48
                    invoice={lastSuccessfulInvoice}
                    company={resolvedCompany}
                    customer={resolvedCustomers?.find(
                      (c: any) => c.id === lastSuccessfulInvoice?.customerId,
                    )}
                    items={lastSuccessfulInvoice?.items}
                    user={user}
                    paperSize={
                      posSettings.paperSize ||
                      (resolvedCompany?.posSettings as any)?.receiptPaperSize ||
                      "80mm"
                    }
                    branch={resolvedCompany?.branches?.find(
                      (b: any) => b.id === (lastSuccessfulInvoice?.branchId || selectedBranchId)
                    )}
                  />
                </div>
                <div className="flex flex-col gap-3 w-full print:hidden">
                  {posSettings.printingEnabled && (
                    <Button
                      className="h-16 rounded-2xl bg-slate-900 hover:bg-black text-white font-black uppercase tracking-widest shadow-xl flex items-center justify-center gap-3"
                      onClick={() => handleSilentPrint()}
                    >
                      <Printer className="h-5 w-5" />
                      {posSettings.silentPrinting
                        ? "Silent Print"
                        : "Print Receipt"}
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    className="h-14 rounded-2xl font-black uppercase tracking-widest text-xs text-slate-400 hover:text-primary hover:bg-primary/5 active:scale-95"
                    onClick={() => {
                      setLastSuccessfulInvoice(null);
                      setActiveView("products");
                    }}
                  >
                    Proceed to Next Customer
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>

          {/* Hidden Receipt for Silent Printing */}
          <div
            className="fixed -left-[9999px] top-0 pointer-events-none overflow-hidden"
            style={{
              width:
                (posSettings.paperSize ||
                  (resolvedCompany?.posSettings as any)?.receiptPaperSize) ===
                "A4"
                  ? "210mm"
                  : posSettings.paperSize ||
                    (resolvedCompany?.posSettings as any)?.receiptPaperSize ||
                    "80mm",
            }}
          >
            {lastSuccessfulInvoice && (
              <Receipt48
                id="silent-receipt-48"
                invoice={lastSuccessfulInvoice}
                company={resolvedCompany}
                customer={resolvedCustomers?.find(
                  (c: any) => c.id === lastSuccessfulInvoice?.customerId,
                )}
                items={lastSuccessfulInvoice?.items}
                user={user}
                paperSize={
                  posSettings.paperSize ||
                  (resolvedCompany?.posSettings as any)?.receiptPaperSize ||
                  "80mm"
                }
                branch={resolvedCompany?.branches?.find(
                  (b: any) => b.id === (lastSuccessfulInvoice?.branchId || selectedBranchId)
                )}
              />
            )}
          </div>

          {/* Hidden Reprint Receipt */}
          <div
            className="fixed -left-[9999px] top-0 pointer-events-none overflow-hidden"
            style={{
              width:
                (posSettings.paperSize ||
                  (resolvedCompany?.posSettings as any)?.receiptPaperSize) ===
                "A4"
                  ? "210mm"
                  : posSettings.paperSize ||
                    (resolvedCompany?.posSettings as any)?.receiptPaperSize ||
                    "80mm",
            }}
          >
            {reprintInvoice && (
              <Receipt48
                id="reprint-receipt-48"
                invoice={reprintInvoice}
                company={resolvedCompany}
                customer={resolvedCustomers?.find(
                  (c: any) => c.id === reprintInvoice?.customerId,
                )}
                items={reprintInvoice?.items}
                originalInvoice={reprintInvoice?.originalInvoice}
                user={user}
                paperSize={
                  posSettings.paperSize ||
                  (resolvedCompany?.posSettings as any)?.receiptPaperSize ||
                  "80mm"
                }
                branch={resolvedCompany?.branches?.find(
                  (b: any) => b.id === (reprintInvoice?.branchId || selectedBranchId)
                )}
              />
            )}
          </div>

          {/* Reprint — single receipt confirm */}
          <Dialog
            open={!!reprintInvoice}
            onOpenChange={() => setReprintInvoice(null)}
          >
            <DialogContent className="sm:max-w-[400px] rounded-3xl p-0 overflow-hidden border-none">
              <DialogHeader className="sr-only">
                <DialogTitle>Reprint Receipt</DialogTitle>
                <DialogDescription>
                  Review and reprint a specific transaction receipt.
                </DialogDescription>
              </DialogHeader>
              <div className="bg-slate-900 p-6 text-white relative">
                <button
                  onClick={() => setReprintInvoice(null)}
                  className="absolute top-4 right-4 h-8 w-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-all"
                >
                  <XCircle className="h-4 w-4 text-white" />
                </button>
                <Printer className="h-8 w-8 mb-2 text-white/70" />
                <h3 className="text-lg font-black">Reprint Receipt</h3>
                <p className="text-slate-400 text-xs mt-0.5 font-bold">
                  {reprintInvoice?.invoiceNumber}
                </p>
              </div>
              <div className="p-6 bg-white space-y-3">
                <div className=" text-slate-600 space-y-1.5">
                  <div className="flex justify-between">
                    <span className="font-bold text-slate-400">Customer</span>
                    <span className="font-black">
                      {resolvedCustomers?.find(
                        (c: any) => c.id === reprintInvoice?.customerId,
                      )?.name || "Walk-in"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-bold text-slate-400">Total</span>
                    <span className="font-black text-emerald-600">
                      {fmt(Number(reprintInvoice?.total || 0))}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-bold text-slate-400">Payment</span>
                    <span className="font-black">
                      {reprintInvoice?.paymentMethod}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-bold text-slate-400">Type</span>
                    <span className="font-black">
                      {reprintInvoice?.transactionType || "Invoice"}
                    </span>
                  </div>
                </div>
                <Button
                  className="w-full h-12 rounded-xl bg-slate-900 hover:bg-black text-white font-black uppercase tracking-widest"
                  onClick={() => {
                    handleSilentPrint(reprintInvoice, {
                      elementId: "reprint-receipt-48",
                    });
                  }}
                >
                  <Printer className="h-4 w-4 mr-2" /> Print
                </Button>
                <Button
                  variant="ghost"
                  className="w-full h-10 rounded-xl font-black text-xs text-slate-400"
                  onClick={() => setReprintInvoice(null)}
                >
                  Back to List
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          {/* Today's Receipts List */}
          <Dialog
            open={isReprintOpen}
            onOpenChange={(v) => {
              setIsReprintOpen(v);
              if (!v) setReprintList([]);
            }}
          >
            <DialogContent className="sm:max-w-[480px] rounded-3xl p-0 overflow-hidden border-none max-h-[85vh] flex flex-col">
              <DialogHeader className="sr-only">
                <DialogTitle>Today's Receipts</DialogTitle>
                <DialogDescription>
                  Browse and select receipts from today's transactions for
                  reprinting.
                </DialogDescription>
              </DialogHeader>
              <div className="bg-slate-900 p-6 text-white relative shrink-0">
                <button
                  onClick={() => setIsReprintOpen(false)}
                  className="absolute top-4 right-4 h-8 w-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-all"
                >
                  <XCircle className="h-4 w-4 text-white" />
                </button>
                <Printer className="h-8 w-8 mb-2 text-white/70" />
                <h3 className="text-lg font-black">Today's Receipts</h3>
                <p className="text-slate-400 text-xs mt-0.5 font-bold">
                  Select a receipt to reprint
                </p>
              </div>
              <div className="flex-1 overflow-y-auto p-4 bg-white space-y-2">
                {reprintListLoading && (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
                  </div>
                )}
                {!reprintListLoading && reprintList.length === 0 && (
                  <div className="text-center py-12">
                    <Receipt className="h-10 w-10 text-slate-200 mx-auto mb-3" />
                    <p className="text-slate-400 font-bold ">
                      No receipts today
                    </p>
                  </div>
                )}
                {reprintList.map((inv: any) => (
                  <button
                    key={inv.id}
                    className="w-full flex items-center justify-between p-3 rounded-xl border border-slate-100 hover:border-slate-300 hover:bg-slate-50 transition-all text-left"
                    onClick={() => {
                      setReprintInvoice(inv);
                      setIsReprintOpen(false);
                    }}
                  >
                    <div>
                      <p className=" font-black text-slate-800">
                        {inv.invoiceNumber}
                      </p>
                      <p className="text-xs text-slate-400 font-bold">
                        {resolvedCustomers?.find(
                          (c: any) => c.id === inv.customerId,
                        )?.name || "Walk-in"}{" "}
                        · {inv.paymentMethod}
                      </p>
                      <p className="text-[10px] text-slate-300 font-bold">
                        {new Date(inv.createdAt).toLocaleTimeString()}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className=" font-black text-emerald-600">
                        {fmt(Number(inv.total))}
                      </p>
                      <p className="text-[10px] text-slate-400 font-bold">
                        {inv.transactionType || "Invoice"}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
              <div className="p-4 border-t border-slate-100 bg-slate-50 shrink-0">
                <Button
                  variant="ghost"
                  className="w-full h-10 rounded-xl font-black text-xs text-slate-400"
                  onClick={() => setIsReprintOpen(false)}
                >
                  Close
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          {/* Credit / Debit Note Modal */}
          <Dialog
            open={isCreditNoteOpen}
            onOpenChange={(v) => {
              setIsCreditNoteOpen(v);
              if (!v) setCnActiveInvoice(null);
            }}
          >
            <DialogContent className="sm:max-w-[520px] rounded-3xl p-0 overflow-hidden border-none max-h-[85vh] flex flex-col">
              <DialogHeader className="sr-only">
                <DialogTitle>Issue Credit or Debit Note</DialogTitle>
                <DialogDescription>
                  Select a recent invoice or search to issue a credit or debit
                  adjustment.
                </DialogDescription>
              </DialogHeader>
              <div className="bg-amber-500 p-6 text-white relative shrink-0">
                <button
                  onClick={() => {
                    setIsCreditNoteOpen(false);
                    setCnSearchResults([]);
                    setCnSearchQuery("");
                    setCnActiveInvoice(null);
                    setCnReason("");
                  }}
                  className="absolute top-4 right-4 h-8 w-8 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center transition-all"
                >
                  <XCircle className="h-4 w-4 text-white" />
                </button>
                <FileText className="h-8 w-8 mb-2 text-white/80" />
                <h3 className="text-xl font-black">
                  Issue Credit / Debit Note
                </h3>
                <p className="text-amber-100 text-xs mt-1">
                  Select a recent invoice or search for the original invoice
                </p>
              </div>
              <div className="flex-1 overflow-y-auto p-6 bg-white space-y-4">
                {/* Note type toggle */}
                <div className="flex bg-slate-100 p-1 rounded-xl">
                  {(["credit", "debit"] as const).map((t) => (
                    <button
                      key={t}
                      onClick={() => setCnType(t)}
                      className={cn(
                        "flex-1 py-2 rounded-lg text-xs font-black uppercase tracking-widest transition-all",
                        cnType === t
                          ? "bg-white text-amber-600 shadow-sm"
                          : "text-slate-400",
                      )}
                    >
                      {t === "credit"
                        ? "Credit Note (Return)"
                        : "Debit Note (Adjustment)"}
                    </button>
                  ))}
                </div>
                {/* Search */}
                <div className="flex gap-2">
                  <Input
                    placeholder="Invoice number or customer name..."
                    value={cnSearchQuery}
                    onChange={(e) => setCnSearchQuery(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleCnSearch()}
                    className="flex-1 h-10 rounded-xl border-slate-200  font-bold"
                  />
                  <Button
                    onClick={() => handleCnSearch()}
                    disabled={cnSearching}
                    className="h-10 px-4 rounded-xl font-black text-xs"
                  >
                    {cnSearching ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      "Search"
                    )}
                  </Button>
                </div>
                {/* Results / Selected Invoice */}
                {!cnActiveInvoice ? (
                  <>
                    {cnSearchResults.length > 0 && (
                      <div className="space-y-2 max-h-[280px] overflow-y-auto">
                        {cnSearchResults.map((inv: any) => (
                          <div
                            key={inv.id}
                            className="flex items-center justify-between p-3 rounded-xl border border-slate-100 hover:border-amber-200 hover:bg-amber-50 transition-all cursor-pointer"
                            onClick={() => handleSelectInvoiceForReturn(inv)}
                          >
                            <div>
                              <p className=" font-black text-slate-800">
                                {inv.invoiceNumber}
                              </p>
                              <p className="text-xs text-slate-400 font-bold">
                                {inv.customerName ||
                                  resolvedCustomers?.find(
                                    (c: any) => c.id === inv.customerId,
                                  )?.name ||
                                  "Customer"}{" "}
                                · {fmt(Number(inv.total))}
                              </p>
                              <p className="text-[10px] text-slate-300 font-bold">
                                {inv.paymentMethod} ·{" "}
                                {new Date(
                                  inv.issueDate || inv.createdAt,
                                ).toLocaleDateString()}
                              </p>
                            </div>
                            <Button
                              size="sm"
                              disabled={cnProcessing}
                              className="h-8 px-3 rounded-lg font-black text-xs bg-amber-50 hover:bg-amber-100 text-amber-600"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleSelectInvoiceForReturn(inv);
                              }}
                            >
                              {cnProcessing ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                "Select"
                              )}
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                    {cnSearchResults.length === 0 && !cnSearching && (
                        <p className="text-center text-slate-400  font-bold py-4">
                          No invoices found
                        </p>
                      )}
                  </>
                ) : (
                  <div className="space-y-3">
                    <div className="p-3 bg-amber-50 rounded-xl border border-amber-100 flex justify-between items-center">
                      <div>
                        <p className="text-xs font-black text-amber-800 uppercase tracking-widest">
                          Selected Invoice
                        </p>
                        <p className=" font-bold text-amber-900">
                          {cnActiveInvoice.invoiceNumber}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-amber-700 h-8"
                        onClick={() => setCnActiveInvoice(null)}
                      >
                        Change
                      </Button>
                    </div>
                    <div className="space-y-2 max-h-[250px] overflow-y-auto">
                      {cnSelectedItems.map((sel, idx) => (
                        <div
                          key={idx}
                          className="flex flex-col sm:flex-row sm:items-center justify-between p-3 rounded-xl border border-slate-100 bg-slate-50 gap-2"
                        >
                          <div className="flex-1">
                            <p className=" font-black text-slate-800">
                              {sel.originalItem.description}
                            </p>
                            <p className="text-xs text-slate-400 font-bold">
                              ${Number(sel.originalItem.unitPrice).toFixed(2)}{" "}
                              each (Max: {Number(sel.originalItem.quantity)})
                            </p>
                          </div>
                          <div className="flex items-center gap-3 bg-white p-1 rounded-lg border border-slate-200">
                            <Button
                              variant="ghost"
                              className="h-6 w-6 p-0 hover:bg-red-50 hover:text-red-500"
                              onClick={() => {
                                setCnSelectedItems((prev) =>
                                  prev.map((p, i) =>
                                    i === idx
                                      ? {
                                          ...p,
                                          quantity: Math.max(0, p.quantity - 1),
                                        }
                                      : p,
                                  ),
                                );
                              }}
                            >
                              <Minus className="h-3 w-3" />
                            </Button>
                            <span className="font-black  w-4 text-center">
                              {sel.quantity}
                            </span>
                            <Button
                              variant="ghost"
                              className="h-6 w-6 p-0 hover:bg-emerald-50 hover:text-emerald-500"
                              onClick={() => {
                                setCnSelectedItems((prev) =>
                                  prev.map((p, i) =>
                                    i === idx
                                      ? {
                                          ...p,
                                          quantity: Math.min(
                                            Number(p.originalItem.quantity),
                                            p.quantity + 1,
                                          ),
                                        }
                                      : p,
                                  ),
                                );
                              }}
                            >
                              <Plus className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                          Reason for{" "}
                          {cnType === "credit" ? "Return" : "Adjustment"}{" "}
                          <span className="text-red-500">*</span>
                        </Label>
                        {cnReason.length > 0 && (
                          <span className="text-[10px] font-bold text-emerald-500 uppercase">
                            Input Valid
                          </span>
                        )}
                      </div>
                      <textarea
                        placeholder="Explain why this note is being issued..."
                        className={cn(
                          "w-full h-20 rounded-xl border p-3  font-bold bg-slate-50 focus:outline-none focus:ring-2 transition-all",
                          !cnReason.trim()
                            ? "border-red-200 focus:ring-red-50 font-bold"
                            : "border-slate-200 focus:ring-amber-50",
                        )}
                        value={cnReason}
                        onChange={(e) => setCnReason(e.target.value)}
                      />
                      <p className="text-[9px] text-slate-400 font-bold uppercase tracking-tighter">
                        This field is required for tax compliance
                      </p>
                    </div>
                  </div>
                )}
              </div>
              <div className="p-4 border-t border-slate-100 bg-slate-50 shrink-0 flex gap-2">
                <Button
                  variant="ghost"
                  className="flex-1 h-10 rounded-xl font-black text-xs text-slate-400"
                  onClick={() => {
                    setIsCreditNoteOpen(false);
                    setCnSearchResults([]);
                    setCnSearchQuery("");
                    setCnActiveInvoice(null);
                  }}
                >
                  Cancel
                </Button>
                {cnActiveInvoice && (
                  <Button
                    disabled={
                      cnProcessing ||
                      cnSelectedItems.every((s) => s.quantity === 0) ||
                      !cnReason.trim()
                    }
                    className="flex-1 h-10 rounded-xl font-black text-xs bg-amber-500 hover:bg-amber-600 text-white"
                    onClick={handleIssueItemizedReturn}
                  >
                    {cnProcessing ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : null}
                    Issue {cnType === "credit" ? "CN" : "DN"}
                  </Button>
                )}
              </div>
            </DialogContent>
          </Dialog>

          {/* X / Z Report Modal */}
          <Dialog open={isReportOpen} onOpenChange={setIsReportOpen}>
            <DialogContent className="w-[96vw] max-w-[980px] rounded-3xl p-0 overflow-hidden border-none max-h-[94vh] flex flex-col">
              <DialogHeader className="sr-only">
                <DialogTitle>Daily Reports</DialogTitle>
                <DialogDescription>
                  Generate and view X-Reports and Z-Reports for daily
                  reconciliation.
                </DialogDescription>
              </DialogHeader>
              <div className="bg-purple-600 p-6 text-white relative shrink-0">
                <button
                  onClick={() => setIsReportOpen(false)}
                  className="absolute top-4 right-4 h-8 w-8 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center transition-all"
                >
                  <XCircle className="h-4 w-4 text-white" />
                </button>
                <div className="flex items-end justify-between pr-10">
                  <div>
                    <h3 className="text-xl font-black">
                      {reportType === "x" ? "X-Report" : "Z-Report"}
                    </h3>
                    <p className="text-purple-200 text-xs mt-1">
                      {reportType === "x"
                        ? "Current day summary"
                        : canViewZReport
                          ? "Closed day summary"
                          : "Available after close day/shift"}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    {reportData && !reportData.error && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 px-3 text-xs gap-2 bg-white/10 border-white/20 text-white hover:bg-white/20 hover:text-white rounded-xl"
                        onClick={async () => {
                          const doc = (
                            <FiscalReportPDF
                              type={reportType === "x" ? "X" : "Z"}
                              data={reportData}
                              company={company}
                            />
                          );
                          const blob = await pdf(doc).toBlob();
                          saveAs(
                            blob,
                            `Fiscal-${reportType.toUpperCase()}-Report-${dayjs().format("YYYY-MM-DD-HHmm")}.pdf`,
                          );
                        }}
                      >
                        <Download className="w-3.5 h-3.5" />
                        PDF
                      </Button>
                    )}
                    <div className="flex bg-purple-700/50 p-1 rounded-xl">
                      {(["x", "z"] as const).map((t) => (
                        <button
                          key={t}
                          onClick={() => handleLoadReport(t)}
                          className={cn(
                            "px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-widest transition-all",
                            reportType === t
                              ? "bg-white text-purple-600"
                              : "text-purple-200",
                            t === "z" && !canViewZReport && "text-amber-200",
                          )}
                        >
                          {t.toUpperCase()}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-6 bg-white space-y-4">
                {reportLoading && (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-purple-500" />
                  </div>
                )}
                {reportData?.error && (
                  <div className="bg-red-50 border border-red-100 rounded-2xl p-4 text-center">
                    <XCircle className="h-8 w-8 text-red-400 mx-auto mb-2" />
                    <p className=" font-black text-red-600">
                      {reportData.error}
                    </p>
                  </div>
                )}
                {reportData && !reportData.error && (
                  <>
                    {/* Summary Stats */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div className="bg-slate-50 rounded-2xl p-4 flex flex-col gap-1">
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                          Total Revenue
                        </p>
                        {reportData.currencies?.length > 0 ? (
                          reportData.currencies.map((c: any) => (
                            <p key={c.code} className="text-xl font-black text-slate-900">
                              {c.code} {Number(c.total).toFixed(2)}
                            </p>
                          ))
                        ) : (
                          <p className="text-xl font-black text-slate-900">0.00</p>
                        )}
                      </div>
                      <div className="bg-slate-50 rounded-2xl p-4">
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                          Items Sold
                        </p>
                        <p className="text-xl font-black text-slate-900">
                          {reportData.summary.productsSold}
                        </p>
                      </div>
                    </div>

                    {/* Currency Breakdown */}
                    <div className="border border-purple-100 rounded-2xl overflow-hidden mt-4">
                      <div className="bg-purple-600 px-4 py-2 flex items-center justify-between">
                        <span className="text-xs font-black text-white uppercase tracking-widest">
                          Revenue by Currency
                        </span>
                        <span className="text-xs font-black text-purple-200">
                          {reportData.summary.invoiceCount} invoices
                        </span>
                      </div>
                      <div className="divide-y divide-slate-50">
                        {reportData.currencies.map((c: any) => (
                          <div
                            key={c.code}
                            className="flex items-center justify-between px-4 py-3"
                          >
                            <span className=" font-bold text-slate-600">
                              {c.code}
                            </span>
                            <div className="flex items-center gap-4">
                              <span className="text-xs font-black text-slate-400">
                                {c.count} docs
                              </span>
                              <span className=" font-black text-emerald-600">
                                {Number(c.total).toFixed(2)}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Breakdown by Cashier */}
                    <div className="border border-slate-100 rounded-2xl overflow-hidden mt-4">
                      <div className="bg-slate-100 px-4 py-2">
                        <span className="text-xs font-black text-slate-500 uppercase tracking-widest">
                          Performance by Cashier
                        </span>
                      </div>
                      <div className="divide-y divide-slate-50">
                        {reportData.cashiers.map((cashier: any) => (
                          <div
                            key={cashier.cashierId}
                            className="flex items-center justify-between px-4 py-3"
                          >
                            <span className=" font-bold text-slate-700">
                              {cashier.name || "Unknown"}
                            </span>
                            <div className="flex items-center gap-4">
                              <span className="text-xs font-black text-slate-400">
                                {cashier.count} sales
                              </span>
                              <span className=" font-black text-slate-900">
                                {cashier.currency || "USD"} {Number(cashier.total).toFixed(2)}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Payment Method Summary */}
                    <div className="border border-slate-100 rounded-2xl overflow-hidden mt-4">
                      <div className="bg-emerald-600 px-4 py-2 flex items-center justify-between">
                        <span className="text-xs font-black text-white uppercase tracking-widest">
                          Summary by Payment Method
                        </span>
                        <span className="text-xs font-black text-emerald-100">
                          {reportData.paymentMethods?.length || 0} methods
                        </span>
                      </div>
                      <div className="divide-y divide-slate-50">
                        {(reportData.paymentMethods || []).map(
                          (method: any) => (
                            <div
                              key={method.method}
                              className="flex items-center justify-between px-4 py-3"
                            >
                              <span className=" font-bold text-slate-700">
                                {method.method}
                              </span>
                              <div className="flex items-center gap-4">
                                <span className="text-xs font-black text-slate-400">
                                  {method.count} payments
                                </span>
                                <span className=" font-black text-emerald-700">
                                  {method.currency || "USD"} {Number(method.total).toFixed(2)}
                                </span>
                              </div>
                            </div>
                          ),
                        )}
                        {(!reportData.paymentMethods ||
                          reportData.paymentMethods.length === 0) && (
                          <div className="px-4 py-3 text-xs font-bold text-slate-400">
                            No payment method breakdown available for this day.
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Itemized Sales (Collapsible) */}
                    <div className="border border-slate-100 rounded-2xl overflow-hidden mt-4">
                      <div className="bg-slate-800 px-4 py-2 flex items-center justify-between">
                        <span className="text-xs font-black text-white uppercase tracking-widest">
                          Itemized Sales ({reportData.items?.length || 0})
                        </span>
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-slate-200 hover:text-white transition-colors"
                          onClick={() => setIsItemizedExpanded((prev) => !prev)}
                        >
                          {isItemizedExpanded ? (
                            <ChevronUp className="h-3 w-3" />
                          ) : (
                            <ChevronDown className="h-3 w-3" />
                          )}
                          {isItemizedExpanded ? "Collapse" : "Expand"}
                        </button>
                      </div>
                      {isItemizedExpanded && (
                        <div className="divide-y divide-slate-50 max-h-[320px] overflow-y-auto">
                          {(reportData.items || []).map((item: any) => (
                            <div
                              key={item.productId}
                              className="flex items-center justify-between px-4 py-3"
                            >
                              <div className="flex flex-col">
                                <span className=" font-bold text-slate-700 truncate max-w-[340px]">
                                  {item.name}
                                </span>
                                <span className="text-[10px] text-slate-400 font-bold">
                                  Qty: {item.quantity}
                                </span>
                              </div>
                              <span className=" font-black text-slate-900">
                                {item.currency || "USD"} {Number(item.total).toFixed(2)}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Tax Distributions */}
                    <div className="border border-slate-100 rounded-2xl overflow-hidden mt-4">
                      <div className="bg-slate-50 px-4 py-2">
                        <span className="text-xs font-black text-slate-500 uppercase tracking-widest">
                          Tax Distributions
                        </span>
                      </div>
                      <div className="divide-y divide-slate-50">
                        {reportData.taxes.map((t: any) => (
                          <div
                            key={t.taxRate}
                            className="flex items-center justify-between px-4 py-2"
                          >
                            <span className="text-xs font-bold text-slate-500">
                              VAT {t.taxRate}%
                            </span>
                            <div className="flex gap-4">
                              <span className="text-[10px] font-black text-slate-400">
                                Net: ${Number(t.net).toFixed(2)}
                              </span>
                              <span className="text-xs font-black text-slate-800">
                                Tax: ${Number(t.tax).toFixed(2)}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>
            </DialogContent>
          </Dialog>

          {/* Quick Add Customer Dialog */}
          <Dialog
            open={isQuickAddCustomerOpen}
            onOpenChange={setIsQuickAddCustomerOpen}
          >
            <DialogContent className="sm:max-w-[420px] rounded-[2.5rem] p-0 overflow-hidden border-none shadow-2xl bg-white">
              <button
                onClick={() => setIsQuickAddCustomerOpen(false)}
                className="absolute top-4 right-4 h-8 w-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center transition-all z-10"
              >
                <XCircle className="h-4 w-4 text-slate-500" />
              </button>
              <div className="p-6 pt-12 space-y-4">
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase text-slate-400 tracking-widest pl-1">
                    Full Name
                  </Label>
                  <Input
                    placeholder="e.g. John Doe"
                    className="h-12 rounded-2xl bg-slate-50 border-none font-bold"
                    value={newCustomer.name}
                    onChange={(e) =>
                      setNewCustomer((prev) => ({
                        ...prev,
                        name: e.target.value,
                      }))
                    }
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase text-slate-400 tracking-widest pl-1">
                      Phone
                    </Label>
                    <Input
                      placeholder="07..."
                      className="h-12 rounded-2xl bg-slate-50 border-none font-bold"
                      value={newCustomer.phone}
                      onChange={(e) =>
                        setNewCustomer((prev) => ({
                          ...prev,
                          phone: e.target.value,
                        }))
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase text-slate-400 tracking-widest pl-1">
                      TIN (Optional)
                    </Label>
                    <Input
                      placeholder="10 digits"
                      className="h-12 rounded-2xl bg-slate-50 border-none font-bold"
                      value={newCustomer.tin}
                      onChange={(e) =>
                        setNewCustomer((prev) => ({
                          ...prev,
                          tin: e.target.value,
                        }))
                      }
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase text-slate-400 tracking-widest pl-1">
                    Email
                  </Label>
                  <Input
                    type="email"
                    placeholder="customer@example.com"
                    className="h-12 rounded-2xl bg-slate-50 border-none font-bold"
                    value={newCustomer.email}
                    onChange={(e) =>
                      setNewCustomer((prev) => ({
                        ...prev,
                        email: e.target.value,
                      }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase text-slate-400 tracking-widest pl-1">
                    VAT Number (Optional)
                  </Label>
                  <Input
                    placeholder="e.g. V12345678"
                    className="h-12 rounded-2xl bg-slate-50 border-none font-bold"
                    value={newCustomer.vatNumber}
                    onChange={(e) =>
                      setNewCustomer((prev) => ({
                        ...prev,
                        vatNumber: e.target.value,
                      }))
                    }
                  />
                </div>

                <Button
                  className="w-full h-14 rounded-2xl bg-slate-900 hover:bg-black text-white font-black uppercase tracking-widest mt-4 shadow-xl"
                  disabled={isCreatingCustomer || !newCustomer.name}
                  onClick={handleQuickAddCustomer}
                >
                  {isCreatingCustomer ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    "Create & Select"
                  )}
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          {/* ── ESC/POS Visual Preview Modal ── */}
          <Dialog
            open={!!simulationData}
            onOpenChange={(open) => {
              if (!open) setSimulationData(null);
            }}
          >
            <DialogContent className="sm:max-w-[400px] rounded-[3rem] border-none shadow-2xl p-0 overflow-hidden outline-none bg-slate-900">
              <DialogHeader className="p-6 text-white text-center pb-2">
                <div className="mx-auto w-12 h-12 rounded-2xl bg-primary/20 flex items-center justify-center mb-3">
                  <Printer className="h-6 w-6 text-primary" />
                </div>
                <DialogTitle className="text-xl font-black">
                  Virtual Receipt Preview
                </DialogTitle>
                <DialogDescription className="text-slate-400 font-bold uppercase text-[10px] tracking-widest mt-1">
                  Simulation Mode — No hardware required
                </DialogDescription>
              </DialogHeader>

              <div className="p-6 pt-2 flex flex-col items-center">
                <div className="w-full max-h-[500px] overflow-y-auto rounded-2xl border-4 border-slate-800 shadow-xl scrollbar-hide">
                  {simulationData && <EscPosVisualizer data={simulationData} />}
                </div>

                <Button
                  className="w-full mt-6 h-12 rounded-2xl font-black btn-gradient shadow-lg"
                  onClick={() => setSimulationData(null)}
                >
                  Close Preview
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>
    </PosLayout>
  );
}
