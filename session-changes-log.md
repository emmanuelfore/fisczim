# FiscalStack POS — Session Changes Log

**Date:** 13 September 2026
**Server:** `161.97.115.59` (fiscalstack.co.zw, fiscalzone.co.zw)
**Branch:** `main`

---

## Table of Contents

1. [Security Fixes (17 items)](#security-fixes)
2. [Performance Fixes (3 items)](#performance-fixes)
3. [POS Offline Improvements (5 items)](#pos-offline-improvements)
4. [Deployed Sites](#deployed-sites)
5. [Reverted Changes](#reverted-changes)

---

## Security Fixes

### CRITICAL #1 — CORS Restriction
**File:** `server/index.ts` (lines 22–40)

**Before:** CORS accepted requests from any origin (`*`).
**After:** CORS restricted to production domains only.

```
Allowed origins:
  https://fiscalstack.co.zw
  https://www.fiscalstack.co.zw
  https://fiscalzone.co.zw
  https://www.fiscalzone.co.zw
  http://localhost:5000
  http://localhost:3000
```

**Why:** Prevents any third-party site from making authenticated API requests to the backend using a user's browser session.

---

### CRITICAL #2 — Rate Limiting
**Files:** `server/index.ts` (lines 42–58), `server/routes/auth.ts` (lines 13–19)

**Before:** No rate limiting on any endpoint.
**After:** Two rate limiters applied.

| Limiter | Scope | Limit | Window |
|---|---|---|---|
| `globalLimiter` | `/api` (all API routes) | 200 requests | 15 minutes |
| `authLimiter` | `/api/auth/login`, `/api/auth/register` | 10 requests | 15 minutes |

**Why:** Prevents brute-force attacks on login, credential stuffing, and API abuse. Standard `RateLimit-*` headers included in responses.

---

### CRITICAL #3 — ZIMRA Private Key Leak
**File:** `server/routes.ts` (`GET /api/companies/:id/zimra/offline-state`)

**Before:** The response included `privateKey` in the JSON payload, exposed to any authenticated user of that company.
**After:** `privateKey` is excluded from the response before sending.

**Why:** The private key is used to sign ZIMRA fiscal receipts. Leaking it allows anyone to forge fiscal documents.

---

### CRITICAL #4 — IDOR Fixes (6 endpoints)
**File:** `server/routes.ts`

**Before:** These endpoints accepted any authenticated user and used `req.body.companyId` or URL params without verifying the user belonged to that company.

| Endpoint | Method | Fix Applied |
|---|---|---|
| `/api/invoices/:id` | GET | `checkCompanyAccess` middleware added |
| `/api/invoices/:id` | DELETE | `checkCompanyAccess` middleware added |
| `/api/payments/:id` | DELETE | `checkCompanyAccess` middleware added |
| `/api/quotations/:id` | GET | `checkCompanyAccess` middleware added |
| `/api/branches/:id` | GET | `checkCompanyAccess` middleware added |
| `/api/jobs/logs` | GET | `checkCompanyAccess` middleware added |

**Why:** Insecure Direct Object References allow an attacker to access other companies' invoices, payments, and data by guessing IDs.

---

### HIGH #5 — Helmet Middleware
**File:** `server/index.ts` (lines 60–64)

**Before:** No security headers set on HTTP responses.
**After:** `helmet()` middleware applied globally. `contentSecurityPolicy` and `crossOriginEmbedderPolicy` disabled for compatibility.

```
Helmet sets headers:
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  X-XSS-Protection: 0
  Strict-Transport-Security: max-age=31536000; includeSubDomains
  Referrer-Policy: no-why-referrer-when-downgrade
  ... and more
```

**Why:** Standard security headers protect against clickjacking, MIME sniffing, and other browser-based attacks.

---

### HIGH #6 — PIN Endpoint Auth
**File:** `server/routes.ts` (`PUT /api/companies/:id/users/:userId/pin`)

**Before:** Any authenticated user could set another user's PIN.
**After:** Requires owner or admin permission via `requireAuthOrApiKey` + permission check.

**Why:** Without this, any user could overwrite a manager's or owner's PIN, escalating privileges.

---
### HIGH #9 — LEKUKA Advisory Lock

**File:** `server/lib/fiscalization.ts` (`processInvoiceFiscalizationLEKUKA`)

**Before:** No concurrency guard. Multiple simultaneous fiscalization requests could race and corrupt the receipt counter.
**After:** Wrapped with `acquireFiscalDeviceLock()` / `releaseFiscalDeviceLock()` using PostgreSQL `pg_advisory_lock`.

**Why:** Prevents two invoices from being assigned the same fiscal receipt number when processed concurrently.

---

### HIGH #10 — TLS Verification
**File:** `server/zimra.ts`

**Before:** ZIMRA HTTPS requests used default TLS settings (which may include `rejectUnauthorized: false` in some configurations).
**After:** `rejectUnauthorized: process.env.NODE_ENV === "production"` — TLS certificate validation enforced in production, relaxed only for development/testing.

**Why:** Without TLS verification, a man-in-the-middle could intercept and modify ZIMRA fiscal communications.

---

### HIGH #12 — Sage OAuth Auth
**File:** `server/routes.ts` (`/api/sage/oauth` routes)

**Before:** Sage OAuth callback/token endpoints had no authentication middleware.
**After:** `requireAuthOrApiKey` middleware applied to all Sage OAuth routes.

**Why:** Unauthenticated access to OAuth endpoints could allow token theft or session hijacking.

---

### MEDIUM #13 — Timing-Safe Hash Comparison
**File:** `server/routes/auth.ts`

**Before:** `===` operator used for comparing PBKDF2 password hashes (vulnerable to timing attacks).
**After:** `crypto.timingSafeEqual()` used for constant-time comparison.

**Why:** Standard string comparison leaks hash information through response time variations (timing side-channel attack).

---

### MEDIUM #14 — updateCompany Allowlist
**File:** `server/routes.ts` (`PUT /api/companies/:id`)

**Before:** All fields from `req.body` were passed to the database update.
**After:** Only allowed fields are updated: `name`, `tradingName`, `tin`, `vatNumber`, `vatRegistered`, `vatEnabled`, `fdmsDeviceId`, `fdmsDeviceSerialNo`, `fdmsApiKey`, `zimraEnvironment`, `appMode`, `posSettings`, `taxProfile`, `primaryCurrencyId`.

Blocked fields include: `apiKey`, `zimraPrivateKey`, `zimraCertificate`, `id`, `createdAt`, `role`.

**Why:** Mass assignment allows an attacker to overwrite sensitive fields (like `role`, `apiKey`) by including them in the request body.

---

### MEDIUM #15 — Password Policy
**File:** `server/routes/auth.ts` (line 137)

**Before:** Minimum password length was 6 characters.
**After:** Minimum password length increased to 8 characters.

**Why:** Short passwords are significantly easier to brute-force. 8 characters is the minimum recommended by OWASP.

---

### MEDIUM #16 — Token Revocation on Password Change
**File:** `server/routes.ts` (`PUT /api/companies/:id/users/:userId/password`)

**Before:** Changing a password did not invalidate existing refresh tokens.
**After:** `db.delete(refreshTokensTable).where(eq(refreshTokensTable.userId, userId))` is called after password change, revoking all refresh tokens for that user.

**Why:** If a password was changed because of a compromise, the attacker's existing refresh tokens would remain valid indefinitely.

---

### MEDIUM #19 — Auth Logging PII Cleanup
**Files:** `server/auth.ts`, `server/lib/jwt.ts` (`requireAuth`)

**Before:** Login success/failure events logged the user's email, name, and superadmin status. The `requireAuth` middleware logged the same on every authenticated request.
**After:** Logs no longer include email, name, or superadmin status. Only non-PII identifiers (userId) are logged where needed.

**Why:** PII in logs creates compliance issues (GDPR, POPIA) and increases blast radius of log data breaches.

---

### MEDIUM #21 — Night-Close Verification Timeout
**File:** `server/jobs.ts` (lines 338–360)

**Before:** After closing a fiscal day, the verification call `device.getStatus()` had no timeout. If ZIMRA was unreachable, the job would hang indefinitely.
**After:** `device.getStatus()` is wrapped in a `Promise.race` with a 15-second timeout. On timeout, the fiscal day is marked as `FiscalDayCloseFailed` and the loop continues to the next company.

**Why:** A hanging job blocks the entire midnight closure sweep for all companies. Timeout ensures one company's ZIMRA outage doesn't affect others.

---

### MEDIUM #17 — Registration Gate
**File:** `server/routes/auth.ts` (lines 125–129)

**Before:** Anyone could create an account via `POST /api/auth/register` without restriction.
**After:** In production, registration is blocked unless `ALLOW_REGISTRATION=true` is set in the environment. Returns `403 Forbidden`.

**Why:** Open registration in production allows anyone to create accounts and access the system. Registration should be controlled by administrators.

---

### Swagger Auth Protection — ADDED THEN REVERTED
**File:** `server/swagger.ts`

**Before (original):** `/api-docs` publicly accessible.
**After (added):** `/api-docs` required `x-api-key` header in production.
**After (reverted):** `/api-docs` publicly accessible again (original state).

See `swagger-auth-change-doc.md` for full details.

---

## Performance Fixes

### DB Indexes (6 indexes)
**File:** `server/storage.ts`

Added indexes on frequently queried columns to improve query performance:

| Table | Column | Purpose |
|---|---|---|
| `invoices` | `companyId` | Company-scoped invoice queries |
| `invoices` | `branchId` | Branch-scoped invoice queries |
| `invoices` | `customer_id` | Customer invoice history |
| `invoices` | `cashier_id` | Cashier activity reports |
| `invoice_items` | `product_id` | Product sales reports |
| `invoice_items` | `invoice_id` | Invoice detail lookups |

---

### Connection Pool Sizing
**File:** `server/db.ts`

**Before:** `max: 5` connections per pool.
**After:** `max: 15` connections per pool.

**Why:** The server runs three applications (fiscalstack, fiscalzone, fiscalstack_lesotho) sharing a PostgreSQL instance. 5 connections was too low under concurrent load, causing connection wait times.

---

### Maintenance Transaction
**File:** `server/db.ts`

Added periodic `VACUUM ANALYZE` scheduling to prevent table bloat and keep query planner statistics up to date.

---

### resolveAccountingCompanyId Fix
**File:** `server/routes.ts`

**Before:** The function accepted `req.body.companyId` and `req.headers["x-company-id"]` as primary sources for determining the company ID. This allowed any authenticated user to act on any company by setting these headers/body fields.
**After:** Company ID is resolved from URL param → query param → session. `req.body.companyId` is only used as a validated fallback.

**Why:** IDOR vulnerability — header/body manipulation bypassed company scoping.

---

## POS Offline Improvements

### 1. Product Serials Cache
**Files:** `client/src/lib/offline-db.ts`, `client/src/hooks/use-auto-spares.ts`, `client/src/pages/pos.tsx`

**Before:** Product serial numbers were fetched from the server every time. If the server was unreachable, the serial number dropdown was empty — serial-tracked items could not be sold.
**After:**
- New `productSerials` IndexedDB store added (DB version 9 → 10).
- `useProductSerials` hook caches the full `IN_STOCK` serial list to IndexedDB on successful fetch.
- `pos.tsx` loads cached serials from IndexedDB on mount via `cachedSerialsFallback` state.
- If the server fetch fails but cached data exists, `effectiveSerials` uses the cached data.

**Impact:** Serial-tracked items can be sold offline with previously cached serial numbers.

---

### 2. Reprint Receipts Offline Fallback
**File:** `client/src/pages/pos.tsx` (`handleReprintLast`)

**Before:** `handleReprintLast` made a server call to `GET /api/pos/last-receipt`. If the server was unreachable, it showed "Failed to load receipts".
**After:** On server failure or network error, falls back to `getSalesHistory(companyId)` from IndexedDB, filtering for today's receipts. Shows them sorted by date descending, limited to 10.

**Impact:** Cashiers can reprint today's receipts even when offline.

---

### 3. Timeout Toast Improvement
**File:** `client/src/pages/pos.tsx` (AbortError handler, ~line 2131)

**Before:** When a request timed out, the toast showed:
> **Request Timed Out**
> "The request took too long or was interrupted. Please check your connection and try again."

This was alarming and unhelpful — the sale may have already been saved locally.

**After:**
- If offline: **Offline Mode** — "Connection interrupted. Your sale has been saved locally and will sync when you're back online." (no destructive variant)
- If online (server slow): **Request Timed Out** — "The server took too long to respond. The sale was saved locally and will retry automatically." (destructive variant)

**Impact:** Users are informed that their data is safe, not just that something failed.

---

### 4. Credit/Debit Note Search Offline
**File:** `client/src/pages/pos.tsx` (`handleCnSearch`)

**Before:** CN search (`GET /api/pos/invoice-search`) returned nothing when offline.
**After:** Falls back to searching `getSalesHistory(companyId)` in IndexedDB by receipt number, customer name, or invoice number. Returns up to 20 results.

**Impact:** Cashiers can search for past invoices to issue credit/debit notes while offline.

---

### 5. Invoice Details Offline Fallback
**File:** `client/src/pages/pos.tsx` (`handleSelectInvoiceForReturn`)

**Before:** Fetching a single invoice (`GET /api/invoices/:id`) for credit/debit note creation failed silently when offline.
**After:** Falls back to `getSaleHistoryById(id)` from IndexedDB, populating the CN form from cached invoice data.

**Impact:** Cashiers can view and process returns against previously cached invoices while offline.

---

## Deployed Sites

| Site | Domain | Type | Status |
|---|---|---|---|
| FiscalStack | fiscalstack.co.zw | Express + React (POS + Dashboard) | Running (PM2) |
| FiscalZone | fiscalzone.co.zw | Express + React (Multi-tenant) | Running (PM2) |
| Tee & Co | www.teeandco.co.zw | Static HTML (Nginx) | Live |
| Zivvvo | www.zivvvo.co.zw | React/Vite PWA (Nginx) | Live |

SSL auto-renewal configured for all domains via certbot.

---

## Reverted Changes

| Change | File | Reason |
|---|---|---|
| Swagger auth guard | `server/swagger.ts` | User decision — public API docs preferred |

---

## Git Commits

| Commit | Hash | Description |
|---|---|---|
| CRITICAL fixes | `95d6cd6` | CORS, rate-limiting, key leak, IDOR, helmet |
| LEKUKA lock + auth cleanup | `3fbb7f5` | Advisory lock, auth logging, PIN auth, Sage OAuth |

**Note:** Git push to remote times out due to repo size. All deployments done via direct SFTP file upload + server-side build.

---

## Deployment Method

All changes deployed via:
1. SFTP binary upload to `/var/www/fisczim/` using the `ssh2` Node.js module
2. Server-side `npm run build` (esbuild → `dist/index.cjs`)
3. `pm2 restart fiscalstack`

SSH credentials stored only in deploy scripts (cleaned up after use).

---

## Environment Variables Added/Required

| Variable | Purpose | Set on Server? |
|---|---|---|
| `JWT_SECRET` | JWT signing secret (regenerated) | Yes (in `.env`) |
| `JWT_REFRESH_SECRET` | Refresh token signing secret (regenerated) | Yes (in `.env`) |
| `ALLOW_REGISTRATION` | Enable open registration (`true`/`false`) | Not set (defaults to blocked in production) |
| `SWAGGER_API_KEY` | API key for Swagger docs (if guard were active) | Not needed (guard reverted) |
| `SWAGGER_OPEN` | Bypass Swagger guard (if guard were active) | Not needed (guard reverted) |
| `COUNTRY_SCOPE` | Country filter for Lesotho deployment (`lesotho`) | Yes (PM2 ecosystem) |

---

## Lekuka Spelling Fix

**Date:** 13 September 2026

All instances of misspelled "Lekaku" renamed to correct "Lekuka" (Revenue Services Lesotho product name).

### Code Renames (all `.ts` and `.tsx` files)
- PascalCase: `LekakuDevice` → `LekukaDevice`, `LekakuReceipt` → `LekukaReceipt`, etc.
- camelCase: `lekakuGatewayUrl` → `lekukaGatewayUrl`, `lekakuTaxId` → `lekukaTaxId`, etc.
- UPPER_CASE: `LEKAKU_TEST_GATEWAY` → `LEKUKA_TEST_GATEWAY`, etc.
- String literals: `"LEKAKU"` → `"LEKUKA"` in fiscalProvider values, UI text, comments
- Route paths: `/lekaku/` → `/lekuka/`
- Query keys: `"lekaku-product-levies"` → `"lekuka-product-levies"`

### File Renames
| Old Name | New Name |
|---|---|
| `server/lekaku.ts` | `server/lekuka.ts` |
| `shared/lekaku.ts` | `shared/lekuka.ts` |
| `client/src/components/settings/lekaku-configuration.tsx` | `client/src/components/settings/lekuka-configuration.tsx` |
| `server/tests/lekaku.test.ts` | `server/tests/lekuka.test.ts` |
| `server/tests/lekaku-taxes.test.ts` | `server/tests/lekuka-taxes.test.ts` |

### Database Migration
- `migrations/0069_lekuka_column_rename.sql` — Renames 8 columns from `lekaku_*` to `lekuka_*` in `companies` and `tax_types` tables
- Ran on production: all 8 ALTER TABLE statements succeeded

### Old Migration Files (unchanged — historical)
- `migrations/0067_lekaku_lesotho_configuration.sql` — Comments updated to LEKUKA
- `migrations/0068_lekaku_tax_authority.sql` — Comments updated to LEKUKA

---

## FiscalStack Lesotho Deployment

**Date:** 13 September 2026
**URL:** `https://fiscalstack.co.ls`
**Port:** 5002
**DB:** Same as Zimbabwe (`fisczim`), filtered by `COUNTRY_SCOPE=lesotho`

### Architecture
- Same codebase, same database — country-scope filtering via `COUNTRY_SCOPE=lesotho` env var
- `storage.ts` and `routes.ts` filter companies by country when `COUNTRY_SCOPE` is set
- `zimra.ts` routes fiscal gateway to Lekuka (RSL) when `COUNTRY_SCOPE=lesotho`
- All POS, HR/Payroll, invoicing modules identical to Zimbabwe

### Changes Made
1. **CORS** (`server/index.ts`): Added `fiscalstack.co.ls` and `www.fiscalstack.co.ls` to allowed origins
2. **PM2 Ecosystem** (`ecosystem.config.cjs` and `.json`): Added `fiscalstack_lesotho` app entry (PORT=5002, COUNTRY_SCOPE=lesotho)
3. **start.sh**: Saves/restores PM2-injected env vars (PORT, COUNTRY_SCOPE) around `.env` sourcing
4. **Nginx** (`/etc/nginx/sites-available/fiscalstack.co.ls`): Proxy to localhost:5002 with SSL (Certbot)
5. **Build**: Rebuilt `dist/index.cjs` on server with updated CORS and Lekuka references

### Server State
```
│ id │ name                 │ status │ port │ pid    │
│ 0  │ fiscalstack          │ online │ 5000 │ 3597762 │
│ 6  │ fiscalstack_lesotho  │ online │ 5002 │ 3601208 │
│ 1  │ fiscalzone           │ online │ 5001 │ 3529665 │
```

### Verification
- `https://fiscalstack.co.ls` → HTTP 200 ✓
- `localhost:5002/api/ping` → HTTP 200 ✓
- PM2 status: all 3 apps online ✓
