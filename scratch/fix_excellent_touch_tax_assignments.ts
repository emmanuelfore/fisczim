import { db } from "../server/db.js";
import { taxTypes, products } from "../shared/schema.js";
import { eq, and } from "drizzle-orm";

// ZIMRA standard tax IDs:
// 1 = Exempt (0%)
// 2 = Zero Rated (0%)
// 3 = Standard (15.5%)
// 514 = Withholding Tax (5%) -- device-specific

async function main() {
  const companyId = 114;

  // Show current state
  const current = await db.select().from(taxTypes).where(eq(taxTypes.companyId, companyId));
  console.log("\n📋 Current tax types:");
  for (const t of current) {
    console.log(`  [id=${t.id}] "${t.name}" rate=${t.rate} zimraTaxId=${t.zimraTaxId} code=${t.code}`);
  }

  // Fix: correct the zimraTaxId mapping
  // Standard 15.5% should have zimraTaxId=3 (or device-specific, keep 515 if that's what device returned)
  // Exempt 0% should have zimraTaxId=1
  // Zero rated 0% should have zimraTaxId=2
  // The issue the user described: taxes not showing - this is about the dropdown display,
  // which pulls from tax_types table. Let's check if they show correctly in the API.

  // Check products tax assignments
  const productTaxes = await db.select({
    id: products.id,
    name: products.name,
    taxTypeId: products.taxTypeId,
    taxRate: products.taxRate,
  }).from(products).where(eq(products.companyId, companyId));

  console.log(`\n🛍️ Products (${productTaxes.length} total):`);
  const noTax = productTaxes.filter(p => !p.taxTypeId);
  const withTax = productTaxes.filter(p => p.taxTypeId);
  console.log(`  With taxTypeId: ${withTax.length}`);
  console.log(`  Missing taxTypeId: ${noTax.length}`);

  if (noTax.length > 0) {
    console.log("\n⚠️  Products missing taxTypeId:");
    for (const p of noTax.slice(0, 10)) {
      console.log(`    [${p.id}] ${p.name} | taxRate=${p.taxRate}`);
    }
    if (noTax.length > 10) console.log(`    ... and ${noTax.length - 10} more`);
  }

  // Find standard rate tax (15.5%)
  const standardTax = current.find(t => parseFloat(t.rate) >= 15);
  const zeroTax = current.find(t => parseFloat(t.rate) === 0 && t.zimraTaxId === '2');
  const exemptTax = current.find(t => parseFloat(t.rate) === 0 && t.zimraTaxId !== '2');

  console.log(`\n✅ Standard tax (15.5%): id=${standardTax?.id} "${standardTax?.name}"`);
  console.log(`✅ Zero rated (0%):      id=${zeroTax?.id} "${zeroTax?.name}"`);
  console.log(`✅ Exempt (0%):          id=${exemptTax?.id} "${exemptTax?.name}"`);

  // Fix products with missing taxTypeId — assign standard rate (15.5%) as default
  if (noTax.length > 0 && standardTax) {
    console.log(`\n🔧 Assigning standard tax (id=${standardTax.id}) to ${noTax.length} products with no taxTypeId...`);
    const noTaxIds = noTax.map(p => p.id);
    
    for (const productId of noTaxIds) {
      await db.update(products).set({ taxTypeId: standardTax.id }).where(
        and(eq(products.id, productId), eq(products.companyId, companyId))
      );
    }
    console.log(`  ✅ Done`);
  } else if (noTax.length > 0) {
    console.log(`\n❌ No standard tax found to assign to products`);
  } else {
    console.log(`\n✅ All products already have a taxTypeId assigned`);
  }

  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
