import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Textarea } from "@/components/ui/textarea";
import { useActiveCompany } from "@/hooks/use-active-company";

const timeConfirmationSchema = z.object({
  workCenterId: z.coerce.number().min(1, "Work Center is required"),
  employeeId: z.union([z.coerce.number(), z.literal("none")]).optional().nullable(),
  hours: z.coerce.number().min(0.01, "Hours must be greater than 0"),
  notes: z.string().optional(),
});

export function TimeConfirmationForm({ productionRunId, onSuccess }: { productionRunId: number, onSuccess?: () => void }) {
  const { activeCompanyId: companyId } = useActiveCompany();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: workCenters } = useQuery({
    queryKey: [`/api/companies/${companyId}/manufacturing/work-centers`],
    enabled: !!companyId,
  });

  const { data: employees } = useQuery({
    queryKey: [`/api/companies/${companyId}/employees`],
    enabled: !!companyId,
  });

  const form = useForm<z.infer<typeof timeConfirmationSchema>>({
    resolver: zodResolver(timeConfirmationSchema),
    defaultValues: {
      hours: 1,
    }
  });

  const mutation = useMutation({
    mutationFn: async (data: z.infer<typeof timeConfirmationSchema>) => {
      const payload = { ...data };
      if (!payload.employeeId || payload.employeeId.toString() === "none") delete payload.employeeId;
      
      const res = await apiRequest("POST", `/api/companies/${companyId}/manufacturing/production-runs/${productionRunId}/time-confirmations`, payload);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/companies/${companyId}/manufacturing/production-runs/${productionRunId}`] });
      toast({ title: "Success", description: "Time logged successfully." });
      form.reset();
      if (onSuccess) onSuccess();
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  });

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit((d) => mutation.mutate(d))} className="space-y-4">
        
        <FormField control={form.control} name="workCenterId" render={({ field }) => (
          <FormItem>
            <FormLabel>Work Center</FormLabel>
            <Select onValueChange={field.onChange} value={field.value?.toString() || ""}>
              <FormControl><SelectTrigger><SelectValue placeholder="Select work center..." /></SelectTrigger></FormControl>
              <SelectContent>
                {(workCenters as any[])?.map((wc: any) => (
                  <SelectItem key={wc.id} value={wc.id.toString()}>{wc.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FormMessage />
          </FormItem>
        )} />

        <FormField control={form.control} name="employeeId" render={({ field }) => (
          <FormItem>
            <FormLabel>Employee (Optional)</FormLabel>
            <Select onValueChange={field.onChange} value={field.value?.toString() || ""}>
              <FormControl><SelectTrigger><SelectValue placeholder="Select employee..." /></SelectTrigger></FormControl>
              <SelectContent>
                <SelectItem value="none">None (Generic Center Time)</SelectItem>
                {(employees as any[])?.map((emp: any) => (
                  <SelectItem key={emp.id} value={emp.id.toString()}>{emp.firstName} {emp.lastName}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FormMessage />
          </FormItem>
        )} />

        <FormField control={form.control} name="hours" render={({ field }) => (
          <FormItem>
            <FormLabel>Hours Spent</FormLabel>
            <FormControl><Input type="number" step="any" {...field} /></FormControl>
            <FormMessage />
          </FormItem>
        )} />

        <FormField control={form.control} name="notes" render={({ field }) => (
          <FormItem>
            <FormLabel>Notes (Optional)</FormLabel>
            <FormControl><Textarea {...field} value={field.value || ""} /></FormControl>
            <FormMessage />
          </FormItem>
        )} />

        <Button type="submit" className="w-full" disabled={mutation.isPending}>
          {mutation.isPending ? "Logging..." : "Log Time"}
        </Button>
      </form>
    </Form>
  );
}
