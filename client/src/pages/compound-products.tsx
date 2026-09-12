import { Layout } from "@/components/layout";
import { PageHeader } from "@/components/page-header";
import { useCompoundProducts } from "@/hooks/use-compound-products";
import { useActiveCompany } from "@/hooks/use-active-company";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Link } from "wouter";
import { useState } from "react";
import { Package, Plus, Search, Layers } from "lucide-react";

export default function CompoundProductsPage() {
  const { activeCompanyId } = useActiveCompany();
  const { data: bundles, isLoading } = useCompoundProducts(activeCompanyId);
  const [searchTerm, setSearchTerm] = useState("");

  const filtered = bundles?.filter(b =>
    b.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    b.sku?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <Layout>
      <PageHeader
        title="Compound Products"
        subtitle="Manage product bundles and kits sold as a single unit"
        actions={
          <Link href="/compound-products/new">
            <Button><Plus className="w-4 h-4 mr-2" />New Bundle</Button>
          </Link>
        }
      />

      <Card className="card-depth border-none overflow-hidden">
        <div className="p-4 border-b border-slate-100 bg-white">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              placeholder="Search bundles..."
              className="pl-9"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
          </div>
        </div>
        <CardContent className="p-0">
          {/* Mobile */}
          <div className="grid grid-cols-1 gap-4 p-4 md:hidden">
            {isLoading ? (
              <div className="p-8 text-center text-slate-500">Loading...</div>
            ) : filtered?.length === 0 ? (
              <div className="p-12 text-center text-slate-500">
                <Layers className="w-10 h-10 mx-auto mb-3 text-slate-300" />
                <p className="font-medium">No compound products yet</p>
                <p className="text-sm mt-1">Create bundles to sell multiple products as one</p>
              </div>
            ) : (
              filtered?.map(bundle => (
                <div key={bundle.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <p className="font-bold text-slate-800">{bundle.name}</p>
                      <p className="text-xs text-slate-500 font-mono">{bundle.sku}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-slate-900">${Number(bundle.sellingPrice).toFixed(2)}</p>
                      <Badge className={bundle.isActive ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"}>
                        {bundle.isActive ? 'Active' : 'Inactive'}
                      </Badge>
                    </div>
                  </div>
                  <div className="border-t border-slate-100 pt-2 mb-3">
                    <p className="text-xs text-slate-500 mb-1">Components ({bundle.items?.length || 0})</p>
                    <div className="flex flex-wrap gap-1">
                      {bundle.items?.slice(0, 3).map((item: any) => (
                        <span key={item.id} className="text-xs bg-slate-100 rounded px-2 py-0.5">
                          {item.product?.name} x{Number(item.quantity)}
                        </span>
                      ))}
                      {bundle.items?.length > 3 && (
                        <span className="text-xs text-slate-400">+{bundle.items.length - 3} more</span>
                      )}
                    </div>
                  </div>
                  <Link href={`/compound-products/${bundle.id}/edit`}>
                    <Button variant="outline" size="sm" className="w-full">Edit Bundle</Button>
                  </Link>
                </div>
              ))
            )}
          </div>

          {/* Desktop */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr>
                  <th className="data-table-header">Name</th>
                  <th className="data-table-header">SKU</th>
                  <th className="data-table-header">Components</th>
                  <th className="data-table-header">Selling Price</th>
                  <th className="data-table-header">Status</th>
                  <th className="data-table-header text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr><td colSpan={6} className="p-8 text-center text-slate-500">Loading...</td></tr>
                ) : filtered?.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-12 text-center text-slate-500">
                      <Layers className="w-10 h-10 mx-auto mb-3 text-slate-300" />
                      <p className="font-medium">No compound products yet</p>
                    </td>
                  </tr>
                ) : (
                  filtered?.map(bundle => (
                    <tr key={bundle.id} className="data-table-row">
                      <td className="data-table-cell">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center">
                            <Package className="w-4 h-4 text-indigo-600" />
                          </div>
                          <div>
                            <p className="font-medium text-slate-800">{bundle.name}</p>
                            {bundle.description && <p className="text-xs text-slate-500">{bundle.description}</p>}
                          </div>
                        </div>
                      </td>
                      <td className="data-table-cell font-mono text-slate-600">{bundle.sku}</td>
                      <td className="data-table-cell">
                        <div className="flex flex-wrap gap-1">
                          {bundle.items?.slice(0, 2).map((item: any) => (
                            <span key={item.id} className="text-xs bg-slate-100 rounded px-2 py-0.5">
                              {item.product?.name} ×{Number(item.quantity)}
                            </span>
                          ))}
                          {bundle.items?.length > 2 && (
                            <span className="text-xs text-slate-400">+{bundle.items.length - 2} more</span>
                          )}
                        </div>
                      </td>
                      <td className="data-table-cell font-semibold text-slate-900">${Number(bundle.sellingPrice).toFixed(2)}</td>
                      <td className="data-table-cell">
                        <Badge className={bundle.isActive ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"}>
                          {bundle.isActive ? 'Active' : 'Inactive'}
                        </Badge>
                      </td>
                      <td className="data-table-cell text-right">
                        <Link href={`/compound-products/${bundle.id}/edit`}>
                          <Button variant="ghost" size="sm">Edit</Button>
                        </Link>
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
