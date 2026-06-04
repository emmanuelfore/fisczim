import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useCreateBusVehicle } from "@/hooks/use-bus-ticketing";
import { Button } from "@/components/ui/button";
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
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Loader2, Bus } from "lucide-react";
import { useState } from "react";
import { z } from "zod";

const vehicleFormSchema = z.object({
  companyId: z.number(),
  registrationNumber: z.string().min(1, "Registration number is required"),
  fleetNumber: z.string().optional(),
  capacity: z.coerce
    .number()
    .int()
    .min(1, "Capacity must be greater than zero"),
  model: z.string().optional(),
  isActive: z.boolean().default(true),
});

export function CreateVehicleDialog({ companyId }: { companyId: number }) {
  const [open, setOpen] = useState(false);
  const createVehicle = useCreateBusVehicle();

  const form = useForm({
    resolver: zodResolver(vehicleFormSchema),
    defaultValues: {
      registrationNumber: "",
      fleetNumber: "",
      capacity: 65,
      model: "",
      companyId: companyId,
      isActive: true,
    },
  });

  const onSubmit = async (data: any) => {
    try {
      await createVehicle.mutateAsync(data);
      setOpen(false);
      form.reset();
    } catch (error) {
      console.error("Failed to create vehicle:", error);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white shadow-lg shadow-orange-500/20 rounded-xl transition-all duration-300 hover:-translate-y-0.5">
          <Plus className="w-4 h-4" />
          Add Vehicle
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md rounded-3xl">
        <DialogHeader>
          <DialogTitle className="text-2xl font-display font-bold text-slate-900 flex items-center gap-2">
            <Bus className="w-6 h-6 text-orange-500" />
            Add New Vehicle
          </DialogTitle>
          <DialogDescription>
            Register a new bus vehicle in your fleet.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="space-y-4 py-4"
          >
            <FormField
              control={form.control}
              name="registrationNumber"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-slate-700 font-semibold">
                    Registration Number (Plate)
                  </FormLabel>
                  <FormControl>
                    <Input
                      placeholder="e.g. ABC 1234"
                      {...field}
                      className="rounded-xl bg-slate-50 border-slate-200"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="fleetNumber"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-slate-700 font-semibold">
                    Fleet Number
                  </FormLabel>
                  <FormControl>
                    <Input
                      placeholder="e.g. BUS-001"
                      {...field}
                      value={field.value || ""}
                      className="rounded-xl bg-slate-50 border-slate-200"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="capacity"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-slate-700 font-semibold">
                      Capacity
                    </FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        {...field}
                        onChange={(e) =>
                          field.onChange(parseInt(e.target.value))
                        }
                        className="rounded-xl bg-slate-50 border-slate-200"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="model"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-slate-700 font-semibold">
                      Model/Make
                    </FormLabel>
                    <FormControl>
                      <Input
                        placeholder="e.g. Yutong ZK6122H"
                        {...field}
                        value={field.value || ""}
                        className="rounded-xl bg-slate-50 border-slate-200"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
                className="rounded-xl border-slate-200"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={createVehicle.isPending}
                className="rounded-xl bg-orange-600 hover:bg-orange-700 text-white"
              >
                {createVehicle.isPending && (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                )}
                Save Vehicle
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
