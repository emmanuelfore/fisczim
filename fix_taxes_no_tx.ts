import 'dotenv/config';
import { db } from './server/db';
import { taxTypes, products, invoiceItems } from './shared/schema';
import { storage } from './server/storage';
import { ZimraDevice } from './server/zimra';
import { getZimraLogger } from './server/lib/fiscalization';
import { eq, and, notInArray } from 'drizzle-orm';

async function run() {
  const companyId = 57;
  try {
    const company = await storage.getCompany(companyId);

    const baseUrl = company.zimraEnvironment === 'production' 
        ? 'https://fdmsapi.zimra.co.zw' 
        : 'https://fdmsapitest.zimra.co.zw';

    const device = new ZimraDevice({
        deviceId: company.fdmsDeviceId!,
        deviceSerialNo: company.fdmsDeviceSerialNo || "UNKNOWN",
        activationKey: company.fdmsApiKey || "",
        privateKey: company.zimraPrivateKey || undefined,
        certificate: company.zimraCertificate || undefined,
        baseUrl
    }, getZimraLogger(companyId));

    console.log("Fetching config from Zimra...");
    const config = await device.getConfig();
    const zimraTaxes = config.applicableTaxes || config.taxLevels || [];
    
    // 1. Get current taxes
    const current = await db.select().from(taxTypes).where(eq(taxTypes.companyId, companyId));
    
    // 2. Insert new Zimra taxes
    const newTaxMap = new Map();
    const insertedIds = [];
    
    for (const zTax of zimraTaxes) {
      const percent = zTax.taxPercent !== undefined ? zTax.taxPercent : 0;
      const taxRate = percent.toFixed(2);
      const code = zTax.taxCode ? `VAT-${zTax.taxCode}` : `VAT-${zTax.taxID}`;
      const name = zTax.taxName || `VAT ${percent}%`;
      const zimraCode = zTax.taxCode || (zTax.taxName?.substring(0,1).toUpperCase()) || 'V';
      
      const [created] = await db.insert(taxTypes).values({
        companyId,
        code,
        name,
        rate: taxRate,
        description: `ZIMRA Tax Level ${zTax.taxID} (${name})`,
        zimraTaxId: zTax.taxID.toString(),
        zimraCode,
        effectiveFrom: (zTax.validFrom || new Date().toISOString()).split('T')[0],
        isActive: true
      }).returning();
      
      newTaxMap.set(taxRate, created);
      insertedIds.push(created.id);
      console.log(`Inserted new tax: ${created.name} (${created.rate}%) id: ${created.id}`);
    }

    // 3. Remap products and invoiceItems
    for (const old of current) {
      if (insertedIds.includes(old.id)) continue;
      
      // find a replacement by rate
      let replacement = newTaxMap.get(old.rate);
      if (!replacement && parseFloat(old.rate) === 0) {
         replacement = Array.from(newTaxMap.values()).find(t => parseFloat(t.rate) === 0);
      }
      if (!replacement && parseFloat(old.rate) === 15) {
         replacement = Array.from(newTaxMap.values()).find(t => parseFloat(t.rate) === 15.5);
      }

      if (replacement) {
        console.log(`Remapping old tax ${old.name} (${old.id}) to new ${replacement.name} (${replacement.id})`);
        await db.update(products).set({ taxTypeId: replacement.id }).where(eq(products.taxTypeId, old.id));
        await db.update(invoiceItems).set({ taxTypeId: replacement.id }).where(eq(invoiceItems.taxTypeId, old.id));
      } else {
         console.log(`Warning: no replacement found for old tax ${old.name} (${old.rate}%)`);
      }
    }

    // 4. Delete old taxes
    for (const old of current) {
      if (insertedIds.includes(old.id)) continue;
      try {
        await db.delete(taxTypes).where(eq(taxTypes.id, old.id));
        console.log(`Deleted old tax ${old.id}`);
      } catch (e) {
        console.log(`Could not delete old tax ${old.id}, marking inactive`);
        await db.update(taxTypes).set({ isActive: false }).where(eq(taxTypes.id, old.id));
      }
    }

    console.log("Success.");
    process.exit(0);
  } catch(e) {
    console.error(e);
    process.exit(1);
  }
}
run();
