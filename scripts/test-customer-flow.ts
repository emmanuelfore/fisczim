import { config } from "dotenv";
config();
import { db } from "../server/db.js";
import { 
  companies, 
  customers, 
  products, 
  customerProducts, 
  quotations, 
  quotationItems,
  inventoryLocations,
  users
} from "../shared/schema.js";

async function main() {
  console.log("Starting Customer Flow Seed/Test Script...");

  try {
    // Ensure we have a company and user
    const [company] = await db.insert(companies).values({
      name: "Test Corp",
      address: "123 Test St",
      city: "Test City",
      phone: "1234567890",
      email: "test@corp.com"
    }).returning();

    const [location] = await db.insert(inventoryLocations).values({
      companyId: company.id,
      name: "Main Warehouse",
      type: "WAREHOUSE"
    }).returning();

    // Create a customer
    const [customer] = await db.insert(customers).values({
      companyId: company.id,
      name: "Exclusive Client A",
      email: "client@a.com"
    }).returning();

    // Create products
    const [exclusiveProduct] = await db.insert(products).values({
      companyId: company.id,
      name: "Custom Branded Packaging",
      price: "10.00",
    }).returning();

    const [generalProduct] = await db.insert(products).values({
      companyId: company.id,
      name: "Standard Packing Tape",
      price: "2.50",
    }).returning();

    // Link exclusive product
    await db.insert(customerProducts).values({
      companyId: company.id,
      customerId: customer.id,
      productId: exclusiveProduct.id,
      isExclusive: true,
      customerSku: "CLIENT-A-PACK-01"
    });

    // 1. Create a quotation for both products
    const [quote] = await db.insert(quotations).values({
      companyId: company.id,
      customerId: customer.id,
      quotationNumber: `QT-${Date.now()}`,
      subtotal: "150.00",
      taxAmount: "22.50",
      total: "172.50",
    }).returning();

    await db.insert(quotationItems).values([
      {
        quotationId: quote.id,
        productId: exclusiveProduct.id,
        description: "Custom Branded Packaging",
        quantity: "10",
        unitPrice: "10.00",
        taxRate: "15.00",
        lineTotal: "100.00",
      },
      {
        quotationId: quote.id,
        productId: generalProduct.id,
        description: "Standard Packing Tape",
        quantity: "20",
        unitPrice: "2.50",
        taxRate: "15.00",
        lineTotal: "50.00",
      }
    ]);

    console.log("Seeded basic entities and quotation. Use API to proceed through order, stock receipt, allocation, and invoicing.");

  } catch (err) {
    console.error("Error during seeding:", err);
  }
  
  process.exit(0);
}

main();
