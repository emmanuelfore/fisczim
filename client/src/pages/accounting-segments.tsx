import { useState } from "react";
import { Layout } from "@/components/layout";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  Layers,
  Plus,
  Search,
  Filter,
  CheckCircle2,
  XCircle,
  Building,
  Briefcase,
  GitBranch,
  FolderKanban,
  Truck,
  Globe,
  Tag,
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
import { Button } from "@/components/ui/button";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

type AccountingSegment = {
  id: number;
  companyId: number;
  type: string;
  code: string;
  name: string;
  description: string | null;
  isActive: boolean;
  createdAt: string;
};

const SEGMENT_TYPES = [
  { value: "BRANCH", label: "Branch", icon: GitBranch, color: "text-indigo-600 bg-indigo-50 border-indigo-100" },
  { value: "DEPARTMENT", label: "Department", icon: Building, color: "text-sky-600 bg-sky-50 border-sky-100" },
  { value: "PROJECT", label: "Project", icon: FolderKanban, color: "text-amber-600 bg-amber-50 border-amber-100" },
  { value: "COST_CENTER", label: "Cost Center", icon: Briefcase, color: "text-violet-600 bg-violet-50 border-violet-100" },
  { value: "VEHICLE", label: "Vehicle/Fleet", icon: Truck, color: "text-emerald-600 bg-emerald-50 border-emerald-100" },
  { value: "CHANNEL", label: "Sales Channel", icon: Globe, color: "text-rose-600 bg-rose-50 border-rose-100" },
  { value: "CUSTOM", label: "Custom Dimension", icon: Tag, color: "text-slate-600 bg-slate-50 border-slate-100" },
];

export default function AccountingSegmentsPage() {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("ALL");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [newSegment, setNewSegment] = useState({
    type: "BRANCH",
    code: "",
    name: "",
    description: "",
  });

  const { data: segments, isLoading } = useQuery<AccountingSegment[]>({
    queryKey: ["/api/accounting/segments"],
  });

  const createSegmentMutation = useMutation({
    mutationFn: async (payload: typeof newSegment) => {
      const res = await apiRequest("POST", "/api/accounting/segments", payload);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "Failed to create accounting segment");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Accounting Segment Created",
        description: `Successfully added ${newSegment.name} as a ${newSegment.type.toLowerCase()} dimension.`,
      });
      setIsOpen(false);
      setNewSegment({ type: "BRANCH", code: "", name: "", description: "" });
      queryClient.invalidateQueries({ queryKey: ["/api/accounting/segments"] });
    },
    onError: (err: any) => {
      toast({
        title: "Error creating segment",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSegment.code.trim()) {
      toast({ title: "Code is required", variant: "destructive" });
      return;
    }
    if (!newSegment.name.trim()) {
      toast({ title: "Name is required", variant: "destructive" });
      return;
    }
    createSegmentMutation.mutate(newSegment);
  };

  const filteredSegments = segments?.filter((seg) => {
    const matchesSearch =
      seg.name.toLowerCase().includes(search.toLowerCase()) ||
      seg.code.toLowerCase().includes(search.toLowerCase()) ||
      (seg.description && seg.description.toLowerCase().includes(search.toLowerCase()));

    const matchesType = typeFilter === "ALL" || seg.type === typeFilter;
    return matchesSearch && matchesType;
  });

  const getTypeMetadata = (type: string) => {
    return (
      SEGMENT_TYPES.find((t) => t.value === type) || {
        label: type,
        icon: Tag,
        color: "text-slate-600 bg-slate-50 border-slate-100",
      }
    );
  };

  return (
    <Layout hideHeaderTitle>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary shadow-sm border border-primary/5">
              <Layers className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold font-display text-slate-800">
                Accounting Segments (Dimensions)
              </h1>
              <p className="text-sm text-slate-500">
                Configure organizational units and tracking segments for multi-dimensional reporting without exploding your COA.
              </p>
            </div>
          </div>

          <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
              <Button className="h-11 px-5 rounded-xl font-bold bg-primary hover:bg-primary/90 text-white shadow-lg shadow-primary/10 transition-all active:scale-95 flex items-center gap-2">
                <Plus className="h-4 w-4" />
                <span>Create Segment</span>
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md rounded-2xl">
              <DialogHeader>
                <DialogTitle className="text-lg font-bold">New Accounting Segment</DialogTitle>
                <DialogDescription>
                  Define a new dimension values such as a branch location, department, or custom project.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleCreate} className="space-y-4 pt-2">
                <div className="space-y-1.5">
                  <Label htmlFor="segment-type">Segment Type</Label>
                  <Select
                    value={newSegment.type}
                    onValueChange={(val) => setNewSegment({ ...newSegment, type: val })}
                  >
                    <SelectTrigger id="segment-type" className="rounded-xl">
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      {SEGMENT_TYPES.map((type) => (
                        <SelectItem key={type.value} value={type.value}>
                          <span className="flex items-center gap-2">
                            <type.icon className="h-4 w-4 text-slate-500" />
                            {type.label}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="col-span-1 space-y-1.5">
                    <Label htmlFor="segment-code">Code</Label>
                    <Input
                      id="segment-code"
                      value={newSegment.code}
                      placeholder="e.g. HRE"
                      onChange={(e) =>
                        setNewSegment({ ...newSegment, code: e.target.value.toUpperCase() })
                      }
                      className="rounded-xl"
                    />
                  </div>
                  <div className="col-span-2 space-y-1.5">
                    <Label htmlFor="segment-name">Name</Label>
                    <Input
                      id="segment-name"
                      value={newSegment.name}
                      placeholder="Harare Branch"
                      onChange={(e) => setNewSegment({ ...newSegment, name: e.target.value })}
                      className="rounded-xl"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="segment-description">Description</Label>
                  <Textarea
                    id="segment-description"
                    value={newSegment.description}
                    placeholder="Optional notes about this segment..."
                    rows={3}
                    onChange={(e) =>
                      setNewSegment({ ...newSegment, description: e.target.value })
                    }
                    className="rounded-xl resize-none"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsOpen(false)}
                    className="rounded-xl"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={createSegmentMutation.isPending}
                    className="rounded-xl font-bold bg-primary text-white"
                  >
                    {createSegmentMutation.isPending ? "Creating..." : "Create Dimension"}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {/* Filters */}
        <div className="flex flex-col md:flex-row md:items-center gap-3 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by code, name or description..."
              className="pl-9 h-10 rounded-xl"
            />
          </div>
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-slate-400" />
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-[180px] h-10 rounded-xl">
                <SelectValue placeholder="Filter by type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Dimensions</SelectItem>
                {SEGMENT_TYPES.map((type) => (
                  <SelectItem key={type.value} value={type.value}>
                    {type.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Segments List */}
        <Card className="rounded-2xl border-slate-200 shadow-sm overflow-hidden">
          <CardContent className="p-0">
            <Table>
              <TableHeader className="bg-slate-50/70 border-b border-slate-100">
                <TableRow>
                  <TableHead className="pl-6 w-[180px]">Type</TableHead>
                  <TableHead className="w-[120px]">Code</TableHead>
                  <TableHead className="w-[240px]">Name</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="w-[120px]">Status</TableHead>
                  <TableHead className="w-[150px] text-right pr-6">Created At</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-32 text-center text-slate-400">
                      <div className="flex items-center justify-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-primary animate-ping" />
                        <span>Loading segments...</span>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : filteredSegments?.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-32 text-center text-slate-400">
                      No matching accounting dimensions found.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredSegments?.map((seg) => {
                    const meta = getTypeMetadata(seg.type);
                    return (
                      <TableRow key={seg.id} className="hover:bg-slate-50 border-slate-100">
                        <TableCell className="pl-6 py-4">
                          <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border ${meta.color}`}>
                            <meta.icon className="h-3.5 w-3.5" />
                            {meta.label}
                          </span>
                        </TableCell>
                        <TableCell className="font-mono font-bold text-slate-600">
                          {seg.code}
                        </TableCell>
                        <TableCell className="font-bold text-slate-800">
                          {seg.name}
                        </TableCell>
                        <TableCell className="text-slate-500 max-w-[300px] truncate">
                          {seg.description || <span className="text-slate-300 italic">No description</span>}
                        </TableCell>
                        <TableCell>
                          {seg.isActive ? (
                            <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-600">
                              <CheckCircle2 className="h-3.5 w-3.5" /> Active
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-xs font-bold text-slate-400">
                              <XCircle className="h-3.5 w-3.5" /> Inactive
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-right pr-6 text-slate-400 font-medium text-xs">
                          {format(new Date(seg.createdAt), "dd MMM yyyy")}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
