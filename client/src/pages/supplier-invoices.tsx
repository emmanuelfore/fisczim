import { useEffect, useState } from "react";
import { Layout } from "@/components/layout";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Plus, Search, FileText } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCurrency } from "@/lib/utils";
import { useActiveCompany } from "@/hooks/use-active-company";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { type Account, type Supplier } from "@shared/schema";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";

export default function SupplierInvoicesPage() {
  const {
    activeCompany,
    activeCompanyId,
    isLoading: isCompanyLoading,
  } = useActiveCompany();
  const companyId = activeCompanyId || 0;
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [formData, setFormData] = useState({
    supplierId: "",
    invoiceNumber: "",
    date: new Date().toISOString().slice(0, 10),
    dueDate: "",
    totalAmount: "",
    vatRate: activeCompany?.vatRegistered ? "15" : "0",
    taxInclusive: activeCompany?.vatEnabled ?? true,
    taxAmount: "0",
    debitAccountId: "",
    notes: "",
  });

  useEffect(() => {
    if (!activeCompany || formData.totalAmount) return;
    setFormData((previous) => ({
      ...previous,
      vatRate: activeCompany.vatRegistered ? "15" : "0",
      taxInclusive: activeCompany.vatEnabled ?? true,
    }));
  }, [activeCompany, formData.totalAmount]);

  const calculateVatAmount = (
    amountValue: string,
    rateValue: string,
    isInclusive: boolean,
  ) => {
    const amount = Number(amountValue || 0);
    const rate = Number(rateValue || 0);
    if (amount <= 0 || rate <= 0) return "0.00";
    const vat = isInclusive
      ? amount - amount / (1 + rate / 100)
      : amount * (rate / 100);
    return vat.toFixed(2);
  };

  const updateVatFields = (changes: Partial<typeof formData>) => {
    setFormData((previous) => {
      const next = { ...previous, ...changes };
      return {
        ...next,
        taxAmount: calculateVatAmount(
          next.totalAmount,
          next.vatRate,
          next.taxInclusive,
        ),
      };
    });
  };

  const { data: invoices, isLoading } = useQuery<any[]>({
    queryKey: [`/api/companies/${companyId}/supplier-invoices`],
    enabled: !!companyId,
  });

  const { data: suppliers = [] } = useQuery<Supplier[]>({
    queryKey: [`/api/companies/${companyId}/suppliers`],
    enabled: !!companyId,
  });

  const { data: accounts = [] } = useQuery<Account[]>({
    queryKey: ["/api/accounting/accounts", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const res = await apiFetch(
        `/api/companies/${companyId}/accounting/accounts`,
      );
      if (!res.ok) throw new Error("Failed to load accounts");
      return res.json();
    },
  });

  const expenseAccounts = accounts.filter(
    (account) =>
      ["ASSET", "EXPENSE"].includes(account.type) && account.isActive,
  );

  const resetForm = () => {
    setFormData({
      supplierId: "",
      invoiceNumber: "",
      date: new Date().toISOString().slice(0, 10),
      dueDate: "",
      totalAmount: "",
      vatRate: activeCompany?.vatRegistered ? "15" : "0",
      taxInclusive: activeCompany?.vatEnabled ?? true,
      taxAmount: "0",
      debitAccountId: "",
      notes: "",
    });
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!companyId) throw new Error("No company selected");
      if (!formData.supplierId) throw new Error("Select a supplier");
      if (!formData.invoiceNumber.trim())
        throw new Error("Enter the supplier invoice number");
      const amount = Number(formData.totalAmount || 0);
      const tax = Number(formData.taxAmount || 0);
      const total = formData.taxInclusive ? amount : amount + tax;
      const subtotal = formData.taxInclusive ? total - tax : amount;
      if (total <= 0) throw new Error("Total amount must be greater than zero");
      if (tax < 0 || tax > total)
        throw new Error("Tax amount cannot exceed the total");

      const res = await apiFetch(
        `/api/companies/${companyId}/supplier-invoices`,
        {
          method: "POST",
          body: JSON.stringify({
            supplierId: Number(formData.supplierId),
            invoiceNumber: formData.invoiceNumber.trim(),
            date: new Date(formData.date).toISOString(),
            dueDate: formData.dueDate
              ? new Date(formData.dueDate).toISOString()
              : null,
            totalAmount: total.toFixed(2),
            taxAmount: tax.toFixed(2),
            currency: activeCompany?.currency || "USD",
            debitAccountId: formData.debitAccountId
              ? Number(formData.debitAccountId)
              : undefined,
            notes: formData.notes || undefined,
            status: "unpaid",
            items: [
              {
                description:
                  formData.notes ||
                  `Supplier bill ${formData.invoiceNumber.trim()}`,
                quantity: "1",
                unitPrice: subtotal.toFixed(2),
                totalPrice: subtotal.toFixed(2),
                taxRate: Number(formData.vatRate || 0).toFixed(2),
                taxAmount: tax.toFixed(2),
              },
            ],
          }),
        },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: res.statusText }));
        throw new Error(err.message || "Failed to create supplier bill");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [`/api/companies/${companyId}/supplier-invoices`],
      });
      queryClient.invalidateQueries({ queryKey: ["/api/accounting/ledger"] });
      toast({
        title: "Supplier bill created",
        description: "The payable and ledger entry were posted.",
      });
      setIsDialogOpen(false);
      resetForm();
    },
    onError: (error: any) => {
      toast({
        title: "Could not create bill",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const filteredInvoices = invoices?.filter(
    (inv) =>
      inv.invoiceNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (inv.supplier?.name || "")
        .toLowerCase()
        .includes(searchTerm.toLowerCase()),
  );

  const enteredAmount = Number(formData.totalAmount || 0);
  const formTax = Number(formData.taxAmount || 0);
  const formSubtotal = formData.taxInclusive
    ? Math.max(enteredAmount - formTax, 0)
    : enteredAmount;
  const formTotal = formData.taxInclusive
    ? enteredAmount
    : enteredAmount + formTax;

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
              <Search className="h-5 w-5" />
            </div>
            <div className="relative group min-w-[320px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 group-focus-within:text-primary transition-colors" />
              <Input
                placeholder="Search by invoice number or supplier..."
                className="pl-9 h-11 bg-white border-slate-200 rounded-xl shadow-sm focus:ring-primary/20"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button
                disabled={!companyId}
                className="h-11 px-6 rounded-xl font-bold bg-primary hover:bg-primary/90 text-white shadow-lg shadow-primary/20 transition-all active:scale-95 flex items-center gap-2"
              >
                <Plus className="h-4 w-4" />
                <span>Create Bill</span>
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[520px] max-h-[88vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Create Supplier Bill</DialogTitle>
              </DialogHeader>
              <form
                className="grid gap-3 pt-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  createMutation.mutate();
                }}
              >
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Supplier</Label>
                    <Select
                      value={formData.supplierId}
                      onValueChange={(value) =>
                        setFormData((p) => ({ ...p, supplierId: value }))
                      }
                    >
                      <SelectTrigger className="h-9">
                        <SelectValue placeholder="Select supplier" />
                      </SelectTrigger>
                      <SelectContent>
                        {suppliers.map((supplier) => (
                          <SelectItem
                            key={supplier.id}
                            value={String(supplier.id)}
                          >
                            {supplier.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Invoice Number</Label>
                    <Input
                      className="h-9"
                      value={formData.invoiceNumber}
                      onChange={(e) =>
                        setFormData((p) => ({
                          ...p,
                          invoiceNumber: e.target.value,
                        }))
                      }
                      placeholder="Supplier invoice #"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Bill Date</Label>
                    <Input
                      className="h-9"
                      type="date"
                      value={formData.date}
                      onChange={(e) =>
                        setFormData((p) => ({ ...p, date: e.target.value }))
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Due Date</Label>
                    <Input
                      className="h-9"
                      type="date"
                      value={formData.dueDate}
                      onChange={(e) =>
                        setFormData((p) => ({ ...p, dueDate: e.target.value }))
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">
                      {formData.taxInclusive
                        ? "Total Including VAT"
                        : "Subtotal Before VAT"}
                    </Label>
                    <Input
                      className="h-9"
                      type="number"
                      min="0"
                      step="0.01"
                      value={formData.totalAmount}
                      onChange={(e) =>
                        updateVatFields({ totalAmount: e.target.value })
                      }
                      placeholder="0.00"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">VAT Rate %</Label>
                    <Input
                      className="h-9"
                      type="number"
                      min="0"
                      step="0.01"
                      value={formData.vatRate}
                      onChange={(e) =>
                        updateVatFields({ vatRate: e.target.value })
                      }
                      placeholder="15"
                    />
                  </div>
                </div>
                <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5">
                  <Label
                    htmlFor="supplier-vat-inclusive"
                    className="text-xs font-medium"
                  >
                    Amounts include VAT
                  </Label>
                  <Switch
                    id="supplier-vat-inclusive"
                    checked={formData.taxInclusive}
                    onCheckedChange={(checked) =>
                      updateVatFields({ taxInclusive: checked })
                    }
                  />
                </div>
                <div className="grid grid-cols-3 gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2">
                  <div className="space-y-0.5">
                    <p className="text-[10px] font-bold uppercase text-slate-500">
                      Subtotal
                    </p>
                    <p className="font-mono  font-bold">
                      {formatCurrency(
                        formSubtotal,
                        activeCompany?.currency || "USD",
                      )}
                    </p>
                  </div>
                  <div className="space-y-0.5">
                    <p className="text-[10px] font-bold uppercase text-slate-500">
                      VAT
                    </p>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={formData.taxAmount}
                      onChange={(e) =>
                        setFormData((p) => ({
                          ...p,
                          taxAmount: e.target.value,
                        }))
                      }
                      className="h-7 px-2 font-mono  font-bold bg-white"
                    />
                  </div>
                  <div className="space-y-0.5">
                    <p className="text-[10px] font-bold uppercase text-slate-500">
                      Bill Total
                    </p>
                    <p className="font-mono  font-bold">
                      {formatCurrency(
                        formTotal,
                        activeCompany?.currency || "USD",
                      )}
                    </p>
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Debit Account</Label>
                  <Select
                    value={formData.debitAccountId}
                    onValueChange={(value) =>
                      setFormData((p) => ({ ...p, debitAccountId: value }))
                    }
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Use configured inventory/default account" />
                    </SelectTrigger>
                    <SelectContent>
                      {expenseAccounts.map((account) => (
                        <SelectItem key={account.id} value={String(account.id)}>
                          {account.code} - {account.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Notes</Label>
                  <Textarea
                    className="min-h-[64px]"
                    value={formData.notes}
                    onChange={(e) =>
                      setFormData((p) => ({ ...p, notes: e.target.value }))
                    }
                    placeholder="What was this bill for?"
                  />
                </div>
                <div className="flex justify-end gap-2 pt-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setIsDialogOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    size="sm"
                    disabled={createMutation.isPending || isCompanyLoading}
                  >
                    {createMutation.isPending ? "Creating..." : "Create Bill"}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <Card className="border-slate-200/60 shadow-sm overflow-hidden rounded-2xl">
          <CardHeader className="bg-white border-b border-slate-100 px-6 py-5">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg font-bold text-slate-800 font-display">
                Supplier Invoices (Accounts Payable)
              </CardTitle>
              <Badge
                variant="outline"
                className="bg-slate-50 text-slate-500 font-bold border-slate-200 px-3 py-1 rounded-lg"
              >
                {filteredInvoices?.length || 0} Invoices
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader className="bg-slate-50/50">
                <TableRow className="hover:bg-transparent border-slate-100">
                  <TableHead className="w-[120px] font-bold text-slate-500 uppercase text-[11px] tracking-wider pl-6">
                    Invoice #
                  </TableHead>
                  <TableHead className="font-bold text-slate-500 uppercase text-[11px] tracking-wider">
                    Date
                  </TableHead>
                  <TableHead className="font-bold text-slate-500 uppercase text-[11px] tracking-wider">
                    Supplier
                  </TableHead>
                  <TableHead className="font-bold text-slate-500 uppercase text-[11px] tracking-wider">
                    Status
                  </TableHead>
                  <TableHead className="text-right font-bold text-slate-500 uppercase text-[11px] tracking-wider">
                    Subtotal
                  </TableHead>
                  <TableHead className="text-right font-bold text-slate-500 uppercase text-[11px] tracking-wider">
                    VAT
                  </TableHead>
                  <TableHead className="text-right pr-6 font-bold text-slate-500 uppercase text-[11px] tracking-wider">
                    Total Amount
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i} className="animate-pulse border-slate-50">
                      <TableCell colSpan={7} className="h-16 bg-slate-50/20" />
                    </TableRow>
                  ))
                ) : filteredInvoices?.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={7}
                      className="h-32 text-center text-slate-400 font-medium"
                    >
                      No supplier invoices found.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredInvoices?.map((invoice) => (
                    <TableRow
                      key={invoice.id}
                      className="hover:bg-slate-50/50 border-slate-50 transition-colors group"
                    >
                      <TableCell className="font-bold text-slate-900 pl-6 group-hover:text-primary transition-colors flex items-center gap-2">
                        <FileText className="w-4 h-4 text-slate-400" />
                        {invoice.invoiceNumber}
                      </TableCell>
                      <TableCell className="text-slate-600 font-medium ">
                        {format(new Date(invoice.date), "dd MMM yyyy")}
                      </TableCell>
                      <TableCell className="font-bold text-slate-700">
                        {invoice.supplier?.name || "Unknown"}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={
                            invoice.status === "paid"
                              ? "bg-emerald-50 text-emerald-600 border-emerald-100"
                              : invoice.status === "partial"
                                ? "bg-amber-50 text-amber-600 border-amber-100"
                                : "bg-rose-50 text-rose-600 border-rose-100"
                          }
                        >
                          {invoice.status.toUpperCase()}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono text-slate-700">
                        {formatCurrency(
                          Number(invoice.totalAmount || 0) -
                            Number(invoice.taxAmount || 0),
                          invoice.currency,
                        )}
                      </TableCell>
                      <TableCell className="text-right font-mono text-slate-700">
                        {formatCurrency(
                          Number(invoice.taxAmount || 0),
                          invoice.currency,
                        )}
                      </TableCell>
                      <TableCell className="text-right pr-6 font-bold text-slate-900">
                        {formatCurrency(
                          Number(invoice.totalAmount),
                          invoice.currency,
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
