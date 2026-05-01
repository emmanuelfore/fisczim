import { Layout } from "@/components/layout";
import { useCustomers, useCreateCustomer } from "@/hooks/use-customers";
import { useProducts, useCreateProduct } from "@/hooks/use-products";
import { useCreateInvoice, useInvoice, useUpdateInvoice } from "@/hooks/use-invoices";
import { useAuth } from "@/hooks/use-auth";
import { useCurrencies } from "@/hooks/use-currencies";
import { useCompany } from "@/hooks/use-companies";
import { useTaxConfig } from "@/hooks/use-tax-config";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Plus, Trash2, Loader2, ArrowLeft, Check, ChevronsUpDown, ShieldCheck, Send, Lock, ClipboardList, AlertCircle } from "lucide-react";
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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
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

type LineItem = {
  localId: string;
  productId: number | null;
  description: string;
  quantity: number;
  unitPrice: number;
  taxRate: number;
  hsCode?: string;
  taxTypeId?: number | null;
};

export default function CreateInvoicePage() {
  const [location, setLocation] = useLocation();
  const companyId = parseInt(localStorage.getItem("selectedCompanyId") || "0");

  // Check if we're editing an existing invoice
  // wouter useLocation returns only path, so we use window.location.search
  const searchParams = new URLSearchParams(window.location.search);
  const editId = searchParams.get('edit');
  const duplicateId = searchParams.get('duplicate');
  const isEditing = !!editId;
  const isDuplicating = !!duplicateId;

  console.log("Location info:", { path: location, search: window.location.search, editId, duplicateId, isEditing });

  const { data: company } = useCompany(companyId);
  const { data: customers } = useCustomers(companyId);
  const { data: products } = useProducts(companyId);
  const { data: currencies } = useCurrencies(companyId);
  // Fetch existing invoice if we are editing OR duplicating
  const sourceId = editId || duplicateId;
  const { data: existingInvoice } = useInvoice(sourceId ? parseInt(sourceId) : 0);
  const createInvoice = useCreateInvoice(companyId);
  const createCustomer = useCreateCustomer(companyId);
  const { taxTypes } = useTaxConfig(companyId);
  const { toast } = useToast();
  const updateInvoice = useUpdateInvoice();
  const createProduct = useCreateProduct(companyId);
  const { user } = useAuth();

  const [isLockedByOther, setIsLockedByOther] = useState(false);
  const [lockStatus, setLockStatus] = useState<string>("");

  // Lock invoice on mount/edit (ONLY if editing, not if duplicating)
  useEffect(() => {
    if (!isEditing || !user || !editId) return;

    const lockInvoice = async () => {
      try {
        const res = await fetch(`/api/invoices/${editId}/lock`, { method: "POST" });
        if (res.status === 409) {
          setIsLockedByOther(true);
          setLockStatus("This invoice is currently being edited by another user.");
          toast({
            title: "Invoice Locked",
            description: "This invoice is currently being edited by another user.",
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
        fetch(`/api/invoices/${editId}/unlock`, { method: "POST" }).catch(console.error);
      }
    };
  }, [isEditing, user, editId, isLockedByOther]);

  // Pre-fill form when editing or duplicating
  useEffect(() => {
    console.log("Form Population Effect:", { isEditing, isDuplicating, existingInvoice });
    if (existingInvoice && (isEditing || isDuplicating)) {
      console.log("Populating form with:", existingInvoice);
      if (existingInvoice.customerId) setCustomerId(existingInvoice.customerId.toString());

      // If duplicating, set date to today, otherwise keep original issue date
      if (isDuplicating) {
        setIssueDate(new Date().toISOString().split('T')[0]);
        // Default due date to 14 days from now for duplicate? Or keep original offset? 
        // Let's just keep original due date logic or default to +14 days if we wanted smartness.
        // For now, let's just default to today + 14 days to be safe, or keep blank?
        // Actually, let's set it to today + 30 days default if duplicating to avoid stale dates
        const nextMonth = new Date();
        nextMonth.setDate(nextMonth.getDate() + 30);
        setDueDate(nextMonth.toISOString().split('T')[0]);
      } else {
        if (existingInvoice.issueDate) setIssueDate(new Date(existingInvoice.issueDate).toISOString().split('T')[0]);
        if (existingInvoice.dueDate) setDueDate(new Date(existingInvoice.dueDate).toISOString().split('T')[0]);
      }

      setNotes(existingInvoice.notes || "");
      setTaxInclusive(existingInvoice.taxInclusive || false);
      setCurrencyCode(existingInvoice.currency || "USD");
      setExchangeRate(existingInvoice.exchangeRate || "1.000000"); // Ensure we copy exchange rate too
      setPaymentMethod(existingInvoice.paymentMethod || "CASH");

      if (existingInvoice.items && existingInvoice.items.length > 0) {
        console.log("Populating items:", existingInvoice.items);
        setItems(existingInvoice.items.map(item => ({
          localId: Math.random().toString(36).substring(2, 11),
          productId: item.productId,
          description: item.description || "",
          quantity: Number(item.quantity),
          unitPrice: Number(item.unitPrice),
          taxRate: Number(item.taxRate),
          hsCode: (item as any).product?.hsCode || undefined,
          taxTypeId: item.taxTypeId
        })));
      }
    }
  }, [existingInvoice, isEditing, isDuplicating]);

  // Form State
  const [customerId, setCustomerId] = useState<string>("");
  const [issueDate, setIssueDate] = useState<string>(new Date().toISOString().split('T')[0]); // Default to today
  const [dueDate, setDueDate] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [taxInclusive, setTaxInclusive] = useState<boolean>(false);

  // Helper to get default tax rate based on company registration
  const getDefaultTaxRate = () => {
    if (company && !company.vatRegistered) return 0;
    return 15;
  };

  const [items, setItems] = useState<LineItem[]>([
    { localId: Math.random().toString(36).substring(2, 11), productId: null, description: "", quantity: 1, unitPrice: 0, taxRate: getDefaultTaxRate() }
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
    const newCurrency = currencies?.find(c => c.code === code);
    if (!newCurrency) return;

    const oldRate = Number(exchangeRate);
    const newRate = Number(newCurrency.exchangeRate);

    // Update all item prices based on rate change
    const scaledItems = items.map(item => ({
      ...item,
      unitPrice: (item.unitPrice / oldRate) * newRate
    }));

    setItems(scaledItems);
    setCurrencyCode(code);
    setExchangeRate(newCurrency.exchangeRate);
  };

  const currentSymbol = currencies?.find(c => c.code === currencyCode)?.symbol || "$";

  // New Customer Modal State
  const [isCustomerModalOpen, setCustomerModalOpen] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState("");
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [open, setOpen] = useState(false);
  const [openRowIndex, setOpenRowIndex] = useState<number | null>(null);

  const [customerSearch, setCustomerSearch] = useState("");
  const [productSearch, setProductSearch] = useState<Record<string, string>>({});

  // Auto-Save: Persist to localStorage
  useEffect(() => {
    if (isEditing || isDuplicating) return;

    const timer = setTimeout(() => {
      const draftState = {
        customerId,
        items,
        notes,
        currencyCode,
        exchangeRate,
        paymentMethod,
        taxInclusive,
        issueDate,
        dueDate
      };
      localStorage.setItem(`invoice_draft_${companyId}`, JSON.stringify(draftState));
    }, 1000);

    return () => clearTimeout(timer);
  }, [customerId, items, notes, currencyCode, exchangeRate, paymentMethod, taxInclusive, issueDate, dueDate, isEditing, isDuplicating, companyId]);

  // Restore State on Mount
  useEffect(() => {
    if (isEditing || isDuplicating || isRestored) return;

    const saved = localStorage.getItem(`invoice_draft_${companyId}`);
    if (saved) {
      try {
        const state = JSON.parse(saved);
        if (state.customerId) setCustomerId(state.customerId);
        if (state.items) setItems(state.items);
        if (state.notes) setNotes(state.notes);
        if (state.currencyCode) setCurrencyCode(state.currencyCode);
        if (state.exchangeRate) setExchangeRate(state.exchangeRate);
        if (state.paymentMethod) setPaymentMethod(state.paymentMethod);
        if (state.taxInclusive) setTaxInclusive(state.taxInclusive);
        if (state.issueDate) setIssueDate(state.issueDate);
        if (state.dueDate) setDueDate(state.dueDate);
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
    setItems([...items, { localId: Math.random().toString(36).substring(2, 11), productId: null, description: "", quantity: 1, unitPrice: 0, taxRate: getDefaultTaxRate() }]);
  };

  const handleRemoveItem = (localId: string) => {
    setItems(items.filter(item => item.localId !== localId));
  };

  const handleProductSelect = (localId: string, productId: string) => {
    const product = products?.find(p => p.id === parseInt(productId));
    if (product) {
      setItems(prev => prev.map(item => {
        if (item.localId !== localId) return item;

        let taxRate = company?.vatRegistered ? Number(product.taxRate ?? 15) : 0;

        if (company?.vatRegistered && product.taxCategoryId && taxTypes.data) {
          const category = taxTypes.data.find(t => t.id === product.taxCategoryId);
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
          taxTypeId: product.taxTypeId
        };
      }));
    }
  };

  const updateItem = (localId: string, field: keyof LineItem, value: any) => {
    setItems(prev => prev.map(item =>
      item.localId === localId ? { ...item, [field]: value } : item
    ));
  };

  const calculateTotals = () => {
    let subtotal = 0;
    let taxAmount = 0;

    items.forEach(item => {
      const lineTotal = item.quantity * item.unitPrice;

      if (taxInclusive) {
        const taxPortion = lineTotal - (lineTotal / (1 + (item.taxRate / 100)));
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
      total: subtotal + taxAmount
    };
  };

  const { subtotal, taxAmount, total } = calculateTotals();

  const calculateTaxBreakdown = () => {
    const breakdown: Record<string, { net: number, tax: number, rate: number, taxTypeId: number }> = {};

    items.forEach(item => {
      const lineTotal = item.quantity * item.unitPrice;
      const rate = Number(item.taxRate);
      const taxTypeId = item.taxTypeId || 0;
      const key = `${rate}-${taxTypeId}`;

      if (!breakdown[key]) breakdown[key] = { net: 0, tax: 0, rate, taxTypeId };

      if (taxInclusive) {
        const taxPortion = lineTotal - (lineTotal / (1 + (rate / 100)));
        breakdown[key].net += (lineTotal - taxPortion);
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

  const [loadingAction, setLoadingAction] = useState<'draft' | 'issue' | 'quote' | null>(null);

  const handleSaveDraft = async () => {
    setLoadingAction('draft');
    if (!customerId) {
      toast({ title: "Validation Error", description: "Please select a customer.", variant: "destructive" });
      setLoadingAction(null);
      return;
    }

    const hasInvalidItems = items.some(item => !item.productId);
    if (hasInvalidItems) {
      toast({ title: "Validation Error", description: "One or more invoice lines have no item selected.", variant: "destructive" });
      setLoadingAction(null);
      return;
    }

    if (!dueDate) {
      toast({ title: "Validation Error", description: "Please select a due date.", variant: "destructive" });
      setLoadingAction(null);
      return;
    }

    const invoiceNumber = isEditing && existingInvoice ? existingInvoice.invoiceNumber : `DRAFT-${Date.now().toString().slice(-6)}`;
    
    const invoiceData = {
      companyId,
      invoiceNumber,
      customerId: parseInt(customerId),
      issueDate: issueDate ? new Date(issueDate) : new Date(),
      dueDate: new Date(dueDate),
      notes,
      currency: currencyCode,
      exchangeRate: exchangeRate,
      paymentMethod,
      status: "draft",
      subtotal: subtotal.toString(),
      taxAmount: taxAmount.toString(),
      total: total.toString(),
      taxInclusive: taxInclusive,
      items: items.map(item => ({
        productId: item.productId,
        description: item.description,
        quantity: item.quantity.toString(),
        unitPrice: item.unitPrice.toString(),
        taxRate: item.taxRate.toString(),
        lineTotal: (item.quantity * item.unitPrice).toString(),
        taxTypeId: item.taxTypeId
      }))
    };

    try {
      if (isEditing && editId) {
        await updateInvoice.mutateAsync({ id: parseInt(editId), data: invoiceData });
        toast({ title: "Draft Updated", description: "Draft invoice updated successfully." });
      } else {
        await createInvoice.mutateAsync(invoiceData);
        toast({ title: "Draft Saved", description: "Invoice saved as draft successfully." });
      }
      setLocation("/invoices");
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to save draft", variant: "destructive" });
    } finally {
      setLoadingAction(null);
    }
  };

  const handleSaveQuotation = async () => {
    setLoadingAction('quote');
    if (!customerId) {
      toast({ title: "Validation Error", description: "Please select a customer.", variant: "destructive" });
      setLoadingAction(null);
      return;
    }

    const hasInvalidItems = items.some(item => !item.productId);
    if (hasInvalidItems) {
      toast({ title: "Validation Error", description: "One or more invoice lines have no item selected.", variant: "destructive" });
      setLoadingAction(null);
      return;
    }

    const invoiceNumber = isEditing && existingInvoice ? existingInvoice.invoiceNumber : `QT-${Date.now().toString().slice(-6)}`;
    const invoiceData = {
      companyId,
      invoiceNumber,
      customerId: parseInt(customerId),
      issueDate: issueDate ? new Date(issueDate) : new Date(),
      dueDate: dueDate ? new Date(dueDate) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      notes,
      currency: currencyCode,
      exchangeRate: exchangeRate,
      paymentMethod,
      status: "quote",
      subtotal: subtotal.toString(),
      taxAmount: taxAmount.toString(),
      total: total.toString(),
      taxInclusive: taxInclusive,
      items: items.map(item => ({
        productId: item.productId,
        description: item.description,
        quantity: item.quantity.toString(),
        unitPrice: item.unitPrice.toString(),
        taxRate: item.taxRate.toString(),
        lineTotal: (item.quantity * item.unitPrice).toString(),
        taxTypeId: item.taxTypeId
      }))
    };

    try {
      if (isEditing && editId) {
        await updateInvoice.mutateAsync({ id: parseInt(editId), data: invoiceData });
        toast({ title: "Quotation Updated", description: "Quotation updated successfully." });
      } else {
        await createInvoice.mutateAsync(invoiceData);
        toast({ title: "Quotation Saved", description: "Quotation saved successfully." });
      }
      setLocation("/invoices");
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to save quotation", variant: "destructive" });
    } finally {
      setLoadingAction(null);
    }
  };

  const handleIssue = async () => {
    setLoadingAction('issue');
    if (!customerId) {
        toast({ title: "Validation Error", description: "Please select a customer.", variant: "destructive" });
        setLoadingAction(null);
        return;
    }

    if (items.some(item => !item.productId)) {
        toast({ title: "Validation Error", description: "All lines must have a product selected.", variant: "destructive" });
        setLoadingAction(null);
        return;
    }

    if (!dueDate) {
        toast({ title: "Validation Error", description: "Please select a due date.", variant: "destructive" });
        setLoadingAction(null);
        return;
    }

    const invoiceNumber = isEditing && existingInvoice && existingInvoice.status === 'issued'
      ? existingInvoice.invoiceNumber
      : `INV-${Date.now().toString().slice(-6)}`;

    const invoiceData = {
      companyId,
      invoiceNumber,
      customerId: parseInt(customerId),
      issueDate: new Date(issueDate),
      dueDate: new Date(dueDate),
      notes,
      currency: currencyCode,
      exchangeRate: exchangeRate,
      paymentMethod,
      status: "issued",
      subtotal: subtotal.toString(),
      taxAmount: taxAmount.toString(),
      total: total.toString(),
      taxInclusive: taxInclusive,
      items: items.map(item => ({
        productId: item.productId,
        description: item.description,
        quantity: item.quantity.toString(),
        unitPrice: item.unitPrice.toString(),
        taxRate: item.taxRate.toString(),
        lineTotal: (item.quantity * item.unitPrice).toString(),
        taxTypeId: item.taxTypeId
      }))
    };

    try {
      if (isEditing && editId) {
        await updateInvoice.mutateAsync({ id: parseInt(editId), data: invoiceData });
      } else {
        await createInvoice.mutateAsync(invoiceData);
      }
      toast({ title: "Invoice Issued", description: "Invoice issued successfully." });
      setLocation("/invoices");
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to issue invoice", variant: "destructive" });
    } finally {
      setLoadingAction(null);
    }
  };

  const [validationWarnings, setValidationWarnings] = useState<string[]>([]);
  const [showValidationDialog, setShowValidationDialog] = useState(false);
  const [pendingAction, setPendingAction] = useState<'draft' | 'issue' | 'quote' | null>(null);

  const validateInvoice = (action: 'draft' | 'issue' | 'quote'): string[] => {
    const warnings: string[] = [];
    if (items.some(item => !item.hsCode || item.hsCode.length < 4)) {
      warnings.push("⚠️ Some items are missing valid HS Codes. ZIMRA requires proper classification.");
    }
    if (items.some(item => item.unitPrice === 0)) {
      warnings.push("⚠️ Some items have a price of 0.00. Ensure this is intentional.");
    }
    return warnings;
  };

  const handleActionClick = (action: 'draft' | 'issue' | 'quote') => {
    const warnings = validateInvoice(action);
    if (warnings.length > 0) {
      setValidationWarnings(warnings);
      setPendingAction(action);
      setShowValidationDialog(true);
    } else {
      executeAction(action);
    }
  };

  const executeAction = (action: 'draft' | 'issue' | 'quote') => {
    if (action === 'draft') handleSaveDraft();
    if (action === 'issue') handleIssue();
    if (action === 'quote') handleSaveQuotation();
    setShowValidationDialog(false);
  };

  return (
    <Layout>
      <div className="bg-slate-50/50 min-h-screen pb-20">
        {isLockedByOther && (
          <div className="bg-amber-50 border-l-4 border-amber-500 p-4 mb-4 rounded-r shadow-sm max-w-7xl mx-auto mt-4 px-6">
            <div className="flex">
              <div className="flex-shrink-0"><Lock className="h-5 w-5 text-amber-500" /></div>
              <div className="ml-3"><p className="text-sm text-amber-700">{lockStatus}</p></div>
            </div>
          </div>
        )}

        <div className="mb-6 flex flex-col md:flex-row gap-4 items-center justify-between no-print scale-95 origin-top px-6 pt-4">
          <div className="flex items-center gap-4">
            <Button variant="ghost" onClick={() => setLocation("/invoices")} className="pl-0 text-slate-500 hover:text-slate-900 group">
              <ArrowLeft className="w-4 h-4 mr-2 transition-transform group-hover:-translate-x-1" /> Documents
            </Button>
            <h1 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
              <FileText className="w-5 h-5 text-primary" />
              {isEditing ? "Edit Document" : "New Document"}
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => handleActionClick('draft')} disabled={loadingAction !== null} className="h-9 text-xs px-4 border-slate-200 hover:bg-slate-50">
              {loadingAction === 'draft' ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ShieldCheck className="w-4 h-4 mr-2 text-slate-400" />} Save Draft
            </Button>
            <Button variant="outline" size="sm" onClick={() => handleActionClick('quote')} disabled={loadingAction !== null} className="h-9 text-xs px-4 border-slate-200 hover:bg-slate-50">
              {loadingAction === 'quote' ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ClipboardList className="w-4 h-4 mr-2 text-slate-400" />} Quotation
            </Button>
            <Button size="sm" onClick={() => handleActionClick('issue')} disabled={loadingAction !== null} className="bg-primary hover:bg-primary/90 text-white h-9 text-xs px-6 shadow-sm shadow-primary/20">
              {loadingAction === 'issue' ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />} Issue Document
            </Button>
            <div className="w-px h-6 bg-slate-200 mx-1" />
            <Button variant="ghost" size="sm" className="h-9 text-xs px-3 gap-2 text-slate-500 hover:bg-slate-100" onClick={() => setIsPreviewOpen(true)}>
              <Eye className="w-4 h-4" /> Preview
            </Button>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-6 py-2">
          <div className="bg-white shadow-xl border border-slate-200 rounded-2xl overflow-hidden">
            <div className="bg-gradient-to-r from-slate-50 to-white border-b border-slate-100 px-6 py-3">
              <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-4">
                <h1 className="text-xl font-bold text-slate-900">
                  {searchParams.get('type') === 'quote' || existingInvoice?.status === 'quote' ? "OFFICIAL QUOTATION" : "TAX INVOICE"}
                </h1>
                <div className="flex items-center gap-3 bg-white p-1 rounded-lg border border-slate-200 shadow-sm">
                  <Button variant={taxInclusive ? "ghost" : "default"} size="xs" onClick={() => setTaxInclusive(false)} className="text-[10px] h-6">Excl. Tax</Button>
                  <Button variant={taxInclusive ? "default" : "ghost"} size="xs" onClick={() => setTaxInclusive(true)} className="text-[10px] h-6">Incl. Tax</Button>
                </div>
              </div>
            </div>

            <div className="px-6 py-6 space-y-6">
              <div className="bg-slate-50/50 rounded-xl p-3 border border-slate-200 shadow-inner">
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
                  <div className="space-y-1">
                    <Label className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Document No</Label>
                    <div className="font-mono text-xs font-bold text-slate-700 bg-white border border-slate-200 rounded px-2 h-7 flex items-center">
                      {isEditing && existingInvoice ? existingInvoice.invoiceNumber : "[Auto]"}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Issue Date</Label>
                    <Input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} className="h-7 py-0 px-2 text-xs bg-white border-slate-200" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Due Date</Label>
                    <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="h-7 py-0 px-2 text-xs bg-white border-slate-200" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Currency</Label>
                    <Select value={currencyCode} onValueChange={handleCurrencyChange}>
                      <SelectTrigger className="h-7 py-0 px-2 text-xs bg-white border-slate-200"><SelectValue /></SelectTrigger>
                      <SelectContent>{currencies?.map(c => (<SelectItem key={c.id} value={c.code}>{c.code}</SelectItem>))}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Payment</Label>
                    <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                      <SelectTrigger className="h-7 py-0 px-2 text-xs bg-white border-slate-200"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="CASH">Cash</SelectItem>
                        <SelectItem value="CARD">Swipe</SelectItem>
                        <SelectItem value="TRANSFER">Bank</SelectItem>
                        <SelectItem value="ECOCASH">Mobile</SelectItem>
                        <SelectItem value="OTHER">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Device ID</Label>
                    <div className="text-slate-400 font-mono text-[9px] pt-1.5 truncate">{company?.fdmsDeviceId || "N/A"}</div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Fiscal Day</Label>
                    <div className="font-mono text-xs font-bold text-slate-700 bg-slate-100/50 border border-slate-200 rounded px-2 h-7 flex items-center justify-center">
                      {isEditing && existingInvoice ? (existingInvoice.fiscalDayNo || "-") : "[Auto]"}
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
                  <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Seller Information</h3>
                  <div className="flex gap-4 items-start">
                    <div className="flex-1 min-w-0">
                      <h4 className="text-base font-bold text-slate-900 truncate">{company?.tradingName || company?.name}</h4>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-2 text-[11px]">
                        <p><span className="text-slate-400">TIN:</span> {company?.tin || "-"}</p>
                        <p><span className="text-slate-400">VAT:</span> {company?.vatNumber || "-"}</p>
                        <p className="col-span-2 text-slate-600">{company?.address}, {company?.city}</p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm relative">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Buyer Information</h3>
                    <Popover open={open} onOpenChange={setOpen}>
                      <PopoverTrigger asChild>
                        <Button variant="ghost" size="xs" className="h-5 text-[9px] text-primary">
                          {customerId ? "Change Client" : "Select Client"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[350px] p-0" align="end">
                        <Command>
                          <CommandInput placeholder="Search client..." value={customerSearch} onValueChange={setCustomerSearch} />
                          <CommandList>
                            <CommandEmpty>No client found.</CommandEmpty>
                            <CommandGroup>
                              {customers?.map((customer) => (
                                <CommandItem key={customer.id} value={customer.name} onSelect={() => { setCustomerId(customer.id.toString()); setOpen(false); }}>
                                  <Check className={cn("mr-2 h-4 w-4", customerId === customer.id.toString() ? "opacity-100" : "opacity-0")} />
                                  <div className="flex flex-col">
                                    <span className="font-medium text-sm">{customer.name}</span>
                                    <span className="text-[10px] text-slate-400">{customer.tin || customer.email}</span>
                                  </div>
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                  </div>
                  
                  {!customerId ? (
                    <div className="h-20 flex flex-col items-center justify-center border-2 border-dashed border-slate-100 rounded-lg bg-slate-50/50 cursor-pointer" onClick={() => setOpen(true)}>
                      <Plus className="w-5 h-5 text-slate-300 mb-1" />
                      <span className="text-[10px] text-slate-400 font-bold uppercase">Click to Select Customer</span>
                    </div>
                  ) : (
                    (() => {
                      const c = customers?.find(cust => cust.id.toString() === customerId);
                      if (!c) return null;
                      return (
                        <div className="flex gap-4 items-start">
                          <div className="h-10 w-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 font-bold text-sm">
                            {c.name.charAt(0)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <h4 className="text-base font-bold text-slate-900 truncate">{c.name}</h4>
                            <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-2 text-[11px]">
                              <p><span className="text-slate-400">TIN:</span> {c.tin || "-"}</p>
                              <p><span className="text-slate-400">VAT:</span> {c.vatNumber || "-"}</p>
                              <p className="col-span-2 text-slate-600">{c.email || c.phone || "No contact"}</p>
                            </div>
                          </div>
                        </div>
                      );
                    })()
                  )}
                </div>
              </div>

              <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="bg-slate-50/50 px-4 py-2 border-b border-slate-200 flex items-center justify-between">
                  <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Line Items</h3>
                  <Button variant="ghost" size="xs" onClick={handleAddItem} className="h-7 text-[10px] text-primary font-bold">
                    <Plus className="w-3 h-3 mr-1" /> ADD ITEM
                  </Button>
                </div>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader className="bg-slate-50/50">
                      <TableRow className="hover:bg-transparent border-b border-slate-100">
                        <TableHead className="w-[300px] h-9 text-[10px] uppercase font-bold text-slate-400">Product / Service</TableHead>
                        <TableHead className="min-w-[150px] h-9 text-[10px] uppercase font-bold text-slate-400">Description</TableHead>
                        <TableHead className="w-[80px] h-9 text-[10px] uppercase font-bold text-slate-400 text-center">Qty</TableHead>
                        <TableHead className="w-[120px] h-9 text-[10px] uppercase font-bold text-slate-400 text-right">Price ({taxInclusive ? "Incl" : "Excl"})</TableHead>
                        <TableHead className="w-[120px] h-9 text-[10px] uppercase font-bold text-slate-400 text-right">Total</TableHead>
                        <TableHead className="w-[40px] h-9"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                        <AnimatePresence mode="popLayout">
                          {items.map((item, index) => {
                            const lineVal = item.quantity * item.unitPrice;
                            return (
                                <motion.tr key={item.localId} layout className="group hover:bg-slate-50/30 border-b border-slate-50">
                                  <TableCell className="py-2">
                                    <Popover open={openRowIndex === index} onOpenChange={(isOpen) => setOpenRowIndex(isOpen ? index : null)}>
                                      <PopoverTrigger asChild>
                                        <Button variant="outline" className="w-full justify-between h-8 text-xs font-normal truncate bg-white">
                                          {item.productId ? products?.find(p => p.id === item.productId)?.name : "Select Item"}
                                          <ChevronsUpDown className="ml-2 h-3 w-3 opacity-50 shrink-0" />
                                        </Button>
                                      </PopoverTrigger>
                                      <PopoverContent className="w-[300px] p-0" align="start">
                                        <Command>
                                          <CommandInput placeholder="Search items..." value={productSearch[item.localId] || ""} onValueChange={(val) => setProductSearch(p => ({ ...p, [item.localId]: val }))} />
                                          <CommandList>
                                            <CommandEmpty>No item found.</CommandEmpty>
                                            <CommandGroup heading="Products">
                                              {products?.map(p => (
                                                <CommandItem key={p.id} value={p.name} onSelect={() => { handleProductSelect(item.localId, p.id.toString()); setOpenRowIndex(null); }}>
                                                  <Check className={cn("mr-2 h-4 w-4", item.productId === p.id ? "opacity-100" : "opacity-0")} />
                                                  <span className="text-sm">{p.name}</span>
                                                </CommandItem>
                                              ))}
                                            </CommandGroup>
                                          </CommandList>
                                        </Command>
                                      </PopoverContent>
                                    </Popover>
                                  </TableCell>
                                  <TableCell className="py-2">
                                    <Input value={item.description} onChange={(e) => updateItem(item.localId, 'description', e.target.value)} className="h-8 text-xs bg-transparent border-transparent hover:border-slate-100" />
                                  </TableCell>
                                  <TableCell className="py-2">
                                    <Input type="number" value={item.quantity} onChange={(e) => updateItem(item.localId, 'quantity', parseFloat(e.target.value) || 0)} className="h-8 text-xs text-center font-bold bg-transparent border-transparent" />
                                  </TableCell>
                                  <TableCell className="py-2">
                                    <Input type="number" value={item.unitPrice} onChange={(e) => updateItem(item.localId, 'unitPrice', parseFloat(e.target.value) || 0)} className="h-8 text-xs text-right font-mono font-bold bg-transparent border-transparent" />
                                  </TableCell>
                                  <TableCell className="py-2 text-right font-mono font-bold text-xs">{lineVal.toFixed(2)}</TableCell>
                                  <TableCell className="py-2">
                                    <Button variant="ghost" size="icon" onClick={() => handleRemoveItem(item.localId)} className="h-7 w-7 text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity">
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </Button>
                                  </TableCell>
                                </motion.tr>
                            );
                          })}
                        </AnimatePresence>
                    </TableBody>
                  </Table>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-white rounded-xl p-4 border border-slate-200">
                  <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Notes & Terms</h3>
                  <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Terms, delivery instructions, banking details..." className="min-h-[100px] text-xs resize-none bg-slate-50 border-slate-100" />
                </div>

                <div className="bg-indigo-50/30 rounded-xl p-4 border border-indigo-100">
                   <h3 className="text-xs font-bold text-indigo-600 uppercase tracking-wider mb-4">Summary</h3>
                   <div className="space-y-2">
                      <div className="flex justify-between text-xs"><span className="text-slate-500">Subtotal</span><span className="font-mono font-bold">{currentSymbol}{subtotal.toFixed(2)}</span></div>
                      <div className="flex justify-between text-xs"><span className="text-slate-500">VAT (15%)</span><span className="font-mono font-bold">{currentSymbol}{taxAmount.toFixed(2)}</span></div>
                      <div className="pt-2 border-t border-indigo-100 flex justify-between items-center">
                        <span className="text-sm font-bold text-slate-900 uppercase">Total amount</span>
                        <span className="text-lg font-mono font-bold text-indigo-700">{currentSymbol}{total.toFixed(2)}</span>
                      </div>
                   </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <Dialog open={showValidationDialog} onOpenChange={setShowValidationDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-600"><AlertCircle className="h-5 w-5" /> Validation Warnings</DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-3">
            {validationWarnings.map((w, i) => (<div key={i} className="p-3 bg-amber-50 rounded-lg text-amber-800 text-sm border border-amber-100">• {w}</div>))}
          </div>
          <div className="flex justify-end gap-3 mt-4">
            <Button variant="outline" onClick={() => setShowValidationDialog(false)}>Cancel</Button>
            <Button className="bg-amber-600 text-white" onClick={() => pendingAction && executeAction(pendingAction)}>Proceed Anyway</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isPreviewOpen} onOpenChange={setIsPreviewOpen}>
        <DialogContent className="max-w-4xl h-[90vh]">
          <DialogHeader><DialogTitle>Document Preview</DialogTitle></DialogHeader>
          <div className="flex-1 bg-slate-100 rounded-md overflow-hidden flex items-center justify-center p-8">
            <div className="text-center">
                <ClipboardList className="w-16 h-16 mx-auto text-slate-300 mb-4" />
                <h3 className="text-lg font-medium text-slate-900 mb-2">Live Preview Available Soon</h3>
                <p className="text-sm text-slate-500 max-w-sm">Generating a PDF for {customers?.find(c => c.id.toString() === customerId)?.name || "selected customer"}.</p>
                <div className="mt-6 flex flex-col gap-2">
                    {customerId && company && items.length > 0 && (
                        <PDFDownloadLink
                            document={
                                <InvoicePDF
                                    invoice={{
                                        invoiceNumber: "DRAFT",
                                        issueDate: new Date(issueDate).toISOString(),
                                        dueDate: new Date(dueDate).toISOString(),
                                        status: "draft",
                                        items: items.map(item => ({ ...item, lineTotal: (item.quantity * item.unitPrice).toString(), product: { hsCode: item.hsCode } })),
                                        subtotal: subtotal.toString(),
                                        taxAmount: taxAmount.toString(),
                                        total: total.toString(),
                                        currency: currencyCode,
                                        taxInclusive,
                                        notes,
                                        currencySymbol: currentSymbol
                                    }}
                                    company={{ ...company, bankName, accountName, accountNumber, branchCode }}
                                    customer={customers?.find(c => c.id.toString() === customerId)}
                                    taxTypes={taxTypes.data}
                                />
                            }
                            fileName={`Document-${Date.now()}.pdf`}
                        >
                            {({ loading }) => (
                                <Button className="w-full gap-2" disabled={loading}>
                                    <Download className="w-4 h-4" /> {loading ? "Generating..." : "Download PDF"}
                                </Button>
                            )}
                        </PDFDownloadLink>
                    )}
                    <Button variant="outline" onClick={() => setIsPreviewOpen(false)}>Close Preview</Button>
                </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
