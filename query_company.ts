import 'dotenv/config';
import { db } from './server/db.js';
import { companies } from './shared/schema.js';
import { eq } from 'drizzle-orm';

async function main() {
    const comp = await db.select({
        id: companies.id,
        name: companies.name,
        vatRegistered: companies.vatRegistered,
        vatEnabled: companies.vatEnabled
    }).from(companies).where(eq(companies.id, 57));
    console.log(comp);
    process.exit(0);
}
main();
