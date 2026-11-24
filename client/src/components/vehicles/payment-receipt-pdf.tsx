import { Document, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import { format } from "date-fns";
import { formatCurrencyAmount } from "@shared/currency";
import { pdfFontFamily } from "@/lib/pdf-fonts";
import { resolveMediaUrl } from "@/lib/media";

const s = StyleSheet.create({
  page: { padding: 42, fontSize: 10, color: "#172033", fontFamily: "Helvetica" },
  header: { flexDirection: "row", justifyContent: "space-between", borderBottomWidth: 2, borderBottomColor: "#059669", paddingBottom: 14 },
  logo: { width: 100, height: 45, objectFit: "contain" },
  title: { fontSize: 23, color: "#059669", fontWeight: 700, textAlign: "right" },
  detail: { marginTop: 22, flexDirection: "row", justifyContent: "space-between" },
  card: { width: "48%", borderWidth: 1, borderColor: "#dbe3f0", padding: 10, backgroundColor: "#f8fafc" },
  label: { color: "#64748b", fontSize: 8, textTransform: "uppercase", marginBottom: 3 },
  amount: { marginTop: 22, padding: 16, backgroundColor: "#059669", color: "#fff", textAlign: "center", fontSize: 25, fontWeight: 700 },
  rows: { marginTop: 18 },
  row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: "#e5e7eb" },
  sectionTitle: { marginTop: 18, fontSize: 9, fontWeight: 700, color: "#0f172a", textTransform: "uppercase" },
  muted: { fontSize: 8, color: "#64748b", lineHeight: 1.4 },
});

const url = (v?: string | null) => {
  const r = resolveMediaUrl(v);
  return r?.startsWith("/") ? `${window.location.origin}${r}` : r || "";
};

export function VehiclePaymentReceiptPDF({ receipt, company }: { receipt: any; company: any }) {
  const { payment, vehicle, customer } = receipt;
  const currency = payment.currency || "USD";
  const money = (v: unknown) => formatCurrencyAmount(Number(v || 0), currency);
  const allocations: any[] = receipt.allocations ?? [];

  return (
    <Document>
      <Page size="A4" style={[s.page, { fontFamily: pdfFontFamily("Helvetica") }]}>
        <View style={s.header}>
          <View>
            {company?.logoUrl ? <Image src={url(company.logoUrl)} style={s.logo} /> : <Text style={{ fontWeight: 700, fontSize: 16 }}>{company?.name}</Text>}
            <Text>{company?.email || ""}</Text>
          </View>
          <View>
            <Text style={s.title}>PAYMENT RECEIPT</Text>
            <Text>{receipt.receiptNumber}</Text>
          </View>
        </View>
        <View style={s.detail}>
          <View style={s.card}>
            <Text style={s.label}>Received from</Text>
            <Text>{customer?.name || "Customer"}</Text>
            <Text>{customer?.email || customer?.phone || ""}</Text>
          </View>
          <View style={s.card}>
            <Text style={s.label}>Vehicle</Text>
            <Text>{vehicle?.year || ""} {vehicle?.make} {vehicle?.model}</Text>
            <Text>Stock: {vehicle?.stockNumber}</Text>
            {receipt.agreementNumber && <Text>Agreement: {receipt.agreementNumber}</Text>}
          </View>
        </View>
        <Text style={s.amount}>{money(payment.amount)}</Text>
        <View style={s.rows}>
          <View style={s.row}><Text>Payment date</Text><Text>{format(new Date(payment.paymentDate), "dd MMM yyyy")}</Text></View>
          <View style={s.row}><Text>Payment method</Text><Text>{payment.paymentMethod}</Text></View>
          <View style={s.row}><Text>Reference</Text><Text>{payment.reference || "—"}</Text></View>
          <View style={s.row}><Text>Remaining balance</Text><Text>{money(receipt.remainingBalance)}</Text></View>
        </View>
        {allocations.length > 0 && (
          <View>
            <Text style={s.sectionTitle}>How this receipt was applied</Text>
            {allocations.map((a) => (
              <View style={s.row} key={a.id}>
                <Text>{a.reversesAllocationId ? "Adjustment · " : ""}{a.label}{a.reversed ? " (reversed)" : ""}</Text>
                <Text>{money(a.amount)}</Text>
              </View>
            ))}
            <Text style={s.muted}>
              Allocations to cost lines fund third-party disbursements; allocations to the processing fee are Prime Imports revenue.
            </Text>
          </View>
        )}
        <Text style={{ marginTop: 28, textAlign: "center", color: "#64748b" }}>Thank you for your payment.</Text>
      </Page>
    </Document>
  );
}
