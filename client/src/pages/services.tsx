
import { Layout } from "@/components/layout";
import { useProducts, useUpdateProduct } from "@/hooks/use-products";
import { useActiveCompany } from "@/hooks/use-active-company";
import { useTaxConfig } from "@/hooks/use-tax-config";
import { Card, CardContent } from "@/components/ui/card";
import { Briefcase, AlertCircle, Search, ChevronLeft, ChevronRight } from "lucide-react";
import { CreateProductDialog } from "@/components/products/create-product-dialog";
import { EditProductDialog } from "@/components/products/edit-product-dialog";
import { DeleteButton } from "@/components/delete-button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { CsvImportDialog } from "@/components/csv-import-dialog";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useBulkConvertProducts } from "@/hooks/use-products";
import { Checkbox } from "@/components/ui/checkbox";
import { motion, AnimatePresence } from "framer-motion";
import { useToast } from "@/hooks/use-toast";
import { 
    AlertDialog, 
    AlertDialogAction, 
    AlertDialogCancel, 
    AlertDialogContent, 
    AlertDialogDescription, 
    AlertDialogFooter, 
    AlertDialogHeader, 
    AlertDialogTitle, 
} from "@/components/ui/alert-dialog";


export default function ServicesPage() {
    const [itemsPerPage, setItemsPerPage] = useState(10);
    const { activeCompanyId } = useActiveCompany();
    const companyId = activeCompanyId || 0;
    const { data: allItems, isLoading } = useProducts(companyId);
    const updateProduct = useUpdateProduct();
    const { taxTypes } = useTaxConfig(companyId || undefined);
    const queryClient = useQueryClient();
    const [searchTerm, setSearchTerm] = useState("");
    const [statusFilter, setStatusFilter] = useState("all");
    const [taxFilter, setTaxFilter] = useState("all");
    const [currentPage, setCurrentPage] = useState(1);
    const [selectedIds, setSelectedIds] = useState<number[]>([]);
    const [isConverting, setIsConverting] = useState(false);
    const [showSelectionDialog, setShowSelectionDialog] = useState(false);
    const { bulkConvertMutation } = { bulkConvertMutation: useBulkConvertProducts(companyId) };
    const { toast } = useToast();

    // Filter for services
    const services = allItems?.filter(item => item.productType === 'service');

    // Filter by search term
    // Filter logic
    const filteredServices = services?.filter(s => {
        // 1. Search Term
        const matchesSearch =
            s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            (s.sku && s.sku.toLowerCase().includes(searchTerm.toLowerCase())) ||
            (s.description && s.description.toLowerCase().includes(searchTerm.toLowerCase()));

        // 2. Status Filter
        const matchesStatus =
            statusFilter === "all" ? true :
                statusFilter === "active" ? s.isActive :
                    statusFilter === "inactive" ? !s.isActive : true;

        // 3. Tax Filter
        const matchesTax =
            taxFilter === "all" ? true :
                parseFloat(s.taxRate || "0") === parseFloat(taxFilter);

        return matchesSearch && matchesStatus && matchesTax;
    });

    // Pagination logic
    const totalPages = Math.ceil((filteredServices?.length || 0) / itemsPerPage);
    const startIndex = (currentPage - 1) * itemsPerPage;
    const paginatedServices = filteredServices?.slice(startIndex, startIndex + itemsPerPage);

    const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
        setSearchTerm(e.target.value);
        setCurrentPage(1); // Reset to first page on search
        setSelectedIds([]);
    };

    const toggleSelect = (id: number) => {
        setSelectedIds(prev => 
            prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
        );
    };

    const toggleSelectAll = () => {
        if (!paginatedServices) return;
        if (selectedIds.length === paginatedServices.length) {
            setSelectedIds([]);
        } else {
            setSelectedIds(paginatedServices.map(s => s.id));
        }
    };

    const handleBulkConvert = async () => {
        if (selectedIds.length === 0) return;
        setIsConverting(true);
        try {
            await bulkConvertMutation.mutateAsync(selectedIds);
            toast({
                title: "Conversion Successful",
                description: `Successfully converted ${selectedIds.length} items to Products.`,
                className: "bg-emerald-600 text-white border-none shadow-lg"
            });
            setSelectedIds([]);
            setShowSelectionDialog(false);
        } catch (error: any) {
            toast({
                title: "Conversion Failed",
                description: error.message,
                variant: "destructive"
            });
        } finally {
            setIsConverting(false);
        }
    };

    return (
        <Layout>
            <div className="flex items-center justify-between mb-8">
                <div>
                    <h1 className="text-3xl font-display font-bold text-slate-900">Services</h1>
                    <p className="text-slate-500 mt-1">Manage service offerings</p>
                </div>
                <div className="flex gap-2">
                    <CsvImportDialog
                        type="service"
                        companyId={companyId}
                        onSuccess={() => {
                            queryClient.invalidateQueries({ queryKey: ["products", companyId] });
                        }}
                    />
                    <CreateProductDialog companyId={companyId} defaultType="service" triggerLabel="Add Service" />
                </div>
            </div>

            <div className="flex flex-col md:flex-row gap-4 mb-6">
                <div className="relative flex-1 max-w-sm">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <Input
                        placeholder="Search services..."
                        className="pl-9 bg-white"
                        value={searchTerm}
                        onChange={handleSearch}
                    />
                </div>

                <div className="flex gap-2 flex-wrap">
                    <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setCurrentPage(1); }}>
                        <SelectTrigger className="w-[130px] bg-white">
                            <SelectValue placeholder="Status" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All Status</SelectItem>
                            <SelectItem value="active">Active</SelectItem>
                            <SelectItem value="inactive">Inactive</SelectItem>
                        </SelectContent>
                    </Select>

                    <Select value={taxFilter} onValueChange={(v) => { setTaxFilter(v); setCurrentPage(1); }}>
                        <SelectTrigger className="w-[140px] bg-white">
                            <SelectValue placeholder="Tax Class" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All Taxes</SelectItem>
                            {taxTypes.data?.map((t: any) => (
                                <SelectItem key={t.id} value={t.rate.toString()}>
                                    {t.name} ({t.rate}%)
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                {(searchTerm || statusFilter !== 'all' || taxFilter !== 'all') && (
                    <Button
                        variant="ghost"
                        onClick={() => {
                            setSearchTerm("");
                            setStatusFilter("all");
                            setTaxFilter("all");
                            setCurrentPage(1);
                        }}
                        className="text-slate-500"
                    >
                        Reset
                    </Button>
                )}
            </div>

            <Card className="card-depth border-none overflow-hidden">
                <CardContent className="p-0">
                    <table className="w-full text-left">
                        <thead>
                            <tr className="bg-slate-50 border-b border-slate-100">
                                <th className="p-4 w-12">
                                    <Checkbox 
                                        checked={paginatedServices?.length > 0 && selectedIds.length === paginatedServices?.length}
                                        onCheckedChange={toggleSelectAll}
                                        className="rounded-md border-slate-300"
                                    />
                                </th>
                                <th className="data-table-header p-4">Name</th>
                                <th className="data-table-header p-4">Code</th>
                                <th className="data-table-header p-4">Description</th>
                                <th className="data-table-header p-4">Rate/Price</th>
                                <th className="data-table-header p-4">Tax Type</th>
                                <th className="data-table-header p-4"></th>
                            </tr>
                        </thead>
                        <tbody>
                            {isLoading ? (
                                <tr>
                                    <td colSpan={6} className="p-8 text-center text-slate-500">Loading services...</td>
                                </tr>
                            ) : paginatedServices?.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="p-12 text-center text-slate-500">
                                        <div className="flex flex-col items-center justify-center">
                                            <Briefcase className="w-12 h-12 text-slate-200 mb-4" />
                                            <p>No services found</p>
                                        </div>
                                    </td>
                                </tr>
                            ) : paginatedServices?.map((s) => {
                                const matchedType = taxTypes.data?.find((t: any) => {
                                    if (s.taxTypeId) return t.id === s.taxTypeId;
                                    // Fallback for legacy data
                                    if (parseFloat(t.rate) === parseFloat(s.taxRate || "0")) {
                                        if (parseFloat(s.taxRate || "0") === 0) {
                                            const isExempt = s.name.toLowerCase().includes("exempt") || s.description?.toLowerCase().includes("exempt");
                                            if (isExempt) {
                                                const zimraTaxId = t.zimraTaxId?.toString();
                                                return zimraTaxId == "1" || t.zimraCode === 'C' || t.zimraCode === 'E' || t.name.toLowerCase().includes("exempt");
                                            }
                                            return t.zimraTaxId === "2" || t.name.toLowerCase().includes("zero");
                                        }
                                        return true;
                                    }
                                    return false;
                                });
                                return (
                                    <tr key={s.id} className={`data-table-row border-b border-slate-50 hover:bg-slate-50/50 transition-colors ${!s.isActive ? 'opacity-50 grayscale' : ''} ${selectedIds.includes(s.id) ? 'bg-primary/5' : ''}`}>
                                        <td className="p-4 w-12">
                                            <Checkbox 
                                                checked={selectedIds.includes(s.id)}
                                                onCheckedChange={() => toggleSelect(s.id)}
                                                className="rounded-md border-slate-300"
                                            />
                                        </td>
                                        <td className="data-table-cell p-4 font-medium text-slate-900">
                                            <div className="flex items-center gap-2">
                                                <span>{s.name}</span>
                                                {!s.isActive && <span className="text-xs bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded">Inactive</span>}
                                                <Badge variant="outline" className="text-[10px] text-blue-600 border-blue-200 bg-blue-50">Service</Badge>
                                            </div>
                                        </td>
                                        <td className="data-table-cell p-4 font-mono text-xs text-slate-600">
                                            {s.sku || "—"}
                                        </td>
                                        <td className="data-table-cell p-4 text-slate-600 max-w-xs truncate">
                                            {s.description || "—"}
                                        </td>
                                        <td className="data-table-cell p-4 font-medium">${Number(s.price).toFixed(2)}</td>
                                        <td className="data-table-cell p-4">
                                            {matchedType ? (
                                                <Badge variant="outline" className="bg-slate-50 text-slate-700 border-slate-200 font-normal">
                                                    {matchedType.name} ({matchedType.rate}%)
                                                </Badge>
                                            ) : (
                                                <span className="text-slate-500 text-sm">{s.taxRate}%</span>
                                            )}
                                        </td>
                                        <td className="data-table-cell p-4 text-right">
                                            <div className="flex justify-end gap-2">
                                                <EditProductDialog product={s} />
                                                <DeleteButton
                                                    title="Delete Service"
                                                    description={`Are you sure you want to delete ${s.name}? This will mark it as inactive.`}
                                                    onConfirm={async () => {
                                                        await updateProduct.mutateAsync({
                                                            id: s.id,
                                                            data: { isActive: false }
                                                        });
                                                    }}
                                                    isDeleting={updateProduct.isPending}
                                                />
                                            </div>
                                        </td>
                                    </tr>
                                )
                            })}
                        </tbody>
                    </table>

                    {/* Pagination Controls */}
                    <div className="flex flex-col sm:flex-row items-center justify-between p-4 border-t border-slate-100 gap-4">
                        <div className="flex items-center gap-2">
                            <span className="text-xs font-medium text-slate-500">Items per page</span>
                            <Select 
                                value={itemsPerPage.toString()} 
                                onValueChange={(v) => {
                                    setItemsPerPage(parseInt(v));
                                    setCurrentPage(1);
                                }}
                            >
                                <SelectTrigger className="w-[70px] h-8 text-xs bg-white">
                                    <SelectValue placeholder="10" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="10">10</SelectItem>
                                    <SelectItem value="20">20</SelectItem>
                                    <SelectItem value="50">50</SelectItem>
                                    <SelectItem value="100">100</SelectItem>
                                </SelectContent>
                            </Select>
                            {filteredServices && (
                                <span className="text-xs text-slate-400 ml-2">
                                    Showing {startIndex + 1}–{Math.min(startIndex + itemsPerPage, filteredServices.length)} of {filteredServices.length}
                                </span>
                            )}
                        </div>

                        {totalPages > 1 && (
                            <div className="flex items-center gap-2">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-8 shadow-none"
                                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                    disabled={currentPage === 1}
                                >
                                    <ChevronLeft className="h-4 w-4 mr-1" />
                                    Previous
                                </Button>
                                <div className="text-xs font-bold text-slate-600 px-2 min-w-[80px] text-center">
                                    Page {currentPage} of {totalPages}
                                </div>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-8 shadow-none"
                                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                    disabled={currentPage === totalPages}
                                >
                                    Next
                                    <ChevronRight className="h-4 w-4 ml-1" />
                                </Button>
                            </div>
                        )}
                    </div>
                </CardContent>
            </Card>

            <AnimatePresence>
                {selectedIds.length > 0 && (
                    <motion.div 
                        initial={{ y: 100, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        exit={{ y: 100, opacity: 0 }}
                        className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 px-6 py-4 bg-slate-900 text-white rounded-2xl shadow-2xl flex items-center gap-6 border border-slate-800"
                    >
                        <div className="flex flex-col">
                            <span className="text-sm font-bold">{selectedIds.length} items selected</span>
                            <span className="text-[10px] text-slate-400">Perform bulk actions on services</span>
                        </div>
                        <div className="h-8 w-px bg-slate-800" />
                        <Button 
                            variant="secondary" 
                            className="bg-primary hover:bg-primary/90 text-white font-bold h-9 px-4 rounded-xl transition-all"
                            onClick={() => setShowSelectionDialog(true)}
                        >
                            Convert to Products
                        </Button>
                        <Button 
                            variant="ghost" 
                            className="h-9 px-4 text-slate-400 hover:text-white hover:bg-white/5 rounded-xl transition-all"
                            onClick={() => setSelectedIds([])}
                        >
                            Cancel
                        </Button>
                    </motion.div>
                )}
            </AnimatePresence>

            <AlertDialog open={showSelectionDialog} onOpenChange={setShowSelectionDialog}>
                <AlertDialogContent className="rounded-[2rem] border-none shadow-2xl p-8">
                    <AlertDialogHeader>
                        <AlertDialogTitle className="text-2xl font-display font-bold text-slate-900">
                            Bulk Conversion
                        </AlertDialogTitle>
                        <AlertDialogDescription className="text-slate-500 text-lg">
                            Are you sure you want to convert <span className="font-bold text-slate-900">{selectedIds.length}</span> services to products?
                            <br /><br />
                            This will enable <span className="font-bold text-primary">inventory tracking</span> for these items and change their type to Products.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter className="mt-8 gap-4">
                        <AlertDialogCancel className="rounded-2xl border-slate-200 h-12 px-8 font-bold text-slate-600 hover:bg-slate-50">
                            Cancel
                        </AlertDialogCancel>
                        <AlertDialogAction 
                            onClick={handleBulkConvert}
                            disabled={isConverting}
                            className="rounded-2xl bg-primary hover:bg-primary/90 h-12 px-8 font-bold text-white shadow-lg shadow-primary/20"
                        >
                            {isConverting ? (
                                <div className="flex items-center gap-2">
                                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                    Converting...
                                </div>
                            ) : "Confirm Conversion"}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </Layout>
    );
}
