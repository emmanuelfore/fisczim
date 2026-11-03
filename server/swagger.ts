import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';
import { Express } from 'express';

const options: swaggerJsdoc.Options = {
    definition: {
        openapi: '3.0.0',
        info: {
            title: 'FiscalStack Integration API (v1)',
            version: '1.0.0',
            description: `Integration surface for FiscalStack fiscalization. Every endpoint here authenticates with the \`X-API-Key\` header; the key resolves your company, so never send a company id.

**Start with \`POST /api/v1/fiscalize\`** (Pass-through): one call turns a sale into a fiscal receipt — no pre-registered customers, products or invoices, and totals are computed server-side. Full walkthrough in \`docs/pass-through-fiscalize.md\`.

**Fiscal Device** is day control and health: \`/device\`, \`/status\`, \`/config\`, \`/server-certificate\`, \`/ping\`, \`/open-day\`, \`/close-day\`. A fiscal day must be open for a receipt to issue; the pass-through engine opens or recovers one when it can. \`/config\` returns \`certificateValidTill\` — renew the device certificate before that date, since an expired certificate blocks every receipt, with \`/certificate/issue\` (plus \`/certificate/confirm\` where the gateway works in two steps).

**Fiscalisation API** is the low-level, provider-agnostic gateway surface under the same \`/api/v1/fiscal\` prefix: \`/device-details\`, \`/device-status\`, \`/register\`, \`/verify-taxpayer\` and \`/transact\`. Your company always comes from the API key. (The older \`/api/fiscal/*\` paths still answer for existing clients.) Prefer Pass-through unless you need raw card/status/verify-taxpayer data or your own \`transact\` payload.`,
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
                                    quantity: { type: 'number', exclusiveMinimum: 0, description: 'Must be greater than 0' },
                                    unitPrice: { type: 'number', minimum: 0 },
                                    taxType: { type: 'string', enum: ['STANDARD', 'ZERO_RATED', 'EXEMPT'], default: 'STANDARD', description: '(Optional) STANDARD applies company VAT rate. ZERO_RATED = taxable at 0%. EXEMPT = not subject to VAT.' },
                                    taxInclusive: { type: 'boolean', default: false, description: '(Optional) Set true if unitPrice already includes VAT. Server strips tax automatically.' },
                                    hsCode: { type: 'string', nullable: true, maxLength: 8, description: '(Optional) Must be 4 or 8 digits (RCPT048). Defaults based on taxType: STANDARD→99001000, ZERO_RATED→99002000, EXEMPT→99003000' },
                                    sku: { type: 'string', nullable: true, description: '(Optional) Client reference — stored locally, not sent to the fiscal authority' },
                                    discount: { type: 'number', minimum: 0, nullable: true, description: '(Optional) Line-level discount amount (absolute, subtracted from the line total)' },
                                    additionalTaxes: {
                                        type: 'array',
                                        nullable: true,
                                        description: '(Optional) Per-line additional taxes (levies) — passed through unchanged. Only applied by providers that support levies.',
                                        items: {
                                            type: 'object',
                                            required: ['taxID', 'taxType', 'taxRate'],
                                            properties: {
                                                taxID: { type: 'number' },
                                                taxType: { type: 'string', enum: ['PercentageLevy', 'FixedValueLevy', 'WithholdingTax'] },
                                                taxRate: { type: 'number' },
                                                appliedForQuantity: { type: 'number' },
                                            }
                                        }
                                    },
                                }
                            }
                        },
                        buyer: {
                            type: 'object',
                            description: '(Optional) Buyer info. Defaults to "Walk-in Customer" if omitted.',
                            nullable: true,
                            properties: {
                                name: { type: 'string', nullable: true, description: '(Optional) Display name fallback — stored as the invoice customer name' },
                                registeredName: { type: 'string', nullable: true, description: '(Optional) Legal/registered company name' },
                                tradeName: { type: 'string', nullable: true, description: '(Optional) Trading name (if different)' },
                                vatNumber: { type: 'string', nullable: true, maxLength: 20, description: '(Optional) Buyer VAT number exactly as issued by the authority — never re-formatted or digit-gated locally. 4–20 chars.' },
                                tin: { type: 'string', nullable: true, maxLength: 20, description: '(Optional) Buyer TIN exactly as issued by the authority (digits, letters and the separators the issuer uses). 4–20 chars.' },
                                email: { type: 'string', format: 'email', maxLength: 100, nullable: true, description: '(Optional)' },
                                phone: { type: 'string', maxLength: 20, nullable: true, description: '(Optional)' },
                                province: { type: 'string', nullable: true, description: '(Optional)' },
                                street: { type: 'string', nullable: true, description: '(Optional)' },
                                houseNo: { type: 'string', nullable: true, description: '(Optional)' },
                                city: { type: 'string', nullable: true, description: '(Optional)' },
                            }
                        },
                        splitPayments: {
                            type: 'array',
                            nullable: true,
                            description: '(Optional) For split tenders. Overrides paymentMethod. Amounts must sum to the gross total (RCPT039).',
                            items: {
                                type: 'object',
                                properties: {
                                    method: { type: 'string', description: 'Any payment name — mapped to the provider money type for you: CASH, CARD/SWIPE/POS, MOBILE/ECOCASH/ONE_MONEY, EFT/RTGS/ZIPIT/TRANSFER' },
                                    amount: { type: 'number' },
                                }
                            }
                        },
                        invoiceNumber: { type: 'string', nullable: true, description: '(Optional) Stored exactly as you send it — the number on your printed receipt, and the one a later correction is filed under. Auto-generated (INV-XXXX) when omitted. Must be unique per company; a retry of an already-saved number returns 409.' },
                        date: { type: 'string', format: 'date', nullable: true, description: '(Optional) YYYY-MM-DD. Defaults to today. Supports ISO 8601 with or without timezone.' },
                        currency: { type: 'string', pattern: '^[A-Za-z]{3}$', example: 'USD', description: '(Optional) ISO 4217 code. Defaults to **your company currency** when omitted — omit it unless you are billing in a second currency. The fiscal authority rejects codes the device does not accept (readable 422).' },
                        paymentMethod: { type: 'string', enum: ['CASH', 'CARD', 'MOBILE', 'TRANSFER', 'BANK_TRANSFER', 'ECOCASH', 'ONE_MONEY', 'EFT', 'RTGS', 'ZIPIT'], default: 'CASH', description: '(Optional) Defaults to CASH' },
                        transactionType: { type: 'string', enum: ['FiscalInvoice', 'CreditNote', 'DebitNote'], default: 'FiscalInvoice', description: '(Optional) Determines the kind of fiscal document being generated. Defaults to Standard Sale (FiscalInvoice) if omitted.' },
                        relatedInvoiceNumber: { type: 'string', nullable: true, description: '(Optional) Required for CreditNote or DebitNote. Provide the invoice number of the original invoice being corrected.' },
                        creditNoteReason: { type: 'string', nullable: true, description: '(Optional) Required for CreditNote/DebitNote. Why the correction is being issued.' },

                        // ── Offline Synchronization fields ──
                        offlineSignature: { type: 'string', nullable: true, description: '(Optional) Offline fiscal signature' },
                        offlineReceiptCounter: { type: 'integer', nullable: true, description: '(Optional) Offline daily receipt counter' },
                        offlineGlobalReceiptCounter: { type: 'integer', nullable: true, description: '(Optional) Offline global receipt number' },
                        offlinePreviousHash: { type: 'string', nullable: true, description: '(Optional) Previous receipt hash for offline chain' },
                        offlineFiscalDay: { type: 'integer', nullable: true, description: '(Optional) Offline fiscal day number' },
                        offlineDate: { type: 'string', nullable: true, description: '(Optional) Offline receipt date' },
                    },
                    example: {
                        items: [
                            { name: 'Widget A', quantity: 2, unitPrice: 10, taxType: 'STANDARD' },
                            { name: 'Service Fee', quantity: 1, unitPrice: 50, taxType: 'EXEMPT' },
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
                        certificateValidTill: { type: 'string', format: 'date-time', nullable: true, description: 'Expiry of the current device certificate; renew before this date' },
                    }
                },
                ProviderRead: {
                    type: 'object',
                    description: 'Envelope for the read-only device endpoints: the provider payload is passed through unmodified.',
                    required: ['provider', 'data'],
                    properties: {
                        provider: { type: 'string', enum: ['ZIMRA', 'LEKUKA'], description: 'Which fiscal gateway served the request' },
                        data: { type: 'object', description: 'Raw payload from that gateway (status, configuration or certificate)' },
                    }
                },
                CertificateIssue: {
                    type: 'object',
                    description: 'Result of a device certificate renewal.',
                    required: ['provider', 'confirmationRequired', 'privateKeyStored'],
                    properties: {
                        provider: { type: 'string', enum: ['ZIMRA', 'LEKUKA'], description: 'Which fiscal gateway issued the certificate' },
                        certificate: { type: 'string', description: 'The new PEM device certificate now stored for this company' },
                        privateKeyStored: { type: 'boolean', description: 'True when the server generated and stored the matching private key; the key is never returned' },
                        confirmationRequired: { type: 'boolean', description: 'True when the issuing gateway needs a second confirmation call before the certificate becomes active' },
                        message: { type: 'string' },
                    }
                },
                ApiError: {
                    type: 'object',
                    properties: {
                        error: { type: 'string' },
                        message: { type: 'string' },
                        statusCode: { type: 'integer' },
                        details: { type: 'array', items: { type: 'object' } },
                        missing: { type: 'array', items: { type: 'string' }, description: 'Device configuration still absent, e.g. ["private key","device certificate"]' },
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
            '/api/v1/fiscalize': {
                post: {
                    summary: 'Pass-through Fiscalization (Recommended for integrations)',
                    description: `**The Pass-Through Fiscalization API** allows you to fiscalize receipts directly with your fiscal provider in a single API call without needing to pre-register customers, products, or invoices in FiscalStack. This is the recommended integration method for POS systems, ERPs, and legacy applications, and it works with any provider connected to your company.

### What you need before the first call
1. An **API key** in the \`X-API-Key\` header — the key identifies your company, so never send a company id.
2. A **registered fiscal device** on that company (or on the branch the invoice belongs to): device id, activation key, private key and certificate.
3. An **open fiscal day** — receipts need one; the engine opens or recovers a stale day automatically when it can.
4. **Company tax types** (STANDARD / ZERO_RATED / EXEMPT rates and default HS codes). Missing values fall back to the standard \`9900xxx\` HS codes.

### How it works:
1. **Send the minimum data:** Only the \`items\` array is strictly required for a standard sale. 
2. **Auto-Defaults:** FiscalStack automatically handles the complex requirements of your provider. It computes all subtotals and taxes server-side, maps your items to the correct HS codes and Tax IDs based on your company profile, and defaults missing buyer information to a standard "Walk-in Customer".
3. **Never send totals:** \`subtotal\`, \`taxAmount\` and \`total\` are computed here and rounded once per tax bucket (RCPT027/RCPT037). Client-computed totals get rejected.
4. **Credit/Debit Notes:** For refunds or corrections, simply specify the \`transactionType\` as \`CreditNote\` or \`DebitNote\` and provide the \`relatedInvoiceNumber\` and \`creditNoteReason\` of the original invoice.

**Minimum viable request:**
\`\`\`json
{ 
  "items": [
    { "name": "Widget", "quantity": 1, "unitPrice": 100 }
  ] 
}
\`\`\`

*Note: If the provider rejects the transaction (e.g., device offline or day closed), the temporary invoice record is automatically cleaned up so you can retry the exact same request safely once the issue is resolved.*

**Retry safety:** a \`200\` has already minted a real fiscal receipt — never resend it. On a timeout or \`5xx\`, retry with the **same** \`invoiceNumber\` you supplied; \`409 DUPLICATE_INVOICE\` then proves the first attempt landed. Full walkthrough: \`docs/pass-through-fiscalize.md\`.`,
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
                                            fiscalCode: { type: 'string', description: 'Fiscal (verification) code issued by the provider' },
                                            qrCode: { type: 'string', description: 'QR code URL — render this visually on the receipt' },
                                            receiptNumber: { type: 'integer', description: 'Global receipt sequence number from the provider' },
                                            receipt: {
                                                type: 'object',
                                                description: 'Provider receipt data — mirror of what was submitted',
                                                properties: {
                                                    invoiceNo: { type: 'string' },
                                                    receiptDate: { type: 'string', format: 'date' },
                                                    receiptType: { type: 'string', enum: ['FiscalInvoice', 'CreditNote', 'DebitNote'] },
                                                    receiptCurrency: { type: 'string' },
                                                    receiptTotal: { type: 'number' },
                                                    receiptCounter: { type: 'integer' },
                                                    receiptGlobalNo: { type: 'integer' },
                                                    fiscalDayNo: { type: 'integer' },
                                                    receiptLinesTaxInclusive: { type: 'boolean' },
                                                    buyerData: {
                                                        type: 'object',
                                                        nullable: true,
                                                        properties: {
                                                            buyerRegisterName: { type: 'string' },
                                                            buyerTradeName: { type: 'string' },
                                                            vatNumber: { type: 'string' },
                                                            buyerTIN: { type: 'string' },
                                                            buyerContacts: {
                                                                type: 'object',
                                                                properties: {
                                                                    phoneNo: { type: 'string' },
                                                                    email: { type: 'string' },
                                                                }
                                                            },
                                                            buyerAddress: {
                                                                type: 'object',
                                                                properties: {
                                                                    street: { type: 'string' },
                                                                    houseNo: { type: 'string' },
                                                                    city: { type: 'string' },
                                                                    province: { type: 'string' },
                                                                }
                                                            },
                                                        }
                                                    },
                                                    receiptLines: {
                                                        type: 'array',
                                                        items: {
                                                            type: 'object',
                                                            properties: {
                                                                receiptLineNo: { type: 'integer' },
                                                                receiptLineName: { type: 'string' },
                                                                receiptLineType: { type: 'string' },
                                                                receiptLineQuantity: { type: 'number' },
                                                                receiptLinePrice: { type: 'number' },
                                                                receiptLineTotal: { type: 'number' },
                                                                receiptLineHSCode: { type: 'string' },
                                                                taxPercent: { type: 'number' },
                                                            }
                                                        }
                                                    },
                                                    receiptTaxes: {
                                                        type: 'array',
                                                        items: {
                                                            type: 'object',
                                                            properties: {
                                                                taxPercent: { type: 'number' },
                                                                taxAmount: { type: 'number' },
                                                                salesAmountWithTax: { type: 'number' },
                                                            }
                                                        }
                                                    },
                                                    receiptPayments: {
                                                        type: 'array',
                                                        items: {
                                                            type: 'object',
                                                            properties: {
                                                                moneyTypeCode: { type: 'string' },
                                                                paymentAmount: { type: 'number' },
                                                            }
                                                        }
                                                    },
                                                    receiptNotes: { type: 'string' },
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        },
                        400: { description: 'Validation error — invalid request body', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } } },
                        401: { description: 'Missing or invalid X-API-Key', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } } },
                        404: { description: 'Credit/Debit note: the original invoice number was not found for this company', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } } },
                        409: { description: 'Duplicate invoiceNumber for this company — safe proof that an earlier attempt already fiscalized', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } } },
                        422: {
                            description: 'Fiscalization rejected by your fiscal provider (device not registered, day not open, preflight issues, etc.)',
                            content: {
                                'application/json': {
                                    schema: {
                                        type: 'object',
                                        properties: {
                                            error: { type: 'string', example: 'FISCALIZATION_FAILED' },
                                            message: { type: 'string' },
                                            statusCode: { type: 'integer' },
                                            issues: {
                                                type: 'array',
                                                description: 'Specific preflight validation failures (present when preflight rejects the receipt)',
                                                items: {
                                                    type: 'object',
                                                    properties: {
                                                        code: { type: 'string', example: 'RCPT024' },
                                                        message: { type: 'string' },
                                                    }
                                                }
                                            },
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
                    tags: ['Fiscal Device'],
                    responses: {
                        200: { description: 'Status retrieved', content: { 'application/json': { schema: { $ref: '#/components/schemas/DeviceStatus' } } } },
                    },
                }
            },
            '/api/v1/fiscal/ping': {
                post: {
                    summary: 'Ping Fiscal Server',
                    description: 'Connectivity check against the gateway of the provider your company is registered with. Replies `{ isOnline, provider, latencyMs, timestamp }`.',
                    tags: ['Fiscal Device'],
                    responses: {
                        200: { description: 'Server online' },
                        400: { description: 'No fiscal device registered for this company', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } } },
                        500: { description: 'Connection failed' },
                    },
                }
            },
            '/api/v1/fiscal/open-day': {
                post: {
                    summary: 'Open Fiscal Day',
                    description: `Opens today's fiscal day on your device and resets the local receipt counter. Returns \`{ provider, fiscalDayNo }\`; if a day is already open the call succeeds and says so instead of opening a second one.

Open a day before the first receipt of the morning — a receipt submitted with no open day is rejected by the gateway.`,
                    tags: ['Fiscal Device'],
                    responses: {
                        200: { description: 'Fiscal day opened (or already open)' },
                        400: { description: 'No fiscal device registered for this company (or it is missing its signing credentials), or the provider refused the call', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } } },
                        401: { description: 'Missing or invalid X-API-Key', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } } },
                    },
                }
            },
            '/api/v1/fiscal/close-day': {
                post: {
                    summary: 'Close Fiscal Day (Z-Report)',
                    description: `Closes the open fiscal day and generates the Z-Report from the receipts recorded against it. Counters are computed server-side from stored receipts; the gateway's answer is the authority on whether the day closed.

Some gateways confirm closure asynchronously — a \`202\` means the request was accepted but not yet confirmed, so re-check \`GET /api/v1/fiscal/status\` before assuming the day is closed. A rejected closure leaves the day open so you can fix the reported problem and retry.`,
                    tags: ['Fiscal Device'],
                    responses: {
                        200: { description: 'Z-Report generated and the day closed' },
                        202: { description: 'Closure submitted but not yet confirmed by the gateway' },
                        400: { description: 'No fiscal device registered, no day open, the provider rejected the closure, or local receipts failed preflight', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } } },
                        401: { description: 'Missing or invalid X-API-Key', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } } },
                    },
                }
            },
            '/api/v1/fiscal/status': {
                get: {
                    summary: 'Get Live Device Status',
                    description: `Live fiscal-day status read straight from the gateway of the provider your company is registered with.

Read-only: unlike the dashboard view, this call never writes back to your local counters, so it is safe to poll. Use it to check \`fiscalDayStatus\` before a batch of sales, and \`lastFiscalDayNo\` / \`lastReceiptCounter\` when reconciling.

The \`data\` object is the provider's own payload — \`provider\` tells you which gateway answered (\`ZIMRA\` or \`LEKUKA\`).`,
                    tags: ['Fiscal Device'],
                    responses: {
                        200: {
                            description: 'Status retrieved from the device gateway',
                            content: {
                                'application/json': {
                                    schema: { $ref: '#/components/schemas/ProviderRead' },
                                }
                            }
                        },
                        400: { description: 'No fiscal device registered for this company (or it is missing its signing credentials), or the provider refused the call', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } } },
                        401: { description: 'Missing or invalid X-API-Key', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } } },
                    },
                }
            },
            '/api/v1/fiscal/config': {
                get: {
                    summary: 'Get Device Configuration',
                    description: `The device configuration your company is registered under. The shape is the gateway's own — a ZIMRA-registered company returns taxpayer identity (\`taxPayerName\`, \`taxPayerTIN\`, \`vatNumber\`), \`deviceSerialNo\`, branch name and address, \`deviceOperatingMode\`, the live \`applicableTaxes\` table (the tax IDs every receipt line must reference) and **\`certificateValidTill\` — the date the device certificate expires**; other providers return their equivalent fields.

Renewal is a deliberate, manual operation: watch \`certificateValidTill\` here and re-issue the certificate about a month before it expires, ideally before opening a new fiscal day. Renewing rotates the device key pair, so any till that caches signing keys must re-provision afterwards.

Read-only — this does not re-sync the tax table into FiscalStack.`,
                    tags: ['Fiscal Device'],
                    responses: {
                        200: {
                            description: 'Configuration retrieved from the device gateway',
                            content: {
                                'application/json': {
                                    schema: {
                                        allOf: [
                                            { $ref: '#/components/schemas/ProviderRead' },
                                            {
                                                type: 'object',
                                                properties: {
                                                    data: {
                                                        type: 'object',
                                                        properties: {
                                                            taxPayerName: { type: 'string' },
                                                            taxPayerTIN: { type: 'string' },
                                                            vatNumber: { type: 'string', nullable: true },
                                                            deviceSerialNo: { type: 'string' },
                                                            deviceOperatingMode: { type: 'string', description: 'Operating mode reported by the gateway (e.g. Test / Production)' },
                                                            certificateValidTill: { type: 'string', format: 'date', description: 'Expiry date of the current device certificate' },
                                                            applicableTaxes: { type: 'array', items: { type: 'object' }, description: 'Live tax table — the IDs receipts must reference' },
                                                            qrUrl: { type: 'string', nullable: true, description: 'Base URL the receipt QR code points to' },
                                                        }
                                                    }
                                                }
                                            }
                                        ]
                                    }
                                }
                            }
                        },
                        400: { description: 'No fiscal device registered for this company (or it is missing its signing credentials), or the provider refused the call', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } } },
                        401: { description: 'Missing or invalid X-API-Key', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } } },
                    },
                }
            },
            '/api/v1/fiscal/server-certificate': {
                get: {
                    summary: 'Get Server Certificate',
                    description: `The gateway's own public certificate chain. This is the certificate a client trusts when talking to your fiscal provider directly — useful for diagnostics, pinning, and verifying that a receipt QR or verification URL is signed by the right environment.

Public endpoint: it does not use your device key pair, so it answers even while no fiscal day is open.

\`thumbprint\` selects a single certificate on one gateway and is ignored on the other — check \`provider\` in the response.`,
                    tags: ['Fiscal Device'],
                    parameters: [
                        { in: 'query', name: 'thumbprint', required: false, schema: { type: 'string' }, description: 'Select one certificate by thumbprint — honoured by one gateway, ignored by the other' },
                    ],
                    responses: {
                        200: {
                            description: 'Server certificate(s) retrieved',
                            content: {
                                'application/json': {
                                    schema: { $ref: '#/components/schemas/ProviderRead' },
                                }
                            }
                        },
                        400: { description: 'No fiscal device registered for this company (or it is missing its signing credentials), or the provider refused the call', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } } },
                        401: { description: 'Missing or invalid X-API-Key', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } } },
                    },
                }
            },
            '/api/v1/fiscal/certificate/issue': {
                post: {
                    summary: 'Issue / Renew Device Certificate',
                    description: `Replaces the device security certificate that signs every receipt. Call it when \`GET /api/v1/fiscal/config\` shows \`certificateValidTill\` close, or when the gateway starts rejecting submissions with a certificate error.

By default the key pair is generated here and only the new certificate is returned — the private key is stored and never sent back. Send your own \`certificateRequest\` (PEM CSR) if the private key must stay on your side; then only the issued certificate is stored.

**Renewal is destructive to cached credentials.** After a successful renewal every till or desktop client that holds the old key pair must re-provision before it can sign again, so schedule it between closing one fiscal day and opening the next. One gateway activates the new certificate immediately; the other needs \`POST /api/v1/fiscal/certificate/confirm\` afterwards — the response says which with \`confirmationRequired\`.`,
                    tags: ['Fiscal Device'],
                    requestBody: {
                        required: false,
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    properties: {
                                        certificateRequest: { type: 'string', description: 'Optional PEM certificate signing request, when the private key stays client-side' },
                                    }
                                }
                            }
                        }
                    },
                    responses: {
                        200: {
                            description: 'Renewal processed; read confirmationRequired before issuing receipts',
                            content: {
                                'application/json': {
                                    schema: { $ref: '#/components/schemas/CertificateIssue' },
                                }
                            }
                        },
                        400: { description: 'No fiscal device registered for this company (or it is missing its signing credentials), the provider refused the request, or it does not accept a caller-supplied CSR', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } } },
                        401: { description: 'Missing or invalid X-API-Key', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } } },
                    },
                }
            },
            '/api/v1/fiscal/certificate/confirm': {
                post: {
                    summary: 'Confirm Device Certificate',
                    description: `Second half of a two-step renewal: activates the certificate that \`POST /api/v1/fiscal/certificate/issue\` just stored. The thumbprint is taken from the stored certificate, so call this immediately after issuing one and nothing else.

Gateways that issue certificates in a single step answer \`400 NOT_SUPPORTED\` — that is not an error, it means no confirmation exists to send.`,
                    tags: ['Fiscal Device'],
                    responses: {
                        200: {
                            description: 'Confirmation submitted to the gateway',
                            content: {
                                'application/json': {
                                    schema: { $ref: '#/components/schemas/ProviderRead' },
                                }
                            }
                        },
                        400: { description: 'No fiscal device registered, the provider refused the confirmation, or its gateway needs no confirmation', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } } },
                        401: { description: 'Missing or invalid X-API-Key', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } } },
                    },
                }
            },
            '/api/v1/fiscal/device-details': {
                get: {
                    summary: 'Get Card Details (GetCardDetails)',
                    tags: ['Fiscalisation API'],
                    responses: {
                        200: { description: 'Device Details retrieved successfully' },
                        404: { description: 'Device not found or not registered' },
                    },
                }
            },
            '/api/v1/fiscal/device-status': {
                get: {
                    summary: 'Get Device Status (GetDeviceStatus)',
                    tags: ['Fiscalisation API'],
                    
                    responses: {
                        200: { description: 'Device Status retrieved successfully' },
                        400: { description: 'Company has no registered fiscal device' },
                    },
                }
            },
            '/api/v1/fiscal/register': {
                post: {
                    summary: 'Register Fiscal Device',
                    tags: ['Fiscalisation API'],
                    responses: { 200: { description: 'Device registered successfully' } }
                }
            },
            '/api/v1/fiscal/verify-taxpayer': {
                post: {
                    summary: 'Verify Taxpayer Information',
                    tags: ['Fiscalisation API'],
                    responses: { 200: { description: 'Taxpayer verified' } }
                }
            },
            '/api/v1/fiscal/transact': {
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
