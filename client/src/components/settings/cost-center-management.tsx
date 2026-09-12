import { useState } from "react";
import {
  Card,
  CardContent,
  CardHeader,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Plus,
  Briefcase,
  Pencil,
  Trash2,
  Search,
  CheckCircle2,
  XCircle,
  MoreVertical,
  RefreshCw,
} from "lucide-react";
import {
  useCostCenters,
  useCreateCostCenter,
  useUpdateCostCenter,
  useDeleteCostCenter,
} from "@/hooks/use-cost-centers";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { type CostCenter, type InsertCostCenter } from "@shared/schema";

interface CostCenterManagementProps {
  companyId: number;
}

export function CostCenterManagement({ companyId }: CostCenterManagementProps) {
  const { data: costCenters, isLoading } = useCostCenters(companyId);
  const createCostCenter = useCreateCostCenter(companyId);
  const updateCostCenter = useUpdateCostCenter(companyId);
  const deleteCostCenter = useDeleteCostCenter(companyId);
  const { toast } = useToast();

  const [searchTerm, setSearchTerm] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingCenter, setEditingCenter] = useState<CostCenter | null>(null);

  const [formData, setFormData] = useState<Partial<InsertCostCenter>>({
    name: "",
    code: "",
    description: "",
    companyId: companyId,
  });

  const handleOpenDialog = (center?: CostCenter) => {
    if (center) {
      setEditingCenter(center);
      setFormData({
        name: center.name,
        code: center.code || "",
        description: center.description || "",
      });
    } else {
      setEditingCenter(null);
      setFormData({
        name: "",
        code: "",
        description: "",
        companyId: companyId,
      });
    }
    setIsDialogOpen(true);
  };

  const handleSubmit = async () => {
    try {
      if (!formData.name?.trim()) {
        throw new Error("Name is required");
      }
      if (!formData.code?.trim()) {
        throw new Error("Code is required");
      }

      if (editingCenter) {
        await updateCostCenter.mutateAsync({ id: editingCenter.id, ...formData });
        toast({ title: "Success", description: "Cost center updated successfully" });
      } else {
        await createCostCenter.mutateAsync(formData as InsertCostCenter);
        toast({ title: "Success", description: "Cost center created successfully" });
      }
      setIsDialogOpen(false);
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message,
        variant: "destructive",
      });
    }
  };

  const handleDelete = async (id: number) => {
    if (
      !confirm(
        "Are you sure you want to delete this cost center? This action cannot be undone.",
      )
    )
      return;
    try {
      await deleteCostCenter.mutateAsync(id);
      toast({ title: "Success", description: "Cost center deleted successfully" });
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message,
        variant: "destructive",
      });
    }
  };

  const filteredCenters = costCenters?.filter(
    (c) =>
      c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (c.code && c.code.toLowerCase().includes(searchTerm.toLowerCase())),
  );

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-black text-slate-900 tracking-tight">
            Cost Center Setup
          </h2>
          <p className="text-muted-foreground">
            Manage organizational divisions and accounting tracking codes
          </p>
        </div>
        <Button
          onClick={() => handleOpenDialog()}
          className="rounded-2xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white shadow-lg shadow-indigo-100 font-black gap-2 h-11 px-6 active:scale-95 transition-all"
        >
          <Plus className="w-4 h-4" />
          Add Cost Center
        </Button>
      </div>

      <Card className="border-none overflow-hidden hover:shadow-2xl transition-all duration-500">
        <CardHeader className="bg-slate-50/50 border-b border-slate-100/50 p-6">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              placeholder="Search by cost center name or code..."
              className="pl-12 h-12 rounded-2xl border-slate-200 bg-white/80 focus:bg-white transition-all font-medium"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/30">
                  <th className="px-8 py-4 text-left text-[10px] font-black uppercase tracking-widest text-slate-400">
                    Identity
                  </th>
                  <th className="px-8 py-4 text-left text-[10px] font-black uppercase tracking-widest text-slate-400">
                    Code
                  </th>
                  <th className="px-8 py-4 text-left text-[10px] font-black uppercase tracking-widest text-slate-400">
                    Description
                  </th>
                  <th className="px-8 py-4 text-left text-[10px] font-black uppercase tracking-widest text-slate-400">
                    Status
                  </th>
                  <th className="px-8 py-4 text-right text-[10px] font-black uppercase tracking-widest text-slate-400">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {isLoading ? (
                  Array.from({ length: 3 }).map((_, i) => (
                    <tr key={i} className="animate-pulse">
                      <td
                        colSpan={5}
                        className="px-8 py-8 h-24 bg-slate-50/10"
                      />
                    </tr>
                  ))
                ) : filteredCenters?.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-8 py-20 text-center">
                      <div className="flex flex-col items-center">
                        <Briefcase className="w-12 h-12 text-slate-200 mb-4" />
                        <p className="text-slate-400 font-bold">
                          No cost centers found matching your search
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredCenters?.map((center) => (
                    <tr
                      key={center.id}
                      className="group hover:bg-slate-50/50 transition-all duration-300"
                    >
                      <td className="px-8 py-6">
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 rounded-xl bg-violet-50 border border-violet-100 flex items-center justify-center text-violet-600 shadow-sm transition-transform group-hover:scale-110">
                            <Briefcase className="w-5 h-5" />
                          </div>
                          <div>
                            <p className="font-black text-slate-900 leading-tight">
                              {center.name}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-8 py-6">
                        <Badge
                          variant="outline"
                          className="text-[10px] font-black uppercase tracking-tighter rounded-md py-0.5 bg-white border-slate-200 text-slate-600"
                        >
                          {center.code}
                        </Badge>
                      </td>
                      <td className="px-8 py-6">
                        <p className="text-sm text-slate-500 max-w-[300px] truncate">
                          {center.description || "—"}
                        </p>
                      </td>
                      <td className="px-8 py-6">
                        {center.isActive ? (
                          <Badge className="bg-emerald-50 text-emerald-600 border-emerald-100 hover:bg-emerald-100 rounded-full py-0.5 px-3 font-black text-[10px] flex items-center gap-1 w-fit">
                            <CheckCircle2 className="w-3 h-3" /> ACTIVE
                          </Badge>
                        ) : (
                          <Badge className="bg-slate-50 text-slate-400 border-slate-100 hover:bg-slate-100 rounded-full py-0.5 px-3 font-black text-[10px] flex items-center gap-1 w-fit">
                            <XCircle className="w-3 h-3" /> INACTIVE
                          </Badge>
                        )}
                      </td>
                      <td className="px-8 py-6 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="w-8 h-8 rounded-lg hover:bg-white hover:shadow-md hover:text-indigo-600 transition-all"
                            onClick={() => handleOpenDialog(center)}
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="w-8 h-8 rounded-lg"
                              >
                                <MoreVertical className="w-4 h-4 text-slate-400" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent
                              align="end"
                              className="rounded-xl border-slate-100 shadow-2xl p-1 w-48"
                            >
                              <DropdownMenuItem
                                className="rounded-lg gap-2 font-bold text-slate-600 focus:text-slate-900 focus:bg-slate-50"
                                onClick={() => handleOpenDialog(center)}
                              >
                                <Pencil className="w-3.5 h-3.5" /> Edit Details
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                className="rounded-lg gap-2 font-bold text-slate-600 focus:text-slate-900 focus:bg-slate-50"
                                onClick={() =>
                                  updateCostCenter.mutateAsync({
                                    id: center.id,
                                    isActive: !center.isActive,
                                  })
                                }
                              >
                                {center.isActive ? "Deactivate" : "Activate"}
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                className="rounded-lg gap-2 font-bold text-red-600 focus:text-red-700 focus:bg-red-50"
                                onClick={() => handleDelete(center.id)}
                              >
                                <Trash2 className="w-3.5 h-3.5" /> Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl rounded-[2.5rem] border-none shadow-2xl p-0 overflow-hidden">
          <DialogHeader className="bg-slate-900 text-white px-8 py-10 pb-12">
            <div className="w-12 h-12 rounded-2xl bg-white/10 flex items-center justify-center mb-4 border border-white/20">
              <Briefcase className="w-6 h-6 text-white" />
            </div>
            <DialogTitle className="text-2xl font-black">
              {editingCenter ? "Edit Cost Center" : "Add Cost Center"}
            </DialogTitle>
            <p className="text-slate-400 font-medium mt-1">
              Configure accounting segregation code and metadata
            </p>
          </DialogHeader>

          <CardContent className="p-8 space-y-6 -mt-8 bg-white rounded-t-[2rem]">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-400">
                  Cost Center Name
                </Label>
                <Input
                  value={formData.name || ""}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                  placeholder="e.g. Marketing, R&D"
                  className="rounded-xl border-slate-200 h-11"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-400">
                  Cost Center Code
                </Label>
                <Input
                  value={formData.code || ""}
                  onChange={(e) =>
                    setFormData({ ...formData, code: e.target.value.toUpperCase() })
                  }
                  placeholder="e.g. MKT, RD"
                  className="rounded-xl border-slate-200 h-11 font-mono"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-400">
                Description / Memo
              </Label>
              <Input
                value={formData.description || ""}
                onChange={(e) =>
                  setFormData({ ...formData, description: e.target.value })
                }
                placeholder="Brief details about cost center"
                className="rounded-xl border-slate-200 h-11"
              />
            </div>
          </CardContent>

          <DialogFooter className="bg-slate-50 px-8 py-6 gap-3">
            <Button
              variant="ghost"
              onClick={() => setIsDialogOpen(false)}
              className="rounded-xl font-bold"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={createCostCenter.isPending || updateCostCenter.isPending}
              className="rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white px-8 font-black shadow-lg shadow-indigo-100"
            >
              {createCostCenter.isPending || updateCostCenter.isPending ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Plus className="w-4 h-4 mr-2" />
              )}
              {editingCenter ? "Update Center" : "Create Center"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
