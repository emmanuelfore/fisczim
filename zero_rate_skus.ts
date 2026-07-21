import { db } from "./server/db";
import { products } from "./shared/schema";
import { eq, inArray, or, ilike } from "drizzle-orm";

const skus = [
    "SKU00010", "SKU00016", "SKU00147", "SKU00150", "SKU00151", "SKU00152", "SKU00153", "SKU00174",
    "SKU00175", "SKU00176", "SKU00177", "SKU00184", "SKU00186", "SKU00190", "SKU00191", "SKU00217",
    "SKU00218", "SKU00220", "SKU00320", "SKU00341", "SKU00348", "SKU00374", "SKU00382", "SKU00396",
    "SKU00397", "SKU00398", "SKU00363", "SKU00424", "SKU00434", "SKU00428", "SKU00429", "SKU00431",
    "SKU00432", "SKU00435", "SKU00458", "SKU00463", "SKU00467", "SKU00468", "SKU00492", "SKU00533",
    "SKU00534", "SKU00539", "SKU00540", "SKU00546", "SKU00547", "SKU00553", "SKU00555", "SKU00885",
    "SKU00619", "SKU00622", "SKU00623", "SKU00676", "SKU00678", "SKU00681", "SKU00693", "SKU00778",
    "SKU00791", "SKU00799", "SKU00800", "SKU00801", "SKU00841", "SKU00842", "SKU00905", "SKU00944",
    "SKU00472", "SKU00590", "SKU00029", "SKU00072", "SKU00201", "SKU00203", "SKU00433", "SKU00884",
    "SKU00785", "SKU00071", "SKU00080", "SKU00089"
];

const extraNames = [
    "STERILISED MILK CASE", "SUGAR 2KG", "SUGAR 2KG CASE", "SUNNY ROLLER MEAL 10KG",
    "TAGUTA ROLLER MEAL 10KG", "WHITE SUGAR 2KG", "WHITE SUGAR CASE", "WSPUDS 25 X 30G",
    "ZIMGOLD MARGARINE TUB 12`S", "spuds 25x30g"
];

async function run() {
    try {
        console.log("Updating items to zero-rated for Rabyon...");

        let updated = 0;

        // 1. Update by SKUs
        const chunk = 20;
        for (let i = 0; i < skus.length; i += chunk) {
            const batch = skus.slice(i, i + chunk);
            const res = await db.update(products)
                .set({ taxRate: "0.00", taxTypeId: 175 })
                .where(
                    or(
                        inArray(products.sku, batch),
                        inArray(products.name, extraNames)
                    )
                );
        }

        // Just to be exhaustive, update by extraNames directly
        await db.update(products)
            .set({ taxRate: "0.00", taxTypeId: 175 })
            .where(
                inArray(products.name, extraNames)
            );

        console.log("Successfully set the provided items to zero-rated!");
    } catch (e) {
        console.error(e);
    } finally {
        process.exit(0);
    }
}

run();
