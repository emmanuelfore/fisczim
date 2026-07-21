import { eq, ilike, or } from "drizzle-orm";
import { db } from "../server/db";
import { companies, companyUsers, products, users } from "../shared/schema";
import { DatabaseStorage } from "../server/storage";
import "dotenv/config";

async function main() {
    const storage = new DatabaseStorage();
    const appolloCompanyId = 87;

    // 1. Get an admin user to be the creator
    const [adminUser] = await db.select().from(users).where(eq(users.email, "justin@appollos.co.zw"));
    if (!adminUser) throw new Error("Admin user not found");

    console.log("Creating Platchem Corporation Private Limited...");
    const newCompany = await storage.createCompany({
        name: "Platchem Corporation Private Limited",
        address: "185 Lorely Close",
        city: "Harare", // Default
        country: "Zimbabwe",
        phone: "N/A",
        email: "info@platchem.co.zw", // Default placeholder
        currency: "USD",
        superadminVisible: true
    } as any, adminUser.id);
    
    console.log(`Created new company with ID: ${newCompany.id}`);

    // 2. Link all users from company 87 to the new company
    console.log("Fetching users from company 87...");
    const currentUsers = await db.select().from(companyUsers).where(eq(companyUsers.companyId, appolloCompanyId));
    
    console.log(`Linking ${currentUsers.length} users to company ${newCompany.id}...`);
    for (const cu of currentUsers) {
        if (cu.userId === adminUser.id) continue; // Already added by createCompany as owner

        await db.insert(companyUsers).values({
            userId: cu.userId,
            companyId: newCompany.id,
            role: cu.role,
            companyRoleId: cu.companyRoleId,
            accessRoleId: cu.accessRoleId
        });
        console.log(`- Linked user ID ${cu.userId} with role ${cu.role}`);
    }

    // 3. Copy products related to petroleum/jelly
    console.log("Copying petroleum jelly products...");
    const petroProducts = await db.select().from(products)
        .where(
            or(
                ilike(products.name, "%petroleum%"),
                ilike(products.name, "%jelly%")
            )
        );
        
    const filteredProducts = petroProducts.filter(p => p.companyId === appolloCompanyId);
    
    for (const p of filteredProducts) {
        // Prepare new product object, stripping old ID and timestamps
        const { id, createdAt, companyId, ...productData } = p;
        
        // Nullify company-specific relations like tax types if they exist, to avoid FK issues
        // They can be set manually later by the user if needed
        const newProductData = {
            ...productData,
            companyId: newCompany.id,
            taxTypeId: null, 
            taxCategoryId: null,
            stockLevel: "0.00" // Reset stock
        };

        const [newProduct] = await db.insert(products).values(newProductData as any).returning();
        console.log(`- Copied product: ${newProduct.name} (New ID: ${newProduct.id})`);
    }

    console.log("Migration complete.");
    process.exit(0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
