import { db } from "./server/db";
import { products } from "./shared/schema";
import { eq, and, isNull, or } from "drizzle-orm";

const COMPANY_ID = 91;

// Rabyon wholesale convention (matches the 972 existing WHOLESALE products):
//   owner_group = 'WHOLESALE', category = 'WHOLESALE',
//   tax_type_id = 177 (Standard rated 15.5%), tax_rate = '15.50'
const STANDARD_TAX_TYPE_ID = 177;
const STANDARD_TAX_RATE = "15.50";

interface Item {
  name: string;
  price: string;
  hsCode: string;
  match: (name: string, price: string) => boolean;
}

const items: Item[] = [
  {
    name: "CHAMPION SNAX",
    price: "2.50",
    hsCode: "21069090",
    match: (name, price) => /CHAMPION\s*SNAX/i.test(name) && price === "2.50",
  },
  {
    name: "BREAD WHOLESALE",
    price: "0.95",
    hsCode: "21069090",
    match: (name, price) => /^BREAD\s*$/i.test(name.trim()) && price === "0.95",
  },
  {
    name: "HI'LIFE 20X200G",
    price: "9.50",
    hsCode: "21069090",
    match: (name, price) => /LIFE/i.test(name) && /20X200G/i.test(name) && price === "9.50",
  },
  {
    name: "BRUTAL FRUIT LITCHE",
    price: "9.00",
    hsCode: "22089000",
    match: (name, price) => /BRUTAL\s*FRUIT/i.test(name) && price === "9.00",
  },
  {
    name: "FIZZI 12X750MLS",
    price: "5.00",
    hsCode: "22021000",
    match: (name, price) => /FIZZI/i.test(name) && /750/i.test(name) && price === "5.00",
  },
  {
    name: "ALOE TOOTH PASTE 12X100MLS",
    price: "3.50",
    hsCode: "21069090",
    match: (name, price) => /ALOE/i.test(name) && /TOOTH/i.test(name) && price === "3.50",
  },
  {
    name: "BAIT KILLERS 50S",
    price: "7.50",
    hsCode: "21069090",
    match: (name, price) => /BAIT\s*KILLERS/i.test(name) && price === "7.50",
  },
  {
    name: "VIGILANCE HAIR FOOD 12X50MLS",
    price: "3.50",
    hsCode: "21069090",
    match: (name, price) => /VIGILANCE/i.test(name) && /HAIR/i.test(name) && price === "3.50",
  },
  {
    name: "GLUE MOUSE BOARD",
    price: "0.50",
    hsCode: "21069090",
    match: (name, price) => /GLUE\s*MOUSE/i.test(name) && price === "0.50",
  },
];

async function run() {
  const companyProducts = await db.select({
    id: products.id,
    name: products.name,
    price: products.price,
    ownerGroup: products.ownerGroup,
    taxTypeId: products.taxTypeId,
  }).from(products).where(eq(products.companyId, COMPANY_ID));

  console.log(`Loaded ${companyProducts.length} products for company ${COMPANY_ID}`);

  const map: Record<string, number[]> = {};
  const skipped: { item: string; id: number; name: string }[] = [];

  for (const item of items) {
    const matches = companyProducts.filter(p => item.match(p.name, String(p.price)));
    map[item.name] = matches.map(p => p.id);

    // Only touch products that are NOT already set to the standard wholesale config.
    const alreadyCorrect = matches.filter(p =>
      p.ownerGroup === "WHOLESALE" && p.taxTypeId === STANDARD_TAX_TYPE_ID
    );
    for (const p of alreadyCorrect) {
      skipped.push({ item: item.name, id: p.id, name: p.name });
    }

    const toUpdate = matches.filter(p => !(p.ownerGroup === "WHOLESALE" && p.taxTypeId === STANDARD_TAX_TYPE_ID));

    for (const p of toUpdate) {
      await db.update(products)
        .set({
          ownerGroup: "WHOLESALE",
          category: "WHOLESALE",
          hsCode: item.hsCode,
          productType: "good",
          taxTypeId: STANDARD_TAX_TYPE_ID,
          taxRate: STANDARD_TAX_RATE,
          isTracked: true,
          isForSale: true,
          isActive: true,
        })
        .where(eq(products.id, p.id));
      console.log(`Updated #${p.id} ${p.name} (${item.name}) -> WHOLESALE / VAT ${STANDARD_TAX_RATE}%`);
    }
  }

  console.log("\nSummary:");
  for (const item of items) {
    console.log(`  ${item.name} $${item.price} -> matched ids: ${(map[item.name] || []).join(", ") || "NONE"}`);
  }

  if (skipped.length > 0) {
    console.log("\nAlready standard+wholesale (no change):");
    for (const s of skipped) console.log(`  #${s.id} ${s.name} (${s.item})`);
  }

  process.exit(0);
}

run().catch(e => {
  console.error(e);
  process.exit(1);
});