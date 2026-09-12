import 'dotenv/config';
import xlsx from 'xlsx';
import { db } from './server/db';
import { customers } from './shared/schema';
import { eq, and } from 'drizzle-orm';

const COMPANY_ID = 87;

async function main() {
    console.log(`Starting import for company ${COMPANY_ID}...`);
    const workbook = xlsx.readFile('/home/emmanuel/Downloads/DEBTORS MANAGEMENT (1) (1).xlsx');
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const data = xlsx.utils.sheet_to_json(sheet);

    // Skip the first row as it contains the actual headers like 'Customer Name', 'Balance', etc.
    const rows = data.slice(1);

    const customersMap = new Map<string, any>();

    for (const row of rows as any[]) {
        const name = (row['Debtors management'] || '').toString().trim();
        if (!name) continue;

        const balance = parseFloat(row['__EMPTY_10']) || 0;
        const phone = row['__EMPTY_11'] ? row['__EMPTY_11'].toString() : null;
        
        let formattedPhone = phone;
        if (formattedPhone && !formattedPhone.startsWith('0') && !formattedPhone.startsWith('+')) {
            formattedPhone = '0' + formattedPhone;
        }

        if (customersMap.has(name)) {
            const existing = customersMap.get(name);
            existing.balance += balance;
            if (!existing.phone && formattedPhone) {
                existing.phone = formattedPhone;
            }
        } else {
            customersMap.set(name, {
                name,
                balance,
                phone: formattedPhone
            });
        }
    }

    const uniqueCustomers = Array.from(customersMap.values());
    console.log(`Found ${uniqueCustomers.length} unique customers in the spreadsheet.`);

    let inserted = 0;
    let updated = 0;

    for (const c of uniqueCustomers) {
        // Check if customer exists
        const existing = await db.select().from(customers).where(
            and(
                eq(customers.companyId, COMPANY_ID),
                eq(customers.name, c.name)
            )
        );

        if (existing.length > 0) {
            // Update
            const customerId = existing[0].id;
            await db.update(customers)
                .set({
                    openingBalance: c.balance.toFixed(2),
                    phone: existing[0].phone || c.phone, // Don't overwrite existing phone if not null
                })
                .where(eq(customers.id, customerId));
            updated++;
        } else {
            // Insert
            await db.insert(customers).values({
                companyId: COMPANY_ID,
                name: c.name,
                openingBalance: c.balance.toFixed(2),
                phone: c.phone,
                customerType: 'business',
                currency: 'USD',
                isActive: true,
            });
            inserted++;
        }
    }

    console.log(`Import complete! Inserted: ${inserted}, Updated: ${updated}`);
    process.exit(0);
}

main().catch(console.error);
