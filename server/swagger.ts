import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';
import { Express } from 'express';

const options: swaggerJsdoc.Options = {
    definition: {
        openapi: '3.0.0',
        info: {
            title: 'FiscalStack Integration API (v1)',
            version: '1.0.0',
            description: 'API documentation for the FiscalStack v1 Integration layer, providing direct ERP/Accounting hooks for seamless ZIMRA FDMS integration.',
        },
        servers: [
            {
                url: '/',
                description: 'Current Environment',
            },
        ],
        components: {
            securitySchemes: {
                ApiKeyAuth: {
                    type: 'apiKey',
                    in: 'header',
                    name: 'x-api-key',
                    description: 'Integration API key acquired from the FiscalStack Dashboard',
                },
            },
            schemas: {
                Customer: {
                    type: 'object',
                    required: ['name'],
                    properties: {
                        id: { type: 'integer', readOnly: true },
                        name: { type: 'string' },
                        email: { type: 'string', nullable: true },
                        phone: { type: 'string', nullable: true },
                        address: { type: 'string', nullable: true },
                        vatNumber: { type: 'string', nullable: true },
                        tin: { type: 'string', nullable: true },
                    },
                },
                Product: {
                    type: 'object',
                    required: ['name', 'price', 'taxRate'],
                    properties: {
                        id: { type: 'integer', readOnly: true },
                        name: { type: 'string' },
                        description: { type: 'string', nullable: true },
                        sku: { type: 'string', nullable: true },
                        price: { type: 'number' },
                        taxRate: { type: 'number' },
                        currency: { type: 'string', default: 'USD' },
                        hsCode: { type: 'string', nullable: true },
                    },
                },
                InvoiceItem: {
                    type: 'object',
                    required: ['name', 'quantity', 'unitPrice'],
                    properties: {
                        productId: { type: 'integer', nullable: true },
                        name: { type: 'string' },
                        description: { type: 'string', nullable: true },
                        quantity: { type: 'number' },
                        unitPrice: { type: 'number' },
                        taxRate: { type: 'number', nullable: true },
                        hsCode: { type: 'string', nullable: true },
                    },
                },
                Invoice: {
                    type: 'object',
                    required: ['customerId', 'items'],
                    properties: {
                        id: { type: 'integer', readOnly: true },
                        invoiceNumber: { type: 'string', nullable: true },
                        customerId: { type: 'integer' },
                        issueDate: { type: 'string', format: 'date-time' },
                        dueDate: { type: 'string', format: 'date-time', nullable: true },
                        currency: { type: 'string', default: 'USD' },
                        exchangeRate: { type: 'number', default: 1 },
                        subtotal: { type: 'number', readOnly: true },
                        taxTotal: { type: 'number', readOnly: true },
                        total: { type: 'number', readOnly: true },
                        status: { type: 'string', readOnly: true },
                        fiscalCode: { type: 'string', readOnly: true },
                        items: {
                            type: 'array',
                            items: { $ref: '#/components/schemas/InvoiceItem' },
                        },
                    },
                },
                PassThroughFiscalizePayload: {
                    type: 'object',
                    description: 'Minimum viable request: only `items` is required. Everything else is optional and defaults from your company profile.',
                    required: ['items'],
                    properties: {
                        items: {
                            type: 'array',
                            minItems: 1,
                            items: {
                                type: 'object',
                                required: ['name', 'quantity', 'unitPrice'],
                                properties: {
                                    name: { type: 'string', description: 'Item name as shown on the receipt' },
                                    quantity: { type: 'number', minimum: 0 },
                                    unitPrice: { type: 'number', minimum: 0 },
                                    taxRate: { type: 'number', minimum: 0, maximum: 100, nullable: true, description: '(Optional) Defaults to company default (usually 15.5%)' },
                                    hsCode: { type: 'string', nullable: true, description: '(Optional) Defaults to company default HS code' },
                                    sku: { type: 'string', nullable: true, description: '(Optional) Client reference — not sent to ZIMRA' },
                                }
                            }
                        },
                        buyer: {
                            type: 'object',
                            description: '(Optional) Buyer info. Defaults to "Walk-in Customer" if omitted.',
                            nullable: true,
                            properties: {
                                name: { type: 'string', description: '(Optional)' },
                                vatNumber: { type: 'string', description: '(Optional)' },
                                tin: { type: 'string', description: '(Optional)' },
                                email: { type: 'string', format: 'email', description: '(Optional)' },
                                phone: { type: 'string', description: '(Optional)' },
                                address: { type: 'string', description: '(Optional)' },
                            }
                        },
                        invoiceNumber: { type: 'string', nullable: true, description: '(Optional) Auto-generated if omitted' },
                        date: { type: 'string', format: 'date', nullable: true, description: '(Optional) Defaults to today' },
                        currency: { type: 'string', minLength: 3, maxLength: 3, nullable: true, description: '(Optional) ISO 4217. Defaults to company currency' },
                        paymentMethod: { type: 'string', enum: ['CASH', 'CARD', 'MOBILE', 'TRANSFER'], default: 'CASH', description: '(Optional) Defaults to CASH' },
                        transactionType: { type: 'string', enum: ['FiscalInvoice', 'CreditNote', 'DebitNote'], default: 'FiscalInvoice', description: '(Optional) Determines the kind of fiscal document being generated. Defaults to Standard Sale (FiscalInvoice) if omitted.' },
                        relatedInvoiceNumber: { type: 'string', nullable: true, description: '(Optional) Required for CreditNote or DebitNote. Provide the invoice number of the original invoice being corrected.' },
                    },
                    example: {
                        items: [
                            { name: 'Widget A', quantity: 2, unitPrice: 10 },
                            { name: 'Service Fee', quantity: 1, unitPrice: 50, taxRate: 0 },
                        ],
                        paymentMethod: 'CARD'
                    }
                },
                DeviceStatus: {
                    type: 'object',
                    properties: {
                        deviceId: { type: 'string' },
                        serialNumber: { type: 'string' },
                        activationKey: { type: 'string' },
                        environment: { type: 'string' },
                        lastPingTime: { type: 'string', format: 'date-time', nullable: true },
                        status: { type: 'string' },
                        currentDayNo: { type: 'integer', nullable: true },
                    }
                },
                ApiError: {
                    type: 'object',
                    properties: {
                        error: { type: 'string' },
                        message: { type: 'string' },
                        statusCode: { type: 'integer' },
                        details: { type: 'array', items: { type: 'object' } },
                    }
                }
            },
        },
        security: [
            {
                ApiKeyAuth: [],
            },
        ],
        paths: {
            '/api/v1/customers': {
                get: {
                    summary: 'List Customers',
                    tags: ['Customers'],
                    responses: {
                        200: {
                            description: 'List of customers',
                            content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Customer' } } } },
                        },
                    },
                },
                post: {
                    summary: 'Create Customer',
                    tags: ['Customers'],
                    requestBody: {
                        required: true,
                        content: { 'application/json': { schema: { $ref: '#/components/schemas/Customer' } } },
                    },
                    responses: {
                        201: { description: 'Customer created', content: { 'application/json': { schema: { $ref: '#/components/schemas/Customer' } } } },
                        400: { description: 'Validation Error', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } } },
                    },
                }
            },
            '/api/v1/customers/{id}': {
                get: {
                    summary: 'Get Customer',
                    tags: ['Customers'],
                    
                    responses: {
                        200: { description: 'Customer details', content: { 'application/json': { schema: { $ref: '#/components/schemas/Customer' } } } },
                        404: { description: 'Not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } } },
                    },
                },
                put: {
                    summary: 'Update Customer',
                    tags: ['Customers'],
                    
                    requestBody: {
                        required: true,
                        content: { 'application/json': { schema: { $ref: '#/components/schemas/Customer' } } },
                    },
                    responses: {
                        200: { description: 'Customer updated', content: { 'application/json': { schema: { $ref: '#/components/schemas/Customer' } } } },
                        404: { description: 'Not found' },
                    },
                }
            },
            '/api/v1/products': {
                get: {
                    summary: 'List Products',
                    tags: ['Products'],
                    responses: {
                        200: {
                            description: 'List of products',
                            content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Product' } } } },
                        },
                    },
                },
                post: {
                    summary: 'Create Product',
                    tags: ['Products'],
                    requestBody: {
                        required: true,
                        content: { 'application/json': { schema: { $ref: '#/components/schemas/Product' } } },
                    },
                    responses: {
                        201: { description: 'Product created', content: { 'application/json': { schema: { $ref: '#/components/schemas/Product' } } } },
                        400: { description: 'Validation Error' },
                    },
                }
            },
            '/api/v1/products/{id}': {
                get: {
                    summary: 'Get Product',
                    tags: ['Products'],
                    
                    responses: {
                        200: { description: 'Product details', content: { 'application/json': { schema: { $ref: '#/components/schemas/Product' } } } },
                        404: { description: 'Not found' },
                    },
                },
                put: {
                    summary: 'Update Product',
                    tags: ['Products'],
                    
                    requestBody: {
                        required: true,
                        content: { 'application/json': { schema: { $ref: '#/components/schemas/Product' } } },
                    },
                    responses: {
                        200: { description: 'Product updated', content: { 'application/json': { schema: { $ref: '#/components/schemas/Product' } } } },
                        404: { description: 'Not found' },
                    },
                }
            },
            '/api/v1/invoices': {
                get: {
                    summary: 'List Invoices',
                    tags: ['Invoices'],
                    responses: {
                        200: {
                            description: 'List of invoices',
                            content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Invoice' } } } },
                        },
                    },
                },
                post: {
                    summary: 'Create Invoice',
                    tags: ['Invoices'],
                    requestBody: {
                        required: true,
                        content: { 'application/json': { schema: { $ref: '#/components/schemas/Invoice' } } },
                    },
                    responses: {
                        201: { description: 'Invoice created', content: { 'application/json': { schema: { $ref: '#/components/schemas/Invoice' } } } },
                        400: { description: 'Validation Error' },
                    },
                }
            },
            '/api/v1/invoices/{id}': {
                get: {
                    summary: 'Get Invoice',
                    tags: ['Invoices'],
                    
                    responses: {
                        200: { description: 'Invoice details', content: { 'application/json': { schema: { $ref: '#/components/schemas/Invoice' } } } },
                        404: { description: 'Not found' },
                    },
                },
                put: {
                    summary: 'Update Invoice',
                    tags: ['Invoices'],
                    
                    requestBody: {
                        required: true,
                        content: { 'application/json': { schema: { $ref: '#/components/schemas/Invoice' } } },
                    },
                    responses: {
                        200: { description: 'Invoice updated', content: { 'application/json': { schema: { $ref: '#/components/schemas/Invoice' } } } },
                        404: { description: 'Not found' },
                    },
                },
                delete: {
                    summary: 'Delete Invoice',
                    tags: ['Invoices'],
                    
                    responses: {
                        200: { description: 'Invoice deleted' },
                        404: { description: 'Not found' },
                    },
                }
            },
            '/api/v1/invoices/{id}/fiscalize': {
                post: {
                    summary: 'Fiscalize a stored Invoice',
                    tags: ['Invoices'],
                    
                    responses: {
                        200: { description: 'Invoice successfully fiscalized' },
                        404: { description: 'Invoice not found' },
                        409: { description: 'Invoice already fiscalized' },
                    },
                }
            },
            '/api/v1/fiscalize': {
                post: {
                    summary: 'Pass-through Fiscalization (Recommended for integrations)',
                    description: `**The Pass-Through Fiscalization API** allows you to fiscalize receipts directly against ZIMRA in a single API call without needing to pre-register customers, products, or invoices in FiscalStack. This is the recommended integration method for POS systems, ERPs, and legacy applications.

### How it works:
1. **Send the minimum data:** Only the \`items\` array is strictly required for a standard sale. 
2. **Auto-Defaults:** FiscalStack automatically handles complex ZIMRA requirements. It computes all subtotals and taxes server-side, maps your items to the correct HS codes and Tax IDs based on your company profile, and defaults missing buyer information to a standard "Walk-in Customer".
3. **Credit/Debit Notes:** For refunds or corrections, simply specify the \`transactionType\` as \`CreditNote\` or \`DebitNote\` and provide the \`relatedInvoiceNumber\` of the original invoice.

**Minimum viable request:**
\`\`\`json
{ 
  "items": [
    { "name": "Widget", "quantity": 1, "unitPrice": 100 }
  ] 
}
\`\`\`

*Note: If ZIMRA rejects the transaction (e.g., device offline or day closed), the temporary invoice record is automatically cleaned up so you can retry the exact same request safely once the issue is resolved.*`,
                    tags: ['Pass-through'],
                    requestBody: {
                        required: true,
                        content: {
                            'application/json': {
                                schema: { $ref: '#/components/schemas/PassThroughFiscalizePayload' },
                            }
                        },
                    },
                    responses: {
                        200: {
                            description: 'Successfully fiscalized. Receipt proof returned.',
                            content: {
                                'application/json': {
                                    schema: {
                                        type: 'object',
                                        properties: {
                                            success: { type: 'boolean' },
                                            fiscalCode: { type: 'string', description: 'ZIMRA fiscal (verification) code' },
                                            qrCode: { type: 'string', description: 'QR code URL — render this visually on the receipt' },
                                            receiptNumber: { type: 'integer', description: 'ZIMRA global receipt sequence number' },
                                            invoiceNumber: { type: 'string' },
                                            date: { type: 'string', format: 'date' },
                                            total: { type: 'string' },
                                            subtotal: { type: 'string' },
                                            taxTotal: { type: 'string' },
                                            currency: { type: 'string' },
                                            buyer: { type: 'string' },
                                            _fiscal: {
                                                type: 'object',
                                                properties: {
                                                    fiscalDayNo: { type: 'integer' },
                                                    receiptCounter: { type: 'integer' },
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        },
                        400: { description: 'Validation error — invalid request body', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } } },
                        422: {
                            description: 'Fiscalization rejected by ZIMRA (device not registered, day not open, etc.)',
                            content: {
                                'application/json': {
                                    schema: {
                                        type: 'object',
                                        properties: {
                                            error: { type: 'string', example: 'FISCALIZATION_FAILED' },
                                            message: { type: 'string' },
                                            statusCode: { type: 'integer' },
                                            hint: { type: 'string', description: 'Actionable guidance on what to fix' },
                                        }
                                    }
                                }
                            }
                        },
                    },
                }
            },
            '/api/v1/fiscal/device': {
                get: {
                    summary: 'Device Status',
                    tags: ['ZIMRA Device'],
                    responses: {
                        200: { description: 'Status retrieved', content: { 'application/json': { schema: { $ref: '#/components/schemas/DeviceStatus' } } } },
                    },
                }
            },
            '/api/v1/fiscal/ping': {
                post: {
                    summary: 'Ping ZIMRA Server',
                    tags: ['ZIMRA Device'],
                    responses: {
                        200: { description: 'Server online' },
                        500: { description: 'Connection failed' },
                    },
                }
            },
            '/api/v1/fiscal/open-day': {
                post: {
                    summary: 'Open Fiscal Day',
                    tags: ['ZIMRA Device'],
                    responses: {
                        200: { description: 'Fiscal day opened' },
                    },
                }
            },
            '/api/v1/fiscal/close-day': {
                post: {
                    summary: 'Close Fiscal Day (Z-Report)',
                    tags: ['ZIMRA Device'],
                    responses: {
                        200: { description: 'Z-Report generated' },
                    },
                }
            },
            '/api/v1/webhooks/sage': {
                post: {
                    summary: 'Sage Integration Webhook',
                    description: 'Webhook endpoint for Sage accounting system connectivity. Does not require API token authentication.',
                    tags: ['Webhooks'],
                    security: [],
                    responses: {
                        200: { description: 'Webhook received' },
                    },
                }
            },
            '/api/zimra/device-details': {
                get: {
                    summary: 'Get Card Details (GetCardDetails)',
                    tags: ['Fiscalisation API'],
                    parameters: [{ in: 'query', name: 'companyId', required: false, schema: { type: 'integer' } }],
                    responses: {
                        200: { description: 'Device Details retrieved successfully' },
                        404: { description: 'Device not found or not registered' },
                    },
                }
            },
            '/api/zimra/device-status': {
                get: {
                    summary: 'Get Device Status (GetDeviceStatus)',
                    tags: ['Fiscalisation API'],
                    
                    responses: {
                        200: { description: 'Device Status retrieved successfully' },
                        400: { description: 'Company not registered with ZIMRA' },
                    },
                }
            },
            '/api/zimra/transact': {
                post: {
                    summary: 'Transact (TransactM)',
                    tags: ['Fiscalisation API'],
                    
                    requestBody: {
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    required: ['CURRENCY', 'INVOICENUMBER', 'INVOICEAMOUNT', 'INVOICETAXAMOUNT', 'INVOICEFLAG', 'ITEMSXML', 'CURRENCIES'],
                                    properties: {
                                        CURRENCY: { type: 'string' },
                                        INVOICENUMBER: { type: 'string' },
                                        CUSTOMERNAME: { type: 'string' },
                                        CUSTOMERVATNUMBER: { type: 'string' },
                                        CUSTOMERADDRESS: { type: 'string' },
                                        CUSTOMERTELEPHONENUMBER: { type: 'string' },
                                        CUSTOMERTIN: { type: 'string' },
                                        INVOICEAMOUNT: { type: 'string' },
                                        INVOICETAXAMOUNT: { type: 'string' },
                                        INVOICEFLAG: { type: 'string' },
                                        ORIGINALINVOICENUMBER: { type: 'string' },
                                        INVOICECOMMENT: { type: 'string' },
                                        ITEMSXML: { type: 'string' },
                                        CURRENCIES: { type: 'string' },
                                    }
                                }
                            }
                        }
                    },
                    responses: {
                        200: { description: 'Transaction Successful' },
                        400: { description: 'Validation Error' },
                    },
                }
            },
            '/api/zimra/transact-ext': {
                post: {
                    summary: 'Transact Extended (TransactMExt)',
                    tags: ['Fiscalisation API'],
                    
                    requestBody: {
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    required: ['Currency', 'InvoiceNumber', 'InvoiceAmount', 'InvoiceTaxAmount', 'InvoiceFlag', 'ItemsXML', 'Currencies'],
                                    properties: {
                                        Currency: { type: 'string' },
                                        InvoiceNumber: { type: 'string' },
                                        InvoiceAmount: { type: 'string' },
                                        InvoiceTaxAmount: { type: 'string' },
                                        InvoiceFlag: { type: 'string' },
                                        InvoiceComment: { type: 'string' },
                                        OriginalInvoiceNumber: { type: 'string' },
                                        ItemsXML: { type: 'string' },
                                        Currencies: { type: 'string' },
                                        CustomerEmail: { type: 'string' },
                                        CustomerRegisteredName: { type: 'string' },
                                        CustomerTradeName: { type: 'string' },
                                        CustomerVATNumber: { type: 'string' },
                                        CustomerTIN: { type: 'string' },
                                        CustomerTelephoneNumber: { type: 'string' },
                                        CustomerFullAddress: { type: 'string' },
                                        buyerProvince: { type: 'string' },
                                        buyerStreet: { type: 'string' },
                                        buyerHouseNo: { type: 'string' },
                                        buyerCity: { type: 'string' },
                                    }
                                }
                            }
                        }
                    },
                    responses: {
                        200: { description: 'Transaction Successful' },
                        400: { description: 'Validation Error' },
                    },
                }
            },
            '/api/zimra/z-report': {
                post: {
                    summary: 'Unified Z-Report (open/close)',
                    tags: ['Fiscalisation API'],
                    
                    requestBody: {
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    required: ['action'],
                                    properties: { action: { type: 'string', enum: ['open', 'close'] } }
                                }
                            }
                        }
                    },
                    responses: { 200: { description: 'Success' } }
                }
            },
            '/api/zimra/transactions/{invoiceNumber}': {
                get: {
                    summary: 'Get Transaction',
                    tags: ['Fiscalisation API'],
                    parameters: [
                        
                        { in: 'path', name: 'invoiceNumber', required: true, schema: { type: 'string' } }
                    ],
                    responses: { 200: { description: 'Success' } }
                }
            },
            '/api/zimra/transactions/unprocessed/summary': {
                get: {
                    summary: 'Get UnProcessed Transaction Summary',
                    tags: ['Fiscalisation API'],
                    
                    responses: { 200: { description: 'Success' } }
                }
            },
            '/api/zimra/transactions/unprocessed': {
                get: {
                    summary: 'Get UnProcessed Transactions',
                    tags: ['Fiscalisation API'],
                    
                    responses: { 200: { description: 'Success' } }
                },
                delete: {
                    summary: 'Clear Unprocessed Transactions',
                    tags: ['Fiscalisation API'],
                    parameters: [
                        
                        { in: 'query', name: 'fiscalDayNumber', required: true, schema: { type: 'integer' } }
                    ],
                    responses: { 200: { description: 'Success' } }
                }
            },
            '/api/zimra/transactions/unprocessed/by-date': {
                get: {
                    summary: 'Get UnProcessed Transactions By Date',
                    tags: ['Fiscalisation API'],
                    parameters: [
                        
                        { in: 'query', name: 'fiscalDate', required: true, schema: { type: 'string' } }
                    ],
                    responses: { 200: { description: 'Success' } }
                },
                delete: {
                    summary: 'Clear Unprocessed Transactions By Date',
                    tags: ['Fiscalisation API'],
                    parameters: [
                        
                        { in: 'query', name: 'fiscalDate', required: true, schema: { type: 'string' } }
                    ],
                    responses: { 200: { description: 'Success' } }
                }
            },
            '/api/zimra/config/reset': {
                post: {
                    summary: 'Reset Device Counters',
                    tags: ['Fiscalisation API'],
                    
                    responses: { 200: { description: 'Success' } }
                }
            }
        },
    },
    apis: [], // No longer scanning files, using pure definition
};

export function setupSwagger(app: Express) {
    const specs = swaggerJsdoc(options);
    app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(specs, {
        customCss: '.swagger-ui .topbar { display: none }',
        customSiteTitle: "FiscalStack Integration API Docs"
    }));
    console.log('Swagger UI configured for Integration API (v1)');
}
