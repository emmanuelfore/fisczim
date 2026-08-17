import { useState } from "react";
import { Layout } from "@/components/layout";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  Briefcase,
  Plus,
  PlayCircle,
  Car,
  Building,
  Laptop,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCurrency } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

export default function FixedAssetsPage() {
  const [isRegisterOpen, setIsRegisterOpen] = useState(false);
  const [runDate, setRunDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [formData, setFormData] = useState<any>({
    name: "",
    description: "",
    serialNumber: "",
    purchaseDate: format(new Date(), "yyyy-MM-dd"),
    purchasePrice: "",
    salvageValue: "0",
    usefulLifeYears: "5",
    depreciationMethod: "STRAIGHT_LINE",
    assetAccountId: "",
    depreciationExpenseAccountId: "",
    accumulatedDepreciationAccountId: "",
  });

  const { data: assets, isLoading, isError, refetch } = useQuery<any[]>({
    queryKey: ["/api/accounting/fixed-assets"],
  });

  const { data: accounts } = useQuery<any[]>({
    queryKey: ["/api/accounting/accounts"],
  });

  const registerMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/accounting/fixed-assets", {
        ...data,
        purchaseDate: new Date(data.purchaseDate).toISOString(),
        purchasePrice: Number(data.purchasePrice),
        salvageValue: Number(data.salvageValue),
        usefulLifeYears: Number(data.usefulLifeYears),
        assetAccountId: Number(data.assetAccountId),
        depreciationExpenseAccountId: Number(data.depreciationExpenseAccountId),
        accumulatedDepreciationAccountId: Number(
          data.accumulatedDepreciationAccountId,
        ),
      });
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Fixed asset registered successfully.",
      });
      setIsRegisterOpen(false);
      queryClient.invalidateQueries({
        queryKey: ["/api/accounting/fixed-assets"],
      });
    },
    onError: (err: any) => {
      toast({
        title: "Error",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const runDepreciationMutation = useMutation({
    mutationFn: async (dateStr: string) => {
      const res = await apiRequest(
        "POST",
        "/api/accounting/fixed-assets/depreciate",
        { date: dateStr },
      );
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Depreciation Complete",
        description: `Successfully depreciated ${data.depreciatedCount} assets for a total of ${formatCurrency(data.amount)}.`,
      });
      queryClient.invalidateQueries({
        queryKey: ["/api/accounting/fixed-assets"],
      });
      queryClient.invalidateQueries({ queryKey: ["/api/accounting/ledger"] });
    },
    onError: (err: any) => {
      toast({
        title: "Error",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  return (
    <Layout hideHeaderTitle>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-indigo-100 flex items-center justify-center text-indigo-600">
              <Briefcase className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold font-display text-slate-800">
                Fixed Assets
              </h1>
              <p className=" text-slate-500">
                Manage company assets and depreciation schedules
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Dialog>
              <DialogTrigger asChild>
                <Button
                  variant="outline"
                  className="h-11 px-4 rounded-xl border-slate-200"
                >
                  <PlayCircle className="h-4 w-4 mr-2 text-primary" />
                  Run Depreciation
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Run Depreciation</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 pt-4">
                  <p className=" text-slate-500">
                    This will run auto-depreciation on all active assets up to
                    the selected date and post journal entries. Calculations are
                    based on useful lifespan and the asset's selected method.
                  </p>
                  <div className="space-y-2">
                    <Label>Cut-Off Date</Label>
                    <Input
                      type="date"
                      value={runDate}
                      onChange={(e) => setRunDate(e.target.value)}
                    />
                  </div>
                  <Button
                    className="w-full"
                    onClick={() => runDepreciationMutation.mutate(runDate)}
                    disabled={runDepreciationMutation.isPending}
                  >
                    {runDepreciationMutation.isPending
                      ? "Running Engine..."
                      : "Execute Depreciation"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>

            <Dialog open={isRegisterOpen} onOpenChange={setIsRegisterOpen}>
              <DialogTrigger asChild>
                <Button className="h-11 px-6 rounded-xl font-bold bg-primary hover:bg-primary/90 text-white flex items-center gap-2">
                  <Plus className="h-4 w-4" />
                  <span>Register Asset</span>
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Register New Fixed Asset</DialogTitle>
                </DialogHeader>
                <div className="space-y-6 pt-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2 col-span-2">
                      <Label>Asset Name</Label>
                      <Input
                        placeholder="e.g., Delivery Truck Ford F-150"
                        value={formData.name}
                        onChange={(e) =>
                          setFormData({ ...formData, name: e.target.value })
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Serial Number</Label>
                      <Input
                        placeholder="Optional"
                        value={formData.serialNumber}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            serialNumber: e.target.value,
                          })
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Purchase Date</Label>
                      <Input
                        type="date"
                        value={formData.purchaseDate}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            purchaseDate: e.target.value,
                          })
                        }
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 bg-slate-50 rounded-xl border border-slate-100">
                    <div className="space-y-2">
                      <Label>Purchase Cost</Label>
                      <Input
                        type="number"
                        value={formData.purchasePrice}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            purchasePrice: e.target.value,
                          })
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Salvage Value</Label>
                      <Input
                        type="number"
                        value={formData.salvageValue}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            salvageValue: e.target.value,
                          })
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Useful Life (Years)</Label>
                      <Input
                        type="number"
                        value={formData.usefulLifeYears}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            usefulLifeYears: e.target.value,
                          })
                        }
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Depreciation Method</Label>
                    <Select
                      value={formData.depreciationMethod}
                      onValueChange={(v) =>
                        setFormData({ ...formData, depreciationMethod: v })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select Method" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="STRAIGHT_LINE">
                          Straight Line
                        </SelectItem>
                        <SelectItem value="DECLINING_BALANCE">
                          Declining Balance
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-4 pt-4 border-t border-slate-100">
                    <h3 className="font-bold  text-slate-800 uppercase">
                      GL Account Mappings
                    </h3>
                    <div className="space-y-2">
                      <Label>Asset Account (Balance Sheet)</Label>
                      <Select
                        value={formData.assetAccountId}
                        onValueChange={(v) =>
                          setFormData({ ...formData, assetAccountId: v })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select Asset Account" />
                        </SelectTrigger>
                        <SelectContent>
                          {accounts
                            ?.filter((a) => a.type === "ASSET")
                            .map((a) => (
                              <SelectItem key={a.id} value={a.id.toString()}>
                                {a.code} - {a.name}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Depreciation Expense Account (P&L)</Label>
                      <Select
                        value={formData.depreciationExpenseAccountId}
                        onValueChange={(v) =>
                          setFormData({
                            ...formData,
                            depreciationExpenseAccountId: v,
                          })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select Expense Account" />
                        </SelectTrigger>
                        <SelectContent>
                          {accounts
                            ?.filter((a) => a.type === "EXPENSE")
                            .map((a) => (
                              <SelectItem key={a.id} value={a.id.toString()}>
                                {a.code} - {a.name}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>
                        Accumulated Depreciation Account (Balance Sheet Contra)
                      </Label>
                      <Select
                        value={formData.accumulatedDepreciationAccountId}
                        onValueChange={(v) =>
                          setFormData({
                            ...formData,
                            accumulatedDepreciationAccountId: v,
                          })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select Contra-Asset Account" />
                        </SelectTrigger>
                        <SelectContent>
                          {accounts
                            ?.filter(
                              (a) =>
                                a.type === "ASSET" || a.type === "LIABILITY",
                            )
                            .map((a) => (
                              <SelectItem key={a.id} value={a.id.toString()}>
                                {a.code} - {a.name}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="flex justify-end gap-2 pt-4">
                    <Button
                      variant="ghost"
                      onClick={() => setIsRegisterOpen(false)}
                    >
                      Cancel
                    </Button>
                    <Button
                      onClick={() => registerMutation.mutate(formData)}
                      disabled={
                        registerMutation.isPending ||
                        !formData.name ||
                        !formData.purchasePrice ||
                        !formData.assetAccountId
                      }
                    >
                      {registerMutation.isPending
                        ? "Registering..."
                        : "Save Asset"}
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6">
          <Card className="rounded-2xl border-slate-200">
            <CardContent className="p-0 overflow-x-auto">
              <Table>
                <TableHeader className="bg-slate-50/50">
                  <TableRow>
                    <TableHead className="pl-6 w-[250px]">
                      Asset Details
                    </TableHead>
                    <TableHead>Purchased</TableHead>
                    <TableHead>Method & Life</TableHead>
                    <TableHead className="text-right">Purchase Cost</TableHead>
                    <TableHead className="text-right text-rose-600">
                      Accum. Depr.
                    </TableHead>
                    <TableHead className="text-right font-bold pr-6">
                      Net Book Value
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow>
                      <TableCell
                        colSpan={6}
                        className="h-32 text-center text-slate-400"
                      >
                        Loading assets...
                      </TableCell>
                    </TableRow>
                  ) : isError ? (
                    <TableRow>
                      <TableCell colSpan={6} className="h-32 text-center">
                        <div className="flex flex-col items-center justify-center gap-3">
                          <span className="text-rose-600 font-semibold">
                            Could not load fixed assets.
                          </span>
                          <Button variant="outline" size="sm" className="rounded-lg" onClick={() => refetch()}>
                            Retry
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : assets?.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={6}
                        className="h-32 text-center text-slate-400"
                      >
                        No fixed assets registered.
                      </TableCell>
                    </TableRow>
                  ) : (
                    assets?.map((asset: any) => (
                      <TableRow
                        key={asset.id}
                        className="hover:bg-slate-50 border-slate-100"
                      >
                        <TableCell className="pl-6">
                          <p className="font-bold text-slate-800">
                            {asset.name}
                          </p>
                          <p className="text-xs text-slate-500 font-mono">
                            SN: {asset.serialNumber || "N/A"}
                          </p>
                        </TableCell>
                        <TableCell className="text-slate-600">
                          {format(new Date(asset.purchaseDate), "MMM d, yyyy")}
                        </TableCell>
                        <TableCell>
                          <p className="text-xs font-bold text-slate-700">
                            {asset.depreciationMethod === "STRAIGHT_LINE"
                              ? "Straight Line"
                              : "Declining Bal."}
                          </p>
                          <p className="text-xs text-slate-500">
                            {asset.usefulLifeYears} Years
                          </p>
                        </TableCell>
                        <TableCell className="text-right font-medium text-slate-700">
                          {formatCurrency(Number(asset.purchasePrice))}
                        </TableCell>
                        <TableCell className="text-right font-bold text-rose-500">
                          {formatCurrency(
                            Number(asset.accumulatedDepreciation),
                          )}
                        </TableCell>
                        <TableCell className="text-right pr-6 font-black text-slate-900 text-lg">
                          {formatCurrency(Number(asset.netBookValue))}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      </div>
    </Layout>
  );
}
