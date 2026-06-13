import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useQueryClient } from "@tanstack/react-query";
import { useCompany } from "@/hooks/use-companies";
import { useCustomers } from "@/hooks/use-customers";
import { useSuppliers } from "@/hooks/use-suppliers";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Loader2 } from "lucide-react";
import { PaymentReceipt } from "./payment-receipt";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

const formSchema = z.object({
  amount: z.string().refine((val) => !isNaN(Number(val)) && Number(val) > 0, {
    message: "Amount must be a positive number",
  }),
  paymentMethod: z.string().min(1, "Payment method is required"),
  reference: z.string().optional(),
  notes: z.string().optional(),
});

interface PaymentModalProps {
  invoice: any;
  remainingBalance: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  type?: "customer" | "supplier";
}

export function PaymentModal({
  invoice,
  remainingBalance,
  open,
  onOpenChange,
  type = "customer",
}: PaymentModalProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const companyId = parseInt(localStorage.getItem("selectedCompanyId") || "0");
  const { data: company } = useCompany(companyId);
  const { data: customers } = useCustomers(companyId);
  const { data: suppliers } = useSuppliers(companyId);
  const customer = type === "customer"
    ? customers?.find((c: any) => c.id === invoice?.customerId)
    : suppliers?.find((s: any) => s.id === invoice?.supplierId);

  const [receiptData, setReceiptData] = useState<any | null>(null);
  const [showReceipt, setShowReceipt] = useState(false);
  const [isPosting, setIsPosting] = useState(false);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      amount: remainingBalance.toFixed(2),
      paymentMethod: "CASH",
      reference: "",
      notes: "",
    },
  });

  useEffect(() => {
    if (open) {
      form.reset({
        amount: remainingBalance.toFixed(2),
        paymentMethod: "CASH",
        reference: "",
        notes: "",
      });
    }
  }, [open, remainingBalance, form]);

  async function onSubmit(values: z.infer<typeof formSchema>) {
    const amount = Number(values.amount);
    const allocationAmount = Math.min(amount, remainingBalance);
    try {
      setIsPosting(true);
      const isSupplier = type === "supplier";
      const url = isSupplier
        ? "/api/accounting/payments/supplier"
        : "/api/accounting/receipts/customer";

      const payload = isSupplier
        ? {
            supplierId: invoice.supplierId,
            amount,
            currency: invoice.currency || "USD",
            paymentDate: new Date().toISOString(),
            method: values.paymentMethod === "CARD" ? "Card" : values.paymentMethod === "ECOCASH" ? "EcoCash" : values.paymentMethod === "BANK_TRANSFER" ? "Bank" : "Cash",
            reference: values.reference,
            notes: values.notes,
            allocations:
              allocationAmount > 0
                ? [{ supplierInvoiceId: invoice.id, amount: allocationAmount }]
                : [],
          }
        : {
            customerId: invoice.customerId,
            amount,
            currency: invoice.currency || "USD",
            paymentDate: new Date().toISOString(),
            paymentMethod: values.paymentMethod,
            reference: values.reference,
            notes: values.notes,
            allocations:
              allocationAmount > 0
                ? [{ invoiceId: invoice.id, amount: allocationAmount }]
                : [],
          };

      const response = await apiRequest("POST", url, payload);
      const result = await response.json();

      if (isSupplier) {
        toast({
          title: "Payment recorded",
          description: "The payment was successfully recorded for the supplier.",
        });
        queryClient.invalidateQueries({
          queryKey: [`/api/companies/${companyId}/supplier-invoices/${invoice.id}`],
        });
        queryClient.invalidateQueries({
          queryKey: [`/api/companies/${companyId}/supplier-invoices`],
        });
      } else {
        const payment = result.receipt;
        const unallocatedAmount = Number(result.unallocatedAmount || 0);
        toast({
          title:
            unallocatedAmount > 0
              ? "Payment recorded with overpayment"
              : "Payment allocated",
          description:
            unallocatedAmount > 0
              ? `${invoice.currency || "USD"} ${unallocatedAmount.toFixed(2)} remains unallocated on the customer account.`
              : "The receipt was allocated to this invoice.",
        });
        queryClient.invalidateQueries({
          queryKey: ["/api/invoices", invoice.id, "payment-summary"],
        });
        queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
      }

      // Store payment data for receipt, then close form and show receipt
      if (!isSupplier) {
        const payment = result.receipt;
        setReceiptData({
          ...values,
          amount: values.amount,
          currency: invoice.currency || "USD",
          createdAt: (payment as any)?.createdAt || new Date().toISOString(),
        });
      }
      onOpenChange(false);
      form.reset();
      if (!isSupplier) {
        setShowReceipt(true);
      }
    } catch (error: any) {
      toast({
        title: "Could not record payment",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsPosting(false);
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Record Payment</DialogTitle>
            <DialogDescription>
              Add a receipt for Invoice #{invoice.invoiceNumber}. Overpayments
              stay unallocated on the customer account. Remaining Balance:{" "}
              {invoice.currency} {remainingBalance.toFixed(2)}
            </DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="amount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Amount ({invoice.currency})</FormLabel>
                    <FormControl>
                      <Input {...field} type="number" step="0.01" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="paymentMethod"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Payment Method</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select method" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="CASH">Cash</SelectItem>
                        <SelectItem value="CARD">Card / Swipe</SelectItem>
                        <SelectItem value="ECOCASH">
                          EcoCash / Mobile
                        </SelectItem>
                        <SelectItem value="BANK_TRANSFER">
                          Bank Transfer
                        </SelectItem>
                        <SelectItem value="OTHER">Other</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="reference"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Reference (Optional)</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="e.g. Transaction ID, Check #"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notes (Optional)</FormLabel>
                    <FormControl>
                      <Textarea
                        {...field}
                        placeholder="Any additional details..."
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={isPosting}>
                  {isPosting && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  Record & Allocate
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {receiptData && (
        <PaymentReceipt
          open={showReceipt}
          onClose={() => {
            setShowReceipt(false);
            setReceiptData(null);
          }}
          payment={receiptData}
          invoice={invoice}
          company={company}
          customer={customer}
        />
      )}
    </>
  );
}
