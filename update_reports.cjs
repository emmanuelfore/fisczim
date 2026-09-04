const fs = require('fs');
const path = require('path');

const storageFile = path.join(__dirname, 'server/storage.ts');
let content = fs.readFileSync(storageFile, 'utf8');

// Update Interface signatures
const interfaceRegex = /getReport([a-zA-Z0-9_]+)\(companyId: number, start: Date, end: Date\): Promise</g;
content = content.replace(interfaceRegex, 'getReport$1(companyId: number, start: Date, end: Date, branchId?: number): Promise<');

// Update method signatures
const methodRegex = /async getReport([a-zA-Z0-9_]+)\(companyId: number, start: Date, end: Date\) {/g;
content = content.replace(methodRegex, 'async getReport$1(companyId: number, start: Date, end: Date, branchId?: number) {');

// For getReport methods that use invoices
content = content.replace(/(async getReport[a-zA-Z0-9_]+\(companyId: number, start: Date, end: Date, branchId\?: number\) \{[\s\S]*?eq\(invoices\.companyId, companyId\),)/g, (match) => {
    return match + "\n        ...(branchId ? [eq(invoices.branchId, branchId)] : []),";
});

// For getReport methods that use expenses
content = content.replace(/(async getReport[a-zA-Z0-9_]+\(companyId: number, start: Date, end: Date, branchId\?: number\) \{[\s\S]*?eq\(expenses\.companyId, companyId\),)/g, (match) => {
    return match + "\n        ...(branchId ? [eq(expenses.branchId, branchId)] : []),";
});

// For getReport methods that use goodsDeliveryNotes or something else, we don't have many of those
// Wait, getReportBankCharges uses payments table? Let's check:
content = content.replace(/(async getReport[a-zA-Z0-9_]+\(companyId: number, start: Date, end: Date, branchId\?: number\) \{[\s\S]*?eq\(payments\.companyId, companyId\),)/g, (match) => {
    return match + "\n        ...(branchId ? [eq(payments.branchId, branchId)] : []),";
});

fs.writeFileSync(storageFile, content);
console.log('Updated storage.ts with branchId filtering for reports');
