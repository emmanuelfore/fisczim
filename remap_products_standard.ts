import 'dotenv/config';
import { db } from './server/db';
import { taxTypes, products } from './shared/schema';
import { eq, and, ilike } from 'drizzle-orm';

async function run() {
  const companyId = 57;
  try {
    // Find the standard tax type for company 57
    const standardTaxes = await db.select().from(taxTypes).where(
      and(
        eq(taxTypes.companyId, companyId),
        ilike(taxTypes.name, '%standard%')
      )
    );

    if (standardTaxes.length === 0) {
      console.log("No standard tax found for company 57.");
      process.exit(1);
    }

    const standardTaxId = standardTaxes[0].id;
    console.log(`Found standard tax: ${standardTaxes[0].name} with ID ${standardTaxId}`);

    // Update all products for company 57 to use this standard tax
    const updated = await db.update(products)
      .set({ taxTypeId: standardTaxId })
      .where(eq(products.companyId, companyId))
      .returning({ id: products.id });

    console.log(`Updated ${updated.length} products to use standard tax type ${standardTaxId}.`);
    process.exit(0);
  } catch(e) {
    console.error(e);
    process.exit(1);
  }
}
run();
