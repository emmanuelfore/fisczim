import { db, pool } from "../server/db.js";
import * as schema from "../shared/schema.js";

const SAMPLE_PRODUCTS = [
    {
        name: "HP Laptop 15-inch",
        description: "Intel i5, 8GB RAM, 256GB SSD",
        sku: "HW-LAP-001",
        price: "650.00",
        costPrice: "500.00",
        taxRate: "15.00",
        productType: "good",
        stockLevel: "50",
        isTracked: true,
        hsCode: "8471.30"
    },
    {
        name: "Wireless Mouse",
        description: "Logitech Wireless Mouse M185",
        sku: "HW-ACC-002",
        price: "25.00",
        costPrice: "15.00",
        taxRate: "15.00",
        productType: "good",
        stockLevel: "100",
        isTracked: true,
        hsCode: "8471.60"
    },
    {
        name: "A4 Paper Ream",
        description: "Typek A4 Bond Paper Box (5 Reams)",
        sku: "STAT-PAP-001",
        price: "35.00",
        costPrice: "28.00",
        taxRate: "15.00",
        productType: "good",
        stockLevel: "200",
        isTracked: true,
        hsCode: "4802.56"
    },
    {
        name: "Solar Panel 400W",
        description: "Monocrystalline Solar Panel",
        sku: "NRG-SOL-400",
        price: "180.00",
        costPrice: "130.00",
        taxRate: "15.00",
        productType: "good",
        stockLevel: "20",
        isTracked: true,
        hsCode: "8541.40"
    },
    {
        name: "Inverter 5kVA",
        description: "Hybrid Solar Inverter 48V",
        sku: "NRG-INV-005",
        price: "850.00",
        costPrice: "600.00",
        taxRate: "15.00",
        productType: "good",
        stockLevel: "10",
        isTracked: true,
        hsCode: "8504.40"
    }
];

const SAMPLE_SERVICES = [
    {
        name: "IT Consultation",
        description: "Hourly consulting rate for IT support",
        sku: "SVC-IT-001",
        price: "50.00",
        taxRate: "15.00",
        productType: "service"
    },
    {
        name: "Software Installation",
        description: "Basic software setup and configuration",
        sku: "SVC-IT-002",
        price: "30.00",
        taxRate: "15.00",
        productType: "service"
    },
    {
        name: "Delivery Fee - Harare",
        description: "Standard delivery within Harare",
        sku: "SVC-DEL-HRE",
        price: "10.00",
        taxRate: "15.00",
        productType: "service"
    },
    {
        name: "Annual Maintenance Contract",
        description: "Yearly support and maintenance fee",
        sku: "SVC-AMC-001",
        price: "1200.00",
        taxRate: "15.00",
        productType: "service"
    }
];

async function run() {
    console.log("Seeding products for Demo Company...");
    try {
        const companiesRes = await db.select().from(schema.companies);
        const demoCompanies = companiesRes.filter(c => c.name.toLowerCase().includes('demo company'));
        
        if (demoCompanies.length === 0) {
            console.error("No Demo Company found.");
            return;
        }

        for (const company of demoCompanies) {
            console.log(`Seeding for ${company.name} (ID: ${company.id})...`);
            
            for (const prod of SAMPLE_PRODUCTS) {
                const existing = await db.query.products.findFirst({
                    where: (p, { eq, and }) => and(eq(p.companyId, company.id), eq(p.sku, prod.sku))
                });
                
                if (!existing) {
                    await db.insert(schema.products).values({
                        ...prod,
                        companyId: company.id
                    });
                    console.log(` + Added product: ${prod.name}`);
                } else {
                    console.log(` . Skipped product: ${prod.name}`);
                }
            }
            
            for (const svc of SAMPLE_SERVICES) {
                const existing = await db.query.products.findFirst({
                    where: (p, { eq, and }) => and(eq(p.companyId, company.id), eq(p.sku, svc.sku))
                });
                
                if (!existing) {
                    await db.insert(schema.products).values({
                        ...svc,
                        companyId: company.id
                    });
                    console.log(` + Added service: ${svc.name}`);
                } else {
                    console.log(` . Skipped service: ${svc.name}`);
                }
            }
        }
        
        console.log("Done.");
    } catch (e) {
        console.error(e);
    } finally {
        await pool.end();
        process.exit(0);
    }
}
run();
