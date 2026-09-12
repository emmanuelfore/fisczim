import { db } from "./server/db";
import { products } from "./shared/schema";
import { eq } from "drizzle-orm";

const targetNames = [
    "10.56",
    "375ML COOKING OIL BOX",
    "BLUE BAND 500G",
    "BLUE RIBBON FLOUR",
    "BLUE RIBBON FLOUR 10 X 2KG",
    "BLUEBAND 12PACJK",
    "BLUEBAND 250G",
    "BREAD",
    "BREAD 10S",
    "BREAD 12S",
    "BREAD UNITS",
    "BROWN SUGAR CASE",
    "BUDGET SALT 10X1KG",
    "BUTTERCUP 24X250G",
    "BUTTERCUP 250G",
    "BUTTERCUP 500G",
    "BUTTERCUP TUB 24X500G",
    "CAFEMOL TABLETS BOX",
    "COLD CARE BOX",
    "COUGH DROPS",
    "CREAM-IT MILK 750G",
    "DAIRY GOLD MILK",
    "DENDAIRY 6 X 1L",
    "DLITE 2L",
    "DLITE 2L; BOX",
    "DLITE 375ML",
    "DLITE 750MLS",
    "EGGS",
    "EGGS CRATE",
    "EKONO RICE 10 x 1kg",
    "EKONO RICE 20x2KG",
    "EKONO RICE 5KG",
    "EKONO SALT 10 X 1KG",
    "EKONO SALT 1KG",
    "EVERGOLD MEALIEMEAL 10KG",
    "EVERYDAY POWDER MILK",
    "FARAI PADS",
    "FARAI PADS 6PACK",
    "FLOUR 1KG",
    "GLORIA FLOUR ALL PURPOSE",
    "GLORIA FLOUR CASE",
    "GOLD SALT",
    "GOLD SALT 10X1KG",
    "GOOD GOOD 20 X 250G",
    "GOOD GOOD FLOUR 10X2KG",
    "HALF BREAD",
    "HALF LOAF",
    "ICING SUGAR 10 X 500G",
    "KAPENTA 10 X 250G",
    "KAPENTA 20 50G",
    "KAPENTA 40 X 50G",
    "LIFE MILK 24 X 200ML",
    "LIFE MILK 6 X 1 LITRE",
    "LILY WHITE PADS",
    "LOVE EAT ROLLER MEAL 10KG",
    "MEALIE MEAL BULK",
    "MEGA SALT 10X 1KG",
    "MILKIT 250ML",
    "MILKIT BOX",
    "MILKIT PREPACK",
    "MR SALT 1KG",
    "MR SALT CASE",
    "PARADISE SALT 10X1KG",
    "PFUKO BUTTERMILK 500ML",
    "RAINBOW SALT 10 X 1KG",
    "RED SEAL SALT CASE",
    "REDSEAL SALT 10X 2KG",
    "REDSEAL SALT 1KG",
    "ROYAL ROLLER MEAL 10KG",
    "ROYAL SUN SALT 10X 1KG",
    "SANITARY PADS 6S",
    "SILO ROLLER MEAL 10KG",
    "SOFTCARE SANITARY PADS 6PACK",
    "SPUDS",
    "SPUDS 25X30G",
    "SPUDS BOX",
    "STERILISED MILK CASE",
    "SUGAR 2KG",
    "SUGAR 2KG CASE",
    "SUNNY ROLLER MEAL 10KG",
    "TAGUTA ROLLER MEAL 10KG",
    "WHITE SUGAR 2KG",
    "WHITE SUGAR CASE",
    "WSPUDS 25 X 30G",
    "ZIMGOLD MARGARINE TUB 12`S",
    "spuds 25x30g"
];

function normalize(str: string) {
    return str.toLowerCase().replace(/[^a-z0-9]/g, '');
}

async function run() {
    try {
        console.log(`Fuzzy matching ${targetNames.length} specific items to zero-rated for Rabyon (Company 91)...`);

        const normalizedTargets = targetNames.map(normalize);

        const allProducts = await db.select({
            id: products.id,
            name: products.name
        }).from(products)
        .where(eq(products.companyId, 91));

        const matchedProductIds = allProducts
            .filter(p => normalizedTargets.includes(normalize(p.name)))
            .map(p => p.id);

        if (matchedProductIds.length > 0) {
            let chunk = 20;
            for(let i = 0; i < matchedProductIds.length; i += chunk) {
                const ids = matchedProductIds.slice(i, i + chunk);
                await db.execute(
                    db.update(products)
                    .set({ taxRate: "0.00", taxTypeId: 175 })
                    .where(require("drizzle-orm").inArray(products.id, ids))
                );
            }
            console.log(`Successfully updated ${matchedProductIds.length} items to zero-rated.`);
        } else {
            console.log("No matching items found to update.");
        }
    } catch (e) {
        console.error(e);
    } finally {
        process.exit(0);
    }
}

run();
