# Swagger Auth Protection — Change Documentation

## Overview

A middleware guard was added to the Swagger UI endpoint (`/api-docs`) to restrict public access in production. **This change has been reverted.** The endpoint is now publicly accessible again, exactly as it was before.

**File affected:** `server/swagger.ts`
**Lines affected:** 755–775
**Deployment:** Reverted and deployed to production server (`161.97.115.59`)

---

## What It Was BEFORE the Change (Original State)

```typescript
export function setupSwagger(app: Express) {
    const specs = swaggerJsdoc(options);
    app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(specs, {
        customCss: '.swagger-ui .topbar { display: none }',
        customSiteTitle: "FiscalStack Integration API Docs"
    }));
    console.log('Swagger UI configured for Integration API (v1)');
}
```

### Behaviour
- `/api-docs` is mounted with **no authentication or access control**.
- Anyone on the internet can browse to `https://fiscalstack.co.zw/api-docs` and view the full API documentation, including all endpoint paths, request/response schemas, and parameter definitions.
- No middleware runs before `swaggerUi.serve` — the request goes straight to the Swagger UI static files.
- No environment variables are read for access control purposes.

---

## What It Was AFTER the Change (Now Reverted)

```typescript
export function setupSwagger(app: Express) {
    const specs = swaggerJsdoc(options);

    // Swagger docs require API key in production unless SWAGGER_OPEN=true
    const swaggerGuard = (req: any, res: any, next: any) => {
        if (process.env.NODE_ENV === "production" && process.env.SWAGGER_OPEN !== "true") {
            const apiKey = req.headers["x-api-key"];
            const authHeader = req.headers.authorization;
            if (apiKey && apiKey === process.env.SWAGGER_API_KEY) return next();
            if (authHeader && authHeader === `Bearer ${process.env.SWAGGER_API_KEY}`) return next();
            return res.status(401).json({ message: "API docs require authentication. Provide x-api-key header." });
        }
        next();
    };

    app.use('/api-docs', swaggerGuard, swaggerUi.serve, swaggerUi.setup(specs, {
        customCss: '.swagger-ui .topbar { display: none }',
        customSiteTitle: "FiscalStack Integration API Docs"
    }));
    console.log('Swagger UI configured for Integration API (v1)');
}
```

### Behaviour (during the change)
- A `swaggerGuard` middleware was inserted **before** `swaggerUi.serve`.
- In production (`NODE_ENV=production`), the guard checked for a valid API key:
  - Via `x-api-key` request header, compared against `process.env.SWAGGER_API_KEY`
  - Via `Authorization: Bearer <key>` header, compared against `process.env.SWAGGER_API_KEY`
- If neither matched, the request was rejected with `401 Unauthorized`.
- If `SWAGGER_OPEN=true` env var was set, the guard was bypassed entirely (open access).
- In non-production environments (`NODE_ENV !== "production"`), the guard was always bypassed.

---

## What It Is NOW (Reverted to Original)

Identical to the original state. The `swaggerGuard` middleware has been removed entirely.

**Verification:** After deployment, `curl https://fiscalstack.co.zw/api-docs` returns `200 OK` (the Swagger UI HTML page) without any `x-api-key` header.

---

## Why It Was Added

The security audit (MEDIUM finding) identified that the Swagger docs expose the full API surface to anyone who discovers the URL. This could help an attacker:
- Map all available endpoints and their parameters.
- Understand request/response schemas for crafting payloads.
- Identify authentication mechanisms and potential attack vectors.

The guard was intended as a light layer of obscurity — not a strong security control, but enough to prevent casual discovery.

## Why It Was Reverted

The decision was made that the benefits of having publicly accessible API documentation outweighed the risk:
- API docs are useful for integration partners, frontend developers, and third-party consumers.
- The API itself is already protected by rate limiting, authentication middleware, and CORS restrictions.
- Swagger docs are read-only and do not expose secrets (the `privateKey` leak was already fixed in a separate change).
- The endpoints themselves remain secure — documentation visibility does not weaken endpoint security.

---

## Environment Variables Involved (No Longer Needed)

| Variable | Purpose | Required? |
|---|---|---|
| `SWAGGER_API_KEY` | The API key that the guard compared against | No — guard removed |
| `SWAGGER_OPEN` | If set to `"true"`, bypasses the guard in production | No — guard removed |

Neither of these variables needs to be set in the server `.env` file.

---

## Audit Trail

| Date | Action | By |
|---|---|---|
| 13 Sep 2026 | Swagger auth guard added | Security audit (automated) |
| 13 Sep 2026 | Swagger auth guard reverted | User request |
