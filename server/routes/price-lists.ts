import { Router } from "express";
import { z } from "zod";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "../db.js";
import {
  customers,
  departments,
  priceListItems,
  priceLists,
  productVariations,
  products,
} from "../../shared/schema.js";
import { userHasPermission } from "../lib/permissions.js";
import { resolveSalesUnitPrice } from "../lib/pricing.js";
import { logAction } from "../audit.js";

const dateField = z.coerce.date().nullable().optional();
const itemSchema = z.object({
  productId: z.coerce.number().int().positive(),
  variationId: z.coerce.number().int().positive().nullable().optional(),
  unitPrice: z.coerce.number().nonnegative(),
  minQuantity: z.coerce.number().positive().default(1),
  isActive: z.boolean().default(true),
  effectiveFrom: dateField,
  effectiveTo: dateField,
});
const listSchema = z.object({
  code: z.string().trim().min(1).max(40),
  name: z.string().trim().min(1).max(160),
  departmentId: z.coerce.number().int().positive().nullable().optional(),
  customerId: z.coerce.number().int().positive().nullable().optional(),
  currency: z.string().trim().max(10).nullable().optional(),
  priority: z.coerce.number().int().default(0),
  isActive: z.boolean().default(true),
  effectiveFrom: dateField,
  effectiveTo: dateField,
  items: z.array(itemSchema).default([]),
});

const httpError = (status: number, message: string): Error & { status: number } =>
  Object.assign(new Error(message), { status });

export function createPriceListsRouter(requireAuth: any, requireCompanyAccess: any) {
  const router = Router();
  const base = [requireAuth, requireCompanyAccess];

  async function can(req: any, permission: string) {
    if (!req.user?.id) return false;
    return userHasPermission(
      req.user.id,
      Number(req.params.companyId),
      permission,
      Boolean(req.user?.isSuperAdmin),
    );
  }

  const need = (permission: string) => [
    ...base,
    async (req: any, res: any, next: any) => {
      if (await can(req, permission)) return next();
      return res.status(403).json({ error: `Permission required: ${permission}` });
    },
  ];

  async function assertReferences(companyId: number, body: z.infer<typeof listSchema>) {
    if (body.departmentId) {
      const [row] = await db
        .select({ id: departments.id })
        .from(departments)
        .where(and(eq(departments.id, body.departmentId), eq(departments.companyId, companyId)))
        .limit(1);
      if (!row) throw httpError(422, "Department does not belong to this company");
    }
    if (body.customerId) {
      const [row] = await db
        .select({ id: customers.id })
        .from(customers)
        .where(and(eq(customers.id, body.customerId), eq(customers.companyId, companyId)))
        .limit(1);
      if (!row) throw httpError(422, "Customer does not belong to this company");
    }

    const productIds = [...new Set(body.items.map((item) => item.productId))];
    if (productIds.length) {
      const rows = await db
        .select({ id: products.id })
        .from(products)
        .where(and(eq(products.companyId, companyId), inArray(products.id, productIds)));
      const found = new Set(rows.map((row) => row.id));
      if (productIds.some((id) => !found.has(id))) throw httpError(422, "A product does not belong to this company");
    }

    const variationIds = [...new Set(body.items.map((item) => item.variationId).filter((id): id is number => Boolean(id)))];
    if (variationIds.length) {
      const rows = await db
        .select({ id: productVariations.id })
        .from(productVariations)
        .innerJoin(products, eq(productVariations.productId, products.id))
        .where(and(eq(products.companyId, companyId), inArray(productVariations.id, variationIds)));
      const found = new Set(rows.map((row) => row.id));
      if (variationIds.some((id) => !found.has(id))) throw httpError(422, "A variation does not belong to this company");
    }
  }

  async function loadList(companyId: number, id: number) {
    const [row] = await db
      .select()
      .from(priceLists)
      .where(and(eq(priceLists.id, id), eq(priceLists.companyId, companyId)))
      .limit(1);
    if (!row) throw httpError(404, "Price list not found");
    const items = await db
      .select()
      .from(priceListItems)
      .where(eq(priceListItems.priceListId, id));
    return { ...row, items };
  }

  router.get("/companies/:companyId/price-lists", ...need("invoices.view"), async (req: any, res) => {
    try {
      const companyId = Number(req.params.companyId);
      const rows = await db
        .select()
        .from(priceLists)
        .where(eq(priceLists.companyId, companyId));
      const items = rows.length
        ? await db.select().from(priceListItems)
        : [];
      res.json(rows.map((row) => ({
        ...row,
        items: items.filter((item) => item.priceListId === row.id),
      })));
    } catch (err: any) {
      res.status(err.status || 500).json({ message: err.message || "Could not load price lists" });
    }
  });

  // Registered before /:id so the literal path is not captured as an id.
  router.get("/companies/:companyId/price-lists/effective", ...need("invoices.view"), async (req: any, res) => {
    try {
      const companyId = Number(req.params.companyId);
      const parsed = z.object({
        productId: z.coerce.number().int().positive(),
        departmentId: z.coerce.number().int().positive().optional(),
        customerId: z.coerce.number().int().positive().optional(),
        variationId: z.coerce.number().int().positive().optional(),
        quantity: z.coerce.number().nonnegative().default(1),
        fallbackUnitPrice: z.coerce.number().nonnegative().default(0),
      }).parse(req.query);
      const result = await resolveSalesUnitPrice({
        companyId,
        ...parsed,
        asOf: new Date(),
      });
      res.json(result);
    } catch (err: any) {
      res.status(err.status || 400).json({ message: err.message || "Could not resolve price" });
    }
  });

  router.get("/companies/:companyId/price-lists/:id", ...need("invoices.view"), async (req: any, res) => {
    try {
      const companyId = Number(req.params.companyId);
      const id = Number(req.params.id);
      if (!Number.isInteger(id)) return res.status(400).json({ message: "Invalid price list id" });
      res.json(await loadList(companyId, id));
    } catch (err: any) {
      res.status(err.status || 500).json({ message: err.message || "Could not load price list" });
    }
  });

  router.post("/companies/:companyId/price-lists", ...need("sales.price-lists.manage"), async (req: any, res) => {
    try {
      const companyId = Number(req.params.companyId);
      const body = listSchema.parse(req.body);
      await assertReferences(companyId, body);
      const created = await db.transaction(async (tx) => {
        const [list] = await tx.insert(priceLists).values({
          companyId,
          code: body.code,
          name: body.name,
          departmentId: body.departmentId ?? null,
          customerId: body.customerId ?? null,
          currency: body.currency ?? null,
          priority: body.priority,
          isActive: body.isActive,
          effectiveFrom: body.effectiveFrom ?? null,
          effectiveTo: body.effectiveTo ?? null,
        }).returning();
        if (body.items.length) {
          await tx.insert(priceListItems).values(body.items.map((item) => ({
            priceListId: list.id,
            productId: item.productId,
            variationId: item.variationId ?? null,
            unitPrice: String(item.unitPrice),
            minQuantity: String(item.minQuantity),
            isActive: item.isActive,
            effectiveFrom: item.effectiveFrom ?? null,
            effectiveTo: item.effectiveTo ?? null,
          })));
        }
        return list;
      });
      await logAction(companyId, req.user?.id || "system", "PRICE_LIST_CREATED", "price_list", String(created.id), {
        code: created.code,
        departmentId: created.departmentId,
        customerId: created.customerId,
      });
      res.status(201).json(await loadList(companyId, created.id));
    } catch (err: any) {
      if (err?.code === "23505") return res.status(409).json({ message: "A price list with that code already exists" });
      res.status(err.status || 400).json({ message: err.message || "Could not create price list" });
    }
  });

  router.put("/companies/:companyId/price-lists/:id", ...need("sales.price-lists.manage"), async (req: any, res) => {
    try {
      const companyId = Number(req.params.companyId);
      const id = Number(req.params.id);
      if (!Number.isInteger(id)) return res.status(400).json({ message: "Invalid price list id" });
      const body = listSchema.parse(req.body);
      await assertReferences(companyId, body);
      await loadList(companyId, id);
      await db.transaction(async (tx) => {
        await tx.update(priceLists).set({
          code: body.code,
          name: body.name,
          departmentId: body.departmentId ?? null,
          customerId: body.customerId ?? null,
          currency: body.currency ?? null,
          priority: body.priority,
          isActive: body.isActive,
          effectiveFrom: body.effectiveFrom ?? null,
          effectiveTo: body.effectiveTo ?? null,
          updatedAt: new Date(),
        }).where(and(eq(priceLists.id, id), eq(priceLists.companyId, companyId)));
        await tx.delete(priceListItems).where(eq(priceListItems.priceListId, id));
        if (body.items.length) {
          await tx.insert(priceListItems).values(body.items.map((item) => ({
            priceListId: id,
            productId: item.productId,
            variationId: item.variationId ?? null,
            unitPrice: String(item.unitPrice),
            minQuantity: String(item.minQuantity),
            isActive: item.isActive,
            effectiveFrom: item.effectiveFrom ?? null,
            effectiveTo: item.effectiveTo ?? null,
          })));
        }
      });
      await logAction(companyId, req.user?.id || "system", "PRICE_LIST_UPDATED", "price_list", String(id), { code: body.code });
      res.json(await loadList(companyId, id));
    } catch (err: any) {
      if (err?.code === "23505") return res.status(409).json({ message: "A price list with that code already exists" });
      res.status(err.status || 400).json({ message: err.message || "Could not update price list" });
    }
  });

  router.delete("/companies/:companyId/price-lists/:id", ...need("sales.price-lists.manage"), async (req: any, res) => {
    try {
      const companyId = Number(req.params.companyId);
      const id = Number(req.params.id);
      if (!Number.isInteger(id)) return res.status(400).json({ message: "Invalid price list id" });
      await loadList(companyId, id);
      // Deactivate rather than delete: historical invoices may reference the
      // list that determined their price.
      await db.update(priceLists)
        .set({ isActive: false, updatedAt: new Date() })
        .where(and(eq(priceLists.id, id), eq(priceLists.companyId, companyId)));
      await logAction(companyId, req.user?.id || "system", "PRICE_LIST_DEACTIVATED", "price_list", String(id));
      res.json({ ok: true });
    } catch (err: any) {
      res.status(err.status || 500).json({ message: err.message || "Could not deactivate price list" });
    }
  });

  return router;
}
