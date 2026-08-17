import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import { format } from "date-fns";
import type { Product } from "@shared/schema";
import { pdfFontFamily } from "@/lib/pdf-fonts";

const styles = StyleSheet.create({
  page: {
    padding: 30,
    fontFamily: "Helvetica",
    fontSize: 9,
    color: "#1e293b",
    backgroundColor: "#ffffff",
  },
  header: {
    marginBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
    paddingBottom: 10,
  },
  title: {
    fontSize: 18,
    fontWeight: 700,
    color: "#0f172a",
    marginBottom: 4,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  subtitle: {
    fontSize: 9,
    color: "#64748b",
  },
  metaGrid: {
    flexDirection: "row",
    marginTop: 10,
    marginBottom: 15,
    gap: 20,
  },
  metaItem: {
    fontSize: 8,
    color: "#475569",
  },
  metaLabel: {
    fontWeight: 700,
    color: "#64748b",
  },
  table: {
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 4,
    overflow: "hidden",
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
    minHeight: 24,
    alignItems: "center",
  },
  tableHeader: {
    backgroundColor: "#f1f5f9",
    borderBottomWidth: 1,
    borderBottomColor: "#cbd5e1",
    fontWeight: 700,
  },
  colNo: { width: "6%", textAlign: "center", fontSize: 8 },
  colSku: { width: "18%", paddingLeft: 6, fontSize: 8 },
  colName: { width: "42%", paddingLeft: 6, fontSize: 8 },
  colExpected: { width: "12%", textAlign: "center", fontSize: 8 },
  colCount: { width: "12%", textAlign: "center", fontSize: 8 },
  colNotes: { width: "10%", fontSize: 8 },
  cellText: {
    color: "#334155",
  },
  headerText: {
    color: "#475569",
    fontWeight: "bold",
  },
  writeLine: {
    width: "80%",
    height: 1,
    borderBottomWidth: 1,
    borderBottomColor: "#94a3b8",
    borderStyle: "dashed",
    alignSelf: "center",
    marginTop: 8,
  },
  signatureSection: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 40,
    paddingTop: 15,
    borderTopWidth: 1,
    borderTopColor: "#f1f5f9",
  },
  sigBlock: {
    width: "45%",
  },
  sigLine: {
    borderBottomWidth: 1,
    borderBottomColor: "#94a3b8",
    height: 30,
    marginBottom: 5,
  },
  sigLabel: {
    fontSize: 8,
    color: "#64748b",
  },
  footer: {
    position: "absolute",
    bottom: 20,
    left: 30,
    right: 30,
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: "#e2e8f0",
    paddingTop: 5,
    fontSize: 7,
    color: "#94a3b8",
  },
});

interface StockCountSheetPDFProps {
  products: Product[];
  companyName: string;
  branchName?: string;
}

export function StockCountSheetPDF({
  products,
  companyName,
  branchName,
}: StockCountSheetPDFProps) {
  const dateStr = format(new Date(), "dd/MM/yyyy HH:mm");
  const pageFont = pdfFontFamily("Helvetica");

  return (
    <Document>
      <Page size="A4" style={[styles.page, { fontFamily: pageFont }]}>
        {/* Header Section */}
        <View style={styles.header}>
          <Text style={styles.title}>Physical Stock Count Sheet</Text>
          <Text style={styles.subtitle}>
            Use this sheet to physically verify warehouse inventory levels.
          </Text>
          
          <View style={styles.metaGrid}>
            <Text style={styles.metaItem}>
              <Text style={styles.metaLabel}>Company: </Text>
              {companyName}
            </Text>
            {branchName && (
              <Text style={styles.metaItem}>
                <Text style={styles.metaLabel}>Branch/Warehouse: </Text>
                {branchName}
              </Text>
            )}
            <Text style={styles.metaItem}>
              <Text style={styles.metaLabel}>Date Generated: </Text>
              {dateStr}
            </Text>
            <Text style={styles.metaItem}>
              <Text style={styles.metaLabel}>Total Items: </Text>
              {products.length}
            </Text>
          </View>
        </View>

        {/* Count Sheet Table */}
        <View style={styles.table}>
          {/* Table Header */}
          <View style={[styles.tableRow, styles.tableHeader]}>
            <Text style={[styles.colNo, styles.headerText]}>#</Text>
            <Text style={[styles.colSku, styles.headerText]}>SKU</Text>
            <Text style={[styles.colName, styles.headerText]}>Product Name</Text>
            <Text style={[styles.colExpected, styles.headerText]}>Expected</Text>
            <Text style={[styles.colCount, styles.headerText]}>Physical Count</Text>
            <Text style={[styles.colNotes, styles.headerText]}>Notes</Text>
          </View>

          {/* Table Body */}
          {products.map((p, idx) => (
            <View key={p.id} style={styles.tableRow} wrap={false}>
              <Text style={[styles.colNo, styles.cellText]}>{idx + 1}</Text>
              <Text style={[styles.colSku, styles.cellText]}>{p.sku || "N/A"}</Text>
              <Text style={[styles.colName, styles.cellText]}>{p.name}</Text>
              <Text style={[styles.colExpected, styles.cellText]}>
                {Number(p.stockLevel || 0).toFixed(0)}
              </Text>
              <View style={styles.colCount}>
                <View style={styles.writeLine} />
              </View>
              <View style={styles.colNotes}>
                <View style={styles.writeLine} />
              </View>
            </View>
          ))}
        </View>

        {/* Signature Area */}
        <View style={styles.signatureSection} wrap={false}>
          <View style={styles.sigBlock}>
            <View style={styles.sigLine} />
            <Text style={styles.sigLabel}>Counted By (Name & Signature)</Text>
          </View>
          <View style={styles.sigBlock}>
            <View style={styles.sigLine} />
            <Text style={styles.sigLabel}>Verified By Manager (Name & Signature)</Text>
          </View>
        </View>

        {/* Footer */}
        <Text
          style={styles.footer}
          render={({ pageNumber, totalPages }) =>
            `Page ${pageNumber} of ${totalPages} | Generated by FiscalStack`
          }
          fixed
        />
      </Page>
    </Document>
  );
}
