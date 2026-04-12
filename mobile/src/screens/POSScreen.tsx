import React, { useEffect, useMemo, useState, useRef } from "react";
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  Text,
  TextInput,
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
  Easing
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
  CloudUpload,
  History,
  ScanLine,
  Menu,
  Printer,
  Bluetooth,
  ToggleLeft,
  ToggleRight,
  Clock,
  Play,
  Pause,
  MonitorSmartphone,
  Package
} from "lucide-react-native";
import { usePrinter } from "../hooks/usePrinter";
import { PrinterSettingsModal } from "../ui/PrinterSettingsModal";
import { StatusBar } from "expo-status-bar";
import { useTheme } from "../ui/PremiumColors";
import * as Haptics from "expo-haptics";
import { playCheckoutSound } from "../lib/checkoutSound";
import { resolveMediaUrl } from "../lib/media";
import { useFrequentItems } from "../hooks/useFrequentItems";
import { Swipeable } from "react-native-gesture-handler";
import { useProducts, useCreateInvoice, useCustomers, useCompany, useCurrencies, useTaxTypes, useBranches } from "../hooks/usePosData";
import { apiFetch } from "../lib/api";
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
};

const FlyingParticle = ({ startX, startY, endX, endY, onComplete, color, emoji }) => {
  const anim = React.useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    Animated.timing(anim, {
      toValue: 1,
      duration: 550,
      easing: Easing.out(Easing.poly(4)),
      useNativeDriver: true,
    }).start(onComplete);
  }, []);

  const translateX = anim.interpolate({ inputRange: [0, 1], outputRange: [startX, endX] });
  const translateY = anim.interpolate({ inputRange: [0, 1], outputRange: [startY, endY] });
  const scale = anim.interpolate({ inputRange: [0, 0.2, 0.8, 1], outputRange: [0.5, 1.2, 1, 0.2] });
  const rotate = anim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  return (
    <Animated.View style={{
      position: 'absolute', left: 0, top: 0,
      transform: [{ translateX }, { translateY }, { scale }, { rotate }],
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
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: `${color}05` }}>
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
export function POSScreen({ companyId, userName, onOpenDrawer }: Props) {
  const { theme: C, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const [isOnline, setIsOnline] = useState(true);
  const isOnlineRef = React.useRef(true);
  const [queueCount, setQueueCount] = useState(0);

  const { data: branchesData, isLoading: loadingBranches } = useBranches(companyId);
  const [flyingItems, setFlyingItems] = useState<{ id: number; x: number; y: number; color: string; emoji: string }[]>([]);
  const cartIconRef = useRef<View>(null);
  const [cartPos, setCartPos] = useState<{ x: number; y: number } | null>(null);
  const cartBounceAnim = useRef(new Animated.Value(1)).current;

  const triggerCartBounce = () => {
    Animated.sequence([
      Animated.timing(cartBounceAnim, { toValue: 1.15, duration: 100, useNativeDriver: true }),
      Animated.spring(cartBounceAnim, { toValue: 1, friction: 3, tension: 40, useNativeDriver: true })
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
  const { data: customersData, fromCache: customersFromCache } = useCustomers(companyId);
  const { data: company } = useCompany(companyId);
  const { data: currencies } = useCurrencies(companyId);
  const { data: taxTypes } = useTaxTypes(companyId);
  const { create: createInvoice } = useCreateInvoice(companyId);

  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<number | null>(null);
  const [paymentMethod, setPaymentMethod] = useState("CASH");
  const [selectedCurrency, setSelectedCurrency] = useState("USD");
  const [orderDiscount, setOrderDiscount] = useState(0);
  const [orderDiscountInput, setOrderDiscountInput] = useState("");
  const [showCheckout, setShowCheckout] = useState(false);
  const [showCustomerPicker, setShowCustomerPicker] = useState(false);
  const [showCart, setShowCart] = useState(false);
  const [paidAmount, setPaidAmount] = useState("");
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

  // Sync input field when orderDiscount is changed from OUTSIDE (e.g. resuming hold, manager override)
  // Use a ref to avoid the loop: don't overwrite when the user is actively typing
  const isTypingDiscount = React.useRef(false);
  useEffect(() => {
    if (!isTypingDiscount.current) {
      setOrderDiscountInput(orderDiscount === 0 ? "" : orderDiscount.toString());
    }
  }, [orderDiscount]);

  // When currency changes while checkout is open, convert paidAmount to the new currency
  useEffect(() => {
    if (showCheckout) {
      setPaidAmount((total * currencyInfo.rate).toFixed(2));
    }
  }, [selectedCurrency]);

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
      return resolvedProducts.filter((p: any) => {
        if (!p) return false;
        const matchesSearch =
          !search ||
          (p.name?.toLowerCase().includes(search.toLowerCase()) ?? false) ||
          (p.sku?.toLowerCase().includes(search.toLowerCase()) ?? false);
        const matchesCategory = selectedCategory === "All" || p.category === selectedCategory;
        return matchesSearch && matchesCategory;
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
  const selectedCustomer = resolvedCustomers.find((c: any) => c.id === selectedCustomerId);
  const isDefaultCustomerSelected = selectedCustomerId === defaultCustomerId;

  const addToCart = (product: any, event?: any) => {
    // Spawn flying particle animation towards cart
    if (event?.nativeEvent && cartPos) {
      const { pageX, pageY } = event.nativeEvent;
      const idx = (product.id || 0) % CAT_PALETTE.length;
      const id = Date.now() + Math.random();
      setFlyingItems(prev => [...prev, { id, x: pageX - 13, y: pageY - 13, color: CAT_PALETTE[idx], emoji: PROD_EMOJIS[idx] }]);
      setTimeout(triggerCartBounce, 530);
    }

    if (product.isTracked) {
      const inCart = cart.find((item: CartItem) => item.productId === product.id)?.quantity || 0;
      if (inCart >= Number(product.stockLevel || 0)) {
        if (Number(product.stockLevel || 0) === 0) {
          Alert.alert("Out of Stock", `${product.name} is currently out of stock.`);
        }
        return;
      }
    }

    const existing = cart.find((item: CartItem) => item.productId === product.id);
    if (existing) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } else {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }

    setCart((prev: CartItem[]) => {
      const existingInPre = prev.find((item: CartItem) => item.productId === product.id);
      if (existingInPre) {
        return prev.map((item: CartItem) =>
          item.productId === product.id ? { ...item, quantity: item.quantity + 1 } : item
        );
      }
      let taxRate = company?.vatRegistered ? Number(product.taxRate ?? 15) : 0;
      if (company?.vatRegistered && product.taxCategoryId && taxTypes) {
        const category = (taxTypes as any[]).find((t: any) => t.id === product.taxCategoryId);
        if (category) taxRate = Number(category.rate);
      }
      return [...prev, {
        productId: product.id, name: product.name, price: Number(product.price),
        quantity: 1, discountAmount: 0, taxRate,
        taxTypeId: product.taxTypeId, hsCode: product.hsCode, category: product.category,
        stockLevel: Number(product.stockLevel || 0), isTracked: product.isTracked
      }];
    });
    // Record this product as frequently sold (fire-and-forget)
    recordAdd({ productId: product.id, name: product.name, price: Number(product.price), category: product.category });
  };

  const updateQuantity = (productId: number, delta: number, event?: any) => {
    if (delta > 0 && event?.nativeEvent && cartPos) {
      const { pageX, pageY } = event.nativeEvent;
      const idx = productId % CAT_PALETTE.length;
      const id = Date.now() + Math.random();
      setFlyingItems(prev => [...prev, { id, x: pageX - 13, y: pageY - 13, color: CAT_PALETTE[idx], emoji: PROD_EMOJIS[idx] }]);
      setTimeout(triggerCartBounce, 530);
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setCart((prev: CartItem[]) =>
      prev.map((item: CartItem) => {
        if (item.productId !== productId) return item;
        const newQty = item.quantity + delta;
        if (newQty < 1) return item;
        if (item.isTracked && newQty > (item.stockLevel || 0)) return item;
        return { ...item, quantity: newQty };
      })
    );
  };

  const removeFromCart = (productId: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setCart((prev: CartItem[]) => prev.filter((item: CartItem) => item.productId !== productId));
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
        const res = await apiFetch("/api/pos/shifts/open", { method: "POST", body: JSON.stringify({ companyId, openingBalance }) });
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
          body: JSON.stringify({
            closingBalance,
            reconciledBy: supervisorId
          })
        });
        if (res.ok) { setCurrentShift(null); await setProvisionalShift(companyId, null); setShowShiftModal(false); setShiftBalance(""); return; }
        else Alert.alert("Session Error", await res.text().catch(() => "Unknown error"));
      }
      await addPendingShiftAction({ companyId, branchId: selectedBranchId, type: "close", payload: { shiftId: Number(currentShift.id), closingBalance, reconciledBy: supervisorId } });
      setCurrentShift(null); await setProvisionalShift(companyId, null); setShowShiftModal(false); setShiftBalance("");
    } catch { /* ignore */ }
  };

  const handlePayout = async (supervisorId?: string) => {
    if (!currentShift || !payoutAmount) return;

    // Require supervisor PIN for Drops (Collections)
    if (transactionType === "DROP" && !supervisorId) {
      setShowPayoutModal(false); // close payout modal first to prevent modal freeze
      setSupervisorAction("DROP");
      setTimeout(() => setIsSupervisorAuthVisible(true), 350); // wait for modal to fully close
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await apiFetch(`/api/pos/shifts/${currentShift.id}/transaction`, {
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
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        // Refresh summary if it was open or just as good practice
        if (showSummaryModal) fetchShiftSummary();
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
            const res = await apiFetch("/api/pos/shifts/open", { method: "POST", body: JSON.stringify({ companyId, openingBalance: action.payload.openingBalance }) });
            if (res.ok) { await removePendingShiftAction(action.id); successCount++; }
          } else {
            const res = await apiFetch(`/api/pos/shifts/${action.payload.shiftId}/close`, { method: "POST", body: JSON.stringify({ closingBalance: action.payload.closingBalance }) });
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
      setShowCart(false);
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
    setShowHoldsModal(false); setShowCart(true);
    try {
      if (!hold._offline) await apiFetch(`/api/pos/holds/${hold.id}`, { method: "DELETE" });
      await fetchHeldSales();
    } catch { /* ignore */ }
  };

  const handleCheckout = () => {
    Keyboard.dismiss();
    if (!cart.length) return;
    if (!selectedCustomerId) {
      if (defaultCustomerId) setSelectedCustomerId(defaultCustomerId);
      else return;
    }
    setPaidAmount((total * currencyInfo.rate).toFixed(2));
    setShowCheckout(true);
  };

  const processOrder = async () => {
    if (!selectedCustomerId) return;
    // paid is in local currency, total is in base — compare in same unit
    const paid = parseFloat(paidAmount || "0");
    if (paid < total * currencyInfo.rate - 0.001) return;
    const currencyObj = resolvedCurrencies.find((c: any) => c.code === selectedCurrency) || { code: "USD", exchangeRate: "1" };
    const invoiceData = {
      customerId: selectedCustomerId,
      branchId: selectedBranchId,
      subtotal: subtotal.toFixed(2), taxAmount: taxAmount.toFixed(2), total: total.toFixed(2),
      currency: currencyObj.code, exchangeRate: currencyObj.exchangeRate,
      paymentMethod, status: "issued", notes: "POS Transaction (Mobile)",
      discountAmount: orderDiscount.toFixed(2), taxInclusive,
      transactionType: company?.vatRegistered ? "FiscalInvoice" : "Invoice",
      isPos: true,
      shiftId: currentShift?.id, // Link to current shift for accurate summaries
      invoiceNumber: `POS-${Date.now()}`,
      issueDate: new Date().toISOString(),
      dueDate: new Date().toISOString(),
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
          body: JSON.stringify({ companyId, openingBalance })
        }).then(async (res) => {
          if (res.ok) fetchShift(); // quietly refresh in background
        }).catch((e) => console.error("Auto-shift open error:", e));
      } else {
        addPendingShiftAction({ companyId, branchId: selectedBranchId, type: "open", payload: { openingBalance } }); // not awaited
        setProvisionalShift(companyId, provisional); // not awaited
      }
    }

    // ── OPTIMISTIC UI: clear state and show success immediately ─────────────
    setLastInvoice({ ...invoiceData, id: `optimistic_${Date.now()}`, _pending: true });
    setCart([]); setOrderDiscount(0); setOrderDiscountInput("");
    setShowCheckout(false); setShowCart(false); setPaidAmount("");
    resetToDefaultCustomer();
    setIsSubmitting(false);
    if (printerConfig.autoShowModal) setShowSuccess(true);
    // Success haptic + sound
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    playCheckoutSound().catch(() => { });

    // Trigger auto-print with a short delay now that state is already cleared
    if (printerConfig.autoPrint) {
      setTimeout(() => {
        handlePrint();
      }, 200);
    }

    // ── BACKGROUND: post the invoice to the server ───────────────────────────
    if (!isOnline) {
      addPendingSale(companyId, invoiceData, selectedBranchId).then((offlineId) => {
        setLastInvoice((prev: any) => ({ ...prev, id: offlineId, _offline: true }));
        refreshProducts();
      });
    } else {
      createInvoice(invoiceData)
        .then((created: any) => {
          setLastInvoice(created); // update so receipt printing uses the real invoice
          refreshProducts();
        })
        .catch(async () => {
          // Network failed after optimistic update — queue it offline silently
          const offlineId = await addPendingSale(companyId, invoiceData, selectedBranchId);
          setLastInvoice((prev: any) => ({ ...prev, id: offlineId, _offline: true }));
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

      <View style={{
        paddingHorizontal: 16,
        paddingTop: Math.max(insets.top, 16),
        paddingBottom: 4,
        backgroundColor: C.bg.base,
      }}>

        {/* Row 1: brand + Actions */}
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <TouchableOpacity onPress={onOpenDrawer}
              activeOpacity={0.7}
              style={{
                width: 44, height: 44, borderRadius: 16, backgroundColor: C.bg.card,
                alignItems: "center", justifyContent: "center",
                shadowColor: "#000", shadowOpacity: 0.1, shadowRadius: 10, shadowOffset: { width: 0, height: 5 }, elevation: 5
              }}>
              <Menu size={22} color={C.amber.primary} />
            </TouchableOpacity>
            
            <View>
              <Text style={{ color: C.text.primary, fontSize: 20, fontWeight: "900", letterSpacing: -1 }}>
                POS
              </Text>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                <View style={{
                  width: 6, height: 6, borderRadius: 3, 
                  backgroundColor: isOnline ? C.status.success : C.status.error,
                  shadowColor: isOnline ? C.status.success : C.status.error, shadowOpacity: 0.8, shadowRadius: 4
                }} />
                <Text style={{ fontSize: 9, fontWeight: "800", color: C.text.secondary, textTransform: "uppercase", letterSpacing: 0.5 }}>
                  {isOnline ? "Network Ready" : "Offline Mode"}
                </Text>
              </View>
            </View>
          </View>

          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            {/* Currency Pill */}
            {(currencies && currencies.filter((c: any) => c.code !== "USD").length > 0) && (
              <TouchableOpacity
                onPress={() => {
                  const allCurrencies = ["USD", ...(currencies || []).filter((c: any) => c.code !== "USD").map((c: any) => c.code)];
                  const currentIdx = allCurrencies.indexOf(selectedCurrency);
                  const nextIdx = (currentIdx + 1) % allCurrencies.length;
                  setSelectedCurrency(allCurrencies[nextIdx]);
                }}
                activeOpacity={0.7}
                style={{
                  height: 38, borderRadius: 19, backgroundColor: selectedCurrency !== "USD" ? `${C.amber.primary}15` : C.bg.card,
                  paddingHorizontal: 12, alignItems: "center", justifyContent: "center",
                  shadowColor: "#000", shadowOpacity: 0.05, shadowRadius: 8, elevation: 2
                }}>
                <Text style={{ color: selectedCurrency !== "USD" ? C.amber.primary : C.text.primary, fontSize: 11, fontWeight: "900" }}>
                  {selectedCurrency}
                </Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity activeOpacity={0.7} onPress={() => setShowPrinterSettings(true)}
              style={{
                width: 44, height: 44, borderRadius: 16, backgroundColor: C.bg.card,
                alignItems: "center", justifyContent: "center",
                shadowColor: "#000", shadowOpacity: 0.08, shadowRadius: 10, elevation: 4
              }}>
              <Printer size={18} color={printerConfig.macAddress || printerConfig.targetPrinter ? C.status.success : C.text.secondary} />
              {(!!printerConfig.macAddress || !!printerConfig.targetPrinter) && (
                <View style={{
                  position: "absolute", top: 12, right: 12,
                  width: 8, height: 8, borderRadius: 4, backgroundColor: C.status.success,
                  borderWidth: 2, borderColor: C.bg.card
                }} />
              )}
            </TouchableOpacity>

            <TouchableOpacity activeOpacity={0.7} onPress={() => setShowCustomerPicker(true)}
              style={{
                width: 44, height: 44, borderRadius: 16, backgroundColor: C.bg.card,
                alignItems: "center", justifyContent: "center",
                shadowColor: "#000", shadowOpacity: 0.08, shadowRadius: 10, elevation: 4
              }}>
              <User size={18} color={isDefaultCustomerSelected ? C.text.secondary : C.status.success} />
              {!isDefaultCustomerSelected && (
                <View style={{
                  position: "absolute", top: 12, right: 12,
                  width: 8, height: 8, borderRadius: 4, backgroundColor: C.status.success,
                  borderWidth: 2, borderColor: C.bg.card
                }} />
              )}
            </TouchableOpacity>

            <TouchableOpacity activeOpacity={0.7} onPress={() => setShowHoldsModal(true)}
              style={{
                width: 44, height: 44, borderRadius: 16, backgroundColor: C.bg.card,
                alignItems: "center", justifyContent: "center",
                shadowColor: "#000", shadowOpacity: 0.08, shadowRadius: 10, elevation: 4
              }}>
              <History size={18} color={heldSales.length > 0 ? C.amber.primary : C.text.secondary} />
              {heldSales.length > 0 && (
                <View style={{
                  position: "absolute", top: 12, right: 12,
                  width: 8, height: 8, borderRadius: 4, backgroundColor: C.amber.primary,
                  borderWidth: 2, borderColor: C.bg.card
                }} />
              )}
            </TouchableOpacity>
          </View>
        </View>

        {/* Row 2: Shift + Sync Status */}
        <View style={{ 
          flexDirection: "row", alignItems: "center", justifyContent: "space-between", 
          marginBottom: 16, backgroundColor: C.bg.hover, padding: 8, borderRadius: 18
        }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <TouchableOpacity activeOpacity={0.7}
              onPress={() => {
                const type = currentShift ? "CLOSE" : "OPEN";
                setShiftModalType(type);
                if (type === "CLOSE") fetchShiftSummary();
                else setShiftSummary(null);
                setShowShiftModal(true);
              }}
              style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingLeft: 4 }}>
              <View style={{
                width: 8, height: 8, borderRadius: 4,
                backgroundColor: currentShift ? C.status.success : "#fbbf24",
                shadowColor: currentShift ? C.status.success : "#fbbf24", shadowOpacity: 0.5, shadowRadius: 4
              }} />
              <Text style={{ color: C.text.primary, fontSize: 12, fontWeight: "800", letterSpacing: -0.3 }}>
                {currentShift ? "Active Shift" : "Shift Closed"}
              </Text>
            </TouchableOpacity>

            {currentShift && (
              <>
                <View style={{ width: 1, height: 14, backgroundColor: "rgba(0,0,0,0.05)" }} />
                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={() => { setTransactionType("PAYOUT"); setShowPayoutModal(true); }}
                  style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Banknote size={14} color={C.amber.primary} />
                  <Text style={{ color: C.text.primary, fontSize: 11, fontWeight: "900" }}>Cash Payout</Text>
                </TouchableOpacity>
              </>
            )}
          </View>

          <View style={{
            flexDirection: "row", alignItems: "center", gap: 6,
            backgroundColor: isSyncing ? C.amber.primary : "rgba(0,0,0,0.03)", 
            borderRadius: 12, paddingHorizontal: 10, paddingVertical: 5,
          }}>
            {isSyncing ? <ActivityIndicator size="small" color="#000" style={{ transform: [{ scale: 0.6 }] }} /> : <CloudUpload size={12} color={isSyncing ? "#000" : C.text.secondary} />}
            <Text style={{ color: isSyncing ? "#000" : C.text.secondary, fontSize: 10, fontWeight: "900", letterSpacing: 0.2 }}>
              {isSyncing ? "Syncing" : (queueCount ? `${queueCount} Queued` : "Cloud Synced")}
            </Text>
          </View>
        </View>

        {/* Search + scan */}
        <View style={{ flexDirection: "row", gap: 8, marginBottom: 10 }}>
          <View style={{
            flex: 1, height: 44, flexDirection: "row", alignItems: "center", gap: 8,
            backgroundColor: C.bg.hover, borderWidth: 1, borderColor: C.border.default,
            borderRadius: 12, paddingHorizontal: 8, paddingVertical: 2
          }}>
            <Search size={12} color={C.text.secondary} />
            <TextInput
              style={{ flex: 1, color: C.text.primary, fontSize: 14 }}
              placeholder="Search products"
              placeholderTextColor={C.text.secondary}
              value={search}
              onChangeText={setSearch}
            />
          </View>
          <View style={{
            width: 44, height: 44, borderRadius: 12, backgroundColor: C.bg.hover,
            borderWidth: 1, borderColor: C.border.default, alignItems: "center", justifyContent: "center"
          }}>
            <ScanLine size={18} color={C.amber.primary} />
          </View>
        </View>

        {/* Category pills */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false}
          style={{ marginBottom: 6 }} contentContainerStyle={{ gap: 5 }}>
          {categories.map((cat: string) => (
            <TouchableOpacity key={cat} onPress={() => setSelectedCategory(cat)}
              style={{
                paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20,
                backgroundColor: selectedCategory === cat ? C.amber.primary : C.bg.hover,
                borderWidth: 1, borderColor: selectedCategory === cat ? C.amber.primary : C.border.default
              }}>
              <Text style={{
                fontSize: 9, fontWeight: "700",
                color: selectedCategory === cat ? "#000" : C.text.secondary
              }}>
                {cat === "All" ? "All" : cat}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Info row */}
        <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 6 }}>
          <Text style={{ color: C.text.secondary, fontSize: 9, fontWeight: "600" }}>
            {filteredProducts.length} item{filteredProducts.length !== 1 ? "s" : ""}
          </Text>
          <Text style={{ color: C.text.secondary, fontSize: 9, fontWeight: "600" }}>
            {cashierName}
          </Text>
        </View>
      </View>

      {/* ── PRODUCT GRID ───────────────────────────────────────────────────── */}
      <View style={{ flex: 1, paddingHorizontal: 12 }}>
        {loadingProducts ? (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
            <ActivityIndicator color={C.amber.primary} />
          </View>
        ) : filteredProducts.length === 0 ? (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
            <View style={{
              width: 64, height: 64, borderRadius: 20, backgroundColor: C.bg.hover,
              alignItems: "center", justifyContent: "center", marginBottom: 12,
              borderWidth: 1, borderColor: C.border.default
            }}>
              <Tag size={28} color={C.text.secondary} />
            </View>
            <Text style={{ color: C.text.secondary, fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 2 }}>
              No products found
            </Text>
          </View>
        ) : (
          <FlatList
            key="pos-product-list-1"
            data={filteredProducts}
            numColumns={1}
            showsVerticalScrollIndicator={false}
            keyExtractor={(item: any) => item.id.toString()}
            contentContainerStyle={{ paddingBottom: 100, paddingTop: 8 }}
            // ListHeaderComponent={frequent.length > 0 && !search ? (
            //   <View style={{ marginBottom: 12 }}>
            //     <Text style={{
            //       color: C.text.secondary, fontSize: 9, fontWeight: "700",
            //       textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 8
            //     }}>Quick Add</Text>
            //     <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -4 }}>
            //       {(frequent as any[]).map((item: any) => (
            //         <TouchableOpacity
            //           key={item.productId}
            //           activeOpacity={0.82}
            //           onPress={() => addToCart({ id: item.productId, name: item.name, price: item.price, category: item.category, isTracked: false })}
            //           style={{
            //             marginHorizontal: 4, paddingHorizontal: 12, paddingVertical: 8,
            //             borderRadius: 14, borderWidth: 1,
            //             borderColor: C.border.default,
            //             backgroundColor: C.bg.hover,
            //             alignItems: "center", minWidth: 72,
            //           }}>
            //           <Text style={{ fontSize: 16, marginBottom: 3 }}>⚡</Text>
            //           <Text style={{ color: C.text.primary, fontSize: 10, fontWeight: "700", textAlign: "center" }} numberOfLines={1}>
            //             {item.name.length > 10 ? item.name.slice(0, 10) + "…" : item.name}
            //           </Text>
            //           <Text style={{ color: C.amber.primary, fontSize: 9, fontWeight: "800" }}>
            //             {fmt(item.price)}
            //           </Text>
            //         </TouchableOpacity>
            //       ))}
            //     </ScrollView>
            //   </View>
            // ) : null}
            renderItem={({ item, index }: { item: any; index: number }) => {
              const inCartItem = cart.find((c: CartItem) => c.productId === item.id);
              const inCart = !!inCartItem;
              const stockLow = item.isTracked && Number(item.stockLevel || 0) <= 3;
              const outOfStock = item.isTracked && Number(item.stockLevel || 0) === 0;
              const { color } = getProductMeta(item, index);
              const imageRaw = item.imageUrl ?? item.image_url ?? item.image ?? item.photoUrl ?? null;
              const imageUrl = resolveMediaUrl(imageRaw);

              const toTitleCase = (str: string) =>
                str.replace(/\w\S*/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());

              return (
                <View style={{
                  paddingHorizontal: 4, // More space for deep shadows
                  paddingVertical: 2,
                  marginBottom: 8,
                }}>
                  <TouchableOpacity
                    activeOpacity={0.88}
                    onPress={(e) => !outOfStock && addToCart(item, e)}
                    style={{
                      width: "100%",
                      height: 100,
                      opacity: outOfStock ? 0.35 : 1,
                    }}
                  >
                    <View style={{
                      flex: 1,
                      flexDirection: "row",
                      borderRadius: 24,
                      backgroundColor: inCart ? `${color}10` : C.bg.card,

                      // DEEP MODERN SHADOWS (NO BORDERS)
                      shadowColor: "#000",
                      shadowOpacity: inCart ? 0.22 : 0.12,
                      shadowRadius: inCart ? 15 : 8,
                      shadowOffset: { width: 0, height: inCart ? 6 : 4 },
                      elevation: inCart ? 10 : 5,

                      overflow: "hidden",
                    }}>
                      {/* Visual Section: Consistent Placeholder (Left) */}
                      <View style={{
                        width: 100, height: "100%",
                        backgroundColor: imageUrl ? `${color}05` : C.bg.hover,
                        position: "relative",
                        borderRightWidth: 1,
                        borderRightColor: "rgba(0,0,0,0.03)"
                      }}>
                        {imageUrl ? (
                          <Image
                            source={{ uri: imageUrl }}
                            style={{ width: "100%", height: "100%" }}
                            resizeMode="cover"
                          />
                        ) : (
                          <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
                            {/* Generic high-end placeholder icon */}
                            <Package size={32} color={C.text.secondary} opacity={0.3} />
                          </View>
                        )}

                        {/* High Contrast Qty Badge */}
                        {inCart && (
                          <View style={{
                            position: "absolute", top: 10, left: 10,
                            minWidth: 24, height: 24, borderRadius: 12,
                            backgroundColor: "#000", alignItems: "center", justifyContent: "center",
                            shadowColor: "#000", shadowOpacity: 0.3, shadowRadius: 4,
                          }}>
                            <Text style={{ color: "#fff", fontSize: 11, fontWeight: "900" }}>
                              {inCartItem!.quantity}
                            </Text>
                          </View>
                        )}
                      </View>

                      {/* Content Section (Center) */}
                      <View style={{ flex: 1, paddingHorizontal: 16, justifyContent: "center" }}>
                        <Text style={{
                          color: C.text.primary,
                          fontSize: 16, fontWeight: "800", marginBottom: 4,
                          letterSpacing: -0.2
                        }} numberOfLines={1}>
                          {toTitleCase(item.name)}
                        </Text>

                        <View style={{ flexDirection: "row", alignItems: "center" }}>
                          <Text style={{
                            color: inCart ? color : C.text.primary,
                            fontSize: 20, fontWeight: "900", marginRight: 12,
                            letterSpacing: -0.5
                          }}>
                            {fmt(Number(item.price))}
                          </Text>

                          {item.isTracked && (
                            <View style={{
                              paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6,
                              backgroundColor: outOfStock ? C.status.error : stockLow ? "#fbbf24" : "rgba(0,0,0,0.05)"
                            }}>
                              <Text style={{
                                fontSize: 9, fontWeight: "900",
                                color: stockLow ? "#000" : "#fff",
                                letterSpacing: 0.5
                              }}>
                                {outOfStock ? "OUT" : `${Number(item.stockLevel || 0)} UNITS`}
                              </Text>
                            </View>
                          )}
                        </View>
                      </View>

                      {/* Actions Section (Right) */}
                      <View style={{ paddingRight: 12, flexDirection: "row", alignItems: "center", gap: 12 }}>
                        {inCart ? (
                          <>
                            <TouchableOpacity
                              onPress={(e) => { e.stopPropagation?.(); inCartItem!.quantity > 1 ? updateQuantity(item.id, -1) : removeFromCart(item.id); }}
                              activeOpacity={0.7}
                              style={{
                                width: 44, height: 44, borderRadius: 16,
                                backgroundColor: C.bg.hover, alignItems: "center", justifyContent: "center",
                                borderWidth: 1, borderColor: "rgba(0,0,0,0.04)"
                              }}>
                              <Minus size={20} color={C.text.primary} />
                            </TouchableOpacity>

                            <TouchableOpacity
                              onPress={(e) => { e.stopPropagation?.(); updateQuantity(item.id, 1, e); }}
                              activeOpacity={0.7}
                              style={{
                                width: 44, height: 44, borderRadius: 16,
                                backgroundColor: color, alignItems: "center", justifyContent: "center",
                                shadowColor: color, shadowOpacity: 0.3, shadowRadius: 10,
                                elevation: 6
                              }}>
                              <Plus size={22} color="#000" />
                            </TouchableOpacity>
                          </>
                        ) : (
                          <TouchableOpacity
                            onPress={(e) => { e.stopPropagation?.(); addToCart(item, e); }}
                            activeOpacity={0.7}
                            style={{
                              width: 44, height: 44, borderRadius: 16,
                              backgroundColor: `${color}15`, alignItems: "center", justifyContent: "center",
                              borderWidth: 1, borderColor: "rgba(0,0,0,0.03)"
                            }}>
                            <Plus size={24} color={color} />
                          </TouchableOpacity>
                        )}
                      </View>
                    </View>
                  </TouchableOpacity>
                </View>
              );
            }}
          />
        )}
      </View>

      {/* ── FLOATING CART BAR ──────────────────────────────────────────────── */}
      <View style={{ paddingHorizontal: 16, paddingBottom: 16, paddingTop: 6 }}>

        {/* Holds pill removed as requested */}

        <Animated.View style={{ transform: [{ scale: cartBounceAnim }] }}>
          <TouchableOpacity activeOpacity={0.9} disabled={cart.length === 0} onPress={() => setShowCart(true)}>
            <LinearGradient
              colors={cart.length === 0 ? [C.bg.hover, C.bg.card] : [C.amber.primary, C.amber.light]}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={{
                borderRadius: 20, paddingVertical: 14, paddingHorizontal: 16,
                shadowColor: cart.length === 0 ? "#000" : C.amber.primary,
                shadowOpacity: cart.length === 0 ? 0.15 : 0.35, shadowRadius: 14,
                shadowOffset: { width: 0, height: 6 },
                elevation: cart.length === 0 ? 5 : 8
              }}>

              {/* Single row: icon + label + total — no item list */}
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                  <View
                    ref={cartIconRef}
                    onLayout={measureCart}
                    style={{
                      width: 36, height: 36, borderRadius: 10,
                      backgroundColor: "rgba(0,0,0,0.2)", alignItems: "center", justifyContent: "center",
                      position: "relative"
                    }}>
                    <ShoppingCart size={16} color={cart.length === 0 ? C.text.secondary : "#000"} />
                    {cart.length > 0 && (
                      <View style={{
                        position: "absolute", top: -5, right: -5,
                        backgroundColor: "#000", borderRadius: 8, minWidth: 16, height: 16,
                        alignItems: "center", justifyContent: "center", paddingHorizontal: 3
                      }}>
                        <Text style={{ color: C.amber.primary, fontSize: 8, fontWeight: "900" }}>
                          {cartItemCount}
                        </Text>
                      </View>
                    )}
                  </View>
                  <View>
                    <Text style={{ color: cart.length === 0 ? C.text.secondary : "#000", fontSize: 13, fontWeight: "800" }}>
                      {cart.length === 0 ? "Cart is empty" : `${cartItemCount} item${cartItemCount !== 1 ? "s" : ""} · Tap to checkout`}
                    </Text>
                    {cart.length === 0 && (
                      <Text style={{ color: C.text.secondary, fontSize: 10, marginTop: 1 }}>Tap products to add</Text>
                    )}
                    {cart.length > 0 && orderDiscount > 0 && (
                      <Text style={{ color: "rgba(0,0,0,0.55)", fontSize: 10, marginTop: 1 }}>
                        🏷️ −{fmt(orderDiscount)} discount applied
                      </Text>
                    )}
                  </View>
                </View>

                <View style={{ alignItems: "flex-end" }}>
                  <Text style={{ color: cart.length === 0 ? C.text.secondary : "#000", fontSize: 19, fontWeight: "900", letterSpacing: -0.5 }}>
                    {fmt(total)}
                  </Text>
                  {cart.length > 0 && taxAmount > 0 && (
                    <Text style={{ color: "rgba(0,0,0,0.5)", fontSize: 9, marginTop: 1 }}>
                      sub {fmt(subtotal)} · tax {fmt(taxAmount)}
                    </Text>
                  )}
                </View>
              </View>
            </LinearGradient>
          </TouchableOpacity>
        </Animated.View>
      </View>

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

      {/* ── CART MODAL ─────────────────────────────────────────────────────── */}
      <Modal visible={showCart} transparent animationType="slide" onRequestClose={() => setShowCart(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.8)", justifyContent: "flex-end" }}>
          <View style={{
            backgroundColor: C.bg.card, borderTopLeftRadius: 32, borderTopRightRadius: 32,
            borderTopWidth: 1, borderColor: C.border.default, padding: 16, paddingBottom: Math.max(insets.bottom, 16), maxHeight: "88%", flex: 1
          }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <View>
                <Text style={{ color: C.text.primary, fontSize: 22, fontWeight: "800" }}>Cart</Text>
                <Text style={{ color: C.text.secondary, fontSize: 12, marginTop: 3 }}>
                  {cart.length === 0 ? "No items added yet" : `${cartItemCount} item${cartItemCount !== 1 ? "s" : ""} ready to sell`}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setShowCart(false)}
                style={{
                  width: 38, height: 38, borderRadius: 12, backgroundColor: C.bg.hover,
                  borderWidth: 1, borderColor: C.border.default, alignItems: "center", justifyContent: "center"
                }}>
                <X size={16} color={C.text.primary} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }}>
              {cart.length === 0 ? (
                <View style={{ alignItems: "center", paddingVertical: 48 }}>
                  <View style={{
                    width: 56, height: 56, borderRadius: 18, backgroundColor: C.bg.hover,
                    borderWidth: 1, borderColor: C.border.default, alignItems: "center", justifyContent: "center", marginBottom: 12
                  }}>
                    <ShoppingCart size={24} color={C.text.secondary} />
                  </View>
                  <Text style={{ color: C.text.secondary, fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 2 }}>
                    Start adding products
                  </Text>
                </View>
              ) : cart.map((item: CartItem, idx: number) => {
                const { color } = getProductMeta(item, idx);

                const renderRightActions = () => (
                  <TouchableOpacity
                    onPress={() => removeFromCart(item.productId)}
                    style={{
                      backgroundColor: C.status.error,
                      justifyContent: "center",
                      alignItems: "center",
                      width: 80,
                      marginBottom: 8,
                      borderRadius: 14,
                      marginLeft: 8,
                    }}>
                    <Trash2 size={20} color="#fff" />
                    <Text style={{ color: "#fff", fontSize: 10, fontWeight: "700", marginTop: 4 }}>Remove</Text>
                  </TouchableOpacity>
                );

                return (
                  <Swipeable key={item.productId} renderRightActions={renderRightActions}>
                    <View style={{
                      marginBottom: 8, backgroundColor: C.bg.hover,
                      padding: 10, borderRadius: 14, borderWidth: 1, borderColor: C.border.default
                    }}>
                      <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" }}>
                        <View style={{ flex: 1, marginRight: 12 }}>
                          <Text style={{ color: C.text.primary, fontSize: 13, fontWeight: "600" }} numberOfLines={2}>
                            {item.name}
                          </Text>
                          <Text style={{ color: C.text.secondary, fontSize: 11, marginTop: 4 }}>
                            {fmt(item.price)} each
                          </Text>
                        </View>
                        <TouchableOpacity onPress={() => removeFromCart(item.productId)} style={{
                          width: 32, height: 32, borderRadius: 10, backgroundColor: "rgba(255,71,87,0.1)",
                          alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "rgba(255,71,87,0.15)"
                        }}>
                          <Trash2 size={14} color={C.status.error} />
                        </TouchableOpacity>
                      </View>
                      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
                        <View style={{
                          flexDirection: "row", alignItems: "center",
                          backgroundColor: `${color}18`, borderRadius: 10, overflow: "hidden",
                          borderWidth: 1, borderColor: `${color}30`
                        }}>
                          <TouchableOpacity
                            onPress={() => item.quantity > 1 ? updateQuantity(item.productId, -1) : removeFromCart(item.productId)}
                            style={{ width: 30, height: 30, alignItems: "center", justifyContent: "center" }}>
                            <Minus size={12} color={color} />
                          </TouchableOpacity>
                          <Text style={{ color: C.text.primary, fontSize: 15, fontWeight: "800", marginHorizontal: 12, minWidth: 20, textAlign: "center" }}>
                            {item.quantity}
                          </Text>
                          <TouchableOpacity
                            onPress={() => updateQuantity(item.productId, 1)}
                            style={{ width: 30, height: 30, alignItems: "center", justifyContent: "center" }}>
                            <Plus size={12} color={color} />
                          </TouchableOpacity>
                        </View>
                        <Text style={{ color, fontSize: 16, fontWeight: "800" }}>
                          {fmt(item.price * item.quantity)}
                        </Text>
                      </View>
                    </View>
                  </Swipeable>
                );
              })}
            </ScrollView>

            <View style={{ marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderColor: C.border.default }}>
              {/* Discount row */}
              <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 10, gap: 8 }}>
                <View style={{
                  flex: 1, backgroundColor: C.bg.hover, borderWidth: 1, borderColor: C.border.default,
                  borderRadius: 12, paddingHorizontal: 14, paddingVertical: 2,
                  flexDirection: "row", alignItems: "center", gap: 8
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
                    backgroundColor: C.bg.hover, borderWidth: 1, borderColor: C.border.default
                  }}>
                  <Trash2 size={17} color={cart.length === 0 ? C.text.secondary : C.status.error} />
                </TouchableOpacity>
              </View>

              {/* Totals */}
              <View style={{
                backgroundColor: C.bg.hover, borderRadius: 16, padding: 14,
                marginBottom: 14, borderWidth: 1, borderColor: C.border.default
              }}>
                {[
                  { label: "Subtotal", value: fmt(subtotal), color: C.text.primary },
                  { label: "Tax", value: fmt(taxAmount), color: C.text.primary },
                  ...(orderDiscount > 0 ? [{ label: "Discount", value: `-${fmt(orderDiscount)}`, color: C.status.success }] : []),
                ].map(row => (
                  <View key={row.label} style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 8 }}>
                    <Text style={{ color: C.text.secondary, fontSize: 13 }}>{row.label}</Text>
                    <Text style={{ color: row.color, fontSize: 13, fontWeight: "600" }}>{row.value}</Text>
                  </View>
                ))}
                <View style={{ height: 1, backgroundColor: C.border.default, marginVertical: 8 }} />
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <Text style={{ color: C.text.secondary, fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 }}>
                    Total Due
                  </Text>
                  <Text style={{ color: C.amber.primary, fontSize: 24, fontWeight: "900" }}>
                    {fmt(total)}
                  </Text>
                </View>
              </View>

              {/* Park / Holds */}
              <View style={{ flexDirection: "row", gap: 8, marginBottom: 10 }}>
                <TouchableOpacity activeOpacity={0.85} disabled={cart.length === 0 || isParking} onPress={handleParkSale}
                  style={{
                    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
                    paddingVertical: 10, borderRadius: 14,
                    backgroundColor: cart.length === 0 || isParking ? C.bg.card : `${C.amber.primary}12`,
                    shadowColor: "#000", shadowOpacity: cart.length === 0 || isParking ? 0.1 : 0.2,
                    shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 5
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

              {/* Checkout CTA */}
              <TouchableOpacity activeOpacity={0.88} disabled={cart.length === 0 || isSubmitting}
                onPress={() => { setShowCart(false); handleCheckout(); }}>
                <LinearGradient
                  colors={cart.length === 0 ? [C.bg.hover, C.bg.card] : [C.amber.primary, C.amber.light]}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                  style={{
                    borderRadius: 20, height: 58, paddingHorizontal: 18,
                    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
                    shadowColor: cart.length === 0 ? "#000" : C.amber.primary,
                    shadowOpacity: cart.length === 0 ? 0.15 : 0.35, shadowRadius: 14,
                    shadowOffset: { width: 0, height: 6 }, elevation: cart.length === 0 ? 5 : 8
                  }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
                    <View style={{
                      width: 36, height: 36, borderRadius: 10,
                      backgroundColor: "rgba(0,0,0,0.2)", alignItems: "center", justifyContent: "center"
                    }}>
                      <ShoppingCart size={16} color={cart.length === 0 ? C.text.secondary : "#000"} />
                    </View>
                    <View>
                      <Text style={{ color: cart.length === 0 ? C.text.secondary : "#000", fontSize: 13, fontWeight: "800", textTransform: "uppercase", letterSpacing: 1.2 }}>
                        Checkout
                      </Text>
                      <Text style={{ color: cart.length === 0 ? C.text.secondary : "rgba(0,0,0,0.55)", fontSize: 10, marginTop: 2 }}>
                        {cart.length === 0 ? "Add items first" : `${cartItemCount} item${cartItemCount !== 1 ? "s" : ""} · ready to pay`}
                      </Text>
                    </View>
                  </View>
                  {isSubmitting
                    ? <ActivityIndicator color="#000" size="small" />
                    : <Text style={{ color: cart.length === 0 ? C.text.secondary : "#000", fontSize: 18, fontWeight: "900" }}>
                      {fmt(total)}
                    </Text>}
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
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
                        backgroundColor: `${C.amber.primary}18`, alignItems: "center",
                        justifyContent: "center", marginRight: 12,
                        borderWidth: 1, borderColor: `${C.amber.primary}30`
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
            backgroundColor: C.bg.card, borderTopLeftRadius: 32, borderTopRightRadius: 32,
            borderTopWidth: 1, borderColor: C.border.default, maxHeight: "92%", paddingBottom: Math.max(insets.bottom, 36), flex: 1
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
              contentContainerStyle={{ padding: 18, paddingTop: 12, paddingBottom: 8 }}>
              <Text style={{ color: C.text.secondary, fontSize: 10, fontWeight: "700", textTransform: "uppercase", letterSpacing: 1, marginBottom: 10, marginTop: 6 }}>
                Order Summary
              </Text>
              <View style={{
                backgroundColor: C.bg.hover, borderRadius: 16, borderWidth: 1,
                borderColor: C.border.default, overflow: "hidden", marginBottom: 16
              }}>
                {cart.map((item: CartItem, idx: number) => {
                  const lineTotal = item.price * item.quantity - item.discountAmount;
                  const isLast = idx === cart.length - 1;
                  return (
                    <View key={item.productId} style={{
                      flexDirection: "row", alignItems: "center",
                      paddingHorizontal: 12, paddingVertical: 12,
                      borderBottomWidth: isLast ? 0 : 1, borderBottomColor: C.border.default
                    }}>
                      <View style={{
                        width: 28, height: 28, borderRadius: 8,
                        backgroundColor: C.bg.hover, borderWidth: 1, borderColor: C.border.default,
                        alignItems: "center", justifyContent: "center", marginRight: 12
                      }}>
                        <Text style={{ color: C.amber.primary, fontSize: 11, fontWeight: "900" }}>{item.quantity}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: C.text.primary, fontSize: 13, fontWeight: "600" }} numberOfLines={1}>{item.name}</Text>
                        <Text style={{ color: C.text.secondary, fontSize: 10, marginTop: 1 }}>
                          {fmt(item.price)} each
                          {item.discountAmount > 0 ? `  ·  −${fmt(item.discountAmount)} disc` : ""}
                        </Text>
                      </View>
                      <Text style={{ color: C.amber.primary, fontSize: 14, fontWeight: "800", letterSpacing: -0.3 }}>
                        {fmt(lineTotal)}
                      </Text>
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

              <Text style={{ color: C.text.secondary, fontSize: 10, fontWeight: "700", textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>
                Payment Method
              </Text>
              <View style={{ flexDirection: "row", gap: 8, marginBottom: 14 }}>
                {[
                  { key: "CASH", label: "Cash", sub: "Collect & give change", Icon: Banknote },
                  { key: "CARD", label: "Card", sub: "POS / mobile money", Icon: CreditCard },
                ].map(({ key, label, sub, Icon }) => (
                  <TouchableOpacity key={key} onPress={() => setPaymentMethod(key)}
                    style={{
                      flex: 1, height: 56, borderRadius: 14, flexDirection: "row",
                      alignItems: "center", paddingHorizontal: 14, gap: 10,
                      backgroundColor: paymentMethod === key ? `${C.amber.primary}12` : C.bg.card,
                      shadowColor: "#000", shadowOpacity: paymentMethod === key ? 0.2 : 0.1,
                      shadowRadius: paymentMethod === key ? 12 : 8, shadowOffset: { width: 0, height: 4 }, elevation: 5
                    }}>
                    <Icon size={20} color={paymentMethod === key ? C.amber.primary : C.text.secondary} />
                    <View>
                      <Text style={{ color: paymentMethod === key ? C.amber.primary : C.text.primary, fontSize: 13, fontWeight: "700" }}>{label}</Text>
                      <Text style={{ color: C.text.secondary, fontSize: 9, marginTop: 1 }}>{sub}</Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>

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
                    <TouchableOpacity key={cur.code} onPress={() => setSelectedCurrency(cur.code)}
                      style={{
                        paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12,
                        backgroundColor: isActive ? `${C.amber.primary}14` : C.bg.card,
                        shadowColor: "#000", shadowOpacity: isActive ? 0.2 : 0.1,
                        shadowRadius: isActive ? 10 : 8, shadowOffset: { width: 0, height: 4 }, elevation: 5
                      }}>
                      <Text style={{ color: isActive ? C.amber.primary : C.text.primary, fontWeight: "700", fontSize: 13 }}>
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
                    backgroundColor: `${C.amber.primary}10`, borderRadius: 12, padding: 12, borderWidth: 1,
                    borderColor: `${C.amber.primary}30`, marginBottom: 14
                  }}>
                    <Text style={{ color: C.text.secondary, fontSize: 12 }}>Total in {selectedCurrency}</Text>
                    <Text style={{ color: C.amber.primary, fontSize: 18, fontWeight: "900" }}>
                      {`${selectedCurrency} ${localTotal.toFixed(2)}`}
                    </Text>
                  </View>
                );
              })()}

              {paymentMethod === "CASH" && (
                <View style={{ marginBottom: 12 }}>
                  <Text style={{ color: C.text.secondary, fontSize: 10, fontWeight: "700", textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>
                    Amount Received
                  </Text>
                  <View style={{
                    flexDirection: "row", alignItems: "center",
                    backgroundColor: C.bg.hover,
                    borderWidth: 1,
                    borderColor: isAmountFocused ? C.status.info : C.border.default,
                    borderRadius: 16, paddingHorizontal: 16, paddingVertical: 6,
                    shadowColor: isAmountFocused ? C.status.info : "transparent",
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
              )}
            </ScrollView>

            <View style={{ paddingHorizontal: 18, paddingTop: 14, borderTopWidth: 1, borderTopColor: C.border.default }}>
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
                        {paymentMethod === "CASH" ? "Cash" : "Card"} · {selectedCustomer?.name || "Guest"}
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
                      backgroundColor: isSelected ? `${C.amber.primary}0f` : C.bg.hover
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
                            backgroundColor: `${C.amber.primary}18`, borderWidth: 1, borderColor: `${C.amber.primary}35`
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
            <LinearGradient colors={[`${C.amber.primary}18`, "transparent"]} style={{ padding: 32, alignItems: "center" }}>
              <View style={{
                width: 80, height: 80, borderRadius: 40,
                backgroundColor: `${C.status.success}18`, borderWidth: 1.5, borderColor: `${C.status.success}40`,
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
              <View style={{ marginBottom: 16, padding: 14, borderRadius: 16, backgroundColor: C.bg.hover, borderWidth: 1, borderColor: C.border.default }}>
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
                backgroundColor: C.bg.hover, borderWidth: 1, borderColor: C.border.default,
                borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14,
                color: C.text.primary, fontSize: 18, fontWeight: "800"
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
                    { type: "PAYOUT", label: "Payout", Icon: Banknote, color: C.status.error },
                    { type: "DROP", label: "Collection", Icon: Download, color: C.status.info }
                  ].map((t) => (
                    <TouchableOpacity key={t.type} onPress={() => setTransactionType(t.type as any)}
                      style={{
                        flex: 1, height: 48, borderRadius: 12, flexDirection: "row",
                        alignItems: "center", justifyContent: "center", gap: 10,
                        backgroundColor: transactionType === t.type ? (t.type === "PAYOUT" ? `${C.status.error}10` : `${C.amber.primary}10`) : C.bg.card,
                        shadowColor: "#000", shadowOpacity: transactionType === t.type ? 0.2 : 0.1,
                        shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 5
                      }}>
                      <t.Icon size={16} color={transactionType === t.type ? (t.type === "PAYOUT" ? C.status.error : C.amber.primary) : C.text.secondary} />
                      <Text style={{ color: transactionType === t.type ? C.text.primary : C.text.secondary, fontWeight: "700", fontSize: 13 }}>{t.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={{ color: C.text.secondary, fontSize: 10, fontWeight: "700", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>
                  {transactionType === "PAYOUT" ? "Amount (Out of Till)" : "Amount to Collect"}
                </Text>
                <TextInput
                  style={{
                    backgroundColor: C.bg.hover, borderWidth: 1, borderColor: C.border.default,
                    borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14,
                    color: C.text.primary, fontSize: 18, fontWeight: "800", marginBottom: 16
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
                    backgroundColor: C.bg.hover, borderWidth: 1, borderColor: C.border.default,
                    borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14,
                    color: C.text.primary, fontSize: 16, marginBottom: 24
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
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.8)", justifyContent: "center", padding: 24 }}>
          <View style={{
            backgroundColor: C.bg.card, borderRadius: 24,
            borderWidth: 1, borderColor: C.border.default, padding: 24
          }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
              <Text style={{ color: C.text.primary, fontSize: 22, fontWeight: "800" }}>Session Z-Report</Text>
              <TouchableOpacity onPress={() => setShowSummaryModal(false)}>
                <X size={20} color={C.text.secondary} />
              </TouchableOpacity>
            </View>

            {shiftSummary && (
              <ScrollView style={{ maxHeight: 400 }} showsVerticalScrollIndicator={false}>
                <View style={{ gap: 12 }}>
                  <View style={{ padding: 14, borderRadius: 16, backgroundColor: C.bg.hover, borderWidth: 1, borderColor: C.border.default }}>
                    <Text style={{ color: C.text.secondary, fontSize: 10, fontWeight: "700", textTransform: "uppercase", marginBottom: 6 }}>Total Sales</Text>
                    <Text style={{ color: C.status.success, fontSize: 20, fontWeight: "900" }}>{shiftSummary.currency} {shiftSummary.totalSales}</Text>
                  </View>

                  {shiftSummary.totalPayouts && shiftSummary.totalPayouts !== "0.00" && (
                    <View style={{ padding: 14, borderRadius: 16, backgroundColor: `${C.status.error}08`, borderWidth: 1, borderColor: `${C.status.error}25` }}>
                      <Text style={{ color: C.text.secondary, fontSize: 9, fontWeight: "700", textTransform: "uppercase", marginBottom: 4 }}>Petty Cash Paid Out</Text>
                      <Text style={{ color: C.status.error, fontSize: 18, fontWeight: "800" }}>− {shiftSummary.currency} {shiftSummary.totalPayouts}</Text>
                      <Text style={{ color: C.text.secondary, fontSize: 9, marginTop: 3 }}>Till expenses deducted from expected drawer balance</Text>
                    </View>
                  )}

                  <View style={{ padding: 16, borderRadius: 16, backgroundColor: C.bg.hover, borderWidth: 1, borderColor: C.border.default }}>
                    <Text style={{ color: C.text.secondary, fontSize: 10, fontWeight: "800", textTransform: "uppercase", marginBottom: 6 }}>Total Float in Till</Text>
                    <Text style={{ color: C.text.primary, fontSize: 22, fontWeight: "900" }}>{shiftSummary.currency} {shiftSummary.expectedCash}</Text>
                    <Text style={{ color: C.text.secondary, fontSize: 9, marginTop: 4 }}>Expected cash in drawer incl. opening float of {shiftSummary.openingBalance}</Text>
                  </View>
                </View>
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
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.8)", justifyContent: "flex-end" }}>
          <View style={{
            backgroundColor: C.bg.card, borderTopLeftRadius: 32, borderTopRightRadius: 32,
            borderTopWidth: 1, borderColor: C.border.default, padding: 24, paddingBottom: Math.max(insets.bottom, 36)
          }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <Text style={{ color: C.text.primary, fontSize: 22, fontWeight: "800" }}>Select Branch</Text>
              <TouchableOpacity onPress={() => setShowBranchPicker(false)}
                style={{
                  width: 38, height: 38, borderRadius: 12, backgroundColor: C.bg.hover,
                  borderWidth: 1, borderColor: C.border.default, alignItems: "center", justifyContent: "center"
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
                      paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: C.border.default
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
      <PrinterSettingsModal
        visible={showPrinterSettings}
        onClose={() => setShowPrinterSettings(false)}
      />
    </View>
  );
}

