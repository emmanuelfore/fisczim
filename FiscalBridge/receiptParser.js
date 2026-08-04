/**
 * Receipt Parser - Port of ReadFile.cs functionality
 * Parses receipt text files and extracts invoice data for fiscalization
 */

class ReceiptParser {
  constructor(config) {
    this.config = config || {};
  }

  /**
   * Count dots in a line (from CountDots method)
   */
  countDots(line, numberOfDots) {
    const counter = (line.match(/\./g) || []).length;
    return counter >= numberOfDots;
  }

  /**
   * Clean currency symbols and formatting from values
   */
  cleanValue(value) {
    if (!value) return '';
    return value
      .replace(/\$/g, '')
      .replace(/T1/g, '')
      .replace(/Z\$/g, '')
      .replace(/US/g, '')
      .replace(/US\$/g, '')
      .replace(/ZWL/g, '')
      .replace(/Z/g, '')
      .replace(/,/g, '')
      .replace(/\*/g, '')
      .replace(/-/g, '')
      .replace(this.config.taxSymbol || '', '')
      .replace(this.config.nonTaxSymbol || '', '')
      .trim();
  }

  /**
   * Clean product name by removing special characters
   */
  cleanProductName(product) {
    if (!product) return '';
    return product
      .replace(/[!@#$%^&*()\-+~<>?\/\\\[\]\{\}|`]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Parse receipt file and extract invoice data
   * (Port of ReadInvoice method from ReadFile.cs)
   */
  parseReceipt(content, currenciesList = []) {
    const lines = content.split('\n');
    
    let invoiceData = {
      invoiceNumber: '',
      currency: '',
      customerName: '',
      customerAddress: '',
      customerEmail: '',
      customerTIN: '',
      customerVATNumber: '',
      customerTelephoneNumber: '',
      invoiceComment: '',
      invoiceFlag: '01',
      cashier: '',
      reason: '',
      tendered: '',
      change: '',
      items: [],
      itemsXML: '',
      currenciesXML: '',
      invoiceAmount: '',
      invoiceTaxAmount: ''
    };

    let productStartLine = 0;
    let productEndLine = 0;
    let currentCurrency = '';
    let itemCounter = 0;
    let tempAmount = 0;
    let tempTax = 0;

    // First pass: find product section boundaries and currency
    lines.forEach((line, index) => {
      const lineNum = index + 1;
      
      if (line.includes(this.config.productStartLine || 'Order No.')) {
        productStartLine = lineNum;
      }
      
      if (line.includes(this.config.productEndLine || 'Items count')) {
        productEndLine = lineNum;
      }

      // Detect currency from keywords
      currenciesList.forEach(currency => {
        if (line.includes(currency.keyword)) {
          currentCurrency = currency.name;
        }
      });
    });

    invoiceData.currency = currentCurrency;

    // Second pass: parse items and invoice data
    const multiLineProduct = this.config.multiLineProduct === '1';
    const itemDotCounter = parseInt(this.config.itemDotCounter) || 2;
    const columnQuantityIndex = parseInt(this.config.columnQuantityIndex) || 0;
    const columnPriceIndex = parseInt(this.config.columnPriceIndex) || 2;
    const columnAmountIndex = parseInt(this.config.columnAmountIndex) || 3;

    let currentProduct = '';
    let currentCode = '';

    lines.forEach((line, index) => {
      const lineNum = index + 1;
      const inProductSection = lineNum > productStartLine && lineNum < productEndLine;

      if (multiLineProduct) {
        // Multi-line product parsing
        if (inProductSection && !this.countDots(line, itemDotCounter) && 
            !line.includes('Price') && !line.includes('----------') && line.trim() !== '') {
          
          const parts = line.split(' ').filter(p => p.trim() !== '');
          if (parts.length > 0) {
            currentCode = this.cleanValue(parts[0]);
            currentProduct = parts.slice(1).join(' ');
          }
        } else if (inProductSection && this.countDots(line, itemDotCounter)) {
          // Parse item line with dots
          itemCounter++;
          const item = this.parseItemLine(line, currentCode, currentProduct, {
            columnQuantityIndex,
            columnPriceIndex,
            columnAmountIndex,
            vatFlag: this.config.vatFlag,
            vatA: this.config.vatA || '0.155',
            vatE: this.config.vatE || '0.00',
            taxSymbol: this.config.taxSymbol,
            nonTaxSymbol: this.config.nonTaxSymbol
          });

          if (item) {
            invoiceData.items.push(item);
            tempAmount += parseFloat(item.amount) || 0;
            tempTax += parseFloat(item.tax) || 0;
          }

          currentProduct = '';
          currentCode = '';
        }
      } else {
        // Single-line product parsing
        if (inProductSection && this.countDots(line, itemDotCounter)) {
          itemCounter++;
          const parts = line.split(' ').filter(p => p.trim() !== '');
          
          // Product name is everything except the last 3 elements (qty, price, amount)
          currentProduct = parts.slice(0, parts.length - 3).join(' ');
          currentCode = '.';

          const item = this.parseItemLine(line, currentCode, currentProduct, {
            columnQuantityIndex: parts.length - 3,
            columnPriceIndex: parts.length - 2,
            columnAmountIndex: parts.length - 1,
            vatFlag: this.config.vatFlag,
            vatA: this.config.vatA || '0.155',
            vatE: this.config.vatE || '0.00',
            taxSymbol: this.config.taxSymbol,
            nonTaxSymbol: this.config.nonTaxSymbol
          });

          if (item) {
            invoiceData.items.push(item);
            tempAmount += parseFloat(item.amount) || 0;
            tempTax += parseFloat(item.tax) || 0;
          }

          currentProduct = '';
          currentCode = '.';
        }
      }

      // Parse invoice-level fields
      this.parseInvoiceField(line, invoiceData, 'invoiceNumber', this.config.invoiceNumber || 'Order No.');
      this.parseInvoiceField(line, invoiceData, 'customerName', this.config.customerName || 'Buyer Name');
      this.parseInvoiceField(line, invoiceData, 'customerAddress', this.config.customerAddress || 'Buyer Address');
      this.parseInvoiceField(line, invoiceData, 'customerEmail', this.config.customerEmail || 'Buyer Email');
      this.parseInvoiceField(line, invoiceData, 'customerTIN', this.config.customerTIN || 'Buyer TIN');
      this.parseInvoiceField(line, invoiceData, 'customerVATNumber', this.config.customerVATNumber || 'Buyer VAT');
      this.parseInvoiceField(line, invoiceData, 'customerTelephoneNumber', this.config.customerTelephoneNumber || 'Buyer Phone');
      this.parseInvoiceField(line, invoiceData, 'cashier', this.config.cashier || 'Reason:');
      this.parseInvoiceField(line, invoiceData, 'reason', this.config.reason || 'User:');
      this.parseInvoiceField(line, invoiceData, 'tendered', this.config.tendered || 'Paid amount:');
      this.parseInvoiceField(line, invoiceData, 'change', this.config.change || 'Change:');
      this.parseInvoiceField(line, invoiceData, 'invoiceComment', this.config.invoiceComment || 'Original:');
    });

    invoiceData.invoiceAmount = tempAmount.toFixed(2);
    invoiceData.invoiceTaxAmount = tempTax.toFixed(2);

    // Check for credit note
    if (invoiceData.invoiceNumber.includes('CR')) {
      invoiceData.invoiceFlag = '02';
    }

    // Build XML strings
    invoiceData.itemsXML = this.buildItemsXML(invoiceData.items);
    invoiceData.currenciesXML = this.buildCurrenciesXML(currentCurrency, tempAmount);

    return invoiceData;
  }

  /**
   * Parse a single item line
   */
  parseItemLine(line, code, product, config) {
    const parts = line.split(' ').filter(p => p.trim() !== '');
    if (parts.length < 3) return null;

    const quantity = this.cleanValue(parts[config.columnQuantityIndex]);
    const price = this.cleanValue(parts[config.columnPriceIndex]);
    const amount = this.cleanValue(parts[config.columnAmountIndex]);

    // Calculate price from amount/quantity if not provided
    const calculatedPrice = (parseFloat(amount) / parseFloat(quantity)).toFixed(2);

    // Determine tax rate
    let vatRate = config.vatA;
    let taxable = 'Incl';
    const isNonTaxable = product.includes(config.nonTaxSymbol) || 
                        (!config.taxSymbol && !config.nonTaxSymbol);

    if (isNonTaxable) {
      vatRate = config.vatE;
      taxable = 'Exem';
    } else if (config.vatFlag === '0') {
      taxable = 'Excl';
    }

    // Calculate tax amount
    let taxAmount = (parseFloat(amount) * parseFloat(vatRate)).toFixed(2);
    
    // Adjust for tax-inclusive pricing
    let tax = taxAmount;
    if (config.vatFlag === '1') {
      tax = (parseFloat(amount) - parseFloat(amount) / (1 + parseFloat(vatRate))).toFixed(2);
    }

    return {
      hh: (this.getItemCount() + 1).toString(),
      itemCode: code || '00000000',
      itemName1: this.cleanProductName(product),
      itemName2: this.cleanProductName(product),
      quantity: quantity,
      price: calculatedPrice,
      amount: amount,
      tax: tax,
      taxable: taxable,
      taxRate: vatRate
    };
  }

  /**
   * Parse invoice-level field from line
   */
  parseInvoiceField(line, invoiceData, field, marker) {
    if (line.includes(marker)) {
      const parts = line.includes(':') ? line.split(':') : line.split(' ');
      let value = parts[parts.length - 1];
      
      // Clean based on field type
      if (field === 'invoiceNumber' || field === 'invoiceComment') {
        value = value.replace(/[^a-zA-Z0-9]/g, '');
      } else {
        value = this.cleanValue(value);
      }
      
      invoiceData[field] = value.trim();
    }
  }

  /**
   * Build items XML string
   */
  buildItemsXML(items) {
    let xml = '<ITEMS>';
    items.forEach(item => {
      xml += '<ITEM>';
      xml += `<HH>${item.hh}</HH>`;
      xml += `<ITEMCODE>${item.itemCode}</ITEMCODE>`;
      xml += `<ITEMNAME1>${item.itemName1}</ITEMNAME1>`;
      xml += `<ITEMNAME2>${item.itemName2}</ITEMNAME2>`;
      xml += `<QTY>${item.quantity}</QTY>`;
      xml += `<PRICE>${item.price}</PRICE>`;
      xml += `<AMT>${item.amount}</AMT>`;
      xml += `<TAX>${item.tax}</TAX>`;
      xml += `<TAXR>${item.taxRate}</TAXR>`;
      xml += '</ITEM>';
    });
    xml += '</ITEMS>';
    return xml;
  }

  /**
   * Build currencies XML string
   */
  buildCurrenciesXML(currency, amount) {
    return `<CurrenciesReceived><Currency><Name>${currency}</Name><Amount>${amount}</Amount><Rate>1</Rate></Currency></CurrenciesReceived>`;
  }

  getItemCount() {
    return this.itemCounter || 0;
  }

  setItemCount(count) {
    this.itemCounter = count;
  }
}

// Make ReceiptParser available globally for browser context
if (typeof window !== 'undefined') {
  window.ReceiptParser = ReceiptParser;
}

module.exports = ReceiptParser;
