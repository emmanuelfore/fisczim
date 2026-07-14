import { Layout } from "@/components/layout";
import { useQuery } from "@tanstack/react-query";
import { useCustomers, useCreateCustomer } from "@/hooks/use-customers";
import { useProducts, useCreateProduct } from "@/hooks/use-products";
import {
  useCreateInvoice,
  useFiscalizeInvoice,
  useInvoice,
  useUpdateInvoice,
} from "@/hooks/use-invoices";
import { useAuth } from "@/hooks/use-auth";
import { useCurrencies } from "@/hooks/use-currencies";
import { useCompany } from "@/hooks/use-companies";
import { usePartners } from "@/hooks/use-partners";
import { useTaxConfig } from "@/hooks/use-tax-config";
import { useToast } from "@/hooks/use-toast";
import { useProductSerials } from "@/hooks/use-auto-spares";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import {
  Plus,
  Trash2,
  Loader2,
  ArrowLeft,
  Check,
  ChevronsUpDown,
  ShieldCheck,
  Send,
  Lock,
  ClipboardList,
  AlertCircle,
  Search,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PDFViewer, PDFDownloadLink } from "@react-pdf/renderer";
import { InvoicePDF } from "@/components/invoices/pdf-document";
import { Eye, Download } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { motion, AnimatePresence } from "framer-motion";
import {
  getStoredInvoiceTemplateSettings,
  invoiceTemplates,
  type InvoiceTemplateId,
} from "@/lib/invoice-templates";
import { usePermissions } from "@/hooks/use-permissions";
import { apiFetch } from "@/lib/api";

type LineItem = {
  localId: string;
  productId: number | null;
  description: string;
  quantity: number;
  unitPrice: number;
  taxRate: number;
  segmentId?: number | null;
  hsCode?: string;
  taxTypeId?: number | null;
  serialNumber?: string;
};

export default function CreateInvoicePage() {
  const [location, setLocation] = useLocation();
  const companyId = parseInt(localStorage.getItem("selectedCompanyId") || "0");

  // Check if we're editing an existing invoice
  // wouter useLocation returns only path, so we use window.location.search
  const searchParams = new URLSearchParams(window.location.search);
  const editId = searchParams.get("edit");
  const duplicateId = searchParams.get("duplicate");
  const isEditing = !!editId;
  const isDuplicating = !!duplicateId;

  console.log("Location info:", {
    path: location,
    search: window.location.search,
    editId,
    duplicateId,
    isEditing,
  });

  const { data: company } = useCompany(companyId);
  const { data: partners } = usePartners(companyId);
  const { data: customers } = useCustomers(companyId);
  const { data: products } = useProducts(companyId);
  const { data: currencies } = useCurrencies(companyId);
  // Fetch existing invoice if we are editing OR duplicating
  const sourceId = editId || duplicateId;
  const { data: existingInvoice } = useInvoice(
    sourceId ? parseInt(sourceId) : 0,
  );
  const createInvoice = useCreateInvoice(companyId);
  const createCustomer = useCreateCustomer(companyId);
  const { taxTypes } = useTaxConfig(companyId);
  const { data: serialNumbers = [] } = useProductSerials(companyId, undefined, "IN_STOCK");
  const { toast } = useToast();
  const updateInvoice = useUpdateInvoice();
  const fiscalizeInvoice = useFiscalizeInvoice();
  const createProduct = useCreateProduct(companyId);
  const { user } = useAuth();
  const { can, requiresApproval } = usePermissions();

  const { data: segments } = useQuery<any[]>({
    queryKey: ["/api/accounting/segments", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const res = await apiFetch(`/api/companies/${companyId}/accounting/segments`);
      if (!res.ok) return [];
      return res.json();
    },
  });

  const [isLockedByOther, setIsLockedByOther] = useState(false);
  const [lockStatus, setLockStatus] = useState<string>("");

  // Lock invoice on mount/edit (ONLY if editing, not if duplicating)
  useEffect(() => {
    if (!isEditing || !user || !editId) return;

    const lockInvoice = async () => {
      try {
        const res = await fetch(`/api/invoices/${editId}/lock`, {
          method: "POST",
        });
        if (res.status === 409) {
          setIsLockedByOther(true);
          setLockStatus(
            "This invoice is currently being edited by another user.",
          );
          toast({
            title: "Invoice Locked",
            description:
              "This invoice is currently being edited by another user.",
            variant: "destructive",
          });
        }
      } catch (error) {
        console.error("Lock error", error);
      }
    };

    lockInvoice();

    // Unlock on unmount
    return () => {
      if (!isLockedByOther) {
        fetch(`/api/invoices/${editId}/unlock`, { method: "POST" }).catch(
          console.error,
        );
      }
    };
  }, [isEditing, user, editId, isLockedByOther]);

  // Pre-fill form when editing or duplicating
  useEffect(() => {
    console.log("Form Population Effect:", {
      isEditing,
      isDuplicating,
      existingInvoice,
    });
    if (existingInvoice && (isEditing || isDuplicating)) {
      console.log("Populating form with:", existingInvoice);
      if (existingInvoice.customerId)
        setCustomerId(existingInvoice.customerId.toString());

      // If duplicating, set date to today, otherwise keep original issue date
      if (isDuplicating) {
        const today = new Date();
        today.setMinutes(today.getMinutes() - today.getTimezoneOffset());
        setIssueDate(today.toISOString().split("T")[0]);
        
        const nextMonth = new Date(today);
        nextMonth.setDate(nextMonth.getDate() + 30);
        setDueDate(nextMonth.toISOString().split("T")[0]);
      } else {
        if (existingInvoice.issueDate) {
          if (existingInvoice.status === "draft") {
            const today = new Date();
            today.setMinutes(today.getMinutes() - today.getTimezoneOffset());
            setIssueDate(today.toISOString().split("T")[0]);
          } else {
            setIssueDate(
              new Date(existingInvoice.issueDate).toISOString().split("T")[0],
            );
          }
        }
        if (existingInvoice.dueDate) {
          // You could optionally keep the original due date or recalculate it.
          // We'll keep the original if it was set explicitly, or they can change it.
          setDueDate(
            new Date(existingInvoice.dueDate).toISOString().split("T")[0],
          );
        }
      }

      setNotes(existingInvoice.notes || "");
      setPoNumber((existingInvoice as any).poNumber || "");
      setInvoiceTemplate(
        (existingInvoice.invoiceTemplate as InvoiceTemplateId) ||
          getStoredInvoiceTemplateSettings(companyId).defaultTemplateId,
      );
      setTaxInclusive(existingInvoice.taxInclusive || false);
      setCurrencyCode(existingInvoice.currency || "USD");
      setExchangeRate(existingInvoice.exchangeRate || "1.000000"); // Ensure we copy exchange rate too
      setPaymentMethod(existingInvoice.paymentMethod || "CASH");

      if ((existingInvoice as any).partnerId) {
        setPartnerId((existingInvoice as any).partnerId.toString());
      } else {
        setPartnerId("none");
      }

      if (existingInvoice.items && existingInvoice.items.length > 0) {
        console.log("Populating items:", existingInvoice.items);
        setItems(
          existingInvoice.items.map((item) => ({
            localId: Math.random().toString(36).substring(2, 11),
            productId: item.productId,
            description: item.description || "",
            quantity: Number(item.quantity),
            unitPrice: Number(item.unitPrice),
            taxRate: Number(item.taxRate),
            segmentId: (item as any).segmentId,
            hsCode: (item as any).product?.hsCode || undefined,
            taxTypeId: item.taxTypeId,
            serialNumber: (item as any).serialNumber || undefined,
          })),
        );
      }
    }
  }, [existingInvoice, isEditing, isDuplicating]);

  // Form State
  const [customerId, setCustomerId] = useState<string>("");
  const [partnerId, setPartnerId] = useState<string>("none");
  const [issueDate, setIssueDate] = useState<string>(() => {
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().split("T")[0];
  }); // Default to today
  const [dueDate, setDueDate] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [poNumber, setPoNumber] = useState<string>("");
  const [invoiceTemplate, setInvoiceTemplate] = useState<InvoiceTemplateId>(
    () => getStoredInvoiceTemplateSettings(companyId).defaultTemplateId,
  );
  const [taxInclusive, setTaxInclusive] = useState<boolean>(false);

  // Helper to get default tax rate based on company registration
  const getDefaultTaxRate = () => {
    if (company && !company.vatRegistered) return 0;
    return 15;
  };

  const [items, setItems] = useState<LineItem[]>([
    {
      localId: Math.random().toString(36).substring(2, 11),
      productId: null,
      description: "",
      quantity: 1,
      unitPrice: 0,
      taxRate: getDefaultTaxRate(),
    },
  ]);
  const [isRestored, setIsRestored] = useState(false);

  const clearAutoSave = () => {
    localStorage.removeItem(`invoice_draft_${companyId}`);
  };

  // Banking State (Defaults)
  const [bankName, setBankName] = useState("");
  const [accountName, setAccountName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [branchCode, setBranchCode] = useState("");

  // Effect to load defaults from company
  useEffect(() => {
    if (company) {
      setBankName(company.bankName || "");
      setAccountName(company.accountName || "");
      setAccountNumber(company.accountNumber || "");
      setBranchCode(company.branchCode || "");
      setTaxInclusive(company.vatEnabled ?? false);
    }
  }, [company]);

  // Currency State
  const [currencyCode, setCurrencyCode] = useState("USD");
  const [exchangeRate, setExchangeRate] = useState("1.000000");
  const [paymentMethod, setPaymentMethod] = useState("CASH");

  const handleCurrencyChange = (code: string) => {
    const newCurrency = currencies?.find((c) => c.code === code);
    if (!newCurrency) return;

    const oldRate = Number(exchangeRate);
    const newRate = Number(newCurrency.exchangeRate);

    // Update all item prices based on rate change
    const scaledItems = items.map((item) => ({
      ...item,
      unitPrice: (item.unitPrice / oldRate) * newRate,
    }));

    setItems(scaledItems);
    setCurrencyCode(code);
    setExchangeRate(newCurrency.exchangeRate);
  };

  const currentSymbol =
    currencies?.find((c) => c.code === currencyCode)?.symbol || "$";

  // New Customer Modal State
  const [isCustomerModalOpen, setCustomerModalOpen] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState("");
  const [newCustomerEmail, setNewCustomerEmail] = useState("");
  const [newCustomerPhone, setNewCustomerPhone] = useState("");
  const [newCustomerTin, setNewCustomerTin] = useState("");
  const [newCustomerVatNumber, setNewCustomerVatNumber] = useState("");
  const [newCustomerAddress, setNewCustomerAddress] = useState("");
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [open, setOpen] = useState(false);
  const [openRowIndex, setOpenRowIndex] = useState<number | null>(null);

  const [customerSearch, setCustomerSearch] = useState("");
  const [productSearch, setProductSearch] = useState<Record<string, string>>(
    {},
  );

  // Auto-Save: Persist to localStorage
  useEffect(() => {
    if (isEditing || isDuplicating) return;

    const timer = setTimeout(() => {
      const draftState = {
        customerId,
        partnerId,
        items,
        notes,
        poNumber,
        invoiceTemplate,
        currencyCode,
        exchangeRate,
        paymentMethod,
        taxInclusive,
      };
      localStorage.setItem(
        `invoice_draft_${companyId}`,
        JSON.stringify(draftState),
      );
    }, 1000);

    return () => clearTimeout(timer);
  }, [
    customerId,
    partnerId,
    items,
    notes,
    poNumber,
    invoiceTemplate,
    currencyCode,
    exchangeRate,
    paymentMethod,
    taxInclusive,
    isEditing,
    isDuplicating,
    companyId,
  ]);

  // Restore State on Mount
  useEffect(() => {
    if (isEditing || isDuplicating || isRestored) return;

    const saved = localStorage.getItem(`invoice_draft_${companyId}`);
    if (saved) {
      try {
        const state = JSON.parse(saved);
        if (state.customerId) setCustomerId(state.customerId);
        if (state.partnerId) setPartnerId(state.partnerId);
        if (state.items) setItems(state.items);
        if (state.notes) setNotes(state.notes);
        if (state.poNumber) setPoNumber(state.poNumber);
        if (state.invoiceTemplate) setInvoiceTemplate(state.invoiceTemplate);
        if (state.currencyCode) setCurrencyCode(state.currencyCode);
        if (state.exchangeRate) setExchangeRate(state.exchangeRate);
        if (state.paymentMethod) setPaymentMethod(state.paymentMethod);
        if (state.taxInclusive) setTaxInclusive(state.taxInclusive);
        
        // Removed restoring of issueDate and dueDate to ensure a new drafting session always defaults to today
        
        setIsRestored(true);
        toast({
          title: "Draft Restored",
          description: "We restored your last unsaved invoice.",
        });
      } catch (e) {
        console.error("Failed to restore draft", e);
      }
    }
  }, [companyId, isEditing, isDuplicating, isRestored, toast]);

  const handleAddItem = () => {
    setItems([
      ...items,
      {
        localId: Math.random().toString(36).substring(2, 11),
        productId: null,
        description: "",
        quantity: 1,
        unitPrice: 0,
        taxRate: getDefaultTaxRate(),
      },
    ]);
  };

  const handleRemoveItem = (localId: string) => {
    setItems(items.filter((item) => item.localId !== localId));
  };

  const handleProductSelect = (localId: string, productId: string) => {
    const product = products?.find((p) => p.id === parseInt(productId));
    if (product) {
      setItems((prev) =>
        prev.map((item) => {
          if (item.localId !== localId) return item;

          let taxRate = company?.vatRegistered
            ? Number(product.taxRate ?? 15)
            : 0;

          if (
            company?.vatRegistered &&
            product.taxCategoryId &&
            taxTypes.data
          ) {
            const category = taxTypes.data.find(
              (t: any) => t.id === product.taxCategoryId,
            );
            if (category) {
              taxRate = Number(category.rate);
            }
          }

          const rate = Number(exchangeRate);
          const scaledPrice = Number(product.price) * rate;

          return {
            ...item,
            productId: product.id,
            description: product.name,
            quantity: 1,
            unitPrice: scaledPrice,
            taxRate: taxRate,
            hsCode: product.hsCode || "0000",
            taxTypeId: product.taxTypeId,
          };
        }),
      );
    }
  };

  const updateItem = (localId: string, field: keyof LineItem, value: any) => {
    setItems((prev) =>
      prev.map((item) =>
        item.localId === localId ? { ...item, [field]: value } : item,
      ),
    );
  };

  const calculateTotals = () => {
    let subtotal = 0;
    let taxAmount = 0;

    items.forEach((item) => {
      const lineTotal = item.quantity * item.unitPrice;

      if (taxInclusive) {
        const taxPortion = lineTotal - lineTotal / (1 + item.taxRate / 100);
        const netPortion = lineTotal - taxPortion;
        subtotal += netPortion;
        taxAmount += taxPortion;
      } else {
        const taxPortion = lineTotal * (item.taxRate / 100);
        subtotal += lineTotal;
        taxAmount += taxPortion;
      }
    });

    return {
      subtotal,
      taxAmount,
      total: subtotal + taxAmount,
    };
  };

  const { subtotal, taxAmount, total } = calculateTotals();
  const hasDirectAccess = !requiresApproval("invoice_issue", total);

  const calculateTaxBreakdown = () => {
    const breakdown: Record<
      string,
      { net: number; tax: number; rate: number; taxTypeId: number }
    > = {};

    items.forEach((item) => {
      const lineTotal = item.quantity * item.unitPrice;
      const rate = Number(item.taxRate);
      const taxTypeId = item.taxTypeId || 0;
      const key = `${rate}-${taxTypeId}`;

      if (!breakdown[key]) breakdown[key] = { net: 0, tax: 0, rate, taxTypeId };

      if (taxInclusive) {
        const taxPortion = lineTotal - lineTotal / (1 + rate / 100);
        breakdown[key].net += lineTotal - taxPortion;
        breakdown[key].tax += taxPortion;
      } else {
        const taxPortion = lineTotal * (rate / 100);
        breakdown[key].net += lineTotal;
        breakdown[key].tax += taxPortion;
      }
    });

    return breakdown;
  };

  const taxBreakdown = calculateTaxBreakdown();
  const discountAmount = Math.abs(
    items.reduce((sum, item) => {
      const lineTotal = item.quantity * item.unitPrice;
      return lineTotal < 0 ? sum + lineTotal : sum;
    }, 0),
  );
  const hasCustomer = Boolean(customerId);
  const hasItems = items.length > 0 && items.some((item) => item.productId);
  const hasTaxMethod = typeof taxInclusive === "boolean";
  const hasFiscalDevice = Boolean(company?.fdmsDeviceId);
  const useFiscalWorkflow = Boolean(
    hasFiscalDevice && company?.vatRegistered !== false,
  );
  const readinessChecks = [
    { label: "Customer selected", complete: hasCustomer },
    { label: "Items added", complete: hasItems },
    { label: "Tax method selected", complete: hasTaxMethod },
    useFiscalWorkflow
      ? { label: "Fiscal device connected", complete: hasFiscalDevice }
      : null,
  ].filter(Boolean) as Array<{ label: string; complete: boolean }>;
  const readyToIssue = readinessChecks.every((check) => check.complete);

  type InvoiceAction = "draft" | "issue" | "issueAndFiscalize" | "quote";
  const [loadingAction, setLoadingAction] = useState<InvoiceAction | null>(
    null,
  );

  const handleSaveDraft = async () => {
    setLoadingAction("draft");
    if (!customerId) {
      toast({
        title: "Validation Error",
        description: "Please select a customer.",
        variant: "destructive",
      });
      setLoadingAction(null);
      return;
    }

    const hasInvalidItems = items.some((item) => !item.productId);
    if (hasInvalidItems) {
      toast({
        title: "Validation Error",
        description: "One or more invoice lines have no item selected.",
        variant: "destructive",
      });
      setLoadingAction(null);
      return;
    }

    if (!dueDate) {
      toast({
        title: "Validation Error",
        description: "Please select a due date.",
        variant: "destructive",
      });
      setLoadingAction(null);
      return;
    }

    const invoiceNumber =
      isEditing && existingInvoice
        ? existingInvoice.invoiceNumber
        : `DRAFT-${Date.now().toString().slice(-6)}`;

    const invoiceData = {
      companyId,
      invoiceNumber,
      customerId: parseInt(customerId),
      partnerId: partnerId === "none" ? null : parseInt(partnerId),
      issueDate: issueDate ? new Date(issueDate) : new Date(),
      dueDate: new Date(dueDate),
      notes,
      poNumber: poNumber.trim() || null,
      invoiceTemplate,
      currency: currencyCode,
      exchangeRate: exchangeRate,
      paymentMethod,
      status: "draft",
      subtotal: subtotal.toString(),
      taxAmount: taxAmount.toString(),
      total: total.toString(),
      taxInclusive: taxInclusive,
      items: items.map((item) => ({
        productId: item.productId,
        description: item.description,
        quantity: item.quantity.toString(),
        unitPrice: item.unitPrice.toString(),
        taxRate: item.taxRate.toString(),
        segmentId: item.segmentId,
        lineTotal: (item.quantity * item.unitPrice).toString(),
        taxTypeId: item.taxTypeId,
        serialNumber: item.serialNumber,
      })),
    };

    try {
      if (isEditing && editId) {
        await updateInvoice.mutateAsync({
          id: parseInt(editId),
          data: invoiceData,
        });
        toast({
          title: "Draft Updated",
          description: "Draft invoice updated successfully.",
        });
      } else {
        await createInvoice.mutateAsync(invoiceData);
        toast({
          title: "Draft Saved",
          description: "Invoice saved as draft successfully.",
        });
      }
      setLocation("/invoices");
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to save draft",
        variant: "destructive",
      });
    } finally {
      setLoadingAction(null);
    }
  };

  const handleSaveQuotation = async () => {
    setLoadingAction("quote");
    if (!customerId) {
      toast({
        title: "Validation Error",
        description: "Please select a customer.",
        variant: "destructive",
      });
      setLoadingAction(null);
      return;
    }

    const hasInvalidItems = items.some((item) => !item.productId);
    if (hasInvalidItems) {
      toast({
        title: "Validation Error",
        description: "One or more invoice lines have no item selected.",
        variant: "destructive",
      });
      setLoadingAction(null);
      return;
    }

    const invoiceNumber =
      isEditing && existingInvoice
        ? existingInvoice.invoiceNumber
        : `QT-${Date.now().toString().slice(-6)}`;
    const invoiceData = {
      companyId,
      invoiceNumber,
      customerId: parseInt(customerId),
      partnerId: partnerId === "none" ? null : parseInt(partnerId),
      issueDate: issueDate ? new Date(issueDate) : new Date(),
      dueDate: dueDate
        ? new Date(dueDate)
        : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      notes,
      poNumber: poNumber.trim() || null,
      invoiceTemplate,
      currency: currencyCode,
      exchangeRate: exchangeRate,
      paymentMethod,
      status: "quote",
      subtotal: subtotal.toString(),
      taxAmount: taxAmount.toString(),
      total: total.toString(),
      taxInclusive: taxInclusive,
      items: items.map((item) => ({
        productId: item.productId,
        description: item.description,
        quantity: item.quantity.toString(),
        unitPrice: item.unitPrice.toString(),
        taxRate: item.taxRate.toString(),
        segmentId: item.segmentId,
        lineTotal: (item.quantity * item.unitPrice).toString(),
        taxTypeId: item.taxTypeId,
        serialNumber: item.serialNumber,
      })),
    };

    try {
      if (isEditing && editId) {
        await updateInvoice.mutateAsync({
          id: parseInt(editId),
          data: invoiceData,
        });
        toast({
          title: "Quotation Updated",
          description: "Quotation updated successfully.",
        });
      } else {
        await createInvoice.mutateAsync(invoiceData);
        toast({
          title: "Quotation Saved",
          description: "Quotation saved successfully.",
        });
      }
      setLocation("/invoices");
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to save quotation",
        variant: "destructive",
      });
    } finally {
      setLoadingAction(null);
    }
  };

  const handleIssue = async (fiscalizeNow = false) => {
    setLoadingAction(fiscalizeNow ? "issueAndFiscalize" : "issue");
    if (!customerId) {
      toast({
        title: "Validation Error",
        description: "Please select a customer.",
        variant: "destructive",
      });
      setLoadingAction(null);
      return;
    }

    if (items.some((item) => !item.productId)) {
      toast({
        title: "Validation Error",
        description: "All lines must have a product selected.",
        variant: "destructive",
      });
      setLoadingAction(null);
      return;
    }

    if (!dueDate) {
      toast({
        title: "Validation Error",
        description: "Please select a due date.",
        variant: "destructive",
      });
      setLoadingAction(null);
      return;
    }

    const invoiceNumber =
      isEditing && existingInvoice && existingInvoice.status === "issued"
        ? existingInvoice.invoiceNumber
        : `INV-${Date.now().toString().slice(-6)}`;

    const invoiceData = {
      companyId,
      invoiceNumber,
      customerId: parseInt(customerId),
      partnerId: partnerId === "none" ? null : parseInt(partnerId),
      issueDate: new Date(issueDate),
      dueDate: new Date(dueDate),
      notes,
      poNumber: poNumber.trim() || null,
      invoiceTemplate,
      currency: currencyCode,
      exchangeRate: exchangeRate,
      paymentMethod,
      status: "issued",
      subtotal: subtotal.toString(),
      taxAmount: taxAmount.toString(),
      total: total.toString(),
      taxInclusive: taxInclusive,
      items: items.map((item) => ({
        productId: item.productId,
        description: item.description,
        quantity: item.quantity.toString(),
        unitPrice: item.unitPrice.toString(),
        taxRate: item.taxRate.toString(),
        segmentId: item.segmentId,
        lineTotal: (item.quantity * item.unitPrice).toString(),
        taxTypeId: item.taxTypeId,
        serialNumber: item.serialNumber,
      })),
    };

    try {
      let savedInvoice: any;
      if (isEditing && editId) {
        savedInvoice = await updateInvoice.mutateAsync({
          id: parseInt(editId),
          data: invoiceData,
        });
      } else {
        savedInvoice = await createInvoice.mutateAsync(invoiceData);
      }

      if (fiscalizeNow) {
        try {
          await fiscalizeInvoice.mutateAsync(savedInvoice.id);
        } catch (fiscalizeError: any) {
          toast({
            title: "Invoice Issued, Fiscalization Failed",
            description:
              fiscalizeError.message ||
              "Open the invoice to review and retry fiscalization.",
            variant: "destructive",
          });
          setLocation(`/invoices/${savedInvoice.id}`);
          return;
        }
      } else {
        toast({
          title: hasDirectAccess ? "Invoice Issued" : "Invoice submitted for approval",
          description: hasDirectAccess ? "Invoice issued successfully." : "Invoice submission sent for approval.",
        });
      }

      setLocation(`/invoices/${savedInvoice.id}`);
    } catch (error: any) {
      toast({
        title: "Error",
        description:
          error.message ||
          (fiscalizeNow
            ? "Failed to issue and fiscalize invoice"
            : "Failed to issue invoice"),
        variant: "destructive",
      });
    } finally {
      setLoadingAction(null);
    }
  };

  const [validationWarnings, setValidationWarnings] = useState<string[]>([]);
  const [showValidationDialog, setShowValidationDialog] = useState(false);
  const [pendingAction, setPendingAction] = useState<InvoiceAction | null>(
    null,
  );

  const validateInvoice = (action: InvoiceAction): string[] => {
    const warnings: string[] = [];
    if (items.some((item) => !item.hsCode || item.hsCode.length < 4)) {
      warnings.push(
        "⚠️ Some items are missing valid HS Codes. ZIMRA requires proper classification.",
      );
    }
    if (items.some((item) => item.unitPrice === 0)) {
      warnings.push(
        "⚠️ Some items have a price of 0.00. Ensure this is intentional.",
      );
    }
    return warnings;
  };

  const handleActionClick = (action: InvoiceAction) => {
    const warnings = validateInvoice(action);
    if (warnings.length > 0) {
      setValidationWarnings(warnings);
      setPendingAction(action);
      setShowValidationDialog(true);
    } else {
      executeAction(action);
    }
  };

  const executeAction = (action: InvoiceAction) => {
    if (action === "draft") handleSaveDraft();
    if (action === "issue") handleIssue();
    if (action === "issueAndFiscalize") handleIssue(true);
    if (action === "quote") handleSaveQuotation();
    setShowValidationDialog(false);
  };

  const handleCreateCustomer = async () => {
    const name = newCustomerName.trim();
    if (!name) return;
    try {
      const newCustomer = await createCustomer.mutateAsync({
        name,
        email: newCustomerEmail.trim() || null,
        phone: newCustomerPhone.trim() || null,
        tin: newCustomerTin.trim() || null,
        vatNumber: newCustomerVatNumber.trim() || null,
        address: newCustomerAddress.trim() || null,
        customerType:
          newCustomerTin.trim() || newCustomerVatNumber.trim()
            ? "business"
            : "individual",
      });
      setCustomerId(newCustomer.id.toString());
      setCustomerModalOpen(false);
      setNewCustomerName("");
      setNewCustomerEmail("");
      setNewCustomerPhone("");
      setNewCustomerTin("");
      setNewCustomerVatNumber("");
      setNewCustomerAddress("");
      setCustomerSearch("");
      setOpen(false);
      toast({
        title: "Customer Added",
        description: `${newCustomer.name} has been selected for this invoice.`,
      });
    } catch (error) {
      console.error(error);
      toast({
        title: "Customer Not Created",
        description:
          error instanceof Error
            ? error.message
            : "Please check the customer details and try again.",
        variant: "destructive",
      });
    }
  };

  const selectedCustomer = customers?.find(
    (c) => c.id.toString() === customerId,
  );
  const previewInvoice = {
    invoiceNumber:
      isEditing && existingInvoice?.invoiceNumber
        ? existingInvoice.invoiceNumber
        : "DRAFT",
    issueDate: (() => {
      const d = new Date(issueDate);
      return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
    })(),
    dueDate: (() => {
      const d = new Date(dueDate);
      return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
    })(),
    status: "draft",
    items: items.map((item) => ({
      ...item,
      lineTotal: (item.quantity * item.unitPrice).toString(),
      product: { hsCode: item.hsCode },
    })),
    subtotal: subtotal.toString(),
    taxAmount: taxAmount.toString(),
    total: total.toString(),
    currency: currencyCode,
    taxInclusive,
    notes,
    poNumber: poNumber.trim() || undefined,
    invoiceTemplate,
    currencySymbol: currentSymbol,
  };
  const previewCompany = company
    ? {
        ...company,
        bankName,
        accountName,
        accountNumber,
        branchCode,
      }
    : null;

  return (
    <Layout>
      <div className="min-h-screen space-y-4 pb-8">
        {isLockedByOther && (
          <div className="rounded-[14px] border border-amber-200 bg-amber-50 p-3 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
            <div className="flex">
              <div className="flex-shrink-0">
                <Lock className="h-5 w-5 text-amber-500" />
              </div>
              <div className="ml-3">
                <p className=" text-amber-700">{lockStatus}</p>
              </div>
            </div>
          </div>
        )}

        <div className="no-print flex flex-col gap-3 rounded-2xl border border-[#E5E7EB] bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)] md:flex-row md:items-center md:justify-between">
          <div className="flex items-center">
            <Button
              variant="ghost"
              onClick={() => setLocation("/invoices")}
              className="h-9 px-2 text-slate-500 hover:bg-slate-50 hover:text-slate-900"
            >
              <ArrowLeft className="w-4 h-4 mr-2" /> Back
            </Button>
          </div>
          <div className="flex flex-wrap gap-2 md:justify-end">
            <Button
              variant="outline"
              onClick={() => handleActionClick("draft")}
              disabled={loadingAction !== null || isLockedByOther}
              className="h-9 gap-2"
            >
              {loadingAction === "draft" ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <ShieldCheck className="w-4 h-4" />
              )}
              Save Draft
            </Button>
            <Button
              variant="outline"
              onClick={() => handleActionClick("quote")}
              disabled={loadingAction !== null || isLockedByOther}
              className="h-9 gap-2 hover:bg-slate-50"
            >
              {loadingAction === "quote" ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <ClipboardList className="w-4 h-4" />
              )}
              Save as Quotation
            </Button>
            <Button
              variant="outline"
              className="h-9 gap-2"
              onClick={() => setIsPreviewOpen(true)}
            >
              <Eye className="w-4 h-4" />
              Preview PDF
            </Button>
            <Button
              onClick={() => handleActionClick("issue")}
              disabled={loadingAction !== null || isLockedByOther}
              className="h-9 gap-2 bg-[#2563EB] text-white shadow-sm hover:bg-[#1D4ED8]"
            >
              {loadingAction === "issue" ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
              {hasDirectAccess ? "Issue Invoice" : "Request Approval"}
            </Button>
            {hasDirectAccess && (
              <Button
                onClick={() => handleActionClick("issueAndFiscalize")}
                disabled={
                  loadingAction !== null || isLockedByOther || !hasFiscalDevice
                }
                className="h-9 gap-2 bg-emerald-600 text-white shadow-sm hover:bg-emerald-700 disabled:bg-slate-300"
                title={
                  !hasFiscalDevice
                    ? "Connect a fiscal device before fiscalizing"
                    : undefined
                }
              >
                {loadingAction === "issueAndFiscalize" ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <ShieldCheck className="w-4 h-4" />
                )}
                Issue & Fiscalize
              </Button>
            )}
          </div>
        </div>

        <div className="mx-auto max-w-[1600px]">
          <div className="space-y-4">
            {/* Main Content */}
            <div className="grid gap-4 xl:grid-cols-[minmax(0,7fr)_minmax(320px,3fr)]">
              <div className="space-y-4">
                {/* Invoice Details Header */}
                <div className="rounded-2xl border border-[#E5E7EB] bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
                  <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <h3 className="text-base font-semibold text-[#0F172A]">
                        Invoice Setup
                      </h3>
                      <p className=" text-muted-foreground">
                        Document identifiers, dates, currency, and fiscal device
                        details.
                      </p>
                      <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-[#64748B]">
                        {searchParams.get("type") === "quote" ||
                        existingInvoice?.status === "quote"
                          ? "Official quotation"
                          : existingInvoice?.fiscalCode
                            ? existingInvoice?.transactionType === "CreditNote"
                              ? "Fiscal credit note"
                              : existingInvoice?.transactionType === "DebitNote"
                                ? "Fiscal debit note"
                                : company?.vatRegistered
                                  ? "Fiscal tax invoice"
                                  : "Fiscal invoice"
                            : existingInvoice?.transactionType === "CreditNote"
                              ? "Credit note"
                              : existingInvoice?.transactionType === "DebitNote"
                                ? "Debit note"
                                : "Tax invoice"}
                      </p>
                    </div>

                    <div className="flex flex-col items-start gap-1 lg:items-end">
                      <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1">
                        <Button
                          variant={taxInclusive ? "ghost" : "default"}
                          size="sm"
                          onClick={() => setTaxInclusive(false)}
                          className="h-8 px-3 text-xs font-semibold"
                        >
                          Tax Exclusive
                        </Button>
                        <Button
                          variant={taxInclusive ? "default" : "ghost"}
                          size="sm"
                          onClick={() => setTaxInclusive(true)}
                          className="h-8 px-3 text-xs font-semibold"
                        >
                          Tax Inclusive
                        </Button>
                      </div>
                      <p className="text-xs text-[#64748B]">
                        Tax calculation method
                      </p>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-3 xl:grid-cols-4">
                    <div className="space-y-1.5">
                      <Label className="text-[11px] font-semibold uppercase tracking-wide text-[#64748B]">
                        Invoice No
                      </Label>
                      <div className="h-11 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 font-mono text-xs font-bold text-slate-700">
                        {isEditing && existingInvoice
                          ? existingInvoice.invoiceNumber
                          : "[Auto-Generated]"}
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-[11px] font-semibold uppercase tracking-wide text-[#64748B]">
                        Fiscal Day
                      </Label>
                      <div className="h-11 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 font-mono text-xs font-bold text-slate-700">
                        {isEditing && existingInvoice
                          ? existingInvoice.fiscalDayNo || "-"
                          : "[Auto-Generated]"}
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-[11px] font-semibold uppercase tracking-wide text-[#64748B]">
                        Date
                      </Label>
                      <Input
                        type="date"
                        value={issueDate}
                        onChange={(e) => setIssueDate(e.target.value)}
                        className="h-11 rounded-xl bg-white px-3 py-0"
                        required
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-[11px] font-semibold uppercase tracking-wide text-[#64748B]">
                        Due Date
                      </Label>
                      <Input
                        type="date"
                        value={dueDate}
                        onChange={(e) => setDueDate(e.target.value)}
                        className="h-11 rounded-xl bg-white px-3 py-0"
                        required
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-[11px] font-semibold uppercase tracking-wide text-[#64748B]">
                        Currency
                      </Label>
                      <Select
                        value={currencyCode}
                        onValueChange={handleCurrencyChange}
                      >
                        <SelectTrigger className="h-11 rounded-xl bg-white px-3 py-0">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {currencies?.map((c) => (
                            <SelectItem key={c.id} value={c.code}>
                              {c.code} ({c.symbol})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-[11px] font-semibold uppercase tracking-wide text-[#64748B]">
                        Payment Method
                      </Label>
                      <Select
                        value={paymentMethod}
                        onValueChange={setPaymentMethod}
                      >
                        <SelectTrigger className="h-11 rounded-xl bg-white px-3 py-0">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="CASH">Cash</SelectItem>
                          <SelectItem value="CARD">Swipe</SelectItem>
                          <SelectItem value="TRANSFER">Bank</SelectItem>
                          <SelectItem value="ECOCASH">Mobile</SelectItem>
                          <SelectItem value="OTHER">Other</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-[11px] font-semibold uppercase tracking-wide text-[#64748B]">
                        PO Number
                      </Label>
                      <Input
                        value={poNumber}
                        onChange={(e) => setPoNumber(e.target.value)}
                        placeholder="Optional purchase order no."
                        className="h-11 rounded-xl bg-white px-3 py-0 font-mono "
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-[11px] font-semibold uppercase tracking-wide text-[#64748B]">
                        Invoice Template
                      </Label>
                      <Select
                        value={invoiceTemplate}
                        onValueChange={(value: InvoiceTemplateId) =>
                          setInvoiceTemplate(value)
                        }
                      >
                        <SelectTrigger className="h-11 rounded-xl bg-white px-3 py-0">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {invoiceTemplates.map((template) => (
                            <SelectItem key={template.id} value={template.id}>
                              {template.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-[11px] font-semibold uppercase tracking-wide text-[#64748B]">
                        Partner
                      </Label>
                      <Select
                        value={partnerId}
                        onValueChange={(val) => {
                          setPartnerId(val);
                          if (val !== "none") {
                            const p = partners?.find(p => p.id.toString() === val);
                            if ((p as any)?.invoiceTemplate) {
                              setInvoiceTemplate((p as any).invoiceTemplate as any);
                            }
                          }
                        }}
                      >
                        <SelectTrigger className="h-11 rounded-xl bg-white px-3 py-0">
                          <SelectValue placeholder="No Partner" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">None (Auto-match if applicable)</SelectItem>
                          {partners?.filter(p => p.isActive).map((p) => (
                            <SelectItem key={p.id} value={p.id.toString()}>
                              {p.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-[11px] font-semibold uppercase tracking-wide text-[#64748B]">
                        Fiscal Device ID
                      </Label>
                      <div className="h-11 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 font-mono text-xs font-medium text-slate-900">
                        {company?.fdmsDeviceId || "Not Registered"}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Seller & Buyer Section */}
                <div className="rounded-2xl border border-[#E5E7EB] bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
                  <div className="mb-4">
                    <h3 className="text-base font-semibold text-[#0F172A]">
                      Seller & Buyer
                    </h3>
                    <p className=" text-muted-foreground">
                      Confirm the issuing company and select the customer for
                      this invoice.
                    </p>
                  </div>
                  <div className="grid grid-cols-1 gap-4 lg:grid-cols-[0.9fr_1.1fr]">
                    {/* Seller Details */}
                    <div className="rounded-2xl border border-[#E5E7EB] bg-slate-50/70 p-4">
                      <div className="mb-3 flex items-center gap-2">
                        <div className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-blue-50">
                          <svg
                            className="h-4 w-4 text-blue-600"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
                            />
                          </svg>
                        </div>
                        <h4 className=" font-semibold text-[#0F172A]">
                          Seller
                        </h4>
                      </div>
                      <div className="flex gap-4 items-start">
                        {company?.logoUrl && (
                          <div className="flex-shrink-0">
                            <img
                              src={company.logoUrl}
                              alt="Company Logo"
                              className="h-14 w-24 rounded-[10px] border border-slate-100 object-contain"
                              onError={(e) => {
                                console.error("Logo load error:", e);
                                e.currentTarget.style.display = "none";
                              }}
                            />
                          </div>
                        )}
                        <div className="flex-1 space-y-2">
                          <h4 className="text-base font-semibold text-[#0F172A]">
                            {company?.tradingName ||
                              company?.name ||
                              "Company Name"}
                          </h4>
                          <div className="space-y-1.5 text-xs text-[#64748B]">
                            <div className="grid grid-cols-2 gap-3">
                              <p>
                                <span className="font-medium text-slate-500">
                                  TIN:
                                </span>{" "}
                                <span className="font-mono text-slate-900">
                                  {company?.tin || "-"}
                                </span>
                              </p>
                              <p>
                                <span className="font-medium text-slate-500">
                                  VAT:
                                </span>{" "}
                                <span className="font-mono text-slate-900">
                                  {company?.vatNumber || "-"}
                                </span>
                              </p>
                            </div>
                            <p>
                              <span className="font-medium text-slate-500">
                                Address:
                              </span>{" "}
                              {company?.address || "Address Line 1"},{" "}
                              {company?.city}
                            </p>
                            <p>
                              <span className="font-medium text-slate-500">
                                Contact:
                              </span>{" "}
                              {company?.email}{" "}
                              {company?.phone && `| ${company?.phone}`}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Buyer Details */}
                    <div className="rounded-2xl border border-blue-100 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
                      <div className="mb-3 flex items-center gap-2">
                        <div className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-green-50">
                          <svg
                            className="h-4 w-4 text-green-600"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                            />
                          </svg>
                        </div>
                        <h4 className=" font-semibold text-[#0F172A]">Buyer</h4>
                      </div>
                      <div className="space-y-3">
                        <div className="space-y-2">
                          <Label className="block text-[11px] font-semibold uppercase tracking-wide text-[#64748B]">
                            Select Customer
                          </Label>
                          <div className="flex gap-2">
                            <Popover open={open} onOpenChange={setOpen}>
                              <PopoverTrigger asChild>
                                <Button
                                  variant="outline"
                                  role="combobox"
                                  aria-expanded={open}
                                  className="h-11 flex-1 justify-between rounded-xl border-slate-200 bg-white "
                                >
                                  {customerId
                                    ? customers?.find(
                                        (customer) =>
                                          customer.id.toString() === customerId,
                                      )?.name
                                    : "Select a client or search..."}
                                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                </Button>
                              </PopoverTrigger>
                              <PopoverContent
                                className="w-[300px] p-0"
                                align="start"
                              >
                                <Command>
                                  <CommandInput
                                    placeholder="Search customer..."
                                    value={customerSearch}
                                    onValueChange={setCustomerSearch}
                                  />
                                  <CommandList>
                                    <CommandEmpty className="p-0">
                                      <div className="p-4  text-center text-slate-500">
                                        No customer found.
                                      </div>
                                      {customerSearch.trim() && (
                                        <div className="p-1 border-t">
                                          <Button
                                            variant="ghost"
                                            className="w-full justify-start h-9 text-xs font-medium text-primary hover:text-primary hover:bg-primary/5"
                                            onClick={async () => {
                                              try {
                                                const newC =
                                                  await createCustomer.mutateAsync(
                                                    {
                                                      name: customerSearch,
                                                      customerType:
                                                        "individual",
                                                    },
                                                  );
                                                setCustomerId(
                                                  newC.id.toString(),
                                                );
                                                setCustomerSearch("");
                                                setOpen(false);
                                                toast({
                                                  title: "Customer Added",
                                                  description: `${newC.name} has been created.`,
                                                });
                                              } catch (e) {
                                                console.error(e);
                                              }
                                            }}
                                          >
                                            <Plus className="w-3 h-3 mr-2" />{" "}
                                            Add "{customerSearch}" as new
                                            customer
                                          </Button>
                                        </div>
                                      )}
                                    </CommandEmpty>
                                    <CommandGroup>
                                      {customers?.map((customer) => (
                                        <CommandItem
                                          key={customer.id}
                                          value={`${customer.name} ${customer.tin || ""} ${customer.email || ""}`}
                                          onSelect={() => {
                                            setCustomerId(
                                              customer.id.toString(),
                                            );
                                            setOpen(false);
                                          }}
                                        >
                                          <Check
                                            className={cn(
                                              "mr-2 h-4 w-4",
                                              customerId ===
                                                customer.id.toString()
                                                ? "opacity-100"
                                                : "opacity-0",
                                            )}
                                          />
                                          <div className="flex flex-col">
                                            <span className="font-medium">
                                              {customer.name}
                                            </span>
                                            {(customer.tin ||
                                              customer.email) && (
                                              <span className="text-xs text-muted-foreground">
                                                {[customer.tin, customer.email]
                                                  .filter(Boolean)
                                                  .join(" | ")}
                                              </span>
                                            )}
                                          </div>
                                        </CommandItem>
                                      ))}
                                    </CommandGroup>
                                  </CommandList>
                                </Command>
                              </PopoverContent>
                            </Popover>
                            <Button
                              type="button"
                              variant="outline"
                              className="h-11 shrink-0 gap-2 rounded-xl border-blue-200 bg-blue-50 px-3 text-blue-700 hover:bg-blue-100 hover:text-blue-800"
                              disabled={isLockedByOther}
                              onClick={() => {
                                setNewCustomerName(customerSearch.trim());
                                setCustomerModalOpen(true);
                                setOpen(false);
                              }}
                            >
                              <Plus className="h-4 w-4" />
                              Add
                            </Button>
                          </div>
                        </div>

                        {/* Selected Customer Details */}
                        {customerId &&
                          (() => {
                            const c = customers?.find(
                              (cust) => cust.id.toString() === customerId,
                            );
                            if (!c) return null;
                            return (
                              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                                <h4 className="mb-2 text-base font-semibold text-[#0F172A]">
                                  {c.name}
                                </h4>
                                <div className="space-y-1.5 text-xs text-[#64748B]">
                                  <div className="grid grid-cols-2 gap-3">
                                    <p>
                                      <span className="font-medium text-slate-500">
                                        TIN:
                                      </span>{" "}
                                      <span className="font-mono text-slate-900">
                                        {c.tin || "-"}
                                      </span>
                                    </p>
                                    <p>
                                      <span className="font-medium text-slate-500">
                                        VAT:
                                      </span>{" "}
                                      <span className="font-mono text-slate-900">
                                        {c.vatNumber || "-"}
                                      </span>
                                    </p>
                                  </div>
                                  <p>
                                    <span className="font-medium text-slate-500">
                                      Address:
                                    </span>{" "}
                                    {c.address || "No Address"}, {c.city}
                                  </p>
                                  <p>
                                    <span className="font-medium text-slate-500">
                                      Contact:
                                    </span>{" "}
                                    {c.email} {c.phone && `| ${c.phone}`}
                                  </p>
                                </div>
                              </div>
                            );
                          })()}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Invoice Items Section */}
                <div className="rounded-2xl border border-[#E5E7EB] bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
                  <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex items-center gap-2">
                      <div className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-blue-50">
                        <svg
                          className="h-4 w-4 text-blue-600"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                          />
                        </svg>
                      </div>
                      <div>
                        <h3 className="text-base font-semibold text-[#0F172A]">
                          Items
                        </h3>
                        <p className=" text-muted-foreground">
                          Add products, services, tax, and discounts.
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleAddItem}
                        className="h-9 gap-2 rounded-xl"
                      >
                        <Plus className="h-4 w-4" /> Add Item
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-9 gap-2 rounded-xl"
                        type="button"
                      >
                        <Search className="h-4 w-4" /> Scan Barcode
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleAddItem}
                        className="h-9 gap-2 rounded-xl"
                        type="button"
                      >
                        <Plus className="h-4 w-4" /> Add Discount
                      </Button>
                    </div>
                  </div>
                  <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
                    <Table>
                      <TableHeader className="bg-slate-50 border-b border-slate-100">
                        <TableRow className="hover:bg-slate-50">
                          <TableHead className="pl-4">
                            Item & Description
                          </TableHead>
                          <TableHead className="w-[100px]">
                            Segment
                          </TableHead>
                          <TableHead className="w-[140px] text-center">
                            Qty
                          </TableHead>
                          <TableHead className="w-[220px] text-right">
                            Price
                          </TableHead>
                          <TableHead className="w-[100px] text-right">
                            VAT Amt
                          </TableHead>
                          <TableHead className="w-[110px] text-right">
                            Amount
                          </TableHead>
                          <TableHead className="w-[50px]"></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        <AnimatePresence mode="popLayout">
                          {items.map((item, index) => {
                            const lineVal = item.quantity * item.unitPrice;
                            let vatAmt = 0;
                            let totalAmt = 0;

                            if (taxInclusive) {
                              const taxRateDecimal = item.taxRate / 100;
                              vatAmt = lineVal - lineVal / (1 + taxRateDecimal);
                              totalAmt = lineVal;
                            } else {
                              vatAmt = lineVal * (item.taxRate / 100);
                              totalAmt = lineVal + vatAmt;
                            }

                            // Determine Tax Status
                            const matchingType = taxTypes.data?.find(
                              (t: any) => t.id == item.taxTypeId,
                            );
                            const isExempt =
                              matchingType?.zimraTaxId == 1 ||
                              matchingType?.zimraTaxId == "1" ||
                              matchingType?.zimraCode === "C" ||
                              matchingType?.zimraCode === "E" ||
                              matchingType?.name
                                ?.toLowerCase()
                                .includes("exempt");
                            const isZeroRated =
                              matchingType?.zimraTaxId == 2 ||
                              matchingType?.zimraTaxId == "2" ||
                              matchingType?.zimraCode === "D" ||
                              matchingType?.name
                                ?.toLowerCase()
                                .includes("zero rated") ||
                              (!isExempt && item.taxRate === 0);

                            return (
                              <motion.tr
                                key={item.localId}
                                initial={{ opacity: 0, y: -10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, x: -20 }}
                                transition={{ duration: 0.2 }}
                                className="group h-14 border-b border-slate-100 transition-colors hover:bg-[#F8FAFC]"
                              >
                                <TableCell className="align-top py-3 pl-4">
                                  <div className="flex flex-col gap-2">
                                    <Popover
                                      open={openRowIndex === index}
                                      onOpenChange={(isOpen) =>
                                        setOpenRowIndex(isOpen ? index : null)
                                      }
                                    >
                                      <PopoverTrigger asChild>
                                        <Button
                                          variant="outline"
                                          role="combobox"
                                          className={cn(
                                            "h-auto min-h-[36px] py-1.5 w-full justify-between overflow-hidden rounded-xl bg-white px-3 font-medium text-[13px]",
                                            !item.productId &&
                                              "text-muted-foreground",
                                          )}
                                        >
                                          <div className="flex flex-col items-start overflow-hidden w-full text-left">
                                            <span className="truncate w-full block">
                                              {item.productId
                                                ? products?.find(
                                                    (p) =>
                                                      p.id === item.productId,
                                                  )?.name || "Select Item"
                                                : "Select Item"}
                                            </span>
                                            {item.hsCode && (
                                              <Badge
                                                variant="secondary"
                                                className="text-[9px] h-4 py-0 px-1 font-mono opacity-60 mt-0.5"
                                              >
                                                {item.hsCode}
                                              </Badge>
                                            )}
                                          </div>
                                          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                        </Button>
                                      </PopoverTrigger>
                                      <PopoverContent
                                        className="w-[300px] p-0"
                                        align="start"
                                      >
                                        <Command>
                                          <CommandInput
                                            placeholder="Search items..."
                                            value={
                                              productSearch[item.localId] || ""
                                            }
                                            onValueChange={(val) =>
                                              setProductSearch((prev) => ({
                                                ...prev,
                                                [item.localId]: val,
                                              }))
                                            }
                                          />
                                          <CommandList>
                                            <CommandEmpty className="p-0">
                                              <div className="p-4  text-center text-slate-500">
                                                No item found.
                                              </div>
                                              {productSearch[
                                                item.localId
                                              ]?.trim() && (
                                                <div className="p-1 border-t">
                                                  <Button
                                                    variant="ghost"
                                                    className="w-full justify-start h-9 text-xs font-medium text-primary hover:text-primary hover:bg-primary/5"
                                                    onClick={async () => {
                                                      try {
                                                        const newP =
                                                          await createProduct.mutateAsync(
                                                            {
                                                              name: productSearch[
                                                                item.localId
                                                              ],
                                                              price: "0",
                                                              taxRate: "15",
                                                              productType:
                                                                "good",
                                                              sku: `AUTO-${Date.now().toString().slice(-4)}`,
                                                            },
                                                          );
                                                        handleProductSelect(
                                                          item.localId,
                                                          newP.id.toString(),
                                                        );
                                                        setProductSearch(
                                                          (prev) => {
                                                            const next = {
                                                              ...prev,
                                                            };
                                                            delete next[
                                                              item.localId
                                                            ];
                                                            return next;
                                                          },
                                                        );
                                                        setOpenRowIndex(null);
                                                        toast({
                                                          title:
                                                            "Product Added",
                                                          description: `${newP.name} has been created.`,
                                                        });
                                                      } catch (e) {
                                                        console.error(e);
                                                      }
                                                    }}
                                                  >
                                                    <Plus className="w-3 h-3 mr-2" />{" "}
                                                    Add "
                                                    {
                                                      productSearch[
                                                        item.localId
                                                      ]
                                                    }
                                                    " as new product
                                                  </Button>
                                                </div>
                                              )}
                                            </CommandEmpty>
                                            <CommandGroup heading="Products">
                                              {products
                                                ?.filter(
                                                  (p) =>
                                                    !p.productType ||
                                                    p.productType === "good",
                                                )
                                                .map((product) => (
                                                  <CommandItem
                                                    key={product.id}
                                                    value={`product ${product.name} ${product.sku || ""}`}
                                                    onSelect={() => {
                                                      handleProductSelect(
                                                        item.localId,
                                                        product.id.toString(),
                                                      );
                                                      setOpenRowIndex(null);
                                                    }}
                                                  >
                                                    <Check
                                                      className={cn(
                                                        "mr-2 h-4 w-4",
                                                        item.productId ===
                                                          product.id
                                                          ? "opacity-100"
                                                          : "opacity-0",
                                                      )}
                                                    />
                                                    <div className="flex flex-col flex-1">
                                                      <span className="font-medium ">
                                                        {product.name}
                                                      </span>
                                                      <div className="flex justify-between w-full text-xs text-muted-foreground mt-0.5">
                                                        <span>
                                                          {product.sku}
                                                        </span>
                                                        <span className="font-mono">
                                                          $
                                                          {Number(
                                                            product.price,
                                                          ).toFixed(2)}
                                                        </span>
                                                      </div>
                                                    </div>
                                                  </CommandItem>
                                                ))}
                                            </CommandGroup>
                                            <CommandGroup heading="Services">
                                              {products
                                                ?.filter(
                                                  (p) =>
                                                    p.productType === "service",
                                                )
                                                .map((service) => (
                                                  <CommandItem
                                                    key={service.id}
                                                    value={`service ${service.name} ${service.sku || ""}`}
                                                    onSelect={() => {
                                                      handleProductSelect(
                                                        item.localId,
                                                        service.id.toString(),
                                                      );
                                                      setOpenRowIndex(null);
                                                    }}
                                                  >
                                                    <Check
                                                      className={cn(
                                                        "mr-2 h-4 w-4",
                                                        item.productId ===
                                                          service.id
                                                          ? "opacity-100"
                                                          : "opacity-0",
                                                      )}
                                                    />
                                                    <div className="flex flex-col flex-1">
                                                      <span className="font-medium ">
                                                        {service.name}
                                                      </span>
                                                      <div className="flex justify-between w-full text-xs text-muted-foreground mt-0.5">
                                                        <span>
                                                          {service.sku ||
                                                            "Service"}
                                                        </span>
                                                        <span className="font-mono">
                                                          $
                                                          {Number(
                                                            service.price,
                                                          ).toFixed(2)}
                                                        </span>
                                                      </div>
                                                    </div>
                                                  </CommandItem>
                                                ))}
                                            </CommandGroup>
                                          </CommandList>
                                        </Command>
                                      </PopoverContent>
                                    </Popover>
                                    <Input
                                      placeholder="Brand, model or description..."
                                      value={item.description}
                                      onChange={(e) =>
                                        updateItem(
                                          item.localId,
                                          "description",
                                          e.target.value,
                                        )
                                      }
                                      className="h-8 rounded-lg border-slate-100 bg-slate-50/50 px-2 text-[12px] transition-all hover:border-slate-200 focus:border-primary focus:bg-white"
                                    />
                                    {products?.find(p => p.id === item.productId)?.serialTrackingEnabled && (
                                      <Select
                                        value={item.serialNumber || ""}
                                        onValueChange={(val) => updateItem(item.localId, "serialNumber", val)}
                                      >
                                        <SelectTrigger className="h-8 text-[12px] w-full bg-slate-50 border-slate-200 rounded-lg">
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
                                    )}
                                  </div>
                                </TableCell>
                                <TableCell className="align-top py-3">
                                  <Select
                                    value={item.segmentId?.toString() || "none"}
                                    onValueChange={(val) =>
                                      updateItem(item.localId, "segmentId", val === "none" ? null : parseInt(val))
                                    }
                                  >
                                    <SelectTrigger className="h-9">
                                      <SelectValue placeholder="Segment" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="none">None</SelectItem>
                                      {segments?.map((seg) => (
                                        <SelectItem key={seg.id} value={String(seg.id)}>
                                          {seg.name}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </TableCell>
                                <TableCell className="align-top py-3">
                                  <Input
                                    type="number"
                                    min="1"
                                    value={item.quantity}
                                    onChange={(e) =>
                                      updateItem(
                                        item.localId,
                                        "quantity",
                                        parseFloat(e.target.value) || 0,
                                      )
                                    }
                                    className="h-9 w-full rounded-xl border-slate-100 bg-slate-50/50 px-2 text-center font-semibold transition-all hover:border-slate-200 focus:border-primary focus:bg-white"
                                  />
                                </TableCell>
                                <TableCell className="align-top py-3">
                                  <Input
                                    type="number"
                                    step="0.01"
                                    value={Number(item.unitPrice)}
                                    onChange={(e) =>
                                      updateItem(
                                        item.localId,
                                        "unitPrice",
                                        parseFloat(e.target.value) || 0,
                                      )
                                    }
                                    onBlur={(e) => {
                                      const val =
                                        parseFloat(e.target.value) || 0;
                                      updateItem(
                                        item.localId,
                                        "unitPrice",
                                        parseFloat(val.toFixed(2)),
                                      );
                                    }}
                                    className="h-9 w-full rounded-xl border-slate-100 bg-slate-50/50 px-2 text-right font-mono font-semibold transition-all hover:border-slate-200 focus:border-primary focus:bg-white"
                                  />
                                </TableCell>
                                <TableCell className="align-top py-3 text-right font-mono  font-semibold text-slate-500">
                                  <div className="h-9 flex items-center justify-end">
                                    {vatAmt > 0
                                      ? `${currentSymbol}${vatAmt.toFixed(2)}`
                                      : "-"}
                                  </div>
                                </TableCell>
                                <TableCell className="text-right font-bold font-mono text-slate-900 align-top py-3 pr-4">
                                  <div className="h-9 flex items-center justify-end">
                                    {totalAmt.toFixed(2)}
                                  </div>
                                </TableCell>
                                <TableCell className="align-top py-3">
                                  <div className="h-9 flex items-center justify-center">
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                                      onClick={() =>
                                        handleRemoveItem(item.localId)
                                      }
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </Button>
                                  </div>
                                </TableCell>
                              </motion.tr>
                            );
                          })}
                        </AnimatePresence>
                      </TableBody>
                    </Table>
                  </div>
                  <div className="flex justify-between items-center px-4 py-3 bg-slate-50 border-t border-slate-200">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleAddItem}
                      className="text-primary hover:text-primary hover:bg-primary/5 h-9"
                    >
                      <Plus className="mr-2 h-4 w-4" /> Add Line
                    </Button>
                    <div className="text-sm text-slate-500 font-medium">
                      {items.length} item{items.length === 1 ? "" : "s"}
                    </div>
                  </div>
                </div>

                {/* Additional Notes Section */}
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                  {/* Notes Section */}
                  <div className="rounded-2xl border border-[#E5E7EB] bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
                    <div className="mb-3 flex items-center gap-2">
                      <div className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-amber-50">
                        <svg
                          className="h-4 w-4 text-amber-600"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                          />
                        </svg>
                      </div>
                      <div className="flex-1">
                        <h3 className="text-base font-semibold text-[#0F172A]">
                          {existingInvoice?.transactionType === "CreditNote" ||
                          existingInvoice?.transactionType === "DebitNote"
                            ? "REASON"
                            : "Notes"}
                          {(existingInvoice?.transactionType === "CreditNote" ||
                            existingInvoice?.transactionType ===
                              "DebitNote") && (
                            <span className="text-red-500 ml-1">*</span>
                          )}
                        </h3>
                        {(existingInvoice?.transactionType === "CreditNote" ||
                          existingInvoice?.transactionType === "DebitNote") && (
                          <span className="text-[10px] font-black text-red-500 uppercase tracking-tighter">
                            Legal Requirement
                          </span>
                        )}
                      </div>
                    </div>
                    <Textarea
                      placeholder={
                        existingInvoice?.transactionType === "CreditNote" ||
                        existingInvoice?.transactionType === "DebitNote"
                          ? "Explain why this credit/debit note is being issued (e.g., Return of damaged goods, Price adjustment)..."
                          : "Invoice notes, terms and conditions, payment instructions, etc."
                      }
                      className={cn(
                        "min-h-[88px] resize-none rounded-[10px] border-slate-200 bg-slate-50  transition-all",
                        (existingInvoice?.transactionType === "CreditNote" ||
                          existingInvoice?.transactionType === "DebitNote") &&
                          !notes?.trim() &&
                          "border-red-200 focus:border-red-500",
                      )}
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                    />
                    <p className="text-xs text-slate-500 mt-2">
                      These notes will appear on the invoice
                    </p>
                  </div>

                  {/* Banking Details Section */}
                  <div className="rounded-2xl border border-[#E5E7EB] bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
                    <div className="mb-3 flex items-center gap-2">
                      <div className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-emerald-50">
                        <svg
                          className="h-4 w-4 text-emerald-600"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"
                          />
                        </svg>
                      </div>
                      <h3 className="text-base font-semibold text-[#0F172A]">
                        Banking Details
                      </h3>
                    </div>
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-2">
                          <Label className="text-xs font-semibold uppercase text-slate-400">
                            Bank Name
                          </Label>
                          <Input
                            placeholder="e.g. Stanbic, CBZ"
                            value={bankName}
                            onChange={(e) => setBankName(e.target.value)}
                            className="h-11 rounded-xl border-slate-200 bg-white"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-xs font-semibold uppercase text-slate-400">
                            Account Name
                          </Label>
                          <Input
                            placeholder="Beneficiary Name"
                            value={accountName}
                            onChange={(e) => setAccountName(e.target.value)}
                            className="h-11 rounded-xl border-slate-200 bg-white"
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-2">
                          <Label className="text-xs font-semibold uppercase text-slate-400">
                            Account Number
                          </Label>
                          <Input
                            placeholder="Account Number"
                            value={accountNumber}
                            onChange={(e) => setAccountNumber(e.target.value)}
                            className="h-11 rounded-xl border-slate-200 bg-white font-mono"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-xs font-semibold uppercase text-slate-400">
                            Branch Code
                          </Label>
                          <Input
                            placeholder="Sort Code"
                            value={branchCode}
                            onChange={(e) => setBranchCode(e.target.value)}
                            className="h-11 rounded-xl border-slate-200 bg-white"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Sticky Summary */}
              <aside className="xl:sticky xl:top-[96px] xl:self-start">
                <div className="rounded-2xl border border-[#E5E7EB] bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
                  <div className="mb-3 flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-indigo-50">
                      <svg
                        className="h-4 w-4 text-indigo-600"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z"
                        />
                      </svg>
                    </div>
                    <div>
                      <h3 className="text-base font-semibold text-[#0F172A]">
                        Invoice Summary
                      </h3>
                      <p className=" text-muted-foreground">
                        Live totals and invoice readiness.
                      </p>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="flex justify-between items-center border-b border-slate-100 py-2">
                      <span className=" font-medium text-[#64748B]">
                        {!taxInclusive ? "Total (excl. tax)" : "Subtotal"}
                      </span>
                      <span className="font-mono  font-bold text-slate-900">
                        {currentSymbol}
                        {subtotal.toFixed(2)}
                      </span>
                    </div>

                    <div className="my-3 rounded-[10px] border border-slate-200 bg-slate-50 p-3">
                      <h4 className="text-[10px] font-bold text-slate-700 uppercase mb-2 text-center">
                        Tax Analysis
                      </h4>
                      <div className="grid grid-cols-4 gap-2 text-[9px] font-bold text-slate-500 uppercase mb-1 border-b border-slate-200 pb-1">
                        <div className="text-left font-bold text-slate-500 uppercase">
                          VAT %
                        </div>
                        <div className="text-right">Net.Amt</div>
                        <div className="text-right">VAT</div>
                        <div className="text-right">Amount</div>
                      </div>
                      <div className="space-y-1">
                        {Object.entries(taxBreakdown).map(([key, vals]) => {
                          const mTax = taxTypes.data?.find(
                            (t: any) => t.id == vals.taxTypeId,
                          );
                          // Strict check for Exempt first
                          const isExempt =
                            mTax?.zimraTaxId == 1 ||
                            mTax?.zimraTaxId == "1" ||
                            mTax?.zimraCode === "C" ||
                            mTax?.zimraCode === "E" ||
                            mTax?.name?.toLowerCase().includes("exempt");
                          // If not explicitly exempt, and rate is 0, default to Zero Rated (matches backend)
                          const isZeroRated =
                            mTax?.zimraTaxId == 2 ||
                            mTax?.zimraTaxId == "2" ||
                            mTax?.zimraCode === "D" ||
                            mTax?.name?.toLowerCase().includes("zero rated") ||
                            (!isExempt && vals.rate === 0);

                          return (
                            <div
                              key={key}
                              className="grid grid-cols-4 gap-2 text-[10px] items-center py-1 border-b border-slate-100 last:border-0"
                            >
                              <div className="text-slate-600 truncate">
                                {isExempt
                                  ? mTax?.name || "Exempt"
                                  : `${Number(vals.rate).toFixed(2)}%`}
                              </div>
                              <div className="text-right font-mono text-slate-700">
                                {vals.net.toFixed(2)}
                              </div>
                              <div className="text-right font-mono text-slate-700">
                                {isExempt ? "-" : vals.tax.toFixed(2)}
                              </div>
                              <div className="text-right font-mono font-bold text-slate-900">
                                {(vals.net + vals.tax).toFixed(2)}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <div className="flex justify-between items-center border-b border-slate-100 py-2">
                      <span className=" font-medium text-[#64748B]">
                        Total Tax
                      </span>
                      <span className="font-mono  font-bold text-slate-900">
                        {currentSymbol}
                        {taxAmount.toFixed(2)}
                      </span>
                    </div>

                    <div className="flex justify-between items-center border-b border-slate-100 py-2">
                      <span className=" font-medium text-[#64748B]">
                        Discount
                      </span>
                      <span className="font-mono  font-bold text-slate-900">
                        {currentSymbol}
                        {discountAmount.toFixed(2)}
                      </span>
                    </div>

                    <div className="flex items-center justify-between rounded-xl bg-blue-50 px-4 py-3">
                      <span className="text-base font-bold text-[#0F172A]">
                        Total Amount
                      </span>
                      <span className="font-mono text-2xl font-bold text-[#0F172A]">
                        {currentSymbol}
                        {total.toFixed(2)}
                      </span>
                    </div>
                  </div>

                  <div className="mt-5 border-t border-slate-100 pt-4">
                    <div className="mb-3 flex items-center gap-2">
                      <div className="flex h-7 w-7 items-center justify-center rounded-[10px] bg-blue-50">
                        <svg
                          className="h-4 w-4 text-blue-600"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                          />
                        </svg>
                      </div>
                      <div>
                        <h4 className=" font-semibold text-slate-800">
                          {useFiscalWorkflow
                            ? "Fiscal Readiness"
                            : "Invoice Readiness"}
                        </h4>
                        <p className="text-xs text-slate-500">
                          {readyToIssue
                            ? "Ready to issue"
                            : "Complete the checklist before issuing"}
                        </p>
                      </div>
                    </div>

                    <div className="space-y-2">
                      {readinessChecks.map((check) => (
                        <div
                          key={check.label}
                          className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 px-3 py-2"
                        >
                          <span className=" font-medium text-[#64748B]">
                            {check.label}
                          </span>
                          <span
                            className={cn(
                              "flex h-6 w-6 items-center justify-center rounded-full",
                              check.complete
                                ? "bg-green-100 text-green-700"
                                : "bg-amber-100 text-amber-700",
                            )}
                          >
                            {check.complete ? (
                              <Check className="h-3.5 w-3.5" />
                            ) : (
                              <AlertCircle className="h-3.5 w-3.5" />
                            )}
                          </span>
                        </div>
                      ))}
                    </div>

                    <div className="mt-4 rounded-xl bg-slate-50 p-3">
                      <p className="text-xs leading-relaxed text-slate-600">
                        {useFiscalWorkflow
                          ? "QR code and fiscal signature will be generated after fiscal submission."
                          : "This invoice can be issued without fiscal submission because no fiscal device is configured for this company."}
                      </p>
                    </div>
                  </div>

                  <div className="mt-5 grid gap-2">
                    <Button
                      variant="outline"
                      className="h-11 rounded-xl gap-2"
                      onClick={() => setIsPreviewOpen(true)}
                    >
                      <Eye className="h-4 w-4" /> Preview PDF
                    </Button>
                    <Button
                      variant="outline"
                      className="h-11 rounded-xl gap-2 border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 hover:text-blue-800"
                      onClick={() => handleActionClick("issue")}
                      disabled={loadingAction !== null || isLockedByOther}
                    >
                      {loadingAction === "issue" ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Send className="h-4 w-4" />
                      )}
                      {hasDirectAccess ? "Review & Issue Invoice" : "Review & Request Approval"}
                    </Button>
                    {hasDirectAccess && (
                      <Button
                        className="h-11 rounded-xl gap-2 bg-emerald-600 text-white hover:bg-emerald-700 disabled:bg-slate-300"
                        onClick={() => handleActionClick("issueAndFiscalize")}
                        disabled={
                          loadingAction !== null ||
                          isLockedByOther ||
                          !hasFiscalDevice
                        }
                        title={
                          !hasFiscalDevice
                            ? "Connect a fiscal device before fiscalizing"
                            : undefined
                        }
                      >
                        {loadingAction === "issueAndFiscalize" ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <ShieldCheck className="h-4 w-4" />
                        )}
                        Issue & Fiscalize
                      </Button>
                    )}
                  </div>
                </div>
              </aside>
            </div>
          </div>
        </div>
      </div>

      {/* Create Customer Dialog */}
      <Dialog open={isCustomerModalOpen} onOpenChange={setCustomerModalOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Create customer</DialogTitle>
            <div className=" text-slate-500">
              Add a customer without leaving this invoice.
            </div>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="space-y-1.5">
              <Label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                Customer Name
              </Label>
              <Input
                autoFocus
                value={newCustomerName}
                onChange={(e) => setNewCustomerName(e.target.value)}
                placeholder="e.g. Acme Trading"
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                  Email
                </Label>
                <Input
                  type="email"
                  value={newCustomerEmail}
                  onChange={(e) => setNewCustomerEmail(e.target.value)}
                  placeholder="accounts@example.com"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                  Phone
                </Label>
                <Input
                  value={newCustomerPhone}
                  onChange={(e) => setNewCustomerPhone(e.target.value)}
                  placeholder="+263..."
                />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                  TIN
                </Label>
                <Input
                  value={newCustomerTin}
                  onChange={(e) => setNewCustomerTin(e.target.value)}
                  placeholder="10 digits"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                  VAT Number
                </Label>
                <Input
                  value={newCustomerVatNumber}
                  onChange={(e) => setNewCustomerVatNumber(e.target.value)}
                  placeholder="9 or 10 digits"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                Address
              </Label>
              <Input
                value={newCustomerAddress}
                onChange={(e) => setNewCustomerAddress(e.target.value)}
                placeholder="Billing address"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => setCustomerModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              className="gap-2 bg-primary text-white hover:bg-primary/90"
              onClick={handleCreateCustomer}
              disabled={!newCustomerName.trim() || createCustomer.isPending}
            >
              {createCustomer.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              Create and select
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Validation Warning Dialog */}
      <Dialog
        open={showValidationDialog}
        onOpenChange={setShowValidationDialog}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-600">
              <AlertCircle className="h-5 w-5" /> Validation Warnings
            </DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-3">
            {validationWarnings.map((w, i) => (
              <div
                key={i}
                className="p-3 bg-amber-50 rounded-lg text-amber-800  border border-amber-100"
              >
                • {w}
              </div>
            ))}
          </div>
          <div className="flex justify-end gap-3 mt-4">
            <Button
              variant="outline"
              onClick={() => setShowValidationDialog(false)}
            >
              Cancel
            </Button>
            <Button
              className="bg-amber-600 text-white"
              onClick={() => pendingAction && executeAction(pendingAction)}
            >
              Proceed Anyway
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isPreviewOpen} onOpenChange={setIsPreviewOpen}>
        <DialogContent className="max-w-4xl h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Document Preview</DialogTitle>
          </DialogHeader>
          <div className="flex min-h-0 flex-1 flex-col gap-3">
            <div className="min-h-0 flex-1 overflow-hidden rounded-md border border-slate-200 bg-slate-100">
              {previewCompany ? (
                <PDFViewer width="100%" height="100%">
                  <InvoicePDF
                    invoice={previewInvoice}
                    company={previewCompany}
                    customer={selectedCustomer}
                    taxTypes={taxTypes.data}
                  />
                </PDFViewer>
              ) : (
                <div className="flex h-full items-center justify-center p-8 text-center">
                  <div>
                    <ClipboardList className="mx-auto mb-4 h-16 w-16 text-slate-300" />
                    <h3 className="mb-2 text-lg font-medium text-slate-900">
                      Select a company to preview
                    </h3>
                    <p className="max-w-sm text-slate-500">
                      The live invoice preview needs company details before it
                      can render.
                    </p>
                  </div>
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2">
              {previewCompany && (
                <PDFDownloadLink
                  document={
                    <InvoicePDF
                      invoice={previewInvoice}
                      company={previewCompany}
                      customer={selectedCustomer}
                      taxTypes={taxTypes.data}
                    />
                  }
                  fileName={`Document-${Date.now()}.pdf`}
                >
                  {({ loading }) => (
                    <Button className="gap-2" disabled={loading}>
                      <Download className="h-4 w-4" />
                      {loading ? "Generating..." : "Download PDF"}
                    </Button>
                  )}
                </PDFDownloadLink>
              )}
              <Button variant="outline" onClick={() => setIsPreviewOpen(false)}>
                Close
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
