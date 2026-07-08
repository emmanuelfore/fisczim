
import { storage } from "../storage";
import { type Product } from "../../shared/schema";

// Snapshot from LIPVIEW INVESTMENTS (ID: 8) - Taken 2026-02-08
const DEFAULT_TAX_TYPES = [
    {
        "code": "NON",
        "name": "ZERO RATED",
        "description": "",
        "rate": "0.00",
        "is_active": true,
        "effective_from": "2026-02-07",
        "effective_to": null,
        "zimra_code": "N",
        "calculation_method": "INCLUSIVE",
        "zimra_tax_id": "2",
    },
    {
        "code": "EXE",
        "name": "EXEMPT",
        "description": "",
        "rate": "0.00",
        "is_active": true,
        "effective_from": "2026-02-07",
        "effective_to": null,
        "zimra_code": "E",
        "calculation_method": "INCLUSIVE",
        "zimra_tax_id": "1",
    },
    {
        "code": "VAT",
        "name": "VAT",
        "description": "",
        "rate": "15.50",
        "is_active": true,
        "effective_from": "2026-02-07",
        "effective_to": null,
        "zimra_code": "V",
        "calculation_method": "INCLUSIVE",
        "zimra_tax_id": "517",
    },
    {
        "code": "NON-VAT",
        "name": "NON VAT",
        "description": "",
        "rate": "0.00",
        "is_active": true,
        "effective_from": "2026-02-07",
        "effective_to": null,
        "zimra_code": "N",
        "calculation_method": "INCLUSIVE",
        "zimra_tax_id": "3",
    }
];

const DEFAULT_PRODUCTS = [
    {
        "name": "TEST VATABLE",
        "description": "",
        "sku": "PRO-VAT",
        "hsCode": "99001000",
        "price": "10.00",
        "taxRate": "15.50",
        "isActive": true,
        "productType": "good",
        "taxCode": "VAT", // Links to taxTypes via code
        "forVatCompanies": true
    },
    {
        "name": "TEST ZERO RATED",
        "description": "",
        "sku": "PRO-NON",
        "hsCode": "99002000",
        "price": "20.00",
        "taxRate": "0.00",
        "isActive": true,
        "productType": "good",
        "taxCode": "NON",
        "forVatCompanies": true
    },
    {
        "name": "TEST EXEMPT",
        "description": "",
        "sku": "PRO-EXE",
        "hsCode": "99003000",
        "price": "45.00",
        "taxRate": "0.00",
        "isActive": true,
        "productType": "good",
        "taxCode": "EXE",
        "forVatCompanies": true
    },
    {
        "name": "TEST NON VATABLE",
        "description": "Product for non-VAT registered companies",
        "sku": "PRO-NON-VAT",
        "hsCode": "99004000",
        "price": "15.00",
        "taxRate": "0.00",
        "isActive": true,
        "productType": "good",
        "taxCode": "NON-VAT", // Needs to match one of the default tax types
        "forVatCompanies": false
    }
];

const DEFAULT_CUSTOMERS = [
    {
        name: "TEST CUSTOMER",
        email: "test@gmail.com",
        phone: "+263783341752",
        tin: "2000000000",
        vatNumber: "220000000",
        customerType: "business",
        currency: "USD",
        address: "1 Test Address Road\nHarare"
    }
];

export async function seedCompanyDefaults(companyId: number) {
    try {
        console.log(`[SEED] Starting seed for company ${companyId}`);

        // Get company to check VAT registration status
        const company = await storage.getCompany(companyId);
        const explicitlyNotVatRegistered = company?.vatRegistered === false || company?.vatEnabled === false;

        // 1. Tax Types
        const taxTypesMap = new Map<string, { id: number, rate: number }>(); // Code -> { ID, Rate }

        for (const tax of DEFAULT_TAX_TYPES) {
            // Check if exists
            const existing = await storage.getTaxTypes(companyId);
            const existingTax = existing.find(t => t.code === tax.code);
            let taxId = existingTax?.id;
            // Handle rate being string or number
            let taxRate = existingTax ? parseFloat(existingTax.rate) : parseFloat(tax.rate.toString());

            if (!taxId) {
                const created = await storage.createTaxType({
                    companyId,
                    code: tax.code,
                    name: tax.name,
                    description: tax.description,
                    rate: tax.rate.toString(),
                    isActive: tax.is_active,
                    effectiveFrom: tax.effective_from,
                    effectiveTo: tax.effective_to,
                    zimraCode: tax.zimra_code,
                    zimraTaxId: tax.zimra_tax_id,
                    calculationMethod: tax.calculation_method
                });
                taxId = created.id;
                taxRate = parseFloat(created.rate);
            }
            taxTypesMap.set(tax.code, { id: taxId, rate: taxRate });
        }
        console.log(`[SEED] Tax Types seeded`);

        // 2. Currencies (USD & ZWG)
        const currencies = await storage.getCurrencies(companyId);
        let usdId = currencies.find(c => c.code === 'USD')?.id;
        let zwgId = currencies.find(c => c.code === 'ZWG')?.id;

        if (!usdId) console.warn("[SEED] USD not found after creation");
        if (!zwgId) console.warn("[SEED] ZWG not found after creation");

        console.log(`[SEED] Currencies verified`);

        // 3. Products - Filter based on VAT registration status
        const productsMap = new Map<string, number>(); // SKU -> ID

        for (const prod of DEFAULT_PRODUCTS) {
            // Skip products that don't match company VAT status
            if (explicitlyNotVatRegistered && prod.forVatCompanies) continue;
            if (!explicitlyNotVatRegistered && !prod.forVatCompanies) continue;

            const existing = await storage.getProducts(companyId);
            let prodId = existing.find(p => p.sku === prod.sku)?.id;

            const taxTypeInfo = taxTypesMap.get(prod.taxCode);
            if (!taxTypeInfo) {
                console.warn(`[SEED] Tax Type ${prod.taxCode} not found for product ${prod.sku}`);
            }

            if (!prodId) {
                // Create clean product object (removing helper fields)
                const { taxCode, forVatCompanies, ...productData } = prod;

                const created = await storage.createProduct({
                    ...productData,
                    companyId,
                    taxTypeId: taxTypeInfo?.id
                } as any);
                prodId = created.id;
            } else {
                const existingProductToUpdate = existing.find(p => p.id === prodId);
                if (existingProductToUpdate && (existingProductToUpdate.name !== prod.name || existingProductToUpdate.taxTypeId !== taxTypeInfo?.id)) {
                    await storage.updateProduct(prodId, {
                        name: prod.name,
                        taxTypeId: taxTypeInfo?.id
                    } as any);
                }
            }
            productsMap.set(prod.sku, prodId!);
        }
        console.log(`[SEED] Products seeded (VAT registered: ${!explicitlyNotVatRegistered})`);

        // 4. Customers
        for (const cust of DEFAULT_CUSTOMERS) {
            const customers = await storage.getCustomers(companyId);
            const existingCust = customers.find(c => c.name === cust.name);

            if (!existingCust) {
                await storage.createCustomer({
                    ...cust,
                    companyId,
                    isActive: true
                });
            }
        }
        console.log(`[SEED] Customer seeded`);

    } catch (error) {
        console.error("[SEED] Failed to seed defaults:", error);
    }
}

async function createDraftInvoice(
    companyId: number,
    customerId: number,
    currency: string,
    productsMap: Map<string, number>,
    taxTypesMap: Map<string, { id: number, rate: number }>
) {
    // ... Draft invoice logic kept for reference but disabled ...
}
