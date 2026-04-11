
import { Layout } from "@/components/layout";
import { useState, useRef, useMemo } from "react";
import { useProducts } from "@/hooks/use-products";
import { useActiveCompany } from "@/hooks/use-active-company";
import { useBranchContext } from "@/lib/branch-context";
import { useInventoryAdjust } from "@/hooks/use-inventory";
import { type Product } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { 
    Search, 
    Download, 
    Upload, 
    History, 
    ArrowRight, 
    ChevronLeft, 
    CheckCircle2, 
    AlertCircle, 
    TrendingDown, 
    TrendingUp, 
    FileSpreadsheet, 
    ShieldCheck, 
    Plus,
    X,
    Loader2,
    Calendar,
    ArrowRightLeft,
    Package
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import * as XLSX from 'xlsx';

type StockCountItem = {
    productId: number;
    name: string;
    sku: string;
    expected: number;
    counted: number;
    unit: string;
    unitCost: number;
};

export default function StockTakePage() {
    const [, setLocation] = useLocation();
    const { activeCompanyId } = useActiveCompany();
    const { selectedBranchId } = useBranchContext();
    const companyId = activeCompanyId || 0;
    const branchId = selectedBranchId || undefined;

    const { toast } = useToast();
    const { data: allProducts, isLoading } = useProducts(companyId, branchId);
    const adjustMutation = useInventoryAdjust(companyId);

    const [step, setStep] = useState<1 | 2 | 3>(1); // 1: Selection, 2: Counting, 3: Variance
    const [searchTerm, setSearchTerm] = useState("");
    const [selectedProducts, setSelectedProducts] = useState<Map<number, Product>>(new Map());
    const [counts, setCounts] = useState<Map<number, number>>(new Map());
    const [isProcessing, setIsProcessing] = useState(false);

    const fileInputRef = useRef<HTMLInputElement>(null);

    const trackedProducts = useMemo(() => 
        allProducts?.filter(p => p.isTracked && !p.isService) || [], 
    [allProducts]);

    const filteredProducts = useMemo(() => 
        trackedProducts.filter(p => 
            p.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
            p.sku?.toLowerCase().includes(searchTerm.toLowerCase())
        ),
    [trackedProducts, searchTerm]);

    const toggleProduct = (product: Product) => {
        const newSelected = new Map(selectedProducts);
        if (newSelected.has(product.id)) {
            newSelected.delete(product.id);
        } else {
            newSelected.set(product.id, product);
        }
        setSelectedProducts(newSelected);
    };

    const addAll = () => {
        const newSelected = new Map();
        trackedProducts.forEach(p => newSelected.set(p.id, p));
        setSelectedProducts(newSelected);
    };

    const clearAll = () => {
        setSelectedProducts(new Map());
    };

    const handleNextToCount = () => {
        if (selectedProducts.size === 0) {
            toast({
                title: "Selection Required",
                description: "Please select at least one product to continue.",
                variant: "destructive"
            });
            return;
        }
        // Initialize counts with 0 or current system baseline
        const newCounts = new Map();
        selectedProducts.forEach(p => newCounts.set(p.id, Number(p.branchStock || p.stockLevel || 0)));
        setCounts(newCounts);
        setStep(2);
    };

    const updateCount = (productId: number, val: string) => {
        const num = parseFloat(val);
        const newCounts = new Map(counts);
        newCounts.set(productId, isNaN(num) ? 0 : num);
        setCounts(newCounts);
    };

    // --- CSV/Excel Export ---
    const exportSheet = () => {
        const data = Array.from(selectedProducts.values()).map(p => ({
            'ID': p.id,
            'Product Name': p.name,
            'SKU': p.sku || 'N/A',
            'Expected Stock': Number(p.branchStock || p.stockLevel || 0),
            'Counted Stock': Number(p.branchStock || p.stockLevel || 0),
            'Unit': p.unit || 'units'
        }));

        const ws = XLSX.utils.json_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Stock Take");
        XLSX.writeFile(wb, `Stock-Take-${new Date().toISOString().split('T')[0]}.xlsx`);
    };

    // --- CSV/Excel Import ---
    const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (evt) => {
            const bstr = evt.target?.result;
            const wb = XLSX.read(bstr, { type: 'binary' });
            const wsname = wb.SheetNames[0];
            const ws = wb.Sheets[wsname];
            const data = XLSX.utils.sheet_to_json(ws) as any[];

            const newCounts = new Map(counts);
            data.forEach(row => {
                const id = row['ID'];
                const counted = row['Counted Stock'];
                if (id && selectedProducts.has(id) && typeof counted === 'number') {
                    newCounts.set(id, counted);
                }
            });
            setCounts(newCounts);
            toast({
                title: "Import Successful",
                description: `Updated counts for ${data.length} items.`,
            });
        };
        reader.readAsBinaryString(file);
        e.target.value = ''; // Reset input
    };

    const varianceData = useMemo(() => {
        return Array.from(selectedProducts.values()).map(p => {
            const expected = Number(p.branchStock || p.stockLevel || 0);
            const counted = counts.get(p.id) || 0;
            const variance = counted - expected;
            const unitCost = Number(p.unitCost || 0);
            const varianceValue = variance * unitCost;

            return {
                ...p,
                expected,
                counted,
                variance,
                varianceValue
            };
        });
    }, [selectedProducts, counts]);

    const totalVarianceValue = useMemo(() => 
        varianceData.reduce((sum, item) => sum + item.varianceValue, 0),
    [varianceData]);

    const handleCommit = async () => {
        setIsProcessing(true);
        try {
            const itemsToAdjust = varianceData.filter(v => v.variance !== 0);
            
            for (const item of itemsToAdjust) {
                await adjustMutation.mutateAsync({
                    productId: item.id,
                    quantity: item.variance,
                    type: "CORRECTION",
                    notes: `Stock Take Correction - Expected: ${item.expected}, Counted: ${item.counted}`,
                    branchId
                });
            }

            toast({
                title: "Inventory Updated",
                description: `Successfully adjusted ${itemsToAdjust.length} items based on stock take counts.`,
            });
            setLocation("/inventory/adjustments");
        } catch (error) {
            toast({
                title: "Error committing adjustments",
                description: "Something went wrong during the sync process.",
                variant: "destructive"
            });
        } finally {
            setIsProcessing(false);
        }
    };

    return (
        <Layout>
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-4">
                    <Button 
                        variant="ghost" 
                        size="icon" 
                        className="rounded-full h-10 w-10"
                        onClick={() => step > 1 ? setStep((step - 1) as any) : setLocation("/inventory/adjustments")}
                    >
                        <ChevronLeft className="w-5 h-5" />
                    </Button>
                    <div>
                        <h1 className="text-2xl font-display font-bold text-slate-900 tracking-tight leading-none mb-1">Digital Stock Audit</h1>
                        <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Reconciliating system variances & physical assets</p>
                    </div>
                </div>

                <div className="flex items-center gap-6">
                    <div className="flex bg-slate-100 rounded-full h-10 p-1 items-center">
                        {[
                            { s: 1, label: "Scope" },
                            { s: 2, label: "Recording" },
                            { s: 3, label: "Analysis" }
                        ].map((m) => (
                            <div 
                                key={m.s}
                                className={cn(
                                    "px-6 h-8 rounded-full flex items-center justify-center text-[10px] font-black uppercase tracking-widest transition-all",
                                    step === m.s ? "bg-white text-primary shadow-sm" : "text-slate-400"
                                )}
                            >
                                {m.label}
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* STEP 1: SCOPE SELECTION */}
            {step === 1 && (
                <div className="flex flex-col gap-6 h-[calc(100vh-180px)] animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <Card className="flex-1 bg-white rounded-[2rem] shadow-2xl border-none overflow-hidden flex flex-col ring-1 ring-slate-100/60">
                        <div className="p-6 pb-2 flex items-center justify-between gap-8">
                            <div className="relative flex-1 group max-w-xl">
                                <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 group-hover:text-primary transition-all duration-300" />
                                <Input
                                    placeholder="Filter catalog..."
                                    className="pl-11 h-12 bg-slate-50 border-none rounded-xl focus-visible:ring-primary/5 transition-all text-sm font-medium"
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                />
                            </div>
                            <div className="flex gap-2">
                                <Button variant="secondary" className="rounded-xl h-12 px-6 font-black uppercase text-[10px] tracking-widest text-slate-600 bg-slate-100" onClick={addAll}>
                                    Select All
                                </Button>
                                <Button variant="ghost" className="rounded-xl h-12 px-6 font-black uppercase text-[10px] tracking-widest text-slate-400" onClick={clearAll}>
                                    Clear
                                </Button>
                            </div>
                        </div>

                        <ScrollArea className="flex-1 px-6">
                            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 p-2">
                                {isLoading ? (
                                    <div className="col-span-full py-32 text-center">
                                         <Loader2 className="w-8 h-8 animate-spin mx-auto text-primary mb-4" />
                                         <p className="font-black text-slate-400 uppercase tracking-widest text-[9px]">Initializing catalog...</p>
                                    </div>
                                ) : filteredProducts.map(p => {
                                    const isSelected = selectedProducts.has(p.id);
                                    return (
                                        <div 
                                            key={p.id}
                                            onClick={() => toggleProduct(p)}
                                            className={cn(
                                                "p-4 rounded-2xl border-2 transition-all cursor-pointer group relative overflow-hidden",
                                                isSelected 
                                                    ? "bg-slate-900 border-slate-900 shadow-lg shadow-slate-900/10" 
                                                    : "bg-white border-slate-50 hover:border-slate-200"
                                            )}
                                        >
                                            <div className="flex flex-col h-full">
                                                <div className="mb-2">
                                                    <p className={cn("font-black text-[11px] mb-0.5 line-clamp-1 leading-tight uppercase", isSelected ? "text-white" : "text-slate-800")}>{p.name}</p>
                                                    <span className={cn("text-[8px] font-black font-mono tracking-widest uppercase", isSelected ? "text-white/40" : "text-slate-400")}>{p.sku || "N/A"}</span>
                                                </div>
                                                <div className="mt-auto flex items-end justify-between">
                                                    <div className="flex flex-col">
                                                        <p className={cn("text-base font-black font-mono leading-none", isSelected ? "text-white" : "text-slate-500")}>{p.branchStock || p.stockLevel || 0}</p>
                                                    </div>
                                                    {isSelected && <CheckCircle2 className="w-4 h-4 text-primary" />}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </ScrollArea>

                        <div className="p-6 border-t border-slate-50 bg-slate-50/50 flex items-center justify-between">
                            <div className="flex gap-10">
                                <div className="flex flex-col">
                                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Selection Intensity</span>
                                    <span className="text-xl font-black text-slate-900">{selectedProducts.size} <span className="text-[10px] font-bold text-slate-400 uppercase">Items Selected</span></span>
                                </div>
                            </div>
                            <Button className="btn-gradient px-12 h-14 rounded-2xl text-[11px] font-black uppercase tracking-widest shadow-xl active:scale-95 group" onClick={handleNextToCount}>
                                Proceed to Tally <ArrowRight className="w-4 h-4 ml-3 group-hover:translate-x-1 transition-transform" />
                            </Button>
                        </div>
                    </Card>
                </div>
            )}

            {/* STEP 2: RECORD COUNTS */}
            {step === 2 && (
                <div className="flex flex-col gap-6 h-[calc(100vh-180px)] animate-in fade-in slide-in-from-right-4 duration-500">
                    <Card className="flex-1 border-none shadow-2xl bg-white rounded-[2rem] overflow-hidden flex flex-col ring-1 ring-slate-100/60">
                        <div className="p-8 border-b border-slate-50 flex items-center justify-between bg-slate-50/20">
                            <div>
                                <h3 className="text-xl font-display font-black text-slate-900 tracking-tight leading-none mb-1">Stock Reconciliation Matrix</h3>
                                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Bridging records with physical reality</p>
                            </div>
                            <div className="flex gap-2">
                                <Button variant="outline" className="h-11 rounded-xl border-slate-200 font-black uppercase tracking-widest text-[9px] px-6 gap-2 hover:bg-white shadow-none" onClick={exportSheet}>
                                    <Download className="w-4 h-4" />
                                    Download
                                </Button>
                                <Button className="h-11 rounded-xl bg-slate-900 text-white hover:bg-slate-800 shadow-none font-black uppercase tracking-widest text-[9px] px-6 gap-2" onClick={() => fileInputRef.current?.click()}>
                                    <Upload className="w-4 h-4" />
                                    Upload
                                </Button>
                                <input 
                                    type="file" 
                                    ref={fileInputRef} 
                                    onChange={handleImport} 
                                    accept=".csv,.xlsx,.xls" 
                                    className="hidden" 
                                />
                            </div>
                        </div>

                        <ScrollArea className="flex-1">
                            <table className="w-full text-left border-collapse table-fixed">
                                <thead className="bg-slate-50/50 sticky top-0 z-10 backdrop-blur-md">
                                    <tr className="border-b border-slate-100">
                                        <th className="px-6 py-3 text-[9px] font-black uppercase tracking-widest text-slate-400 w-12 text-center">#</th>
                                        <th className="px-4 py-3 text-[9px] font-black uppercase tracking-widest text-slate-400">Identity</th>
                                        <th className="px-4 py-3 text-[9px] font-black uppercase tracking-widest text-slate-400 text-center w-28">Target</th>
                                        <th className="px-4 py-3 text-[9px] font-black uppercase tracking-widest text-slate-400 w-40 text-center">Physical Count</th>
                                        <th className="px-6 py-3 text-[9px] font-black uppercase tracking-widest text-slate-400 text-right w-32">Variance</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-50">
                                    {Array.from(selectedProducts.values()).map((p, idx) => {
                                        const expected = Number(p.branchStock || p.stockLevel || 0);
                                        const counted = counts.get(p.id) || 0;
                                        const v = counted - expected;
                                        return (
                                            <tr key={p.id} className="group hover:bg-slate-50/50 transition-all bg-white border-b border-slate-50 last:border-0 h-11">
                                                <td className="px-6 py-1 text-center text-[10px] font-black text-slate-300">{idx+1}</td>
                                                <td className="px-4 py-1">
                                                    <div className="flex flex-col overflow-hidden">
                                                        <span className="font-black text-slate-800 text-[13px] truncate leading-tight">{p.name}</span>
                                                        <span className="text-[9px] font-black text-slate-400 font-mono tracking-widest uppercase truncate">{p.sku || "N/A"}</span>
                                                    </div>
                                                </td>
                                                <td className="px-4 py-1 text-center">
                                                    <Badge variant="outline" className="h-7 px-3 font-mono font-black text-[11px] text-slate-400 bg-white border-slate-50 shadow-none pointer-events-none">
                                                        {expected}
                                                    </Badge>
                                                </td>
                                                <td className="px-4 py-1">
                                                    <div className="relative max-w-[120px] mx-auto">
                                                        <Input 
                                                            type="number" 
                                                            className="h-8 bg-white border-slate-200 rounded-xl font-mono font-black text-[13px] focus-visible:ring-primary/5 transition-all text-slate-900 text-center shadow-none" 
                                                            value={counts.get(p.id) ?? ""}
                                                            onChange={(e) => updateCount(p.id, e.target.value)}
                                                        />
                                                    </div>
                                                </td>
                                                <td className="px-6 py-1 text-right">
                                                    {v !== 0 ? (
                                                        <Badge className={cn(
                                                            "h-7 px-4 rounded-xl font-black text-[10px] shadow-none border font-mono",
                                                            v > 0 
                                                                ? "bg-emerald-50 text-emerald-600 border-emerald-100" 
                                                                : "bg-rose-50 text-rose-600 border-rose-100"
                                                        )}>
                                                            {v > 0 ? "+" : ""}{v.toFixed(2)}
                                                        </Badge>
                                                    ) : (
                                                        <span className="text-slate-200 font-black text-[8px] uppercase tracking-widest pr-2">Matched</span>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </ScrollArea>

                        <div className="p-6 border-t border-slate-100 bg-slate-900 text-white flex items-center justify-between">
                            <div className="flex gap-12 ml-2">
                                <div className="flex flex-col">
                                    <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-0.5">Audited</span>
                                    <span className="text-xl font-black">{selectedProducts.size}</span>
                                </div>
                                <div className="flex flex-col">
                                    <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-0.5">Discrepancy</span>
                                    <span className="text-xl font-black text-rose-400">
                                        {Array.from(counts.entries()).filter(([id, cnt]) => cnt !== Number(selectedProducts.get(id)?.branchStock || selectedProducts.get(id)?.stockLevel || 0)).length}
                                    </span>
                                </div>
                            </div>
                            <Button className="bg-white text-slate-900 hover:bg-white/90 px-10 h-14 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-none active:scale-95 group" onClick={() => setStep(3)}>
                                Finalize Variance <History className="w-4 h-4 ml-3" />
                            </Button>
                        </div>
                    </Card>
                </div>
            )}

            {/* STEP 3: VARIANCE REPORT & COMMIT */}
            {step === 3 && (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-[calc(100vh-180px)] animate-in fade-in slide-in-from-top-4 duration-500">
                    <Card className="lg:col-span-8 flex flex-col h-full bg-white rounded-[2.5rem] shadow-2xl border-none overflow-hidden ring-1 ring-slate-100/60">
                        <div className="p-8 border-b border-slate-50 bg-slate-50/20">
                            <h3 className="text-xl font-display font-black text-slate-900 tracking-tight leading-none mb-1">Variance Analytics</h3>
                            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Reconciliation of digital ledger against physical snapshots</p>
                        </div>

                        <ScrollArea className="flex-1">
                            <table className="w-full text-left border-collapse table-fixed">
                                <thead className="bg-slate-50/50 sticky top-0 z-10 backdrop-blur-md">
                                    <tr className="border-b border-slate-100">
                                        <th className="px-8 py-3 text-[9px] font-black uppercase tracking-widest text-slate-400">Product Identity</th>
                                        <th className="px-6 py-3 text-[9px] font-black uppercase tracking-widest text-slate-400 text-center w-32">Variance</th>
                                        <th className="px-8 py-3 text-[9px] font-black uppercase tracking-widest text-slate-400 text-right w-40">Impact</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-50">
                                    {varianceData.map(item => (
                                        <tr key={item.id} className="group hover:bg-slate-50 transition-colors h-11">
                                            <td className="px-8 py-1">
                                                <div className="flex flex-col overflow-hidden">
                                                    <span className="font-black text-slate-800 text-[13px] truncate leading-tight uppercase">{item.name}</span>
                                                    <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest mt-0.5 opacity-60 truncate">Target: {item.expected} | Physical: {item.counted}</span>
                                                </div>
                                            </td>
                                            <td className="px-6 py-1 text-center">
                                                <div className={cn(
                                                    "inline-flex font-mono font-black text-[11px] px-4 py-1 rounded-xl border",
                                                    item.variance === 0 
                                                        ? "text-slate-200 border-slate-50" 
                                                        : (item.variance > 0 ? "bg-emerald-50 text-emerald-700 border-emerald-100" : "bg-rose-50 text-rose-700 border-rose-100")
                                                )}>
                                                    {item.variance > 0 ? "+" : ""}{item.variance.toFixed(2)}
                                                </div>
                                            </td>
                                            <td className="px-8 py-1 text-right font-black font-mono text-slate-900 text-[13px]">
                                                {item.varianceValue < 0 ? "-" : (item.varianceValue > 0 ? "+" : "")}${Math.abs(item.varianceValue).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </ScrollArea>
                    </Card>

                    <div className="lg:col-span-4 flex flex-col gap-6">
                        <Card className={cn(
                            "p-10 rounded-[3rem] shadow-2xl flex flex-col justify-center items-center text-center relative overflow-hidden transition-all duration-700 flex-1",
                            totalVarianceValue < 0 ? "bg-rose-950 text-rose-100" : (totalVarianceValue > 0 ? "bg-emerald-950 text-emerald-100" : "bg-slate-900 text-white")
                        )}>
                            <div className="relative z-10 flex flex-col items-center">
                                <div className={cn(
                                    "w-20 h-20 rounded-[2rem] flex items-center justify-center mb-8 mx-auto border-2",
                                    totalVarianceValue < 0 
                                        ? "bg-rose-500/10 text-rose-300 border-rose-500/20" 
                                        : (totalVarianceValue > 0 ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/20" : "bg-slate-800 text-slate-400 border-slate-700")
                                )}>
                                    {totalVarianceValue === 0 ? <ShieldCheck className="w-10 h-10" /> : (totalVarianceValue < 0 ? <TrendingDown className="w-10 h-10" /> : <TrendingUp className="w-10 h-10" />)}
                                </div>
                                <p className="text-[9px] font-black uppercase tracking-[0.3em] opacity-40 mb-2">Impact Valuation</p>
                                <h1 className="text-5xl font-black font-display tracking-tighter mb-4">
                                    {totalVarianceValue < 0 ? "-" : (totalVarianceValue > 0 ? "+" : "")}${Math.abs(totalVarianceValue).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                </h1>
                            </div>
                        </Card>

                        <Card className="p-10 rounded-[3rem] shadow-2xl bg-white border border-slate-100 flex flex-col justify-between overflow-hidden relative group h-[280px]">
                            <div className="space-y-6">
                                <h4 className="text-xl font-display font-black text-slate-900 tracking-tight">Authorization</h4>
                                <div className="space-y-4">
                                    <div className="flex items-center gap-4">
                                        <div className="w-10 h-10 rounded-2xl bg-slate-50 flex items-center justify-center text-primary group-hover:scale-110 transition-all">
                                            <ArrowRightLeft className="w-5 h-5" />
                                        </div>
                                        <div className="flex flex-col">
                                            <span className="text-[9px] font-black uppercase text-slate-400 tracking-widest mb-0.5">Asset Re-Sync</span>
                                            <span className="text-base font-black text-slate-800">{varianceData.filter(v => v.variance !== 0).length} Corrections</span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="pt-6 flex flex-col gap-3">
                                <Button 
                                    className="btn-gradient w-full h-16 rounded-[1.75rem] text-[10px] font-black uppercase tracking-[0.2em] shadow-xl active:scale-95 disabled:opacity-50" 
                                    disabled={isProcessing || varianceData.filter(v => v.variance !== 0).length === 0}
                                    onClick={handleCommit}
                                >
                                    {isProcessing ? (
                                        <Loader2 className="w-5 h-5 animate-spin" />
                                    ) : (
                                        "Commit Reconciliation"
                                    )}
                                </Button>
                                <Button variant="ghost" className="h-10 rounded-xl text-slate-400 font-black uppercase text-[9px] tracking-widest" onClick={() => setStep(2)}>
                                    Back
                                </Button>
                            </div>
                        </Card>
                    </div>
                </div>
            )}
        </Layout>
    );
}

