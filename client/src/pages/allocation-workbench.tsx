import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useActiveCompany } from "@/hooks/use-active-company";
import { useCustomers } from "@/hooks/use-customers";
import { useInvoices } from "@/hooks/use-invoices";
import { useSuppliers } from "@/hooks/use-suppliers";
import { useToast } from "@/hooks/use-toast";
import { apiFetch } from "@/lib/api";
import { apiRequest } from "@/lib/queryClient";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Banknote, Send } from "lucide-react";
import { useMemo, useState } from "react";
import type { Dispatch, SetStateAction } from "react";

type Allocation = { documentId: number; amount: string };

export default function AllocationWorkbenchPage() {
  const { activeCompanyId } = useActiveCompany();
  const companyId = activeCompanyId || 0;
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: customers = [] } = useCustomers(companyId);
  const { data: suppliers = [] } = useSuppliers(companyId);
  const { data: invoicesResult } = useInvoices(companyId, { limit: 500 });
  const { data: supplierBills = [] } = useQuery<any[]>({
    queryKey: ["/api/companies", companyId, "supplier-invoices"],
    queryFn: async () => {
      const res = await apiFetch(
        `/api/companies/${companyId}/supplier-invoices`,
      );
      if (!res.ok) throw new Error("Failed to fetch supplier bills");
      return res.json();
    },
    enabled: !!companyId,
  });

  const invoices = Array.isArray(invoicesResult)
    ? invoicesResult
    : (invoicesResult as any)?.invoices || [];
  const [customerId, setCustomerId] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [receipt, setReceipt] = useState({
    amount: "",
    date: format(new Date(), "yyyy-MM-dd"),
    reference: "",
    method: "Bank",
  });
  const [payment, setPayment] = useState({
    amount: "",
    date: format(new Date(), "yyyy-MM-dd"),
    reference: "",
    method: "Bank",
  });
  const [customerAllocations, setCustomerAllocations] = useState<
    Record<number, string>
  >({});
  const [supplierAllocations, setSupplierAllocations] = useState<
    Record<number, string>
  >({});

  const customerOpenInvoices = useMemo(
    () =>
      invoices.filter(
        (invoice: any) =>
          Number(invoice.customerId) === Number(customerId) &&
          !["paid", "cancelled"].includes(String(invoice.status)) &&
          Number(invoice.total || 0) - Number(invoice.paidAmount || 0) > 0.005,
      ),
    [invoices, customerId],
  );

  const supplierOpenBills = useMemo(
    () =>
      supplierBills.filter(
        (bill: any) =>
          Number(bill.supplierId) === Number(supplierId) &&
          !["paid", "cancelled"].includes(String(bill.status)) &&
          Number(bill.totalAmount || 0) - Number(bill.paidAmount || 0) > 0.005,
      ),
    [supplierBills, supplierId],
  );

  const allocatedCustomer = Object.values(customerAllocations).reduce(
    (sum, value) => sum + Number(value || 0),
    0,
  );
  const allocatedSupplier = Object.values(supplierAllocations).reduce(
    (sum, value) => sum + Number(value || 0),
    0,
  );

  const customerMutation = useMutation({
    mutationFn: async () => {
      const allocations: Allocation[] = Object.entries(customerAllocations)
        .filter(([, amount]) => Number(amount || 0) > 0)
        .map(([documentId, amount]) => ({
          documentId: Number(documentId),
          amount,
        }));
      const res = await apiRequest(
        "POST",
        "/api/accounting/receipts/customer",
        {
          customerId: Number(customerId),
          amount: Number(receipt.amount),
          paymentDate: receipt.date,
          paymentMethod: receipt.method,
          reference: receipt.reference,
          allocations: allocations.map((row) => ({
            invoiceId: row.documentId,
            amount: Number(row.amount),
          })),
        },
      );
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Customer receipt posted",
        description: `Unallocated balance: ${Number(data.unallocatedAmount || 0).toFixed(2)}`,
      });
      setCustomerAllocations({});
      queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
    },
    onError: (error: any) =>
      toast({
        title: "Could not post receipt",
        description: error.message,
        variant: "destructive",
      }),
  });

  const supplierMutation = useMutation({
    mutationFn: async () => {
      const allocations: Allocation[] = Object.entries(supplierAllocations)
        .filter(([, amount]) => Number(amount || 0) > 0)
        .map(([documentId, amount]) => ({
          documentId: Number(documentId),
          amount,
        }));
      const res = await apiRequest(
        "POST",
        "/api/accounting/payments/supplier",
        {
          supplierId: Number(supplierId),
          amount: Number(payment.amount),
          paymentDate: payment.date,
          method: payment.method,
          reference: payment.reference,
          allocations: allocations.map((row) => ({
            supplierInvoiceId: row.documentId,
            amount: Number(row.amount),
          })),
        },
      );
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Supplier payment posted",
        description: `Unallocated balance: ${Number(data.unallocatedAmount || 0).toFixed(2)}`,
      });
      setSupplierAllocations({});
      queryClient.invalidateQueries({
        queryKey: ["/api/companies", companyId, "supplier-invoices"],
      });
    },
    onError: (error: any) =>
      toast({
        title: "Could not post supplier payment",
        description: error.message,
        variant: "destructive",
      }),
  });

  return (
    <Layout hideHeaderTitle>
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 font-display">
            Payment Allocation
          </h2>
          <p className=" text-slate-500">
            Allocate one receipt or payment across multiple documents and leave
            overpayments unallocated.
          </p>
        </div>

        <Tabs defaultValue="customer">
          <TabsList>
            <TabsTrigger value="customer">Customer Receipts</TabsTrigger>
            <TabsTrigger value="supplier">Supplier Payments</TabsTrigger>
          </TabsList>

          <TabsContent value="customer" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Banknote className="h-5 w-5" /> Customer Receipt
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3 md:grid-cols-5">
                  <div className="space-y-2 md:col-span-2">
                    <Label>Customer</Label>
                    <Select value={customerId} onValueChange={setCustomerId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select customer" />
                      </SelectTrigger>
                      <SelectContent>
                        {customers.map((c: any) => (
                          <SelectItem key={c.id} value={String(c.id)}>
                            {c.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Amount</Label>
                    <Input
                      value={receipt.amount}
                      onChange={(e) =>
                        setReceipt({ ...receipt, amount: e.target.value })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Date</Label>
                    <Input
                      type="date"
                      value={receipt.date}
                      onChange={(e) =>
                        setReceipt({ ...receipt, date: e.target.value })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Reference</Label>
                    <Input
                      value={receipt.reference}
                      onChange={(e) =>
                        setReceipt({ ...receipt, reference: e.target.value })
                      }
                    />
                  </div>
                </div>
                <AllocationTable
                  rows={customerOpenInvoices}
                  idKey="id"
                  numberKey="invoiceNumber"
                  dateKey="dueDate"
                  totalKey="total"
                  paidKey="paidAmount"
                  allocations={customerAllocations}
                  setAllocations={setCustomerAllocations}
                />
                <Summary
                  amount={Number(receipt.amount || 0)}
                  allocated={allocatedCustomer}
                />
                <Button
                  disabled={
                    !customerId || !receipt.amount || customerMutation.isPending
                  }
                  onClick={() => customerMutation.mutate()}
                >
                  <Send className="mr-2 h-4 w-4" /> Post Receipt
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="supplier" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Banknote className="h-5 w-5" /> Supplier Payment
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3 md:grid-cols-5">
                  <div className="space-y-2 md:col-span-2">
                    <Label>Supplier</Label>
                    <Select value={supplierId} onValueChange={setSupplierId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select supplier" />
                      </SelectTrigger>
                      <SelectContent>
                        {suppliers.map((s: any) => (
                          <SelectItem key={s.id} value={String(s.id)}>
                            {s.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Amount</Label>
                    <Input
                      value={payment.amount}
                      onChange={(e) =>
                        setPayment({ ...payment, amount: e.target.value })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Date</Label>
                    <Input
                      type="date"
                      value={payment.date}
                      onChange={(e) =>
                        setPayment({ ...payment, date: e.target.value })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Reference</Label>
                    <Input
                      value={payment.reference}
                      onChange={(e) =>
                        setPayment({ ...payment, reference: e.target.value })
                      }
                    />
                  </div>
                </div>
                <AllocationTable
                  rows={supplierOpenBills}
                  idKey="id"
                  numberKey="invoiceNumber"
                  dateKey="dueDate"
                  totalKey="totalAmount"
                  paidKey="paidAmount"
                  allocations={supplierAllocations}
                  setAllocations={setSupplierAllocations}
                />
                <Summary
                  amount={Number(payment.amount || 0)}
                  allocated={allocatedSupplier}
                />
                <Button
                  disabled={
                    !supplierId || !payment.amount || supplierMutation.isPending
                  }
                  onClick={() => supplierMutation.mutate()}
                >
                  <Send className="mr-2 h-4 w-4" /> Post Payment
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}

function AllocationTable({
  rows,
  idKey,
  numberKey,
  dateKey,
  totalKey,
  paidKey,
  allocations,
  setAllocations,
}: {
  rows: any[];
  idKey: string;
  numberKey: string;
  dateKey: string;
  totalKey: string;
  paidKey: string;
  allocations: Record<number, string>;
  setAllocations: Dispatch<SetStateAction<Record<number, string>>>;
}) {
  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Document</TableHead>
            <TableHead>Due</TableHead>
            <TableHead className="text-right">Outstanding</TableHead>
            <TableHead className="w-40 text-right">Allocate</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={4}
                className="h-24 text-center text-slate-500"
              >
                No open documents for this account.
              </TableCell>
            </TableRow>
          ) : (
            rows.map((row) => {
              const id = Number(row[idKey]);
              const outstanding =
                Number(row[totalKey] || 0) - Number(row[paidKey] || 0);
              return (
                <TableRow key={id}>
                  <TableCell className="font-medium">
                    {row[numberKey]}
                  </TableCell>
                  <TableCell>
                    {row[dateKey]
                      ? format(new Date(row[dateKey]), "dd MMM yyyy")
                      : "-"}
                  </TableCell>
                  <TableCell className="text-right">
                    {outstanding.toFixed(2)}
                  </TableCell>
                  <TableCell>
                    <Input
                      className="text-right"
                      value={allocations[id] || ""}
                      onChange={(e) =>
                        setAllocations((current) => ({
                          ...current,
                          [id]: e.target.value,
                        }))
                      }
                    />
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
    </div>
  );
}

function Summary({ amount, allocated }: { amount: number; allocated: number }) {
  return (
    <div className="flex flex-wrap gap-4 rounded-lg bg-slate-50 p-3 ">
      <span>
        <strong>Amount:</strong> {amount.toFixed(2)}
      </span>
      <span>
        <strong>Allocated:</strong> {allocated.toFixed(2)}
      </span>
      <span>
        <strong>Unallocated:</strong> {(amount - allocated).toFixed(2)}
      </span>
    </div>
  );
}
