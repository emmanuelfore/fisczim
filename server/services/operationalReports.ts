import { db } from "../db.js";
import {
  invoices,
  invoiceItems,
  payments,
  expenses,
  products,
  inventoryTransactions,
  posShifts,
  posShiftTransactions,
} from "../../shared/schema.js";
import { and, eq, gte, lte, ne } from "drizzle-orm";
import {
  eachDayOfInterval,
  endOfDay,
  endOfMonth,
  endOfWeek,
  format,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from "date-fns";

// ── Types ─────────────────────────────────────────────────────────────────────

export type ProductSalesRow = {
  productId: number | null;
  productName: string;
  sku: string | null;
  quantity: string;
  revenue: string;
};

export type ProductionRow = {
  productId: number;
  productName: string;
  quantity: string;
};

export type ProductStockRow = {
  productId: number;
  productName: string;
  sku: string | null;
  openingStock: string;
  production: string;
  purchases: string;
  sales: string;
  adjustments: string;
  closingStock: string;
};

export type DailyOperationalRow = {
  date: string;
  openingCash: string;
  cashSales: string;
  creditSales: string;
  collections: string;
  expenses: string;
  moneyBanked: string;
  salesValue: string;
  production: ProductionRow[];
  salesByProduct: ProductSalesRow[];
  stockByProduct: ProductStockRow[];
};

export type PeriodSummaryRow = {
  periodKey: string;
  periodLabel: string;
  startDate: string;
  endDate: string;
  sales: string;
  cashSales: string;
  creditSales: string;
  collections: string;
  expenses: string;
  moneyBanked: string;
  production: ProductionRow[];
  stockMovement: ProductStockRow[];
};

export type StockMovementReport = {
  periodStart: string;
  periodEnd: string;
  products: ProductStockRow[];
  totals: {
    openingStock: string;
    production: string;
    purchases: string;
    sales: string;
    adjustments: string;
    closingStock: string;
  };
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmt = (n: number) => (Math.round(n * 100) / 100).toFixed(2);
const dateKey = (d: Date) => format(d, "yyyy-MM-dd");

function isSaleInvoice(inv: { transactionType?: string | null; status?: string | null }) {
  return inv.transactionType !== "CreditNote" && inv.status !== "cancelled";
}

function isCreditSale(inv: {
  paymentMethod?: string | null;
  isPos?: boolean | null;
  paidAmount?: string | null;
  total?: string | null;
}) {
  const method = (inv.paymentMethod || "").toUpperCase();
  if (method === "CREDIT" || method === "ON_ACCOUNT" || method === "ACCOUNT") return true;
  if (!inv.isPos) {
    const paid = Number(inv.paidAmount || 0);
    const total = Number(inv.total || 0);
    if (total > 0 && paid < total - 0.01) return true;
  }
  return false;
}

function isProductionTransaction(row: {
  type: string;
  referenceType?: string | null;
  notes?: string | null;
}) {
  const ref = (row.referenceType || "").toUpperCase();
  const notes = (row.notes || "").toLowerCase();
  return (
    ref.includes("PRODUCTION") ||
    ref.includes("MANUFACTURING") ||
    ref.includes("WORK_ORDER") ||
    notes.includes("production") ||
    notes.includes("manufactur")
  );
}

type StockDelta = { production: number; purchases: number; sales: number; adjustments: number };

function emptyStockDelta(): StockDelta {
  return { production: 0, purchases: 0, sales: 0, adjustments: 0 };
}

// ── Data loading ──────────────────────────────────────────────────────────────

async function loadOperationalData(companyId: number, start: Date, end: Date) {
  const rangeStart = startOfDay(start);
  const rangeEnd = endOfDay(end);

  const [saleRows, paymentRows, expenseRows, shiftRows, dropRows, productRows, txnRows, itemRows] =
    await Promise.all([
      db
        .select()
        .from(invoices)
        .where(
          and(
            eq(invoices.companyId, companyId),
            gte(invoices.issueDate, rangeStart),
            lte(invoices.issueDate, rangeEnd),
            ne(invoices.status, "draft"),
            ne(invoices.status, "quote"),
          ),
        ),
      db
        .select()
        .from(payments)
        .where(
          and(
            eq(payments.companyId, companyId),
            gte(payments.paymentDate, rangeStart),
            lte(payments.paymentDate, rangeEnd),
          ),
        ),
      db
        .select()
        .from(expenses)
        .where(
          and(
            eq(expenses.companyId, companyId),
            gte(expenses.expenseDate, rangeStart),
            lte(expenses.expenseDate, rangeEnd),
          ),
        ),
      db
        .select()
        .from(posShifts)
        .where(
          and(
            eq(posShifts.companyId, companyId),
            gte(posShifts.startTime, rangeStart),
            lte(posShifts.startTime, rangeEnd),
          ),
        ),
      db
        .select({
          amount: posShiftTransactions.amount,
          createdAt: posShiftTransactions.createdAt,
        })
        .from(posShiftTransactions)
        .innerJoin(posShifts, eq(posShiftTransactions.shiftId, posShifts.id))
        .where(
          and(
            eq(posShifts.companyId, companyId),
            eq(posShiftTransactions.type, "DROP"),
            gte(posShiftTransactions.createdAt, rangeStart),
            lte(posShiftTransactions.createdAt, rangeEnd),
          ),
        ),
      db.select().from(products).where(and(eq(products.companyId, companyId), eq(products.isTracked, true))),
      db
        .select()
        .from(inventoryTransactions)
        .where(
          and(
            eq(inventoryTransactions.companyId, companyId),
            lte(inventoryTransactions.createdAt, rangeEnd),
          ),
        ),
      db
        .select({
          item: invoiceItems,
          product: products,
          invoice: invoices,
        })
        .from(invoiceItems)
        .innerJoin(invoices, eq(invoiceItems.invoiceId, invoices.id))
        .leftJoin(products, eq(invoiceItems.productId, products.id))
        .where(
          and(
            eq(invoices.companyId, companyId),
            gte(invoices.issueDate, rangeStart),
            lte(invoices.issueDate, rangeEnd),
            ne(invoices.transactionType, "CreditNote"),
            ne(invoices.status, "cancelled"),
            ne(invoices.status, "draft"),
          ),
        ),
    ]);

  // Opening stock: transactions strictly before range start
  const openingTxnRows = txnRows.filter((t) => t.createdAt && new Date(t.createdAt) < rangeStart);

  // Production from manufacturing module (optional tables)
  let manufacturingProduction: { date: string; productId: number; productName: string; quantity: number }[] = [];
  try {
    const { manufacturingMaterialTransactions, workOrders } = await import(
      "../../shared/schema.js"
    );
    const mfgRows = await db
      .select({
        date: manufacturingMaterialTransactions.date,
        productId: manufacturingMaterialTransactions.productId,
        productName: products.name,
        quantity: manufacturingMaterialTransactions.quantity,
        type: manufacturingMaterialTransactions.type,
      })
      .from(manufacturingMaterialTransactions)
      .innerJoin(workOrders, eq(manufacturingMaterialTransactions.workOrderId, workOrders.id))
      .innerJoin(products, eq(manufacturingMaterialTransactions.productId, products.id))
      .where(
        and(
          eq(workOrders.companyId, companyId),
          gte(manufacturingMaterialTransactions.date, rangeStart),
          lte(manufacturingMaterialTransactions.date, rangeEnd),
        ),
      );

    manufacturingProduction = mfgRows
      .filter((r) => r.type === "FINISHED_GOOD" || r.type === "CO_PRODUCT")
      .map((r) => ({
        date: r.date ? dateKey(new Date(r.date)) : "unknown",
        productId: r.productId,
        productName: r.productName,
        quantity: Number(r.quantity || 0),
      }));
  } catch {
    // Manufacturing tables may not exist in all deployments
  }

  return {
    rangeStart,
    rangeEnd,
    saleRows,
    paymentRows,
    expenseRows,
    shiftRows,
    dropRows,
    productRows,
    txnRows,
    openingTxnRows,
    itemRows,
    manufacturingProduction,
  };
}

function buildStockMaps(
  productRows: (typeof products.$inferSelect)[],
  openingTxnRows: (typeof inventoryTransactions.$inferSelect)[],
  txnRows: (typeof inventoryTransactions.$inferSelect)[],
  rangeStart: Date,
  rangeEnd: Date,
) {
  const productMeta = new Map(
    productRows.map((p) => [p.id, { name: p.name, sku: p.sku }]),
  );

  const openingBalances = new Map<number, number>();
  for (const p of productRows) {
    openingBalances.set(p.id, 0);
  }

  const applyTxn = (map: Map<number, number>, txn: typeof inventoryTransactions.$inferSelect) => {
    let qty = Number(txn.quantity || 0);
    if (txn.type === "STOCK_OUT" && qty > 0) qty = -qty;
    else if (txn.type === "STOCK_IN" && qty < 0) qty = Math.abs(qty);
    map.set(txn.productId, (map.get(txn.productId) || 0) + qty);
  };

  for (const txn of openingTxnRows) {
    applyTxn(openingBalances, txn);
  }

  // Per-day deltas
  const dailyDeltas = new Map<string, Map<number, StockDelta>>();
  const periodDeltas = new Map<number, StockDelta>();

  const ensureDay = (key: string) => {
    if (!dailyDeltas.has(key)) dailyDeltas.set(key, new Map());
    return dailyDeltas.get(key)!;
  };

  const ensurePeriod = (productId: number) => {
    if (!periodDeltas.has(productId)) periodDeltas.set(productId, emptyStockDelta());
    return periodDeltas.get(productId)!;
  };

  for (const txn of txnRows) {
    if (!txn.createdAt) continue;
    const txnDate = new Date(txn.createdAt);
    if (txnDate < rangeStart || txnDate > rangeEnd) continue;

    const key = dateKey(txnDate);
    const dayMap = ensureDay(key);
    if (!dayMap.has(txn.productId)) dayMap.set(txn.productId, emptyStockDelta());
    const dayDelta = dayMap.get(txn.productId)!;
    const periodDelta = ensurePeriod(txn.productId);

    let qty = Number(txn.quantity || 0);
    if (txn.type === "STOCK_IN") {
      qty = Math.abs(qty);
      const bucket = isProductionTransaction(txn) ? "production" : "purchases";
      dayDelta[bucket] += qty;
      periodDelta[bucket] += qty;
    } else if (txn.type === "STOCK_OUT") {
      qty = Math.abs(qty);
      dayDelta.sales += qty;
      periodDelta.sales += qty;
    } else if (txn.type === "ADJUSTMENT") {
      dayDelta.adjustments += qty;
      periodDelta.adjustments += qty;
    }
  }

  return { productMeta, openingBalances, dailyDeltas, periodDeltas };
}

function buildProductStockRows(
  productRows: (typeof products.$inferSelect)[],
  openingBalances: Map<number, number>,
  deltas: Map<number, StockDelta>,
  closingOverrides?: Map<number, number>,
): ProductStockRow[] {
  return productRows
    .map((product) => {
      const delta = deltas.get(product.id) || emptyStockDelta();
      const opening = openingBalances.get(product.id) || 0;
      const closing =
        closingOverrides?.get(product.id) ??
        opening + delta.production + delta.purchases - delta.sales + delta.adjustments;

      return {
        productId: product.id,
        productName: product.name,
        sku: product.sku,
        openingStock: fmt(opening),
        production: fmt(delta.production),
        purchases: fmt(delta.purchases),
        sales: fmt(delta.sales),
        adjustments: fmt(delta.adjustments),
        closingStock: fmt(closing),
      };
    })
    .filter(
      (row) =>
        Number(row.openingStock) !== 0 ||
        Number(row.production) !== 0 ||
        Number(row.purchases) !== 0 ||
        Number(row.sales) !== 0 ||
        Number(row.adjustments) !== 0 ||
        Number(row.closingStock) !== 0,
    )
    .sort((a, b) => a.productName.localeCompare(b.productName));
}

function sumStockRows(rows: ProductStockRow[]) {
  const sum = (key: keyof ProductStockRow) =>
    fmt(rows.reduce((acc, row) => acc + Number(row[key] || 0), 0));
  return {
    openingStock: sum("openingStock"),
    production: sum("production"),
    purchases: sum("purchases"),
    sales: sum("sales"),
    adjustments: sum("adjustments"),
    closingStock: sum("closingStock"),
  };
}

function buildDailyRows(data: Awaited<ReturnType<typeof loadOperationalData>>): DailyOperationalRow[] {
  const {
    rangeStart,
    rangeEnd,
    saleRows,
    paymentRows,
    expenseRows,
    shiftRows,
    dropRows,
    productRows,
    itemRows,
    manufacturingProduction,
    openingTxnRows,
    txnRows,
  } = data;

  const { productMeta, openingBalances, dailyDeltas } = buildStockMaps(
    productRows,
    openingTxnRows,
    txnRows,
    rangeStart,
    rangeEnd,
  );

  const days = eachDayOfInterval({ start: rangeStart, end: rangeEnd });
  const runningStock = new Map(openingBalances);

  return days.map((day) => {
    const key = dateKey(day);
    const dayStart = startOfDay(day);
    const dayEnd = endOfDay(day);

    const dayOpeningCash = shiftRows
      .filter((s) => s.startTime && new Date(s.startTime) >= dayStart && new Date(s.startTime) <= dayEnd)
      .reduce((sum, s) => sum + Number(s.openingBalance || 0), 0);

    let cashSales = 0;
    let creditSales = 0;
    for (const inv of saleRows) {
      if (!inv.issueDate || !isSaleInvoice(inv)) continue;
      if (dateKey(new Date(inv.issueDate)) !== key) continue;
      const total = Number(inv.total || 0);
      if (isCreditSale(inv)) creditSales += total;
      else cashSales += total;
    }

    const collections = paymentRows
      .filter((p) => p.paymentDate && dateKey(new Date(p.paymentDate)) === key)
      .reduce((sum, p) => sum + Number(p.amount || 0), 0);

    const dayExpenses = expenseRows
      .filter((e) => e.expenseDate && dateKey(new Date(e.expenseDate)) === key)
      .reduce((sum, e) => sum + Number(e.amount || 0), 0);

    const moneyBanked = dropRows
      .filter((d) => d.createdAt && dateKey(new Date(d.createdAt)) === key)
      .reduce((sum, d) => sum + Number(d.amount || 0), 0);

    const salesByProductMap = new Map<string, ProductSalesRow>();
    for (const row of itemRows) {
      if (!row.invoice.issueDate || dateKey(new Date(row.invoice.issueDate)) !== key) continue;
      const mapKey = row.item.productId ? `p:${row.item.productId}` : `d:${row.item.description}`;
      const existing = salesByProductMap.get(mapKey) || {
        productId: row.item.productId,
        productName: row.product?.name || row.item.description,
        sku: row.product?.sku || null,
        quantity: "0",
        revenue: "0",
      };
      existing.quantity = fmt(Number(existing.quantity) + Number(row.item.quantity || 0));
      existing.revenue = fmt(Number(existing.revenue) + Number(row.item.lineTotal || 0));
      salesByProductMap.set(mapKey, existing);
    }

    const productionMap = new Map<number, ProductionRow>();
    for (const row of manufacturingProduction) {
      if (row.date !== key) continue;
      const existing = productionMap.get(row.productId) || {
        productId: row.productId,
        productName: row.productName,
        quantity: "0",
      };
      existing.quantity = fmt(Number(existing.quantity) + row.quantity);
      productionMap.set(row.productId, existing);
    }

    // Also count production from inventory STOCK_IN flagged as production
    const dayDeltaMap = dailyDeltas.get(key);
    if (dayDeltaMap) {
      for (const [productId, delta] of dayDeltaMap) {
        if (delta.production <= 0) continue;
        const meta = productMeta.get(productId);
        const existing = productionMap.get(productId) || {
          productId,
          productName: meta?.name || `Product #${productId}`,
          quantity: "0",
        };
        existing.quantity = fmt(Number(existing.quantity) + delta.production);
        productionMap.set(productId, existing);
      }
    }

    const dayOpeningStock = new Map(runningStock);
    const dayDeltas = dailyDeltas.get(key) || new Map<number, StockDelta>();
    const dayClosingStock = new Map<number, number>();

    for (const product of productRows) {
      const delta = dayDeltas.get(product.id) || emptyStockDelta();
      const opening = dayOpeningStock.get(product.id) || 0;
      const closing = opening + delta.production + delta.purchases - delta.sales + delta.adjustments;
      dayClosingStock.set(product.id, closing);
      runningStock.set(product.id, closing);
    }

    const stockByProduct = buildProductStockRows(productRows, dayOpeningStock, dayDeltas, dayClosingStock);
    const salesValue = fmt(cashSales + creditSales);

    return {
      date: key,
      openingCash: fmt(dayOpeningCash),
      cashSales: fmt(cashSales),
      creditSales: fmt(creditSales),
      collections: fmt(collections),
      expenses: fmt(dayExpenses),
      moneyBanked: fmt(moneyBanked),
      salesValue,
      production: Array.from(productionMap.values()).sort((a, b) => a.productName.localeCompare(b.productName)),
      salesByProduct: Array.from(salesByProductMap.values()).sort((a, b) => a.productName.localeCompare(b.productName)),
      stockByProduct,
    };
  });
}

function aggregatePeriod(
  dailyRows: DailyOperationalRow[],
  periodKey: string,
  periodLabel: string,
  startDate: string,
  endDate: string,
): PeriodSummaryRow {
  const inRange = dailyRows.filter((d) => d.date >= startDate && d.date <= endDate);

  const sumField = (field: keyof DailyOperationalRow) =>
    fmt(inRange.reduce((acc, row) => acc + Number(row[field] as string || 0), 0));

  const productionMap = new Map<number, ProductionRow>();
  const stockMap = new Map<number, ProductStockRow>();

  for (const day of inRange) {
    for (const prod of day.production) {
      const existing = productionMap.get(prod.productId) || { ...prod, quantity: "0" };
      existing.quantity = fmt(Number(existing.quantity) + Number(prod.quantity));
      productionMap.set(prod.productId, existing);
    }
    for (const stock of day.stockByProduct) {
      const existing = stockMap.get(stock.productId);
      if (!existing) {
        stockMap.set(stock.productId, { ...stock });
        continue;
      }
      existing.production = fmt(Number(existing.production) + Number(stock.production));
      existing.purchases = fmt(Number(existing.purchases) + Number(stock.purchases));
      existing.sales = fmt(Number(existing.sales) + Number(stock.sales));
      existing.adjustments = fmt(Number(existing.adjustments) + Number(stock.adjustments));
      existing.closingStock = stock.closingStock;
    }
  }

  // Set opening stock from first day in range
  const firstDay = inRange[0];
  if (firstDay) {
    for (const stock of firstDay.stockByProduct) {
      const existing = stockMap.get(stock.productId);
      if (existing) existing.openingStock = stock.openingStock;
    }
  }

  return {
    periodKey,
    periodLabel,
    startDate,
    endDate,
    sales: sumField("salesValue"),
    cashSales: sumField("cashSales"),
    creditSales: sumField("creditSales"),
    collections: sumField("collections"),
    expenses: sumField("expenses"),
    moneyBanked: sumField("moneyBanked"),
    production: Array.from(productionMap.values()).sort((a, b) => a.productName.localeCompare(b.productName)),
    stockMovement: Array.from(stockMap.values()).sort((a, b) => a.productName.localeCompare(b.productName)),
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function getOperationalDailyReport(
  companyId: number,
  start: Date,
  end: Date,
): Promise<{ days: DailyOperationalRow[]; totals: Omit<PeriodSummaryRow, "periodKey" | "periodLabel" | "startDate" | "endDate" | "production" | "stockMovement"> }> {
  const data = await loadOperationalData(companyId, start, end);
  const days = buildDailyRows(data);
  const startKey = dateKey(startOfDay(start));
  const endKey = dateKey(endOfDay(end));
  const totals = aggregatePeriod(days, "total", "Total", startKey, endKey);

  return {
    days,
    totals: {
      sales: totals.sales,
      cashSales: totals.cashSales,
      creditSales: totals.creditSales,
      collections: totals.collections,
      expenses: totals.expenses,
      moneyBanked: totals.moneyBanked,
    },
  };
}

export async function getOperationalWeeklyReport(
  companyId: number,
  start: Date,
  end: Date,
): Promise<{ weeks: PeriodSummaryRow[]; totals: PeriodSummaryRow }> {
  const data = await loadOperationalData(companyId, start, end);
  const dailyRows = buildDailyRows(data);

  const weeks: PeriodSummaryRow[] = [];
  let cursor = startOfWeek(startOfDay(start), { weekStartsOn: 1 });
  const rangeEnd = endOfDay(end);

  while (cursor <= rangeEnd) {
    const weekStart = cursor;
    const weekEnd = endOfWeek(cursor, { weekStartsOn: 1 });
    const effectiveStart = weekStart < startOfDay(start) ? startOfDay(start) : weekStart;
    const effectiveEnd = weekEnd > rangeEnd ? rangeEnd : weekEnd;

    const startKey = dateKey(effectiveStart);
    const endKey = dateKey(effectiveEnd);
    const label = `${format(effectiveStart, "dd MMM")} – ${format(effectiveEnd, "dd MMM yyyy")}`;

    weeks.push(
      aggregatePeriod(dailyRows, `week-${startKey}`, label, startKey, endKey),
    );

    cursor = new Date(weekEnd);
    cursor.setDate(cursor.getDate() + 1);
  }

  const totals = aggregatePeriod(
    dailyRows,
    "total",
    "Total",
    dateKey(startOfDay(start)),
    dateKey(endOfDay(end)),
  );

  return { weeks, totals };
}

export async function getOperationalMonthlyReport(
  companyId: number,
  start: Date,
  end: Date,
): Promise<{ months: PeriodSummaryRow[]; totals: PeriodSummaryRow }> {
  const data = await loadOperationalData(companyId, start, end);
  const dailyRows = buildDailyRows(data);

  const months: PeriodSummaryRow[] = [];
  let cursor = startOfMonth(startOfDay(start));
  const rangeEnd = endOfDay(end);

  while (cursor <= rangeEnd) {
    const monthStart = cursor;
    const monthEnd = endOfMonth(cursor);
    const effectiveStart = monthStart < startOfDay(start) ? startOfDay(start) : monthStart;
    const effectiveEnd = monthEnd > rangeEnd ? rangeEnd : monthEnd;

    const startKey = dateKey(effectiveStart);
    const endKey = dateKey(effectiveEnd);
    const label = format(monthStart, "MMMM yyyy");

    months.push(
      aggregatePeriod(dailyRows, `month-${format(monthStart, "yyyy-MM")}`, label, startKey, endKey),
    );

    cursor = new Date(monthEnd);
    cursor.setDate(cursor.getDate() + 1);
  }

  const totals = aggregatePeriod(
    dailyRows,
    "total",
    "Total",
    dateKey(startOfDay(start)),
    dateKey(endOfDay(end)),
  );

  return { months, totals };
}

export async function getStockMovementReport(
  companyId: number,
  start: Date,
  end: Date,
): Promise<StockMovementReport> {
  const data = await loadOperationalData(companyId, start, end);
  const { productRows, openingTxnRows, txnRows, rangeStart, rangeEnd } = data;
  const { openingBalances, periodDeltas } = buildStockMaps(
    productRows,
    openingTxnRows,
    txnRows,
    rangeStart,
    rangeEnd,
  );

  const productsResult = buildProductStockRows(productRows, openingBalances, periodDeltas);

  return {
    periodStart: dateKey(rangeStart),
    periodEnd: dateKey(rangeEnd),
    products: productsResult,
    totals: sumStockRows(productsResult),
  };
}
