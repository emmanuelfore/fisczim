import { db } from "./server/db";
import { accounts, taxTypes } from "./shared/schema";
import { eq, isNull } from "drizzle-orm";

async function copyAccounts() {
    try {
        const sourceId = 84;
        const targetId = 86;

        console.log(`Copying accounts from company ${sourceId} to ${targetId}...`);

        // 1. Fetch Tax Types mapping (by code)
        const sourceTaxTypes = await db.select().from(taxTypes).where(eq(taxTypes.companyId, sourceId));
        const targetTaxTypes = await db.select().from(taxTypes).where(eq(taxTypes.companyId, targetId));
        
        const taxTypeMap = new Map(); // old_id -> new_id
        for (const st of sourceTaxTypes) {
            const matchingTt = targetTaxTypes.find(tt => tt.code === st.code);
            if (matchingTt) {
                taxTypeMap.set(st.id, matchingTt.id);
            }
        }

        // 2. Fetch all accounts from source
        const allSourceAccounts = await db.select().from(accounts).where(eq(accounts.companyId, sourceId));
        console.log(`Found ${allSourceAccounts.length} accounts to copy.`);

        const accountMap = new Map(); // oldId -> newId

        // Copy in passes to resolve parentId
        let accountsToProcess = [...allSourceAccounts];
        let previousLength = -1;

        while (accountsToProcess.length > 0 && accountsToProcess.length !== previousLength) {
            previousLength = accountsToProcess.length;
            const remaining = [];

            for (const acc of accountsToProcess) {
                if (acc.parentId && !accountMap.has(acc.parentId)) {
                    // Parent not processed yet, defer
                    remaining.push(acc);
                    continue;
                }

                const { id, createdAt, defaultVatTypeId, defaultCostCenterId, defaultSegmentId, parentId, ...data } = acc;
                
                const newParentId = parentId ? accountMap.get(parentId) : null;
                const newVatTypeId = defaultVatTypeId ? taxTypeMap.get(defaultVatTypeId) : null;
                // defaultCostCenterId and defaultSegmentId are omitted/nullified for simplicity 
                // unless we also copy costCenters and accountingSegments.

                const [inserted] = await db.insert(accounts).values({
                    ...data,
                    companyId: targetId,
                    parentId: newParentId,
                    defaultVatTypeId: newVatTypeId,
                    defaultCostCenterId: null,
                    defaultSegmentId: null,
                }).returning();

                accountMap.set(id, inserted.id);
            }

            accountsToProcess = remaining;
        }

        if (accountsToProcess.length > 0) {
            console.warn(`${accountsToProcess.length} accounts could not be copied due to missing parents (circular reference or missing).`);
        }

        console.log(`Successfully copied ${accountMap.size} accounts.`);
    } catch (error) {
        console.error("Error during copy:", error);
    } finally {
        process.exit(0);
    }
}

copyAccounts();
