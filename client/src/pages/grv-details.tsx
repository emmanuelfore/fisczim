import { Layout } from "@/components/layout";
import { useRoute, useLocation, Link } from "wouter";
import { useActiveCompany } from "@/hooks/use-active-company";
import { useGrv } from "@/hooks/use-grvs";
import { useCompany } from "@/hooks/use-companies";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Download, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { PDFDownloadLink } from "@react-pdf/renderer";
import { GrvPdfDocument } from "@/components/inventory/grv-pdf-document";

export default function GrvDetailsPage() {
  const [, setLocation] = useLocation();
  const [, params] = useRoute("/inventory/grvs/:id");
  const grvId = decodeURIComponent(params?.id || "");
  const { activeCompanyId } = useActiveCompany();
  const companyId = activeCompanyId || 0;

  const { data: grv, isLoading } = useGrv(companyId, grvId);
  const { data: company } = useCompany(companyId);

  return (
    <Layout>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Button variant="outline" className="rounded-xl" onClick={() => setLocation("/inventory/account")}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
          <div>
            <h1 className="text-3xl font-display font-black text-slate-900 tracking-tight">GRV Document</h1>
            <p className="text-slate-500 mt-1">Invoice-style goods received voucher</p>
          </div>
        </div>

        {grv && (
          <PDFDownloadLink
            document={<GrvPdfDocument grv={grv} company={company} />}
            fileName={`${grv.grvNumber || "GRV"}.pdf`}
          >
            {({ loading }) => (
              <Button className="rounded-xl">
                {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
                Download PDF
              </Button>
            )}
          </PDFDownloadLink>
        )}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20 text-slate-500">
          <Loader2 className="w-6 h-6 animate-spin mr-2" /> Loading GRV...
        </div>
      ) : !grv ? (
        <Card className="rounded-2xl border-slate-200">
          <CardContent className="p-8 text-center">
            <p className="font-bold text-slate-700">GRV not found</p>
            <Link href="/inventory/account">
              <Button variant="outline" className="rounded-xl mt-4">Return to Goods Received</Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-none shadow-xl shadow-slate-200/50 bg-white rounded-[2rem] overflow-hidden ring-1 ring-slate-100">
          <CardContent className="p-8">
            <div className="text-center mb-6">
              <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tight">Goods Received Voucher</h2>
              <Badge variant="outline" className="font-mono mt-2">{grv.grvNumber}</Badge>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              <div className="rounded-xl border border-slate-200 p-4">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Supplier</p>
                <p className="font-bold text-slate-800">{grv.supplierName || "N/A"}</p>
              </div>
              <div className="rounded-xl border border-slate-200 p-4">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Document Info</p>
                <p className="text-sm text-slate-700">Date: {grv.createdAt ? format(new Date(grv.createdAt), "dd MMM yyyy HH:mm") : "-"}</p>
                <p className="text-sm text-slate-700">Recorded By: {grv.createdBy || "System"}</p>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 overflow-hidden">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="p-4 text-[10px] font-black uppercase tracking-widest text-slate-400">SKU</th>
                    <th className="p-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Description</th>
                    <th className="p-4 text-[10px] font-black uppercase tracking-widest text-slate-400 text-right">Qty</th>
                    <th className="p-4 text-[10px] font-black uppercase tracking-widest text-slate-400 text-right">Unit Cost</th>
                    <th className="p-4 text-[10px] font-black uppercase tracking-widest text-slate-400 text-right">Line Total</th>
                  </tr>
                </thead>
                <tbody>
                  {grv.lines.map((line) => (
                    <tr key={line.id} className="border-b border-slate-100 last:border-0">
                      <td className="p-4 text-xs font-mono text-slate-500">{line.sku || "-"}</td>
                      <td className="p-4 text-sm font-semibold text-slate-800">{line.productName}</td>
                      <td className="p-4 text-sm font-medium text-slate-700 text-right">{line.quantity.toFixed(2)}</td>
                      <td className="p-4 text-sm font-medium text-slate-700 text-right">${line.unitCost.toFixed(2)}</td>
                      <td className="p-4 text-sm font-black text-slate-900 text-right">${line.totalCost.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-6 flex justify-end">
              <div className="w-full max-w-sm rounded-xl border border-slate-200 p-4 bg-slate-50/40">
                <div className="flex items-center justify-between text-sm mb-2">
                  <span className="text-slate-500">Total Quantity</span>
                  <span className="font-bold text-slate-800">{grv.totalQuantity.toFixed(2)}</span>
                </div>
                <div className="flex items-center justify-between text-base">
                  <span className="font-bold text-slate-700">Total Cost</span>
                  <span className="font-black text-slate-900">${grv.totalCost.toFixed(2)}</span>
                </div>
              </div>
            </div>

            {grv.notes ? (
              <div className="mt-6 rounded-xl border border-slate-200 p-4">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Notes</p>
                <p className="text-sm text-slate-700">{grv.notes}</p>
              </div>
            ) : null}
          </CardContent>
        </Card>
      )}
    </Layout>
  );
}

