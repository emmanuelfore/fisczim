import { Document, Page, Text, View, StyleSheet, Image } from "@react-pdf/renderer";
import { formatCurrencyAmount } from "@shared/currency";
import { pdfFontFamily } from "@/lib/pdf-fonts";
import { resolveMediaUrl } from "@/lib/media";

const s = StyleSheet.create({
  page: { fontFamily: "Helvetica", fontSize: 8, color: "#1e293b", padding: 36, backgroundColor: "#fff" },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", borderBottomWidth: 1, borderBottomColor: "#e2e8f0", paddingBottom: 12, marginBottom: 16 },
  logo: { width: 110, height: 34, objectFit: "contain" },
  company: { fontSize: 12, fontWeight: 700 },
  title: { fontSize: 18, fontWeight: 700, textTransform: "uppercase", color: "#0f172a" },
  subtitle: { fontSize: 8, color: "#64748b", marginTop: 3 },
  sectionTitle: { fontSize: 9, fontWeight: 700, textTransform: "uppercase", color: "#0f172a", marginBottom: 6, marginTop: 12 },
  metaRow: { flexDirection: "row", gap: 24, marginBottom: 10 },
  metaCol: { flex: 1 },
  label: { fontSize: 7, color: "#94a3b8", textTransform: "uppercase", marginBottom: 2 },
  value: { fontSize: 9, fontWeight: 600, color: "#0f172a" },
  muted: { fontSize: 8, color: "#64748b" },
  summary: { flexDirection: "row", backgroundColor: "#f8fafc", padding: 10, gap: 12, marginBottom: 12 },
  summaryItem: { flex: 1 },
  summaryLabel: { fontSize: 7, color: "#64748b", textTransform: "uppercase", marginBottom: 3 },
  summaryValue: { fontSize: 11, fontWeight: 700, color: "#0f172a" },
  table: { marginBottom: 8 },
  trHead: { flexDirection: "row", backgroundColor: "#0f172a", paddingVertical: 5, paddingHorizontal: 6 },
  tr: { flexDirection: "row", paddingVertical: 5, paddingHorizontal: 6, borderBottomWidth: 1, borderBottomColor: "#f1f5f9" },
  th: { color: "#fff", fontSize: 7, textTransform: "uppercase" },
  c1: { flex: 2.2 }, c2: { flex: 1, textAlign: "right" }, c3: { flex: 1, textAlign: "right" }, c4: { flex: 1, textAlign: "right" },
  foot: { marginTop: 14, borderTopWidth: 1, borderTopColor: "#e2e8f0", paddingTop: 8, fontSize: 7, color: "#94a3b8", lineHeight: 1.5 },
});

type Props = {
  data: any;
  vehicle: any;
  company: any;
};

export const VehicleAccountStatementPDF = ({ data, vehicle, company }: Props) => {
  const currency = data?.account?.currency || vehicle?.saleCurrency || "USD";
  const money = (value: any) => formatCurrencyAmount(Number(value || 0), currency);
  const t = data?.totals ?? {};
  const costSheet: any[] = data?.costSheet ?? [];
  const payments: any[] = data?.payments ?? [];

  return (
    <Document title={`Vehicle Account Statement - ${vehicle?.stockNumber ?? "Vehicle"}`}>
      <Page size="A4" style={[s.page, { fontFamily: pdfFontFamily("Helvetica") }]}>
        <View style={s.header}>
          {company?.logoUrl ? <Image src={resolveMediaUrl(company.logoUrl)} style={s.logo} /> : <Text style={s.company}>{company?.tradingName || company?.name || "Prime Imports"}</Text>}
          <View>
            <Text style={s.title}>Vehicle Account Statement</Text>
            <Text style={s.subtitle}>Cost sheet &amp; customer funds · {vehicle?.stockNumber ?? "—"}</Text>
            <Text style={s.subtitle}>Generated {new Date().toLocaleDateString()}</Text>
          </View>
        </View>

        <View style={s.metaRow}>
          <View style={s.metaCol}>
            <Text style={s.label}>Customer</Text>
            <Text style={s.value}>{vehicle?.customer?.name || data?.vehicle?.customerName || "—"}</Text>
            <Text style={s.muted}>{vehicle?.customer?.email || ""}</Text>
          </View>
          <View style={s.metaCol}>
            <Text style={s.label}>Vehicle</Text>
            <Text style={s.value}>{vehicle ? `${vehicle.year ?? ""} ${vehicle.make ?? ""} ${vehicle.model ?? ""}`.trim() : "—"}</Text>
            <Text style={s.muted}>VIN {vehicle?.vin || "—"} · {vehicle?.colour || "—"}</Text>
          </View>
          <View style={s.metaCol}>
            <Text style={s.label}>Agreement</Text>
            <Text style={s.value}>{data?.agreement?.agreementNumber || "—"}</Text>
            <Text style={s.muted}>Model: {(data?.agreement?.accountingModel || vehicle?.accountingModel || "agent").toUpperCase()}</Text>
          </View>
        </View>

        <View style={s.summary}>
          <View style={s.summaryItem}><Text style={s.summaryLabel}>Deal value</Text><Text style={s.summaryValue}>{money(t.totalPrice)}</Text></View>
          <View style={s.summaryItem}><Text style={s.summaryLabel}>Collected</Text><Text style={s.summaryValue}>{money(t.collected)}</Text></View>
          <View style={s.summaryItem}><Text style={s.summaryLabel}>Balance due</Text><Text style={s.summaryValue}>{money(t.balanceDue)}</Text></View>
          <View style={s.summaryItem}><Text style={s.summaryLabel}>Processing fee</Text><Text style={s.summaryValue}>{money(t.processingFee)}</Text></View>
        </View>

        <Text style={s.sectionTitle}>Cost sheet — estimated, actual and customer charge</Text>
        <View style={s.table}>
          <View style={s.trHead}>
            <Text style={[s.th, s.c1]}>Cost line</Text>
            <Text style={[s.th, s.c2]}>Estimate</Text>
            <Text style={[s.th, s.c3]}>Actual</Text>
            <Text style={[s.th, s.c3]}>Charge</Text>
            <Text style={[s.th, s.c4]}>Funded</Text>
          </View>
          {costSheet.map((c) => (
            <View style={s.tr} key={c.id}>
              <Text style={s.c1}>{c.description || c.payee || `Cost #${c.id}`}</Text>
              <Text style={s.c2}>{money(c.estimated)}</Text>
              <Text style={s.c3}>{money(c.actual)}</Text>
              <Text style={s.c3}>{money(c.customerCharge)}</Text>
              <Text style={s.c4}>{money(c.allocated)}</Text>
            </View>
          ))}
          {!costSheet.length && <Text style={[s.muted, { padding: 8 }]}>No cost lines recorded.</Text>}
          <View style={[s.tr, { backgroundColor: "#f8fafc" }]}>
            <Text style={[s.c1, { fontWeight: 700 }]}>Customer charge total</Text>
            <Text style={s.c2} />
            <Text style={s.c3} />
            <Text style={[s.c3, { fontWeight: 700 }]}>{money(t.costSheetTotal)}</Text>
            <Text style={s.c4} />
          </View>
        </View>

        <Text style={s.sectionTitle}>Receipts and allocation</Text>
        <View style={s.table}>
          <View style={s.trHead}>
            <Text style={[s.th, s.c1]}>Receipt</Text>
            <Text style={[s.th, s.c2]}>Date</Text>
            <Text style={[s.th, s.c3]}>Received</Text>
            <Text style={[s.th, s.c4]}>Unallocated</Text>
          </View>
          {payments.map((p) => {
            const allocated = (p.allocations ?? []).reduce((sum: number, a: any) => sum + (a.reversesAllocationId ? -Number(a.amount) : Number(a.amount)), 0);
            return (
              <View style={s.tr} key={p.id}>
                <Text style={s.c1}>{p.reference || `Receipt ${p.id}`}</Text>
                <Text style={s.c2}>{p.paymentDate ? new Date(p.paymentDate).toLocaleDateString() : "—"}</Text>
                <Text style={s.c3}>{money(p.baseAmount)}</Text>
                <Text style={s.c4}>{money(Number(p.baseAmount) - allocated)}</Text>
              </View>
            );
          })}
          {!payments.length && <Text style={[s.muted, { padding: 8 }]}>No receipts recorded.</Text>}
        </View>

        <Text style={s.foot}>
          Customer funds held ({money(t.fundsHeld)}) are amounts collected for third-party costs and remain a liability until
          the supplier is settled; settled to date {money(t.paidToThirdParties)}, still owing {money(t.supplierOutstanding)}.
          Prime Imports&apos; revenue on an agency deal is the processing fee only ({money(t.processingFee)}; recognised {money(t.feeRecognised)}).
          This statement is not a tax invoice; the processing fee invoice is issued separately.
        </Text>
      </Page>
    </Document>
  );
};
