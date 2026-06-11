const fs = require('fs');
const path = require('path');

const filePath = '/home/emmanuel/Documents/PROJECTS/fisczim/server/lib/fiscalization.ts';
let content = fs.readFileSync(filePath, 'utf8');

// 1. Add ZimraPreflightError import
content = content.replace(
    /import \{ assertReceiptPreflight \} from "\.\/zimra-preflight\.js";/,
    `import { assertReceiptPreflight, ZimraPreflightError } from "./zimra-preflight.js";`
);

// 2. Wrap the try { await assertReceiptPreflight ... } inside the big try and move it out!
// Wait! It's better to just regex replace the "claimNextReceiptNumbers" section:

const claimRegex = /\/\/ Reuse existing numbers if present \(retry scenario\), otherwise atomically claim new ones\.[\s\S]*?vLog\(`\[Fiscalize\] Atomically claimed: GlobalNo=\$\{nextGlobalNo\}, Counter=\$\{nextReceiptCounter\}`\);\n        }/;


const replacementClaim = `// We defer physically claiming these numbers until AFTER preflight.
        // This ensures failing validating invoices do not burn numbers and cause out-of-sequence errors.
        let nextGlobalNo = (company.lastReceiptGlobalNo || 0) + 1;
        let nextReceiptCounter = (company.dailyReceiptCount || 0) + 1;`;

content = content.replace(claimRegex, replacementClaim);

// 3. Now move to line 591 to replace the assertReceiptPreflight logic AND put the real claim logic right below it
const preflightRegex = /        try \{\n            await assertReceiptPreflight\(\{[^]*?zimraConfig\n            \}\);\n\n            try \{\n                vTime\(\`\[ZIMRA\] submitReceipt-\$\{companyId\}-\$\{nextGlobalNo\}\`\);/;

const replacementPreflight = `        try {
            await assertReceiptPreflight({
                company: {
                    ...company,
                    ...fiscalConfig,
                    currentFiscalDayNo: receiptData.fiscalDayNo,
                    lastReceiptGlobalNo: receiptData.receiptGlobalNo,
                    dailyReceiptCount: receiptData.receiptCounter
                },
                invoice,
                receiptData,
                originalInvoice,
                zimraConfig
            });
        } catch (preflightErr: any) {
            if (preflightErr instanceof ZimraPreflightError) {
                const parsedValidationErrors = preflightErr.issues.map((issue: any) => ({
                    invoiceId: invoiceId,
                    errorCode: issue.code || 'PREFLIGHT',
                    errorMessage: issue.message,
                    errorColor: 'Red',
                    requiresPreviousReceipt: false
                }));
                try {
                    if (parsedValidationErrors.length > 0) {
                        await storage.createValidationErrors(parsedValidationErrors);
                        await storage.updateInvoice(invoiceId, { validationStatus: 'invalid', fdmsStatus: 'failed' });
                    }
                } catch (saveErr) {}
            }
            throw preflightErr; // Propagate preflight errors WITHOUT locking sequence numbers
        }

        // Now that preflight passed, we are ready to make the network request.
        // Claim the actual numbers atomically, or reuse valid locked ones.
        if (zimraSync) {
            nextGlobalNo = zimraSync.nextGlobalNo;
            nextReceiptCounter = zimraSync.nextReceiptCounter;
        } else if (invoice.receiptGlobalNo && invoice.receiptCounter && invoice.receiptGlobalNo === (company.lastReceiptGlobalNo || 0) + 1) {
            // ONLY reuse locked numbers if we are strictly the NEXT in sequence.
            // If the company has moved past us (e.g. other invoices succeeded), reusing stale numbers guarantees a ZIMRA rejection!
            nextGlobalNo = invoice.receiptGlobalNo;
            nextReceiptCounter = invoice.receiptCounter;
            vLog(\`[Fiscalize] Retry — safely reusing locked numbers: GlobalNo=\${nextGlobalNo}, Counter=\${nextReceiptCounter}\`);
        } else {
            // First attempt, or stale locked counter: claim a fresh valid pair!
            const claimed = await storage.claimNextReceiptNumbers(company.id, invoice.branchId || undefined);
            nextGlobalNo = claimed.receiptGlobalNo;
            nextReceiptCounter = claimed.receiptCounter;
            vLog(\`[Fiscalize] Atomically claimed fresh numbers: GlobalNo=\${nextGlobalNo}, Counter=\${nextReceiptCounter}\`);
        }

        // Update receiptData with the REAL assigned numbers
        receiptData.receiptCounter = nextReceiptCounter;
        receiptData.receiptGlobalNo = nextGlobalNo;

        // Note: The signature generation inside submitReceipt relies on these final counters!
        
        try {
            try {
                vTime(\`[ZIMRA] submitReceipt-\${companyId}-\${nextGlobalNo}\`);`;

content = content.replace(preflightRegex, replacementPreflight);

// Let's add ZimraPreflightError import in zimra-preflight if not exported? It is already exported.

fs.writeFileSync(filePath, content);
console.log('Modified fiscalization.ts');
