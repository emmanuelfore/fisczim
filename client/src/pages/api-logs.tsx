import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import {
  ArrowLeft,
  CheckCircle,
  XCircle,
  Search,
  Info,
  RefreshCw,
  Activity,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useCompanies } from "@/hooks/use-companies";
import { Layout } from "@/components/layout";
import { format } from "date-fns";
import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export default function ApiLogs() {
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [endpointFilter, setEndpointFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const location = useLocation();

  const rawId = parseInt(localStorage.getItem("selectedCompanyId") || "0");
  const storedCompanyId = isNaN(rawId) ? 0 : rawId;
  const { data: companies, isLoading: isLoadingCompanies } = useCompanies();
  const selectedCompany =
    companies?.find((c) => c.id === storedCompanyId) || companies?.[0];
  const companyId = selectedCompany?.id;

  const {
    data: logs,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ["/api/companies", companyId, "api-logs"],
    queryFn: async () => {
      if (!companyId) return [];
      const res = await fetch(
        `/api/companies/${companyId}/api-logs?limit=500`,
        { credentials: "include" },
      );
      if (!res.ok) throw new Error("Failed to fetch API logs");
      return res.json();
    },
    enabled: !!companyId,
  });

  const uniqueEndpoints = Array.from(
    new Set(logs?.map((log: any) => log.endpoint).filter(Boolean)),
  ) as string[];

  const filteredLogs =
    logs?.filter((log: any) => {
      const matchesSearch =
        !search ||
        (log.requestPayload &&
          JSON.stringify(log.requestPayload)
            .toLowerCase()
            .includes(search.toLowerCase())) ||
        (log.endpoint &&
          log.endpoint.toLowerCase().includes(search.toLowerCase())) ||
        (log.ipAddress &&
          log.ipAddress.toLowerCase().includes(search.toLowerCase()));
      const matchesEndpoint =
        endpointFilter === "all" || log.endpoint === endpointFilter;
      const isSuccess = log.statusCode >= 200 && log.statusCode < 300;
      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "success" && isSuccess) ||
        (statusFilter === "error" && !isSuccess);
      return matchesSearch && matchesEndpoint && matchesStatus;
    }) || [];

  if (isLoadingCompanies)
    return (
      <Layout>
        <div className="p-8 flex items-center justify-center">Loading...</div>
      </Layout>
    );

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/zimra-settings">
              <Button variant="ghost" size="icon">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
          </div>
          <Button
            variant="outline"
            onClick={() => {
              refetch();
            }}
            disabled={isLoading}
          >
            <RefreshCw
              className={`mr-2 h-4 w-4 ${isLoading ? "animate-spin" : ""}`}
            />
            Refresh
          </Button>
        </div>

        <Card>
          <CardHeader>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Activity className="h-5 w-5 text-blue-500" />
                    Incoming API Logs
                  </CardTitle>
                  <CardDescription>
                    Recent requests received from external applications (
                    {filteredLogs.length} logs)
                  </CardDescription>
                </div>
              </div>
              <div className="flex gap-4 items-center">
                <div className="relative flex-1">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search payloads, endpoints or IPs..."
                    className="pl-8"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
                <Select
                  value={endpointFilter}
                  onValueChange={setEndpointFilter}
                >
                  <SelectTrigger className="w-48">
                    <SelectValue placeholder="Filter by endpoint" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Endpoints</SelectItem>
                    {uniqueEndpoints.map((ep) => (
                      <SelectItem key={ep} value={ep}>
                        {ep}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={statusFilter}
                  onValueChange={setStatusFilter}
                >
                  <SelectTrigger className="w-40">
                    <SelectValue placeholder="Filter by status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="success">Success</SelectItem>
                    <SelectItem value="error">Error</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Time</TableHead>
                    <TableHead>Method & Endpoint</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Latency</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-8">
                        Loading API logs...
                      </TableCell>
                    </TableRow>
                  ) : filteredLogs.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={5}
                        className="text-center py-8 text-muted-foreground"
                      >
                        No logs found.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredLogs.map((log: any) => (
                      <TableRow key={log.id}>
                        <TableCell className="font-mono text-xs">
                          {format(
                            new Date(log.createdAt),
                            "MMM d, HH:mm:ss",
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2 mb-1">
                            <Badge variant="secondary" className="font-mono text-[10px]">
                              {log.method}
                            </Badge>
                            <span className="font-medium text-sm">
                              {log.endpoint || "Unknown Request"}
                            </span>
                          </div>
                          <details className="text-[10px] bg-slate-50 border border-slate-100 rounded p-1.5 max-w-xs mt-1">
                            <summary className="cursor-pointer text-slate-500 hover:text-slate-700">
                              View Data
                            </summary>
                            <div className="mt-2 space-y-2 pb-1">
                              <div>
                                <span className="font-bold text-slate-700 block mb-0.5">
                                  Request:
                                </span>
                                <span className="font-mono text-slate-500 break-all">
                                  {log.requestPayload
                                    ? JSON.stringify(
                                        log.requestPayload,
                                      ).substring(0, 150) +
                                      (JSON.stringify(log.requestPayload)
                                        .length > 150
                                        ? "..."
                                        : "")
                                    : "None"}
                                </span>
                              </div>
                              <div>
                                <span className="font-bold text-slate-700 block mb-0.5">
                                  Response:
                                </span>
                                <span className="font-mono text-[9px] text-slate-500 break-all">
                                  {log.responsePayload
                                    ? JSON.stringify(
                                        log.responsePayload,
                                      ).substring(0, 150) +
                                      (JSON.stringify(log.responsePayload)
                                        .length > 150
                                        ? "..."
                                        : "")
                                    : "None"}
                                </span>
                              </div>
                            </div>
                          </details>
                        </TableCell>
                        <TableCell>
                          {log.statusCode >= 200 && log.statusCode < 300 ? (
                            <Badge
                              variant="outline"
                              className="text-green-600 border-green-200 bg-green-50"
                            >
                              <CheckCircle className="w-3 h-3 mr-1" />
                              Success ({log.statusCode})
                            </Badge>
                          ) : (
                            <Badge
                              variant="destructive"
                              className="bg-red-50 text-red-600 border-red-200 hover:bg-red-100"
                            >
                              <XCircle className="w-3 h-3 mr-1" />
                              Error{" "}
                              {log.statusCode ? `(${log.statusCode})` : ""}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-xs">
                          {log.responseTimeMs ? `${log.responseTimeMs}ms` : "-"}
                        </TableCell>
                        <TableCell className="text-right">
                          <Dialog>
                            <DialogTrigger asChild>
                              <Button variant="ghost" size="sm">
                                <Info className="h-4 w-4 mr-2" />
                                Details
                              </Button>
                            </DialogTrigger>
                            <DialogContent className="max-w-2xl max-h-[80vh]">
                              <DialogHeader>
                                <DialogTitle>
                                  API Transaction Details
                                </DialogTitle>
                                <DialogDescription>
                                  {format(new Date(log.createdAt), "PPP p")}
                                </DialogDescription>
                              </DialogHeader>
                              <ScrollArea className="h-[60vh] pr-4">
                                <div className="space-y-4">
                                  <div className="grid grid-cols-2 gap-4 text-sm bg-slate-50 p-3 rounded border">
                                    <div>
                                      <span className="font-semibold block text-slate-500">Method</span>
                                      {log.method}
                                    </div>
                                    <div>
                                      <span className="font-semibold block text-slate-500">Endpoint</span>
                                      <span className="font-mono">{log.endpoint}</span>
                                    </div>
                                    <div>
                                      <span className="font-semibold block text-slate-500">IP Address</span>
                                      {log.ipAddress || "Unknown"}
                                    </div>
                                    <div>
                                      <span className="font-semibold block text-slate-500">User Agent</span>
                                      {log.userAgent || "Unknown"}
                                    </div>
                                    <div>
                                      <span className="font-semibold block text-slate-500">Status Code</span>
                                      {log.statusCode}
                                    </div>
                                    <div>
                                      <span className="font-semibold block text-slate-500">Latency</span>
                                      {log.responseTimeMs ? `${log.responseTimeMs}ms` : "-"}
                                    </div>
                                  </div>

                                  <div>
                                    <h4 className=" font-medium mb-2">
                                      Request Payload
                                    </h4>
                                    <div className="bg-muted p-4 rounded-md overflow-x-auto">
                                      <pre className="text-xs font-mono">
                                        {JSON.stringify(
                                          log.requestPayload,
                                          null,
                                          2,
                                        )}
                                      </pre>
                                    </div>
                                  </div>
                                  <div>
                                    <h4 className=" font-medium mb-2">
                                      Response Payload
                                    </h4>
                                    <div className="bg-muted p-4 rounded-md overflow-x-auto">
                                      <pre
                                        className={`text-xs font-mono ${log.statusCode >= 400 ? "text-red-500" : ""}`}
                                      >
                                        {JSON.stringify(
                                          log.responsePayload,
                                          null,
                                          2,
                                        )}
                                      </pre>
                                    </div>
                                  </div>
                                </div>
                              </ScrollArea>
                            </DialogContent>
                          </Dialog>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
