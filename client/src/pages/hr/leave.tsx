import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useActiveCompany } from "@/hooks/use-active-company";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, Calendar, Clock, Plane, Loader2 } from "lucide-react";
import { HRLayout } from "./layout";

export default function LeaveManagement() {
  const { activeCompanyId: companyId } = useActiveCompany();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isModalOpen, setIsModalOpen] = useState(false);
  
  const [formData, setFormData] = useState({
    employeeId: "",
    leaveType: "ANNUAL",
    startDate: "",
    endDate: "",
    reason: ""
  });

  // Reusing the general leave requests endpoint
  const { data: leaveRequests = [], isLoading: isLoadingRequests } = useQuery<any[]>({
    queryKey: [`/api/companies/${companyId}/payroll/leave/requests`],
    enabled: !!companyId,
  });

  const { data: employees = [] } = useQuery<any[]>({
    queryKey: [`/api/companies/${companyId}/payroll/employees`],
    enabled: !!companyId,
  });

  const createRequestMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const s = new Date(data.startDate);
      const e = new Date(data.endDate);
      const workingDays = Math.max(1, Math.floor((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24)) + 1);

      const res = await apiRequest("POST", `/api/companies/${companyId}/payroll/leave/requests`, {
        ...data,
        employeeId: Number(data.employeeId),
        totalDays: workingDays
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/companies/${companyId}/payroll/leave/requests`] });
      setIsModalOpen(false);
      setFormData({
        employeeId: "",
        leaveType: "ANNUAL",
        startDate: "",
        endDate: "",
        reason: ""
      });
      toast({ title: "Leave request submitted successfully" });
    },
    onError: (err: any) => {
      toast({ title: "Failed to submit request", description: err.message, variant: "destructive" });
    }
  });

  const approveLeaveMutation = useMutation({
    mutationFn: async ({ id, approve }: { id: number, approve: boolean }) => {
      const res = await apiRequest("POST", `/api/companies/${companyId}/payroll/leave/requests/${id}/approve`, { approve });
      return res.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: [`/api/companies/${companyId}/payroll/leave/requests`] });
      toast({ title: variables.approve ? "Leave Approved" : "Leave Rejected" });
    },
    onError: (err: any) => {
      toast({ title: "Action failed", description: err.message, variant: "destructive" });
    }
  });

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    createRequestMutation.mutate(formData);
  };

  const calculateDays = (start: string, end: string) => {
    if (!start || !end) return 0;
    const s = new Date(start);
    const e = new Date(end);
    if (s > e) return 0;
    // Basic calculation (does not exclude weekends/holidays yet)
    return Math.floor((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  };

  if (!companyId) return <HRLayout><div>Please select a company first.</div></HRLayout>;

  return (
    <HRLayout>
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Leave Management</h1>
          <p className="text-sm text-slate-500">Track and approve employee leave requests</p>
        </div>
        <Button onClick={() => setIsModalOpen(true)} className="bg-blue-600 hover:bg-blue-700 text-white">
          <Plus className="mr-2 h-4 w-4" /> Log Leave Request
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        <Card className="bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800 shadow-sm">
          <CardContent className="p-6 flex items-center gap-4">
            <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
              <Calendar className="h-6 w-6 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-500">Pending Requests</p>
              <h3 className="text-2xl font-bold text-slate-900 dark:text-white">
                {leaveRequests.filter((r: any) => r.status === "PENDING").length}
              </h3>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800 shadow-sm">
          <CardContent className="p-6 flex items-center gap-4">
            <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
              <Plane className="h-6 w-6 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-500">Approved (This Month)</p>
              <h3 className="text-2xl font-bold text-slate-900 dark:text-white">
                {leaveRequests.filter((r: any) => r.status === "APPROVED").length}
              </h3>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800 shadow-sm">
          <CardContent className="p-6 flex items-center gap-4">
            <div className="p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg">
              <Clock className="h-6 w-6 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-500">Employees on Leave</p>
              <h3 className="text-2xl font-bold text-slate-900 dark:text-white">
                0
              </h3>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800 shadow-sm">
        <CardHeader className="border-b border-slate-100 dark:border-slate-800 pb-4">
          <CardTitle>Recent Leave Requests</CardTitle>
          <CardDescription>All leave applications logged in the system</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-slate-50 dark:bg-slate-900/50">
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Days</TableHead>
                  <TableHead>Dates</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoadingRequests ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-32 text-center">
                      <Loader2 className="h-6 w-6 animate-spin mx-auto text-blue-500" />
                    </TableCell>
                  </TableRow>
                ) : leaveRequests.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-32 text-center text-slate-500">
                      No leave requests found.
                    </TableCell>
                  </TableRow>
                ) : (
                  leaveRequests.map((req: any) => {
                    const emp = employees.find((e: any) => e.id === req.employeeId);
                    return (
                      <TableRow key={req.id}>
                        <TableCell className="font-medium">
                          {emp ? `${emp.firstName} ${emp.lastName}` : `Emp #${req.employeeId}`}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">
                            {req.leaveType}
                          </Badge>
                        </TableCell>
                        <TableCell>{req.totalDays} days</TableCell>
                        <TableCell>
                          {new Date(req.startDate).toLocaleDateString()} - {new Date(req.endDate).toLocaleDateString()}
                        </TableCell>
                        <TableCell>
                          <Badge className={
                            req.status === "APPROVED" ? "bg-green-100 text-green-700"
                            : req.status === "REJECTED" ? "bg-rose-100 text-rose-700"
                            : "bg-slate-100 text-slate-700"
                          }>
                            {req.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {req.status === "PENDING" && (
                            <div className="flex gap-2">
                              <Button 
                                size="sm" 
                                variant="outline" 
                                className="text-green-600 hover:text-green-700 border-green-200"
                                disabled={approveLeaveMutation.isPending}
                                onClick={() => approveLeaveMutation.mutate({ id: req.id, approve: true })}
                              >
                                Approve
                              </Button>
                              <Button 
                                size="sm" 
                                variant="outline" 
                                className="text-rose-600 hover:text-rose-700 border-rose-200"
                                disabled={approveLeaveMutation.isPending}
                                onClick={() => approveLeaveMutation.mutate({ id: req.id, approve: false })}
                              >
                                Reject
                              </Button>
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Log Leave Request</DialogTitle>
            <DialogDescription>
              Submit a new leave request on behalf of an employee.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label>Employee</Label>
              <Select value={formData.employeeId} onValueChange={(v) => setFormData({...formData, employeeId: v})}>
                <SelectTrigger>
                  <SelectValue placeholder="Select Employee" />
                </SelectTrigger>
                <SelectContent>
                  {employees.filter((e: any) => e.status === "ACTIVE").map((emp: any) => (
                    <SelectItem key={emp.id} value={String(emp.id)}>
                      {emp.firstName} {emp.lastName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Leave Type</Label>
              <Select value={formData.leaveType} onValueChange={(v) => setFormData({...formData, leaveType: v})}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ANNUAL">Annual Leave</SelectItem>
                  <SelectItem value="SICK">Sick Leave</SelectItem>
                  <SelectItem value="MATERNITY">Maternity Leave</SelectItem>
                  <SelectItem value="COMPASSIONATE">Compassionate</SelectItem>
                  <SelectItem value="UNPAID">Unpaid Leave</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Start Date</Label>
                <Input type="date" required value={formData.startDate} onChange={(e) => setFormData({...formData, startDate: e.target.value})} />
              </div>
              <div className="space-y-2">
                <Label>End Date</Label>
                <Input type="date" required value={formData.endDate} onChange={(e) => setFormData({...formData, endDate: e.target.value})} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Reason (Optional)</Label>
              <Input placeholder="Enter brief reason..." value={formData.reason} onChange={(e) => setFormData({...formData, reason: e.target.value})} />
            </div>
            <div className="p-3 bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-lg flex justify-between items-center">
              <span className="text-sm font-medium">Estimated Days:</span>
              <span className="text-lg font-bold text-blue-600">{calculateDays(formData.startDate, formData.endDate)}</span>
            </div>
            <div className="flex justify-end gap-2 pt-4 border-t">
              <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={createRequestMutation.isPending || calculateDays(formData.startDate, formData.endDate) <= 0} className="bg-blue-600 hover:bg-blue-700 text-white">
                {createRequestMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Submit Request
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
    </HRLayout>
  );
}
