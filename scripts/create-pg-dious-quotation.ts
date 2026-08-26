import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function run() {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // 1. Use FiscalStack Solutions (ID: 18) as the selling company
        const companyResult = await client.query(`SELECT id, name FROM companies WHERE id = 18`);
        const company = companyResult.rows[0];
        if (!company) {
            throw new Error('Company ID 18 (FiscalStack Solutions) not found');
        }
        const companyId = company.id;
        console.log(`Using company: ${company.name} (ID: ${companyId})`);

        // 2. Create or find customer PG DIOUS
        let customerResult = await client.query(`
            SELECT id FROM customers WHERE company_id = $1 AND email = $2
        `, [companyId, 'princemak@pgzim.co.zw']);
        
        let customerId;
        if (customerResult.rows.length > 0) {
            customerId = customerResult.rows[0].id;
            console.log(`Customer found: PG DIOUS (ID: ${customerId})`);
        } else {
            customerResult = await client.query(`
                INSERT INTO customers (company_id, name, email, phone, address, city, country, tin, vat_number, created_at)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
                RETURNING id
            `, [
                companyId,
                'PG DIOUS',
                'princemak@pgzim.co.zw',
                '+263713830214',
                'No. 5 Nottingham Road, Workington',
                'Harare',
                'Zimbabwe',
                '', // TIN - fill in
                ''  // VAT Number - fill in
            ]);
            customerId = customerResult.rows[0].id;
            console.log(`Customer created: PG DIOUS (ID: ${customerId})`);
        }
        
        console.log(`Customer created/found: PG DIOUS (ID: ${customerId})`);

        // 3. Create quotation
        const quotationNumber = `QT-PGDIOS-${Date.now()}`;
        const issueDate = new Date();
        const expiryDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days
        
        const quoteResult = await client.query(`
            INSERT INTO quotations (
                company_id, customer_id, quotation_number, issue_date, expiry_date,
                subtotal, tax_amount, total, status, tax_inclusive, currency, notes, created_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())
            RETURNING id
        `, [
            companyId,
            customerId,
            quotationNumber,
            issueDate,
            expiryDate,
            350.00,  // subtotal
            0.00,    // tax_amount (no VAT)
            350.00,  // total
            'draft', // status
            false,   // tax_inclusive
            'USD',   // currency
            'Manufacturing Module (Custom): Multi-process door production workflow with Fiscalstack integration\nHR + Payroll Module: Complete HR & payroll management\nCustomization & Configuration: System setup, data migration, integrations\nTraining & Implementation: On-site training, go-live support, 30-day post-support\n\nPayment Terms: 50% deposit, 25% mid-implementation, 25% on go-live\nValidity: 30 days\nImplementation: 8-10 weeks'
        ]);
        
        const quotationId = quoteResult.rows[0].id;
        console.log(`Quotation created: ${quotationNumber} (ID: ${quotationId})`);

        // 4. Create quotation items
        const items = [
            {
                description: 'Manufacturing Module\nMulti-process point manufacturing system for door production workflow\n• Raw material intake & tracking\n• Cutting & profiling stations\n• Assembly & joining processes\n• Finishing & coating lines\n• Quality control checkpoints\n• Packaging & dispatch management\n• Real-time production monitoring\n• Fiscalstack integration at each process point',
                quantity: 1,
                unitPrice: 110.00,
                taxRate: 0,
                lineTotal: 110.00
            },
            {
                description: 'HR + Payroll Module\nComplete Human Resources & Payroll management\n• Employee records & onboarding\n• Attendance & leave management\n• Payroll processing (Zimbabwe compliant)\n• Performance appraisals\n• Training & development tracking\n• Statutory reporting (NSSA, ZIMRA)',
                quantity: 1,
                unitPrice: 110.00,
                taxRate: 0,
                lineTotal: 110.00
            },
            {
                description: 'Customization & Configuration\n• System setup to match PG DIOUS workflow\n• Custom fields, forms & reports\n• User roles & permissions\n• Data migration from existing systems\n• Integration with existing infrastructure',
                quantity: 1,
                unitPrice: 70.00,
                taxRate: 0,
                lineTotal: 70.00
            },
            {
                description: 'Training & Implementation\n• On-site training for key users (2 days)\n• Admin training (1 day)\n• User manuals & quick reference guides\n• Go-live support (1 week)\n• 30-day post-implementation support',
                quantity: 1,
                unitPrice: 60.00,
                taxRate: 0,
                lineTotal: 60.00
            }
        ];

        for (const item of items) {
            await client.query(`
                INSERT INTO quotation_items (
                    quotation_id, description, quantity, unit_price, tax_rate, line_total, tax_type_id
                ) VALUES ($1, $2, $3, $4, $5, $6, $7)
            `, [
                quotationId,
                item.description,
                item.quantity,
                item.unitPrice,
                item.taxRate,
                item.lineTotal,
                null // tax_type_id
            ]);
        }
        
        console.log('Quotation items created successfully');
        
        await client.query('COMMIT');
        console.log('\n✅ Quotation created successfully in the system!');
        console.log(`   Quotation Number: ${quotationNumber}`);
        console.log(`   Customer: PG DIOUS`);
        console.log(`   Total: $350.00 (no VAT)`);
        console.log(`   Status: draft`);
        console.log(`\nYou can now view/edit it at /quotations/${quotationId} or /create-quotation?edit=${quotationId}`);

    } catch (e) {
        await client.query('ROLLBACK');
        console.error('Error:', e);
    } finally {
        client.release();
        await pool.end();
    }
}

run();