import 'dotenv/config';
import { db } from './server/db.js';
import { companies } from './shared/schema.js';
import { eq } from 'drizzle-orm';
import { ZimraDevice } from './server/zimra.js';

async function main() {
    const comp = await db.query.companies.findFirst({
        where: eq(companies.id, 57)
    });
    console.log('Environment:', comp?.zimraEnvironment);
    process.exit(0);
}
main();
