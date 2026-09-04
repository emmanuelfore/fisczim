const fs = require('fs');
const path = require('path');

const routesFile = path.join(__dirname, 'server/routes.ts');
let content = fs.readFileSync(routesFile, 'utf8');

// The dashboard alerts route:
content = content.replace(/const tb = await storage\.getTrialBalance\(companyId, new Date\(\)\);/g, `const branchId = getBranchId(req);\n      const tb = await storage.getTrialBalance(companyId, new Date(), branchId);`);

// The dashboard route:
content = content.replace(/storage\.getTrialBalance\(companyId, today\),/g, `storage.getTrialBalance(companyId, today, getBranchId(req)),`);
content = content.replace(/const totalDebit = \(await storage\.getTrialBalance\(companyId, today\)\)\.reduce/g, `const totalDebit = (await storage.getTrialBalance(companyId, today, getBranchId(req))).reduce`);
content = content.replace(/const totalCredit = \(await storage\.getTrialBalance\(companyId, today\)\)\.reduce/g, `const totalCredit = (await storage.getTrialBalance(companyId, today, getBranchId(req))).reduce`);

// Ensure balance-sheet uses getBranchId(req) instead of req.query.branchId
content = content.replace(/const branchId = req\.query\.branchId \? Number\(req\.query\.branchId\) : undefined;/g, `const branchId = getBranchId(req);`);

fs.writeFileSync(routesFile, content);
console.log('Updated remaining routes.ts with branchId filtering');
