import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  Boxes,
  Factory,
  Loader2,
  Minus,
  PackagePlus,
  Plus,
  Trash2,
} from "lucide-react";
import { Layout } from "@/components/layout";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
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
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useActiveCompany } from "@/hooks/use-active-company";
import { useProducts } from "@/hooks/use-products";
import { useBranchContext } from "@/lib/branch-context";
import { apiFetch } from "@/lib/api";
import { cn } from "@/lib/utils";
import { QuantityInput } from "@/components/ui/quantity-input";


type ProductionLine = {
  id: string;
  productId: string;
  quantity: string;
};

const newLine = (): ProductionLine => ({
  id: Math.random().toString(36).slice(2),
  productId: "",
  quantity: "",
});

export default function ProductionPage() {
  const { activeCompanyId } = useActiveCompany();
  const { selectedBranchId, selectedBranch } = useBranchContext();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const companyId = activeCompanyId || 0;
  const { data: products = [], isLoading } = useProducts(
    companyId,
    selectedBranchId || undefined,
  );

  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [inputs, setInputs] = useState<ProductionLine[]>([newLine()]);
  const [outputs, setOutputs] = useState<ProductionLine[]>([newLine()]);

  const trackedProducts = useMemo(
    () =>
      products.filter(
        (product: any) =>
          product.isTracked &&
          product.productType !== "service" &&
          product.isActive !== false,
      ),
    [products],
  );

  const productMap = useMemo(
    () => new Map(trackedProducts.map((product: any) => [product.id, product])),
    [trackedProducts],
  );

  const getStock = (product: any) =>
    Number(product?.branchStock ?? product?.stockLevel ?? 0);
  const getCost = (product: any) => Number(product?.costPrice || 0);

  const inputCost = useMemo(
    () =>
      inputs.reduce((sum, line) => {
        const product = productMap.get(Number(line.productId));
        return sum + Number(line.quantity || 0) * getCost(product);
      }, 0),
    [inputs, productMap],
  );

  const outputQty = useMemo(
    () => outputs.reduce((sum, line) => sum + Number(line.quantity || 0), 0),
    [outputs],
  );

  const postProduction = useMutation({
    mutationFn: async () => {
      const payload = {
        branchId: selectedBranchId,
        reference: reference.trim() || undefined,
        notes: notes.trim() || undefined,
        inputs: inputs.map((line) => ({
          productId: Number(line.productId),
          quantity: Number(line.quantity),
        })),
        outputs: outputs.map((line) => ({
          productId: Number(line.productId),
          quantity: Number(line.quantity),
        })),
      };
      const res = await apiFetch(
        `/api/companies/${companyId}/production-runs`,
        {
          method: "POST",
          body: JSON.stringify(payload),
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok)
        throw new Error(data.message || "Failed to post production run");
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries();
      setReference("");
      setNotes("");
      setInputs([newLine()]);
      setOutputs([newLine()]);
      toast({
        title: "Production posted",
        description: `${data.referenceId} updated stock successfully.`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Production failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateLine = (
    kind: "input" | "output",
    id: string,
    patch: Partial<ProductionLine>,
  ) => {
    const setter = kind === "input" ? setInputs : setOutputs;
    setter((prev) =>
      prev.map((line) => (line.id === id ? { ...line, ...patch } : line)),
    );
  };

  const removeLine = (kind: "input" | "output", id: string) => {
    const setter = kind === "input" ? setInputs : setOutputs;
    setter((prev) =>
      prev.length > 1 ? prev.filter((line) => line.id !== id) : prev,
    );
  };

  const addLine = (kind: "input" | "output") => {
    const setter = kind === "input" ? setInputs : setOutputs;
    setter((prev) => [...prev, newLine()]);
  };

  const invalidInputs = inputs.some(
    (line) => !line.productId || Number(line.quantity) <= 0,
  );
  const invalidOutputs = outputs.some(
    (line) => !line.productId || Number(line.quantity) <= 0,
  );
  const hasInsufficientInput = inputs.some((line) => {
    const product = productMap.get(Number(line.productId));
    return product && Number(line.quantity || 0) > getStock(product);
  });
  const canPost =
    companyId &&
    !invalidInputs &&
    !invalidOutputs &&
    !hasInsufficientInput &&
    !postProduction.isPending;

  const renderLines = (kind: "input" | "output", lines: ProductionLine[]) => {
    const isInput = kind === "input";
    return (
      <Card className="border-slate-200 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center justify-between text-base">
            <span className="flex items-center gap-2">
              {isInput ? (
                <Minus className="h-4 w-4 text-rose-600" />
              ) : (
                <PackagePlus className="h-4 w-4 text-emerald-600" />
              )}
              {isInput ? "Inputs Consumed" : "Outputs Produced"}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 rounded-lg"
              onClick={() => addLine(kind)}
            >
              <Plus className="mr-1 h-3.5 w-3.5" />
              Add
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {lines.map((line) => {
            const product = productMap.get(Number(line.productId));
            const qty = Number(line.quantity || 0);
            const insufficient = isInput && product && qty > getStock(product);
            return (
              <div
                key={line.id}
                className="grid grid-cols-1 gap-2 rounded-xl border border-slate-100 bg-slate-50/70 p-3 md:grid-cols-[1fr_140px_40px]"
              >
                <div className="space-y-1">
                  <Select
                    value={line.productId}
                    onValueChange={(value) =>
                      updateLine(kind, line.id, { productId: value })
                    }
                  >
                    <SelectTrigger className="h-11 rounded-xl bg-white">
                      <SelectValue
                        placeholder={
                          isInput
                            ? "Select input stock"
                            : "Select output product"
                        }
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {trackedProducts.map((product: any) => (
                        <SelectItem key={product.id} value={String(product.id)}>
                          {product.name} {product.sku ? `(${product.sku})` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {product && (
                    <div className="flex flex-wrap gap-2 text-[11px] font-semibold text-slate-500">
                      <span>
                        Stock: {getStock(product).toFixed(2)}{" "}
                        {product.unitOfMeasure || "unit"}
                      </span>
                      <span>Cost: {getCost(product).toFixed(2)}</span>
                      {insufficient && (
                        <span className="text-rose-600">
                          Insufficient stock
                        </span>
                      )}
                    </div>
                  )}
                </div>
                <QuantityInput
                  type="number"
                  min="0"
                  step="0.0001"
                  value={line.quantity}
                  onChange={(event) =>
                    updateLine(kind, line.id, { quantity: event.target.value })
                  }
                  placeholder="Qty"
                  className={cn(
                    "h-11 w-full rounded-xl bg-white text-right font-bold",
                    insufficient && "border-rose-300 text-rose-700",
                  )}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-11 w-10 justify-self-end rounded-xl text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                  onClick={() => removeLine(kind, line.id)}
                  disabled={lines.length === 1}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            );
          })}
        </CardContent>
      </Card>
    );
  };

  return (
    <Layout>
      <PageHeader
        title="Production"
        subtitle="Convert known input quantities into finished stock before selling"
        actions={
          <Link href="/products">
            <Button variant="outline" className="rounded-xl">
              <Boxes className="mr-2 h-4 w-4" />
              Products
            </Button>
          </Link>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
        <div className="space-y-5">
          <Card className="border-slate-200 shadow-sm">
            <CardContent className="grid gap-4 p-5 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Reference</Label>
                <Input
                  value={reference}
                  onChange={(event) => setReference(event.target.value)}
                  placeholder="Auto-generated if blank"
                  className="h-11 rounded-xl"
                />
              </div>
              <div className="space-y-2">
                <Label>Branch</Label>
                <div className="flex h-11 items-center rounded-xl border border-slate-200 bg-slate-50 px-3  font-semibold text-slate-600">
                  {selectedBranch?.name || "Company-wide stock"}
                </div>
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>Notes</Label>
                <Textarea
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  placeholder="e.g. Hind quarter breakdown batch, bakery production run, repackaging..."
                  className="min-h-[82px] rounded-xl"
                />
              </div>
            </CardContent>
          </Card>

          {isLoading ? (
            <div className="flex h-64 items-center justify-center rounded-2xl border border-slate-200 bg-white">
              <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
            </div>
          ) : (
            <>
              {renderLines("input", inputs)}
              {renderLines("output", outputs)}
            </>
          )}
        </div>

        <Card className="h-fit border-slate-200 shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Factory className="h-4 w-4 text-slate-700" />
              Production Summary
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="rounded-xl bg-slate-50 p-3">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                  Input cost
                </p>
                <p className="mt-1 text-xl font-black text-slate-900">
                  {inputCost.toFixed(2)}
                </p>
              </div>
              <div className="rounded-xl bg-slate-50 p-3">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                  Output qty
                </p>
                <p className="mt-1 text-xl font-black text-slate-900">
                  {outputQty.toFixed(2)}
                </p>
              </div>
            </div>
            <div className="rounded-xl border border-indigo-100 bg-indigo-50 p-3 text-xs leading-relaxed text-indigo-900">
              <b>Use this when outputs are known.</b> For unknown meat
              breakdowns, Recipe / BOM at sale is still better.
            </div>
            {hasInsufficientInput && (
              <Badge className="w-full justify-center rounded-xl bg-rose-100 py-2 text-rose-700 hover:bg-rose-100">
                Some input stock is insufficient
              </Badge>
            )}
            <Button
              className="h-12 w-full rounded-xl font-black"
              disabled={!canPost}
              onClick={() => postProduction.mutate()}
            >
              {postProduction.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Factory className="mr-2 h-4 w-4" />
              )}
              Post Production
            </Button>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
