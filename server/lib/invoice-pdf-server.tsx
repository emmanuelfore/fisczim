import React from "react";
import { Document, Page, Text, View, StyleSheet, Image, pdf } from "@react-pdf/renderer";
import { format } from "date-fns";

const styles = StyleSheet.create({
    page: {
        padding: 24,
        fontFamily: 'Helvetica',
        fontSize: 9,
        color: '#0f172a',
        backgroundColor: '#FFFFFF',
    },
    columns: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 12,
    },
    column: {
        width: '48%',
        flexDirection: 'column',
        borderWidth: 1,
        borderColor: '#cbd5e1',
        backgroundColor: '#ffffff',
        padding: 9,
    },
    sectionTitle: {
        fontSize: 9,
        fontWeight: 700,
        textTransform: 'uppercase',
        color: '#0f172a',
        borderBottomWidth: 1,
        borderBottomColor: '#cbd5e1',
        paddingBottom: 4,
        marginBottom: 6,
    },
    infoText: {
        fontSize: 9,
        lineHeight: 1.4,
        color: '#475569',
    },
    bold: {
        fontWeight: 700,
        color: '#1e293b',
    },
    fiscalBox: {
        backgroundColor: '#f8fafc',
        borderWidth: 1,
        borderColor: '#e5e7eb',
        borderRadius: 6,
        padding: 10,
        marginBottom: 16,
    },
    fiscalRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 4,
    },
    fiscalLabel: {
        color: '#64748b',
        width: '40%',
    },
    fiscalValue: {
        fontWeight: 700,
        color: '#1e293b',
        flex: 1,
    },
    table: {
        width: '100%',
        marginBottom: 14,
    },
    tableHeader: {
        flexDirection: 'row',
        backgroundColor: '#0f172a',
        borderRadius: 4,
        paddingVertical: 6,
        paddingHorizontal: 4,
        marginBottom: 3,
    },
    tableRow: {
        flexDirection: 'row',
        borderBottomWidth: 1,
        borderBottomColor: '#f1f5f9',
        paddingVertical: 5,
        paddingHorizontal: 4,
    },
    colCode: { width: '10%', color: '#64748b' },
    colDesc: { width: '40%' },
    colQty: { width: '8%', textAlign: 'center' },
    colPrice: { width: '12%', textAlign: 'right' },
    colVat: { width: '15%', textAlign: 'right', fontSize: 8, color: '#64748b' },
    colTotal: { width: '15%', textAlign: 'right', fontWeight: 700 },
    colExCode: { width: '8%', color: '#64748b' },
    colExDesc: { width: '33%' },
    colExQty: { width: '8%', textAlign: 'center' },
    colExPrice: { width: '10%', textAlign: 'right' },
    colExAmt: { width: '13%', textAlign: 'right' },
    colExVat: { width: '12%', textAlign: 'right', fontSize: 8 },
    colExTotal: { width: '16%', textAlign: 'right', fontWeight: 700 },
    headerText: {
        fontSize: 8,
        fontWeight: 700,
        color: '#ffffff',
        textTransform: 'none',
    },
    summarySection: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginTop: 10,
        paddingTop: 4,
    },
    taxTable: {
        width: '46%',
        borderWidth: 1,
        borderColor: '#e5e7eb',
        borderRadius: 6,
        padding: 8,
    },
    totalsBox: {
        width: '46%',
        borderWidth: 1,
        borderColor: '#e5e7eb',
        borderRadius: 6,
        padding: 8,
        backgroundColor: '#fbfdff',
    },
    totalRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 4,
    },
    grandTotal: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        borderTopWidth: 1.5,
        borderTopColor: '#0f172a',
        paddingTop: 7,
        marginTop: 5,
        fontSize: 12,
        fontWeight: 700,
    },
    footerSection: {
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        marginTop: 22,
        borderTopWidth: 1,
        borderTopColor: '#e2e8f0',
        paddingTop: 10,
    },
    footerLabel: {
        fontSize: 10,
        fontWeight: 700,
        textTransform: 'uppercase',
    },
    qrCode: {
        width: 80,
        height: 80,
    }
});

interface InvoicePDFProps {
    invoice: any;
    company: any;
    customer: any;
    qrCodeUrl?: string;
    taxTypes?: any[];
}

export const InvoicePDF = ({ invoice, company, customer, qrCodeUrl, taxTypes }: InvoicePDFProps) => {
    const fiscalProvider = (company?.fiscalProvider || (company?.country === "Lesotho" ? "LEKUKA" : "ZIMRA")) as "ZIMRA" | "LEKUKA";
    const isLesotho = fiscalProvider === "LEKUKA";
    const authorityName = isLesotho ? "RSL" : "ZIMRA";
    const authorityShortName = isLesotho ? "LEKUKA" : "ZIMRA";
    const authorityFullName = isLesotho ? "Revenue Services Lesotho" : "Zimbabwe Revenue Authority";

    const accentColor = company?.primaryColor || '#2563eb';
    const borderColor = '#e5e7eb';
    const sectionBg = '#f8fafc';

    const verificationCodeRaw = invoice.qrCodeData ? invoice.qrCodeData.slice(-16) : "";
    const verificationCode = verificationCodeRaw.match(/.{1,4}/g)?.join("-") || "";

    const isExclusive = !invoice.taxInclusive;

    const documentTitle = invoice.fiscalCode
        ? (company?.vatRegistered ? "FISCAL TAX INVOICE" : "FISCAL INVOICE")
        : (invoice.status === 'draft' ? "DRAFT INVOICE" : (company?.vatRegistered ? "PROFORMA INVOICE" : "TAX INVOICE"));

    return (
        <Document>
            <Page size="A4" style={styles.page}>
                {/* Title */}
                <View style={{ alignItems: 'center', marginBottom: 12 }}>
                    <Text style={{ textAlign: 'center', fontSize: 16, fontWeight: 'bold', textTransform: 'uppercase', color: '#0f172a' }}>
                        {documentTitle}
                    </Text>
                    <View style={{ width: 60, height: 2, backgroundColor: accentColor, marginTop: 5, marginBottom: 3 }} />
                    <Text style={{ fontSize: 8, color: '#64748b' }}>
                        {invoice.fiscalCode ? `${authorityShortName} fiscal document` : "Customer document"}
                    </Text>
                </View>

                {/* Header (Seller & Buyer) */}
                <View style={styles.columns}>
                    <View style={[styles.column, { borderColor, backgroundColor: sectionBg, borderRadius: 6 }]}>
                        <View style={{ marginBottom: 10 }}>
                            <View>
                                <Text style={[styles.sectionTitle, { color: accentColor }]}>SELLER</Text>
                                <Text style={[styles.bold, { fontSize: 10, marginBottom: 2 }]}>{company?.tradingName || company?.name}</Text>
                            </View>
                        </View>
                        <View style={styles.infoText}>
                            <Text>{company?.address || ""}</Text>
                            <Text>{company?.city || ""}, {company?.country || ""}</Text>
                            <Text style={{ marginTop: 4 }}>TIN: {company?.tin || "N/A"}</Text>
                            <Text>VAT No: {company?.vatNumber || "N/A"}</Text>
                            {company?.phone ? <Text>Phone: {company?.phone}</Text> : null}
                            {company?.email ? <Text>Email: {company?.email}</Text> : null}
                        </View>
                    </View>
                    <View style={[styles.column, { borderColor, backgroundColor: sectionBg, borderRadius: 6 }]}>
                        <Text style={[styles.sectionTitle, { color: accentColor }]}>BUYER</Text>
                        <View style={styles.infoText}>
                            {customer ? (
                                <>
                                    <Text style={[styles.bold, { fontSize: 10, marginBottom: 2 }]}>{customer.name}</Text>
                                    <Text>{customer.address || "No Address"}</Text>
                                    <Text>{customer.city || ""} {customer.country || ""}</Text>
                                    <Text style={{ marginTop: 4 }}>TIN: {customer.tin || "N/A"}</Text>
                                    <Text>VAT No: {customer.vatNumber || "N/A"}</Text>
                                    {customer.email ? <Text>Email: {customer.email}</Text> : null}
                                    {customer.phone ? <Text>Phone: {customer.phone}</Text> : null}
                                </>
                            ) : (
                                <Text style={{ fontStyle: 'italic', color: '#94a3b8' }}>Walk-in Customer</Text>
                            )}
                        </View>
                    </View>
                </View>

                {/* Fiscal Info Grid */}
                <View style={[styles.fiscalBox, { borderLeftWidth: 3, borderLeftColor: accentColor, borderColor, backgroundColor: sectionBg, borderRadius: 6 }]}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                        <View style={{ width: '48%' }}>
                            <View style={styles.fiscalRow}>
                                <Text style={styles.fiscalLabel}>Invoice No:</Text>
                                <Text style={styles.fiscalValue}>
                                    {invoice.receiptCounter !== null && invoice.receiptCounter !== undefined &&
                                        invoice.receiptGlobalNo !== null && invoice.receiptGlobalNo !== undefined
                                        ? `${invoice.receiptCounter}/${invoice.receiptGlobalNo}`
                                        : invoice.invoiceNumber}
                                </Text>
                            </View>
                            <View style={styles.fiscalRow}>
                                <Text style={styles.fiscalLabel}>Customer Reference No:</Text>
                                <Text style={styles.fiscalValue}>{invoice.invoiceNumber}</Text>
                            </View>
                            <View style={styles.fiscalRow}>
                                <Text style={styles.fiscalLabel}>Fiscal Day No:</Text>
                                <Text style={styles.fiscalValue}>{invoice.fiscalDayNo || "N/A"}</Text>
                            </View>
                        </View>
                        <View style={{ width: '48%' }}>
                            <View style={styles.fiscalRow}>
                                <Text style={styles.fiscalLabel}>Date:</Text>
                                <Text style={styles.fiscalValue}>{format(new Date(invoice.issueDate), "dd/MM/yyyy")}</Text>
                            </View>
                            <View style={styles.fiscalRow}>
                                <Text style={styles.fiscalLabel}>Fiscal Device ID:</Text>
                                <Text style={styles.fiscalValue}>{company?.fdmsDeviceId || "N/A"}</Text>
                            </View>
                            <View style={styles.fiscalRow}>
                                <Text style={styles.fiscalLabel}>Device Serial No:</Text>
                                <Text style={styles.fiscalValue}>{company?.fdmsDeviceSerialNo || "N/A"}</Text>
                            </View>
                        </View>
                    </View>
                </View>

                {/* Fiscal Code Display */}
                {invoice.fiscalCode && (
                    <View style={{ marginBottom: 12, padding: 8, backgroundColor: '#ecfdf3', borderWidth: 1, borderColor: '#10b981', borderRadius: 6 }}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                            <View>
                                <Text style={{ fontSize: 8, color: '#047857', textTransform: 'uppercase', marginBottom: 2 }}>Fiscal Code</Text>
                                <Text style={{ fontSize: 12, fontWeight: 700, color: '#065f46' }}>{invoice.fiscalCode}</Text>
                            </View>
                            {qrCodeUrl && (
                                <Image src={qrCodeUrl} style={{ width: 60, height: 60 }} />
                            )}
                        </View>
                    </View>
                )}

                {/* Items Table */}
                <View style={styles.table}>
                    <View style={[styles.tableHeader, { backgroundColor: accentColor, borderRadius: 6 }]}>
                        {isExclusive ? (
                                <>
                                    <Text style={[styles.colExCode, styles.headerText]}>Code</Text>
                                    <Text style={[styles.colExDesc, styles.headerText]}>Description</Text>
                                    <Text style={[styles.colExQty, styles.headerText]}>Qty</Text>
                                    <Text style={[styles.colExPrice, styles.headerText]}>Price</Text>
                                    <Text style={[styles.colExAmt, styles.headerText]}>Amount{"\n"}(excl.)</Text>
                                    <Text style={[styles.colExVat, styles.headerText]}>VAT</Text>
                                    <Text style={[styles.colExTotal, styles.headerText]}>Total{"\n"}(incl.)</Text>
                                </>
                            ) : (
                                <>
                                    <Text style={[styles.colCode, styles.headerText]}>Code</Text>
                                    <Text style={[styles.colDesc, styles.headerText]}>Description</Text>
                                    <Text style={[styles.colQty, styles.headerText]}>Qty</Text>
                                    <Text style={[styles.colPrice, styles.headerText]}>Price</Text>
                                    <Text style={[styles.colVat, styles.headerText]}>VAT</Text>
                                    <Text style={[styles.colTotal, styles.headerText]}>Total{"\n"}(incl.)</Text>
                                </>
                            )}
                    </View>

                    {invoice.items?.map((item: any, i: number) => {
                        const lineTotal = Number(item.lineTotal);
                        const qty = Number(item.quantity);
                        const unitPrice = Number(item.unitPrice);
                        const effectiveTaxRate = company?.vatRegistered ? Number(item.taxRate || 15.5) : 0;
                        const taxRate = effectiveTaxRate;

                        let displayPrice = unitPrice;
                        let vatAmt = 0;
                        let displayTotalIncl = 0;
                        let displayAmtExcl = 0;

                        if (isExclusive) {
                            displayAmtExcl = unitPrice * qty;
                            vatAmt = displayAmtExcl * (taxRate / 100);
                            displayTotalIncl = displayAmtExcl + vatAmt;
                        } else {
                            displayTotalIncl = unitPrice * qty;
                            vatAmt = displayTotalIncl - (displayTotalIncl / (1 + taxRate / 100));
                        }

                        const matchingTax = taxTypes?.find((t: any) => t.id == item.taxTypeId);
                        const isExempt = matchingTax?.zimraTaxId == 1 || matchingTax?.zimraTaxId == "1" || matchingTax?.name?.toLowerCase().includes('exempt');
                        const isZeroRated = matchingTax?.zimraTaxId == 2 || matchingTax?.zimraTaxId == "2" || matchingTax?.name?.toLowerCase().includes('zero rated') || (!isExempt && taxRate === 0);

                        return (
                            <View key={i} style={[styles.tableRow, { borderBottomColor: borderColor }]}>
                                {isExclusive ? (
                                        <>
                                            <Text style={styles.colExCode}>{item.product?.hsCode || "0000"}</Text>
                                            <View style={styles.colExDesc}>
                                                <Text>{item.description}</Text>
                                            </View>
                                            <Text style={styles.colExQty}>{qty}</Text>
                                            <Text style={styles.colExPrice}>{displayPrice.toFixed(2)}</Text>
                                            <Text style={styles.colExAmt}>{displayAmtExcl.toFixed(2)}</Text>
                                            <Text style={styles.colExVat}>{isExempt ? "-" : (isZeroRated || vatAmt === 0 ? "0.00" : vatAmt.toFixed(2))}</Text>
                                            <Text style={styles.colExTotal}>{displayTotalIncl.toFixed(2)}</Text>
                                        </>
                                    ) : (
                                        <>
                                            <Text style={styles.colCode}>{item.product?.hsCode || "0000"}</Text>
                                            <View style={styles.colDesc}>
                                                <Text>{item.description}</Text>
                                            </View>
                                            <Text style={styles.colQty}>{qty}</Text>
                                            <Text style={styles.colPrice}>{displayPrice.toFixed(2)}</Text>
                                            <Text style={styles.colVat}>{isExempt ? "-" : (isZeroRated || vatAmt === 0 ? "0.00" : vatAmt.toFixed(2))}</Text>
                                            <Text style={styles.colTotal}>{displayTotalIncl.toFixed(2)}</Text>
                                        </>
                                    )}
                            </View>
                        );
                    })}
                </View>

                {/* Summary & Totals */}
                <View style={styles.summarySection}>
                    {/* Tax Analysis */}
                    <View style={[styles.taxTable, { borderColor, borderRadius: 6 }]}>
                        <Text style={[styles.sectionTitle, { marginBottom: 6, color: accentColor }]}>Tax Analysis</Text>
                        <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderColor: '#e2e8f0', paddingBottom: 2 }}>
                            <Text style={{ fontSize: 8, width: '25%', color: '#64748b' }}>VAT %</Text>
                            <Text style={{ fontSize: 8, width: '25%', textAlign: 'right', color: '#64748b' }}>Net.Amt</Text>
                            <Text style={{ fontSize: 8, width: '25%', textAlign: 'right', color: '#64748b' }}>VAT</Text>
                            <Text style={{ fontSize: 8, width: '25%', textAlign: 'right', color: '#64748b' }}>Amount</Text>
                        </View>
                        <View style={{ flexDirection: 'row', paddingTop: 2 }}>
                            <Text style={{ fontSize: 8, width: '25%' }}>{company?.vatRegistered ? "15.5%" : "0%"}</Text>
                            <Text style={{ fontSize: 8, width: '25%', textAlign: 'right' }}>{Number(invoice.subtotal || 0).toFixed(2)}</Text>
                            <Text style={{ fontSize: 8, width: '25%', textAlign: 'right' }}>{Number(invoice.taxAmount || 0).toFixed(2)}</Text>
                            <Text style={{ fontSize: 8, width: '25%', textAlign: 'right', fontWeight: 700 }}>{Number(invoice.total || 0).toFixed(2)}</Text>
                        </View>
                    </View>

                    {/* Totals Box */}
                    <View style={[styles.totalsBox, { borderColor, borderRadius: 6 }]}>
                        <Text style={[styles.sectionTitle, { marginBottom: 6, color: accentColor }]}>Totals</Text>
                        <View style={styles.totalRow}>
                            <Text style={{ fontSize: 9, color: '#64748b' }}>Subtotal</Text>
                            <Text style={{ fontSize: 9, fontWeight: 600 }}>{invoice.currency || "USD"} {Number(invoice.subtotal || 0).toFixed(2)}</Text>
                        </View>
                        <View style={styles.totalRow}>
                            <Text style={{ fontSize: 9, color: '#64748b' }}>VAT</Text>
                            <Text style={{ fontSize: 9, fontWeight: 600 }}>{invoice.currency || "USD"} {Number(invoice.taxAmount || 0).toFixed(2)}</Text>
                        </View>
                        <View style={styles.grandTotal}>
                            <Text style={{ fontSize: 10, color: '#64748b' }}>Grand Total</Text>
                            <Text style={{ fontSize: 12 }}>{invoice.currency || "USD"} {Number(invoice.total || 0).toFixed(2)}</Text>
                        </View>
                    </View>
                </View>

                {/* Footer */}
                <View style={styles.footerSection}>
                    {qrCodeUrl && (
                        <Image src={qrCodeUrl} style={styles.qrCode} />
                    )}
                    <Text style={styles.footerLabel}>Verification Code</Text>
                    <Text style={{ fontSize: 10, fontWeight: 700, color: '#059669', letterSpacing: 2, marginTop: 2 }}>
                        {verificationCode}
                    </Text>
                    <Text style={{ fontSize: 8, color: '#64748b', marginTop: 4 }}>
                        Verify at {company?.qrUrl || "https://receipt.zimra.org"}
                    </Text>
                    <Text style={{ fontSize: 7, color: '#94a3b8', marginTop: 8 }}>
                        Generated by FiscalStack - {authorityFullName} Compliant
                    </Text>
                </View>
            </Page>
        </Document>
    );
};

export async function renderInvoicePdf(invoice: any, company: any, customer: any, qrCodeUrl?: string, taxTypes?: any[]): Promise<Buffer> {
    const pdfDoc = (
        <InvoicePDF
            invoice={invoice}
            company={company}
            customer={customer}
            qrCodeUrl={qrCodeUrl}
            taxTypes={taxTypes}
        />
    );

    const blob = await pdf(pdfDoc).toBlob();
    const arrayBuffer = await blob.arrayBuffer();
    return Buffer.from(arrayBuffer);
}
