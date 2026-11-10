import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCreateEnquiryQuotation, type EnquiryRecord, type QuotationLine } from "@/hooks/use-crm";
import { useToast } from "@/hooks/use-toast";
import { formatCurrencyAmount } from "@shared/currency";
import { amount } from "@/lib/crm";
import { Plus, Trash2 } from "lucide-react";

const emptyLine = (): QuotationLine => ({ description: "", quantity: 1, unitPrice: 0, taxRate: 0 });

/**
 * Closes the loop the board's "Won" column is supposed to start: the enquiry
 * becomes a draft quotation in the existing quotations module, linked back to
 * the enquiry and to a customer record the server creates if none exists.
 */
export function QuotationFromEnquiryDialog({
  companyId,
  enquiry,
  currency,
  open,
  onOpenChange,
}: {
  companyId: number;
  enquiry: EnquiryRecord | null;
  currency?: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { toast } = useToast();
  const createQuotation = useCreateEnquiryQuotation(companyId);
  const [lines, setLines] = useState<QuotationLine[]>([emptyLine()]);

  const totals = useMemo(() => {
    const subtotal = lines.reduce((sum, l) => sum + amount(l.quantity) * amount(l.unitPrice), 0);
    const tax = lines.reduce((sum, l) => sum + (amount(l.quantity) * amount(l.unitPrice) * amount(l.taxRate)) / 100, 0);
    return { subtotal, tax, total: subtotal + tax };
  }, [lines]);

  const setLine = (index: number, patch: Partial<QuotationLine>) =>
    setLines((prev) => prev.map((l, i) => (i === index ? { ...l, ...patch } : l)));

  const usable = lines.filter((l) => l.description.trim());

  const submit = () => {
    if (!enquiry) return;
    if (!usable.length) {
      toast({ title: "Add at least one line with a description", variant: "destructive" });
      return;
    }
    createQuotation.mutate(
      { id: enquiry.id, items: usable },
      {
        onSuccess: (created: any) => {
          toast({
            title: `Quotation ${created?.quotationNumber || ""}`.trim(),
            description: "Draft raised and linked to this enquiry.",
          });
          setLines([emptyLine()]);
          onOpenChange(false);
        },
        onError: (err: Error) => toast({ title: err.message, variant: "destructive" }),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>New quotation</DialogTitle>
          <DialogDescription>
            {enquiry?.name} · the draft lands in Quotations with this enquiry attached.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid grid-cols-[1fr_70px_110px_80px_36px] gap-2 text-xs font-medium text-slate-500">
            <span>Description</span>
            <span>Qty</span>
            <span>Unit price</span>
            <span>Tax %</span>
            <span />
          </div>

          {lines.map((line, index) => (
            <div key={index} className="grid grid-cols-[1fr_70px_110px_80px_36px] items-center gap-2">
              <Input
                value={line.description}
                onChange={(e) => setLine(index, { description: e.target.value })}
                placeholder="e.g. Freight to Beitbridge"
                className="h-9"
              />
              <Input
                type="number"
                value={line.quantity}
                onChange={(e) => setLine(index, { quantity: Number(e.target.value) })}
                className="h-9"
              />
              <Input
                type="number"
                value={line.unitPrice}
                onChange={(e) => setLine(index, { unitPrice: Number(e.target.value) })}
                className="h-9"
              />
              <Input
                type="number"
                value={line.taxRate}
                onChange={(e) => setLine(index, { taxRate: Number(e.target.value) })}
                className="h-9"
              />
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 text-slate-400"
                onClick={() => setLines((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== index) : prev))}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}

          <Button variant="outline" size="sm" onClick={() => setLines((prev) => [...prev, emptyLine()])}>
            <Plus className="mr-1.5 h-3.5 w-3.5" /> Add line
          </Button>

          <div className="flex items-center justify-between border-t border-slate-100 pt-3 text-sm">
            <div className="space-y-0.5 text-slate-500">
              <div>Subtotal {formatCurrencyAmount(totals.subtotal, currency)}</div>
              <div>Tax {formatCurrencyAmount(totals.tax, currency)}</div>
            </div>
            <div className="text-lg font-bold text-slate-900">{formatCurrencyAmount(totals.total, currency)}</div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={createQuotation.isPending}>
            {createQuotation.isPending ? "Raising..." : "Raise quotation"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
