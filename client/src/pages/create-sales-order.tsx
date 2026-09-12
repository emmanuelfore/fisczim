import { QuantityInput } from "@/components/ui/quantity-input";
import { Layout } from "@/components/layout";
import { useCustomers, useCreateCustomer } from "@/hooks/use-customers";
import { useProducts, useCreateProduct } from "@/hooks/use-products";
import {
  useCreateSalesOrder,
  useSalesOrder,
  useUpdateSalesOrder,
  useSalesOrderSettings,
} from "@/hooks/use-sales-orders";
import { useAuth } from "@/hooks/use-auth";
import { useCurrencies } from "@/hooks/use-currencies";
import { useCompany } from "@/hooks/use-companies";
import { useTaxConfig } from "@/hooks/use-tax-config";
import { useToast } from "@/hooks/use-toast";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PDFViewer, PDFDownloadLink } from "@react-pdf/renderer";
import { InvoicePDF } from "@/components/invoices/pdf-document";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import {
  Plus,
  Trash2,
  Loader2,
  ArrowLeft,
  Check,
  ChevronsUpDown,
  Send,
  Eye,
  Save,
  Download,
  Plane,
  Ship,
  Clock,
  ShoppingCart,
  AlertTriangle,
  Info,
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

  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type LineItem = {
  localId: string;
  productId: number | null;
  description: string;
  quantity: number;
  unitPrice: number;
  taxRate: number;
  taxTypeId?: number | null;
  hsCode?: string;
};

export default function CreateSalesOrderPage() {
  const [location, setLocation] = useLocation();
  const companyId = parseInt(localStorage.getItem("selectedCompanyId") || "0");

  const searchParams = new URLSearchParams(window.location.search);
  const editId = searchParams.get("edit");
  const isEditing = !!editId;

  const { data: company } = useCompany(companyId);
  const { data: customers } = useCustomers(companyId);
  const { data: products } = useProducts(companyId);
  const { data: currencies } = useCurrencies(companyId);
  const { data: existingSalesOrder } = useSalesOrder(
    editId ?? undefined,
  );
  const createSalesOrder = useCreateSalesOrder();
  const updateSalesOrder = useUpdateSalesOrder();
  const { toast } = useToast();
  const { taxTypes } = useTaxConfig(companyId);

  // Form State
  const [customerId, setCustomerId] = useState<string>("");
  const [issueDate, setIssueDate] = useState<string>(
    new Date().toISOString().split("T")[0],
  );
  const [expiryDate, setExpiryDate] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [taxInclusive, setTaxInclusive] = useState<boolean>(false);
  const [currencyCode, setCurrencyCode] = useState("USD");
  const [exchangeRate, setExchangeRate] = useState("1.00");
  const [items, setItems] = useState<LineItem[]>([
    {
      localId: Math.random().toString(36).substring(2, 11),
      productId: null,
      description: "",
      quantity: 1,
      unitPrice: 0,
      taxRate: 15,
    },
  ]);
  const [showPreview, setShowPreview] = useState(false);

  const { data: salesOrderSettings } = useSalesOrderSettings(companyId);

  const [orderType, setOrderType] = useState('cash_and_carry');
  const [preorderType, setPreorderType] = useState('air');
  const [depositPct, setDepositPct] = useState<number | ''>('');
  const [depositPaid, setDepositPaid] = useState('');
  const [expectedArrival, setExpectedArrival] = useState('');
  const [layByDuration, setLayByDuration] = useState(3);
  const [paymentMethod, setPaymentMethod] = useState('Cash');
  const [paymentReference, setPaymentReference] = useState('');

  useEffect(() => {
    if (existingSalesOrder && isEditing) {
      setCustomerId(existingSalesOrder.customerId.toString());
      if (existingSalesOrder.issueDate)
        setIssueDate(
          new Date(existingSalesOrder.issueDate).toISOString().split("T")[0],
        );
      if (existingSalesOrder.expiryDate)
        setExpiryDate(
          new Date(existingSalesOrder.expiryDate).toISOString().split("T")[0],
        );
      setNotes(existingSalesOrder.notes || "");
      setTaxInclusive(existingSalesOrder.taxInclusive || false);
      setCurrencyCode(existingSalesOrder.currency || "USD");

      if (existingSalesOrder.items && existingSalesOrder.items.length > 0) {
        setItems(
          existingSalesOrder.items.map((item: any) => {
            const product = products?.find((p) => p.id === item.productId);
            return {
              localId: Math.random().toString(36).substring(2, 11),
              productId: item.productId,
              description: item.description,
              quantity: Number(item.quantity),
              unitPrice: Number(item.unitPrice),
              taxRate: Number(item.taxRate),
              taxTypeId: item.taxTypeId,
              hsCode: product?.hsCode,
            };
          }),
        );
      }
    }
  }, [existingSalesOrder, isEditing, products]);

  const handleAddItem = () => {
    setItems([
      ...items,
      {
        localId: Math.random().toString(36).substring(2, 11),
        productId: null,
        description: "",
        quantity: 1,
        unitPrice: 0,
        taxRate: 15,
      },
    ]);
  };

  const updateItem = (localId: string, field: keyof LineItem, value: any) => {
    setItems((prev) =>
      prev.map((item) =>
        item.localId === localId ? { ...item, [field]: value } : item,
      ),
    );
  };

  const handleProductSelect = (localId: string, productId: string) => {
    const product = products?.find((p) => p.id === parseInt(productId));
    if (product) {
      setItems((prev) =>
        prev.map((item) => {
          if (item.localId !== localId) return item;

          // Determine tax rate: prefer taxCategoryId if linked, otherwise fallback to product override
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
            taxTypeId: product.taxTypeId,
            hsCode: product.hsCode,
          };
        }),
      );
    }
  };

  const calculateTotals = () => {
    let subtotal = 0;
    let taxAmount = 0;

    items.forEach((item) => {
      const lineTotal = item.quantity * item.unitPrice;
      // If company is not VAT registered, effective tax rate is 0
      const effectiveTaxRate = company?.vatRegistered
        ? Number(item.taxRate)
        : 0;

      if (taxInclusive) {
        const taxPortion = lineTotal - lineTotal / (1 + effectiveTaxRate / 100);
        subtotal += lineTotal - taxPortion;
        taxAmount += taxPortion;
      } else {
        subtotal += lineTotal;
        taxAmount += lineTotal * (effectiveTaxRate / 100);
      }
    });

    return { subtotal, taxAmount, total: subtotal + taxAmount };
  };

  const calculateTaxBreakdown = () => {
    const breakdown: Record<
      string,
      { net: number; tax: number; rate: number; taxTypeId: number }
    > = {};

    items.forEach((item) => {
      const lineTotal = item.quantity * item.unitPrice;
      // If company is not VAT registered, effective tax rate is 0
      const rate = company?.vatRegistered ? Number(item.taxRate) : 0;
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

  const { subtotal, taxAmount, total } = calculateTotals();
  const taxBreakdown = calculateTaxBreakdown();
  const handleSave = async (status: string = "draft") => {
    if (orderType !== 'cash_and_carry' && !customerId)
      return toast({
        title: "Error",
        description: "Select a customer for preorders and lay-by orders",
        variant: "destructive",
      });

    const hasInvalidItems = items.some((item) => !item.productId);
    if (hasInvalidItems) {
      return toast({
        title: "Validation Error",
        description:
          "One or more lines have no item selected. Please select a product for all lines or remove empty lines.",
        variant: "destructive",
      });
    }

    const payload = {
      companyId,
      customerId: customerId ? parseInt(customerId) : null,
      issueDate: new Date(issueDate),
      expiryDate: expiryDate ? new Date(expiryDate) : undefined,
      notes,
      currency: currencyCode,
      taxInclusive,
      subtotal: subtotal.toFixed(2),
      taxAmount: taxAmount.toFixed(2),
      total: total.toFixed(2),
      status,
      orderType,
      preorderType: orderType === 'preorder' ? preorderType : undefined,
      depositPct: depositPct ? Number(depositPct) : undefined,
      depositPaid: depositPaid ? Number(depositPaid) : undefined,
      paymentMethod: Number(depositPaid) > 0 ? paymentMethod : undefined,
      paymentReference: Number(depositPaid) > 0 ? paymentReference : undefined,
      expectedArrival: expectedArrival ? new Date(expectedArrival).toISOString() : undefined,
      layByDuration: orderType === 'lay_by' ? layByDuration : undefined,
      items: items.map((item) => ({
        productId: item.productId,
        description: item.description,
        quantity: item.quantity.toString(),
        unitPrice: item.unitPrice.toString(),
        taxRate: item.taxRate.toString(),
        taxTypeId: item.taxTypeId,
        lineTotal: (item.quantity * item.unitPrice).toFixed(2),
      })),
    };

    try {
      let result;
      if (isEditing) {
        result = await updateSalesOrder.mutateAsync({
          id: editId!,
          data: payload,
        });
      } else {
        result = await createSalesOrder.mutateAsync(payload);
      }
      
      if (status === "sent") {
        toast({
          title: "Sales Order Saved & Sent",
          description: "Sales order has been saved and marked as sent.",
        });
      } else {
        toast({
          title: "Sales Order Saved",
          description: "Sales order has been saved successfully.",
        });
      }
      
      setLocation("/sales-orders");
    } catch (e: any) {
      toast({
        title: "Error",
        description: e.message || "Failed to save sales order",
        variant: "destructive",
      });
    }
  };

  return (
    <Layout>
      <div className="mb-6 flex items-center justify-between sticky top-0 md:top-[60px] z-30 bg-background/95 backdrop-blur-sm pb-3 pt-3 -mx-4 px-4 border-b md:border-0 md:static md:mx-0 md:px-0 md:pt-0 md:bg-transparent">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            onClick={() => setLocation("/sales-orders")}
            className="pl-0"
          >
            <ArrowLeft className="w-4 h-4 mr-2" /> Back
          </Button>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => handleSave("draft")}
            disabled={createSalesOrder.isPending || updateSalesOrder.isPending}
          >
            <Save className="w-4 h-4 mr-2" /> Save Draft
          </Button>
          <Button
            variant="outline"
            onClick={() => setShowPreview(true)}
            disabled={!company}
          >
            <Eye className="w-4 h-4 mr-2" /> Preview
          </Button>
          {company && (
            <PDFDownloadLink
              document={
                <InvoicePDF
                  invoice={{
                    invoiceNumber:
                      isEditing && existingSalesOrder
                        ? existingSalesOrder.orderNumber
                        : "PREVIEW",
                    issueDate: new Date(issueDate),
                    expiryDate: expiryDate ? new Date(expiryDate) : undefined,
                    status: "sales_order",
                    items: items.map((i) => ({
                      ...i,
                      lineTotal: (i.quantity * i.unitPrice).toString(),
                      product: { hsCode: i.hsCode || "0000" },
                    })),
                    subtotal: subtotal.toString(),
                    taxAmount: taxAmount.toString(),
                    total: total.toString(),
                    currency: currencyCode,
                    taxInclusive,
                    notes,
                  }}
                  company={company}
                  customer={customers?.find(
                    (c) => c.id.toString() === customerId,
                  )}
                  taxTypes={taxTypes.data}
                />
              }
              fileName={`SalesOrder-${isEditing && existingSalesOrder ? existingSalesOrder.orderNumber : "Draft"}.pdf`}
            >
              {({ blob, url, loading, error }: any) => {
                if (error) {
                  return (
                    <Button
                      variant="outline"
                      disabled
                      className="text-red-500 border-red-200"
                    >
                      <Download className="w-4 h-4 mr-2" /> Error
                    </Button>
                  );
                }
                return (
                  <Button variant="outline" disabled={loading}>
                    <Download className="w-4 h-4 mr-2" />
                    {loading ? "Loading..." : "Download PDF"}
                  </Button>
                );
              }}
            </PDFDownloadLink>
          )}
          <Button
            onClick={() => handleSave("sent")}
            disabled={createSalesOrder.isPending || updateSalesOrder.isPending}
          >
            <Send className="w-4 h-4 mr-2" /> Save & Send
          </Button>
        </div>
      </div>

      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent className="max-w-4xl h-[90vh]">
          <DialogHeader>
            <DialogTitle>SalesOrder Preview</DialogTitle>
          </DialogHeader>
          <div className="flex-1 w-full h-full min-h-[500px]">
            <PDFViewer width="100%" height="100%" className="rounded-lg border">
              <InvoicePDF
                invoice={{
                  invoiceNumber:
                    isEditing && existingSalesOrder
                      ? existingSalesOrder.orderNumber
                      : "PREVIEW",
                  issueDate: new Date(issueDate),
                  expiryDate: expiryDate ? new Date(expiryDate) : undefined,
                  status: "sales_order",
                  items: items.map((i) => ({
                    ...i,
                    lineTotal: (i.quantity * i.unitPrice).toString(),
                    product: { hsCode: i.hsCode || "0000" },
                  })),
                  subtotal: subtotal.toString(),
                  taxAmount: taxAmount.toString(),
                  total: total.toString(),
                  currency: currencyCode,
                  taxInclusive,
                  notes,
                }}
                company={company}
                customer={customers?.find(
                  (c) => c.id.toString() === customerId,
                )}
                taxTypes={taxTypes.data}
              />
            </PDFViewer>
          </div>
        </DialogContent>
      </Dialog>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Sales Order Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Order Type Selector */}
            <Card className="border-slate-200">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">Order Type</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {[
                    { value: 'cash_and_carry', label: 'Cash & Carry', icon: ShoppingCart, color: 'slate' },
                    { value: 'preorder_air', label: 'Air Preorder', icon: Plane, color: 'sky' },
                    { value: 'preorder_sea', label: 'Sea Preorder', icon: Ship, color: 'blue' },
                    { value: 'lay_by', label: 'Lay-by', icon: Clock, color: 'indigo' },
                  ].map(type => (
                    <button key={type.value} onClick={() => { 
                      if (type.value === 'preorder_air') { setOrderType('preorder'); setPreorderType('air'); }
                      else if (type.value === 'preorder_sea') { setOrderType('preorder'); setPreorderType('sea'); }
                      else { setOrderType(type.value); }
                    }} className={cn("flex flex-col items-center gap-2 p-3 rounded-xl border-2 transition-all", 
                      (orderType === type.value || (type.value === 'preorder_air' && orderType === 'preorder' && preorderType === 'air') || (type.value === 'preorder_sea' && orderType === 'preorder' && preorderType === 'sea'))
                        ? "border-blue-500 bg-blue-50" : "border-slate-200 hover:border-slate-300 bg-white")}>
                      <type.icon className="w-5 h-5" />
                      <span className="text-xs font-medium">{type.label}</span>
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>

            {orderType === 'preorder' && (
              <Card className="border-sky-200 bg-sky-50/50">
                <CardContent className="p-4 space-y-4">
                  {(() => {
                    const airMinPct = salesOrderSettings ? parseFloat(salesOrderSettings.airPreorderMinDepositPct) : 50;
                    const seaMinPct = salesOrderSettings ? parseFloat(salesOrderSettings.seaPreorderMinDepositPct) : 30;
                    const minPct = preorderType === 'air' ? airMinPct : seaMinPct;
                    const minAmount = total * (minPct / 100);

                    return (
                      <>
                        <div className="flex items-center gap-2 text-sm text-sky-800">
                          <Info className="w-4 h-4" />
                          <span>{preorderType === 'air' ? `Air Preorders require a minimum ${airMinPct}% deposit.` : `Sea Preorders require a minimum ${seaMinPct}% deposit.`} Minimum required: ${minAmount.toFixed(2)}</span>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label>Deposit Paid ($)</Label>
                            <Input type="number" value={depositPaid} onChange={e => setDepositPaid(e.target.value)} placeholder="0.00" />
                          </div>
                          <div className="space-y-2">
                            <Label>Expected Arrival Date</Label>
                            <Input type="date" value={expectedArrival} onChange={e => setExpectedArrival(e.target.value)} />
                          </div>
                        </div>

                        {Number(depositPaid) > 0 && (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-sky-200">
                            <div className="space-y-2">
                              <Label>Payment Method</Label>
                              <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                                <SelectTrigger><SelectValue placeholder="Select Method" /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="Cash">Cash</SelectItem>
                                  <SelectItem value="Bank Transfer">Bank Transfer</SelectItem>
                                  <SelectItem value="Card">Card</SelectItem>
                                  <SelectItem value="EcoCash">EcoCash / Mobile Money</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-2">
                              <Label>Payment Ref / Note</Label>
                              <Input value={paymentReference} onChange={e => setPaymentReference(e.target.value)} placeholder="Txn Ref, Receipt #..." />
                            </div>
                          </div>
                        )}

                        {Number(depositPaid) < minAmount && Number(depositPaid) > 0 && (
                          <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 p-2 rounded border border-amber-200">
                            <AlertTriangle className="w-4 h-4" />
                            <span>This order will require admin approval because the deposit is below the minimum required ({minPct}%).</span>
                          </div>
                        )}
                      </>
                    );
                  })()}
                </CardContent>
              </Card>
            )}

            {orderType === 'lay_by' && (
              <Card className="border-indigo-200 bg-indigo-50/50">
                <CardContent className="p-4 space-y-4">
                  <div className="space-y-2">
                    <Label>Lay-by Duration</Label>
                    <div className="flex gap-2">
                      <Button type="button" variant={layByDuration === 3 ? "default" : "outline"} onClick={() => setLayByDuration(3)}>3 Months</Button>
                      <Button type="button" variant={layByDuration === 6 ? "default" : "outline"} onClick={() => setLayByDuration(6)}>6 Months</Button>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Deposit Percentage (%)</Label>
                      <Input type="number" value={depositPct} onChange={e => {
                        const pct = parseFloat(e.target.value);
                        setDepositPct(isNaN(pct) ? '' : pct);
                        if (!isNaN(pct)) setDepositPaid((total * (pct / 100)).toFixed(2));
                      }} placeholder="e.g. 20" />
                    </div>
                    <div className="space-y-2">
                      <Label>Deposit Amount Paid ($)</Label>
                      <Input type="number" value={depositPaid} onChange={e => setDepositPaid(e.target.value)} placeholder="0.00" />
                    </div>
                  </div>

                  {Number(depositPaid) > 0 && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-indigo-200">
                      <div className="space-y-2">
                        <Label>Payment Method</Label>
                        <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                          <SelectTrigger><SelectValue placeholder="Select Method" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Cash">Cash</SelectItem>
                            <SelectItem value="Bank Transfer">Bank Transfer</SelectItem>
                            <SelectItem value="Card">Card</SelectItem>
                            <SelectItem value="EcoCash">EcoCash / Mobile Money</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Payment Ref / Note</Label>
                        <Input value={paymentReference} onChange={e => setPaymentReference(e.target.value)} placeholder="Txn Ref, Receipt #..." />
                      </div>
                    </div>
                  )}

                  {total > 0 && layByDuration > 0 && (
                    <div className="text-xs text-indigo-800 bg-indigo-100 p-3 rounded-lg mt-2">
                      <p className="font-semibold mb-1">Payment Schedule Preview</p>
                      <p>Remaining balance: ${(total - Number(depositPaid || 0)).toFixed(2)}</p>
                      <p>Monthly instalment ({layByDuration} months): ${((total - Number(depositPaid || 0)) / layByDuration).toFixed(2)} / month</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Customer</Label>
                <Select value={customerId} onValueChange={setCustomerId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select Customer" />
                  </SelectTrigger>
                  <SelectContent>
                    {customers?.map((c) => (
                      <SelectItem key={c.id} value={c.id.toString()}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Currency</Label>
                <Select value={currencyCode} onValueChange={setCurrencyCode}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {currencies?.map((c) => (
                      <SelectItem key={c.id} value={c.code}>
                        {c.code}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Issue Date</Label>
                <Input
                  type="date"
                  value={issueDate}
                  onChange={(e) => setIssueDate(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Expiry Date</Label>
                <Input
                  type="date"
                  value={expiryDate}
                  onChange={(e) => setExpiryDate(e.target.value)}
                />
              </div>
            </div>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[200px]">Item</TableHead>
                  <TableHead className="w-[140px] text-center">Qty</TableHead>
                  <TableHead className="text-right w-[300px]">Price</TableHead>
                  <TableHead className="text-right w-[100px]">
                    VAT Amt
                  </TableHead>
                  <TableHead className="text-right w-[110px]">Amount</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item, index) => (
                  <TableRow key={item.localId}>
                    <TableCell className="max-w-[200px] align-top">
                      <div className="flex flex-col gap-2">
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button
                              variant="outline"
                              role="combobox"
                              className={cn(
                                "w-full justify-between h-9 px-3 font-medium text-[13px]",
                                !item.productId && "text-muted-foreground",
                              )}
                            >
                              <span className="truncate block w-full text-left">
                                {item.productId
                                  ? products?.find((p) => p.id === item.productId)
                                      ?.name || "Select Product"
                                  : "Select Product"}
                              </span>
                              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-[300px] p-0" align="start">
                            <Command>
                              <CommandInput placeholder="Search products..." />
                              <CommandList>
                                <CommandEmpty>No product found.</CommandEmpty>
                                <CommandGroup>
                                  {products?.map((product) => (
                                    <CommandItem
                                      key={product.id}
                                      value={product.name}
                                      onSelect={() =>
                                        handleProductSelect(
                                          item.localId,
                                          product.id.toString(),
                                        )
                                      }
                                    >
                                      <Check
                                        className={cn(
                                          "mr-2 h-4 w-4",
                                          item.productId === product.id
                                            ? "opacity-100"
                                            : "opacity-0",
                                        )}
                                      />
                                      <div className="flex flex-col">
                                        <span>{product.name}</span>
                                        <span className="text-xs text-muted-foreground">
                                          ${Number(product.price).toFixed(2)}
                                        </span>
                                      </div>
                                    </CommandItem>
                                  ))}
                                </CommandGroup>
                              </CommandList>
                            </Command>
                          </PopoverContent>
                        </Popover>
                        <Input
                          value={item.description}
                          onChange={(e) =>
                            updateItem(
                              item.localId,
                              "description",
                              e.target.value,
                            )
                          }
                          placeholder="Item description..."
                          className="h-8 text-xs"
                        />
                      </div>
                    </TableCell>
                    <TableCell>
                      <QuantityInput
                        type="number"
                        value={item.quantity}
                        onChange={(e) =>
                          updateItem(
                            item.localId,
                            "quantity",
                            parseFloat(e.target.value),
                          )
                        }
                        className="w-full text-center"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        value={item.unitPrice}
                        onChange={(e) =>
                          updateItem(
                            item.localId,
                            "unitPrice",
                            parseFloat(e.target.value),
                          )
                        }
                        className="w-full text-right"
                      />
                    </TableCell>
                    <TableCell className="text-right font-mono  text-slate-500">
                      {(() => {
                        const lineVal = item.quantity * item.unitPrice;
                        const rate = company?.vatRegistered
                          ? Number(item.taxRate)
                          : 0;
                        const vatAmt = taxInclusive
                          ? lineVal - lineVal / (1 + rate / 100)
                          : lineVal * (rate / 100);
                        return vatAmt > 0 ? vatAmt.toFixed(2) : "-";
                      })()}
                    </TableCell>
                    <TableCell className="text-right font-bold font-mono">
                      {(() => {
                        const lineVal = item.quantity * item.unitPrice;
                        const rate = company?.vatRegistered
                          ? Number(item.taxRate)
                          : 0;
                        const total = taxInclusive
                          ? lineVal
                          : lineVal + lineVal * (rate / 100);
                        return total.toFixed(2);
                      })()}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() =>
                          items.length > 1 &&
                          setItems(
                            items.filter((i) => i.localId !== item.localId),
                          )
                        }
                      >
                        <Trash2 className="w-4 h-4 text-red-500" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <Button variant="outline" size="sm" onClick={handleAddItem}>
              <Plus className="w-4 h-4 mr-2" /> Add Item
            </Button>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-center uppercase tracking-wider ">
                Tax Analysis
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex justify-between ">
                <span className="text-slate-500">Total (excl. tax)</span>
                <span>
                  {currencyCode} {subtotal.toFixed(2)}
                </span>
              </div>
              <div className="bg-slate-50 rounded-lg p-3 border border-slate-200 my-4">
                <h4 className="text-[10px] font-bold text-slate-700 uppercase mb-2 text-center">
                  Tax Analysis
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-2 text-[9px] font-bold text-slate-500 uppercase mb-1 border-b border-slate-200 pb-1">
                  <div>Vat %</div>
                  <div className="text-right">Net.Amt</div>
                  <div className="text-right">VAT</div>
                  <div className="text-right">Amount</div>
                </div>
                <div className="space-y-1">
                  {Object.entries(taxBreakdown).map(([key, vals]) => {
                    const mTax = taxTypes.data?.find(
                      (t: any) => t.id == vals.taxTypeId,
                    );
                    const isZeroRated =
                      mTax?.zimraTaxId === "2" ||
                      mTax?.zimraCode === "D" ||
                      mTax?.name?.toLowerCase().includes("zero rated");
                    const isExempt =
                      mTax?.zimraTaxId === "1" ||
                      mTax?.zimraCode === "C" ||
                      mTax?.zimraCode === "E" ||
                      mTax?.name?.toLowerCase().includes("exempt") ||
                      (vals.rate === 0 && !isZeroRated);

                    return (
                      <div
                        key={key}
                        className="grid grid-cols-1 md:grid-cols-4 gap-2 text-[10px] items-center py-1 border-b border-slate-100 last:border-0"
                      >
                        <div className="text-slate-600 truncate">
                          {isExempt
                            ? mTax?.name || "Exempt"
                            : isZeroRated
                              ? "0.00%"
                              : `${vals.rate}%`}
                        </div>
                        <div className="text-right font-mono text-slate-700">
                          {vals.net.toFixed(2)}
                        </div>
                        <div className="text-right font-mono text-slate-700">
                          {isExempt ? "" : vals.tax.toFixed(2)}
                        </div>
                        <div className="text-right font-mono font-bold text-slate-900">
                          {(vals.net + vals.tax).toFixed(2)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="pt-4 border-t flex justify-between font-bold text-lg">
                <span>Total</span>
                <span className="text-primary">
                  {currencyCode} {total.toFixed(2)}
                </span>
              </div>

              <div className="flex items-center gap-2 pt-4">
                <input
                  type="checkbox"
                  id="taxInc"
                  checked={taxInclusive}
                  onChange={(e) => setTaxInclusive(e.target.checked)}
                />
                <Label htmlFor="taxInc" className="text-xs cursor-pointer">
                  Prices are tax inclusive
                </Label>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Notes</CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Terms, conditions, or payment info..."
                rows={5}
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </Layout>
  );
}
