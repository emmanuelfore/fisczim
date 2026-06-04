import { Layout } from "@/components/layout";
import { PageHeader } from "@/components/page-header";
import { useActiveCompany } from "@/hooks/use-active-company";
import {
  GdnListItem,
  useConfirmGdn,
  useGrvs,
  usePendingGdns,
} from "@/hooks/use-grvs";
import { useProducts } from "@/hooks/use-products";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  Search,
  ChevronLeft,
  ChevronRight,
  Truck,
  FileText,
  Download,
  ClipboardCheck,
  Clock,
  CheckCircle2,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { format } from "date-fns";
import { GrnForm } from "@/components/inventory/grn-form";

const ITEMS_PER_PAGE = 15;

export default function InventoryAccountPage() {
  const { activeCompanyId } = useActiveCompany();
  const companyId = activeCompanyId || 0;
  const { data: grvs, isLoading } = useGrvs(companyId);
  const { data: pendingGdns = [], isLoading: loadingGdns } =
    usePendingGdns(companyId);

  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  const filtered = useMemo(() => {
    const q = searchTerm.toLowerCase().trim();
    if (!q) return grvs || [];
    return (grvs || []).filter(
      (g) =>
        g.grvNumber.toLowerCase().includes(q) ||
        (g.supplierName || "").toLowerCase().includes(q) ||
        (g.notes || "").toLowerCase().includes(q),
    );
  }, [grvs, searchTerm]);

  const totalPages = Math.ceil((filtered.length || 0) / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const rows = filtered.slice(startIndex, startIndex + ITEMS_PER_PAGE);

  return (
    <Layout>
      <PageHeader
        title="Goods Received"
        subtitle="Review pending GDNs and manage confirmed GRV stock documents"
        actions={<GrnForm />}
      />

      <PendingGdnSection
        companyId={companyId}
        gdns={pendingGdns}
        isLoading={loadingGdns}
      />

      <div className="flex flex-col md:flex-row gap-4 mb-6">
        <div className="relative flex-1 w-full sm:max-w-sm group">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400 group-hover:text-violet-500 transition-colors" />
          <Input
            placeholder="Search GRV number or supplier..."
            className="pl-12 h-12 rounded-xl border-slate-200 bg-white shadow-sm focus:ring-violet-500/20 focus:border-violet-500 font-medium transition-all"
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setCurrentPage(1);
            }}
          />
        </div>
      </div>

      <Card className="border-none shadow-xl shadow-slate-200/50 bg-white/80 backdrop-blur-sm rounded-[2rem] overflow-hidden ring-1 ring-slate-100">
        <CardContent className="p-0 overflow-x-hidden">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-100">
                <th className="p-5 font-black text-slate-400 uppercase tracking-widest text-[10px]">
                  GRV No
                </th>
                <th className="p-5 font-black text-slate-400 uppercase tracking-widest text-[10px]">
                  Date
                </th>
                <th className="p-5 font-black text-slate-400 uppercase tracking-widest text-[10px]">
                  Supplier
                </th>
                <th className="p-5 font-black text-slate-400 uppercase tracking-widest text-[10px]">
                  Lines
                </th>
                <th className="p-5 font-black text-slate-400 uppercase tracking-widest text-[10px]">
                  Total Cost
                </th>
                <th className="p-5 font-black text-slate-400 uppercase tracking-widest text-[10px] text-right">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="p-12 text-center text-slate-500">
                    <div className="flex flex-col items-center justify-center gap-3">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-violet-600"></div>
                      Loading goods received...
                    </div>
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-12 text-center text-slate-500">
                    <p className="font-bold text-lg">No GRVs found</p>
                    <p className="">
                      Record goods received to create GRV documents.
                    </p>
                  </td>
                </tr>
              ) : (
                rows.map((grv) => (
                  <tr
                    key={grv.id}
                    className="group border-b border-slate-50 hover:bg-slate-50/50 transition-colors"
                  >
                    <td className="p-4">
                      <div className="flex items-center gap-2">
                        <Badge
                          variant="outline"
                          className="font-mono text-[10px] border-slate-200 bg-white"
                        >
                          {grv.grvNumber}
                        </Badge>
                      </div>
                    </td>
                    <td className="p-4  font-medium text-slate-700">
                      {grv.createdAt
                        ? format(new Date(grv.createdAt), "dd MMM yyyy HH:mm")
                        : "-"}
                    </td>
                    <td className="p-4">
                      <div className="flex items-center gap-2 text-slate-700">
                        <Truck className="w-4 h-4 text-slate-400" />
                        <span className="font-medium">
                          {grv.supplierName || "N/A"}
                        </span>
                      </div>
                    </td>
                    <td className="p-4  font-semibold text-slate-700">
                      {grv.lineCount}
                    </td>
                    <td className="p-4  font-black text-slate-800">
                      ${Number(grv.totalCost || 0).toFixed(2)}
                    </td>
                    <td className="p-4">
                      <div className="flex items-center justify-end gap-2">
                        <Link
                          href={`/inventory/grvs/${encodeURIComponent(grv.id)}`}
                        >
                          <Button
                            variant="outline"
                            size="sm"
                            className="rounded-xl h-8 text-[10px] font-bold border-slate-200"
                          >
                            <FileText className="w-3.5 h-3.5 mr-1" />
                            View
                          </Button>
                        </Link>
                        <Link
                          href={`/inventory/grvs/${encodeURIComponent(grv.id)}`}
                        >
                          <Button
                            size="sm"
                            className="rounded-xl h-8 text-[10px] font-bold"
                          >
                            <Download className="w-3.5 h-3.5 mr-1" />
                            Download
                          </Button>
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>

          <div className="flex flex-col sm:flex-row items-center justify-between px-6 py-4 border-t border-slate-100 bg-slate-50/30 gap-4">
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
              {filtered.length
                ? `Showing ${startIndex + 1}-${Math.min(startIndex + ITEMS_PER_PAGE, filtered.length)} of ${filtered.length}`
                : "No entries"}
            </div>
            <div className="flex items-center gap-2">
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mr-2">
                Page {Math.min(currentPage, totalPages || 1)} of{" "}
                {totalPages || 1}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="rounded-xl h-8 text-[10px] font-bold border-slate-200"
              >
                <ChevronLeft className="h-3 w-3 mr-1" />
                Prev
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  setCurrentPage((p) => Math.min(totalPages || 1, p + 1))
                }
                disabled={currentPage >= totalPages || totalPages === 0}
                className="rounded-xl h-8 text-[10px] font-bold border-slate-200"
              >
                Next
                <ChevronRight className="h-3 w-3 ml-1" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </Layout>
  );
}

function PendingGdnSection({
  companyId,
  gdns,
  isLoading,
}: {
  companyId: number;
  gdns: GdnListItem[];
  isLoading: boolean;
}) {
  const [selected, setSelected] = useState<GdnListItem | null>(null);

  return (
    <Card className="mb-6 border-none shadow-xl shadow-amber-100/60 bg-white/90 backdrop-blur-sm rounded-[2rem] overflow-hidden ring-1 ring-amber-100">
      <CardContent className="p-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-5">
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center">
              <ClipboardCheck className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-black text-slate-900">
                Pending GDN Verification
              </h2>
              <p className="text-xs font-semibold text-slate-500">
                Cashier delivery notes waiting for admin cost entry and stock
                posting.
              </p>
            </div>
          </div>
          <Badge className="w-fit rounded-xl bg-amber-50 text-amber-700 hover:bg-amber-50">
            <Clock className="h-3.5 w-3.5 mr-1" />
            {gdns.length} pending
          </Badge>
        </div>

        {isLoading ? (
          <div className="py-8 text-center  font-semibold text-slate-500">
            Loading pending GDNs...
          </div>
        ) : gdns.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 p-6 text-center">
            <p className=" font-black text-slate-700">No pending GDNs</p>
            <p className="text-xs text-slate-500 mt-1">
              Cashier submissions from the mobile app will appear here.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="py-3 pr-4 font-black text-slate-400 uppercase tracking-widest text-[10px]">
                    GDN No
                  </th>
                  <th className="py-3 pr-4 font-black text-slate-400 uppercase tracking-widest text-[10px]">
                    Date
                  </th>
                  <th className="py-3 pr-4 font-black text-slate-400 uppercase tracking-widest text-[10px]">
                    Supplier
                  </th>
                  <th className="py-3 pr-4 font-black text-slate-400 uppercase tracking-widest text-[10px]">
                    Lines
                  </th>
                  <th className="py-3 pr-4 font-black text-slate-400 uppercase tracking-widest text-[10px] text-right">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody>
                {gdns.map((gdn) => (
                  <tr
                    key={gdn.id}
                    className="border-b border-slate-50 last:border-0"
                  >
                    <td className="py-3 pr-4">
                      <Badge
                        variant="outline"
                        className="font-mono text-[10px] border-amber-200 bg-amber-50/40"
                      >
                        {gdn.gdnNumber}
                      </Badge>
                    </td>
                    <td className="py-3 pr-4  font-medium text-slate-700">
                      {gdn.createdAt
                        ? format(new Date(gdn.createdAt), "dd MMM yyyy HH:mm")
                        : "-"}
                    </td>
                    <td className="py-3 pr-4  font-semibold text-slate-700">
                      {gdn.supplierName || "N/A"}
                    </td>
                    <td className="py-3 pr-4  font-semibold text-slate-700">
                      {gdn.lineCount} / Qty{" "}
                      {Number(gdn.totalQuantity || 0).toFixed(2)}
                    </td>
                    <td className="py-3 pr-0 text-right">
                      <Button
                        size="sm"
                        className="rounded-xl h-8 text-[10px] font-bold"
                        onClick={() => setSelected(gdn)}
                      >
                        <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                        Verify
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <ConfirmGdnDialog
          companyId={companyId}
          gdn={selected}
          onClose={() => setSelected(null)}
        />
      </CardContent>
    </Card>
  );
}

function ConfirmGdnDialog({
  companyId,
  gdn,
  onClose,
}: {
  companyId: number;
  gdn: GdnListItem | null;
  onClose: () => void;
}) {
  const { data: products = [] } = useProducts(companyId);
  const { mutate: confirmGdn, isPending } = useConfirmGdn(companyId);
  const { toast } = useToast();
  const [grvNumber, setGrvNumber] = useState("");
  const [notes, setNotes] = useState("");
  const [landedCosts, setLandedCosts] = useState("");
  const [unitCosts, setUnitCosts] = useState<Record<number, string>>({});

  useEffect(() => {
    if (!gdn) return;
    const initialCosts: Record<number, string> = {};
    for (const item of gdn.items || []) {
      const product = products.find(
        (p: any) => Number(p.id) === Number(item.productId),
      );
      initialCosts[item.productId] = String(
        product?.costPrice ?? item.costPrice ?? "0",
      );
    }
    setUnitCosts(initialCosts);
    setNotes(gdn.notes || `Confirmed from GDN ${gdn.gdnNumber}`);
    setGrvNumber("");
    setLandedCosts("");
  }, [gdn, products]);

  const totalCost = useMemo(() => {
    if (!gdn) return 0;
    return (
      (gdn.items || []).reduce((sum, item) => {
        const cost = Number(unitCosts[item.productId] || 0);
        return sum + Number(item.quantityReceived || 0) * cost;
      }, 0) + Number(landedCosts || 0)
    );
  }, [gdn, landedCosts, unitCosts]);

  const handleConfirm = () => {
    if (!gdn) return;
    const missing = (gdn.items || []).some((item) => {
      const cost = Number(unitCosts[item.productId]);
      return !Number.isFinite(cost) || cost < 0;
    });
    if (missing) {
      toast({
        title: "Check costs",
        description: "Enter a valid unit cost for every GDN line.",
        variant: "destructive",
      });
      return;
    }

    confirmGdn(
      {
        gdnId: gdn.id,
        grvNumber: grvNumber.trim() || undefined,
        notes,
        landedCosts: landedCosts || 0,
        allocationMethod: "value",
        items: (gdn.items || []).map((item) => ({
          productId: item.productId,
          quantity: item.quantityReceived,
          unitCost: unitCosts[item.productId] || 0,
        })),
      },
      {
        onSuccess: (result: any) => {
          toast({
            title: "GDN Confirmed",
            description:
              `Stock posted as GRV ${result?.grvNumber || ""}`.trim(),
          });
          onClose();
        },
        onError: (error: any) => {
          toast({
            title: "Could not confirm GDN",
            description: error.message || "Please try again.",
            variant: "destructive",
          });
        },
      },
    );
  };

  return (
    <Dialog
      open={!!gdn}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="sm:max-w-[880px] rounded-[1.5rem] border-none shadow-2xl p-0 overflow-hidden">
        <DialogHeader className="p-6 bg-slate-50/70 border-b border-slate-100">
          <DialogTitle className="text-xl font-black">
            Verify GDN {gdn?.gdnNumber}
          </DialogTitle>
          <p className="text-xs font-semibold text-slate-500">
            Enter costs, confirm quantities, and post stock into inventory.
          </p>
        </DialogHeader>

        <div className="p-6 space-y-5 max-h-[70vh] overflow-y-auto">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                GRV Number
              </Label>
              <Input
                value={grvNumber}
                onChange={(e) => setGrvNumber(e.target.value)}
                placeholder="Auto if blank"
                className="mt-2 h-10 rounded-lg"
              />
            </div>
            <div>
              <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                Landed Costs
              </Label>
              <Input
                value={landedCosts}
                onChange={(e) => setLandedCosts(e.target.value)}
                placeholder="0.00"
                className="mt-2 h-10 rounded-lg"
              />
            </div>
            <div>
              <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                Supplier
              </Label>
              <div className="mt-2 h-10 rounded-lg border border-slate-200 bg-slate-50 px-3 flex items-center  font-semibold text-slate-700">
                {gdn?.supplierName || "N/A"}
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-slate-100 overflow-hidden">
            <div className="bg-slate-50 py-2 px-4 grid grid-cols-[1fr,110px,140px,140px] gap-4">
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                Product
              </span>
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                Qty
              </span>
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 text-right">
                Unit Cost
              </span>
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 text-right">
                Line Total
              </span>
            </div>
            {(gdn?.items || []).map((item) => {
              const cost = Number(unitCosts[item.productId] || 0);
              const lineTotal = Number(item.quantityReceived || 0) * cost;
              return (
                <div
                  key={item.id}
                  className="p-3 grid grid-cols-[1fr,110px,140px,140px] gap-4 items-center border-t border-slate-50"
                >
                  <div>
                    <p className=" font-bold text-slate-800">
                      {item.productName}
                    </p>
                    <p className="text-[11px] font-semibold text-slate-400">
                      {item.sku || "No SKU"}
                    </p>
                  </div>
                  <p className=" font-mono font-bold text-slate-700">
                    {Number(item.quantityReceived || 0).toFixed(2)}
                  </p>
                  <Input
                    value={unitCosts[item.productId] || ""}
                    onChange={(e) =>
                      setUnitCosts((prev) => ({
                        ...prev,
                        [item.productId]: e.target.value,
                      }))
                    }
                    className="h-9 text-right font-mono rounded-lg"
                  />
                  <p className=" font-black text-slate-800 text-right">
                    ${lineTotal.toFixed(2)}
                  </p>
                </div>
              );
            })}
          </div>

          <div>
            <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400">
              Notes
            </Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="mt-2 rounded-xl"
              rows={3}
            />
          </div>
        </div>

        <DialogFooter className="p-6 bg-slate-50/70 border-t border-slate-100 sm:justify-between items-center">
          <p className=" font-black text-slate-800">
            Inventory value: ${totalCost.toFixed(2)}
          </p>
          <div className="flex gap-2 w-full sm:w-auto">
            <Button
              type="button"
              variant="ghost"
              onClick={onClose}
              className="rounded-xl font-bold flex-1 sm:flex-none"
            >
              Cancel
            </Button>
            <Button
              onClick={handleConfirm}
              disabled={isPending || !gdn}
              className="rounded-xl font-bold px-8 flex-1 sm:flex-none"
            >
              {isPending ? "Posting..." : "Confirm & Post Stock"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
