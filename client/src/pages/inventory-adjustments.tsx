
import { Layout } from "@/components/layout";
import { useInventoryTransactions } from "@/hooks/use-inventory";
import { useProducts } from "@/hooks/use-products";
import { useActiveCompany } from "@/hooks/use-active-company";
import { useBranchContext } from "@/lib/branch-context";
import { Card, CardContent } from "@/components/ui/card";
import { SummaryStatCard } from "@/components/ui/summary-stat-card";
import { 
    Search, 
    ChevronLeft, 
    ChevronRight, 
    History, 
    Package, 
    ArrowRightLeft,
    TrendingDown,
    TrendingUp,
    AlertCircle,
    Calendar,
    Filter,
    PlusCircle
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useState } from "react";
import { format } from "date-fns";
import { Link } from "wouter";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const ITEMS_PER_PAGE = 15;

const ADJUSTMENT_TYPES = ['ADJUSTMENT', 'SHRINKAGE', 'CORRECTION', 'DAMAGE', 'EXPIRY'];

export default function InventoryAdjustmentsPage() {
    const { activeCompanyId } = useActiveCompany();
    const { selectedBranchId } = useBranchContext();
    const companyId = activeCompanyId || 0;
    
    const { data: transactions, isLoading } = useInventoryTransactions(companyId);
    const { data: products } = useProducts(companyId, selectedBranchId || undefined);
    
    const [searchTerm, setSearchTerm] = useState("");
    const [typeFilter, setTypeFilter] = useState("all");
    const [currentPage, setCurrentPage] = useState(1);

    // Filter logic: Only show adjustment types
    const filteredAdjustments = transactions?.filter(t => {
        const isAdjustment = ADJUSTMENT_TYPES.includes(t.type);
        if (!isAdjustment) return false;

        const product = products?.find(p => p.id === t.productId);
        const matchesSearch =
            product?.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            t.notes?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            t.type.toLowerCase().includes(searchTerm.toLowerCase());

        const matchesType = typeFilter === "all" || t.type === typeFilter;

        return matchesSearch && matchesType;
    });

    // Pagination logic
    const totalPages = Math.ceil((filteredAdjustments?.length || 0) / ITEMS_PER_PAGE);
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    const paginatedAdjustments = filteredAdjustments?.slice(startIndex, startIndex + ITEMS_PER_PAGE);

    const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
        setSearchTerm(e.target.value);
        setCurrentPage(1);
    };

    return (
        <Layout>
            <div className="flex items-center justify-between mb-8">
                <div>
                    <h1 className="text-3xl font-display font-bold text-slate-900 tracking-tight">Stock Adjustments</h1>
                    <p className="text-slate-500 mt-1 flex items-center gap-2">
                        <History className="w-4 h-4" />
                        Inventory corrections and manual stock changes
                    </p>
                </div>
            <div className="flex items-center gap-4">
                <Link href="/inventory/bulk-adjust">
                    <Button className="rounded-2xl bg-white border-slate-200 text-slate-800 hover:bg-slate-50 shadow-sm gap-2 h-12 px-6">
                        <ArrowRightLeft className="w-4 h-4" />
                        Bulk Adjustment
                    </Button>
                </Link>
                <Link href="/inventory/stock-take">
                    <Button className="rounded-2xl bg-slate-900 text-white hover:bg-slate-800 shadow-xl shadow-slate-900/10 gap-2 h-12 px-8">
                        <History className="w-4 h-4" />
                        Record Stock Take
                    </Button>
                </Link>
            </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
            <SummaryStatCard
                label="Total Adjustments"
                value={filteredAdjustments?.length || 0}
                icon={ArrowRightLeft}
                tone="slate"
            />
            <SummaryStatCard
                label="Latest Update"
                value={filteredAdjustments?.[0] ? format(new Date(filteredAdjustments[0].createdAt!), 'MMM d, p') : "-"}
                icon={Calendar}
                tone="blue"
                valueClassName="text-lg font-bold"
            />
        </div>

        <div className="flex flex-col md:flex-row gap-4 mb-6">
            <div className="relative flex-1 max-w-md group">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 group-hover:text-primary transition-all duration-300" />
                <Input
                    placeholder="Search by product or notes..."
                    className="pl-11 h-12 bg-white/80 border-slate-200/60 shadow-sm rounded-[1.25rem] focus-visible:ring-primary/10 transition-all duration-300"
                    value={searchTerm}
                    onChange={handleSearch}
                />
            </div>
            <div className="flex items-center gap-3 bg-white/80 backdrop-blur-sm border border-slate-200/60 rounded-[1.25rem] px-4 shadow-sm h-12 overflow-hidden">
                <Filter className="w-4 h-4 text-slate-400" />
                <Select value={typeFilter} onValueChange={setTypeFilter}>
                    <SelectTrigger className="border-none bg-transparent shadow-none focus:ring-0 w-[160px] text-xs font-bold uppercase tracking-widest p-0">
                        <SelectValue placeholder="All Types" />
                    </SelectTrigger>
                    <SelectContent className="rounded-2xl shadow-xl overflow-hidden p-1">
                        <SelectItem value="all">All Types</SelectItem>
                        {ADJUSTMENT_TYPES.map(type => (
                            <SelectItem key={type} value={type}>{type}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>
        </div>

        <Card className="border-none shadow-2xl shadow-slate-200/50 bg-white/50 backdrop-blur-md rounded-[2.5rem] overflow-hidden group">
            <CardContent className="p-0">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-slate-50/80 border-b border-slate-100/60">
                                <th className="p-6 font-black text-slate-400 uppercase tracking-widest text-[10px]">Adjustment Info</th>
                                <th className="p-6 font-black text-slate-400 uppercase tracking-widest text-[10px]">Product / SKU</th>
                                <th className="p-6 font-black text-slate-400 uppercase tracking-widest text-[10px]">Quantity</th>
                                <th className="p-6 font-black text-slate-400 uppercase tracking-widest text-[10px]">Reason & Notes</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100/60">
                            {isLoading ? (
                                <tr>
                                    <td colSpan={4} className="p-20 text-center">
                                        <div className="flex flex-col items-center justify-center gap-4">
                                            <div className="w-10 h-10 border-4 border-slate-200 border-t-amber-600 rounded-full animate-spin" />
                                            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Scanning Stock Audit Log...</p>
                                        </div>
                                    </td>
                                </tr>
                            ) : paginatedAdjustments?.length === 0 ? (
                                <tr>
                                    <td colSpan={4} className="p-20 text-center">
                                        <div className="flex flex-col items-center justify-center max-w-sm mx-auto">
                                            <div className="w-20 h-20 rounded-[2.5rem] bg-slate-50 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-500">
                                                <AlertCircle className="w-10 h-10 text-slate-200" />
                                            </div>
                                            <h3 className="text-xl font-display font-bold text-slate-900 mb-2">No adjustments yet</h3>
                                            <p className="text-sm text-slate-400 mb-8 leading-relaxed">
                                                All manual stock changes, shrinkage, and corrections will be listed here for audit purposes.
                                            </p>
                                            <Link href="/inventory/stock-take">
                                                <Button className="rounded-2xl bg-slate-900 text-white hover:bg-slate-800 shadow-xl shadow-slate-900/10 gap-2 h-12 px-8">
                                                    <PlusCircle className="w-4 h-4" />
                                                    Start First Audit Session
                                                </Button>
                                            </Link>
                                        </div>
                                    </td>
                                </tr>
                                ) : paginatedAdjustments?.map((t) => {
                                    const product = products?.find(p => p.id === t.productId);
                                    const qty = Number(t.quantity);
                                    const isLoss = qty < 0;

                                    return (
                                        <tr key={t.id} className="group hover:bg-slate-50/80 transition-all duration-300">
                                            <td className="p-6 align-middle">
                                                <div className="flex flex-col gap-1">
                                                    <div className="flex items-center gap-2">
                                                        <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${isLoss ? 'bg-amber-100 text-amber-600' : 'bg-emerald-100 text-emerald-600'}`}>
                                                            {isLoss ? <TrendingDown className="w-4 h-4" /> : <TrendingUp className="w-4 h-4" />}
                                                        </div>
                                                        <div className="flex flex-col">
                                                            <span className={`text-[11px] font-black uppercase tracking-tighter ${isLoss ? 'text-amber-700' : 'text-emerald-700'}`}>
                                                                {t.type.replace('_', ' ')}
                                                            </span>
                                                            {t.userName && (
                                                                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter flex items-center gap-1">
                                                                    By {t.userName}
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                    <span className="text-[10px] font-bold text-slate-400 mt-1 ml-10">
                                                        {format(new Date(t.createdAt!), 'MMM d, yyyy • HH:mm')}
                                                    </span>
                                                </div>
                                            </td>
                                            <td className="p-6 align-middle">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-10 h-10 rounded-2xl bg-white border border-slate-100 flex items-center justify-center text-slate-300 shadow-sm transition-transform group-hover:scale-105">
                                                        <Package className="w-5 h-5" />
                                                    </div>
                                                    <div className="flex flex-col">
                                                        <span className="font-bold text-slate-700 text-[13px]">{product?.name || "Unknown Product"}</span>
                                                        <span className="text-[10px] font-black text-slate-400 font-mono tracking-tighter uppercase">{product?.sku || 'NO SKU'}</span>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="p-6 align-middle">
                                                <div className="flex flex-col gap-0.5">
                                                    <span className={`text-sm font-black ${isLoss ? 'text-amber-600' : 'text-emerald-600'}`}>
                                                        {qty > 0 ? '+' : ''}{qty.toFixed(2)}
                                                    </span>
                                                    <span className="text-[9px] font-bold text-slate-300 uppercase tracking-widest">{product?.unit || 'units'}</span>
                                                </div>
                                            </td>
                                            <td className="p-6 align-middle">
                                                <div className="max-w-[300px]">
                                                    <p className="text-[11px] text-slate-600 leading-relaxed italic bg-white/50 border border-slate-100 rounded-xl p-3 shadow-sm group-hover:bg-white transition-all">
                                                        "{t.notes || 'No notes provided'}"
                                                    </p>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>

                    {/* Pagination Controls */}
                    {totalPages > 1 && (
                        <div className="flex flex-col sm:flex-row items-center justify-between px-8 py-6 border-t border-slate-100/60 bg-slate-50/20 gap-4">
                            <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-slate-200" />
                                Page {currentPage} of {totalPages}
                            </div>
                            <div className="flex gap-2">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                    disabled={currentPage === 1}
                                    className="rounded-xl h-10 px-4 border-slate-200 shadow-sm font-bold text-xs hover:bg-white transition-all disabled:opacity-30"
                                >
                                    <ChevronLeft className="h-3 w-3 mr-2" /> Previous
                                </Button>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                    disabled={currentPage === totalPages}
                                    className="rounded-xl h-10 px-4 border-slate-200 shadow-sm font-bold text-xs hover:bg-white transition-all disabled:opacity-30"
                                >
                                    Next <ChevronRight className="h-3 w-3 ml-2" />
                                </Button>
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>
        </Layout>
    );
}
