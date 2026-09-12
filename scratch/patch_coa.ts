import fs from 'fs';

const path = 'server/storage.ts';
let content = fs.readFileSync(path, 'utf8');

const additions = [
  // Current Assets
  `        { code: "1006", name: "Prepaid Expenses", type: "ASSET", subType: "Current", normalBalance: "DEBIT", ifrsMappingTag: "IAS-1", category: "Current Assets", isControlAccount: false, isSystem: true },`,
  `        { code: "1007", name: "Other Current Assets", type: "ASSET", subType: "Current", normalBalance: "DEBIT", ifrsMappingTag: "IAS-1", category: "Current Assets", isControlAccount: false, isSystem: true },`,
  `        { code: "1010", name: "Sales Tax Receivable", type: "ASSET", subType: "Current", normalBalance: "DEBIT", ifrsMappingTag: "IAS-1", category: "Current Assets", isControlAccount: false, isSystem: true },`,
  `        { code: "1011", name: "Purchase Tax Receivable", type: "ASSET", subType: "Current", normalBalance: "DEBIT", ifrsMappingTag: "IAS-1", category: "Current Assets", isControlAccount: false, isSystem: true },`,
  `        { code: "1012", name: "Input Tax Receivable", type: "ASSET", subType: "Current", normalBalance: "DEBIT", ifrsMappingTag: "IAS-1", category: "Current Assets", isControlAccount: false, isSystem: true },`,
  `        { code: "1016", name: "Supplier Prepayment - ZIG", type: "ASSET", subType: "Current", normalBalance: "DEBIT", ifrsMappingTag: "IAS-1", category: "Current Assets", isControlAccount: false, isSystem: true },`,
  `        { code: "1017", name: "Accounts Receivable - ZIG", type: "ASSET", subType: "Current", normalBalance: "DEBIT", ifrsMappingTag: "IFRS-9", category: "Current Assets", isControlAccount: true, isSystem: true },`,

  // Current Liabilities
  `        { code: "2001", name: "Short-term Loans", type: "LIABILITY", subType: "Current", normalBalance: "CREDIT", ifrsMappingTag: "IFRS-9", category: "Current Liabilities", isControlAccount: false, isSystem: true },`,
  `        { code: "2003", name: "Taxes Payable", type: "LIABILITY", subType: "Current", normalBalance: "CREDIT", ifrsMappingTag: "IAS-37", category: "Current Liabilities", isControlAccount: false, isSystem: true },`,
  `        { code: "2004", name: "Wages Payable", type: "LIABILITY", subType: "Current", normalBalance: "CREDIT", ifrsMappingTag: "IAS-19", category: "Current Liabilities", isControlAccount: false, isSystem: true },`,
  `        { code: "2005", name: "Unearned Revenue", type: "LIABILITY", subType: "Current", normalBalance: "CREDIT", ifrsMappingTag: "IFRS-15", category: "Current Liabilities", isControlAccount: false, isSystem: true },`,
  `        { code: "2007", name: "Sales Tax Payable", type: "LIABILITY", subType: "Current", normalBalance: "CREDIT", ifrsMappingTag: "IAS-37", category: "Current Liabilities", isControlAccount: false, isSystem: true },`,
  `        { code: "2008", name: "Purchase Tax Payable", type: "LIABILITY", subType: "Current", normalBalance: "CREDIT", ifrsMappingTag: "IAS-37", category: "Current Liabilities", isControlAccount: false, isSystem: true },`,
  `        { code: "2011", name: "VAT Payable", type: "LIABILITY", subType: "Current", normalBalance: "CREDIT", ifrsMappingTag: "IAS-37", category: "Current Liabilities", isControlAccount: false, isSystem: true },`,
  `        { code: "2015", name: "Accounts Payable - ZIG", type: "LIABILITY", subType: "Current", normalBalance: "CREDIT", ifrsMappingTag: "IFRS-9", category: "Current Liabilities", isControlAccount: true, isSystem: true },`,
  `        { code: "2016", name: "Customer Prepayment - ZIG", type: "LIABILITY", subType: "Current", normalBalance: "CREDIT", ifrsMappingTag: "IFRS-15", category: "Current Liabilities", isControlAccount: true, isSystem: true },`,
  `        { code: "2017", name: "Inter-Branch Clearing - ZIG", type: "LIABILITY", subType: "Current", normalBalance: "CREDIT", ifrsMappingTag: "IAS-1", category: "Current Liabilities", isControlAccount: true, isSystem: true },`,

  // Non-Current Liabilities
  `        { code: "2501", name: "Mortgages", type: "LIABILITY", subType: "Non-current", normalBalance: "CREDIT", ifrsMappingTag: "IFRS-9", category: "Non-current Liabilities", cashFlowCategory: "Financing", isControlAccount: false, isSystem: true },`,
  `        { code: "2502", name: "Bonds Payable", type: "LIABILITY", subType: "Non-current", normalBalance: "CREDIT", ifrsMappingTag: "IFRS-9", category: "Non-current Liabilities", cashFlowCategory: "Financing", isControlAccount: false, isSystem: true },`,

  // Equity
  `        { code: "3002", name: "Additional Paid-in Capital", type: "EQUITY", subType: "Finance", normalBalance: "CREDIT", ifrsMappingTag: "IAS-32", category: "Equity", cashFlowCategory: "Financing", isControlAccount: false, isSystem: true },`,
  `        { code: "3003", name: "Treasury Stock", type: "EQUITY", subType: "Finance", normalBalance: "DEBIT", ifrsMappingTag: "IAS-32", category: "Equity", cashFlowCategory: "Financing", isControlAccount: false, isSystem: true },`,
  `        { code: "3105", name: "Opening Balance Equity", type: "EQUITY", subType: "Operating", normalBalance: "CREDIT", ifrsMappingTag: "IAS-1", category: "Equity", isControlAccount: false, isSystem: true },`,

  // Revenue
  `        { code: "4001", name: "Service Revenue", type: "REVENUE", subType: "Operating", normalBalance: "CREDIT", ifrsMappingTag: "IFRS-15", category: "Revenue", isControlAccount: false, isSystem: true },`,
  `        { code: "4002", name: "Commission Income", type: "REVENUE", subType: "Operating", normalBalance: "CREDIT", ifrsMappingTag: "IFRS-15", category: "Revenue", isControlAccount: false, isSystem: true },`,
  `        { code: "4004", name: "Product Sales", type: "REVENUE", subType: "Operating", normalBalance: "CREDIT", ifrsMappingTag: "IFRS-15", category: "Revenue", isControlAccount: false, isSystem: true },`,
  `        { code: "4005", name: "Freight Revenue", type: "REVENUE", subType: "Operating", normalBalance: "CREDIT", ifrsMappingTag: "IFRS-15", category: "Revenue", isControlAccount: false, isSystem: true },`,
  `        { code: "4500", name: "Interest Income", type: "REVENUE", subType: "Operating", normalBalance: "CREDIT", ifrsMappingTag: "IFRS-9", category: "Other Income", isControlAccount: false, isSystem: true },`,
  `        { code: "4501", name: "Dividend Income", type: "REVENUE", subType: "Operating", normalBalance: "CREDIT", ifrsMappingTag: "IFRS-9", category: "Other Income", isControlAccount: false, isSystem: true },`,
  `        { code: "4503", name: "Investment Income", type: "REVENUE", subType: "Operating", normalBalance: "CREDIT", ifrsMappingTag: "IFRS-9", category: "Other Income", isControlAccount: false, isSystem: true },`,

  // Expenses
  `        { code: "5002", name: "Purchase Price Variance", type: "EXPENSE", subType: "Operating", normalBalance: "DEBIT", ifrsMappingTag: "IAS-2", category: "Cost of Sales", isControlAccount: false, isSystem: true },`,
  `        { code: "5003", name: "Administrative Expenses", type: "EXPENSE", subType: "Operating", normalBalance: "DEBIT", ifrsMappingTag: "IAS-1", category: "Operating Expenses", isControlAccount: false, isSystem: true },`,
  `        { code: "5007", name: "Insurance", type: "EXPENSE", subType: "Operating", normalBalance: "DEBIT", ifrsMappingTag: "IAS-1", category: "Operating Expenses", isControlAccount: false, isSystem: true },`,
  `        { code: "5008", name: "Marketing & Advertising", type: "EXPENSE", subType: "Operating", normalBalance: "DEBIT", ifrsMappingTag: "IAS-1", category: "Operating Expenses", isControlAccount: false, isSystem: true },`,
  `        { code: "5009", name: "Professional Services", type: "EXPENSE", subType: "Operating", normalBalance: "DEBIT", ifrsMappingTag: "IAS-1", category: "Operating Expenses", isControlAccount: false, isSystem: true },`,
  `        { code: "5010", name: "Freight & Shipping", type: "EXPENSE", subType: "Operating", normalBalance: "DEBIT", ifrsMappingTag: "IAS-2", category: "Operating Expenses", isControlAccount: false, isSystem: true },`,
  `        { code: "5011", name: "Office Supplies", type: "EXPENSE", subType: "Operating", normalBalance: "DEBIT", ifrsMappingTag: "IAS-1", category: "Operating Expenses", isControlAccount: false, isSystem: true },`,
  `        { code: "5012", name: "Travel & Entertainment", type: "EXPENSE", subType: "Operating", normalBalance: "DEBIT", ifrsMappingTag: "IAS-1", category: "Operating Expenses", isControlAccount: false, isSystem: true },`,
  `        { code: "5013", name: "Repairs & Maintenance", type: "EXPENSE", subType: "Operating", normalBalance: "DEBIT", ifrsMappingTag: "IAS-16", category: "Operating Expenses", isControlAccount: false, isSystem: true },`,
  `        { code: "5014", name: "Training & Development", type: "EXPENSE", subType: "Operating", normalBalance: "DEBIT", ifrsMappingTag: "IAS-1", category: "Operating Expenses", isControlAccount: false, isSystem: true },`,
  `        { code: "5015", name: "Research & Development", type: "EXPENSE", subType: "Operating", normalBalance: "DEBIT", ifrsMappingTag: "IAS-38", category: "Operating Expenses", isControlAccount: false, isSystem: true },`,
  `        { code: "5501", name: "Investment Losses", type: "EXPENSE", subType: "Finance", normalBalance: "DEBIT", ifrsMappingTag: "IFRS-9", category: "Finance Costs", isControlAccount: false, isSystem: true },`,
  `        { code: "5503", name: "Interest Expense", type: "EXPENSE", subType: "Finance", normalBalance: "DEBIT", ifrsMappingTag: "IFRS-9", category: "Finance Costs", isControlAccount: false, isSystem: true },`,
  `        { code: "5505", name: "Professional Fees", type: "EXPENSE", subType: "Finance", normalBalance: "DEBIT", ifrsMappingTag: "IAS-1", category: "Finance Costs", isControlAccount: false, isSystem: true },`
];

// Helper to inject elements before a specific pattern
function injectBefore(contentStr, pattern, elements) {
  const parts = contentStr.split(pattern);
  if (parts.length > 1) {
    return parts[0] + elements.join('\n') + '\n' + pattern + parts[1];
  }
  return contentStr;
}

// Group additions
const assetAdditions = additions.slice(0, 7);
const liabilityAdditions = additions.slice(7, 17);
const nonCurrentLiabAdditions = additions.slice(17, 19);
const equityAdditions = additions.slice(19, 22);
const revAdditions = additions.slice(22, 29);
const expAdditions = additions.slice(29);

content = injectBefore(content, '        { code: "1200", name: "Trade Receivables"', assetAdditions);
content = injectBefore(content, '        { code: "2100", name: "Accrued Expenses"', liabilityAdditions);
content = injectBefore(content, '        // --- EQUITY ---', nonCurrentLiabAdditions);
content = injectBefore(content, '        // --- REVENUE ---', equityAdditions);
content = injectBefore(content, '        { code: "4100", name: "Other Income"', revAdditions);
content = injectBefore(content, '        { code: "5100", name: "Operating Expenses"', expAdditions);

fs.writeFileSync(path, content, 'utf8');
console.log('Successfully patched server/storage.ts');
