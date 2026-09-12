const fs = require('fs');
const path = require('path');

const routesFile = path.join(__dirname, 'server/routes.ts');
let content = fs.readFileSync(routesFile, 'utf8');

// Update getTrialBalance calls to pass branchId
// The problem is extracting branchId in these routes.
// We can use getBranchId(req).
content = content.replace(/(storage\.getTrialBalance\(companyId, [\w.]+(?:, [\w.]+)?)\)/g, (match, p1) => {
    // Usually it's storage.getTrialBalance(companyId, asOfDate)
    // We add getBranchId(req) as the 3rd argument if it's in a route
    // Wait, this is getting complicated because of variable scope.
    return match;
});

// Since the frontend is already appending `?branchId=...` for Trial Balance, P&L, etc, 
// let's look at `balance-sheet` and `trial-balance` routes.
// `trial-balance` route:
content = content.replace(/const lines = await storage\.getTrialBalance\(companyId, asOfDate\);/g, `const branchId = getBranchId(req);\n      const lines = await storage.getTrialBalance(companyId, asOfDate, branchId);`);

// `ledger` route:
content = content.replace(/const entries = await storage\.getLedgerEntries\(companyId, accId, dateFrom, dateTo\);/g, `const branchId = getBranchId(req);\n      const entries = await storage.getLedgerEntries(companyId, accId, dateFrom, dateTo, branchId);`);

// `journal` route:
content = content.replace(/const entries = await storage\.getJournalEntries\(companyId, dateFrom, dateTo\);/g, `const branchId = getBranchId(req);\n      const entries = await storage.getJournalEntries(companyId, dateFrom, dateTo, branchId);`);

// `audit-trail` route:
content = content.replace(/const entries = await storage\.getJournalEntries\(companyId\);/g, `const branchId = getBranchId(req);\n      const entries = await storage.getJournalEntries(companyId, undefined, undefined, branchId);`);

fs.writeFileSync(routesFile, content);
console.log('Updated routes.ts with branchId filtering for accounting endpoints');
