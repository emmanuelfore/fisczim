import React, { useEffect, useMemo, useState, useRef } from "react";
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
  FlatList,
  Keyboard,
  TouchableWithoutFeedback,
  KeyboardAvoidingView,
  Platform,
  Image,
  Alert,
  Animated,
  Easing,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import NetInfo from "@react-native-community/netinfo";
import { LinearGradient } from "expo-linear-gradient";
import {
  Moon,
  Sun,
  ShoppingCart,
  Search,
  Plus,
  Minus,
  User,
  Wifi,
  WifiOff,
  X,
  CheckCircle2,
  Download,
  Trash2,
  Tag,
  CreditCard,
  Banknote,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CloudUpload,
  History,
  ScanLine,
  CalendarDays,
  Menu,
  Printer,
  Bluetooth,
  ToggleLeft,
  ToggleRight,
  LayoutGrid,
  List,
  Clock,
  Play,
  Pause,
  MonitorSmartphone,
  Package,
  FileText,
  ArrowRight
} from "lucide-react-native";
import { usePrinter } from "../hooks/usePrinter";
import { PrinterSettingsModal } from "../ui/PrinterSettingsModal";
import { StatusBar } from "expo-status-bar";
import { useTheme, hexAlpha } from "../ui/PremiumColors";
import * as Haptics from "expo-haptics";
import { playCheckoutSound, playAddToCartSound } from "../lib/checkoutSound";
import { resolveMediaUrl } from "../lib/media";
import { useFrequentItems } from "../hooks/useFrequentItems";
import { useProducts, useCreateInvoice, useCustomers, useCompany, useCurrencies, useTaxTypes, useBranches } from "../hooks/usePosData";
import { apiFetch } from "../lib/api";
import { DoneTextInput as TextInput } from "../ui/DoneTextInput";
import { getSelectedBranchId, setSelectedBranchId } from "../lib/storage";
import { supabase } from "../lib/supabase";
import { ManagerPinModal } from "../ui/ManagerPinModal";
import {
  addPendingSale,
  getPendingSales,
  removePendingSale,
  addPendingShiftAction,
  getPendingShiftActions,
  removePendingShiftAction,
  getProvisionalShift,
  setProvisionalShift,
  getPendingNotes,
  removePendingNote,
} from "../lib/offlineQueue";

// ─── v3 colour tokens resolved at runtime via theme ──────────────────────────

const CAT_PALETTE = [
  "#f0a500", "#3b9eff", "#00d084", "#ff6b35",
  "#a78bfa", "#f43f5e", "#06b6d4", "#84cc16",
  "#fb923c", "#e879f9",
];

const PROD_EMOJIS = ["📦", "💼", "🏷️", "📋", "🗂️", "🔑", "⚙️", "🛠️", "🧩", "💡", "🎯", "🖥️", "📱", "🔧", "🗃️", "💎"];

/** Units sold by weight/volume — quantity is a decimal amount, price is per unit (e.g. per kg). */
const isWeighed = (p: any) => {
  return p?.sellByWeight === true;
};

/** Convert hex color + 2-digit hex alpha to rgba() — Android 7 doesn't support 8-char hex */
// hexAlpha moved to PremiumColors.tsx for global availability

const formatLocalDateInput = (date = new Date()) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const buildSaleIssueDate = (saleDate: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(saleDate)) return null;
  const [year, month, day] = saleDate.split("-").map(Number);
  const now = new Date();
  const issueDate = new Date(
    year,
    month - 1,
    day,
    now.getHours(),
    now.getMinutes(),
    now.getSeconds(),
    now.getMilliseconds()
  );
  if (Number.isNaN(issueDate.getTime())) return null;
  if (
    issueDate.getFullYear() !== year ||
    issueDate.getMonth() !== month - 1 ||
    issueDate.getDate() !== day
  ) {
    return null;
  }
  return issueDate;
};

const parseSaleDateOnly = (saleDate: string) => {
  const issueDate = buildSaleIssueDate(saleDate);
  return issueDate ? new Date(issueDate.getFullYear(), issueDate.getMonth(), issueDate.getDate()) : new Date();
};

const sameCalendarDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

interface CartItem {
  productId: number;
  name: string;
  price: number;
  quantity: number;
  discountAmount: number;
  taxRate: number;
  taxTypeId?: number | null;
  hsCode?: string;
  category?: string;
  stockLevel?: number;
  isTracked?: boolean;
  unitOfMeasure?: string;
  isWeighed?: boolean;
}

interface HeldSale {
  id: number | string;
  holdName: string;
  total: number;
  orderDiscount: number;
  createdAt: string;
  cartData: CartItem[];
  _offline?: boolean;
}

type Props = {
  companyId: number;
  userName?: string;
  onOpenDrawer: () => void;
  openCashCollectionSignal?: number;
};

const FlyingParticle = ({ startX, startY, endX, endY, onComplete, color, emoji }: { startX: number, startY: number, endX: number, endY: number, onComplete: () => void, color?: string, emoji?: string }) => {
  const anim = React.useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    Animated.timing(anim, {
      toValue: 1,
      duration: 650,
      easing: Easing.bezier(0.22, 1, 0.36, 1),
      useNativeDriver: true,
    }).start(onComplete);
  }, []);

  const arcPeak = Math.min(startY, endY) - 60;
  const translateX = anim.interpolate({ inputRange: [0, 1], outputRange: [startX, endX] });
  const translateY = anim.interpolate({ inputRange: [0, 0.45, 1], outputRange: [startY, arcPeak, endY] });
  const scale = anim.interpolate({ inputRange: [0, 0.15, 0.85, 1], outputRange: [0.4, 1.15, 0.95, 0.15] });
  const rotate = anim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const opacity = anim.interpolate({ inputRange: [0, 0.85, 1], outputRange: [0, 1, 0] });

  return (
    <Animated.View style={{
      position: 'absolute', left: 0, top: 0,
      transform: [{ translateX }, { translateY }, { scale }, { rotate }],
      opacity,
      zIndex: 9999, backgroundColor: color,
      width: 26, height: 26, borderRadius: 13,
      alignItems: 'center', justifyContent: 'center',
      shadowColor: color, shadowOpacity: 0.6, shadowRadius: 6, elevation: 10
    }}>
      <Text style={{ fontSize: 13 }}>{emoji}</Text>
    </Animated.View>
  );
};

// --- ProductImage component with fallback ---
const ProductImage = ({ url, fallbackColor, color }: { url: string; fallbackColor: string; color: string }) => {
  const [hasError, setHasError] = useState(false);

  if (hasError) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: hexAlpha(color, 0.02) }}>
        <Package size={32} color={fallbackColor} opacity={0.3} />
      </View>
    );
  }

  return (
    <Image
      source={{ uri: url }}
      style={{ width: "100%", height: "100%" }}
      resizeMode="cover"
      onError={() => setHasError(true)}
    />
  );
};
export function POSScreen({ companyId, userName, onOpenDrawer, openCashCollectionSignal = 0 }: Props) {
  const insets = useSafeAreaInsets();
  const { theme: C, isDark } = useTheme();
  const { width: windowWidth } = useWindowDimensions();
  const isWide = windowWidth >= 768;

  // Unified Brand Core
  const POS_SURFACE = C.bg.base; 
  const POS_SURFACE_SOFT = C.bg.primary;
  const POS_SURFACE_RAISED = C.bg.card;
  const POS_BORDER = C.bg.glassBorder;
  const POS_BORDER_STRONG = hexAlpha(C.amber.primary, isDark ? 0.25 : 0.4);
  const POS_OVERLAY = hexAlpha(C.bg.base, isDark ? 0.92 : 0.96);

  const [isOnline, setIsOnline] = useState(true);
  const isOnlineRef = React.useRef(true);
  const [queueCount, setQueueCount] = useState(0);

  const { data: branchesData, isLoading: loadingBranches } = useBranches(companyId);
  const [flyingItems, setFlyingItems] = useState<{ id: number; x: number; y: number; color: string; emoji: string }[]>([]);
  const cartIconRef = useRef<View>(null);
  const [cartPos, setCartPos] = useState<{ x: number; y: number } | null>(null);
  const cartBounceAnim = useRef(new Animated.Value(1)).current;
  const [weightProduct, setWeightProduct] = useState<any | null>(null);
  const [weightInput, setWeightInput] = useState("");

  const triggerCartBounce = () => {
    Animated.sequence([
      Animated.timing(cartBounceAnim, { toValue: 1.18, duration: 120, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.spring(cartBounceAnim, { toValue: 1, friction: 3.5, tension: 60, useNativeDriver: true })
    ]).start();
  };

  const measureCart = () => {
    cartIconRef.current?.measureInWindow((x, y, width, height) => {
      if (width > 0) {
        setCartPos({ x: x + width / 2, y: y + height / 2 });
      }
    });
  };
  const [selectedBranchId, setInternalBranchId] = useState<number | null>(null);

  useEffect(() => {
    getSelectedBranchId().then(id => {
      if (id) setInternalBranchId(id);
    });
  }, []);

  const {
    data: productsData,
    isLoading: loadingProducts,
    fromCache: productsFromCache,
    refresh: refreshProducts
  } = useProducts(companyId);
  const { data: customersData, fromCache: customersFromCache, refresh: refreshCustomers } = useCustomers(companyId);
  const { data: company } = useCompany(companyId);
  const { data: currencies } = useCurrencies(companyId);
  const { data: taxTypes } = useTaxTypes(companyId);
  const { create: createInvoice } = useCreateInvoice(companyId);

  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [priceInputs, setPriceInputs] = useState<Record<number, string>>({});
  const [focusedPriceProductId, setFocusedPriceProductId] = useState<number | null>(null);
  const [selectedCustomerId, setSelectedCustomerId] = useState<number | null>(null);
  const [selectedCurrency, setSelectedCurrency] = useState("USD");
  const [orderDiscount, setOrderDiscount] = useState(0);
  const [orderDiscountInput, setOrderDiscountInput] = useState("");
  const [showCheckout, setShowCheckout] = useState(false);
  const [showOfflineQueue, setShowOfflineQueue] = useState(false);
  const [offlineQueueData, setOfflineQueueData] = useState<any[]>([]);
  const [showCustomerPicker, setShowCustomerPicker] = useState(false);
  const [paidAmount, setPaidAmount] = useState("");
  const [saleDate, setSaleDate] = useState(formatLocalDateInput());
  const [showSaleDatePicker, setShowSaleDatePicker] = useState(false);
  const [datePickerMonth, setDatePickerMonth] = useState(() => {
    const today = new Date();
    return new Date(today.getFullYear(), today.getMonth(), 1);
  });
  const [heldSales, setHeldSales] = useState<HeldSale[]>([]);
  const [showHoldsModal, setShowHoldsModal] = useState(false);
  const [holdName, setHoldName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [showPrinterSettings, setShowPrinterSettings] = useState(false);
  const { config: printerConfig, print, isPrinting, failedPrints, retryFailedPrints } = usePrinter();
  const { frequent, recordAdd } = useFrequentItems(companyId);

  const [lastInvoice, setLastInvoice] = useState<any | null>(null);
  const [user, setUser] = useState<any | null>(null);
  const [cashierName, setCashierName] = useState<string>("Cashier");
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isParking, setIsParking] = useState(false);
  const [isAmountFocused, setIsAmountFocused] = useState(false);
  const [showBranchPicker, setShowBranchPicker] = useState(false);
  const [fiscalStatus, setFiscalStatus] = useState<string>("Day Closed");
  const [viewMode, setViewMode] = useState<"list" | "grid">("list");

  const fetchFiscalStatus = async () => {
    if (!isOnline) return;
    try {
      const res = await apiFetch(`/api/companies/${companyId}/zimra/status`);
      if (res.ok) {
        const data = await res.json();
        setFiscalStatus(data.fiscalDayStatus || "Day Closed");
      }
    } catch { /* ignore */ }
  };

  useEffect(() => {
    fetchFiscalStatus();
    const interval = setInterval(fetchFiscalStatus, 30000); // 30s
    return () => clearInterval(interval);
  }, [companyId, isOnline]);

  const [currentShift, setCurrentShift] = useState<any | null>(null);
  const [showShiftModal, setShowShiftModal] = useState(false);
  const [shiftModalType, setShiftModalType] = useState<"OPEN" | "CLOSE">("OPEN");
  const [shiftBalance, setShiftBalance] = useState("");

  const [pendingOverride, setPendingOverride] = useState<{ type: "DISCOUNT" | "VOID_CART"; data: any } | null>(null);

  // Vendor Productivity States
  const [showPayoutModal, setShowPayoutModal] = useState(false);
  const [transactionType, setTransactionType] = useState<"PAYOUT" | "DROP">("PAYOUT");
  const [payoutAmount, setPayoutAmount] = useState("");
  const [payoutReason, setPayoutReason] = useState("");
  const [showSummaryModal, setShowSummaryModal] = useState(false);
  const [shiftSummary, setShiftSummary] = useState<any>(null);
  const [isFetchingSummary, setIsFetchingSummary] = useState(false);
  const [userRole, setUserRole] = useState<string>("member");
  const [isSupervisorAuthVisible, setIsSupervisorAuthVisible] = useState(false);
  const [supervisorAction, setSupervisorAction] = useState<"DROP" | "CLOSE" | null>(null);
  const [showQuickMenu, setShowQuickMenu] = useState(false);

  // Admin Collection States
  const [cashierBalances, setCashierBalances] = useState<any[]>([]);
  const [isFetchingCashierBalances, setIsFetchingCashierBalances] = useState(false);
  const [selectedCashierBalance, setSelectedCashierBalance] = useState<any>(null);

  const fetchCashierBalances = async () => {
    if (userRole !== "admin" && userRole !== "owner") return;
    setIsFetchingCashierBalances(true);
    try {
      const res = await apiFetch(`/api/companies/${companyId}/reports/cash-collection-balances?mode=sinceLastCollection`);
      if (res.ok) {
        const data = await res.json();
        setCashierBalances(Array.isArray(data) ? data : []);
      }
    } catch (e) {
      console.error("Failed to fetch cashier cash balances", e);
    } finally {
      setIsFetchingCashierBalances(false);
    }
  };

  useEffect(() => {
    if (showPayoutModal && (userRole === "admin" || userRole === "owner")) {
      fetchCashierBalances();
    }
  }, [showPayoutModal]);

  useEffect(() => {
    if (!openCashCollectionSignal) return;
    setTransactionType("DROP");
    setSelectedCashierBalance(null);
    setPayoutAmount("");
    setPayoutReason("");
    setShowQuickMenu(false);
    setShowPayoutModal(true);
  }, [openCashCollectionSignal]);

  // Sync input field when orderDiscount is changed from OUTSIDE (e.g. resuming hold, manager override)
  // Use a ref to avoid the loop: don't overwrite when the user is actively typing
  const isTypingDiscount = React.useRef(false);
  useEffect(() => {
    if (!isTypingDiscount.current) {
      setOrderDiscountInput(orderDiscount === 0 ? "" : orderDiscount.toString());
    }
  }, [orderDiscount]);

  const resolvedProducts: any[] = (productsData || []).filter((p: any) => p && p.isActive !== false);
  const resolvedCustomers: any[] = (customersData || []).filter((c: any) => c && c.isActive !== false);
  const resolvedCurrencies: any[] = (currencies || []).filter((c: any) => c && c.isActive !== false);
  const taxInclusive = company?.vatEnabled ?? false;

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      const online = !!state.isConnected && !!state.isInternetReachable;
      isOnlineRef.current = online;
      setIsOnline(online);
      if (online) syncQueuedRef.current(false);
    });
    return () => unsubscribe();
  }, [companyId]);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
        setUser(data.user);
        setCashierName(
          data.user.user_metadata?.full_name ||
          data.user.user_metadata?.name ||
          data.user.email?.split("@")[0] ||
          "Cashier"
        );
      }
    });

    // Fetch role
    apiFetch(`/api/companies/${companyId}/my-role`)
      .then(res => res.json())
      .then(data => setUserRole(data.role || "member"))
      .catch(() => setUserRole("member"));
  }, [companyId]);

  useEffect(() => {
    if (showSuccess) {
      // Don't auto-close if silentPrint, autoPrint, or autoShowModal is on
      if (printerConfig.silentPrint || printerConfig.autoPrint || printerConfig.autoShowModal) {
        return;
      }
      const timer = setTimeout(() => {
        setShowSuccess(false);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [showSuccess, printerConfig.silentPrint, printerConfig.autoPrint, printerConfig.autoShowModal]);

  useEffect(() => {
    let cancelled = false;
    const refreshQueue = async () => {
      const sales = await getPendingSales(companyId);
      const shifts = await getPendingShiftActions(companyId);
      const notes = await getPendingNotes(companyId);
      if (!cancelled) setQueueCount(sales.length + shifts.length + notes.length);
    };
    refreshQueue();
    const id = setInterval(refreshQueue, 5000);
    return () => { cancelled = true; clearInterval(id); };
  }, [companyId]);




  const defaultCustomerId = useMemo(() => {
    if (!resolvedCustomers.length) return null;
    const flagged = resolvedCustomers.find((c: any) => c.isDefault === true);
    if (flagged) return flagged.id;
    const named = resolvedCustomers.find((c: any) =>
      c.name.toLowerCase().includes("walk-in") ||
      c.name.toLowerCase().includes("cash") ||
      c.name.toLowerCase().includes("guest")
    );
    return named ? named.id : resolvedCustomers[0].id;
  }, [resolvedCustomers]);

  useEffect(() => {
    if (!selectedCustomerId && defaultCustomerId) setSelectedCustomerId(defaultCustomerId);
  }, [defaultCustomerId, selectedCustomerId]);

  const resetToDefaultCustomer = () => {
    if (defaultCustomerId) setSelectedCustomerId(defaultCustomerId);
  };

  const categories = useMemo(() => {
    if (!resolvedProducts.length) return ["All"];
    const cats = new Set(resolvedProducts.map((p: any) => p.category || "Uncategorized"));
    return ["All", ...Array.from(cats)];
  }, [resolvedProducts]);

  const filteredProducts = useMemo(() => {
    try {
      const normalizedSearch = search.trim().toLowerCase();
      return resolvedProducts.filter((p: any) => {
        if (!p) return false;
        const matchesSearch =
          !normalizedSearch ||
          (p.name?.toLowerCase().includes(normalizedSearch) ?? false) ||
          (p.sku?.toLowerCase().includes(normalizedSearch) ?? false);
        const matchesCategory = selectedCategory === "All" || p.category === selectedCategory;
        return normalizedSearch ? matchesSearch : matchesCategory;
      });
    } catch (e) {
      console.error("FilteredProducts error:", e);
      return [];
    }
  }, [resolvedProducts, search, selectedCategory]);

  const currencyInfo = useMemo(() => {
    if (selectedCurrency === "USD") return { symbol: "$", rate: 1 };
    const cur = (currencies || []).find((c: any) => c.code === selectedCurrency);
    return {
      symbol: cur?.symbol || selectedCurrency,
      rate: Number(cur?.exchangeRate || 1)
    };
  }, [selectedCurrency, currencies]);

  const fmt = (val: number) => {
    const converted = val * currencyInfo.rate;
    return `${currencyInfo.symbol}${converted.toFixed(2)}`;
  };

  const fmtQty = (item: CartItem) => {
    if (item.isWeighed) {
      return `${Number(item.quantity).toFixed(3).replace(/\.?0+$/, "")} ${item.unitOfMeasure ?? ""}`.trim();
    }
    return String(item.quantity);
  };

  const handleSaleDateChange = (value: string) => {
    const digits = value.replace(/\D/g, "").slice(0, 8);
    const parts = [
      digits.slice(0, 4),
      digits.slice(4, 6),
      digits.slice(6, 8),
    ].filter(Boolean);
    setSaleDate(parts.join("-"));
  };

  const openSaleDatePicker = () => {
    Keyboard.dismiss();
    const selected = parseSaleDateOnly(saleDate);
    setDatePickerMonth(new Date(selected.getFullYear(), selected.getMonth(), 1));
    setShowSaleDatePicker((visible) => !visible);
  };

  const saleDatePickerDays = useMemo(() => {
    const year = datePickerMonth.getFullYear();
    const month = datePickerMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const days: Array<Date | null> = [];
    for (let i = 0; i < firstDay.getDay(); i++) days.push(null);
    for (let day = 1; day <= lastDay.getDate(); day++) {
      days.push(new Date(year, month, day));
    }
    while (days.length % 7 !== 0) days.push(null);
    return days;
  }, [datePickerMonth]);

  const selectSaleDate = (date: Date) => {
    setSaleDate(formatLocalDateInput(date));
    setShowSaleDatePicker(false);
  };

  useEffect(() => {
    if (!showCheckout) {
      setPriceInputs({});
      setFocusedPriceProductId(null);
      return;
    }
    setPriceInputs((prev) => {
      const next: Record<number, string> = {};
      cart.forEach((item) => {
        next[item.productId] = focusedPriceProductId === item.productId
          ? (prev[item.productId] ?? "")
          : (item.price * currencyInfo.rate).toFixed(2);
      });
      return next;
    });
  }, [showCheckout, cart, currencyInfo.rate, focusedPriceProductId]);

  const { subtotal, taxAmount } = useMemo(() => {
    try {
      let sub = 0; let tax = 0;
      cart.forEach((item: CartItem) => {
        if (!item) return;
        const lineTotal = Number(item.price || 0) * Number(item.quantity || 0) - Number(item.discountAmount || 0);
        const rate = (item.taxRate || 0) / 100;
        if (taxInclusive) {
          const taxPortion = lineTotal - lineTotal / (1 + rate);
          sub += lineTotal - taxPortion; tax += taxPortion;
        } else {
          sub += lineTotal; tax += lineTotal * rate;
        }
      });
      return { subtotal: sub, taxAmount: tax };
    } catch (e) {
      console.error("Subtotal calc error:", e);
      return { subtotal: 0, taxAmount: 0 };
    }
  }, [cart, taxInclusive]);

  const total = Math.max(0, subtotal + taxAmount - orderDiscount);
  const isEditingItemPrice = focusedPriceProductId !== null;

  // Keep tendered amount aligned when checkout totals change from currency or price edits.
  useEffect(() => {
    if (showCheckout && !isAmountFocused) {
      setPaidAmount((total * currencyInfo.rate).toFixed(2));
    }
  }, [showCheckout, selectedCurrency, total, currencyInfo.rate, isAmountFocused]);

  const selectedCustomer = resolvedCustomers.find((c: any) => c.id === selectedCustomerId);
  const isDefaultCustomerSelected = selectedCustomerId === defaultCustomerId;

  const addToCart = (product: any, event?: any, qty?: number) => {
    if (isWeighed(product) && qty === undefined) {
      setWeightProduct(product);
      setWeightInput("");
      return;
    }
    const availableStock = Number(product.branchStock ?? product.stockLevel ?? 0);
    if (product.isTracked) {
      const inCart = cart.find((item: CartItem) => item.productId === product.id)?.quantity || 0;
      const nextQty = inCart + (qty ?? 1);
      if (nextQty > availableStock) {
        if (availableStock === 0) {
          Alert.alert("Out of Stock", `${product.name} is out of stock in this branch.`);
        } else {
          Alert.alert("Insufficient Stock", `Only ${availableStock} ${product.unitOfMeasure ?? "units"} available for ${product.name}.`);
        }
        return;
      }
    }

    // Spawn flying particle animation towards cart
    if (event?.nativeEvent && cartPos) {
      const { pageX, pageY } = event.nativeEvent;
      const idx = (product.id || 0) % CAT_PALETTE.length;
      const id = Date.now() + Math.random();
      setFlyingItems(prev => [...prev, { id, x: pageX - 13, y: pageY - 13, color: CAT_PALETTE[idx], emoji: PROD_EMOJIS[idx] }]);
      setTimeout(triggerCartBounce, 640);
    }

    const existing = cart.find((item: CartItem) => item.productId === product.id);
    if (existing) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } else {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    playAddToCartSound().catch(() => {});

    setCart((prev: CartItem[]) => {
      const existingInPre = prev.find((item: CartItem) => item.productId === product.id);
      const addQty = qty ?? 1;
      if (existingInPre) {
        return prev.map((item: CartItem) =>
          item.productId === product.id ? { ...item, quantity: +(item.quantity + addQty).toFixed(3) } : item
        );
      }
      let taxRate = company?.vatRegistered ? Number(product.taxRate ?? 15) : 0;
      if (company?.vatRegistered && product.taxCategoryId && taxTypes) {
        const category = (taxTypes as any[]).find((t: any) => t.id === product.taxCategoryId);
        if (category) taxRate = Number(category.rate);
      }
      return [...prev, {
        productId: product.id, name: product.name, price: Number(product.price),
        quantity: addQty, discountAmount: 0, taxRate,
        taxTypeId: product.taxTypeId, hsCode: product.hsCode, category: product.category,
        stockLevel: availableStock, isTracked: product.isTracked,
        unitOfMeasure: product.unitOfMeasure ?? product.unit,
        isWeighed: isWeighed(product),
      }];
    });
    // Record this product as frequently sold (fire-and-forget)
    recordAdd({ productId: product.id, name: product.name, price: Number(product.price), category: product.category });
  };

  const updateQuantity = (productId: number, delta: number, event?: any) => {
    const item = cart.find((it: CartItem) => it.productId === productId);
    if (!item) return;
    const step = item.isWeighed ? 0.1 : 1;
    const nextQty = +(item.quantity + delta * step).toFixed(3);
    if (delta < 0 && nextQty < step) {
      return;
    }
    if (delta > 0 && item.isTracked && nextQty > (item.stockLevel || 0)) {
      return;
    }

    if (delta > 0 && event?.nativeEvent && cartPos) {
      const { pageX, pageY } = event.nativeEvent;
      const idx = productId % CAT_PALETTE.length;
      const id = Date.now() + Math.random();
      setFlyingItems(prev => [...prev, { id, x: pageX - 13, y: pageY - 13, color: CAT_PALETTE[idx], emoji: PROD_EMOJIS[idx] }]);
      setTimeout(triggerCartBounce, 640);
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (delta > 0) {
      playAddToCartSound().catch(() => {});
    }
    setCart((prev: CartItem[]) =>
      prev.map((it: CartItem) => {
        if (it.productId !== productId) return it;
        const newQty = +(it.quantity + delta * step).toFixed(3);
        if (newQty < step) return it;
        if (it.isTracked && newQty > (it.stockLevel || 0)) return it;
        return { ...it, quantity: newQty };
      })
    );
  };

  const removeFromCart = (productId: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setCart((prev: CartItem[]) => prev.filter((item: CartItem) => item.productId !== productId));
  };

  const confirmWeightAdd = () => {
    if (!weightProduct) return;
    const amount = Number.parseFloat(weightInput.replace(",", "."));
    const unitPrice = Number(weightProduct?.price ?? 0);
    if (!Number.isFinite(amount) || amount <= 0) {
      Alert.alert("Invalid Amount", "Enter an amount greater than zero.");
      return;
    }
    if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
      Alert.alert("Invalid Price", "This item has no unit price set.");
      return;
    }
    const weight = amount / unitPrice;
    addToCart(weightProduct, undefined, +weight.toFixed(3));
    setWeightProduct(null);
    setWeightInput("");
  };

  const updateItemPrice = (productId: number, value: string) => {
    const normalized = value.replace(",", ".");
    const parsedPrice = Number.parseFloat(normalized);
    if (!Number.isFinite(parsedPrice) || parsedPrice < 0) return;
    const nextPrice = parsedPrice;
    setCart((prev: CartItem[]) =>
      prev.map((item: CartItem) => {
        if (item.productId !== productId) return item;
        const maxDiscount = nextPrice * item.quantity;
        return {
          ...item,
          price: nextPrice,
          discountAmount: Math.min(item.discountAmount || 0, maxDiscount),
        };
      })
    );
  };

  const handleItemPriceInput = (productId: number, value: string) => {
    setPriceInputs((prev) => ({ ...prev, [productId]: value }));
    const parsed = Number.parseFloat(value.replace(",", "."));
    if (Number.isFinite(parsed)) {
      updateItemPrice(productId, (parsed / currencyInfo.rate).toString());
    }
  };

  const handleItemPriceFocus = (item: CartItem) => {
    setFocusedPriceProductId(item.productId);
    setPriceInputs((prev) => ({
      ...prev,
      [item.productId]: prev[item.productId] ?? (item.price * currencyInfo.rate).toFixed(2),
    }));
  };

  const handleItemPriceBlur = (item: CartItem) => {
    const currentInput = priceInputs[item.productId] ?? "";
    const parsed = Number.parseFloat(currentInput.replace(",", "."));
    if (Number.isFinite(parsed) && parsed >= 0) {
      updateItemPrice(item.productId, (parsed / currencyInfo.rate).toString());
    }
    setPriceInputs((prev) => ({
      ...prev,
      [item.productId]: (Number.isFinite(parsed) && parsed >= 0 ? parsed : item.price * currencyInfo.rate).toFixed(2),
    }));
  };

  const finishItemPriceEdit = (item: CartItem) => {
    handleItemPriceBlur(item);
    setFocusedPriceProductId(null);
    Keyboard.dismiss();
  };

  const handleOrderDiscountChange = (val: string) => {
    isTypingDiscount.current = true;
    setOrderDiscountInput(val);
    const amount = parseFloat(val.replace(",", ".")) || 0;
    const rawTotal = subtotal + taxAmount;
    // Apply immediately (capped at total) so the discount shows live
    setOrderDiscount(Math.min(amount, rawTotal));
    isTypingDiscount.current = false;
  };

  const handleDiscountSubmit = () => {
    isTypingDiscount.current = false;
    const amount = parseFloat(orderDiscountInput.replace(",", ".")) || 0;
    const rawTotal = subtotal + taxAmount;
    if (amount > rawTotal) { setOrderDiscount(rawTotal); setOrderDiscountInput(rawTotal.toString()); return; }
    // > 50% of subtotal requires manager override
    if (amount > subtotal * 0.5) setPendingOverride({ type: "DISCOUNT", data: amount });
    else setOrderDiscount(amount);
  };

  const handleClearCart = () => {
    if (!cart.length) return;
    setPendingOverride({ type: "VOID_CART", data: null });
  };

  const fetchHeldSales = async () => {
    try {
      const res = await apiFetch(`/api/pos/holds?companyId=${companyId}`);
      if (res.ok) {
        const data = (await res.json()) as any[];
        setHeldSales(data.map((h) => ({
          id: h.id, holdName: h.holdName, total: Number(h.total || 0),
          orderDiscount: Number(h.orderDiscount || 0), createdAt: h.createdAt,
          cartData: h.cartData || [], _offline: h._offline
        })));
      }
    } catch { /* ignore */ }
  };

  useEffect(() => { fetchHeldSales(); }, [companyId]);

  const fetchShift = async () => {
    if (isOnline) {
      try {
        const res = await apiFetch(`/api/pos/shifts/current?companyId=${companyId}`);
        if (res.ok) {
          const data = await res.json();
          setCurrentShift(data || null);
          await setProvisionalShift(companyId, null);
          return;
        }
      } catch { /* ignore */ }
    }
    const provisional = await getProvisionalShift(companyId);
    if (provisional) setCurrentShift(provisional);
  };

  useEffect(() => { fetchShift(); }, [companyId, isOnline]);

  const openShift = async () => {
    Keyboard.dismiss();
    const openingBalance = shiftBalance || "0";
    try {
      if (isOnline) {
        const res = await apiFetch("/api/pos/shifts/open", {
          method: "POST",
          headers: { "Idempotency-Key": `shift-open-${companyId}-${openingBalance}` },
          body: JSON.stringify({ companyId, openingBalance })
        });
        if (res.ok) { setShowShiftModal(false); setShiftBalance(""); await fetchShift(); return; }
        else Alert.alert("Shift Error", await res.text().catch(() => "Unknown error"));
      }
      await addPendingShiftAction({ companyId, branchId: selectedBranchId, type: "open", payload: { openingBalance } });
      const provisional = { id: Date.now(), companyId, status: "OPEN", openingBalance, openedAt: new Date().toISOString(), _provisional: true };
      setCurrentShift(provisional);
      await setProvisionalShift(companyId, provisional);
      setShowShiftModal(false); setShiftBalance("");
    } catch { /* ignore */ }
  };

  const closeShift = async (supervisorId?: string) => {
    Keyboard.dismiss();
    if (!currentShift) return;
    const closingBalance = shiftBalance || "0";

    try {
      if (isOnline && !currentShift._provisional) {
        const res = await apiFetch(`/api/pos/shifts/${currentShift.id}/close`, {
          method: "POST",
          headers: { "Idempotency-Key": `shift-close-${currentShift.id}-${closingBalance}` },
          body: JSON.stringify({
            closingBalance,
            reconciledBy: supervisorId
          })
        });
        if (res.ok) {
          const payload = await res.json().catch(() => null);
          setCurrentShift(null);
          await setProvisionalShift(companyId, null);
          setShowShiftModal(false);
          setShiftBalance("");
          if (payload?.summary) {
            setShiftSummary(payload.summary);
            setShowSummaryModal(true);
          }
          return;
        }
        else Alert.alert("Session Error", await res.text().catch(() => "Unknown error"));
      }
      await addPendingShiftAction({ companyId, branchId: selectedBranchId, type: "close", payload: { shiftId: Number(currentShift.id), closingBalance, reconciledBy: supervisorId } });
      setCurrentShift(null); await setProvisionalShift(companyId, null); setShowShiftModal(false); setShiftBalance("");
    } catch { /* ignore */ }
  };

  const handlePayout = async (supervisorId?: string) => {
    const isAdminCollector = userRole === "admin" || userRole === "owner";
    const targetShift = isAdminCollector ? null : currentShift;
    if ((!isAdminCollector && !targetShift) || (isAdminCollector && transactionType === "DROP" && !selectedCashierBalance) || !payoutAmount) {
      if (!targetShift && !isAdminCollector) Alert.alert("Error", "Please select a cashier/shift for collection.");
      if (isAdminCollector && transactionType === "DROP" && !selectedCashierBalance) Alert.alert("Error", "Please select a cashier to collect from.");
      return;
    }

    // Cashiers still need supervisor PIN for drops. Admin/owner users are already authenticated.
    if (transactionType === "DROP" && !supervisorId && !isAdminCollector) {
      setShowPayoutModal(false); // close payout modal first to prevent modal freeze
      setSupervisorAction("DROP");
      setTimeout(() => setIsSupervisorAuthVisible(true), 350); // wait for modal to fully close
      return;
    }

    setIsSubmitting(true);
    try {
      const res = isAdminCollector && transactionType === "DROP"
        ? await apiFetch(`/api/companies/${companyId}/cash-collections`, {
            method: "POST",
            body: JSON.stringify({
              cashierId: selectedCashierBalance.userId,
              amount: parseFloat(payoutAmount),
              reason: payoutReason || `Owner/Admin cash collection from ${selectedCashierBalance.cashierName}`,
            })
          })
        : await apiFetch(`/api/pos/shifts/${targetShift!.id}/transaction`, {
            method: "POST",
            body: JSON.stringify({
              type: transactionType,
              amount: parseFloat(payoutAmount),
              reason: payoutReason || (transactionType === "DROP" ? "Supervisor Cash Collection" : "General Payout"),
              authorizedBy: supervisorId
            })
          });
      if (res.ok) {
        setShowPayoutModal(false);
        setPayoutAmount("");
        setPayoutReason("");
        setSelectedCashierBalance(null);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        // Refresh summary if it was open or just as good practice
        if (showSummaryModal) fetchShiftSummary();
        if (isAdminCollector) fetchCashierBalances();
      } else {
        const err = await res.text();
        Alert.alert("Error", `Failed to log ${transactionType.toLowerCase()}: ${err}`);
      }
    } catch (e) {
      Alert.alert("Error", `Network error logging ${transactionType.toLowerCase()}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const fetchShiftSummary = async () => {
    if (!currentShift) return;
    setIsFetchingSummary(true);
    try {
      const res = await apiFetch(`/api/pos/shifts/${currentShift.id}/summary`);
      if (res.ok) {
        setShiftSummary(await res.json());
        setShowSummaryModal(true);
      } else {
        Alert.alert("Error", "Failed to fetch shift summary");
      }
    } catch (e) { /* ignore */ } finally {
      setIsFetchingSummary(false);
    }
  };

  const syncQueued = async (isManual = false) => {
    if (!isOnlineRef.current || isSyncing) return;
    const shiftActions = await getPendingShiftActions(companyId);
    const sales = await getPendingSales(companyId);
    const notes = await getPendingNotes(companyId);

    if (shiftActions.length === 0 && sales.length === 0 && notes.length === 0) {
      if (isManual) Alert.alert("Sync", "Everything is already synced.");
      return;
    }

    setIsSyncing(true);
    if (isManual) {
      Alert.alert("Syncing", `Starting sync of ${shiftActions.length + sales.length + notes.length} queued actions...`);
    }

    let successCount = 0;
    try {
      for (const action of shiftActions) {
        try {
          if (action.type === "open") {
            const res = await apiFetch("/api/pos/shifts/open", {
              method: "POST",
              headers: { "Idempotency-Key": `queued-shift-open-${action.id}` },
              body: JSON.stringify({ companyId, openingBalance: action.payload.openingBalance })
            });
            if (res.ok) { await removePendingShiftAction(action.id); successCount++; }
          } else {
            const res = await apiFetch(`/api/pos/shifts/${action.payload.shiftId}/close`, {
              method: "POST",
              headers: { "Idempotency-Key": `queued-shift-close-${action.payload.shiftId}-${action.createdAt || action.payload.closingBalance}` },
              body: JSON.stringify({ closingBalance: action.payload.closingBalance })
            });
            if (res.ok) { await removePendingShiftAction(action.id); successCount++; }
          }
        } catch (err) {
          console.error("Shift sync error:", err);
          break;
        }
      }
      for (const sale of sales) {
        try {
          const res = await apiFetch(`/api/companies/${companyId}/invoices`, { method: "POST", body: JSON.stringify(sale.payload) });
          if (res.ok) { await removePendingSale(sale.id); successCount++; }
        } catch (err) {
          console.error("Sale sync error:", err);
          break;
        }
      }
      // Flush pending notes
      const isFiscalCompany = !!(company?.vatRegistered && company?.vatNumber);
      for (const note of notes) {
        try {
          const endpoint =
            note.noteType === "credit"
              ? `/api/invoices/${note.originalInvoiceId}/credit-note`
              : `/api/invoices/${note.originalInvoiceId}/debit-note`;
          const res = await apiFetch(endpoint, { method: "POST", body: JSON.stringify(note.payload) });
          if (res.ok) {
            const created = await res.json().catch(() => null);
            await removePendingNote(note.id);
            successCount++;
            // Fiscalise for VAT companies
            if (isFiscalCompany && created?.id) {
              apiFetch(`/api/invoices/${created.id}/fiscalize`, { method: "POST" }).catch((e) => {
                console.warn("Note fiscalisation failed after sync:", e);
              });
            }
          }
        } catch (err) {
          console.error("Note sync error:", err);
          break;
        }
      }
    } finally {
      setIsSyncing(false);
      if (successCount > 0 && isManual) {
        Alert.alert("Sync Complete", `Successfully synced ${successCount} items.`);
      }
    }
  };

  // Stable ref so the NetInfo listener always calls the latest version
  const syncQueuedRef = React.useRef(syncQueued);
  useEffect(() => { syncQueuedRef.current = syncQueued; });

  const handleParkSale = async () => {
    Keyboard.dismiss();
    if (!cart.length || isParking) return;
    setIsParking(true);
    const name = holdName.trim() || `Hold #${heldSales.length + 1}`;
    const payload = {
      companyId,
      customerId: selectedCustomerId,
      holdName: name,
      total: total.toFixed(2),
      orderDiscount: orderDiscount.toFixed(2),
      cartData: cart
    };
    try {
      if (isOnline) {
        const res = await apiFetch("/api/pos/holds", { method: "POST", body: JSON.stringify(payload) });
        if (res.ok) {
          await fetchHeldSales();
          // No alert here as per request
        } else {
          const err = await res.text();
          Alert.alert("Error", `Failed to park sale: ${err}`);
        }
      } else {
        const offlineHold: HeldSale = {
          id: `offline_${Date.now()}`,
          holdName: `${name} (Offline)`,
          total,
          orderDiscount,
          createdAt: new Date().toISOString(),
          cartData: cart,
          _offline: true
        };
        setHeldSales((prev: HeldSale[]) => [offlineHold, ...prev]);
        // Remove alert even for offline as per "remove alert box when you clean park sale"
      }
      setCart([]);
      setOrderDiscount(0);
      setOrderDiscountInput("");
      setPaidAmount("");
      setHoldName("");
    } catch (e: any) {
      Alert.alert("Error", e.message || "An unexpected error occurred.");
    } finally {
      setIsParking(false);
    }
  };

  const handleResumeHold = async (hold: HeldSale) => {
    setCart(hold.cartData);
    setOrderDiscount(hold.orderDiscount || 0);
    setOrderDiscountInput((hold.orderDiscount || 0).toString());
    setShowHoldsModal(false);
    handleCheckout(hold.cartData);
    try {
      if (!hold._offline) await apiFetch(`/api/pos/holds/${hold.id}`, { method: "DELETE" });
      await fetchHeldSales();
    } catch { /* ignore */ }
  };

  const handleCheckout = async (cartOverride?: CartItem[]) => {
    Keyboard.dismiss();
    const checkoutCart = cartOverride ?? cart;
    if (!checkoutCart.length) return;
    if (!selectedCustomerId) {
      if (defaultCustomerId) {
        setSelectedCustomerId(defaultCustomerId);
      } else {
        try {
          setIsSubmitting(true);
          const body = {
            name: "Walk-in Customer",
            customerType: "individual",
            country: "Zimbabwe",
            isActive: true,
            isDefault: true,
            companyId,
          };
          const res = await apiFetch(`/api/companies/${companyId}/customers`, {
            method: "POST",
            body: JSON.stringify(body)
          });
          if (res.ok) {
            const newCust = await res.json();
            setSelectedCustomerId(newCust.id);
            if (refreshCustomers) await refreshCustomers();
          } else {
            Alert.alert("No Customer", "Please select or create a customer before checking out.");
            setIsSubmitting(false);
            return;
          }
        } catch (e) {
          Alert.alert("No Customer", "Please select or create a customer before checking out.");
          setIsSubmitting(false);
          return;
        } finally {
          setIsSubmitting(false);
        }
      }
    }
    setSaleDate(formatLocalDateInput());
    setPaidAmount((total * currencyInfo.rate).toFixed(2));
    setTimeout(() => {
      setShowCheckout(true);
    }, 250);
  };

  const processOrder = async () => {
    if (!selectedCustomerId) return;

    // paid is in local currency, total is in base — compare in same unit
    const paid = parseFloat(paidAmount || "0");
    if (paid < total * currencyInfo.rate - 0.001) return;
    const currencyObj = resolvedCurrencies.find((c: any) => c.code === selectedCurrency) || { code: "USD", exchangeRate: "1" };
    const issueDate = buildSaleIssueDate(saleDate);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);
    if (!issueDate) {
      Alert.alert("Invalid sale date", "Enter the sale date in YYYY-MM-DD format.");
      return;
    }
    if (issueDate > todayEnd) {
      Alert.alert("Invalid sale date", "Backdated POS sales cannot be dated in the future.");
      return;
    }
    const issueDateIso = issueDate.toISOString();
    const invoiceData = {
      customerId: selectedCustomerId,
      branchId: selectedBranchId,
      subtotal: subtotal.toFixed(2), taxAmount: taxAmount.toFixed(2), total: total.toFixed(2),
      currency: currencyObj.code, exchangeRate: currencyObj.exchangeRate,
      paymentMethod: "CASH", status: "issued", notes: "POS Transaction (Mobile)",
      discountAmount: orderDiscount.toFixed(2), taxInclusive,
      transactionType: company?.vatRegistered ? "FiscalInvoice" : "Invoice",
      isPos: true,
      shiftId: currentShift?.id, // Link to current shift for accurate summaries
      invoiceNumber: `POS-${Date.now()}`,
      issueDate: issueDateIso,
      dueDate: issueDateIso,
      items: cart.map((item: CartItem) => ({
        productId: item.productId, description: item.name,
        quantity: item.quantity.toString(), unitPrice: item.price.toString(),
        discountAmount: item.discountAmount.toString(), taxRate: item.taxRate.toString(),
        lineTotal: (item.price * item.quantity - item.discountAmount).toFixed(2),
        taxTypeId: item.taxTypeId
      }))
    };

    setIsSubmitting(true);

    // Auto-open shift in background — never blocks the sale
    if (!currentShift) {
      const openingBalance = "0";
      // Optimistically mark a provisional shift immediately so next sale doesn't re-open
      const provisional = { id: Date.now(), companyId, status: "OPEN", openingBalance, openedAt: new Date().toISOString(), _provisional: true };
      setCurrentShift(provisional);
      if (isOnline) {
        setProvisionalShift(companyId, provisional); // not awaited
        // fire-and-forget — don't block the sale
        apiFetch("/api/pos/shifts/open", {
          method: "POST",
          headers: { "Idempotency-Key": `auto-shift-open-${companyId}-${openingBalance}` },
          body: JSON.stringify({ companyId, openingBalance })
        }).then(async (res) => {
          if (res.ok) fetchShift(); // quietly refresh in background
        }).catch((e) => console.error("Auto-shift open error:", e));
      } else {
        addPendingShiftAction({ companyId, branchId: selectedBranchId, type: "open", payload: { openingBalance } }); // not awaited
        setProvisionalShift(companyId, provisional); // not awaited
      }
    }

    const optimisticInvoice = { ...invoiceData, id: `optimistic_${Date.now()}`, _pending: true };
    const printItems = Array.isArray(invoiceData.items) ? invoiceData.items : [];

    // ── OPTIMISTIC UI: clear state and show success immediately ─────────────
    setLastInvoice(optimisticInvoice);
    setCart([]); setOrderDiscount(0); setOrderDiscountInput("");
    setShowCheckout(false); setPaidAmount(""); setSaleDate(formatLocalDateInput());
    resetToDefaultCustomer();
    setIsSubmitting(false);
    if (printerConfig.autoShowModal) setShowSuccess(true);
    // Success haptic + sound
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    playCheckoutSound().catch(() => { });

    // Trigger auto-print with a short delay now that state is already cleared
    if (printerConfig.autoPrint) {
      setTimeout(() => {
        print({
          invoice: optimisticInvoice,
          company,
          customer: optimisticInvoice.customerId ? resolvedCustomers?.find((c: any) => c.id === optimisticInvoice.customerId) : null,
          items: printItems,
          terminalId: printerConfig.terminalId,
          currencySymbol: currencyInfo.symbol,
          cashierName: userName,
          paidAmount: parseFloat(paidAmount || "0"),
          paperWidth: printerConfig.paperWidth
        });
      }, 200);
    }

    // ── BACKGROUND: post the invoice to the server ───────────────────────────
    if (!isOnline) {
      addPendingSale(companyId, invoiceData, selectedBranchId).then((offlineId) => {
        setLastInvoice((prev: any) => ({ ...prev, id: offlineId, _offline: true, items: prev?.items || printItems }));
        refreshProducts();
      });
    } else {
      createInvoice(invoiceData)
        .then((created: any) => {
          setLastInvoice({ ...created, items: created?.items || created?.lineItems || printItems }); // update so receipt printing uses the real invoice
          refreshProducts();
        })
        .catch(async (err: any) => {
          const isNetwork = err?.message?.toLowerCase().includes("network") || err?.message?.toLowerCase().includes("failed to fetch");
          if (!isNetwork) {
            Alert.alert("Sale Sync Failed", `Server error: ${err?.message}\n\nThis sale will be queued for later retry.`);
          }
          // Network failed after optimistic update — queue it offline silently
          const offlineId = await addPendingSale(companyId, invoiceData, selectedBranchId);
          setLastInvoice((prev: any) => ({ ...prev, id: offlineId, _offline: true, items: prev?.items || printItems }));
        });
    }
  };


  const cartItemCount = cart.reduce((sum: number, item: CartItem) => sum + item.quantity, 0);

  const handlePrint = async () => {
    if (!lastInvoice || !company) return;
    await print({
      invoice: lastInvoice,
      company,
      customer: lastInvoice.customerId ? resolvedCustomers?.find((c: any) => c.id === lastInvoice.customerId) : null,
      items: lastInvoice.items || lastInvoice.lineItems || lastInvoice.invoiceItems || [],
      terminalId: printerConfig.terminalId,
      currencySymbol: currencyInfo.symbol,
      cashierName: userName,
      paidAmount: parseFloat(paidAmount || "0"),
      paperWidth: printerConfig.paperWidth
    });
  };

  const getProductMeta = (product: any, index: number) => ({
    color: CAT_PALETTE[index % CAT_PALETTE.length],
    emoji: PROD_EMOJIS[index % PROD_EMOJIS.length],
  });

  return (
    <View style={{ flex: 1, backgroundColor: C.bg.base }}>
      <StatusBar style={isDark ? "light" : "dark"} />

      {/* Premium POS surface */}
      <LinearGradient
        colors={isDark ? ["#080604", "#120F0C", "#14100B"] : [C.bg.base, C.bg.primary]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ flex: 1 }}
      >
        {/* Header */}
        <View style={{
          paddingHorizontal: 16,
          paddingTop: Math.max(insets.top, 10),
          paddingBottom: 12,
          backgroundColor: POS_OVERLAY,
          borderBottomWidth: 1,
          borderBottomColor: POS_BORDER,
          zIndex: 10,
        }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 14 }}>

            <View style={{
              flex: 1,
              height: 44,
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
              backgroundColor: POS_SURFACE_RAISED,
              borderRadius: 14,
              paddingHorizontal: 12,
              shadowColor: "#000",
              shadowOpacity: 0.12,
              shadowRadius: 8,
              shadowOffset: { width: 0, height: 4 },
              elevation: 4,
            }}>
              <Search size={18} color={C.text.secondary} strokeWidth={2.2} />
              <TextInput
                style={{ flex: 1, color: C.text.primary, fontSize: 15, fontWeight: "700", paddingVertical: 0 }}
                placeholder="Search items..."
                placeholderTextColor={C.text.secondary}
                value={search}
                onChangeText={setSearch}
              />
            </View>

            <TouchableOpacity
              activeOpacity={0.82}
              onPress={() => setViewMode(prev => prev === "list" ? "grid" : "list")}
              style={{
                width: 44,
                height: 44,
                borderRadius: 14,
                backgroundColor: POS_SURFACE_RAISED,
                alignItems: "center",
                justifyContent: "center",
                shadowColor: "#000",
                shadowOpacity: 0.1,
                shadowRadius: 6,
                shadowOffset: { width: 0, height: 3 },
                elevation: 3,
              }}>
              {viewMode === "list" ? (
                <LayoutGrid size={20} color={C.text.secondary} strokeWidth={2.2} />
              ) : (
                <List size={20} color={C.text.secondary} strokeWidth={2.2} />
              )}
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.82}
              onPress={() => setShowQuickMenu(true)}
              style={{
                width: 44,
                height: 44,
                borderRadius: 14,
                backgroundColor: POS_SURFACE_RAISED,
                alignItems: "center",
                justifyContent: "center",
                shadowColor: "#000",
                shadowOpacity: 0.1,
                shadowRadius: 6,
                shadowOffset: { width: 0, height: 3 },
                elevation: 3,
              }}>
              <View style={{ gap: 2 }}>
                {[1, 2, 3].map(i => <View key={i} style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: C.amber.primary }} />)}
              </View>
            </TouchableOpacity>
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 10, paddingRight: 16 }}
          >
            {categories.map((cat: string) => {
              const active = selectedCategory === cat;
              return (
                <TouchableOpacity
                  key={cat}
                  activeOpacity={0.82}
                  onPress={() => setSelectedCategory(cat)}
                  style={{
                    height: 34,
                    paddingHorizontal: active ? 18 : 16,
                    borderRadius: 18,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: active ? C.amber.primary : POS_SURFACE_RAISED,
                    shadowColor: active ? C.amber.primary : "#000",
                    shadowOpacity: active ? 0.35 : 0.1,
                    shadowRadius: active ? 12 : 6,
                    shadowOffset: { width: 0, height: 4 },
                    elevation: active ? 7 : 3,
                  }}>
                  <Text style={{
                    fontSize: 13,
                    fontWeight: "900",
                    letterSpacing: -0.2,
                    color: active ? "#1A1100" : C.text.secondary,
                  }} numberOfLines={1}>
                    {cat === "All" ? "All" : cat}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* Product list */}
        <View style={{ flex: 1, flexDirection: isWide ? "row" : "column" }}>
          <View style={{ flex: 1, paddingHorizontal: 14 }}>
          {loadingProducts ? (
            <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
              <ActivityIndicator color={C.amber.primary} />
            </View>
          ) : filteredProducts.length === 0 ? (
            <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
              <View style={{
                width: 72,
                height: 72,
                borderRadius: 24,
                backgroundColor: POS_SURFACE_RAISED,
                alignItems: "center",
                justifyContent: "center",
                marginBottom: 14,
              }}>
                <Tag size={30} color={C.text.secondary} />
              </View>
              <Text style={{ color: C.text.secondary, fontSize: 12, fontWeight: "800", textTransform: "uppercase", letterSpacing: 2 }}>
                No products found
              </Text>
            </View>
          ) : (
            <FlatList
              key={`pos-product-list-premium-${viewMode}-${isWide ? "wide" : "narrow"}`}
              data={filteredProducts}
              numColumns={viewMode === "grid" ? (isWide ? 3 : 2) : 1}
              showsVerticalScrollIndicator={false}
              keyExtractor={(item: any) => item.id.toString()}
              contentContainerStyle={{ paddingBottom: isWide ? 18 : 118, paddingTop: 14 }}
              columnWrapperStyle={viewMode === "grid" ? { justifyContent: "space-between", marginBottom: 11 } : undefined}
              renderItem={({ item, index }: { item: any; index: number }) => {
                const inCartItem = cart.find((c: CartItem) => c.productId === item.id);
                const inCart = !!inCartItem;
                const visibleStock = Number(item.branchStock ?? item.stockLevel ?? 0);
                const stockLow = item.isTracked && visibleStock <= 3;
                const outOfStock = item.isTracked && visibleStock === 0;
                const imageRaw = item.imageUrl ?? item.image_url ?? item.image ?? item.photoUrl ?? null;
                const imageUrl = resolveMediaUrl(imageRaw);
                const toTitleCase = (str: string) =>
                  str.replace(/\w\S*/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());

                const isGrid = viewMode === "grid";

                return (
                  <TouchableOpacity
                    activeOpacity={0.9}
                    onPress={(e) => !outOfStock && addToCart(item, e)}
                    style={{
                      minHeight: isGrid ? 150 : 68,
                      marginBottom: isGrid ? 0 : 12,
                      paddingVertical: isGrid ? 12 : 12,
                      paddingHorizontal: isGrid ? 14 : 12,
                      borderRadius: isGrid ? 24 : 18,
                      flexDirection: isGrid ? "column" : "row",
                      alignItems: "center",
                      justifyContent: "space-between",
                      backgroundColor: isGrid ? C.bg.panel : C.bg.card,
                      opacity: outOfStock ? 0.42 : 1,
                      flex: isGrid ? (isWide ? 0.31 : 0.48) : 1,
                      aspectRatio: isGrid ? 1 : undefined,
                      gap: isGrid ? 0 : 12,
                      shadowColor: "#000",
                      shadowOpacity: isGrid ? 0 : 0.12,
                      shadowRadius: isGrid ? 0 : 10,
                      shadowOffset: { width: 0, height: 4 },
                      elevation: isGrid ? 0 : 5,
                    }}>
                    <View style={{
                      width: isGrid ? 72 : 44,
                      height: isGrid ? 72 : 44,
                      borderRadius: isGrid ? 18 : 14,
                      overflow: "hidden",
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: C.bg.hover,
                      marginRight: isGrid ? 0 : 0,
                      marginBottom: isGrid ? 10 : 0,
                    }}>
                      {imageUrl ? (
                        <ProductImage url={imageUrl} fallbackColor={C.text.secondary} color={C.text.secondary} />
                      ) : (
                        <Package size={isGrid ? 32 : 22} color={C.text.secondary} strokeWidth={1.8} opacity={0.6} />
                      )}
                    </View>

                    <View style={{ flex: isGrid ? 0 : 1, minWidth: 0, alignItems: isGrid ? "center" : "flex-start", justifyContent: "center" }}>
                      <Text
                        style={{
                          color: C.text.primary,
                          fontSize: isGrid ? 14 : 15,
                          lineHeight: isGrid ? 19 : 19,
                          fontWeight: "800",
                          letterSpacing: -0.3,
                          marginBottom: isGrid ? 5 : 3,
                          textAlign: isGrid ? "center" : "left",
                        }}
                        numberOfLines={isGrid ? 2 : 1}
                      >
                        {toTitleCase(item.name)}
                      </Text>

                      <Text
                        style={{
                          color: C.text.secondary,
                          fontSize: isGrid ? 13 : 12,
                          fontWeight: "500",
                          textAlign: isGrid ? "center" : "left",
                        }}
                        numberOfLines={1}
                      >
                        {item.category || item.unitOfMeasure || item.sku || "—"}
                      </Text>
                    </View>

                    <View style={{ alignItems: isGrid ? "center" : "flex-end", justifyContent: "center", gap: 6 }}>
                      <View style={{ flexDirection: isGrid ? "column" : "row", alignItems: "center", gap: 6 }}>
                        <Text style={{
                          color: C.text.primary,
                          fontSize: isGrid ? 15 : 15,
                          fontWeight: "900",
                          letterSpacing: -0.2,
                        }}>
                          {fmt(Number(item.price))}
                        </Text>
                        {item.isTracked && (
                          <View style={{
                            paddingHorizontal: 8,
                            paddingVertical: 3,
                            borderRadius: 6,
                            backgroundColor: outOfStock ? hexAlpha(C.status.error, 0.15) : stockLow ? hexAlpha(C.amber.primary, 0.15) : hexAlpha(C.text.primary, 0.08),
                          }}>
                            <Text style={{
                              color: outOfStock ? C.status.error : stockLow ? C.amber.primary : C.text.secondary,
                              fontSize: 9,
                              fontWeight: "900",
                              letterSpacing: 0.5,
                            }}>
                              {outOfStock ? "OUT" : visibleStock}
                            </Text>
                          </View>
                        )}
                      </View>

                      {inCart ? (
                        <View style={{
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 5,
                          marginTop: 2,
                        }}>
                          <TouchableOpacity
                            activeOpacity={0.78}
                            onPress={(e) => { e.stopPropagation?.(); inCartItem!.isWeighed ? updateQuantity(item.id, -1) : (inCartItem!.quantity > 1 ? updateQuantity(item.id, -1) : removeFromCart(item.id)); }}
                            style={{
                              width: 30,
                              height: 30,
                              borderRadius: 10,
                              backgroundColor: C.bg.hover,
                              alignItems: "center",
                              justifyContent: "center",
                            }}>
                            <Minus size={15} color={C.text.secondary} strokeWidth={2.4} />
                          </TouchableOpacity>

                          <Text style={{ color: C.text.primary, fontSize: 14, fontWeight: "900", minWidth: 26, textAlign: "center" }}>
                            {fmtQty(inCartItem!)}
                          </Text>

                          <TouchableOpacity
                            activeOpacity={0.78}
                            onPress={(e) => { e.stopPropagation?.(); updateQuantity(item.id, 1, e); }}
                            style={{
                              width: 30,
                              height: 30,
                              borderRadius: 10,
                              backgroundColor: C.bg.hover,
                              alignItems: "center",
                              justifyContent: "center",
                            }}>
                            <Plus size={17} color={C.text.primary} strokeWidth={2.4} />
                          </TouchableOpacity>
                        </View>
                      ) : (
                        <TouchableOpacity
                          activeOpacity={0.78}
                          onPress={(e) => { e.stopPropagation?.(); addToCart(item, e); }}
                          style={{
                            width: 34,
                            height: 34,
                            borderRadius: 11,
                            backgroundColor: C.bg.hover,
                            alignItems: "center",
                            justifyContent: "center",
                            marginTop: 2,
                          }}>
                          <Plus size={19} color={C.text.primary} strokeWidth={2.4} />
                        </TouchableOpacity>
                      )}
                    </View>
                  </TouchableOpacity>
                );
              }}
            />
          )}
          </View>

          {isWide && (
            <View style={{
              width: 380,
              borderLeftWidth: 1,
              borderLeftColor: POS_BORDER,
              backgroundColor: POS_OVERLAY,
              paddingTop: 10,
            }}>
              <View style={{ paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: POS_BORDER, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 9 }}>
                  <View
                    ref={cartIconRef}
                    onLayout={measureCart}
                    style={{ width: 34, height: 34, borderRadius: 11, backgroundColor: hexAlpha(C.amber.primary, 0.14), alignItems: "center", justifyContent: "center" }}>
                    <ShoppingCart size={17} color={C.amber.primary} strokeWidth={2.3} />
                  </View>
                  <View>
                    <Text style={{ color: C.text.primary, fontSize: 15, fontWeight: "900", letterSpacing: -0.3 }}>Current Order</Text>
                    <Text style={{ color: C.text.secondary, fontSize: 11, marginTop: 1 }}>{cartItemCount} item{cartItemCount !== 1 ? "s" : ""} · {selectedCustomer?.name || "No customer"}</Text>
                  </View>
                </View>
                {cart.length > 0 && (
                  <TouchableOpacity onPress={() => setCart([])} style={{ width: 34, height: 34, borderRadius: 11, backgroundColor: "rgba(255,71,87,0.12)", alignItems: "center", justifyContent: "center" }}>
                    <Trash2 size={15} color={C.status.error} />
                  </TouchableOpacity>
                )}
              </View>

              <ScrollView
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={{ padding: 14, paddingBottom: 12 }}
                style={{ flex: 1 }}
              >
                {cart.length === 0 ? (
                  <View style={{ alignItems: "center", justifyContent: "center", paddingVertical: 60 }}>
                    <View style={{ width: 56, height: 56, borderRadius: 18, backgroundColor: POS_SURFACE_RAISED, alignItems: "center", justifyContent: "center", marginBottom: 12 }}>
                      <ShoppingCart size={24} color={C.text.secondary} strokeWidth={2} />
                    </View>
                    <Text style={{ color: C.text.secondary, fontSize: 13, fontWeight: "700" }}>Cart is empty</Text>
                    <Text style={{ color: C.text.secondary, fontSize: 11, marginTop: 3, opacity: 0.7 }}>Tap products to add them</Text>
                  </View>
                ) : (
                  cart.map((item: CartItem, idx: number) => {
                    const lineTotal = item.price * item.quantity - item.discountAmount;
                    const isLast = idx === cart.length - 1;
                    return (
                      <View key={item.productId} style={{
                        backgroundColor: C.bg.card, borderRadius: 16, borderWidth: 1, borderColor: C.border.default,
                        padding: 12, marginBottom: isLast ? 0 : 10,
                      }}>
                        <View style={{ flexDirection: "row", alignItems: "center" }}>
                          <View style={{ flex: 1, minWidth: 0, paddingRight: 8 }}>
                            <Text style={{ color: C.text.primary, fontSize: 13, fontWeight: "700" }} numberOfLines={1}>{item.name}</Text>
                            <Text style={{ color: C.text.secondary, fontSize: 10, marginTop: 2 }}>
                              {fmt(item.price)} {item.isWeighed ? `/ ${item.unitOfMeasure ?? "unit"}` : "each"}
                            </Text>
                          </View>
                          <TouchableOpacity onPress={() => removeFromCart(item.productId)} style={{ width: 30, height: 30, borderRadius: 9, backgroundColor: "rgba(255,71,87,0.12)", alignItems: "center", justifyContent: "center", marginRight: 8 }}>
                            <Trash2 size={13} color={C.status.error} />
                          </TouchableOpacity>
                          <Text style={{ color: C.amber.primary, fontSize: 14, fontWeight: "800" }}>{fmt(lineTotal)}</Text>
                        </View>
                        <View style={{ marginTop: 10, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                          <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: C.bg.hover, borderRadius: 10, borderWidth: 1, borderColor: C.border.default }}>
                            <TouchableOpacity
                              onPress={() => item.isWeighed ? updateQuantity(item.productId, -1) : (item.quantity > 1 ? updateQuantity(item.productId, -1) : removeFromCart(item.productId))}
                              style={{ width: 30, height: 30, alignItems: "center", justifyContent: "center" }}>
                              <Minus size={14} color={C.text.secondary} />
                            </TouchableOpacity>
                            <Text style={{ color: C.text.primary, fontSize: 12, fontWeight: "800", minWidth: 34, textAlign: "center" }}>{fmtQty(item)}</Text>
                            <TouchableOpacity
                              onPress={() => updateQuantity(item.productId, 1)}
                              style={{ width: 30, height: 30, alignItems: "center", justifyContent: "center" }}>
                              <Plus size={14} color={C.amber.primary} />
                            </TouchableOpacity>
                          </View>
                          <Text style={{ color: C.text.secondary, fontSize: 11, fontWeight: "700" }}>
                            {item.isWeighed ? `${fmtQty(item)} ${item.unitOfMeasure ?? ""}` : `${fmtQty(item)} ×`}
                          </Text>
                        </View>
                      </View>
                    );
                  })
                )}
              </ScrollView>

              <View style={{
                padding: 16, borderTopWidth: 1, borderTopColor: POS_BORDER,
                paddingBottom: Math.max(insets.bottom, 12),
              }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 6 }}>
                  <Text style={{ color: C.text.secondary, fontSize: 12 }}>Subtotal</Text>
                  <Text style={{ color: C.text.primary, fontSize: 13, fontWeight: "800" }}>{fmt(subtotal)}</Text>
                </View>
                {taxAmount > 0 && (
                  <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 6 }}>
                    <Text style={{ color: C.text.secondary, fontSize: 12 }}>Tax</Text>
                    <Text style={{ color: C.text.primary, fontSize: 13, fontWeight: "800" }}>{fmt(taxAmount)}</Text>
                  </View>
                )}
                {orderDiscount > 0 && (
                  <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 6 }}>
                    <Text style={{ color: C.text.secondary, fontSize: 12 }}>Discount</Text>
                    <Text style={{ color: C.text.primary, fontSize: 13, fontWeight: "800" }}>−{fmt(orderDiscount)}</Text>
                  </View>
                )}
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 4, paddingTop: 10, borderTopWidth: 1, borderTopColor: POS_BORDER }}>
                  <Text style={{ color: C.text.primary, fontSize: 16, fontWeight: "900" }}>Total</Text>
                  <Text style={{ color: C.amber.primary, fontSize: 20, fontWeight: "900", letterSpacing: -0.4 }}>{fmt(total)}</Text>
                </View>
                <TouchableOpacity activeOpacity={0.88} disabled={cart.length === 0} onPress={() => handleCheckout()}
                  style={{
                    marginTop: 14, height: 56, borderRadius: 16,
                    backgroundColor: cart.length === 0 ? C.bg.hover : C.amber.primary,
                    alignItems: "center", justifyContent: "center",
                    shadowColor: C.amber.primary, shadowOpacity: cart.length === 0 ? 0 : 0.3, shadowRadius: 12,
                    shadowOffset: { width: 0, height: 6 }, elevation: cart.length === 0 ? 0 : 7,
                  }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <Text style={{ color: cart.length === 0 ? C.text.secondary : "#1A1100", fontSize: 16, fontWeight: "900" }}>
                      {cart.length === 0 ? "Cart is empty" : `Checkout · ${fmt(total)}`}
                    </Text>
                    {cart.length > 0 && <ArrowRight size={18} color="#1A1100" strokeWidth={2.6} />}
                  </View>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>
        {!isWide && !isEditingItemPrice && (
        <View style={{
          position: "absolute",
          left: 16,
          right: 16,
          bottom: 8,
        }}>
          <Animated.View style={{ transform: [{ scale: cartBounceAnim }] }}>
            <TouchableOpacity activeOpacity={0.9} disabled={cart.length === 0} onPress={() => handleCheckout()}>
              <View
                style={{
                  minHeight: 70,
                  borderRadius: 22,
                  paddingVertical: 12,
                  paddingHorizontal: 14,
                  backgroundColor: "#FF9100", // Reverted to Amber
                  shadowColor: "#000",
                  shadowOpacity: 0.32,
                  shadowRadius: 20,
                  shadowOffset: { width: 0, height: 10 },
                  elevation: 12,
                }}>
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 13, flex: 1 }}>
                    <View
                      ref={cartIconRef}
                      onLayout={measureCart}
                      style={{
                        width: 48,
                        height: 48,
                        borderRadius: 17,
                        backgroundColor: "rgba(0,0,0,0.2)",
                        alignItems: "center",
                        justifyContent: "center",
                        position: "relative",
                      }}>
                      <ShoppingCart size={24} color={C.amber.primary} strokeWidth={2.4} />
                      {cart.length > 0 ? (
                        <View style={{
                          position: "absolute",
                          top: -7,
                          right: -7,
                          backgroundColor: "#000", // Orange badge background
                          borderRadius: 12,
                          minWidth: 24,
                          height: 24,
                          alignItems: "center",
                          justifyContent: "center",
                          paddingHorizontal: 6,
                          borderWidth: 2,
                          borderColor: "#000", // Dark border to pop against the badge
                        }}>
                          <Text style={{ color: "#fff", fontSize: 11, fontWeight: "900" }}>{cartItemCount}</Text>
                        </View>
                      ) : null}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: "#633900", fontSize: 13, fontWeight: "700", opacity: 0.85 }}>Basket Items</Text>
                      <Text style={{ color: "#1A1100", fontSize: 18, fontWeight: "900", letterSpacing: -0.5 }}>{fmt(total)}</Text>
                    </View>
                  </View>
                  <View style={{
                    backgroundColor: "#1A1A10",
                    paddingHorizontal: 18,
                    paddingVertical: 10,
                    borderRadius: 14,
                  }}>
                    <Text style={{ color: "#FFF", fontWeight: "900", fontSize: 14 }}>PAY</Text>
                  </View>
                </View>
              </View>
            </TouchableOpacity>
          </Animated.View>
        </View>
        )}
      </LinearGradient>

      {/* ── FLYING PARTICLES OVERLAY ──────────────────────────── */}
      {flyingItems.map((particle) => (
        <FlyingParticle
          key={particle.id}
          startX={particle.x}
          startY={particle.y}
          endX={cartPos?.x ?? 0}
          endY={cartPos?.y ?? 0}
          color={particle.color}
          emoji={particle.emoji}
          onComplete={() => setFlyingItems(prev => prev.filter(p => p.id !== particle.id))}
        />
      ))}

      {/* ── WEIGHT INPUT MODAL (weighed products: kg/g/l/ml) ─────────────── */}
      <Modal visible={!!weightProduct} transparent animationType="fade" onRequestClose={() => setWeightProduct(null)}>
        <TouchableWithoutFeedback onPress={() => setWeightProduct(null)}>
          <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.72)", justifyContent: "center", padding: 24 }}>
            <TouchableWithoutFeedback onPress={() => {}}>
              <View style={{
                backgroundColor: C.bg.card, borderRadius: 24, padding: 20,
                borderWidth: 1, borderColor: C.border.default, elevation: 16,
              }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <Text style={{ color: C.amber.primary, fontSize: 12, fontWeight: "800", textTransform: "uppercase", letterSpacing: 1.5 }}>
                    Weighed Item
                  </Text>
                  <TouchableOpacity onPress={() => setWeightProduct(null)} style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: C.bg.hover, alignItems: "center", justifyContent: "center" }}>
                    <X size={15} color={C.text.primary} />
                  </TouchableOpacity>
                </View>
                <Text style={{ color: C.text.primary, fontSize: 20, fontWeight: "900", marginBottom: 4 }}>
                  {weightProduct?.name}
                </Text>
                <Text style={{ color: C.text.secondary, fontSize: 13, marginBottom: 16 }}>
                  {fmt(Number(weightProduct?.price ?? 0))} per {weightProduct?.unitOfMeasure ?? weightProduct?.unit ?? "unit"}
                </Text>

                <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: C.bg.hover, borderRadius: 16, borderWidth: 1, borderColor: C.border.default, paddingHorizontal: 16 }}>
                  <Text style={{ color: C.text.secondary, fontSize: 20, marginRight: 6, fontWeight: "300" }}>{currencyInfo.symbol}</Text>
                  <TextInput
                    autoFocus
                    keyboardType="decimal-pad"
                    placeholder="0.00"
                    placeholderTextColor={C.text.secondary}
                    value={weightInput}
                    onChangeText={setWeightInput}
                    onSubmitEditing={confirmWeightAdd}
                    returnKeyType="done"
                    selectTextOnFocus
                    style={{ flex: 1, color: C.text.primary, fontSize: 28, fontWeight: "900", paddingVertical: 16, letterSpacing: 0.5 }}
                  />
                </View>

                <View style={{ marginTop: 10, flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 4 }}>
                  <Text style={{ color: C.text.secondary, fontSize: 12 }}>Amount to charge</Text>
                  <Text style={{ color: C.amber.primary, fontSize: 14, fontWeight: "800" }}>
                    {(() => {
                      const amt = Number.parseFloat(weightInput.replace(",", "."));
                      const unit = Number(weightProduct?.price ?? 0);
                      if (!Number.isFinite(amt) || amt <= 0 || !Number.isFinite(unit) || unit <= 0) return `= 0 ${weightProduct?.unitOfMeasure ?? weightProduct?.unit ?? ""}`;
                      return `= ${(amt / unit).toFixed(3)} ${weightProduct?.unitOfMeasure ?? weightProduct?.unit ?? ""}`;
                    })()}
                  </Text>
                </View>

                <View style={{ flexDirection: "row", gap: 10, marginTop: 18 }}>
                  <TouchableOpacity
                    onPress={() => setWeightProduct(null)}
                    style={{ flex: 1, height: 50, borderRadius: 14, backgroundColor: C.bg.hover, alignItems: "center", justifyContent: "center" }}>
                    <Text style={{ color: C.text.primary, fontSize: 15, fontWeight: "800" }}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={confirmWeightAdd}
                    style={{ flex: 2, height: 50, borderRadius: 14, backgroundColor: C.amber.primary, alignItems: "center", justifyContent: "center", shadowColor: C.amber.primary, shadowOpacity: 0.4, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 6 }}>
                    <Text style={{ color: "#1A1100", fontSize: 15, fontWeight: "900" }}>Add to Cart</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* ── HOLDS MODAL ────────────────────────────────────────────────────── */}
      <Modal visible={showHoldsModal} transparent animationType="slide" onRequestClose={() => setShowHoldsModal(false)}>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.8)", justifyContent: "flex-end" }}>
          <View style={{
            backgroundColor: C.bg.card, borderTopLeftRadius: 32, borderTopRightRadius: 32,
            borderTopWidth: 1, borderColor: C.border.default, padding: 24, paddingBottom: Math.max(insets.bottom, 24), maxHeight: "75%"
          }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <View>
                <Text style={{ color: C.text.primary, fontSize: 22, fontWeight: "800" }}>Parked Sales</Text>
                <Text style={{ color: C.text.secondary, fontSize: 12, marginTop: 3 }}>Resume any held transaction</Text>
              </View>
              <TouchableOpacity onPress={() => setShowHoldsModal(false)}
                style={{
                  width: 38, height: 38, borderRadius: 12, backgroundColor: C.bg.hover,
                  borderWidth: 1, borderColor: C.border.default, alignItems: "center", justifyContent: "center"
                }}>
                <X size={16} color={C.text.primary} />
              </TouchableOpacity>
            </View>
            {heldSales.length === 0 ? (
              <View style={{ alignItems: "center", paddingVertical: 48 }}>
                <View style={{
                  width: 56, height: 56, borderRadius: 18, backgroundColor: C.bg.hover,
                  borderWidth: 1, borderColor: C.border.default, alignItems: "center", justifyContent: "center", marginBottom: 12
                }}>
                  <History size={24} color={C.text.secondary} />
                </View>
                <Text style={{ color: C.text.secondary, fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 2 }}>
                  No parked sales
                </Text>
              </View>
            ) : (
              <ScrollView showsVerticalScrollIndicator={false}>
                {heldSales.map((hold: HeldSale) => (
                  <TouchableOpacity key={String(hold.id)} activeOpacity={0.85}
                    onPress={() => handleResumeHold(hold)}
                    style={{
                      marginBottom: 10, backgroundColor: C.bg.hover, padding: 16, borderRadius: 18,
                      borderWidth: 1, borderColor: C.border.default,
                      flexDirection: "row", alignItems: "center", justifyContent: "space-between"
                    }}>
                    <View style={{ flexDirection: "row", alignItems: "center", flex: 1, marginRight: 12 }}>
                      <View style={{
                        width: 42, height: 42, borderRadius: 14,
                        backgroundColor: hexAlpha(C.amber.primary, 0.09), alignItems: "center",
                        justifyContent: "center", marginRight: 12,
                        borderWidth: 1, borderColor: hexAlpha(C.amber.primary, 0.19)
                      }}>
                        <ShoppingCart size={17} color={C.amber.primary} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: C.text.primary, fontSize: 14, fontWeight: "700" }} numberOfLines={1}>
                          {hold.holdName}
                        </Text>
                        <Text style={{ color: C.text.secondary, fontSize: 11, marginTop: 3 }}>
                          {new Date(hold.createdAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
                          {" · "}{hold.cartData.length} item{hold.cartData.length !== 1 ? "s" : ""}
                        </Text>
                      </View>
                    </View>
                    <View style={{ alignItems: "flex-end" }}>
                      <Text style={{ color: C.amber.primary, fontSize: 16, fontWeight: "800" }}>
                        {fmt(hold.total)}
                      </Text>
                      <Text style={{ color: C.text.secondary, fontSize: 10, marginTop: 3 }}>Tap to resume</Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* ── CHECKOUT MODAL ─────────────────────────────────────────────────── */}
      <Modal visible={showCheckout} transparent animationType="slide" onRequestClose={() => setShowCheckout(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.8)", justifyContent: "flex-end" }}>
          <View style={{
            backgroundColor: C.bg.base, borderTopLeftRadius: 32, borderTopRightRadius: 32,
            borderTopWidth: 1, borderColor: C.border.default, maxHeight: "92%", paddingBottom: Math.max(insets.bottom, 36), flex: 1,
            shadowColor: "#000", shadowOpacity: 0.45, shadowRadius: 24, shadowOffset: { width: 0, height: -8 }, elevation: 20
          }}>
            <View style={{
              flexDirection: "row", justifyContent: "space-between", alignItems: "center",
              padding: 20, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: C.border.default
            }}>
              <View>
                <Text style={{ color: C.text.primary, fontSize: 22, fontWeight: "800" }}>Checkout</Text>
                <Text style={{ color: C.text.secondary, fontSize: 12, marginTop: 2 }}>
                  {cartItemCount} item{cartItemCount !== 1 ? "s" : ""} · {selectedCustomer?.name || "No customer"}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setShowCheckout(false)}
                style={{
                  width: 38, height: 38, borderRadius: 12, backgroundColor: C.bg.hover,
                  borderWidth: 1, borderColor: C.border.default, alignItems: "center", justifyContent: "center"
                }}>
                <X size={16} color={C.text.primary} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ padding: 18, paddingTop: 12, paddingBottom: 118 }}>
              <Text style={{ color: C.text.secondary, fontSize: 10, fontWeight: "700", textTransform: "uppercase", letterSpacing: 1, marginBottom: 10, marginTop: 6 }}>
                Order Summary
              </Text>
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => setShowCustomerPicker(true)}
                style={{
                  backgroundColor: C.bg.card, borderRadius: 16, borderWidth: 1, borderColor: C.border.default,
                  padding: 14, marginBottom: 14, flexDirection: "row", alignItems: "center", justifyContent: "space-between",
                }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 12, flex: 1 }}>
                  <View style={{
                    width: 40, height: 40, borderRadius: 13,
                    backgroundColor: selectedCustomerId ? hexAlpha(C.amber.primary, 0.14) : C.bg.hover,
                    alignItems: "center", justifyContent: "center",
                  }}>
                    <User size={19} color={selectedCustomerId ? C.amber.primary : C.text.secondary} strokeWidth={2.2} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: C.text.primary, fontSize: 14, fontWeight: "800" }}>
                      {selectedCustomer?.name || "Select customer"}
                    </Text>
                    <Text style={{ color: C.text.secondary, fontSize: 11, marginTop: 2 }}>
                      {selectedCustomerId ? (selectedCustomer?.phone || "Walk-in customer") : "Tap to choose a customer"}
                    </Text>
                  </View>
                </View>
                <ChevronRight size={18} color={C.text.secondary} />
              </TouchableOpacity>
              <View style={{
                backgroundColor: C.bg.card, borderRadius: 20, borderWidth: 1,
                borderColor: C.border.default, overflow: "hidden", marginBottom: 18,
                shadowColor: "#000", shadowOpacity: 0.12, shadowRadius: 10, shadowOffset: { width: 0, height: 5 }, elevation: 4
              }}>
                {cart.map((item: CartItem, idx: number) => {
                  const lineTotal = item.price * item.quantity - item.discountAmount;
                  const isLast = idx === cart.length - 1;
                  return (
                    <View key={item.productId} style={{
                      paddingHorizontal: 12, paddingVertical: 12,
                      borderBottomWidth: isLast ? 0 : 1, borderBottomColor: C.border.default
                    }}>
                      <View style={{ flexDirection: "row", alignItems: "center" }}>
                        <View style={{
                          width: 28, height: 28, borderRadius: 8,
                          backgroundColor: C.bg.hover, borderWidth: 1, borderColor: C.border.default,
                          alignItems: "center", justifyContent: "center", marginRight: 12
                        }}>
                          <Text style={{ color: C.amber.primary, fontSize: 11, fontWeight: "900" }}>{fmtQty(item)}</Text>
                        </View>
                      <View style={{ flex: 1, paddingRight: 10 }}>
                        <Text style={{ color: C.text.primary, fontSize: 13, fontWeight: "600" }} numberOfLines={1}>{item.name}</Text>
                        <Text style={{ color: C.text.secondary, fontSize: 10, marginTop: 1 }}>
                          {fmt(item.price)} {item.isWeighed ? `/ ${item.unitOfMeasure ?? "unit"}` : "each"}
                          {item.discountAmount > 0 ? `  ·  −${fmt(item.discountAmount)} disc` : ""}
                        </Text>
                      </View>
                        <TouchableOpacity onPress={() => removeFromCart(item.productId)} style={{
                          width: 32, height: 32, borderRadius: 10, backgroundColor: "rgba(255,71,87,0.12)",
                          alignItems: "center", justifyContent: "center", marginRight: 6
                        }}>
                          <Trash2 size={14} color={C.status.error} />
                        </TouchableOpacity>
                        <Text style={{ color: C.amber.primary, fontSize: 14, fontWeight: "800", letterSpacing: -0.3 }}>
                          {fmt(lineTotal)}
                        </Text>
                      </View>
                      <View style={{
                        marginTop: 10,
                        flexDirection: "row",
                        alignItems: "center",
                        backgroundColor: C.bg.hover,
                        borderWidth: 1,
                        borderColor: C.border.default,
                        borderRadius: 12,
                        paddingHorizontal: 10,
                      }}>
                        <Text style={{ color: C.text.secondary, fontSize: 12, fontWeight: "800", marginRight: 6 }}>
                          Unit
                        </Text>
                        <Text style={{ color: C.text.secondary, fontSize: 15, marginRight: 4 }}>{currencyInfo.symbol}</Text>
                        <TextInput
                          value={priceInputs[item.productId] ?? (item.price * currencyInfo.rate).toFixed(2)}
                          onFocus={() => handleItemPriceFocus(item)}
                          onChangeText={(value) => handleItemPriceInput(item.productId, value)}
                          onBlur={() => handleItemPriceBlur(item)}
                          keyboardType="decimal-pad"
                          returnKeyType="done"
                          onSubmitEditing={() => finishItemPriceEdit(item)}
                          selectTextOnFocus
                          style={{ flex: 1, color: C.text.primary, fontSize: 16, fontWeight: "800", paddingVertical: 9 }}
                        />
                        {focusedPriceProductId === item.productId && (
                          <TouchableOpacity onPress={() => finishItemPriceEdit(item)}
                            style={{ marginLeft: 8, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 9, backgroundColor: C.amber.primary }}>
                            <Text style={{ color: "#000", fontSize: 11, fontWeight: "900" }}>Done</Text>
                          </TouchableOpacity>
                        )}
                        <View style={{ flexDirection: "row", alignItems: "center", marginLeft: 8 }}>
                          <TouchableOpacity
                            onPress={() => item.isWeighed ? updateQuantity(item.productId, -1) : (item.quantity > 1 ? updateQuantity(item.productId, -1) : removeFromCart(item.productId))}
                            style={{ width: 28, height: 28, alignItems: "center", justifyContent: "center" }}>
                            <Minus size={13} color={C.text.secondary} />
                          </TouchableOpacity>
                          <Text style={{ color: C.text.secondary, fontSize: 11, fontWeight: "700", marginHorizontal: 2 }}>
                            {fmtQty(item)}
                          </Text>
                          <TouchableOpacity
                            onPress={() => updateQuantity(item.productId, 1)}
                            style={{ width: 28, height: 28, alignItems: "center", justifyContent: "center" }}>
                            <Plus size={13} color={C.amber.primary} />
                          </TouchableOpacity>
                        </View>
                      </View>
                    </View>
                  );
                })}

                <View style={{ borderTopWidth: 1, borderTopColor: C.border.default, paddingHorizontal: 12, paddingTop: 8, paddingBottom: 10 }}>
                  {[
                    { label: "Subtotal", value: fmt(subtotal) },
                    { label: "Tax", value: fmt(taxAmount) },
                    ...(orderDiscount > 0 ? [{ label: "Discount", value: `-${fmt(orderDiscount)}`, accent: C.status.success }] : []),
                  ].map(row => (
                    <View key={row.label} style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 5 }}>
                      <Text style={{ color: C.text.secondary, fontSize: 12 }}>{row.label}</Text>
                      <Text style={{ color: (row as any).accent || C.text.primary, fontSize: 12, fontWeight: "600" }}>{row.value}</Text>
                    </View>
                  ))}
                  <View style={{ height: 1, backgroundColor: C.border.default, marginVertical: 8 }} />
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                    <Text style={{ color: C.text.secondary, fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 }}>
                      Total Due
                    </Text>
                    <Text style={{ color: C.amber.primary, fontSize: 18, fontWeight: "900", letterSpacing: -0.5 }}>
                      {fmt(total)}
                    </Text>
                  </View>
                </View>
              </View>

              {!isEditingItemPrice && (
              <>
              <Text style={{ color: C.text.secondary, fontSize: 10, fontWeight: "700", textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>
                Order Options
              </Text>
              <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 10, gap: 8 }}>
                <View style={{
                  flex: 1, backgroundColor: C.bg.hover,
                  borderRadius: 12, paddingHorizontal: 14, paddingVertical: 2,
                  flexDirection: "row", alignItems: "center", gap: 8,
                  shadowColor: "#000", shadowOpacity: 0.04, shadowRadius: 3, elevation: 1
                }}>
                  <Tag size={13} color={C.text.secondary} />
                  <TextInput
                    style={{ flex: 1, color: C.text.primary, fontSize: 14, paddingVertical: 10 }}
                    placeholder="Order discount…"
                    placeholderTextColor={C.text.secondary}
                    keyboardType="decimal-pad"
                    returnKeyType="done"
                    onSubmitEditing={() => { Keyboard.dismiss(); handleDiscountSubmit(); }}
                    onBlur={handleDiscountSubmit}
                    value={orderDiscountInput}
                    onChangeText={handleOrderDiscountChange}
                  />
                </View>
                <TouchableOpacity onPress={handleClearCart} disabled={cart.length === 0}
                  style={{
                    width: 46, height: 46, borderRadius: 12, alignItems: "center", justifyContent: "center",
                    backgroundColor: C.bg.hover, shadowColor: "#000", shadowOpacity: 0.04, shadowRadius: 3, elevation: 1
                  }}>
                  <Trash2 size={17} color={cart.length === 0 ? C.text.secondary : C.status.error} />
                </TouchableOpacity>
              </View>
              <View style={{ flexDirection: "row", gap: 8, marginBottom: 18 }}>
                <TouchableOpacity activeOpacity={0.85} disabled={cart.length === 0 || isParking} onPress={handleParkSale}
                  style={{
                    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
                    paddingVertical: 10, borderRadius: 14,
                    backgroundColor: cart.length === 0 || isParking ? C.bg.card : hexAlpha(C.amber.primary, 0.07),
                    shadowColor: "#000", shadowOpacity: cart.length === 0 || isParking ? 0.1 : 0.2,
                    shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: cart.length === 0 || isParking ? 5 : 0
                  }}>
                  {isParking ? (
                    <ActivityIndicator size="small" color={C.amber.primary} />
                  ) : (
                    <>
                      <Download size={14} color={cart.length === 0 ? C.text.secondary : C.amber.primary} />
                      <Text style={{ marginLeft: 6, fontSize: 10, fontWeight: "800", color: cart.length === 0 ? C.text.secondary : C.amber.primary }}>
                        Park Sale
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
                <TouchableOpacity activeOpacity={0.85} disabled={heldSales.length === 0}
                  onPress={() => setShowHoldsModal(true)}
                  style={{
                    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
                    paddingVertical: 10, borderRadius: 14,
                    backgroundColor: C.bg.card,
                    shadowColor: "#000", shadowOpacity: 0.1, shadowRadius: 10,
                    shadowOffset: { width: 0, height: 4 }, elevation: 5
                  }}>
                  <History size={14} color={heldSales.length === 0 ? C.text.secondary : C.text.primary} />
                  <Text style={{ marginLeft: 6, fontSize: 10, fontWeight: "800", color: heldSales.length === 0 ? C.text.secondary : C.text.primary }}>
                    Holds ({heldSales.length})
                  </Text>
                </TouchableOpacity>
              </View>
              </>
              )}

              {/*
              <Text style={{ color: C.text.secondary, fontSize: 10, fontWeight: "700", textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>
                Sale Date
              </Text>
              <View style={{
                marginBottom: 18,
                borderRadius: 18,
                paddingHorizontal: 14,
                paddingVertical: 8,
                backgroundColor: C.bg.card,
                borderWidth: 1,
                borderColor: C.border.default,
                flexDirection: "row",
                alignItems: "center",
                gap: 12,
                shadowColor: "#000",
                shadowOpacity: 0.08,
                shadowRadius: 8,
                shadowOffset: { width: 0, height: 4 },
                elevation: 2,
              }}>
                <TouchableOpacity activeOpacity={0.82} onPress={openSaleDatePicker} style={{
                  width: 38,
                  height: 38,
                  borderRadius: 12,
                  backgroundColor: hexAlpha(C.amber.primary, 0.10),
                  borderWidth: 1,
                  borderColor: hexAlpha(C.amber.primary, 0.28),
                  alignItems: "center",
                  justifyContent: "center",
                }}>
                  <CalendarDays size={18} color={C.amber.primary} />
                </TouchableOpacity>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: C.text.secondary, fontSize: 10, fontWeight: "700", marginBottom: 2 }}>
                    Invoice issue date
                  </Text>
                  <TextInput
                    value={saleDate}
                    onChangeText={handleSaleDateChange}
                    placeholder={formatLocalDateInput()}
                    placeholderTextColor={C.text.secondary}
                    keyboardType={Platform.OS === "ios" ? "numbers-and-punctuation" : "numeric"}
                    returnKeyType="done"
                    onSubmitEditing={Keyboard.dismiss}
                    maxLength={10}
                    style={{ color: C.text.primary, fontSize: 18, fontWeight: "800", paddingVertical: 4 }}
                  />
                </View>
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => setSaleDate(formatLocalDateInput())}
                  style={{
                    paddingHorizontal: 12,
                    paddingVertical: 8,
                    borderRadius: 10,
                    backgroundColor: C.bg.hover,
                    borderWidth: 1,
                    borderColor: C.border.default,
                  }}>
                  <Text style={{ color: C.text.primary, fontSize: 11, fontWeight: "800" }}>Today</Text>
                </TouchableOpacity>
              </View>

              {showSaleDatePicker && (
                <View style={{
                  marginTop: -8,
                  marginBottom: 18,
                  borderRadius: 20,
                  backgroundColor: C.bg.card,
                  borderWidth: 1,
                  borderColor: C.border.default,
                  padding: 14,
                  shadowColor: "#000",
                  shadowOpacity: 0.12,
                  shadowRadius: 10,
                  shadowOffset: { width: 0, height: 5 },
                  elevation: 4,
                }}>
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                    <TouchableOpacity
                      activeOpacity={0.82}
                      onPress={() => setDatePickerMonth(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))}
                      style={{
                        width: 38,
                        height: 38,
                        borderRadius: 12,
                        backgroundColor: C.bg.hover,
                        borderWidth: 1,
                        borderColor: C.border.default,
                        alignItems: "center",
                        justifyContent: "center",
                      }}>
                      <ChevronLeft size={18} color={C.text.primary} />
                    </TouchableOpacity>
                    <View style={{ alignItems: "center", flex: 1 }}>
                      <Text style={{ color: C.text.primary, fontSize: 16, fontWeight: "900" }}>
                        {datePickerMonth.toLocaleDateString(undefined, { month: "long", year: "numeric" })}
                      </Text>
                      <Text style={{ color: C.text.secondary, fontSize: 10, marginTop: 2 }}>Tap a day to select</Text>
                    </View>
                    <TouchableOpacity
                      activeOpacity={0.82}
                      disabled={datePickerMonth >= new Date(new Date().getFullYear(), new Date().getMonth(), 1)}
                      onPress={() => setDatePickerMonth(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))}
                      style={{
                        width: 38,
                        height: 38,
                        borderRadius: 12,
                        backgroundColor: C.bg.hover,
                        borderWidth: 1,
                        borderColor: C.border.default,
                        alignItems: "center",
                        justifyContent: "center",
                        opacity: datePickerMonth >= new Date(new Date().getFullYear(), new Date().getMonth(), 1) ? 0.35 : 1,
                      }}>
                      <ChevronRight size={18} color={C.text.primary} />
                    </TouchableOpacity>
                  </View>

                  <View style={{ flexDirection: "row", marginBottom: 8 }}>
                    {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(day => (
                      <Text key={day} style={{ flex: 1, textAlign: "center", color: C.text.secondary, fontSize: 9, fontWeight: "800" }}>
                        {day}
                      </Text>
                    ))}
                  </View>

                  <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
                    {saleDatePickerDays.map((day, index) => {
                      const selected = day ? sameCalendarDay(day, parseSaleDateOnly(saleDate)) : false;
                      const today = new Date();
                      const disabled = !day || day > new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999);
                      return (
                        <TouchableOpacity
                          key={`${day?.toISOString() || "blank"}-${index}`}
                          activeOpacity={0.82}
                          disabled={disabled}
                          onPress={() => day && selectSaleDate(day)}
                          style={{ width: `${100 / 7}%`, aspectRatio: 1, padding: 3 }}>
                          <View style={{
                            flex: 1,
                            borderRadius: 12,
                            alignItems: "center",
                            justifyContent: "center",
                            backgroundColor: selected ? C.amber.primary : "transparent",
                            borderWidth: day ? 1 : 0,
                            borderColor: selected ? C.amber.primary : C.border.default,
                            opacity: disabled && day ? 0.35 : 1,
                          }}>
                            {!!day && (
                              <Text style={{ color: selected ? "#000" : C.text.primary, fontSize: 12, fontWeight: selected ? "900" : "700" }}>
                                {day.getDate()}
                              </Text>
                            )}
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
</View>
            )}
            */}

              {/*
              <Text style={{ color: C.text.secondary, fontSize: 10, fontWeight: "700", textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>
                Payment Method
              </Text>
              <View style={{
                flexDirection: "row", alignItems: "center",
                borderRadius: 18, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 14,
                backgroundColor: hexAlpha(C.amber.primary, 0.10),
                borderWidth: 1, borderColor: hexAlpha(C.amber.primary, 0.30),
              }}>
                <View style={{
                  width: 38, height: 38, borderRadius: 12,
                  backgroundColor: hexAlpha(C.amber.primary, 0.16),
                  borderWidth: 1, borderColor: hexAlpha(C.amber.primary, 0.45),
                  alignItems: "center", justifyContent: "center",
                }}>
                  <Banknote size={19} color={C.amber.primary} />
                </View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={{ color: C.amber.primary, fontSize: 14, fontWeight: "800" }}>Cash</Text>
                  <Text style={{ color: C.text.secondary, fontSize: 10, marginTop: 2 }}>Cash drawer payment</Text>
                </View>
              </View>
              */}

              {/* Currency Selector */}
              <Text style={{ color: C.text.secondary, fontSize: 10, fontWeight: "700", textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>
                Currency
              </Text>
              <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
                {[
                  { code: "USD", exchangeRate: 1, symbol: "$" },
                  ...(currencies || []).filter((c: any) => c.code !== "USD")
                ].map((cur: any) => {
                  const isActive = selectedCurrency === cur.code;
                  return (
                    <TouchableOpacity key={cur.code} onPress={() => { setPriceInputs({}); setSelectedCurrency(cur.code); }}
                      style={{
                        minWidth: 76,
                        paddingHorizontal: 15,
                        paddingVertical: 11,
                        borderRadius: 15,
                        backgroundColor: isActive ? hexAlpha(C.amber.primary, 0.10) : C.bg.hover,
                        borderWidth: 1,
                        borderColor: isActive ? C.amber.primary : C.border.default,
                        shadowColor: isActive ? C.amber.primary : "#000",
                        shadowOpacity: isActive ? 0.18 : 0.08,
                        shadowRadius: isActive ? 10 : 6,
                        shadowOffset: { width: 0, height: 4 },
                        elevation: isActive ? 6 : 2
                      }}>
                      <Text style={{ color: isActive ? C.amber.primary : C.text.primary, fontWeight: "800", fontSize: 13 }}>
                        {cur.code}
                      </Text>
                      {cur.code !== "USD" && (
                        <Text style={{ color: C.text.secondary, fontSize: 9, marginTop: 1 }}>{`@${Number(cur.exchangeRate).toFixed(2)}`}</Text>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
              {selectedCurrency !== "USD" && (() => {
                const activeCur = (currencies || []).find((c: any) => c.code === selectedCurrency);
                const localTotal = activeCur ? total * Number(activeCur.exchangeRate) : total;
                return (
                  <View style={{
                    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
                    backgroundColor: hexAlpha(C.amber.primary, 0.08), borderRadius: 16, padding: 14, borderWidth: 1,
                    borderColor: hexAlpha(C.amber.primary, 0.24), marginBottom: 16,
                    shadowColor: C.amber.primary, shadowOpacity: 0.12, shadowRadius: 8,
                    shadowOffset: { width: 0, height: 4 }, elevation: 3
                  }}>
                    <View style={{ flex: 1, paddingRight: 10 }}>
                      <Text style={{ color: C.text.secondary, fontSize: 10, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.8 }}>
                        Exchange total
                      </Text>
                      <Text style={{ color: C.text.primary, fontSize: 12, marginTop: 3 }}>
                        Due in {selectedCurrency}
                      </Text>
                    </View>
                    <Text style={{ color: C.amber.primary, fontSize: 20, fontWeight: "900" }} numberOfLines={1}>
                      {`${selectedCurrency} ${localTotal.toFixed(2)}`}
                    </Text>
                  </View>
                );
              })()}

              <View style={{ marginBottom: 12 }}>
                  <Text style={{ color: C.text.secondary, fontSize: 10, fontWeight: "700", textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>
                    Amount Received
                  </Text>
                  <View style={{
                    flexDirection: "row", alignItems: "center",
                    backgroundColor: C.bg.hover,
                    borderWidth: 1,
                    borderColor: isAmountFocused ? C.amber.primary : C.border.default,
                    borderRadius: 16, paddingHorizontal: 16, paddingVertical: 6,
                    shadowColor: isAmountFocused ? C.amber.primary : "transparent",
                    shadowOffset: { width: 0, height: 0 },
                    shadowOpacity: 0.2,
                    shadowRadius: 4,
                    elevation: isAmountFocused ? 2 : 0
                  }}>
                    <Text style={{ color: C.text.secondary, fontSize: 20, marginRight: 6, fontWeight: "300" }}>{currencyInfo.symbol}</Text>
                    <TextInput
                      style={{ flex: 1, color: C.text.primary, fontSize: 26, fontWeight: "800", paddingVertical: 10 }}
                      placeholder={(total * currencyInfo.rate).toFixed(2)}
                      placeholderTextColor={C.text.secondary}
                      value={paidAmount}
                      onChangeText={setPaidAmount}
                      keyboardType="decimal-pad"
                      onFocus={() => setIsAmountFocused(true)}
                      onBlur={() => setIsAmountFocused(false)}
                      returnKeyType="done"
                      onSubmitEditing={Keyboard.dismiss}
                    />
                  </View>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 10, paddingHorizontal: 4 }}>
                    <Text style={{ color: C.text.secondary, fontSize: 12 }}>Due: {fmt(total)}</Text>
                    {parseFloat(paidAmount || "0") >= (total * currencyInfo.rate) && (
                      <Text style={{ color: C.status.success, fontSize: 13, fontWeight: "700" }}>
                        Change: {fmt((parseFloat(paidAmount || "0") / currencyInfo.rate) - total)}
                      </Text>
                    )}
                  </View>
                </View>
            </ScrollView>

            {!isEditingItemPrice && (
            <View style={{
              paddingHorizontal: 18,
              paddingTop: 14,
              paddingBottom: Math.max(insets.bottom, 18),
              borderTopWidth: 1,
              borderTopColor: C.border.default,
              backgroundColor: C.bg.base
            }}>
              <TouchableOpacity activeOpacity={0.85} disabled={isSubmitting} onPress={processOrder}>
                <LinearGradient colors={[C.amber.primary, C.amber.light]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                  style={{
                    borderRadius: 20, height: 58, paddingHorizontal: 18,
                    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
                    shadowColor: C.amber.primary, shadowOpacity: 0.35, shadowRadius: 14,
                    shadowOffset: { width: 0, height: 6 }, elevation: 8
                  }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
                    <View style={{
                      width: 36, height: 36, borderRadius: 10,
                      backgroundColor: "rgba(0,0,0,0.2)", alignItems: "center", justifyContent: "center"
                    }}>
                      {isSubmitting
                        ? <ActivityIndicator size="small" color="#000" />
                        : <CheckCircle2 size={18} color="#000" />}
                    </View>
                    <View>
                      <Text style={{ color: "#000", fontSize: 13, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.8 }}>
                        {isSubmitting ? "Processing…" : "Confirm Payment"}
                      </Text>
                      <Text style={{ color: "rgba(0,0,0,0.55)", fontSize: 10, marginTop: 2 }}>
                        Cash · {selectedCustomer?.name || "Guest"}
                      </Text>
                    </View>
                  </View>
                  {!isSubmitting && (
                    <Text style={{ color: "#000", fontSize: 17, fontWeight: "900" }}>
                      {fmt(total)}
                    </Text>
                  )}
                </LinearGradient>
              </TouchableOpacity>
            </View>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── CUSTOMER PICKER MODAL ──────────────────────────────────────────── */}
      <Modal visible={showCustomerPicker} transparent animationType="slide" onRequestClose={() => setShowCustomerPicker(false)}>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.8)", justifyContent: "flex-end" }}>
          <View style={{
            backgroundColor: C.bg.card, borderTopLeftRadius: 32, borderTopRightRadius: 32,
            borderTopWidth: 1, borderColor: C.border.default, padding: 24, paddingBottom: Math.max(insets.bottom, 24), maxHeight: "70%"
          }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <Text style={{ color: C.text.primary, fontSize: 22, fontWeight: "800" }}>Select Customer</Text>
              <TouchableOpacity onPress={() => setShowCustomerPicker(false)}
                style={{
                  width: 38, height: 38, borderRadius: 12, backgroundColor: C.bg.hover,
                  borderWidth: 1, borderColor: C.border.default, alignItems: "center", justifyContent: "center"
                }}>
                <X size={16} color={C.text.primary} />
              </TouchableOpacity>
            </View>
            <FlatList
              data={resolvedCustomers}
              keyExtractor={(item: any) => item.id.toString()}
              renderItem={({ item }: { item: any }) => {
                const isSelected = selectedCustomerId === item.id;
                const isDefault = item.id === defaultCustomerId;
                return (
                  <TouchableOpacity
                    onPress={() => { setSelectedCustomerId(item.id); setShowCustomerPicker(false); }}
                    style={{
                      padding: 14, borderRadius: 16, marginBottom: 8,
                      flexDirection: "row", alignItems: "center", borderWidth: 1,
                      borderColor: isSelected ? C.amber.primary : C.border.default,
                      backgroundColor: isSelected ? hexAlpha(C.amber.primary, 0.06) : C.bg.hover
                    }}>
                    <View style={{
                      width: 42, height: 42, borderRadius: 14, backgroundColor: C.bg.hover,
                      borderWidth: 1, borderColor: C.border.default,
                      alignItems: "center", justifyContent: "center", marginRight: 14
                    }}>
                      <User size={18} color={isSelected ? C.amber.primary : C.text.secondary} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                        <Text style={{ color: C.text.primary, fontWeight: "700", fontSize: 14 }}>{item.name}</Text>
                        {isDefault && (
                          <View style={{
                            paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5,
                            backgroundColor: hexAlpha(C.amber.primary, 0.09), borderWidth: 1, borderColor: hexAlpha(C.amber.primary, 0.21)
                          }}>
                            <Text style={{ color: C.amber.primary, fontSize: 8, fontWeight: "800", textTransform: "uppercase" }}>Default</Text>
                          </View>
                        )}
                      </View>
                      {item.phone ? (
                        <Text style={{ color: C.text.secondary, fontSize: 12, marginTop: 2 }}>{item.phone}</Text>
                      ) : null}
                    </View>
                    {isSelected && <CheckCircle2 size={20} color={C.amber.primary} />}
                  </TouchableOpacity>
                );
              }}
            />
          </View>
        </View>
      </Modal>

      {/* ── SUCCESS MODAL ──────────────────────────────────────────────────── */}
      <Modal
        visible={showSuccess}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (!printerConfig.silentPrint && !printerConfig.autoPrint) setShowSuccess(false);
        }}
      >
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.85)", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <View style={{
            backgroundColor: C.bg.card, borderRadius: 32, borderWidth: 1,
            borderColor: C.border.default, width: "100%", maxWidth: 380, overflow: "hidden"
          }}>
            <LinearGradient colors={[hexAlpha(C.amber.primary, 0.09), "transparent"]} style={{ padding: 32, alignItems: "center" }}>
              <View style={{
                width: 80, height: 80, borderRadius: 40,
                backgroundColor: hexAlpha(C.status.success, 0.09), borderWidth: 1.5, borderColor: hexAlpha(C.status.success, 0.25),
                alignItems: "center", justifyContent: "center", marginBottom: 16
              }}>
                <CheckCircle2 size={42} color={C.status.success} />
              </View>
              <Text style={{ color: C.text.primary, fontSize: 26, fontWeight: "900", marginBottom: 6, letterSpacing: -0.3 }}>
                {lastInvoice?._offline ? "Saved Offline!" : "Sale Complete!"}
              </Text>
              <Text style={{ color: C.status.success, fontSize: 13, fontWeight: "600", marginBottom: 24, textAlign: "center" }}>
                {lastInvoice?._offline ? "Will sync automatically when back online." : "Transaction recorded successfully"}
              </Text>
              <View style={{
                width: "100%", backgroundColor: C.bg.hover, borderRadius: 18,
                padding: 16, marginBottom: 20, borderWidth: 1, borderColor: C.border.default
              }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <Text style={{ color: C.text.secondary, fontSize: 12 }}>
                    {lastInvoice?._offline ? "Queued Amount" : "Amount"}
                  </Text>
                  <Text style={{ color: C.amber.primary, fontSize: 24, fontWeight: "900" }}>
                    {fmt(Number(lastInvoice?.total || 0))}
                  </Text>
                </View>
              </View>

              {printerConfig.enabled && (
                <View style={{ width: "100%", gap: 10, marginBottom: 20 }}>
                  <TouchableOpacity activeOpacity={0.8}
                    onPress={() => {
                      handlePrint();
                    }}
                    disabled={isPrinting}
                    style={{
                      flexDirection: "row", alignItems: "center", justifyContent: "center",
                      gap: 10, paddingVertical: 14, borderRadius: 16,
                      backgroundColor: C.bg.hover, borderWidth: 1, borderColor: C.border.default
                    }}>
                    <Printer size={18} color={C.amber.primary} />
                    <Text style={{ color: C.text.primary, fontWeight: "700" }}>Print Receipt</Text>
                  </TouchableOpacity>
                </View>
              )}

              <TouchableOpacity onPress={() => setShowSuccess(false)} style={{ width: "100%", borderRadius: 16, overflow: "hidden" }}>
                <LinearGradient colors={[C.amber.primary, C.amber.light]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                  style={{ paddingVertical: 16, alignItems: "center" }}>
                  <Text style={{ color: "#000", fontWeight: "800", fontSize: 14, textTransform: "uppercase", letterSpacing: 1 }}>New Sale</Text>
                </LinearGradient>
              </TouchableOpacity>
            </LinearGradient>
          </View>
        </View>
      </Modal>

      {/* ── SHIFT MODAL ────────────────────────────────────────────────────── */}
      <Modal visible={showShiftModal} transparent animationType="slide" onRequestClose={() => setShowShiftModal(false)}>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.8)", justifyContent: "flex-end" }}>
          <View style={{
            backgroundColor: C.bg.card, borderTopLeftRadius: 32, borderTopRightRadius: 32,
            borderTopWidth: 1, borderColor: C.border.default, padding: 24, paddingBottom: Math.max(insets.bottom, 36)
          }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <Text style={{ color: C.text.primary, fontSize: 22, fontWeight: "800" }}>
                {shiftModalType === "OPEN" ? "Open Session" : "End Session (Z-Report)"}
              </Text>
              <TouchableOpacity onPress={() => setShowShiftModal(false)}
                style={{
                  width: 38, height: 38, borderRadius: 12, backgroundColor: C.bg.hover,
                  borderWidth: 1, borderColor: C.border.default, alignItems: "center", justifyContent: "center"
                }}>
                <X size={16} color={C.text.primary} />
              </TouchableOpacity>
            </View>
            <Text style={{ color: C.text.secondary, fontSize: 10, fontWeight: "700", textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>
              {shiftModalType === "OPEN" ? "Float / Opening Balance" : "Actual Counted Cash"}
            </Text>

            {shiftModalType === "CLOSE" && shiftSummary && (
              <View style={{ marginBottom: 16, padding: 14, borderRadius: 16, backgroundColor: C.bg.hover, shadowColor: "#000", shadowOpacity: 0.04, shadowRadius: 5, elevation: 2 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <Text style={{ color: C.text.secondary, fontSize: 10, fontWeight: "800", textTransform: "uppercase" }}>Expected in Till</Text>
                  <Text style={{ color: C.text.primary, fontSize: 16, fontWeight: "900" }}>{shiftSummary.currency} {shiftSummary.expectedCash}</Text>
                </View>
                {parseFloat(shiftBalance) > 0 && (
                  <View style={{ borderTopWidth: 1, borderTopColor: C.border.default, paddingTop: 8, flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                    <Text style={{ color: C.text.secondary, fontSize: 10, fontWeight: "700" }}>VARIANCE</Text>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                      <Text style={{
                        color: (parseFloat(shiftBalance) - parseFloat(shiftSummary.expectedCash)) >= 0 ? C.status.success : C.status.error,
                        fontSize: 16, fontWeight: "900"
                      }}>
                        {shiftSummary.currency} {(parseFloat(shiftBalance) - parseFloat(shiftSummary.expectedCash)) >= 0 ? "+" : ""}{(parseFloat(shiftBalance) - parseFloat(shiftSummary.expectedCash)).toFixed(2)}
                      </Text>
                      <View style={{
                        width: 8, height: 8, borderRadius: 4,
                        backgroundColor: (parseFloat(shiftBalance) - parseFloat(shiftSummary.expectedCash)) >= 0 ? C.status.success : C.status.error
                      }} />
                    </View>
                  </View>
                )}
              </View>
            )}
            <TextInput
              style={{
                backgroundColor: C.bg.hover,
                borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14,
                color: C.text.primary, fontSize: 18, fontWeight: "800",
                shadowColor: "#000", shadowOpacity: 0.04, shadowRadius: 3, elevation: 1
              }}
              placeholder="0.00"
              placeholderTextColor={C.text.secondary}
              keyboardType="decimal-pad"
              returnKeyType="done"
              onSubmitEditing={Keyboard.dismiss}
              value={shiftBalance}
              onChangeText={setShiftBalance}
            />
            <View style={{ height: 16 }} />
            <TouchableOpacity activeOpacity={0.88} onPress={() => shiftModalType === "OPEN" ? openShift() : closeShift()}>
              <LinearGradient
                colors={shiftModalType === "OPEN" ? ["#34d399", "#10b981"] : [C.status.error, "#dc2626"]}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                style={{
                  borderRadius: 22, height: 64, paddingHorizontal: 22,
                  flexDirection: "row", alignItems: "center", justifyContent: "space-between",
                  shadowColor: shiftModalType === "OPEN" ? "#34d399" : C.status.error,
                  shadowOpacity: 0.4, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 8
                }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                  {shiftModalType === "OPEN" ? <Play size={20} color="#000" /> : <Pause size={20} color="#fff" />}
                  <Text style={{
                    color: shiftModalType === "OPEN" ? "#000" : "#fff",
                    fontSize: 14, fontWeight: "900", textTransform: "uppercase", letterSpacing: 1.2
                  }}>
                    {shiftModalType === "OPEN" ? "Start Session" : "End Session & Remit"}
                  </Text>
                </View>
                <Text style={{
                  color: shiftModalType === "OPEN" ? "#000" : "rgba(255,255,255,0.9)",
                  fontWeight: "800", fontSize: 16
                }}>
                  ${(parseFloat(shiftBalance || "0") || 0).toFixed(2)}
                </Text>
              </LinearGradient>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => syncQueued(true)} disabled={!isOnline || queueCount === 0}
              style={{ marginTop: 14, alignItems: "center" }}>
              <Text style={{
                color: !isOnline || queueCount === 0 ? C.text.secondary : C.text.secondary,
                fontSize: 11, fontWeight: "900", textTransform: "uppercase", letterSpacing: 1.2
              }}>
                Sync queued now
              </Text>
            </TouchableOpacity>
            {queueCount > 0 && (
              <TouchableOpacity onPress={async () => {
                const sales = await getPendingSales(companyId);
                setOfflineQueueData(sales);
                setShowShiftModal(false);
                setShowOfflineQueue(true);
              }}
                style={{ marginTop: 14, alignItems: "center" }}>
                <Text style={{
                  color: C.amber.primary,
                  fontSize: 11, fontWeight: "900", textTransform: "uppercase", letterSpacing: 1.2
                }}>
                  View Unsynced Sales
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </Modal>

      {/* ── OFFLINE QUEUE MODAL ─────────────────────────────────────────── */}
      <Modal visible={showOfflineQueue} transparent animationType="slide" onRequestClose={() => setShowOfflineQueue(false)}>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.8)", justifyContent: "flex-end" }}>
          <View style={{
            backgroundColor: C.bg.card, borderTopLeftRadius: 32, borderTopRightRadius: 32,
            maxHeight: "85%", padding: 24, paddingBottom: Math.max(insets.bottom, 24)
          }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <Text style={{ color: C.text.primary, fontSize: 20, fontWeight: "900" }}>Unsynced Sales</Text>
              <TouchableOpacity onPress={() => setShowOfflineQueue(false)}>
                <X size={24} color={C.text.primary} />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              {offlineQueueData.length === 0 ? (
                <Text style={{ color: C.text.secondary, textAlign: "center", marginTop: 40 }}>No offline sales.</Text>
              ) : (
                offlineQueueData.map((sale, i) => {
                  const itemsCount = sale.payload?.items?.length || 0;
                  return (
                    <View key={i} style={{
                      backgroundColor: C.bg.hover, padding: 16, borderRadius: 16, marginBottom: 12
                    }}>
                      <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 8 }}>
                        <Text style={{ color: C.text.primary, fontWeight: "800", fontSize: 16 }}>
                          Sale {sale.id?.replace("pending_sale_", "")}
                        </Text>
                        <Text style={{ color: C.text.primary, fontWeight: "900", fontSize: 16 }}>
                          ${parseFloat(sale.payload?.total || "0").toFixed(2)}
                        </Text>
                      </View>
                      <Text style={{ color: C.text.secondary, fontSize: 12 }}>
                        {itemsCount} item{itemsCount !== 1 ? "s" : ""}
                      </Text>
                      <Text style={{ color: C.text.secondary, fontSize: 12, marginTop: 4 }}>
                        {new Date(sale.createdAt).toLocaleString()}
                      </Text>
                    </View>
                  );
                })
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ── SUPERVISOR PIN MODAL ─────────────────────────────────────────── */}
      <ManagerPinModal
        visible={isSupervisorAuthVisible}
        companyId={companyId}
        title="Supervisor Authorization"
        description={supervisorAction === "DROP"
          ? "Admin/Owner PIN required to verify cash collection"
          : "Admin/Owner PIN required to reconcile & end session"
        }
        onClose={() => {
          setIsSupervisorAuthVisible(false);
          setSupervisorAction(null);
        }}
        onAuthorized={(supervisor) => {
          setIsSupervisorAuthVisible(false);
          const action = supervisorAction;
          setSupervisorAction(null);
          if (action === "DROP") {
            handlePayout(supervisor.id);
          } else if (action === "CLOSE") {
            closeShift(supervisor.id);
          }
        }}
      />

      {/* ── MANAGER PIN MODAL (For VOIDS/DISCOUNTS) ────────────────────────── */}
      {pendingOverride && (
        <ManagerPinModal
          visible={!!pendingOverride}
          companyId={companyId}
          title={pendingOverride!.type === "DISCOUNT" ? "Authorize Discount" : "Authorize Void"}
          description={pendingOverride!.type === "DISCOUNT"
            ? "Manager PIN required for high discount"
            : "Manager PIN required to void cart"}
          onClose={() => {
            setPendingOverride(null);
            setOrderDiscountInput(orderDiscount === 0 ? "" : orderDiscount.toString());
          }}
          onAuthorized={() => {
            const po = pendingOverride!;
            if (po.type === "DISCOUNT") {
              setOrderDiscount(po.data);
            } else {
              setCart([]);
              setOrderDiscount(0);
              setSelectedCustomerId(defaultCustomerId);
            }
            setPendingOverride(null);
          }}
        />
      )}

      {/* ── PAYOUT MODAL ─────────────────────────────────────────────────── */}
      <Modal visible={showPayoutModal} transparent animationType="slide" onRequestClose={() => setShowPayoutModal(false)}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.8)", justifyContent: "flex-end" }}
        >
          <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
            <View style={{ flex: 1, justifyContent: "flex-end" }}>
              <View style={{
                backgroundColor: C.bg.card, borderTopLeftRadius: 32, borderTopRightRadius: 32,
                borderTopWidth: 1, borderColor: C.border.default, padding: 24, paddingBottom: Math.max(insets.bottom, 40)
              }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                  <Text style={{ color: C.text.primary, fontSize: 22, fontWeight: "800" }}>
                    {transactionType === "PAYOUT" ? "Log Payout" : "Collect Cash (Drop)"}
                  </Text>
                  <TouchableOpacity onPress={() => setShowPayoutModal(false)}
                    style={{
                      width: 38, height: 38, borderRadius: 12, backgroundColor: C.bg.hover,
                      borderWidth: 1, borderColor: C.border.default, alignItems: "center", justifyContent: "center"
                    }}>
                    <X size={16} color={C.text.primary} />
                  </TouchableOpacity>
                </View>

                {/* Type Selector within modal */}
                <View style={{ flexDirection: "row", gap: 8, marginBottom: 20 }}>
                  {[
                    { type: "PAYOUT", label: "Payout", Icon: Banknote, color: C.status.error, hidden: userRole === "admin" || userRole === "owner" },
                    { type: "DROP", label: "Collection", Icon: Download, color: C.status.info, hidden: false }
                  ].filter(t => !t.hidden).map((t) => (
                    <TouchableOpacity key={t.type} onPress={() => setTransactionType(t.type as any)}
                      style={{
                        flex: 1, height: 48, borderRadius: 12, flexDirection: "row",
                        alignItems: "center", justifyContent: "center", gap: 10,
                        backgroundColor: transactionType === t.type ? (t.type === "PAYOUT" ? hexAlpha(C.status.error, 0.06) : hexAlpha(C.amber.primary, 0.06)) : C.bg.card,
                        shadowColor: "#000", shadowOpacity: transactionType === t.type ? 0.2 : 0.1,
                        shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 5
                      }}>
                      <t.Icon size={16} color={transactionType === t.type ? (t.type === "PAYOUT" ? C.status.error : C.amber.primary) : C.text.secondary} />
                      <Text style={{ color: transactionType === t.type ? C.text.primary : C.text.secondary, fontWeight: "700", fontSize: 13 }}>{t.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* Cashier Selector for Admins */}
                {(userRole === "admin" || userRole === "owner") && (
                  <View style={{ marginBottom: 20 }}>
                    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                      <Text style={{ color: C.text.secondary, fontSize: 10, fontWeight: "700", textTransform: "uppercase", letterSpacing: 1 }}>
                        Select Cashier to Collect From
                      </Text>
                      <TouchableOpacity onPress={fetchCashierBalances} disabled={isFetchingCashierBalances}>
                        {isFetchingCashierBalances ? (
                          <ActivityIndicator size="small" color={C.amber.primary} />
                        ) : (
                          <History size={14} color={C.text.secondary} />
                        )}
                      </TouchableOpacity>
                    </View>

                    {cashierBalances.length === 0 && !isFetchingCashierBalances ? (
                      <View style={{ padding: 20, backgroundColor: C.bg.hover, borderRadius: 16, alignItems: "center", borderWidth: 1, borderColor: C.border.default, borderStyle: "dashed" }}>
                        <Text style={{ color: C.text.secondary, fontSize: 12, textAlign: "center" }}>
                          No cashier cash balances found.
                        </Text>
                      </View>
                    ) : (
                      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                        {cashierBalances.map((s) => (
                          <TouchableOpacity
                            key={s.userId || s.cashierName}
                            onPress={() => {
                              setSelectedCashierBalance(s);
                              setPayoutAmount(Number(s.expectedCash || 0).toFixed(2));
                            }}
                            style={{
                              paddingHorizontal: 12, paddingVertical: 12, borderRadius: 12,
                              backgroundColor: selectedCashierBalance?.userId === s.userId ? hexAlpha(C.amber.primary, 0.13) : C.bg.card,
                              borderWidth: 1.5, borderColor: selectedCashierBalance?.userId === s.userId ? C.amber.primary : C.border.default,
                              minWidth: "47%"
                            }}
                          >
                            <Text style={{ color: C.text.primary, fontWeight: "800", fontSize: 13 }} numberOfLines={1}>{s.cashierName}</Text>
                            <Text style={{ color: C.text.secondary, fontSize: 10, marginTop: 4 }}>To collect ${Number(s.expectedCash || 0).toFixed(2)}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    )}
                  </View>
                )}

                {/* Show expected cash if a cashier is selected */}
                {selectedCashierBalance && (
                  <View style={{ backgroundColor: hexAlpha(C.amber.primary, 0.06), padding: 12, borderRadius: 12, marginBottom: 16, borderWidth: 1, borderColor: hexAlpha(C.amber.primary, 0.19) }}>
                    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                      <Text style={{ color: C.text.secondary, fontSize: 12 }}>Cash to Collect:</Text>
                      <Text style={{ color: C.amber.primary, fontWeight: "800", fontSize: 16 }}>${Number(selectedCashierBalance.expectedCash || 0).toFixed(2)}</Text>
                    </View>
                    <Text style={{ color: C.text.secondary, fontSize: 10, marginTop: 4 }}>
                      Since last collection ${Number(selectedCashierBalance.cashSinceLastCollection || selectedCashierBalance.expectedCash || 0).toFixed(2)}. Total outstanding ${Number(selectedCashierBalance.outstandingCash || 0).toFixed(2)}
                    </Text>
                  </View>
                )}

                <Text style={{ color: C.text.secondary, fontSize: 10, fontWeight: "700", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>
                  {transactionType === "PAYOUT" ? "Amount (Out of Till)" : "Amount to Collect"}
                </Text>
                <TextInput
                  style={{
                    backgroundColor: C.bg.hover,
                    borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14,
                    color: C.text.primary, fontSize: 18, fontWeight: "800", marginBottom: 16,
                    shadowColor: "#000", shadowOpacity: 0.04, shadowRadius: 3, elevation: 1
                  }}
                  placeholder="0.00"
                  placeholderTextColor={C.text.secondary}
                  keyboardType="decimal-pad"
                  autoFocus
                  returnKeyType="next"
                  value={payoutAmount}
                  onChangeText={setPayoutAmount}
                />

                <Text style={{ color: C.text.secondary, fontSize: 10, fontWeight: "700", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Reason / Notes</Text>
                <TextInput
                  style={{
                    backgroundColor: C.bg.hover,
                    borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14,
                    color: C.text.primary, fontSize: 16, marginBottom: 24,
                    shadowColor: "#000", shadowOpacity: 0.04, shadowRadius: 3, elevation: 1
                  }}
                  placeholder={transactionType === "PAYOUT" ? "What was this for?" : "Reference (optional)"}
                  placeholderTextColor={C.text.secondary}
                  returnKeyType="done"
                  onSubmitEditing={() => handlePayout()}
                  value={payoutReason}
                  onChangeText={setPayoutReason}
                />

                <TouchableOpacity activeOpacity={0.88} onPress={() => handlePayout()} disabled={isSubmitting}>
                  <LinearGradient
                    colors={transactionType === "PAYOUT" ? [C.status.error, "#dc2626"] : [C.amber.primary, C.amber.light]}
                    start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                    style={{
                      borderRadius: 22, height: 60, alignItems: "center", justifyContent: "center",
                      shadowColor: transactionType === "PAYOUT" ? C.status.error : C.amber.primary,
                      shadowOpacity: 0.4, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 8
                    }}>
                    {isSubmitting ? <ActivityIndicator color={transactionType === "PAYOUT" ? "#fff" : "#000"} /> : (
                      <Text style={{ color: transactionType === "PAYOUT" ? "#fff" : "#000", fontSize: 14, fontWeight: "900", textTransform: "uppercase", letterSpacing: 1.2 }}>
                        {transactionType === "PAYOUT" ? "Confirm Payout" : "Record Collection"}
                      </Text>
                    )}
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            </View>
          </TouchableWithoutFeedback>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── SUMMARY MODAL ────────────────────────────────────────────────── */}
      <Modal visible={showSummaryModal} transparent animationType="slide" onRequestClose={() => setShowSummaryModal(false)}>
        <View style={{ flex: 1, backgroundColor: hexAlpha(C.bg.base, 0.8), justifyContent: "center", padding: 24 }}>
          <View style={{
            backgroundColor: C.bg.card, borderRadius: 24, padding: 24,
            shadowColor: "#000", shadowOpacity: 0.1, shadowRadius: 15, elevation: 10
          }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
              <Text style={{ color: C.text.primary, fontSize: 22, fontWeight: "800" }}>Session Z-Report</Text>
              <TouchableOpacity onPress={() => setShowSummaryModal(false)}>
                <X size={20} color={C.text.secondary} />
              </TouchableOpacity>
            </View>

            {shiftSummary && (
              <ScrollView style={{ maxHeight: 400 }} showsVerticalScrollIndicator={false}>
                {shiftSummary.totalsByCurrency ? (
                  <View style={{ gap: 16 }}>
                    {Object.values(shiftSummary.totalsByCurrency).map((currData: any) => (
                      <View key={currData.currency} style={{ gap: 12, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: POS_BORDER }}>
                        <Text style={{ color: C.amber.primary, fontSize: 13, fontWeight: "800", textTransform: "uppercase" }}>{currData.currency} SUMMARY</Text>
                        
                        <View style={{ padding: 14, borderRadius: 16, backgroundColor: C.bg.panel, borderWidth: 1, borderColor: POS_BORDER }}>
                          <Text style={{ color: C.text.secondary, fontSize: 10, fontWeight: "700", textTransform: "uppercase", marginBottom: 6 }}>Total Sales ({currData.currency})</Text>
                          <Text style={{ color: C.status.success, fontSize: 20, fontWeight: "900" }}>{currData.currency} {Number(currData.totalSales).toFixed(2)}</Text>
                        </View>

                        {Number(currData.totalPayouts || 0) > 0 && (
                          <View style={{ padding: 14, borderRadius: 16, backgroundColor: hexAlpha(C.status.error, 0.03), borderWidth: 1, borderColor: hexAlpha(C.status.error, 0.15) }}>
                            <Text style={{ color: C.text.secondary, fontSize: 9, fontWeight: "700", textTransform: "uppercase", marginBottom: 4 }}>Petty Cash Paid Out</Text>
                            <Text style={{ color: C.status.error, fontSize: 18, fontWeight: "800" }}>− {currData.currency} {Number(currData.totalPayouts).toFixed(2)}</Text>
                            <Text style={{ color: C.text.secondary, fontSize: 9, marginTop: 3 }}>Till expenses deducted from expected drawer balance</Text>
                          </View>
                        )}

                        <View style={{ padding: 16, borderRadius: 16, backgroundColor: C.bg.panel, borderWidth: 1, borderColor: POS_BORDER }}>
                          <Text style={{ color: C.text.secondary, fontSize: 10, fontWeight: "800", textTransform: "uppercase", marginBottom: 6 }}>Total Float in Till ({currData.currency})</Text>
                          <Text style={{ color: C.text.primary, fontSize: 22, fontWeight: "900" }}>{currData.currency} {Number(currData.expectedCash).toFixed(2)}</Text>
                          <Text style={{ color: C.text.secondary, fontSize: 9, marginTop: 4 }}>Expected cash in drawer incl. opening float of {Number(currData.openingBalance).toFixed(2)}</Text>
                        </View>
                      </View>
                    ))}
                  </View>
                ) : (
                  <View style={{ gap: 12 }}>
                    <View style={{ padding: 14, borderRadius: 16, backgroundColor: C.bg.panel, borderWidth: 1, borderColor: POS_BORDER }}>
                      <Text style={{ color: C.text.secondary, fontSize: 10, fontWeight: "700", textTransform: "uppercase", marginBottom: 6 }}>Total Sales</Text>
                      <Text style={{ color: C.status.success, fontSize: 20, fontWeight: "900" }}>{shiftSummary.currency} {shiftSummary.totalSales}</Text>
                    </View>

                    {shiftSummary.totalPayouts && shiftSummary.totalPayouts !== "0.00" && (
                      <View style={{ padding: 14, borderRadius: 16, backgroundColor: hexAlpha(C.status.error, 0.03), borderWidth: 1, borderColor: hexAlpha(C.status.error, 0.15) }}>
                        <Text style={{ color: C.text.secondary, fontSize: 9, fontWeight: "700", textTransform: "uppercase", marginBottom: 4 }}>Petty Cash Paid Out</Text>
                        <Text style={{ color: C.status.error, fontSize: 18, fontWeight: "800" }}>− {shiftSummary.currency} {shiftSummary.totalPayouts}</Text>
                        <Text style={{ color: C.text.secondary, fontSize: 9, marginTop: 3 }}>Till expenses deducted from expected drawer balance</Text>
                      </View>
                    )}

                    <View style={{ padding: 16, borderRadius: 16, backgroundColor: C.bg.panel, borderWidth: 1, borderColor: POS_BORDER }}>
                      <Text style={{ color: C.text.secondary, fontSize: 10, fontWeight: "800", textTransform: "uppercase", marginBottom: 6 }}>Total Float in Till</Text>
                      <Text style={{ color: C.text.primary, fontSize: 22, fontWeight: "900" }}>{shiftSummary.currency} {shiftSummary.expectedCash}</Text>
                      <Text style={{ color: C.text.secondary, fontSize: 9, marginTop: 4 }}>Expected cash in drawer incl. opening float of {shiftSummary.openingBalance}</Text>
                    </View>
                  </View>
                )}
              </ScrollView>
            )}

            <TouchableOpacity onPress={() => setShowSummaryModal(false)}
              style={{ marginTop: 24, paddingVertical: 14, borderRadius: 16, backgroundColor: C.amber.primary, alignItems: "center" }}>
              <Text style={{ color: "#000", fontWeight: "800", textTransform: "uppercase" }}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
      <Modal visible={showBranchPicker} transparent animationType="slide" onRequestClose={() => setShowBranchPicker(false)}>
        <View style={{ flex: 1, backgroundColor: hexAlpha(C.bg.base, 0.8), justifyContent: "flex-end" }}>
          <View style={{
            backgroundColor: C.bg.card, borderTopLeftRadius: 32, borderTopRightRadius: 32,
            borderTopWidth: 1, borderColor: POS_BORDER, padding: 24, paddingBottom: Math.max(insets.bottom, 36)
          }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <Text style={{ color: C.text.primary, fontSize: 22, fontWeight: "800" }}>Select Branch</Text>
              <TouchableOpacity onPress={() => setShowBranchPicker(false)}
                style={{
                  width: 38, height: 38, borderRadius: 12, backgroundColor: C.bg.panel,
                  alignItems: "center", justifyContent: "center",
                  shadowColor: "#000", shadowOpacity: 0.04, shadowRadius: 3, elevation: 1
                }}>
                <X size={16} color={C.text.primary} />
              </TouchableOpacity>
            </View>

            {loadingBranches ? (
              <ActivityIndicator color={C.amber.primary} style={{ marginVertical: 40 }} />
            ) : (
              <ScrollView style={{ maxHeight: 400 }}>
                {branchesData?.map((b: any) => (
                  <TouchableOpacity
                    key={b.id}
                    onPress={async () => {
                      setInternalBranchId(b.id);
                      await setSelectedBranchId(b.id);
                      setShowBranchPicker(false);
                      // Refresh data effectively
                      refreshProducts();
                      fetchShift();
                      fetchHeldSales();
                    }}
                    style={{
                      flexDirection: "row", alignItems: "center", justifyContent: "space-between",
                      paddingVertical: 16
                    }}
                  >
                    <View>
                      <Text style={{ color: C.text.primary, fontSize: 16, fontWeight: "700" }}>{b.name}</Text>
                      <Text style={{ color: C.text.secondary, fontSize: 12, marginTop: 2 }}>{b.location || "Physical Store"}</Text>
                    </View>
                    {selectedBranchId === b.id && (
                      <CheckCircle2 size={20} color={C.status.success} />
                    )}
                  </TouchableOpacity>
                ))}

                {(!branchesData || branchesData.length === 0) && (
                  <View style={{ paddingVertical: 40, alignItems: "center" }}>
                    <Text style={{ color: C.text.secondary }}>No branches found</Text>
                  </View>
                )}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* ── QUICK MENU MODAL ──────────────────────────────────────────────── */}
      <Modal visible={showQuickMenu} transparent animationType="fade" onRequestClose={() => setShowQuickMenu(false)}>
        <TouchableWithoutFeedback onPress={() => setShowQuickMenu(false)}>
          <View style={{ flex: 1, backgroundColor: hexAlpha(C.bg.base, 0.75), justifyContent: "flex-end" }}>
            <TouchableWithoutFeedback>
              <View style={{
                backgroundColor: C.bg.base, borderTopLeftRadius: 28, borderTopRightRadius: 28,
                paddingHorizontal: 20, paddingTop: 16, paddingBottom: Math.max(insets.bottom, 20),
                borderTopWidth: 1, borderColor: POS_BORDER
              }}>
                {/* Drag handle */}
                <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: POS_BORDER, alignSelf: "center", marginBottom: 16 }} />

                <Text style={{ color: C.text.secondary, fontSize: 10, fontWeight: "800", textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 12 }}>
                  Quick Actions
                </Text>

                {/* Shift status */}
                <TouchableOpacity
                  onPress={() => {
                    setShowQuickMenu(false);
                    const type = currentShift ? "CLOSE" : "OPEN";
                    setShiftModalType(type);
                    if (type === "CLOSE") fetchShiftSummary();
                    else setShiftSummary(null);
                    setShowShiftModal(true);
                  }}
                  style={{
                    flexDirection: "row", alignItems: "center", padding: 14, borderRadius: 14,
                    backgroundColor: C.bg.panel, marginBottom: 8,
                    shadowColor: "#000", shadowOpacity: 0.05, shadowRadius: 6, elevation: 2
                  }}>
                  <View style={{
                    width: 36, height: 36, borderRadius: 10,
                    backgroundColor: currentShift ? "rgba(0,208,132,0.12)" : "rgba(251,191,36,0.12)",
                    alignItems: "center", justifyContent: "center", marginRight: 14
                  }}>
                    {currentShift ? <Play size={18} color={C.status.success} /> : <Pause size={18} color="#fbbf24" />}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: C.text.primary, fontSize: 14, fontWeight: "700" }}>
                      {currentShift ? "End Shift" : "Start Shift"}
                    </Text>
                    <Text style={{ color: C.text.secondary, fontSize: 11 }}>
                      {currentShift ? "Shift is currently active" : "No active shift"}
                    </Text>
                  </View>
                  <View style={{
                    width: 8, height: 8, borderRadius: 4,
                    backgroundColor: currentShift ? C.status.success : "#fbbf24"
                  }} />
                </TouchableOpacity>

                {/* Held Sales */}
                <TouchableOpacity
                  onPress={() => { setShowQuickMenu(false); setShowHoldsModal(true); }}
                  style={{
                    flexDirection: "row", alignItems: "center", padding: 14, borderRadius: 14,
                    backgroundColor: C.bg.hover, marginBottom: 8
                  }}>
                  <View style={{
                    width: 36, height: 36, borderRadius: 10, backgroundColor: hexAlpha(C.amber.primary, 0.1),
                    alignItems: "center", justifyContent: "center", marginRight: 14
                  }}>
                    <History size={18} color={C.amber.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: C.text.primary, fontSize: 14, fontWeight: "700" }}>Held Sales</Text>
                    <Text style={{ color: C.text.secondary, fontSize: 11 }}>
                      {heldSales.length > 0 ? `${heldSales.length} parked` : "No held sales"}
                    </Text>
                  </View>
                  {heldSales.length > 0 && (
                    <View style={{
                      backgroundColor: C.amber.primary, borderRadius: 10, minWidth: 20, height: 20,
                      alignItems: "center", justifyContent: "center", paddingHorizontal: 6
                    }}>
                      <Text style={{ color: "#000", fontSize: 11, fontWeight: "900" }}>{heldSales.length}</Text>
                    </View>
                  )}
                </TouchableOpacity>

                {/* Collection (Drop) */}
                {(currentShift || userRole === "admin" || userRole === "owner") && (
                  <TouchableOpacity
                    onPress={() => { setShowQuickMenu(false); setTransactionType("DROP"); setShowPayoutModal(true); }}
                    style={{
                      flexDirection: "row", alignItems: "center", padding: 14, borderRadius: 14,
                      backgroundColor: C.bg.hover, marginBottom: 8
                    }}>
                    <View style={{
                      width: 36, height: 36, borderRadius: 10, backgroundColor: hexAlpha(C.amber.primary, 0.1),
                      alignItems: "center", justifyContent: "center", marginRight: 14
                    }}>
                      <Download size={18} color={C.amber.primary} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: C.text.primary, fontSize: 14, fontWeight: "700" }}>Collection</Text>
                      <Text style={{ color: C.text.secondary, fontSize: 11 }}>Cash drop / payout</Text>
                    </View>
                  </TouchableOpacity>
                )}

                {/* X/Z Report */}
                {currentShift && (
                  <TouchableOpacity
                    onPress={() => { setShowQuickMenu(false); fetchShiftSummary(); }}
                    style={{
                      flexDirection: "row", alignItems: "center", padding: 14, borderRadius: 14,
                      backgroundColor: C.bg.hover, marginBottom: 8
                    }}>
                    <View style={{
                      width: 36, height: 36, borderRadius: 10, backgroundColor: hexAlpha(C.amber.primary, 0.1),
                      alignItems: "center", justifyContent: "center", marginRight: 14
                    }}>
                      <Clock size={18} color={C.amber.primary} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: C.text.primary, fontSize: 14, fontWeight: "700" }}>X/Z Report</Text>
                      <Text style={{ color: C.text.secondary, fontSize: 11 }}>Shift sales summary</Text>
                    </View>
                  </TouchableOpacity>
                )}

                {/* Printer Settings */}
                <TouchableOpacity
                  onPress={() => { setShowQuickMenu(false); setShowPrinterSettings(true); }}
                  style={{
                    flexDirection: "row", alignItems: "center", padding: 14, borderRadius: 14,
                    backgroundColor: C.bg.hover, marginBottom: 8
                  }}>
                  <View style={{
                    width: 36, height: 36, borderRadius: 10, backgroundColor: hexAlpha(C.amber.primary, 0.1),
                    alignItems: "center", justifyContent: "center", marginRight: 14
                  }}>
                    <Printer size={18} color={printerConfig.macAddress || printerConfig.targetPrinter ? C.status.success : C.text.secondary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: C.text.primary, fontSize: 14, fontWeight: "700" }}>Printer</Text>
                    <Text style={{ color: C.text.secondary, fontSize: 11 }}>
                      {printerConfig.macAddress || printerConfig.targetPrinter ? "Connected" : "Not connected"}
                    </Text>
                  </View>
                  {(!!printerConfig.macAddress || !!printerConfig.targetPrinter) && (
                    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: C.status.success }} />
                  )}
                </TouchableOpacity>

                {/* Currency toggle */}
                {(currencies && currencies.filter((c: any) => c.code !== "USD").length > 0) && (
                  <TouchableOpacity
                    onPress={() => {
                      const allCurrencies = ["USD", ...(currencies || []).filter((c: any) => c.code !== "USD").map((c: any) => c.code)];
                      const currentIdx = allCurrencies.indexOf(selectedCurrency);
                      const nextIdx = (currentIdx + 1) % allCurrencies.length;
                      setSelectedCurrency(allCurrencies[nextIdx]);
                    }}
                    style={{
                      flexDirection: "row", alignItems: "center", padding: 14, borderRadius: 14,
                      backgroundColor: C.bg.hover, marginBottom: 8
                    }}>
                    <View style={{
                      width: 36, height: 36, borderRadius: 10,
                      backgroundColor: selectedCurrency !== "USD" ? hexAlpha(C.amber.primary, 0.1) : "rgba(255,255,255,0.05)",
                      alignItems: "center", justifyContent: "center", marginRight: 14
                    }}>
                      <CreditCard size={18} color={selectedCurrency !== "USD" ? C.amber.primary : C.text.secondary} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: C.text.primary, fontSize: 14, fontWeight: "700" }}>Currency: {selectedCurrency}</Text>
                      <Text style={{ color: C.text.secondary, fontSize: 11 }}>Tap to switch</Text>
                    </View>
                  </TouchableOpacity>
                )}

                {/* Sync status */}
                <TouchableOpacity
                  onPress={() => { setShowQuickMenu(false); syncQueued(true); }}
                  style={{
                    flexDirection: "row", alignItems: "center", padding: 14, borderRadius: 14,
                    backgroundColor: C.bg.hover, marginBottom: 4
                  }}>
                  <View style={{
                    width: 36, height: 36, borderRadius: 10, backgroundColor: "rgba(255,255,255,0.05)",
                    alignItems: "center", justifyContent: "center", marginRight: 14
                  }}>
                    <CloudUpload size={18} color={isSyncing ? C.amber.primary : C.text.secondary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: C.text.primary, fontSize: 14, fontWeight: "700" }}>
                      {isSyncing ? "Syncing..." : "Sync Now"}
                    </Text>
                    <Text style={{ color: C.text.secondary, fontSize: 11 }}>
                      {queueCount ? `${queueCount} queued items` : "Everything synced"}
                    </Text>
                  </View>
                  {queueCount > 0 && (
                    <View style={{
                      backgroundColor: C.amber.primary, borderRadius: 10, minWidth: 20, height: 20,
                      alignItems: "center", justifyContent: "center", paddingHorizontal: 6
                    }}>
                      <Text style={{ color: "#000", fontSize: 11, fontWeight: "900" }}>{queueCount}</Text>
                    </View>
                  )}
                </TouchableOpacity>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      <PrinterSettingsModal
        visible={showPrinterSettings}
        onClose={() => setShowPrinterSettings(false)}
      />
    </View>
  );
}

