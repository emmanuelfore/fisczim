import { Layout } from "@/components/layout";
import { PageHeader } from "@/components/page-header";
import { Input } from "@/components/ui/input";
import { useState } from "react";
import {
  AuditTable,
  BreakdownTable,
  CashupReportTable,
  ReconciliationApproval,
  addDays,
  dateInput,
  dayBoundaryIso,
  useReportData,
} from "./shared";

export default function CashupReportPage() {
  const companyId = parseInt(localStorage.getItem("selectedCompanyId") || "0");
  const [from, setFrom] = useState(dateInput(addDays(new Date(), -6)));
  const [to, setTo] = useState(dateInput());

  const {
    isLoading,
    data,
    byConductor,
    byPayment,
    conductorVariance,
  } = useReportData(
    companyId,
    dayBoundaryIso(from),
    dayBoundaryIso(to, true),
  );

  return (
    <Layout>
      <PageHeader
        title="Cash-up & Reconciliation"
        subtitle="Cash-up variance, unsynced ticket audit, and reconciliation sign-off"
        actions={
          <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
            <Input
              type="date"
              value={from}
              onChange={(event) => setFrom(event.target.value)}
              className="w-[150px]"
            />
            <Input
              type="date"
              value={to}
              onChange={(event) => setTo(event.target.value)}
              className="w-[150px]"
            />
          </div>
        }
      />

      {isLoading ? (
        <p className="py-8 text-center text-slate-500">
          Loading cash-up data...
        </p>
      ) : (
        <div className="mt-4 grid gap-4 xl:grid-cols-2">
          <CashupReportTable cashup={data?.cashup} variance={conductorVariance} />
          <BreakdownTable
            title="By Conductor"
            rows={byConductor}
            empty="No conductor data"
          />
        </div>
      )}

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <BreakdownTable title="Payment Methods" rows={byPayment} />
        <AuditTable data={data?.syncAudit} />
      </div>

      <ReconciliationApproval companyId={companyId} />
    </Layout>
  );
}