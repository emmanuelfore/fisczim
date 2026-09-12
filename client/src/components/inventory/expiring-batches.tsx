import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
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
import { Calendar, AlertTriangle, ShieldAlert } from "lucide-react";
import { format } from "date-fns";

export function ExpiringBatchesDashboard({ companyId }: { companyId: number }) {
  const { data: batches = [], isLoading } = useQuery<any[]>({
    queryKey: ["expiring-batches", companyId],
    queryFn: async () => {
      const res = await apiFetch(`/api/inventory/expiring-batches?companyId=${companyId}&days=90`);
      if (!res.ok) throw new Error("Failed to fetch expiring batches");
      return res.json();
    },
    enabled: !!companyId,
  });

  return (
    <Card className="border-none shadow-xl bg-white rounded-[2rem] overflow-hidden">
      <CardHeader className="p-8 border-b border-slate-50 flex flex-row items-center justify-between bg-slate-50/30">
        <div>
          <CardTitle className="text-xl font-black text-slate-900 font-display uppercase tracking-tight flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-red-500" />
            Expiring Batches (Next 90 Days)
          </CardTitle>
          <CardDescription className="text-slate-400 font-medium">
            Monitor and prioritize stock nearing expiration
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader className="bg-slate-50/80 hover:bg-slate-50/80 border-b border-slate-100">
            <TableRow>
              <TableHead className="p-6 font-bold text-slate-400 uppercase tracking-widest text-[10px]">
                Product
              </TableHead>
              <TableHead className="p-6 font-bold text-slate-400 uppercase tracking-widest text-[10px]">
                Batch Number
              </TableHead>
              <TableHead className="p-6 font-bold text-slate-400 uppercase tracking-widest text-[10px] text-right">
                Stock Level
              </TableHead>
              <TableHead className="p-6 font-bold text-slate-400 uppercase tracking-widest text-[10px]">
                Expiry Date
              </TableHead>
              <TableHead className="p-6 font-bold text-slate-400 uppercase tracking-widest text-[10px]">
                Status
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className="divide-y divide-slate-50">
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={5} className="p-12 text-center text-slate-400">
                  <div className="flex flex-col items-center justify-center gap-4">
                    <div className="w-8 h-8 border-4 border-emerald-400 border-t-transparent rounded-full animate-spin" />
                    <span className="font-bold text-slate-400 uppercase tracking-widest text-[10px]">
                      Loading expiring batches...
                    </span>
                  </div>
                </TableCell>
              </TableRow>
            ) : batches.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="p-12 text-center text-slate-400 font-medium">
                  No expiring batches found in the next 90 days.
                </TableCell>
              </TableRow>
            ) : (
              batches.map((b: any) => {
                const expiryDate = new Date(b.expiryDate);
                const isExpired = expiryDate < new Date();
                const daysUntilExpiry = Math.ceil((expiryDate.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));

                return (
                  <TableRow
                    key={b.id}
                    className="group hover:bg-slate-50/50 transition-colors duration-200"
                  >
                    <TableCell className="p-6">
                      <div className="font-bold text-slate-800 text-lg leading-tight">
                        {b.productName}
                      </div>
                    </TableCell>
                    <TableCell className="p-6 font-mono text-slate-700">
                      {b.batchNumber}
                    </TableCell>
                    <TableCell className="p-6 text-right font-black text-slate-700 font-mono">
                      {Number(b.stockLevel).toFixed(2)}
                    </TableCell>
                    <TableCell className="p-6">
                      <div className="flex items-center gap-2 text-slate-600 font-medium">
                        <Calendar className="w-4 h-4 text-slate-400" />
                        {format(expiryDate, "dd MMM yyyy")}
                      </div>
                    </TableCell>
                    <TableCell className="p-6">
                      {isExpired ? (
                        <span className="px-3 py-1 bg-red-50 text-red-600 text-[10px] font-black uppercase rounded-full tracking-tighter border border-red-100 inline-flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" />
                          Expired
                        </span>
                      ) : daysUntilExpiry <= 30 ? (
                        <span className="px-3 py-1 bg-rose-50 text-rose-600 text-[10px] font-black uppercase rounded-full tracking-tighter border border-rose-100 inline-flex items-center gap-1">
                          Expires in {daysUntilExpiry} days
                        </span>
                      ) : (
                        <span className="px-3 py-1 bg-amber-50 text-amber-600 text-[10px] font-black uppercase rounded-full tracking-tighter border border-amber-100 inline-flex items-center gap-1">
                          Expires in {daysUntilExpiry} days
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
