import { db } from "./server/db";
import { products } from "./shared/schema";
import { eq, inArray } from "drizzle-orm";

const rules = [
    // Books & Stationery
    { regex: /book|pen|pencil|paper|ruler|eraser|quire|pgs|pages|counter/i, category: "Stationery", hsCode: "4820.20.00" },
    // Soft Drinks / Beverages
    { regex: /coke|7up|pepsi|sprite|fanta|fizzi|juice|citro|minute maid|drink|amasip/i, category: "Beverages - Non-Alcoholic", hsCode: "2202.10.00" },
    // Mineral Water
    { regex: /water|acquaclear/i, category: "Beverages - Non-Alcoholic", hsCode: "2201.10.00" },
    // Alcoholic Beverages
    { regex: /wine|whisky|gin|brandy|beer|stout|cider|brutal fruit|4th street|amarula|black label/i, category: "Beverages - Alcoholic", hsCode: "2208.90.00" },
    // Toiletries & Cosmetics
    { regex: /lotion|cream|hair|soap|colgate|tooth|pad|tissue|roll on|spray|axe|dax/i, category: "Toiletries & Cosmetics", hsCode: "3304.99.00" },
    // Cleaning & Detergents
    { regex: /dishwasher|harpic|jik|aloha|maq|boom|cleaner|polish|scourer/i, category: "Cleaning & Detergents", hsCode: "3402.20.00" },
    // Snacks, Biscuits, Sweets
    { regex: /biscuit|cookie|cream|pop|candy|sweet|gum|sherbet|cornado|choc|toffee/i, category: "Snacks & Sweets", hsCode: "1905.90.00" },
    // Groceries (Oils, Sugar, Flour, Mealie Meal, Pasta)
    { regex: /oil/i, category: "Groceries - Staples", hsCode: "1512.19.00" },
    { regex: /sugar/i, category: "Groceries - Staples", hsCode: "1701.99.00" },
    { regex: /flour/i, category: "Groceries - Staples", hsCode: "1101.00.00" },
    { regex: /mealie meal|maize/i, category: "Groceries - Staples", hsCode: "1102.20.00" },
    { regex: /macaroni|spaghetti|noodles/i, category: "Groceries - Pasta", hsCode: "1902.19.00" },
    { regex: /chunks/i, category: "Groceries - Proteins", hsCode: "2106.90.90" },
    { regex: /matemba|kapenta/i, category: "Groceries - Proteins", hsCode: "0305.59.00" },
    { regex: /soup|usavi|spice|curry|sauce|salt/i, category: "Groceries - Condiments", hsCode: "2103.90.00" },
    // Fruits & Veggies
    { regex: /apple/i, category: "Fruits & Vegetables", hsCode: "0808.10.00" },
    { regex: /lemon/i, category: "Fruits & Vegetables", hsCode: "0805.50.00" },
    { regex: /tomato/i, category: "Fruits & Vegetables", hsCode: "0702.00.00" },
    { regex: /banana/i, category: "Fruits & Vegetables", hsCode: "0803.90.00" },
    { regex: /yeast|baking powder/i, category: "Baking Supplies", hsCode: "2102.10.00" },
    { regex: /match/i, category: "Hardware & Misc", hsCode: "3605.00.00" },
    { regex: /razor|blade/i, category: "Hardware & Misc", hsCode: "8212.10.00" },
    { regex: /needle/i, category: "Hardware & Misc", hsCode: "7319.90.00" },
];

async function run() {
    try {
        const companyProducts = await db.select({
            id: products.id,
            name: products.name,
            category: products.category,
            productType: products.productType,
            hsCode: products.hsCode
        }).from(products).where(eq(products.companyId, 91));
        
        console.log(`Found ${companyProducts.length} products for Rabyon Investments`);

        let updatedCount = 0;
        
        for (const product of companyProducts) {
            let matchedCategory = "General Groceries";
            let matchedHsCode = "2106.90.90"; // default food prep

            for (const rule of rules) {
                if (rule.regex.test(product.name)) {
                    matchedCategory = rule.category;
                    matchedHsCode = rule.hsCode;
                    break;
                }
            }

            // Test products
            if (product.name.startsWith("TEST")) continue;

            await db.update(products)
                .set({
                    category: matchedCategory,
                    hsCode: matchedHsCode,
                    productType: "good"
                })
                .where(eq(products.id, product.id));
                
            updatedCount++;
            console.log(`Updated ${product.name} -> ${matchedCategory} / ${matchedHsCode} / good`);
        }
        
        console.log(`Successfully updated ${updatedCount} products.`);
    } catch (e) {
        console.error(e);
    } finally {
        process.exit(0);
    }
}

run();
