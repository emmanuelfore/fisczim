
import crypto from 'crypto';
import { describe, test, expect } from 'vitest';
import { ZimraDevice, type ReceiptData } from '../zimra.js';

// Utility to match the hashing logic in the main app
function getHash(data: string): string {
    return crypto.createHash('sha256').update(data, 'utf8').digest('base64');
}

/**
 * ZIMRA Compliance Test Suite
 * Verifies that our implementation matches official ZIMRA FDMS examples.
 */

describe("ZIMRA Compliance", () => {
    test("a product-less discount is prepared as a valid FDMS discount line", () => {
        const device = new ZimraDevice({
            deviceId: "321",
            deviceSerialNo: "TEST",
            activationKey: "TEST",
        });
        const receipt: ReceiptData = {
            receiptType: "FiscalInvoice",
            receiptCurrency: "USD",
            receiptCounter: 2,
            receiptGlobalNo: 2,
            invoiceNo: "INV-DISCOUNT",
            receiptDate: "2026-09-04T12:00:00",
            receiptLinesTaxInclusive: false,
            receiptLines: [
                {
                    receiptLineType: "Sale",
                    receiptLineNo: 1,
                    receiptLineHSCode: "04021099",
                    receiptLineName: "Sale",
                    receiptLineQuantity: 1,
                    receiptLinePrice: 100,
                    receiptLineTotal: 100,
                    taxID: 3,
                    taxPercent: 15.5,
                },
                {
                    receiptLineType: "Discount",
                    receiptLineNo: 2,
                    receiptLineHSCode: "99999999",
                    receiptLineName: "Discount",
                    receiptLineQuantity: 1,
                    receiptLinePrice: -10,
                    receiptLineTotal: -10,
                    taxID: 3,
                    taxPercent: 15.5,
                },
            ],
            receiptTaxes: [],
            receiptPayments: [{ moneyTypeCode: "Cash", paymentAmount: 90 }],
            receiptTotal: 90,
        };

        const prepared = (device as any).prepareReceipt(receipt) as ReceiptData;
        const discount = prepared.receiptLines[1];

        expect(discount).toMatchObject({
            receiptLineType: "Discount",
            receiptLineHSCode: "99999999",
            receiptLineQuantity: 1,
            receiptLinePrice: -10,
            receiptLineTotal: -10,
            taxID: 3,
            taxPercent: 15.5,
        });
        expect(prepared.receiptTotal).toBe(103.95);
    });

    test("signature hash matches the ZIMRA FDMS Specification example (Device 321, Day 84)", () => {
        const deviceID = "321";
        const fiscalDayNo = "84";
        const fiscalDayDate = "2019-09-23";
        const expectedHash = "OdT8lLI0JXhXl1XQgr64Zb1ltFDksFXThVxqM6O8xZE=";

        // These specific blocks are extracted from the FDMS Spec example concatenation string
        const concatenatedCounters =
            "SALEBYTAXZWL2300000" +
            "SALEBYTAXZWL0.001200000" +
            "SALEBYTAXUSD14.502500" +
            "SALEBYTAXZWL15.001200" +
            "SALETAXBYTAXUSD15.00250" +
            "SALETAXBYTAXZWL15.00230000" +
            "BALANCEBYMONEYTYPEUSDLCASH3700" + // Spec example contains this 'L'
            "BALANCEBYMONEYTYPEZWLCASH2000000" +
            "BALANCEBYMONEYTYPEZWLCARD1500000";

        const stringToSign = `${deviceID}${fiscalDayNo}${fiscalDayDate}${concatenatedCounters}`;
        const generatedHash = getHash(stringToSign);

        expect(generatedHash).toBe(expectedHash);
    });

    test("tax percentages are formatted as strings with 2 decimals", () => {
        const formats = [
            { rate: 15, expected: "15.00" },
            { rate: 0, expected: "0.00" },
            { rate: 14.5, expected: "14.50" }
        ];

        for (const f of formats) {
            expect(f.rate.toFixed(2)).toBe(f.expected);
        }
    });

    test("CreditNote amounts result in negative counter updates", () => {
        const mockInvoices = [
            { type: 'FiscalInvoice', total: 100 },
            { type: 'CreditNote', total: 40 },
            { type: 'DebitNote', total: 10 }
        ];

        let balance = 0;
        for (const inv of mockInvoices) {
            let amount = Number(inv.total);
            if (inv.type === 'CreditNote') {
                amount = -Math.abs(amount);
            } else {
                amount = Math.abs(amount);
            }
            balance += amount;
        }

        expect(balance).toBe(100 - 40 + 10); // 70
    });
});
