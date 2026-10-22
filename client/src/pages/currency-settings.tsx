import { Layout } from "@/components/layout";
import {
  useCurrencies,
  useCreateCurrency,
  useUpdateCurrency,
  useDeleteCurrency,
} from "@/hooks/use-currencies";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Plus,
  Pencil,
  Trash2,
  ArrowLeft,
  Loader2,
  RefreshCw,
  Calculator,
} from "lucide-react";
import { useState } from "react";
import { Link } from "wouter";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { DeleteButton } from "@/components/delete-button";

// Form Schema
const currencySchema = z.object({
  code: z.string().min(3).max(3).toUpperCase(),
  name: z.string().min(2),
  symbol: z.string().min(1),
  exchangeRate: z
    .string()
    .regex(/^\d*\.?\d*$/, "Must be a valid number")
    .default("1.000000"),
  isBase: z.boolean().default(false),
  isActive: z.boolean().default(true),
});

type CurrencyFormValues = z.infer<typeof currencySchema>;

export default function CurrencySettingsPage() {
  const companyId = parseInt(localStorage.getItem("selectedCompanyId") || "0");
  const {
    data: currencies,
    isLoading,
    isError,
    error,
  } = useCurrencies(companyId);
  const createCurrency = useCreateCurrency(companyId);
  const updateCurrency = useUpdateCurrency();
  const deleteCurrency = useDeleteCurrency();
  const [isModalOpen, setModalOpen] = useState(false);
  const [isRevalOpen, setRevalOpen] = useState(false);
  const [cutOffDate, setCutOffDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [editingId, setEditingId] = useState<number | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const revalueMutation = useMutation({
    mutationFn: async (dateStr: string) => {
      const res = await apiRequest("POST", "/api/accounting/revaluation", {
        cutOffDate: dateStr,
      });
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Revaluation Complete",
        description: data.message,
      });
      setRevalOpen(false);
      queryClient.invalidateQueries({ queryKey: ["/api/accounting/ledger"] });
    },
    onError: (error: any) => {
      toast({
        title: "Revaluation Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const form = useForm<CurrencyFormValues>({
    resolver: zodResolver(currencySchema),
    defaultValues: {
      code: "",
      name: "",
      symbol: "",
      exchangeRate: "1.000000",
      isBase: false,
      isActive: true,
    },
  });

  const onSubmit = async (data: CurrencyFormValues) => {
    try {
      if (editingId) {
        await updateCurrency.mutateAsync({ id: editingId, data });
      } else {
        await createCurrency.mutateAsync(data);
      }
      setModalOpen(false);
      resetForm();
    } catch (error) {
      console.error(error);
    }
  };

  const resetForm = () => {
    setEditingId(null);
    form.reset({
      code: "",
      name: "",
      symbol: "",
      exchangeRate: "1.000000",
      isBase: false,
      isActive: true,
    });
  };

  const handleEdit = (currency: any) => {
    setEditingId(currency.id);
    form.reset({
      code: currency.code,
      name: currency.name,
      symbol: currency.symbol,
      exchangeRate: currency.exchangeRate,
      isBase: currency.isBase || false,
      isActive: currency.isActive || true,
    });
    setModalOpen(true);
  };

  return (
    <Layout>
      <div className="mb-8">
        <div className="flex justify-end gap-3">
          <Dialog open={isRevalOpen} onOpenChange={setRevalOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" className="border-indigo-200 text-indigo-700 hover:bg-indigo-50 font-bold">
                <Calculator className="w-4 h-4 mr-2" />
                Run Revaluation
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Month-End Forex Revaluation</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-4">
                <div className="bg-indigo-50 border border-indigo-100 rounded-lg p-3 text-indigo-900 text-sm">
                  This will calculate unrealized exchange gains and losses for all foreign currency balances up to the selected date. Ensure exchange rates are up to date before running.
                </div>
                <div className="space-y-2">
                  <Label>Cut-Off Date</Label>
                  <Input 
                    type="date" 
                    value={cutOffDate}
                    onChange={(e) => setCutOffDate(e.target.value)}
                  />
                </div>
                <Button 
                  className="w-full font-bold" 
                  onClick={() => revalueMutation.mutate(cutOffDate)}
                  disabled={revalueMutation.isPending}
                >
                  {revalueMutation.isPending ? "Calculating..." : "Execute Revaluation"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          <Dialog
            open={isModalOpen}
            onOpenChange={(open) => {
              setModalOpen(open);
              if (!open) resetForm();
            }}
          >
            <DialogTrigger asChild>
              <Button>
                <Plus className="w-4 h-4 mr-2" />
                Add Currency
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>
                  {editingId ? "Edit Currency" : "Add Currency"}
                </DialogTitle>
              </DialogHeader>
              <form
                onSubmit={form.handleSubmit(onSubmit)}
                className="space-y-4 pt-4"
              >
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Code (e.g. USD)</Label>
                    <Input
                      {...form.register("code")}
                      placeholder="USD"
                      maxLength={3}
                    />
                    {form.formState.errors.code && (
                      <p className="text-red-500 text-xs">
                        {form.formState.errors.code.message}
                      </p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label>Symbol (e.g. $)</Label>
                    <Input {...form.register("symbol")} placeholder="$" />
                    {form.formState.errors.symbol && (
                      <p className="text-red-500 text-xs">
                        {form.formState.errors.symbol.message}
                      </p>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Name</Label>
                  <Input {...form.register("name")} placeholder="US Dollar" />
                </div>

                <div className="space-y-2">
                  <Label>Exchange Rate (vs Base)</Label>
                  <Input
                    {...form.register("exchangeRate")}
                    placeholder="1.000000"
                  />
                  <p className="text-xs text-slate-500">
                    Rate relative to your base currency.
                  </p>
                </div>

                <div className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="space-y-0.5">
                    <Label>Base Currency</Label>
                    <p className="text-xs text-slate-500">
                      Is this your primary reporting currency?
                    </p>
                  </div>
                  <Switch
                    checked={form.watch("isBase")}
                    onCheckedChange={(checked) =>
                      form.setValue("isBase", checked)
                    }
                  />
                </div>

                <div className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="space-y-0.5">
                    <Label>Active Status</Label>
                    <p className="text-xs text-slate-500">
                      Enable or disable this currency
                    </p>
                  </div>
                  <Switch
                    checked={form.watch("isActive")}
                    onCheckedChange={(checked) =>
                      form.setValue("isActive", checked)
                    }
                  />
                </div>

                <Button
                  type="submit"
                  className="w-full"
                  disabled={
                    createCurrency.isPending || updateCurrency.isPending
                  }
                >
                  {createCurrency.isPending || updateCurrency.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : editingId ? (
                    "Update Currency"
                  ) : (
                    "Add Currency"
                  )}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Card className="card-depth border-none">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Symbol</TableHead>
                <TableHead>Exchange Rate</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="text-center py-8 text-slate-500"
                  >
                    Loading currencies...
                  </TableCell>
                </TableRow>
              ) : !companyId ? (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="text-center py-8 text-slate-500"
                  >
                    Select a company to manage currencies.
                  </TableCell>
                </TableRow>
              ) : isError ? (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="text-center py-8 text-red-500"
                  >
                    {(error as Error)?.message || "Failed to load currencies."}
                  </TableCell>
                </TableRow>
              ) : currencies?.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="text-center py-8 text-slate-500"
                  >
                    No currencies defined.
                  </TableCell>
                </TableRow>
              ) : (
                currencies?.map((currency) => (
                  <TableRow key={currency.id}>
                    <TableCell className="font-bold font-mono">
                      {currency.code}
                      {currency.isBase && (
                        <Badge
                          variant="secondary"
                          className="ml-2 text-xs bg-emerald-100 text-emerald-700"
                        >
                          BASE
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>{currency.name}</TableCell>
                    <TableCell className="font-mono">
                      {currency.symbol}
                    </TableCell>
                    <TableCell className="font-mono">
                      {Number(currency.exchangeRate).toFixed(6)}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={currency.isActive ? "default" : "outline"}
                        className={
                          currency.isActive ? "bg-slate-900" : "text-slate-400"
                        }
                      >
                        {currency.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleEdit(currency)}
                        >
                          <Pencil className="w-4 h-4 text-slate-500" />
                        </Button>
                        <DeleteButton
                          title="Delete Currency"
                          description={`Are you sure you want to delete ${currency.code}?`}
                          onConfirm={async () => {
                            await deleteCurrency.mutateAsync(currency.id);
                          }}
                          isDeleting={deleteCurrency.isPending}
                        />
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="mt-6 p-4 bg-orange-50 border border-orange-100 rounded-lg  text-orange-800 flex gap-3">
        <RefreshCw className="w-5 h-5 shrink-0" />
        <div>
          <h4 className="font-bold mb-1">Exchange Rate Updates</h4>
          <p>
            Exchange rates affect new invoices only. Past invoices retain their
            original rates at the time of creation.
          </p>
        </div>
      </div>
    </Layout>
  );
}
