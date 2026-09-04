const fs = require('fs');
const path = require('path');

const storageFile = path.join(__dirname, 'server/storage.ts');
let content = fs.readFileSync(storageFile, 'utf8');

// Update getJournalEntries signature and implementation
content = content.replace(/getJournalEntries\(companyId: number, dateFrom\?: Date, dateTo\?: Date\): Promise<any\[\]>;/g, 'getJournalEntries(companyId: number, dateFrom?: Date, dateTo?: Date, branchId?: number): Promise<any[]>;');
content = content.replace(/async getJournalEntries\(companyId: number, dateFrom\?: Date, dateTo\?: Date\): Promise<any\[\]> \{[\s\S]*?const filters: any\[\] = \[eq\(journalEntries.companyId, companyId\)\];/g, (match) => {
    return match.replace(/async getJournalEntries\(companyId: number, dateFrom\?: Date, dateTo\?: Date\)/, 'async getJournalEntries(companyId: number, dateFrom?: Date, dateTo?: Date, branchId?: number)') + "\n    if (branchId) filters.push(eq(journalEntries.branchId, branchId));";
});

// Update getLedgerEntries signature and implementation
content = content.replace(/getLedgerEntries\(companyId: number, accountId\?: number, dateFrom\?: Date, dateTo\?: Date\): Promise<any\[\]>;/g, 'getLedgerEntries(companyId: number, accountId?: number, dateFrom?: Date, dateTo?: Date, branchId?: number): Promise<any[]>;');
content = content.replace(/async getLedgerEntries\(companyId: number, accountId\?: number, dateFrom\?: Date, dateTo\?: Date\): Promise<any\[\]> \{[\s\S]*?const filters: any\[\] = \[eq\(accounts.companyId, companyId\)\];/g, (match) => {
    return match.replace(/async getLedgerEntries\(companyId: number, accountId\?: number, dateFrom\?: Date, dateTo\?: Date\)/, 'async getLedgerEntries(companyId: number, accountId?: number, dateFrom?: Date, dateTo?: Date, branchId?: number)') + "\n    if (branchId) filters.push(eq(journalEntries.branchId, branchId));";
});

// Update getTrialBalance signature and implementation
content = content.replace(/getTrialBalance\(companyId: number, date\?: Date\): Promise<any\[\]>;/g, 'getTrialBalance(companyId: number, date?: Date, branchId?: number): Promise<any[]>;');
content = content.replace(/async getTrialBalance\(companyId: number, date\?: Date\): Promise<any\[\]> \{[\s\S]*?const entriesFilters: any\[\] = \[\];/g, (match) => {
    return match.replace(/async getTrialBalance\(companyId: number, date\?: Date\)/, 'async getTrialBalance(companyId: number, date?: Date, branchId?: number)') + "\n    if (branchId) entriesFilters.push(eq(journalEntries.branchId, branchId));";
});

fs.writeFileSync(storageFile, content);
console.log('Updated storage.ts with branchId filtering for accounting');
