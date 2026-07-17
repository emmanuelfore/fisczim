import { Layout } from "@/components/layout";
import { useQuotations, useDeleteQuotation } from "@/hooks/use-quotations";
import { Button } from "@/components/ui/button";
import { Plus, Search, ClipboardList } from "lucide-react";
import { DeleteButton } from "@/components/delete-button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/status-badge";
import { Link, useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { useState } from "react";
import { PageHeader } from "@/components/page-header";

export default function QuotationsPage() {
  const selectedCompanyId = parseInt(
    localStorage.getItem("selectedCompanyId") || "0",
  );
  const { data: quotations, isLoading } = useQuotations(selectedCompanyId);
  const deleteQuotation = useDeleteQuotation();
  const [searchTerm, setSearchTerm] = useState("");
  const [, setLocation] = useLocation();

  const handleConvertToOrder = async (id: number) => {
    try {
      const res = await fetch("/api/sales-orders/from-quotation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quotationId: id })
      });
      if (!res.ok) throw new Error("Conversion failed");
      const data = await res.json();
      setLocation(`/sales-orders/${data.id}`);
    } catch (err) {
      console.error(err);
      alert("Failed to convert quotation to sales order.");
    }
  };

  const filteredQuotations = quotations?.filter(
    (quote) =>
      quote.quotationNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      quote.total.toString().includes(searchTerm),
  );

  return (
    <Layout>
      <PageHeader
        title="Quotations"
        subtitle="Manage and track your customer quotations"
        actions={
          <Link href="/quotations/new">
            <Button className="shadow-lg shadow-primary/20 hover:shadow-primary/30 transition-all">
              <Plus className="w-4 h-4 mr-2" />
              Create Quotation
            </Button>
          </Link>
        }
      />

      <Card className="card-depth border-none overflow-hidden">
        <div className="p-4 border-b border-slate-100 bg-white">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              placeholder="Search by quote number..."
              className="pl-9 border-slate-200 bg-slate-50 focus:bg-white transition-colors"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        <CardContent className="p-0">
          <div className="w-full overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr>
                  <th className="data-table-header">Quote #</th>
                  <th className="hidden sm:table-cell data-table-header">
                    Date
                  </th>
                  <th className="data-table-header">Amount</th>
                  <th className="hidden md:table-cell data-table-header">
                    Tax
                  </th>
                  <th className="data-table-header">Status</th>
                  <th className="data-table-header text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-slate-500">
                      Loading quotations...
                    </td>
                  </tr>
                ) : filteredQuotations?.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-12 text-center text-slate-500">
                      <div className="flex flex-col items-center justify-center">
                        <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center mb-3">
                          <ClipboardList className="w-6 h-6 text-slate-400" />
                        </div>
                        <p className="font-medium">No quotations found</p>
                        <p className="text-xs mt-1">
                          Create your first quotation to get started
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredQuotations?.map((quote) => (
                    <tr key={quote.id} className="data-table-row group">
                      <td className="data-table-cell">
                        <div className="flex flex-col gap-1">
                          <span className="font-mono  font-bold text-slate-700">
                            {quote.quotationNumber}
                          </span>
                          <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase leading-none tracking-wide bg-blue-50 text-blue-700 border-blue-100 w-fit">
                            Quotation
                          </span>
                        </div>
                      </td>
                      <td className="hidden sm:table-cell data-table-cell">
                        {new Date(quote.issueDate!).toLocaleDateString()}
                      </td>
                      <td className="data-table-cell font-semibold text-slate-900">
                        ${Number(quote.total).toFixed(2)}
                      </td>
                      <td className="hidden md:table-cell data-table-cell text-slate-500">
                        ${Number(quote.taxAmount).toFixed(2)}
                      </td>
                      <td className="data-table-cell">
                        <StatusBadge status={quote.status!} />
                      </td>
                      <td className="data-table-cell text-right">
                        <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button variant="outline" size="sm" onClick={() => handleConvertToOrder(quote.id)}>
                            Convert to Order
                          </Button>
                          <Link href={`/quotations/new?edit=${quote.id}`}>
                            <Button variant="ghost" size="sm">
                              Edit
                            </Button>
                          </Link>
                          <DeleteButton
                            title="Delete Quotation"
                            description="Are you sure you want to delete this quotation? This action cannot be undone."
                            onConfirm={async () => {
                              await deleteQuotation.mutateAsync(quote.id);
                            }}
                            isDeleting={deleteQuotation.isPending}
                          />
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </Layout>
  );
}
