import 'dotenv/config';
import { db } from './server/db.js';
import { companies } from './shared/schema.js';
import { eq } from 'drizzle-orm';

async function main() {
    await db.update(companies).set({ vatEnabled: true }).where(eq(companies.id, 57));
    console.log('VAT enabled for company 57');
    process.exit(0);
}
main();
