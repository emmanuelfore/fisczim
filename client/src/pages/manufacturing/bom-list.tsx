import { Layout } from "@/components/layout";
import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "wouter";
import { useActiveCompany } from "@/hooks/use-active-company";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import { PageHeader } from "@/components/page-header";

export default function BomList() {
  const { activeCompanyId: companyId } = useActiveCompany();

  const { data: boms, isLoading } = useQuery({
    queryKey: [`/api/companies/${companyId}/manufacturing/bom`],
    enabled: !!companyId,
  });

  return (
    <Layout>
      <div className="space-y-6">
      <div className="flex justify-between items-center">
        <PageHeader 
          title="Bill of Materials" 
           
        />
        <Link href={`/manufacturing/bom/new`}>
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            New BOM
          </Button>
        </Link>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>BOM Name</TableHead>
              <TableHead>Version</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Created At</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={4}>
                  <Skeleton className="h-10 w-full" />
                </TableCell>
              </TableRow>
            ) : ((boms as any[]) || [])?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center h-32 text-muted-foreground">
                  No Bill of Materials found. Create one to get started.
                </TableCell>
              </TableRow>
            ) : (
              (boms as any[])?.map((bom: any) => (
                <TableRow key={bom.id}>
                  <TableCell className="font-medium">{bom.name}</TableCell>
                  <TableCell>v{bom.version}</TableCell>
                  <TableCell>{bom.isActive ? "Active" : "Inactive"}</TableCell>
                  <TableCell>{format(new Date(bom.createdAt), "MMM d, yyyy")}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  
    </Layout>
  );
}
