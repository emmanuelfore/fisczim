import { useState } from "react";
import { startOfMonth, endOfMonth, format } from "date-fns";
import { Layout } from "@/components/layout";
import { useActiveCompany } from "@/hooks/use-active-company";
import { Button } from "@/components/ui/button";
import { Calendar as CalendarIcon, Printer, FileDown, ArrowLeft } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { CashCollectionReport } from "@/components/reports/payments-reports";
import { useLocation } from "wouter";

export default function CashCollectionReportPage() {
    const { activeCompany, isLoading: isLoadingActive } = useActiveCompany();
    const companyId = activeCompany?.id || 0;
    const [, setLocation] = useLocation();

    // State
    const [dateRange, setDateRange] = useState<{ from: Date; to: Date }>({
        from: startOfMonth(new Date()),
        to: endOfMonth(new Date())
    });
    const [search, setSearch] = useState("");

    if (isLoadingActive) {
        return (
            <Layout>
                <div className="flex items-center justify-center min-h-[60vh]">
                    <div className="w-12 h-12 border-4 border-violet-500 border-t-transparent rounded-full animate-spin" />
                </div>
            </Layout>
        );
    }

    return (
        <Layout>
            <div className="mb-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div className="flex items-center gap-4">
                    <Button 
                        variant="ghost" 
                        size="icon" 
                        onClick={() => setLocation("/reports")}
                        className="rounded-full hover:bg-slate-100"
                    >
                        <ArrowLeft className="h-5 w-5 text-slate-500" />
                    </Button>
                </div>

                <div className="flex flex-wrap items-center gap-3 bg-white/50 backdrop-blur-md p-2 rounded-[1.5rem] border border-slate-100 shadow-sm">
                    <Popover>
                        <PopoverTrigger asChild>
                            <Button variant="ghost" className={cn("h-8 px-3 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl")}>
                                <CalendarIcon className="mr-2 h-3.5 w-3.5 text-violet-500" />
                                {format(dateRange.from, "MMM dd")} - {format(dateRange.to, "MMM dd, yyyy")}
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0 rounded-3xl border-none shadow-2xl" align="end">
                            <Calendar
                                initialFocus
                                mode="range"
                                defaultMonth={dateRange.from}
                                selected={{ from: dateRange.from, to: dateRange.to }}
                                onSelect={(range: any) => {
                                    if (range?.from) {
                                        setDateRange({ from: range.from, to: range.to || range.from });
                                    }
                                }}
                                numberOfMonths={2}
                                className="rounded-3xl"
                            />
                        </PopoverContent>
                    </Popover>

                    <div className="h-6 w-px bg-slate-200" />
                    
                    <div className="flex gap-1">
                        <Button variant="ghost" className="h-8 px-3 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl gap-2" onClick={() => window.print()}>
                            <Printer className="h-3.5 w-3.5 text-violet-500" />
                            Print
                        </Button>
                    </div>
                </div>
            </div>

            <CashCollectionReport 
                companyId={companyId}
                dateRange={dateRange}
                search={search}
            />
        </Layout>
    );
}
