/**
 * POS receipt parser — port of FiscalBridge/receiptParser.js (Interface ReadFile.cs).
 * ESM export for FiscalPrinter.
 */

export class ReceiptParser {
  constructor(config) {
    this.config = config || {};
    this.itemCounter = 0;
  }

  countDots(line, numberOfDots) {
    const counter = (line.match(/\./g) || []).length;
    return counter >= numberOfDots;
  }

  cleanValue(value) {
    if (!value) return "";
    return value
      .replace(/\$/g, "")
      .replace(/T1/g, "")
      .replace(/Z\$/g, "")
      .replace(/US/g, "")
      .replace(/US\$/g, "")
      .replace(/ZWL/g, "")
      .replace(/Z/g, "")
      .replace(/,/g, "")
      .replace(/\*/g, "")
      .replace(/-/g, "")
      .replace(this.config.taxSymbol || "", "")
      .replace(this.config.nonTaxSymbol || "", "")
      .trim();
  }

  cleanProductName(product) {
    if (!product) return "";
    return product
      .replace(/[!@#$%^&*()\-+~<>?/\\[\]{}|`']/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  parseReceipt(content, currenciesList = []) {
    const lines = content.split(/\r?\n/);
    this.itemCounter = 0;

    const invoiceData = {
      invoiceNumber: "",
      currency: "",
      customerName: "",
      customerAddress: "",
      customerEmail: "",
      customerTIN: "",
      customerVATNumber: "",
      customerTelephoneNumber: "",
      invoiceComment: "",
      invoiceFlag: "01",
      cashier: "",
      reason: "",
      tendered: "",
      change: "",
      items: [],
      invoiceAmount: "",
      invoiceTaxAmount: "",
    };

    let productStartLine = 0;
    let productEndLine = 0;
    let currentCurrency = "";

    lines.forEach((line, index) => {
      const lineNum = index + 1;
      if (line.includes(this.config.productStartLine || "Order No.")) {
        productStartLine = lineNum;
      }
      if (line.includes(this.config.productEndLine || "Items count")) {
        productEndLine = lineNum;
      }
      currenciesList.forEach((currency) => {
        if (line.includes(currency.keyword)) currentCurrency = currency.name;
      });
    });

    invoiceData.currency = currentCurrency || this.config.currency || "USD";

    const multiLineProduct = this.config.multiLineProduct === "1" || this.config.multiLineProduct === true;
    const itemDotCounter = parseInt(this.config.itemDotCounter, 10) || 2;
    const columnQuantityIndex = parseInt(this.config.columnQuantityIndex, 10) || 0;
    const columnPriceIndex = parseInt(this.config.columnPriceIndex, 10) || 2;
    const columnAmountIndex = parseInt(this.config.columnAmountIndex, 10) || 3;

    let currentProduct = "";
    let currentCode = "";

    lines.forEach((line, index) => {
      const lineNum = index + 1;
      const inProductSection =
        productStartLine > 0 && productEndLine > 0
          ? lineNum > productStartLine && lineNum < productEndLine
          : true;

      if (multiLineProduct) {
        if (
          inProductSection &&
          !this.countDots(line, itemDotCounter) &&
          !line.includes("Price") &&
          !line.includes("----------") &&
          line.trim() !== ""
        ) {
          const parts = line.split(" ").filter((p) => p.trim() !== "");
          if (parts.length > 0) {
            currentCode = this.cleanValue(parts[0]);
            currentProduct = parts.slice(1).join(" ");
          }
        } else if (inProductSection && this.countDots(line, itemDotCounter)) {
          this.itemCounter++;
          const item = this.parseItemLine(line, currentCode, currentProduct, {
            columnQuantityIndex,
            columnPriceIndex,
            columnAmountIndex,
            vatFlag: this.config.vatFlag,
            vatA: this.config.vatA || "0.155",
            vatE: this.config.vatE || "0.00",
            taxSymbol: this.config.taxSymbol,
            nonTaxSymbol: this.config.nonTaxSymbol,
          });
          if (item) invoiceData.items.push(item);
          currentProduct = "";
          currentCode = "";
        }
      } else if (inProductSection && this.countDots(line, itemDotCounter)) {
        this.itemCounter++;
        const parts = line.split(" ").filter((p) => p.trim() !== "");
        currentProduct = parts.slice(0, Math.max(0, parts.length - 3)).join(" ");
        currentCode = ".";
        const item = this.parseItemLine(line, currentCode, currentProduct, {
          columnQuantityIndex: parts.length - 3,
          columnPriceIndex: parts.length - 2,
          columnAmountIndex: parts.length - 1,
          vatFlag: this.config.vatFlag,
          vatA: this.config.vatA || "0.155",
          vatE: this.config.vatE || "0.00",
          taxSymbol: this.config.taxSymbol,
          nonTaxSymbol: this.config.nonTaxSymbol,
        });
        if (item) invoiceData.items.push(item);
      }

      this.parseInvoiceField(line, invoiceData, "invoiceNumber", this.config.invoiceNumber || "Order No.");
      this.parseInvoiceField(line, invoiceData, "customerName", this.config.customerName || "Buyer Name");
      this.parseInvoiceField(line, invoiceData, "customerAddress", this.config.customerAddress || "Buyer Address");
      this.parseInvoiceField(line, invoiceData, "customerEmail", this.config.customerEmail || "Buyer Email");
      this.parseInvoiceField(line, invoiceData, "customerTIN", this.config.customerTIN || "Buyer TIN");
      this.parseInvoiceField(line, invoiceData, "customerVATNumber", this.config.customerVATNumber || "Buyer VAT");
      this.parseInvoiceField(
        line,
        invoiceData,
        "customerTelephoneNumber",
        this.config.customerTelephoneNumber || "Buyer Phone"
      );
      this.parseInvoiceField(line, invoiceData, "invoiceComment", this.config.invoiceComment || "Original:");
    });

    let tempAmount = 0;
    let tempTax = 0;
    for (const item of invoiceData.items) {
      tempAmount += parseFloat(item.amount) || 0;
      tempTax += parseFloat(item.tax) || 0;
    }
    invoiceData.invoiceAmount = tempAmount.toFixed(2);
    invoiceData.invoiceTaxAmount = tempTax.toFixed(2);

    if (invoiceData.invoiceNumber.includes("CR")) {
      invoiceData.invoiceFlag = "02";
    }

    return invoiceData;
  }

  parseItemLine(line, code, product, config) {
    const parts = line.split(" ").filter((p) => p.trim() !== "");
    if (parts.length < 3) return null;

    const quantity = this.cleanValue(parts[config.columnQuantityIndex]);
    const price = this.cleanValue(parts[config.columnPriceIndex]);
    const amount = this.cleanValue(parts[config.columnAmountIndex]);
    if (!quantity || !amount) return null;

    const qtyNum = parseFloat(quantity);
    const amountNum = parseFloat(amount);
    if (!qtyNum || Number.isNaN(amountNum)) return null;

    const calculatedPrice = (amountNum / qtyNum).toFixed(2);

    let vatRate = config.vatA;
    let taxable = "Incl";
    const isNonTaxable =
      (product && config.nonTaxSymbol && product.includes(config.nonTaxSymbol)) ||
      (!config.taxSymbol && !config.nonTaxSymbol && false);

    if (isNonTaxable) {
      vatRate = config.vatE;
      taxable = "Exem";
    } else if (config.vatFlag === "0") {
      taxable = "Excl";
    }

    let tax = (amountNum * parseFloat(vatRate)).toFixed(2);
    if (config.vatFlag === "1") {
      tax = (amountNum - amountNum / (1 + parseFloat(vatRate))).toFixed(2);
    }

    return {
      hh: String(this.itemCounter),
      itemCode: code || "00000000",
      itemName1: this.cleanProductName(product || parts.slice(0, -3).join(" ")),
      itemName2: this.cleanProductName(product || parts.slice(0, -3).join(" ")),
      quantity,
      price: calculatedPrice || price,
      amount,
      tax,
      taxable,
      taxRate: vatRate,
    };
  }

  parseInvoiceField(line, invoiceData, field, marker) {
    if (!line.includes(marker)) return;
    const parts = line.includes(":") ? line.split(":") : line.split(" ");
    let value = parts[parts.length - 1];
    if (field === "invoiceNumber" || field === "invoiceComment") {
      value = value.replace(/[^a-zA-Z0-9]/g, "");
    } else {
      value = this.cleanValue(value);
    }
    invoiceData[field] = value.trim();
  }
}

/** Map POS parser output → FiscalStack fiscalize payload shape used by FiscalPrinter */
export function posInvoiceToParsed(invoiceData) {
  if (!invoiceData?.items?.length) {
    throw new Error("POS receipt parser found no line items — check parse markers in config");
  }

  return {
    invoiceNumber: invoiceData.invoiceNumber || null,
    currency: invoiceData.currency || "USD",
    paymentMethod: "CASH",
    transactionType: invoiceData.invoiceFlag === "02" ? "CreditNote" : "FiscalInvoice",
    buyer: {
      name: invoiceData.customerName || undefined,
      tin: invoiceData.customerTIN || undefined,
      vatNumber: invoiceData.customerVATNumber || undefined,
      email: invoiceData.customerEmail || undefined,
      phone: invoiceData.customerTelephoneNumber || undefined,
    },
    items: invoiceData.items.map((item) => ({
      name: item.itemName1,
      quantity: parseFloat(item.quantity),
      unitPrice: parseFloat(item.price),
      taxType: item.taxable === "Exem" ? "EXEMPT" : "STANDARD",
      taxInclusive: item.taxable !== "Excl",
    })),
  };
}
