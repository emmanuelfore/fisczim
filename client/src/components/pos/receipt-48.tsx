
import { QRCodeSVG } from "qrcode.react";
import { format } from "date-fns";

interface Receipt48Props {
    id?: string;
    invoice: any;
    company: any;
    customer?: any;
    items?: any[];
    originalInvoice?: any; // For Credit/Debit notes
    user?: any;
    paperSize?: '80mm' | '58mm' | 'A4';
    branch?: any;
}

export function Receipt48({ id = "receipt-48", invoice, company, customer, items, originalInvoice, user, paperSize: paperSizeProp, branch }: Receipt48Props) {
    if (!invoice || !company) return null;

    const receiptItems = items || invoice.items || [];
    const paperSize = paperSizeProp || (company.posSettings?.paperSize as string) || '80mm';
    const isA4 = paperSize === 'A4';
    const receiptWidth = isA4 ? '210mm' : paperSize;

    // Group taxes
    const taxGroups = receiptItems.reduce((acc: any, item: any) => {
        const taxRate = parseFloat(item.taxRate || 0);
        const price = parseFloat(item.price || item.unitPrice || 0);
        const qty = parseFloat(item.quantity || 0);
        const total = parseFloat(item.lineTotal || (price * qty));

        const rate = taxRate / 100;
        const taxAmount = (total * rate) / (1 + rate);
        const netAmount = total - taxAmount;

        const key = taxRate.toFixed(2);
        if (!acc[key]) {
            acc[key] = {
                rate: taxRate,
                net: 0,
                tax: 0,
                gross: 0,
                name: item.taxCode || (taxRate === 0 ? "Exempt" : `${taxRate}%`)
            };
        }
        acc[key].net += netAmount;
        acc[key].tax += taxAmount;
        acc[key].gross += total;
        return acc;
    }, {});

    const totalQty = receiptItems.reduce((sum: number, item: any) => sum + parseFloat(item.quantity || 0), 0);

    const isCreditNote = invoice.transactionType === 'CreditNote' || invoice.type === 'credit_note';
    const isDebitNote = invoice.transactionType === 'DebitNote' || invoice.type === 'debit_note';
    const isFiscalized = !!invoice.fiscalCode || !!invoice.receiptGlobalNo;
    const isOffline = !!invoice._offline;
    const isVatPayer = !!company.vatNumber;

    let documentTitle = "INVOICE";
    if (isOffline) documentTitle = "OFFLINE RECEIPT";
    else if (isCreditNote) documentTitle = "CREDIT NOTE";
    else if (isDebitNote) documentTitle = "DEBIT NOTE";
    else if (isFiscalized) {
        documentTitle = isVatPayer ? "FISCAL TAX INVOICE" : "FISCAL INVOICE";
    } else {
        documentTitle = isVatPayer ? "TAX INVOICE" : "INVOICE";
    }

    // Format verification code: XXXX-XXXX-XXXX...
    const formatVerificationCode = (code: string) => {
        if (!code) return "";
        return code.replace(/-/g, "").match(/.{1,4}/g)?.join("-") || code;
    };

    return (
        <div id={id} style={{ width: receiptWidth }} className={`bg-white p-2 text-black font-mono text-[10px] leading-tight receipt-content ${isA4 ? 'mx-auto' : ''}`}>
            {/* [1] Logo(s) */}
            {(company.logoUrl || (invoice as any)?.partnerSnapshot?.logoUrl) && (
                <div className="flex justify-center items-center gap-3 mb-2">
                    {company.logoUrl && (
                        <img src={company.logoUrl} alt="Logo" className="max-h-16 object-contain" />
                    )}
                    {(invoice as any)?.partnerSnapshot?.logoUrl && (
                        <img src={(invoice as any).partnerSnapshot.logoUrl} alt="Partner" className="max-h-14 object-contain" />
                    )}
                </div>
            )}
            {(invoice as any)?.partnerSnapshot?.name && (
                <p className="text-center text-[9px] mb-1 text-slate-600">
                    {(invoice as any).partnerSnapshot.displayLabel || "In partnership with"} {(invoice as any).partnerSnapshot.tradingName || (invoice as any).partnerSnapshot.name}
                </p>
            )}

            {/* [2] Taxpayer Name */}
            <h1 className="text-center font-bold uppercase text-xs mb-1">{company.name}</h1>

            {/* [3] TIN, [4] VAT No */}
            <div className="text-center mb-1">
                <p>TIN: {company.tin}</p>
                {isVatPayer && <p>VAT No: {company.vatNumber}</p>}
            </div>

            {/* [5] Branch & [6] Address */}
            <div className="text-center mb-1">
                {branch ? (
                    <>
                        <p className="font-bold">{branch.name}</p>
                        <p className="whitespace-pre-wrap">
                            {[branch.address, branch.city, company.province].filter(Boolean).join(", ")}
                        </p>
                    </>
                ) : (
                    <>
                        {company.tradingName && company.tradingName !== company.name && (
                            <p className="font-bold">{company.tradingName}</p>
                        )}
                        <p className="whitespace-pre-wrap">
                            {[company.address, company.city, company.province].filter(Boolean).join(", ")}
                        </p>
                    </>
                )}
            </div>

            {/* [7] Email, [8] Phone */}
            <div className="text-center mb-2 pb-2 border-b border-dashed border-black">
                {company.email && <p>{company.email}</p>}
                {company.phone && <p>{company.phone}</p>}
            </div>

            {/* [9] Label */}
            <div className="text-center font-bold mb-2 pb-2 border-b border-dashed border-black text-xs">
                <p>{documentTitle}</p>
                {isOffline && (
                    <div className="mt-1 text-[9px] leading-tight">
                        <p>PENDING SYNC - NOT FISCALIZED</p>
                        <p>KEEP FOR CASH HANDOVER</p>
                    </div>
                )}
            </div>

            {/* [10-16] Buyer Block */}
            {customer && !["walk-in", "walk in", "guest"].some(s => customer.name?.toLowerCase().includes(s)) && (
                <div className="mb-2 pb-2 border-b border-dashed border-black">
                    <p className="font-bold underline">BUYER</p>
                    <p>{customer.name}</p>
                    {customer.tradingName && <p>{customer.tradingName}</p>}
                    {customer.tin && <p>TIN: {customer.tin}</p>}
                    {customer.vatNumber && <p>VAT No: {customer.vatNumber}</p>}
                    {customer.address && <p>{customer.address}</p>}
                    {customer.email && <p>{customer.email}</p>}
                    {customer.phone && <p>{customer.phone}</p>}
                </div>
            )}

            {/* Receipt Information [17-23] */}
            <div className="mb-2 pb-2 border-b border-dashed border-black">
                <div className="flex justify-between">
                    <span>Invoice No:</span>
                    <span className="font-bold">
                        {(invoice.receiptCounter || "---")}/{(invoice.receiptGlobalNo || "---")}
                    </span>
                </div>
                <div className="flex justify-between">
                    <span>Fiscal Day No:</span>
                    <span>{invoice.fiscalDayNo || "---"}</span>
                </div>
                <div className="flex justify-between">
                    <span>Device Serial No:</span>
                    <span>{company.fdmsDeviceSerialNo || company.deviceSerialNo || "---"}</span>
                </div>
                <div className="flex justify-between">
                    <span>Device ID:</span>
                    <span>{company.fdmsDeviceId || company.deviceId || "---"}</span>
                </div>


                <div className="flex justify-between">
                    <span>Customer Ref No:</span>
                    <span>{invoice.invoiceNo || invoice.invoiceNumber || invoice.customerReference}</span>
                </div>
                <div className="flex justify-between">
                    <span>Date & Time:</span>
                    <span>{format(new Date(invoice.issueDate || invoice.createdAt), "dd/MM/yy HH:mm:ss")}</span>
                </div>
                {user && <p>Cashier: {user.name || user.username}</p>}

                {/* Credit/Debit Note information block [24-28] */}
                {(isCreditNote || isDebitNote) && (invoice.creditNote || originalInvoice || invoice.originalInvoiceNumber) && (
                    <div className="mt-1 pt-1 border-t border-dotted border-black text-[9px]">
                        <p className="font-bold uppercase italic">
                            {isCreditNote ? "Credited Invoice" : "Debited Invoice"}
                        </p>
                        <p>Inv No: {invoice.creditNote?.receiptGlobalNo || originalInvoice?.receiptGlobalNo || invoice.originalInvoiceNumber}</p>
                        <p>Device ID: {invoice.creditNote?.deviceID || originalInvoice?.fdmsDeviceId || company.fdmsDeviceId}</p>
                        <p>Date: {invoice.creditNote?.receiptDate || (originalInvoice?.issueDate && format(new Date(originalInvoice.issueDate), "dd/MM/yy"))}</p>
                    </div>
                )}
            </div>

            {/* Receipt lines block [29-34] */}
            <div className="mb-2 pb-1 border-b border-dashed border-black">
                {receiptItems.map((item: any, i: number) => {
                    const itemName = item.description || item.name;
                    const qty = parseFloat(item.quantity || 0);
                    const price = parseFloat(item.unitPrice || item.price || 0);
                    const total = parseFloat(item.lineTotal || (qty * price));
                    const isDiscount = !!item.discount || item.type === 'discount';

                    return (
                        <div key={i} className="mb-1">
                            <div className="flex justify-between items-start">
                                <span className="w-[70%]">
                                    {isDiscount && "Discount: "}{itemName}
                                </span>
                                <span className="w-[30%] text-right font-bold">
                                    {total.toFixed(2)}
                                </span>
                            </div>
                            {qty !== 1 && (
                                <div className="text-[9px] pl-2 text-gray-700 italic">
                                    {qty.toFixed(3)} each {price.toFixed(2)}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* Receipt settlement block [35-38] */}
            <div className="mb-2 pb-2 border-b border-dashed border-black">
                <div className="flex justify-between text-xs font-bold">
                    <span>TOTAL ({invoice.currency || "USD"})</span>
                    <span>{Number((invoice.total || invoice.receiptTotal) * (invoice.exchangeRate || 1)).toFixed(2)}</span>
                </div>
                <div className="flex justify-between mt-1 pt-1 border-t border-dotted border-black/20">
                    <span className="uppercase text-[9px]">TENDERED:</span>
                    <span>{Number(invoice.paymentAmount || ((invoice.total || invoice.receiptTotal) * (invoice.exchangeRate || 1))).toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                    <span className="uppercase text-[9px]">CHANGE:</span>
                    <span>{Number(invoice.change || 0).toFixed(2)}</span>
                </div>
            </div>


            {/* Number of Items block [39] */}
            <div className="mb-2 pb-2 border-b border-dashed border-black">
                <p>Number of Items: {totalQty.toFixed(3)}</p>
                {invoice.exchangeRate && invoice.currency !== 'USD' && (
                    <p className="font-bold text-center mt-1">
                        USD Equivalent: ${(Number(invoice.total) / Number(invoice.exchangeRate)).toFixed(2)}
                    </p>
                )}
            </div>

            {/* Taxes block [40-44] */}
            {isVatPayer && (
                <div className="mb-2 pb-2 border-b border-dashed border-black">
                    <p className="font-bold text-center mb-1 underline">TAX SUMMARY</p>
                    {Object.values(taxGroups).map((group: any, i) => (
                        <div key={i} className="mb-1 border-b border-dotted border-gray-300 pb-1 last:border-0">
                            <div className="flex justify-between uppercase text-[9px]">
                                <span>Tax Code {group.name} ({group.rate}%)</span>
                            </div>
                            <div className="flex justify-between pl-2">
                                <span>Net Amt</span>
                                <span>{group.net.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between pl-2">
                                <span>VAT</span>
                                <span>{group.tax.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between pl-2 font-bold">
                                <span>Total Amt</span>
                                <span>{group.gross.toFixed(2)}</span>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Receipt verification block [45-48] */}
            <div className="flex flex-col items-center gap-2 mb-2">
                {(() => {
                    // ZIMRA Field [21]: Device receipt verification code
                    let vCode = invoice.verificationCode || "";
                    
                    // Simulation/draft receipts may show placeholders, but offline receipts must stay provisional.
                    const isSimulated = invoice._simulation || invoice.status === 'draft';
                    if (!vCode && isSimulated) {
                        vCode = "9A2B-C48D-80FE-12A5-99BF"; // Realistic looking placeholder
                    }

                    // Field [29]: QR data
                    const qrData = invoice.qrCodeData || invoice.receiptQRData || company.qrUrl || (isSimulated ? "https://fdms.zimra.co.zw/verify/SIMULATION-ONLY" : "");
                    
                    if (isOffline && !qrData && !vCode) {
                        return (
                            <p className="text-[8px] font-bold text-center px-2">
                                Sync required before fiscal verification.
                            </p>
                        );
                    }

                    if (!qrData && !vCode) return null;

                    return (
                        <>
                            {qrData && <QRCodeSVG value={qrData} size={160} level="M" marginSize={1} />}
                            <div className="text-center w-full px-2">
                                {vCode && (
                                    <>
                                        <p className="text-[8px] font-bold">VERIFICATION CODE:</p>
                                        <p className="font-bold break-all">
                                            {vCode.includes('-') ? vCode : formatVerificationCode(vCode)}
                                        </p>
                                    </>
                                )}
                                {(invoice.qrUrl || company.qrUrl || isSimulated) && (
                                    <p className="text-[7px] mt-1 break-all italic">
                                        Verify at: {invoice.qrUrl || company.qrUrl || "https://fdms.zimra.co.zw/verify"}
                                    </p>
                                )}
                            </div>
                        </>
                    );
                })()}
            </div>

            {/* [49] Note */}
            <div className="text-center italic mb-4 text-[9px]">
                <p>{invoice.notes || invoice.receiptNotes || "Thank you for your business"}</p>
            </div>


            <style>{`
                @media print {
                    @page { 
                        size: ${isA4 ? 'A4' : `${receiptWidth} auto`}; 
                        margin: 0mm; 
                    }
                    html, body { 
                        margin: 0 !important; 
                        padding: 0 !important; 
                        width: ${isA4 ? '210mm' : receiptWidth} !important;
                        background: white;
                        -webkit-print-color-adjust: exact;
                        print-color-adjust: exact;
                    }
                    #${id} {
                        width: ${receiptWidth} !important;
                        max-width: ${receiptWidth} !important;
                        margin: ${isA4 ? '0 auto' : '0'} !important;
                        padding: 4mm 8mm 0mm 8mm !important;
                        box-sizing: border-box;
                        background: white;
                        overflow: visible !important;
                        position: relative !important;
                        height: auto !important;
                        /* Force crisp rendering for thermal printers */
                        -webkit-font-smoothing: none;
                        -moz-osx-font-smoothing: grayscale;
                        color: #000000 !important;
                    }
                    * {
                        box-sizing: border-box;
                        color: #000000 !important;
                        border-color: #000000 !important;
                    }
                    img, svg {
                        image-rendering: pixelated;
                        image-rendering: crisp-edges;
                    }
                }
                /* Also apply to the preview if needed */
                .receipt-content {
                    color: #000000;
                }
                .receipt-content * {
                    border-color: #000000;
                }
            `}</style>
        </div>
    );
}
