import { Layout } from "@/components/layout";
import { useState } from "react";
import { useFreightForwarders } from "@/hooks/use-freight";
import { Card, CardContent } from "@/components/ui/card";
import { Truck, Search, User, Mail, Phone, ExternalLink } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";
import { useActiveCompany } from "@/hooks/use-active-company";
import { CreateForwarderDialog } from "@/components/freight/create-forwarder-dialog";

export default function FreightForwardersPage() {
  const { activeCompanyId } = useActiveCompany(true);
  const companyId = activeCompanyId || 0;
  const { data: forwarders, isLoading } = useFreightForwarders(companyId);
  const [searchTerm, setSearchTerm] = useState("");

  const filtered = forwarders?.filter((f: any) => 
    f.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    (f.contactPerson && f.contactPerson.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <Layout>
      <PageHeader
        title="Freight Forwarders"
        subtitle="Manage shipping and logistics partners"
        actions={
          <CreateForwarderDialog companyId={companyId} />
        }
      />

      <div className="flex gap-4 mb-8">
        <div className="relative flex-1 max-w-sm group">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Search forwarders..."
            className="pl-9 bg-white shadow-sm rounded-2xl"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-6 h-6 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filtered?.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-slate-500">
            <Truck className="w-8 h-8 mb-4 text-slate-300" />
            <p>No freight forwarders found</p>
          </div>
        ) : (
          filtered?.map((f: any) => (
            <Card key={f.id} className="border-none shadow-sm hover:shadow-md transition-shadow">
              <CardContent className="p-6 flex flex-col md:flex-row items-start justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-lg">
                    {f.name.substring(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-800 text-lg">{f.name}</h3>
                    {f.contactPerson && (
                      <div className="flex items-center gap-1 text-sm text-slate-500 mt-1">
                        <User className="w-4 h-4" />
                        {f.contactPerson}
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex flex-col gap-2 text-sm text-slate-600">
                  {f.email && (
                    <div className="flex items-center gap-2">
                      <Mail className="w-4 h-4 text-slate-400" />
                      <a href={`mailto:${f.email}`} className="hover:text-emerald-600">{f.email}</a>
                    </div>
                  )}
                  {f.phone && (
                    <div className="flex items-center gap-2">
                      <Phone className="w-4 h-4 text-slate-400" />
                      <a href={`tel:${f.phone}`} className="hover:text-emerald-600">{f.phone}</a>
                    </div>
                  )}
                  {f.website && (
                    <div className="flex items-center gap-2">
                      <ExternalLink className="w-4 h-4 text-slate-400" />
                      <a href={f.website} target="_blank" rel="noreferrer" className="hover:text-emerald-600 truncate max-w-[200px]">{f.website}</a>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </Layout>
  );
}
