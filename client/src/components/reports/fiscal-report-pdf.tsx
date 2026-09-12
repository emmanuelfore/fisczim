import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Image,
} from "@react-pdf/renderer";
import { format } from "date-fns";
import { pdfFontFamily } from "@/lib/pdf-fonts";

const s = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 9,
    color: "#1e293b",
    backgroundColor: "#ffffff",
    padding: 0,
  },
  headerBanner: {
    height: 90,
    backgroundColor: "#ffffff",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 40,
    borderBottomWidth: 2,
    borderBottomColor: "#0f172a",
  },
  logoBox: {
    width: 120,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
  },
  headerText: {
    color: "#0f172a",
    textAlign: "right",
  },
  content: {
    padding: 40,
  },
  title: {
    fontSize: 22,
    fontWeight: 700,
    color: "#0f172a",
    textTransform: "uppercase",
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 10,
    color: "#64748b",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  sectionTitle: {
    fontSize: 10,
    fontWeight: 700,
    color: "#0f172a",
    textTransform: "uppercase",
    backgroundColor: "#f1f5f9",
    padding: 6,
    marginTop: 20,
    marginBottom: 10,
    borderRadius: 2,
  },
  summaryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 15,
    marginBottom: 20,
  },
  summaryCard: {
    flex: 1,
    minWidth: "30%",
    padding: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 4,
  },
  summaryLabel: {
    fontSize: 7,
    color: "#64748b",
    textTransform: "uppercase",
    marginBottom: 4,
  },
  summaryValue: {
    fontSize: 14,
    fontWeight: 700,
    color: "#0f172a",
  },
  table: {
    width: "100%",
  },
  tableHeader: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#cbd5e1",
    paddingBottom: 4,
    marginBottom: 4,
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },
  col: { flex: 1 },
  colRight: { flex: 1, textAlign: "right" },
  colWide: { flex: 2 },
  colHeader: {
    fontSize: 7,
    fontWeight: 700,
    color: "#475569",
    textTransform: "uppercase",
  },
  bold: { fontWeight: 700 },
  footer: {
    position: "absolute",
    bottom: 30,
    left: 40,
    right: 40,
    textAlign: "center",
    borderTopWidth: 1,
    borderTopColor: "#f1f5f9",
    paddingTop: 10,
  },
  footerText: {
    fontSize: 7,
    color: "#94a3b8",
  },
  metaSection: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 20,
    fontSize: 8,
    color: "#64748b",
  },
  metaItem: {
    flexDirection: "row",
    gap: 4,
  },
});

interface FiscalReportPDFProps {
  type: "X" | "Z";
  data: any;
  company: any;
}

export const FiscalReportPDF = ({
  type,
  data,
  company,
}: FiscalReportPDFProps) => {
  const dateStr = format(new Date(data.summary.date), "dd MMM yyyy, HH:mm");
  const pageFont = pdfFontFamily("Helvetica");

  return (
    <Document
      title={`Fiscal ${type} Report - ${format(new Date(), "yyyy-MM-dd")}`}
    >
      <Page size="A4" style={[s.page, { fontFamily: pageFont }]}>
        <View style={s.headerBanner}>
          <View style={s.logoBox}>
            {company?.logoUrl ? (
              <Image
                src={company.logoUrl}
                style={{ width: 100, height: 35, objectFit: "contain" }}
              />
            ) : (
              <Text style={{ fontSize: 16, fontWeight: 700 }}>
                {company?.name}
              </Text>
            )}
          </View>
          <View style={s.headerText}>
            <Text style={s.title}>Fiscal {type} Report</Text>
            <Text style={s.subtitle}>{company?.name}</Text>
          </View>
        </View>

        <View style={s.content}>
          <View style={s.metaSection}>
            <View>
              <Text>Report Generation: {dateStr}</Text>
              <Text>
                Fiscal Day Number: {data.summary.fiscalDayNo ?? "---"}
              </Text>
            </View>
            <View style={{ textAlign: "right" }}>
              <Text>TIN: {company?.tin || "---"}</Text>
              <Text>VAT: {company?.vatNumber || "---"}</Text>
              <Text>Serial: {company?.fdmsDeviceSerialNo || "---"}</Text>
            </View>
          </View>

          <View style={s.summaryGrid}>
            <View style={s.summaryCard}>
              <Text style={s.summaryLabel}>Total Sales (Net)</Text>
              <Text style={s.summaryValue}>
                $
                {(data.summary.totalRevenue - data.summary.totalTax).toFixed(2)}
              </Text>
            </View>
            <View style={s.summaryCard}>
              <Text style={s.summaryLabel}>Total Output Tax</Text>
              <Text style={s.summaryValue}>
                ${data.summary.totalTax.toFixed(2)}
              </Text>
            </View>
            <View style={s.summaryCard}>
              <Text style={s.summaryLabel}>Gross Revenue</Text>
              <Text style={[s.summaryValue, { color: "#0f172a" }]}>
                ${data.summary.totalRevenue.toFixed(2)}
              </Text>
            </View>
            <View style={s.summaryCard}>
              <Text style={s.summaryLabel}>Receipt Count</Text>
              <Text style={s.summaryValue}>{data.summary.receiptsCount}</Text>
            </View>
          </View>

          {/* Currency Breakdown */}
          <Text style={s.sectionTitle}>Sales By Currency</Text>
          <View style={s.table}>
            <View style={s.tableHeader}>
              <Text style={[s.col, s.colHeader]}>Currency</Text>
              <Text style={[s.colRight, s.colHeader]}>Receipts</Text>
              <Text style={[s.colRight, s.colHeader]}>Tax</Text>
              <Text style={[s.colRight, s.colHeader]}>Total</Text>
            </View>
            {data.currencies.map((c: any, i: number) => (
              <View key={i} style={s.tableRow}>
                <Text style={s.col}>
                  {c.name} ({c.code})
                </Text>
                <Text style={s.colRight}>{c.count}</Text>
                <Text style={s.colRight}>{c.taxAmount.toFixed(2)}</Text>
                <Text style={[s.colRight, s.bold]}>{c.total.toFixed(2)}</Text>
              </View>
            ))}
          </View>

          {/* Tax Breakdown */}
          <Text style={s.sectionTitle}>Tax Distributions</Text>
          <View style={s.table}>
            <View style={s.tableHeader}>
              <Text style={[s.colWide, s.colHeader]}>Tax Category</Text>
              <Text style={[s.colRight, s.colHeader]}>Rate</Text>
              <Text style={[s.colRight, s.colHeader]}>Taxable Amt</Text>
              <Text style={[s.colRight, s.colHeader]}>Tax Amt</Text>
            </View>
            {data.taxes.map((t: any, i: number) => (
              <View key={i} style={s.tableRow}>
                <Text style={s.colWide}>
                  {t.taxName} ({t.taxCode})
                </Text>
                <Text style={s.colRight}>{t.taxPercent}%</Text>
                <Text style={s.colRight}>{t.taxableAmount.toFixed(2)}</Text>
                <Text style={[s.colRight, s.bold]}>
                  {t.taxAmount.toFixed(2)}
                </Text>
              </View>
            ))}
          </View>

          {/* Cashier Breakdown */}
          <Text style={s.sectionTitle}>Cashier Performance</Text>
          <View style={s.table}>
            <View style={s.tableHeader}>
              <Text style={[s.colWide, s.colHeader]}>Cashier Name</Text>
              <Text style={[s.colRight, s.colHeader]}>Receipts</Text>
              <Text style={[s.colRight, s.colHeader]}>Total Sales</Text>
            </View>
            {data.cashiers.map((c: any, i: number) => (
              <View key={i} style={s.tableRow}>
                <Text style={s.colWide}>{c.name}</Text>
                <Text style={s.colRight}>{c.count}</Text>
                <Text style={[s.colRight, s.bold]}>${c.total.toFixed(2)}</Text>
              </View>
            ))}
          </View>

          {/* Items Sold */}
          <Page break />
          <Text style={s.sectionTitle}>Itemized Sales Matrix</Text>
          <View style={s.table}>
            <View style={s.tableHeader}>
              <Text style={[s.colWide, s.colHeader]}>
                Product / Description
              </Text>
              <Text style={[s.col, s.colHeader]}>SKU</Text>
              <Text style={[s.colRight, s.colHeader]}>Qty</Text>
              <Text style={[s.colRight, s.colHeader]}>Total Amount</Text>
            </View>
            {data.items
              .sort((a: any, b: any) => b.total - a.total)
              .map((item: any, i: number) => (
                <View key={i} style={s.tableRow}>
                  <Text style={s.colWide}>{item.name}</Text>
                  <Text style={s.col}>{item.sku || "-"}</Text>
                  <Text style={s.colRight}>{item.quantity}</Text>
                  <Text style={[s.colRight, s.bold]}>
                    ${item.total.toFixed(2)}
                  </Text>
                </View>
              ))}
          </View>

          <View style={s.footer}>
            <Text style={s.footerText}>
              FISCAL {type} REPORT | Generated by {company?.name} Compliance
              System | Confidential
            </Text>
            <Text style={[s.footerText, { marginTop: 2 }]}>
              ZIMRA Electronic Signature and QR Verification included in
              original receipts.
            </Text>
          </View>
        </View>
      </Page>
    </Document>
  );
};
