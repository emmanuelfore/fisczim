
import { Document, Page, Text, View, StyleSheet, Image, Font } from "@react-pdf/renderer";
import { format } from "date-fns";
import { getInvoiceTemplate, getStoredInvoiceTemplateSettings, type InvoiceTemplateDesignerSettings } from "@/lib/invoice-templates";
import { normalizePartnershipSettings, type PartnerSnapshot } from "@shared/partnership";
import { pdfFontFamily } from "@/lib/pdf-fonts";

const styles = StyleSheet.create({
    page: {
        padding: 24,
        fontFamily: 'Helvetica',
        fontSize: 9,
        color: '#0f172a',
        backgroundColor: '#FFFFFF',
    },
    verificationBlock: {
        textAlign: 'center',
        paddingBottom: 10,
        borderBottomWidth: 1,
        borderBottomColor: '#e2e8f0',
        marginBottom: 15,
    },
    verificationLabel: {
        fontSize: 8,
        textTransform: 'uppercase',
        color: '#94a3b8',
        letterSpacing: 1,
        marginBottom: 2,
    },
    verificationCode: {
        fontSize: 14,
        fontWeight: 700,
        color: '#059669', // Emerald 600
        letterSpacing: 2,
        fontFamily: 'Courier',
    },
    verificationUrl: {
        fontSize: 8,
        color: '#64748b',
        marginTop: 2,
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
    // Column widths for Inclusive (Total 100%)
    colCode: { width: '10%', color: '#64748b' },
    colDesc: { width: '40%' },
    colQty: { width: '8%', textAlign: 'center' },
    colPrice: { width: '12%', textAlign: 'right' },
    colVat: { width: '15%', textAlign: 'right', fontSize: 8, color: '#64748b' },
    colTotal: { width: '15%', textAlign: 'right', fontWeight: 700 },

    // Column widths for Exclusive (Total 100%)
    colExCode: { width: '8%', color: '#64748b' },
    colExDesc: { width: '33%' },
    colExQty: { width: '8%', textAlign: 'center' },
    colExPrice: { width: '10%', textAlign: 'right' },
    colExAmt: { width: '13%', textAlign: 'right' }, // Amount (excl tax)
    colExVat: { width: '12%', textAlign: 'right', fontSize: 8 },
    colExTotal: { width: '16%', textAlign: 'right', fontWeight: 700 },

    headerText: {
        fontSize: 8,
        fontWeight: 700,
        color: '#ffffff',
        textTransform: 'none', // Spec uses Mixed Case often (Title Case)
    },
    // ... rest of styles
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
    },
    paidLabel: {
        position: 'absolute',
        top: 250,
        left: 150,
        fontSize: 100,
        color: 'rgba(5, 150, 105, 0.15)', // Emerald 600 with low opacity
        fontWeight: 700,
        transform: 'rotate(-30deg)',
        textTransform: 'uppercase',
    }
});

interface InvoicePDFProps {
    invoice: any & { expiryDate?: string | Date | null };
    company: any;
    customer: any;
    qrCodeUrl?: string;
    taxTypes?: any[];
    templateSettings?: InvoiceTemplateDesignerSettings;
}

export const InvoicePDF = ({ invoice, company, customer, qrCodeUrl, taxTypes, templateSettings }: InvoicePDFProps) => {

    const pageFont = pdfFontFamily('Helvetica');
    const designerSettings = templateSettings || getStoredInvoiceTemplateSettings(company?.id || invoice?.companyId);
    const template = getInvoiceTemplate(designerSettings.defaultTemplateId || company?.invoiceTemplate || invoice.invoiceTemplate);
    const accentColor = designerSettings.accentColor || company?.primaryColor || template.accent || '#2563eb';
    const compact = designerSettings.density === 'compact' || template.density === 'compact';
    const sectionBg = template.surface || '#f8fafc';
    const borderColor = template.border || '#e5e7eb';
    const showHeaderQr = qrCodeUrl && designerSettings.qrPlacement !== "footer";
    const showFooterQr = qrCodeUrl && designerSettings.qrPlacement === "footer";

    // Extract Verification Code logic same as frontend
    const verificationCodeRaw = invoice.qrCodeData ? invoice.qrCodeData.slice(-16) : "";
    const verificationCode = verificationCodeRaw.match(/.{1,4}/g)?.join("-") || "";

    const isExclusive = !invoice.taxInclusive;
    const hasDesignerPartnership = designerSettings.showPartnership;
    const partner = (invoice.partnerSnapshot || (hasDesignerPartnership ? {
        id: 1,
        name: "Acme Partner Pvt Ltd",
        tradingName: "Acme Partner",
        logoUrl: "https://placehold.co/200x100/png?text=Partner+Logo",
        tin: "9876543210",
        vatNumber: "VAT111222",
        displayLabel: "In association with",
        revenueSharePercent: 30,
    } : null)) as PartnerSnapshot | null;

    const partnershipSettings = normalizePartnershipSettings(company?.partnershipSettings);
    const showDualLogo = !!partner?.logoUrl && (hasDesignerPartnership || partnershipSettings.dualLogoEnabled !== false);
    const partnerLogoPlacement = designerSettings.partnerLogoPlacement || partnershipSettings.dualLogoLayout || "side_by_side";

    const documentTitle = invoice.status === 'quote'
        ? "OFFICIAL QUOTATION"
        : (invoice.transactionType === 'CreditNote'
            ? "CREDIT NOTE"
            : (invoice.transactionType === 'DebitNote'
                ? "DEBIT NOTE"
                : (invoice.fiscalCode
                    ? (company?.vatRegistered ? "FISCAL TAX INVOICE" : "FISCAL INVOICE")
                    : (invoice.status === 'draft' ? "DRAFT INVOICE" : (company?.vatRegistered ? "PROFORMA INVOICE" : "TAX INVOICE")))));

    return (
        <Document>
            <Page size="A4" style={[styles.page, { fontFamily: pageFont, backgroundColor: template.page, color: template.text, padding: compact ? 18 : 24 }]}>
                {/* 0. Header: Logo (Left) - Verification (Center) - QR (Right) */}
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: compact ? 7 : 10, padding: template.headerMode === 'band' ? 10 : 0, paddingBottom: template.headerMode === 'band' ? 10 : 10, borderBottomWidth: 1, borderBottomColor: borderColor, backgroundColor: template.headerMode === 'band' ? template.secondary : 'transparent' }}>
                    {/* Left: Logo(s) */}
                    <View style={{ width: '28%', flexDirection: showDualLogo && partnerLogoPlacement === 'stacked' ? 'column' : 'row', alignItems: 'center', gap: 4 }}>
                        {company?.logoUrl ? (
                            <Image src={company.logoUrl} style={{ width: showDualLogo && partnerLogoPlacement !== 'right_header' ? 72 : 108, height: 50, objectFit: 'contain' }} />
                        ) : (
                            hasDesignerPartnership ? (
                                <Image src="https://placehold.co/200x100/png?text=Company+Logo" style={{ width: showDualLogo && partnerLogoPlacement !== 'right_header' ? 72 : 108, height: 50, objectFit: 'contain' }} />
                            ) : null
                        )}
                        {showDualLogo && partner?.logoUrl && partnerLogoPlacement !== 'right_header' ? (
                            <Image src={partner.logoUrl} style={{ width: partnerLogoPlacement === 'primary_secondary' ? 56 : 72, height: 44, objectFit: 'contain' }} />
                        ) : null}
                    </View>

                    {/* Center: Verification Text */}
                    <View style={{ width: '44%', alignItems: 'center' }}>
                        {showHeaderQr && designerSettings.qrPlacement === "header-center" ? (
                            <Image style={{ width: 62, height: 62, marginBottom: 3 }} src={qrCodeUrl} />
                        ) : null}
                        {invoice.fiscalCode && invoice.status !== 'quote' ? (
                            <>
                                <Text style={{ fontSize: 9, fontWeight: 700, color: '#1e293b', marginBottom: 1 }}>
                                    Verification Code: {verificationCode}
                                </Text>
                                <Text style={{ fontSize: 7, color: 'blue', textDecoration: 'none' }}>
                                    Verify at {company?.qrUrl || "https://receipt.zimra.org"}
                                </Text>
                            </>
                        ) : null}
                    </View>

                    {/* Right: QR Code / Partner Logo */}
                    <View style={{ width: '28%', alignItems: 'flex-end', gap: 4 }}>
                        {showDualLogo && partner?.logoUrl && partnerLogoPlacement === 'right_header' ? (
                            <Image src={partner.logoUrl} style={{ width: 72, height: 44, objectFit: 'contain', marginBottom: 4 }} />
                        ) : null}
                        {showHeaderQr && designerSettings.qrPlacement === "header-right" ? (
                            <Image style={{ width: 68, height: 68 }} src={qrCodeUrl} />
                        ) : invoice.status === 'quote' ? (
                            <View style={{ alignItems: 'flex-end' }}>
                                <Text style={{ fontSize: 8, color: '#64748b', textTransform: 'uppercase', marginBottom: 2 }}>Quote No.</Text>
                                <Text style={{ fontSize: 11, fontWeight: 700, color: '#1e293b', marginBottom: 4 }}>{invoice.invoiceNumber}</Text>
                                <Text style={{ fontSize: 8, color: '#64748b' }}>Date: {format(new Date(invoice.issueDate), "dd/MM/yyyy")}</Text>
                                {invoice.expiryDate ? (
                                    <Text style={{ fontSize: 8, color: '#64748b' }}>Valid Until: {format(new Date(invoice.expiryDate), "dd/MM/yyyy")}</Text>
                                ) : null}
                            </View>
                        ) : null}
                    </View>
                </View>

                {/* Title */}
                <View style={{ alignItems: 'center', marginBottom: 12 }}>
                    <Text style={{ textAlign: 'center', fontSize: compact ? 14 : 16, fontWeight: 'bold', textTransform: 'uppercase', color: template.text }}>
                        {documentTitle}
                    </Text>
                    <View style={{ width: 60, height: 2, backgroundColor: accentColor, marginTop: 5, marginBottom: 3 }} />
                    <Text style={{ fontSize: 8, color: '#64748b' }}>
                        {invoice.status === 'quote' ? "Prepared quotation" : (invoice.fiscalCode ? "ZIMRA fiscal document" : "Customer document")}
                    </Text>
                </View>
                
                {invoice.status === 'paid' && (
                    <Text style={styles.paidLabel}>PAID</Text>
                )}


                {/* 2. Header (Seller & Buyer) */}
                <View style={styles.columns}>
                    <View style={[styles.column, { borderColor, backgroundColor: sectionBg, borderRadius: template.radius }]}>
                        <View style={{ marginBottom: 10 }}>
                            {/* Logo removed (moved to header) */}
                            <View>
                                <Text style={[styles.sectionTitle, { color: accentColor }]}>SELLER</Text>
                                <Text style={[styles.bold, { fontSize: 10, marginBottom: 2 }]}>{company?.tradingName || company?.name}</Text>
                            </View>
                        </View>
                        <View style={styles.infoText}>
                            <Text>{company?.address}</Text>
                            <Text>{company?.city}, {company?.country}</Text>
                            <Text style={{ marginTop: 4 }}>TIN: {company?.tin}</Text>
                            <Text>VAT No: {company?.vatNumber || "N/A"}</Text>
                            {company?.phone ? <Text>Phone: {company?.phone}</Text> : null}
                            {company?.email ? <Text>Email: {company?.email}</Text> : null}
                        </View>
                    </View>
                    <View style={[styles.column, { borderColor, backgroundColor: sectionBg, borderRadius: template.radius }]}>
                        <Text style={[styles.sectionTitle, { color: accentColor }]}>BUYER</Text>
                        <View style={styles.infoText}>
                            {customer ? (
                                <>
                                    <Text style={[styles.bold, { fontSize: 10, marginBottom: 2 }]}>{customer.name}</Text>
                                    <Text>{customer.address || "No Address"}</Text>
                                    <Text>{customer.city} {customer.country}</Text>
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

                {/* 3. Fiscal Info Grid */}
                <View style={[styles.fiscalBox, { borderLeftWidth: 3, borderLeftColor: accentColor, borderColor, backgroundColor: sectionBg, borderRadius: template.radius }]}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                        <View style={{ width: '48%' }}>
                            <View style={styles.fiscalRow}>
                                <Text style={styles.fiscalLabel}>{invoice.status === 'quote' ? "Quote No:" : "Invoice No:"}</Text>
                                <Text style={styles.fiscalValue}>
                                    {invoice.status !== 'quote' && invoice.receiptCounter !== null && invoice.receiptCounter !== undefined &&
                                        invoice.receiptGlobalNo !== null && invoice.receiptGlobalNo !== undefined
                                        ? `${invoice.receiptCounter}/${invoice.receiptGlobalNo}`
                                        : invoice.invoiceNumber}
                                </Text>
                            </View>
                            <View style={styles.fiscalRow}>
                                <Text style={styles.fiscalLabel}>{invoice.status === 'quote' ? "Reference No:" : "Customer Reference No:"}</Text>
                                <Text style={styles.fiscalValue}>{invoice.invoiceNumber}</Text>
                            </View>
                            {invoice.status !== 'quote' && (
                                <View style={styles.fiscalRow}>
                                    <Text style={styles.fiscalLabel}>Fiscal Day No:</Text>
                                    <Text style={styles.fiscalValue}>{invoice.fiscalDayNo || "N/A"}</Text>
                                </View>
                            )}
                            {invoice.poNumber ? (
                                <View style={styles.fiscalRow}>
                                    <Text style={styles.fiscalLabel}>PO Number:</Text>
                                    <Text style={styles.fiscalValue}>{invoice.poNumber}</Text>
                                </View>
                            ) : null}
                        </View>
                        <View style={{ width: '48%' }}>
                            <View style={styles.fiscalRow}>
                                <Text style={styles.fiscalLabel}>Date:</Text>
                                <Text style={styles.fiscalValue}>{format(new Date(invoice.issueDate), "dd/MM/yyyy")}</Text>
                            </View>
                            {invoice.status === 'quote' && invoice.expiryDate && (
                                <View style={styles.fiscalRow}>
                                    <Text style={styles.fiscalLabel}>Valid Until:</Text>
                                    <Text style={styles.fiscalValue}>{format(new Date(invoice.expiryDate), "dd/MM/yyyy")}</Text>
                                </View>
                            )}
                            {invoice.status !== 'quote' && (
                                <>
                                    <View style={styles.fiscalRow}>
                                        <Text style={styles.fiscalLabel}>Fiscal Device ID:</Text>
                                        <Text style={styles.fiscalValue}>{company?.fdmsDeviceId || "N/A"}</Text>
                                    </View>
                                    <View style={styles.fiscalRow}>
                                        <Text style={styles.fiscalLabel}>Device Serial No:</Text>
                                        <Text style={styles.fiscalValue}>{company?.fdmsDeviceSerialNo || "N/A"}</Text>
                                    </View>
                                </>
                            )}
                        </View>
                    </View>
                </View>

                {/* 3.1 Credit/Debit Note Reference Section - ZIMRA [24-28] */}
                {(invoice.transactionType === 'CreditNote' || invoice.transactionType === 'DebitNote') && Boolean(invoice.relatedInvoiceId) ? (
                    <View style={{ marginTop: 6, padding: 5, borderTopWidth: 1, borderTopColor: '#e2e8f0', borderBottomWidth: 1, borderBottomColor: '#e2e8f0', backgroundColor: '#f8fafc' }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 3 }}>
                            <Text style={{ fontSize: 7, fontWeight: 700, color: '#475569', textTransform: 'uppercase', marginRight: 8 }}>
                                {invoice.transactionType === 'CreditNote' ? "CREDITED INVOICE" : "DEBITED INVOICE"}
                            </Text>
                            <Text style={{ fontSize: 7, color: '#64748b' }}>|</Text>
                            <Text style={{ fontSize: 7, color: '#64748b', marginLeft: 8 }}>Original Fiscal Reference</Text>
                        </View>
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                            <Text style={{ fontSize: 7 }}>
                                <Text style={{ color: '#64748b' }}>Inv No: </Text>
                                <Text style={{ fontWeight: 700 }}>{invoice.relatedReceiptGlobalNo || "N/A"}</Text>
                            </Text>
                            <Text style={{ fontSize: 7 }}>
                                <Text style={{ color: '#64748b' }}>Date: </Text>
                                <Text style={{ fontWeight: 700 }}>{invoice.relatedInvoiceDate ? format(new Date(invoice.relatedInvoiceDate), "dd/MM/yyyy HH:mm") : "N/A"}</Text>
                            </Text>
                            <Text style={{ fontSize: 7 }}>
                                <Text style={{ color: '#64748b' }}>Ref: </Text>
                                <Text style={{ fontWeight: 700 }}>{invoice.relatedInvoiceNumber || "N/A"}</Text>
                            </Text>
                            <Text style={{ fontSize: 7 }}>
                                <Text style={{ color: '#64748b' }}>ID: </Text>
                                <Text style={{ fontWeight: 700 }}>{company?.fdmsDeviceId || "N/A"}</Text>
                            </Text>
                            <Text style={{ fontSize: 7 }}>
                                <Text style={{ color: '#64748b' }}>Serial: </Text>
                                <Text style={{ fontWeight: 700 }}>{company?.fdmsDeviceSerialNo || "N/A"}</Text>
                                {invoice.notes && (
                                    <View style={{ marginTop: 3 }}>
                                        <Text style={{ fontSize: 8, fontStyle: 'italic', color: '#64748b' }}>
                                            Reason: {invoice.notes}
                                        </Text>
                                    </View>
                                )}
                            </Text>
                        </View>
                    </View>
                ) : null}

                {/* 4. Items Table */}
                <View style={styles.table}>
                    <View style={[styles.tableHeader, { backgroundColor: accentColor, borderRadius: template.radius }]}>
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
                        const lineTotal = Number(item.lineTotal); // This is usually Inclusive or Exclusive based on storage, but let's recalculate to be safe/consistent
                        const qty = Number(item.quantity);
                        const unitPrice = Number(item.unitPrice);
                        // If company is not VAT registered, effective tax rate is 0
                        const effectiveTaxRate = company?.vatRegistered ? Number(item.taxRate || 15.5) : 0;
                        const taxRate = effectiveTaxRate;

                        let displayPrice = unitPrice;
                        let vatAmt = 0;
                        let displayTotalIncl = 0;
                        let displayAmtExcl = 0;

                        if (isExclusive) {
                            // Exclusive Logic: Price is Excl.
                            // Amount (Excl) = Price * Qty
                            // VAT = Amount * Rate
                            // Total = Amount + VAT
                            displayAmtExcl = unitPrice * qty;
                            vatAmt = displayAmtExcl * (taxRate / 100);
                            displayTotalIncl = displayAmtExcl + vatAmt;
                        } else {
                            // Inclusive Logic: Price is Incl.
                            // Total (Incl) = Price * Qty
                            // VAT = Total - (Total / 1.155)
                            displayTotalIncl = unitPrice * qty; // item.lineTotal should match this
                            vatAmt = displayTotalIncl - (displayTotalIncl / (1 + taxRate / 100));
                        }

                        // ZIMRA Spec: "Price" column. Is it Unit Price? Yes usually.
                        const matchingTax = taxTypes?.find(t => t.id == item.taxTypeId);

                        // Strict check for Exempt vs Zero Rated
                        const isExempt = matchingTax?.zimraTaxId == 1 || matchingTax?.zimraTaxId == "1" || matchingTax?.name?.toLowerCase().includes('exempt');
                        const isZeroRated = matchingTax?.zimraTaxId == 2 || matchingTax?.zimraTaxId == "2" || matchingTax?.name?.toLowerCase().includes('zero rated') || (!isExempt && taxRate === 0);

                        return (
                            <View key={i} style={[styles.tableRow, { borderBottomColor: borderColor }, i % 2 === 1 ? { backgroundColor: sectionBg } : {}]}>
                                {isExclusive ? (
                                        <>
                                            <Text style={styles.colExCode}>{item.product?.hsCode || "0000"}</Text>
                                            <View style={styles.colExDesc}>
                                                <Text>{item.description}</Text>
                                                {item.serialNumber && (
                                                    <Text style={{ fontSize: 7, color: accentColor, fontWeight: 700, marginTop: 1 }}>
                                                        S/N: {item.serialNumber}
                                                    </Text>
                                                )}
                                                {item.notes && (
                                                    <Text style={{ fontSize: 7, color: '#64748b', marginTop: 1, fontStyle: 'italic' }}>
                                                        Note: {item.notes}
                                                    </Text>
                                                )}
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
                                                {item.serialNumber && (
                                                    <Text style={{ fontSize: 7, color: accentColor, fontWeight: 700, marginTop: 1 }}>
                                                        S/N: {item.serialNumber}
                                                    </Text>
                                                )}
                                                {item.notes && (
                                                    <Text style={{ fontSize: 7, color: '#64748b', marginTop: 1, fontStyle: 'italic' }}>
                                                        Note: {item.notes}
                                                    </Text>
                                                )}
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

                {/* 5. Summary & Totals */}
                <View style={styles.summarySection}>
                    {/* Tax Analysis */}
                    <View style={[styles.taxTable, { borderColor, borderRadius: template.radius }]}>
                        <Text style={[styles.sectionTitle, { marginBottom: 6, color: accentColor }]}>Tax Analysis</Text>
                        <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderColor: '#e2e8f0', paddingBottom: 2 }}>
                                <Text style={{ fontSize: 8, width: '25%', color: '#64748b' }}>VAT %</Text>
                                <Text style={{ fontSize: 8, width: '25%', textAlign: 'right', color: '#64748b' }}>Net.Amt</Text>
                                <Text style={{ fontSize: 8, width: '25%', textAlign: 'right', color: '#64748b' }}>VAT</Text>
                                <Text style={{ fontSize: 8, width: '25%', textAlign: 'right', color: '#64748b' }}>Amount</Text>
                            </View>
                            {(() => {
                                // ... existing tax calculation ...
                                const taxSummary = invoice.items?.reduce((acc: any, item: any) => {
                                    const taxRate = company?.vatRegistered ? Number(item.taxRate || item.product?.taxRate || 0) : 0;
                                    const lineTotal = Number(item.lineTotal);
                                    let netAmount = 0;
                                    let taxAmount = 0;

                                    if (invoice.taxInclusive) {
                                        netAmount = lineTotal / (1 + taxRate / 100);
                                        taxAmount = lineTotal - netAmount;
                                    } else {
                                        const qty = Number(item.quantity);
                                        const unitPrice = Number(item.unitPrice);
                                        const lineExcl = qty * unitPrice; // Assuming exclusive price here for consistency if !taxInclusive
                                        taxAmount = lineExcl * (taxRate / 100);
                                        netAmount = lineExcl;
                                    }

                                    const taxTypeId = item.taxTypeId || 0;
                                    const key = `${taxRate}-${taxTypeId}`;
                                    if (!acc[key]) {
                                        acc[key] = { taxRate, taxTypeId, netAmount: 0, taxAmount: 0, totalAmount: 0 };
                                    }
                                    acc[key].netAmount += netAmount;
                                    acc[key].taxAmount += taxAmount;
                                    acc[key].totalAmount += netAmount + taxAmount;
                                    return acc;
                                }, {} as Record<string, { taxRate: number; taxTypeId: number; netAmount: number; taxAmount: number; totalAmount: number }>) || {};

                                return Object.entries(taxSummary).map(([key, data]: [string, any]) => (
                                    <View key={key} style={{ flexDirection: 'row', paddingTop: 2 }}>
                                        <Text style={{ fontSize: 8, width: '25%' }}>{(() => {
                                            const mTax = taxTypes?.find(t => t.id == data.taxTypeId);
                                            const isExempt = mTax?.zimraTaxId == 1 || mTax?.zimraTaxId == "1" || mTax?.name?.toLowerCase().includes('exempt');

                                            if (isExempt) return mTax?.name || "Exempt";
                                            return `${Number(data.taxRate).toFixed(2)}%`;
                                        })()}</Text>
                                        <Text style={{ fontSize: 8, width: '25%', textAlign: 'right' }}>{data.netAmount.toFixed(2)}</Text>
                                        <Text style={{ fontSize: 8, width: '25%', textAlign: 'right' }}>{(() => {
                                            const mTax = taxTypes?.find(t => t.id == data.taxTypeId);
                                            const isExempt = mTax?.zimraTaxId == 1 || mTax?.zimraTaxId == "1" || mTax?.name?.toLowerCase().includes('exempt');
                                            const isZeroRated = mTax?.zimraTaxId == 2 || mTax?.zimraTaxId == "2" || mTax?.name?.toLowerCase().includes('zero rated') || (!isExempt && data.taxRate === 0);

                                            return isExempt ? "-" : (isZeroRated || data.taxAmount === 0 ? "0.00" : data.taxAmount.toFixed(2));
                                        })()}</Text>
                                        <Text style={{ fontSize: 8, width: '25%', textAlign: 'right' }}>{data.totalAmount.toFixed(2)}</Text>
                                    </View>
                                ));
                            })()}
                        </View>

                    {/* Totals */}
                    <View style={[styles.totalsBox, { borderColor, backgroundColor: sectionBg, borderRadius: template.radius }]}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2, paddingBottom: 2, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' }}>
                            <Text style={{ color: '#64748b' }}>Number of Items</Text>
                            <Text style={{ fontWeight: 700, color: '#1e293b' }}>
                                {invoice.items?.reduce((sum: number, item: any) => sum + Number(item.quantity), 0) || 0}
                            </Text>
                        </View>

                        <View style={styles.totalRow}>
                            <Text>Total (excl. tax)</Text>
                            <Text>{Number(invoice.subtotal).toFixed(2)}</Text>
                        </View>

                        <View style={styles.totalRow}>
                            <Text>Total VAT</Text>
                            <Text>{Number(invoice.taxAmount).toFixed(2)}</Text>
                        </View>

                        <View style={styles.totalRow}>
                            <Text>Invoice total, {invoice.currency}</Text>
                            <Text>{Number(invoice.total).toFixed(2)}</Text>
                        </View>

                        <View style={[styles.grandTotal, { borderTopColor: accentColor }]}>
                            <Text>Total amount {company?.vatRegistered ? "(incl. tax)" : ""}</Text>
                            <Text>{invoice.currency} {Number(invoice.total).toFixed(2)}</Text>
                        </View>
                    </View>
                </View>

                {/* Notes Section */}
                {invoice.notes ? (
                    <View style={{ marginTop: 18, padding: 10, borderWidth: 1, borderColor, borderRadius: template.radius, backgroundColor: sectionBg }}>
                        <Text style={{ fontSize: 8, fontWeight: 700, color: accentColor, marginBottom: 4, textTransform: 'uppercase' }}>
                            {invoice.transactionType === 'CreditNote' || invoice.transactionType === 'DebitNote' 
                                ? "REASON" 
                                : (invoice.status === 'quote' ? "Terms & Conditions" : "Notes")}
                        </Text>
                        <Text style={{ fontSize: 9, color: '#475569' }}>{invoice.notes}</Text>
                    </View>
                ) : null}

                {/* Banking Details Section (Compact) */}
                {(company?.bankName || company?.accountNumber) ? (
                    <View style={{ marginTop: 10, padding: 8, backgroundColor: sectionBg, borderWidth: 1, borderColor, borderRadius: template.radius }}>
                        <Text style={{ fontSize: 8, fontWeight: 700, color: accentColor, textAlign: 'center', marginBottom: 3 }}>PAYMENT DETAILS</Text>
                        <View style={{ flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap' }}>
                            {company.bankName ? (
                                <Text style={{ fontSize: 8, color: '#475569', marginRight: 8 }}>
                                    Bank: <Text style={{ fontWeight: 700, color: '#1e293b' }}>{company.bankName}</Text>
                                </Text>
                            ) : null}
                            {company.accountName ? (
                                <>
                                    <Text style={{ fontSize: 8, color: '#cbd5e1', marginRight: 8 }}>|</Text>
                                    <Text style={{ fontSize: 8, color: '#475569', marginRight: 8 }}>
                                        Acc Name: <Text style={{ fontWeight: 700, color: '#1e293b' }}>{company.accountName || company.name}</Text>
                                    </Text>
                                </>
                            ) : null}
                            {company.accountNumber ? (
                                <>
                                    <Text style={{ fontSize: 8, color: '#cbd5e1', marginRight: 8 }}>|</Text>
                                    <Text style={{ fontSize: 8, color: '#475569', marginRight: 8 }}>
                                        Acc No: <Text style={{ fontWeight: 700, color: '#1e293b', fontFamily: 'Courier' }}>{company.accountNumber}</Text>
                                    </Text>
                                </>
                            ) : null}
                            {company.branchCode ? (
                                <>
                                    <Text style={{ fontSize: 8, color: '#cbd5e1', marginRight: 8 }}>|</Text>
                                    <Text style={{ fontSize: 8, color: '#475569' }}>
                                        Branch: <Text style={{ fontWeight: 700, color: '#1e293b' }}>{company.branchCode}</Text>
                                    </Text>
                                </>
                            ) : null}
                        </View>
                        <Text style={{ fontSize: 6, color: '#94a3b8', textAlign: 'center', fontStyle: 'italic', marginTop: 2 }}>
                            Please use Invoice Number as payment reference
                        </Text>
                    </View>
                ) : null}

                {showFooterQr ? (
                    <View style={{ marginTop: 12, padding: 9, borderWidth: 1, borderColor, borderRadius: template.radius, backgroundColor: sectionBg, flexDirection: 'row', justifyContent: 'center', alignItems: 'center' }}>
                        <Image style={{ width: 70, height: 70, marginRight: 12 }} src={qrCodeUrl} />
                        <View>
                            <Text style={{ fontSize: 9, fontWeight: 700, color: accentColor, marginBottom: 2 }}>ZIMRA Verification QR</Text>
                            <Text style={{ fontSize: 7, color: '#64748b' }}>Scan to verify this fiscal document.</Text>
                            {verificationCode ? <Text style={{ fontSize: 7, color: '#64748b', marginTop: 2 }}>Code: {verificationCode}</Text> : null}
                        </View>
                    </View>
                ) : null}

                {partner ? (
                    <View style={{ marginTop: 8, padding: 6, borderTopWidth: 1, borderTopColor: borderColor }}>
                        <Text style={{ fontSize: 7, color: '#64748b', textAlign: 'center' }}>
                            {partner.displayLabel || "In partnership with"} {partner.tradingName || partner.name}
                        </Text>
                        {partnershipSettings.partnershipFootnote ? (
                            <Text style={{ fontSize: 6, color: '#94a3b8', textAlign: 'center', marginTop: 2 }}>{partnershipSettings.partnershipFootnote}</Text>
                        ) : null}
                    </View>
                ) : null}

                {/* 6. Footer */}
                <View style={styles.footerSection}>
                    <Text style={{ fontSize: 8, color: '#64748b', textAlign: 'center', marginBottom: 3 }}>
                        {company?.tradingName || company?.name}
                        {company?.phone ? ` | ${company.phone}` : ""}
                        {company?.email ? ` | ${company.email}` : ""}
                    </Text>
                    <Text style={{ fontSize: 7, color: (invoice.fiscalCode || !company?.vatRegistered) ? '#94a3b8' : '#b45309', textAlign: 'center' }}>
                        {(invoice.fiscalCode || !company?.vatRegistered) ? "Thank you for your business." : "PROFORMA - NOT VALID FOR TAX PURPOSES"}
                    </Text>
                </View>

            </Page>
        </Document >
    )
};
