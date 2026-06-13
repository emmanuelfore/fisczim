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
import { useState } from "react";

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

  const serialTrackedProducts = products.filter(
    (product: any) => product.serialTrackingEnabled,
  );

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
              <CardHeader>
                <CardTitle>Serial Stock</CardTitle>
              </CardHeader>
              <CardContent>
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
                    {serials.map((serial: any) => {
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
