import React, { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useActiveCompany } from "@/hooks/use-active-company";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { HRLayout } from "./layout";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Plus, DollarSign, Briefcase, Loader2, RefreshCw } from "lucide-react";

// The shape of the data
type PayGrade = {
  id: number;
  code: string;
  name: string;
  minSalary: number;
  midpointSalary: number;
  maxSalary: number;
};

// Zod schema
const formSchema = z.object({
  code: z.string().min(1, "Code is required"),
  name: z.string().min(1, "Name is required"),
  minSalary: z.coerce.number().min(0, "Must be >= 0"),
  midpointSalary: z.coerce.number().min(0, "Must be >= 0"),
  maxSalary: z.coerce.number().min(0, "Must be >= 0"),
});

export default function PayGradesPage() {
  const { activeCompanyId } = useActiveCompany();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);

  const { data: payGrades = [], isLoading, refetch } = useQuery<PayGrade[]>({
    queryKey: [`/api/companies/${activeCompanyId}/payroll/pay-grades`],
    enabled: !!activeCompanyId,
  });

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      code: "",
      name: "",
      minSalary: 0,
      midpointSalary: 0,
      maxSalary: 0,
    },
  });

  const createMutation = useMutation({
    mutationFn: async (values: z.infer<typeof formSchema>) => {
      const res = await apiRequest("POST", `/api/companies/${activeCompanyId}/payroll/pay-grades`, values);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Pay grade created successfully." });
      queryClient.invalidateQueries({ queryKey: [`/api/companies/${activeCompanyId}/payroll/pay-grades`] });
      setOpen(false);
      form.reset();
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const onSubmit = (values: z.infer<typeof formSchema>) => {
    createMutation.mutate(values);
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(value);
  };

  return (
    <HRLayout>
      <div className="flex flex-col space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent flex items-center gap-2">
              <Briefcase className="w-8 h-8 text-blue-600" />
              Pay Grades
            </h1>
            <p className="text-muted-foreground mt-2">
              Manage salary structures and pay grades for your organization.
            </p>
          </div>

          <div className="flex items-center space-x-2">
            <Button variant="outline" size="icon" onClick={() => refetch()}>
              <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
            </Button>
            <Dialog open={open} onOpenChange={(val) => { setOpen(val); if (!val) form.reset(); }}>
              <DialogTrigger asChild>
                <Button className="bg-blue-600 hover:bg-blue-700 text-white shadow-md transition-all">
                  <Plus className="mr-2 h-4 w-4" />
                  Create New
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                  <DialogTitle>Create Pay Grade</DialogTitle>
                  <DialogDescription>
                    Define the salary bands for a new pay grade.
                  </DialogDescription>
                </DialogHeader>

                <Form {...form}>
                  <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="code"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Code</FormLabel>
                            <FormControl>
                              <Input placeholder="e.g. PG1" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="name"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Name</FormLabel>
                            <FormControl>
                              <Input placeholder="e.g. Executive" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <FormField
                      control={form.control}
                      name="minSalary"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Minimum Salary</FormLabel>
                          <FormControl>
                            <div className="relative">
                              <DollarSign className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                              <Input type="number" step="0.01" className="pl-9" {...field} />
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="midpointSalary"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Midpoint Salary</FormLabel>
                          <FormControl>
                            <div className="relative">
                              <DollarSign className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                              <Input type="number" step="0.01" className="pl-9" {...field} />
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="maxSalary"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Maximum Salary</FormLabel>
                          <FormControl>
                            <div className="relative">
                              <DollarSign className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                              <Input type="number" step="0.01" className="pl-9" {...field} />
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="flex justify-end space-x-2 pt-4">
                      <Button variant="outline" onClick={() => setOpen(false)} type="button">
                        Cancel
                      </Button>
                      <Button type="submit" disabled={createMutation.isPending} className="bg-blue-600 hover:bg-blue-700 text-white">
                        {createMutation.isPending ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Saving...
                          </>
                        ) : (
                          "Save Pay Grade"
                        )}
                      </Button>
                    </div>
                  </form>
                </Form>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <div className="rounded-xl border bg-card text-card-foreground shadow-sm overflow-hidden">
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow>
                <TableHead className="font-semibold text-foreground">Code</TableHead>
                <TableHead className="font-semibold text-foreground">Name</TableHead>
                <TableHead className="font-semibold text-foreground text-right">Min Salary</TableHead>
                <TableHead className="font-semibold text-foreground text-right">Midpoint Salary</TableHead>
                <TableHead className="font-semibold text-foreground text-right">Max Salary</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-32 text-center">
                    <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                  </TableCell>
                </TableRow>
              ) : !payGrades?.length ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-32 text-center text-muted-foreground">
                    No pay grades found. Click "Create New" to add one.
                  </TableCell>
                </TableRow>
              ) : (
                payGrades.map((grade) => (
                  <TableRow key={grade.id} className="hover:bg-muted/50 transition-colors">
                    <TableCell className="font-medium">{grade.code}</TableCell>
                    <TableCell>{grade.name}</TableCell>
                    <TableCell className="text-right text-muted-foreground">{formatCurrency(grade.minSalary)}</TableCell>
                    <TableCell className="text-right text-muted-foreground">{formatCurrency(grade.midpointSalary)}</TableCell>
                    <TableCell className="text-right text-muted-foreground">{formatCurrency(grade.maxSalary)}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </HRLayout>
  );
}
