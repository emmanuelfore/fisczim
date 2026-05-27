import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useCreateBusRoute } from "@/hooks/use-bus-ticketing";
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
import { MapPin, Loader2, Route } from "lucide-react";
import { useState } from "react";
import { z } from "zod";

const routeFormSchema = z.object({
    companyId: z.number(),
    name: z.string().min(1, "Route name is required"),
    origin: z.string().min(1, "Origin is required"),
    destination: z.string().min(1, "Destination is required"),
    distanceKm: z.coerce.number().min(0).default(0),
    basePrice: z.coerce.number().min(0, "Base price cannot be negative"),
    currency: z.enum(["USD", "ZWG"]).default("USD"),
    isActive: z.boolean().default(true),
});

export function CreateRouteDialog({ companyId }: { companyId: number }) {
    const [open, setOpen] = useState(false);
    const createRoute = useCreateBusRoute();

    const form = useForm({
        resolver: zodResolver(routeFormSchema),
        defaultValues: {
            name: "",
            origin: "",
            destination: "",
            distanceKm: 0,
            basePrice: 0,
            currency: "USD",
            companyId: companyId,
            isActive: true,
        },
    });

    const onSubmit = async (data: any) => {
        try {
            await createRoute.mutateAsync(data);
            setOpen(false);
            form.reset();
        } catch (error) {
            console.error("Failed to create route:", error);
        }
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button variant="outline" className="gap-2 border-dashed border-2 hover:border-orange-500 hover:text-orange-600 transition-all rounded-xl">
                    <Route className="w-4 h-4" />
                    New Route
                </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md rounded-3xl">
                <DialogHeader>
                    <DialogTitle className="text-2xl font-display font-bold text-slate-900 flex items-center gap-2">
                        <Route className="w-6 h-6 text-orange-500" />
                        Create New Route
                    </DialogTitle>
                    <DialogDescription>
                        Define a new route with its origin, destination and base price.
                    </DialogDescription>
                </DialogHeader>

                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-4">
                        <FormField
                            control={form.control}
                            name="name"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel className="text-slate-700 font-semibold">Route Name</FormLabel>
                                    <FormControl>
                                        <Input placeholder="e.g. Harare - Bulawayo" {...field} className="rounded-xl bg-slate-50 border-slate-200" />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <div className="grid grid-cols-2 gap-4">
                            <FormField
                                control={form.control}
                                name="origin"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel className="text-slate-700 font-semibold text-xs flex items-center gap-1">
                                            <MapPin className="w-3 h-3 text-emerald-500" /> Origin
                                        </FormLabel>
                                        <FormControl>
                                            <Input placeholder="Start point" {...field} className="rounded-xl bg-slate-50 border-slate-200" />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <FormField
                                control={form.control}
                                name="destination"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel className="text-slate-700 font-semibold text-xs flex items-center gap-1">
                                            <MapPin className="w-3 h-3 text-red-500" /> Destination
                                        </FormLabel>
                                        <FormControl>
                                            <Input placeholder="End point" {...field} className="rounded-xl bg-slate-50 border-slate-200" />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <FormField
                                control={form.control}
                                name="distanceKm"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel className="text-slate-700 font-semibold">Distance (Km)</FormLabel>
                                        <FormControl>
                                            <Input type="number" {...field} onChange={e => field.onChange(parseFloat(e.target.value))} className="rounded-xl bg-slate-50 border-slate-200" />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <FormField
                                control={form.control}
                                name="basePrice"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel className="text-slate-700 font-semibold">Base Price ($)</FormLabel>
                                        <FormControl>
                                            <Input type="number" step="0.01" {...field} onChange={e => field.onChange(parseFloat(e.target.value))} className="rounded-xl bg-slate-50 border-slate-200" />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        </div>

                        <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                            <Button type="button" variant="outline" onClick={() => setOpen(false)} className="rounded-xl border-slate-200">
                                Cancel
                            </Button>
                            <Button type="submit" disabled={createRoute.isPending} className="rounded-xl bg-orange-600 hover:bg-orange-700 text-white">
                                {createRoute.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                                Save Route
                            </Button>
                        </div>
                    </form>
                </Form>
            </DialogContent>
        </Dialog>
    );
}
