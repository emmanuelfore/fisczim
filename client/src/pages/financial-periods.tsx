import { useState } from "react";
import { Layout } from "@/components/layout";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Calendar, Plus, Lock, Unlock, ShieldAlert, AlertTriangle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";

export default function FinancialPeriodsPage() {
  const [isOpen, setIsOpen] = useState(false);
  const [isSweepOpen, setIsSweepOpen] = useState(false);
  const [sweepDate, setSweepDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [formData, setFormData] = useState({
    name: "",
    startDate: "",
    endDate: ""
  });

  const { data: periods, isLoading } = useQuery<any[]>({
    queryKey: ["/api/accounting/periods"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/accounting/periods", {
        ...data,
        startDate: new Date(data.startDate).toISOString(),
        endDate: new Date(data.endDate).toISOString(),
        status: "OPEN"
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Financial period created." });
      setIsOpen(false);
      queryClient.invalidateQueries({ queryKey: ["/api/accounting/periods"] });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, status }: { id: number, status: string }) => {
      const res = await apiRequest("PATCH", `/api/accounting/periods/${id}/toggle`, { status });
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "Updated", description: `Period is now ${data.status.toLowerCase()}.` });
      queryClient.invalidateQueries({ queryKey: ["/api/accounting/periods"] });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  });

  const sweepMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/accounting/periods/year-end-close", { asOfDate: sweepDate });
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "Success", description: data.message });
      setIsSweepOpen(false);
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" })
  });

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-800">
              <Calendar className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold font-display text-slate-800">Financial Periods</h1>
              <p className="text-sm text-slate-500">Manage opening and closing of accounting periods</p>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <Dialog open={isSweepOpen} onOpenChange={setIsSweepOpen}>
              <DialogTrigger asChild>
                <Button variant="destructive" className="rounded-xl font-bold gap-2">
                  <AlertTriangle className="h-4 w-4" />
                  Run Year-End Close
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle className="text-rose-600 flex items-center gap-2"><AlertTriangle className="h-5 w-5"/> Year-End Closing Sweep</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 pt-4">
                  <div className="bg-rose-50 text-rose-800 p-3 rounded-lg border border-rose-200 text-sm font-medium">
                    Warning: This action is permanent. It will calculate the balance of all Revenue and Expense accounts up to the selected date, zero them out, and transfer the net difference into Retained Earnings.
                  </div>
                  <div className="space-y-2">
                    <Label>Cut-off Date (As of Date)</Label>
                    <Input type="date" value={sweepDate} onChange={e => setSweepDate(e.target.value)} />
                  </div>
                  <Button 
                    variant="destructive"
                    className="w-full mt-2 font-bold" 
                    onClick={() => sweepMutation.mutate()}
                    disabled={sweepMutation.isPending}
                  >
                    Confirm & Execute Sweep
                  </Button>
                </div>
              </DialogContent>
            </Dialog>

            <Dialog open={isOpen} onOpenChange={setIsOpen}>
              <DialogTrigger asChild>
                <Button className="rounded-xl font-bold gap-2">
                  <Plus className="h-4 w-4" />
                  Create Period
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create Financial Period</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 pt-4">
                  <div className="bg-amber-50 text-amber-800 p-3 rounded-lg flex gap-3 items-start border border-amber-200">
                    <ShieldAlert className="h-5 w-5 shrink-0 mt-0.5" />
                    <p className="text-sm font-medium">Periods act as posting guards. If a date falls within a CLOSED period, no journal entries can be posted on that date.</p>
                  </div>
                  <div className="space-y-2">
                    <Label>Period Name (e.g. 'January 2026')</Label>
                    <Input value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} placeholder="January 2026" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Start Date</Label>
                      <Input type="date" value={formData.startDate} onChange={e => setFormData({...formData, startDate: e.target.value})} />
                    </div>
                    <div className="space-y-2">
                      <Label>End Date</Label>
                      <Input type="date" value={formData.endDate} onChange={e => setFormData({...formData, endDate: e.target.value})} />
                    </div>
                  </div>
                  <Button 
                    className="w-full mt-2" 
                    onClick={() => createMutation.mutate(formData)}
                    disabled={createMutation.isPending || !formData.name || !formData.startDate || !formData.endDate}
                  >
                    Create OPEN Period
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <Card className="rounded-2xl border-slate-200">
          <CardContent className="p-0">
            <Table>
              <TableHeader className="bg-slate-50/50">
                <TableRow>
                  <TableHead className="pl-6 font-bold text-slate-800">Period Name</TableHead>
                  <TableHead>Dates</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right pr-6">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={4} className="h-32 text-center">Loading periods...</TableCell></TableRow>
                ) : periods?.length === 0 ? (
                  <TableRow><TableCell colSpan={4} className="h-32 text-center text-slate-500">No financial periods created.</TableCell></TableRow>
                ) : (
                  periods?.map((p: any) => (
                    <TableRow key={p.id}>
                      <TableCell className="pl-6 font-bold text-slate-800">{p.name}</TableCell>
                      <TableCell className="text-slate-600 font-mono text-xs">
                        {format(new Date(p.startDate), "dd MMM yyyy")} - {format(new Date(p.endDate), "dd MMM yyyy")}
                      </TableCell>
                      <TableCell>
                        {p.status === "OPEN" ? (
                          <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">
                            <Unlock className="h-3 w-3 mr-1" /> OPEN
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="bg-rose-50 text-rose-700 border-rose-200">
                            <Lock className="h-3 w-3 mr-1" /> CLOSED
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right pr-6">
                        {p.status === "OPEN" ? (
                          <Button 
                            variant="outline" 
                            size="sm" 
                            className="h-8 rounded-lg text-rose-600 hover:text-rose-700 hover:bg-rose-50 border-rose-200"
                            onClick={() => toggleMutation.mutate({ id: p.id, status: "CLOSED" })}
                            disabled={toggleMutation.isPending}
                          >
                            <Lock className="h-3.5 w-3.5 mr-1" /> Close Period
                          </Button>
                        ) : (
                          <Button 
                            variant="outline" 
                            size="sm" 
                            className="h-8 rounded-lg text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 border-emerald-200"
                            onClick={() => toggleMutation.mutate({ id: p.id, status: "OPEN" })}
                            disabled={toggleMutation.isPending}
                          >
                            <Unlock className="h-3.5 w-3.5 mr-1" /> Reopen Period
                          </Button>
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
