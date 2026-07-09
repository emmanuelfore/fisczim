import { db } from '../server/db.js';
import { taxTypes } from '../shared/schema.js';
import { inArray } from 'drizzle-orm';

async function fix() {
    console.log("Reactivating tax types...");
    const res = await db.update(taxTypes)
        .set({ isActive: true })
        .where(inArray(taxTypes.code, ['NON', 'EXE', 'NON-VAT', 'VAT']))
        .returning();
    console.log(`Reactivated ${res.length} tax types`);
    process.exit(0);
}

fix().catch(err => {
    console.error(err);
    process.exit(1);
});
