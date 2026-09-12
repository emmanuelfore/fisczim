import { db } from "./server/db";
import { 
    taxTypes, taxCategories, productCategories, products, branches 
} from "./shared/schema";
import { eq } from "drizzle-orm";

async function copyCompanyData(sourceId: number, targetId: number) {
    try {
        console.log(`Copying data from company ${sourceId} to ${targetId}...`);

        // 1. Copy Tax Types
        const sourceTaxTypes = await db.select().from(taxTypes).where(eq(taxTypes.companyId, sourceId));
        const taxTypeMap = new Map(); // oldId -> newId
        for (const tt of sourceTaxTypes) {
            const { id, ...data } = tt;
            const [inserted] = await db.insert(taxTypes).values({ ...data, companyId: targetId }).returning();
            taxTypeMap.set(id, inserted.id);
        }
        console.log(`Copied ${sourceTaxTypes.length} tax types.`);

        // 2. Copy Tax Categories
        const sourceTaxCategories = await db.select().from(taxCategories).where(eq(taxCategories.companyId, sourceId));
        const taxCatMap = new Map();
        for (const tc of sourceTaxCategories) {
            const { id, defaultTaxTypeId, ...data } = tc;
            const newDefaultId = defaultTaxTypeId ? taxTypeMap.get(defaultTaxTypeId) : null;
            const [inserted] = await db.insert(taxCategories).values({ ...data, defaultTaxTypeId: newDefaultId, companyId: targetId }).returning();
            taxCatMap.set(id, inserted.id);
        }
        console.log(`Copied ${sourceTaxCategories.length} tax categories.`);

        // 3. Copy Product Categories
        const sourceProdCategories = await db.select().from(productCategories).where(eq(productCategories.companyId, sourceId));
        for (const pc of sourceProdCategories) {
            const { id, createdAt, ...data } = pc;
            await db.insert(productCategories).values({ ...data, companyId: targetId });
        }
        console.log(`Copied ${sourceProdCategories.length} product categories.`);

        // 4. Copy Products
        const sourceProducts = await db.select().from(products).where(eq(products.companyId, sourceId));
        for (const p of sourceProducts) {
            const { id, createdAt, taxTypeId, taxCategoryId, ...data } = p;
            const newTaxTypeId = taxTypeId ? taxTypeMap.get(taxTypeId) : null;
            const newTaxCategoryId = taxCategoryId ? taxCatMap.get(taxCategoryId) : null;
            await db.insert(products).values({ 
                ...data, 
                taxTypeId: newTaxTypeId, 
                taxCategoryId: newTaxCategoryId, 
                companyId: targetId 
            });
        }
        console.log(`Copied ${sourceProducts.length} products.`);

        // 5. Copy Branches
        const sourceBranches = await db.select().from(branches).where(eq(branches.companyId, sourceId));
        for (const b of sourceBranches) {
            const { id, createdAt, ...data } = b;
            await db.insert(branches).values({ ...data, companyId: targetId });
        }
        console.log(`Copied ${sourceBranches.length} branches.`);

        console.log("Copy completed successfully!");
    } catch (error) {
        console.error("Error during copy:", error);
    } finally {
        process.exit(0);
    }
}

copyCompanyData(84, 86);
