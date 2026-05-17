import { Layout } from "@/components/layout";
import { useQuery } from "@tanstack/react-query";
import { type Account } from "@shared/schema";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, Search, Filter } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";

export default function AccountingCOAPage() {
  const [searchTerm, setSearchState] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [formData, setFormData] = useState({
    code: "",
    name: "",
    description: "",
    type: "ASSET",
    category: "Current Assets"
  });

  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const companyId = user?.companyId || 1;

  const { data: accounts, isLoading } = useQuery<Account[]>({
    queryKey: ["/api/accounting/accounts"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const res = await apiRequest("POST", `/api/companies/${companyId}/accounting/accounts`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/accounting/accounts"] });
      toast({ title: "Success", description: "Account created successfully" });
      setIsDialogOpen(false);
      setFormData({ code: "", name: "", description: "", type: "ASSET", category: "Current Assets" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to create account", variant: "destructive" });
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate(formData);
  };

  const filteredAccounts = accounts?.filter(acc => 
    acc.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    acc.code.includes(searchTerm) ||
    acc.type.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getTypeBadgeColor = (type: string) => {
    switch (type) {
      case "ASSET": return "bg-blue-100 text-blue-800 border-blue-200";
      case "LIABILITY": return "bg-amber-100 text-amber-800 border-amber-200";
      case "EQUITY": return "bg-purple-100 text-purple-800 border-purple-200";
      case "REVENUE": return "bg-emerald-100 text-emerald-800 border-emerald-200";
      case "EXPENSE": return "bg-rose-100 text-rose-800 border-rose-200";
      default: return "bg-slate-100 text-slate-800 border-slate-200";
    }
  };

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
                placeholder="Search accounts by name, code or type..."
                className="pl-9 h-11 bg-white border-slate-200 rounded-xl shadow-sm focus:ring-primary/20"
                value={searchTerm}
                onChange={(e) => setSearchState(e.target.value)}
              />
            </div>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button className="h-11 px-6 rounded-xl font-bold bg-primary hover:bg-primary/90 text-white shadow-lg shadow-primary/20 transition-all active:scale-95 flex items-center gap-2">
                <Plus className="h-4 w-4" />
                <span>Create Account</span>
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
              <DialogHeader>
                <DialogTitle>Create New Account</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4 pt-4">
                <div className="space-y-2">
                  <Label>Account Code</Label>
                  <Input 
                    required 
                    value={formData.code} 
                    onChange={e => setFormData(p => ({ ...p, code: e.target.value }))}
                    placeholder="e.g. 1000" 
                  />
                </div>
                <div className="space-y-2">
                  <Label>Account Name</Label>
                  <Input 
                    required 
                    value={formData.name} 
                    onChange={e => setFormData(p => ({ ...p, name: e.target.value }))}
                    placeholder="e.g. Cash in Bank" 
                  />
                </div>
                <div className="space-y-2">
                  <Label>Account Type</Label>
                  <Select value={formData.type} onValueChange={v => setFormData(p => ({ ...p, type: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ASSET">Asset</SelectItem>
                      <SelectItem value="LIABILITY">Liability</SelectItem>
                      <SelectItem value="EQUITY">Equity</SelectItem>
                      <SelectItem value="REVENUE">Revenue</SelectItem>
                      <SelectItem value="EXPENSE">Expense</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Category</Label>
                  <Input 
                    required 
                    value={formData.category} 
                    onChange={e => setFormData(p => ({ ...p, category: e.target.value }))}
                    placeholder="e.g. Current Assets" 
                  />
                </div>
                <div className="space-y-2">
                  <Label>Description (Optional)</Label>
                  <Input 
                    value={formData.description} 
                    onChange={e => setFormData(p => ({ ...p, description: e.target.value }))}
                    placeholder="Brief description of the account purpose" 
                  />
                </div>
                <div className="pt-4 flex justify-end gap-3">
                  <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
                  <Button type="submit" className="bg-primary text-white" disabled={createMutation.isPending}>
                    {createMutation.isPending ? "Creating..." : "Create Account"}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <Card className="border-slate-200/60 shadow-sm overflow-hidden rounded-2xl">
          <CardHeader className="bg-white border-b border-slate-100 px-6 py-5">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg font-bold text-slate-800 font-display">Financial Chart of Accounts</CardTitle>
              <Badge variant="outline" className="bg-slate-50 text-slate-500 font-bold border-slate-200 px-3 py-1 rounded-lg">
                {filteredAccounts?.length || 0} Accounts Total
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader className="bg-slate-50/50">
                <TableRow className="hover:bg-transparent border-slate-100">
                  <TableHead className="w-[120px] font-bold text-slate-500 uppercase text-[11px] tracking-wider pl-6">Code</TableHead>
                  <TableHead className="font-bold text-slate-500 uppercase text-[11px] tracking-wider">Account Name</TableHead>
                  <TableHead className="font-bold text-slate-500 uppercase text-[11px] tracking-wider">Type / Category</TableHead>
                  <TableHead className="font-bold text-slate-500 uppercase text-[11px] tracking-wider">Status</TableHead>
                  <TableHead className="text-right pr-6 font-bold text-slate-500 uppercase text-[11px] tracking-wider">System</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i} className="animate-pulse border-slate-50">
                      <TableCell colSpan={5} className="h-16 bg-slate-50/20" />
                    </TableRow>
                  ))
                ) : filteredAccounts?.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="h-32 text-center text-slate-400 font-medium">
                      No accounts found matching your search.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredAccounts?.map((account) => (
                    <TableRow key={account.id} className="hover:bg-slate-50/50 border-slate-50 transition-colors group">
                      <TableCell className="font-bold text-slate-900 pl-6 group-hover:text-primary transition-colors">
                        {account.code}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-bold text-slate-700">{account.name}</span>
                          <span className="text-[11px] text-slate-400 font-medium">{account.description || "No description"}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1.5">
                          <Badge className={cn("w-fit px-2 py-0 h-5 text-[10px] font-black border uppercase tracking-wider shadow-none", getTypeBadgeColor(account.type))}>
                            {account.type}
                          </Badge>
                          <span className="text-[11px] text-slate-400 font-bold ml-1">{account.category}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={cn("px-2 py-0 h-5 text-[10px] font-black border uppercase tracking-wider", account.isActive ? "bg-emerald-50 text-emerald-600 border-emerald-100" : "bg-slate-100 text-slate-400 border-slate-200")}>
                          {account.isActive ? "Active" : "Archived"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right pr-6">
                        {account.isSystem ? (
                          <Badge className="bg-amber-50 text-amber-600 border-amber-100 font-black text-[9px] uppercase px-2 py-0">Lock</Badge>
                        ) : (
                          <span className="text-[10px] text-slate-300 font-bold uppercase tracking-widest">Custom</span>
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
