import { useState } from "react";
import { startOfMonth, endOfMonth, format } from "date-fns";
import { Layout } from "@/components/layout";
import { useActiveCompany } from "@/hooks/use-active-company";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Calendar as CalendarIcon, Printer } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { CashCollectionReport } from "@/components/reports/payments-reports";

export default function CashCollectionReportPage() {
    const { activeCompany, isLoading: isLoadingActive } = useActiveCompany();
    const companyId = activeCompany?.id || 0;

    const [dateRange, setDateRange] = useState<{ from: Date; to: Date }>({
        from: startOfMonth(new Date()),
        to: endOfMonth(new Date())
    });
    const [search, setSearch] = useState("");

    if (isLoadingActive) {
        return (
            <Layout>
                <div className="flex items-center justify-center min-h-[60vh]">
                    <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
                </div>
            </Layout>
        );
    }

    return (
        <Layout hideHeaderTitle headerTitle="Cash Collection Report" headerSubtitle="Review daily cash collected by cashier and payment method.">
            <div className="space-y-4">
                {/* Toolbar */}
                <div className="flex justify-end">
                    <div className="flex items-center gap-2">
                        <Popover>
                            <PopoverTrigger asChild>
                                <Button
                                    variant="outline"
                                    className="h-10 rounded-[10px] border-[#E5E7EB] bg-white px-3 text-sm font-semibold text-[#0F172A] shadow-none justify-start lg:w-[235px]"
                                >
                                    <CalendarIcon className="mr-2 h-4 w-4 text-[#2563EB]" />
                                    {format(dateRange.from, "dd MMM")} – {format(dateRange.to, "dd MMM yyyy")}
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto rounded-[14px] border-[#E5E7EB] p-0 shadow-lg" align="end">
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
                                    className="p-3"
                                />
                            </PopoverContent>
                        </Popover>

                        <Button
                            variant="outline"
                            className="h-10 rounded-[10px] border-[#E5E7EB] bg-white px-4 text-sm font-semibold text-[#0F172A] shadow-none hover:bg-[#F8FAFC]"
                            onClick={() => window.print()}
                        >
                            <Printer className="mr-2 h-4 w-4 text-[#64748B]" />
                            Print
                        </Button>
                    </div>
                </div>

                {/* Report content */}
                <Card className="overflow-hidden rounded-[14px] border border-[#E5E7EB] bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
                    <CardContent className="p-0">
                        <CashCollectionReport
                            companyId={companyId}
                            dateRange={dateRange}
                            search={search}
                        />
                    </CardContent>
                </Card>
            </div>
        </Layout>
    );
}
