/**
 * Data Models - Port of C# data structures from Windows Interface
 * These models match the structure used by the Fiskaztech API
 */

/**
 * Receipt Model - Full receipt structure
 */
class Receipt {
    constructor() {
        this.receiptType = 'FiscalInvoice';
        this.receiptCurrency = 'USD';
        this.receiptCounter = 0;
        this.receiptGlobalNo = 0;
        this.invoiceNo = '';
        this.buyerData = new BuyerData();
        this.receiptNotes = '';
        this.receiptDate = new Date();
        this.creditDebitNote = new CreditDebitNote();
        this.receiptLinesTaxInclusive = true;
        this.receiptLines = [];
        this.receiptTaxes = [];
        this.receiptPayments = [];
        this.receiptTotal = 0;
        this.receiptPrintForm = 'Receipt48';
        this.receiptDeviceSignature = new ReceiptDeviceSignature();
    }
}

/**
 * Receipt Line Model
 */
class ReceiptLine {
    constructor() {
        this.lineNumber = 0;
        this.itemCode = '';
        this.itemName = '';
        this.quantity = 0;
        this.unitPrice = 0;
        this.lineAmount = 0;
        this.taxRate = 0;
        this.taxAmount = 0;
        this.taxType = 'STANDARD'; // STANDARD, EXEMPT, ZERO_RATED
        this.discountAmount = 0;
        this.measureUnit = 'PCS';
    }
}

/**
 * Receipt Tax Model
 */
class ReceiptTax {
    constructor() {
        this.taxType = 'STANDARD';
        this.taxRate = 0;
        this.taxableAmount = 0;
        this.taxAmount = 0;
    }
}

/**
 * Receipt Payment Model
 */
class ReceiptPayment {
    constructor() {
        this.paymentType = 'CASH';
        this.amount = 0;
        this.currency = 'USD';
        this.exchangeRate = 1;
        this.cardNumber = '';
        this.approvalCode = '';
    }
}

/**
 * Buyer Data Model
 */
class BuyerData {
    constructor() {
        this.buyerRegisterName = '';
        this.buyerTradeName = '';
        this.buyerTIN = '';
        this.buyerVAT = '';
        this.vatNumber = '';
        this.buyerContacts = new BuyerContacts();
        this.buyerAddress = new BuyerAddress();
    }
}

/**
 * Buyer Contacts Model
 */
class BuyerContacts {
    constructor() {
        this.phoneNo = '';
        this.email = '';
    }
}

/**
 * Buyer Address Model
 */
class BuyerAddress {
    constructor() {
        this.province = '';
        this.street = '';
        this.houseNo = '';
        this.city = '';
    }
}

/**
 * Credit/Debit Note Model
 */
class CreditDebitNote {
    constructor() {
        this.receiptID = '';
        this.deviceID = '';
        this.receiptGlobalNo = '';
        this.fiscalDayNo = '';
    }
}

/**
 * Receipt Device Signature Model
 */
class ReceiptDeviceSignature {
    constructor() {
        this.deviceSerial = '';
        this.deviceSignature = '';
        this.verificationCode = '';
        this.qrCode = '';
    }
}

/**
 * Card Details Model (Device Information)
 */
class CardDetails {
    constructor() {
        this.code = '';
        this.message = '';
        this.qrCode = '';
        this.verificationCode = '';
        this.fiscalDay = '';
        this.data = new CardDetailsData();
    }
}

/**
 * Card Details Data Model
 */
class CardDetailsData {
    constructor() {
        this.tin = '';
        this.vat = '';
        this.companyName = '';
        this.address = '';
        this.registrationNumber = '';
        this.serialNumber = '';
    }
}

/**
 * Z-Report Model
 */
class ZReport {
    constructor() {
        this.date = '';
        this.time = '';
        this.address1 = '';
        this.address2 = '';
        this.address3 = '';
        this.address4 = '';
        this.vatNum = '';
        this.bpNum = '';
        this.taxOffice = '';
        this.zNumber = '';
        this.efdSerial = '';
        this.regDate = '';
        this.user = '';
        this.currency = '';
        this.signature = '';
        this.vatTotals = [];
    }
}

/**
 * VAT Total Model (for Z-Report)
 */
class VatTotal {
    constructor() {
        this.taxType = '';
        this.taxRate = 0;
        this.taxableAmount = 0;
        this.taxAmount = 0;
    }
}

/**
 * Device Status Model
 */
class DeviceStatus {
    constructor() {
        this.deviceId = '';
        this.deviceModelName = '';
        this.deviceModelVersion = '';
        this.fiscalDayStatus = ''; // FiscalDayOpen, FiscalDayClosed
        this.fiscalDayNo = 0;
        this.fiscalDate = '';
        this.receiptCounter = 0;
        this.receiptGlobalNo = 0;
        this.previousReceiptHash = '';
    }
}

/**
 * Config Model (equivalent to config.ini)
 */
class FiscalConfig {
    constructor() {
        this.vatFlag = '1';
        this.vatA = '0.155';
        this.vatB = '0';
        this.vatC = '0';
        this.vatD = '0';
        this.vatE = '0';
        this.vatF = '0';
        this.tin = '';
        this.currency = 'USD';
        this.deviceId = '';
        this.deviceModelName = 'Fiscal Device';
        this.deviceModelVersion = 'v1';
        this.zimraServer = '';
        this.verificationServer = '';
        this.receiptCounter = 0;
        this.receiptGlobalNo = 0;
        this.receiptPrintForm = 'Receipt48';
        this.fiscalDayNo = 0;
        this.fiscalDate = '';
        this.previousReceiptHash = '';
        this.fiscalDayStatus = 'FiscalDayClosed';
    }
}

// Make classes available globally for browser context
if (typeof window !== 'undefined') {
  window.Receipt = Receipt;
  window.ReceiptLine = ReceiptLine;
  window.ReceiptTax = ReceiptTax;
  window.ReceiptPayment = ReceiptPayment;
  window.BuyerData = BuyerData;
  window.BuyerContacts = BuyerContacts;
  window.BuyerAddress = BuyerAddress;
  window.CreditDebitNote = CreditDebitNote;
  window.ReceiptDeviceSignature = ReceiptDeviceSignature;
  window.CardDetails = CardDetails;
  window.CardDetailsData = CardDetailsData;
  window.ZReport = ZReport;
  window.VatTotal = VatTotal;
  window.DeviceStatus = DeviceStatus;
  window.FiscalConfig = FiscalConfig;
}

module.exports = {
    Receipt,
    ReceiptLine,
    ReceiptTax,
    ReceiptPayment,
    BuyerData,
    BuyerContacts,
    BuyerAddress,
    CreditDebitNote,
    ReceiptDeviceSignature,
    CardDetails,
    CardDetailsData,
    ZReport,
    VatTotal,
    DeviceStatus,
    FiscalConfig
};
