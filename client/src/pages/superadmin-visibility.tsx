import { Layout } from "@/components/layout";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { apiFetch } from "@/lib/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Eye, EyeOff, Loader2, Search, ShieldAlert } from "lucide-react";
import { useMemo, useState } from "react";

type CompanyVisibility = {
  id: number;
  name: string;
  tradingName?: string | null;
  email?: string | null;
  tin?: string | null;
  superadminVisible: boolean;
};

export default function SuperadminVisibilityPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const isSystemAdmin =
    btoa(String(user?.email || "").toLowerCase()) === "YWRtaW5AemltcmEuY28uenc=";

  const companiesQuery = useQuery<CompanyVisibility[]>({
    queryKey: ["system-superadmin-company-visibility"],
    enabled: isSystemAdmin,
    queryFn: async () => {
      const res = await apiFetch("/api/system/superadmin-company-visibility");
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "Failed to load visibility settings");
      }
      return res.json();
    },
  });

  const updateVisibilityMutation = useMutation({
    mutationFn: async ({
      companyId,
      superadminVisible,
    }: {
      companyId: number;
      superadminVisible: boolean;
    }) => {
      const res = await apiFetch(
        `/api/system/superadmin-company-visibility/${companyId}`,
        {
          method: "PATCH",
          body: JSON.stringify({ superadminVisible }),
        },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "Failed to update visibility");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["system-superadmin-company-visibility"],
      });
      queryClient.invalidateQueries({ queryKey: ["/api/companies"] });
      toast({
        title: "Visibility updated",
        description: "Other superadmins will see the new company list.",
      });
    },
    onError: (err: Error) =>
      toast({
        title: "Update failed",
        description: err.message,
        variant: "destructive",
      }),
  });

  const companies = companiesQuery.data || [];
  const filteredCompanies = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return companies;
    return companies.filter((company) =>
      [company.name, company.tradingName, company.email, company.tin]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term)),
    );
  }, [companies, search]);

  const hiddenCount = companies.filter(
    (company) => !company.superadminVisible,
  ).length;

  if (!isSystemAdmin) {
    return (
      <Layout>
        <div className="mx-auto max-w-2xl py-10">
          <Card>
            <CardContent className="flex items-start gap-3 p-6">
              <ShieldAlert className="mt-1 h-5 w-5 text-amber-600" />
              <div>
                <h2 className="text-lg font-semibold text-slate-900">
                  Unauthorized Access
                </h2>
                <p className="mt-1 text-sm text-slate-600">
                  You do not have permission to view this configuration.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-600">
                Total Companies
              </CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-semibold">
              {companies.length}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-600">
                Visible To Superadmins
              </CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-semibold">
              {companies.length - hiddenCount}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-600">
                Hidden
              </CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-semibold">
              {hiddenCount}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className="gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle>Company Visibility</CardTitle>
            </div>
            <div className="relative w-full sm:w-80">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search companies"
                className="pl-9"
              />
            </div>
          </CardHeader>
          <CardContent>
            {companiesQuery.isLoading ? (
              <div className="flex h-40 items-center justify-center text-slate-500">
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                Loading companies
              </div>
            ) : companiesQuery.isError ? (
              <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                {(companiesQuery.error as Error).message}
              </div>
            ) : (
              <div className="overflow-hidden rounded-lg border border-slate-200">
                {filteredCompanies.map((company) => (
                  <div
                    key={company.id}
                    className="grid gap-3 border-b border-slate-100 p-4 last:border-0 md:grid-cols-[1fr_auto_auto] md:items-center"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="truncate font-semibold text-slate-900">
                          {company.name}
                        </h3>
                        <Badge
                          variant={
                            company.superadminVisible ? "secondary" : "outline"
                          }
                          className="gap-1"
                        >
                          {company.superadminVisible ? (
                            <Eye className="h-3 w-3" />
                          ) : (
                            <EyeOff className="h-3 w-3" />
                          )}
                          {company.superadminVisible ? "Visible" : "Hidden"}
                        </Badge>
                      </div>
                      <p className="mt-1 text-sm text-slate-500">
                        {[company.tradingName, company.email, company.tin]
                          .filter(Boolean)
                          .join(" - ") || "No additional details"}
                      </p>
                    </div>
                    <span className="text-sm font-medium text-slate-600">
                      Other superadmins
                    </span>
                    <Switch
                      checked={company.superadminVisible}
                      disabled={updateVisibilityMutation.isPending}
                      aria-label={`Toggle ${company.name} visibility`}
                      onCheckedChange={(checked) =>
                        updateVisibilityMutation.mutate({
                          companyId: company.id,
                          superadminVisible: checked,
                        })
                      }
                    />
                  </div>
                ))}
                {filteredCompanies.length === 0 ? (
                  <div className="p-8 text-center text-sm text-slate-500">
                    No companies match your search.
                  </div>
                ) : null}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
