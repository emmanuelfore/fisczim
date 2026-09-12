import { Layout } from "@/components/layout";
import { Link } from "wouter";
import { useActiveCompany } from "@/hooks/use-active-company";
import { useProducts } from "@/hooks/use-products";
import {
  useCreateProductSerials,
  useLaybys,
  useProductSerials,
  useWarrantyClaims,
} from "@/hooks/use-auto-spares";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useState, useMemo } from "react";
import { Download, Search, Calendar as CalendarIcon, Filter } from "lucide-react";
import { format } from "date-fns";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";

export default function AutoSparesPage() {
  const { user } = useAuth();
  const { activeCompany } = useActiveCompany(!!user, user?.id ?? null);
  const companyId = activeCompany?.id || 0;
  const { data: products = [] } = useProducts(companyId);
  const { data: serials = [] } = useProductSerials(companyId);
  const { data: claims = [] } = useWarrantyClaims(companyId);
  const { data: laybys = [] } = useLaybys(companyId);
  const createSerials = useCreateProductSerials(companyId);
  const { toast } = useToast();
  const [productId, setProductId] = useState("");
  const [serialText, setSerialText] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [filterProductId, setFilterProductId] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState<Date | undefined>();
  const [dateTo, setDateTo] = useState<Date | undefined>();

  const serialTrackedProducts = products.filter(
    (product: any) => product.serialTrackingEnabled,
  );

  const filteredSerials = useMemo(() => {
    return serials.filter((serial: any) => {
      // Product Filter
      if (filterProductId !== "all" && String(serial.productId) !== filterProductId) return false;
      
      // Status Filter
      if (filterStatus !== "all" && serial.status !== filterStatus) return false;
      
      // Search Filter
      if (searchTerm) {
        const product = products.find((p: any) => p.id === serial.productId);
        const searchLower = searchTerm.toLowerCase();
        const matchSerial = serial.serialNumber?.toLowerCase().includes(searchLower);
        const matchProduct = product?.name?.toLowerCase().includes(searchLower);
        const matchInvoice = String(serial.soldInvoiceNumber || "").toLowerCase().includes(searchLower);
        if (!matchSerial && !matchProduct && !matchInvoice) return false;
      }
      
      // Date Filter (by createdAt)
      if (dateFrom || dateTo) {
        const createdDate = new Date(serial.createdAt);
        if (dateFrom && createdDate < dateFrom) return false;
        if (dateTo) {
          const toDate = new Date(dateTo);
          toDate.setHours(23, 59, 59, 999);
          if (createdDate > toDate) return false;
        }
      }
      
      return true;
    });
  }, [serials, products, filterProductId, filterStatus, searchTerm, dateFrom, dateTo]);

  const exportCsv = () => {
    const headers = ["Serial", "Product", "Status", "Warranty Until", "Sold Invoice", "Sold At", "Created At"];
    const rows = filteredSerials.map((serial: any) => {
      const product = products.find((p: any) => p.id === serial.productId);
      return [
        serial.serialNumber,
        product?.name || serial.productId,
        serial.status,
        serial.warrantyExpiresAt ? new Date(serial.warrantyExpiresAt).toLocaleDateString() : "-",
        serial.soldInvoiceNumber || serial.soldInvoiceId || "-",
        serial.soldAt ? new Date(serial.soldAt).toLocaleDateString() : "-",
        serial.createdAt ? new Date(serial.createdAt).toLocaleDateString() : "-"
      ].map(v => `"${v}"`).join(",");
    });
    const csvContent = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `serial-stock-${new Date().toISOString().split("T")[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const addSerials = async () => {
    const serialNumbers = serialText
      .split(/\r?\n|,/)
      .map((value) => value.trim())
      .filter(Boolean);
    if (!productId || serialNumbers.length === 0) return;
    await createSerials.mutateAsync(
      serialNumbers.map((serialNumber) => ({
        productId: Number(productId),
        serialNumber,
        status: "IN_STOCK",
      })),
    );
    setSerialText("");
    toast({
      title: "Serials added",
      description: `${serialNumbers.length} serial number(s) recorded.`,
    });
  };

  return (
    <Layout>
      <div className="space-y-6">
        <Tabs defaultValue="serials" className="space-y-4">
          <TabsList>
            <TabsTrigger value="serials">Serial Numbers</TabsTrigger>
            <TabsTrigger value="warranty">Warranty Claims</TabsTrigger>
            <TabsTrigger value="laybys">Lay-bys</TabsTrigger>
          </TabsList>

          <TabsContent value="serials" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Receive Serial Numbers</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-[1fr_2fr_auto]">
                <div className="space-y-2">
                  <Label>Product</Label>
                  <Select value={productId} onValueChange={setProductId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select serial-tracked product" />
                    </SelectTrigger>
                    <SelectContent>
                      {serialTrackedProducts.map((product: any) => (
                        <SelectItem key={product.id} value={String(product.id)}>
                          {product.name} {product.sku ? `(${product.sku})` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Serial numbers</Label>
                  <Input
                    value={serialText}
                    onChange={(event) => setSerialText(event.target.value)}
                    placeholder="Comma separated, or paste one per line"
                  />
                </div>
                <Button
                  className="self-end"
                  onClick={addSerials}
                  disabled={
                    createSerials.isPending || !productId || !serialText.trim()
                  }
                >
                  Add
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle>Serial Stock</CardTitle>
                <Button variant="outline" size="sm" onClick={exportCsv} className="h-8">
                  <Download className="mr-2 h-4 w-4" />
                  Export CSV
                </Button>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-col sm:flex-row flex-wrap items-center gap-2 mb-2">
                  <div className="relative flex-1 min-w-[200px]">
                    <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search serial, product, invoice..."
                      className="pl-8 h-9"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                    />
                  </div>
                  
                  <Select value={filterProductId} onValueChange={setFilterProductId}>
                    <SelectTrigger className="w-[180px] h-9">
                      <Filter className="mr-2 h-3.5 w-3.5 text-muted-foreground" />
                      <SelectValue placeholder="All Products" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Products</SelectItem>
                      {serialTrackedProducts.map((product: any) => (
                        <SelectItem key={product.id} value={String(product.id)}>
                          {product.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Select value={filterStatus} onValueChange={setFilterStatus}>
                    <SelectTrigger className="w-[140px] h-9">
                      <SelectValue placeholder="All Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Status</SelectItem>
                      <SelectItem value="IN_STOCK">In Stock</SelectItem>
                      <SelectItem value="SOLD">Sold</SelectItem>
                      <SelectItem value="RESERVED">Reserved</SelectItem>
                      <SelectItem value="RETURNED">Returned</SelectItem>
                    </SelectContent>
                  </Select>

                  <div className="flex items-center gap-2">
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className="h-9 w-[130px] justify-start text-left font-normal">
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {dateFrom ? format(dateFrom, "PP") : <span>From date</span>}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={dateFrom}
                          onSelect={setDateFrom}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                    <span className="text-muted-foreground">-</span>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className="h-9 w-[130px] justify-start text-left font-normal">
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {dateTo ? format(dateTo, "PP") : <span>To date</span>}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={dateTo}
                          onSelect={setDateTo}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>

                 <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Serial</TableHead>
                      <TableHead>Product</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Warranty Until</TableHead>
                      <TableHead>Sold Invoice</TableHead>
                      <TableHead>Sold At</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredSerials.map((serial: any) => {
                      const product = products.find(
                        (p: any) => p.id === serial.productId,
                      );
                      return (
                        <TableRow key={serial.id}>
                          <TableCell className="font-mono font-bold">
                            {serial.serialNumber}
                          </TableCell>
                          <TableCell>
                            {product?.name || serial.productId}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={serial.status === "SOLD" ? "secondary" : "outline"}
                              className={serial.status === "SOLD" ? "bg-slate-100 text-slate-700" : "bg-green-50 text-green-700 border-green-200"}
                            >
                              {serial.status}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {serial.warrantyExpiresAt
                              ? new Date(
                                  serial.warrantyExpiresAt,
                                ).toLocaleDateString()
                              : "-"}
                          </TableCell>
                          <TableCell>
                            {serial.soldInvoiceId ? (
                              <Link href={`/invoices/${serial.soldInvoiceId}`} className="text-primary hover:underline font-mono font-bold">
                                {serial.soldInvoiceNumber || `#${serial.soldInvoiceId}`}
                              </Link>
                            ) : (
                              "-"
                            )}
                          </TableCell>
                          <TableCell>
                            {serial.soldAt
                              ? new Date(serial.soldAt).toLocaleDateString()
                              : "-"}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="warranty">
            <Card>
              <CardHeader>
                <CardTitle>Warranty Claims</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Claim</TableHead>
                      <TableHead>Product</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Reason</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {claims.map((claim: any) => {
                      const product = products.find(
                        (p: any) => p.id === claim.productId,
                      );
                      return (
                        <TableRow key={claim.id}>
                          <TableCell className="font-mono">
                            {claim.claimNumber}
                          </TableCell>
                          <TableCell>
                            {product?.name || claim.productId}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">{claim.status}</Badge>
                          </TableCell>
                          <TableCell>{claim.reason}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="laybys">
            <Card>
              <CardHeader>
                <CardTitle>Lay-bys</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Lay-by</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Total</TableHead>
                      <TableHead>Paid</TableHead>
                      <TableHead>Expiry</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {laybys.map((layby: any) => (
                      <TableRow key={layby.id}>
                        <TableCell className="font-mono">
                          {layby.laybyNumber}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{layby.status}</Badge>
                        </TableCell>
                        <TableCell>
                          {layby.currency} {Number(layby.total || 0).toFixed(2)}
                        </TableCell>
                        <TableCell>
                          {layby.currency}{" "}
                          {Number(layby.paidAmount || 0).toFixed(2)}
                        </TableCell>
                        <TableCell>
                          {layby.expiryDate
                            ? new Date(layby.expiryDate).toLocaleDateString()
                            : "-"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}
