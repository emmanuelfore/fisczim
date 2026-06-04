import { Router } from "express";
import { z } from "zod";
import { db } from "../../db.js";
import { 
  busVehicles, busRoutes, busTrips, busTickets, busShifts, busReconciliations,
  users,
  insertBusVehicleSchema, insertBusRouteSchema, insertBusTripSchema,
  insertBusTicketSchema, insertBusShiftSchema, insertBusReconciliationSchema
} from "../../../shared/schema.js";
import { eq, and, desc, gte, lte, inArray, sql } from "drizzle-orm";
import { postBusReconciliationAccounting, postBusTicketAccounting } from "../../lib/bus-accounting.js";

const router = Router({ mergeParams: true });

// Helper to get company Id from either API key (req.company) or URL/Session (req.params)
function getTargetCompanyId(req: any) {
  if (req.company?.id) return req.company.id;
  if (req.params.companyId) return parseInt(req.params.companyId);
  throw new Error("Missing company context");
}

const vehicleRequestSchema = insertBusVehicleSchema.omit({ companyId: true }).extend({
  regNumber: z.string().trim().min(1, "Registration number is required"),
  capacity: z.coerce.number().int().positive("Capacity must be greater than zero"),
});
const vehicleUpdateSchema = vehicleRequestSchema.partial();

const routeRequestSchema = insertBusRouteSchema.omit({ companyId: true }).extend({
  name: z.string().trim().min(1, "Route name is required"),
  fromLocation: z.string().trim().min(1, "Origin is required"),
  toLocation: z.string().trim().min(1, "Destination is required"),
  basePrice: z.coerce.string(),
  config: z.record(z.any()).default({}),
  createReverseRoute: z.coerce.boolean().default(true),
});
const routeUpdateSchema = routeRequestSchema.partial();

const tripRequestSchema = insertBusTripSchema.omit({ companyId: true, conductorId: true }).extend({
  routeId: z.coerce.number().int().positive("Route is required"),
  vehicleId: z.coerce.number().int().positive("Vehicle is required"),
  conductorId: z.string().uuid().optional(),
  scheduledDeparture: z.coerce.date(),
  actualDeparture: z.coerce.date().nullable().optional(),
  actualArrival: z.coerce.date().nullable().optional(),
  status: z.string().default("scheduled"),
});

const tripStatusUpdateSchema = z.object({
  status: z.enum(["scheduled", "boarding", "en_route", "in_progress", "completed", "cancelled"]),
  actualDeparture: z.coerce.date().nullable().optional(),
  actualArrival: z.coerce.date().nullable().optional(),
});

async function updateTripStatus(req: any, res: any, tripId: number, data: z.infer<typeof tripStatusUpdateSchema>) {
  try {
    const companyId = getTargetCompanyId(req);
    const [trip] = await db.update(busTrips)
      .set(data)
      .where(and(eq(busTrips.id, tripId), eq(busTrips.companyId, companyId)))
      .returning();

    if (!trip) {
      return res.status(404).json({ error: "NOT_FOUND", message: "Trip not found" });
    }

    res.json(trip);
  } catch (err: any) {
    res.status(500).json({ error: "INTERNAL_ERROR", message: err.message });
  }
}

const ticketSyncSchema = insertBusTicketSchema.omit({
  companyId: true,
  accountingStatus: true,
  accountingError: true,
  postedJournalEntryId: true,
  postedAt: true,
}).extend({
  tripId: z.coerce.number().int().positive(),
  shiftId: z.coerce.number().int().positive().nullable().optional(),
  quantity: z.coerce.number().int().positive().default(1),
  amount: z.coerce.string(),
  currency: z.string().trim().min(1).default("USD"),
  status: z.enum(["active", "voided", "refunded"]).default("active"),
  timestamp: z.coerce.date(),
});

const shiftSyncSchema = insertBusShiftSchema.omit({ companyId: true }).extend({
  startTime: z.coerce.date(),
  endTime: z.coerce.date().nullable().optional(),
});

const reconciliationSyncSchema = insertBusReconciliationSchema.omit({
  companyId: true,
  accountingStatus: true,
  accountingError: true,
  postedJournalEntryId: true,
  postedAt: true,
});
const ONGOING_TRIP_STATUSES = ["boarding", "en_route", "in_progress"] as const;
const ACTIVE_TICKET_STATUS = "active";
let busTicketingSchemaReady: Promise<void> | null = null;

async function ensureBusTicketingSchema() {
  if (!busTicketingSchemaReady) {
    busTicketingSchemaReady = db.execute(sql`
      ALTER TABLE "bus_trips"
      ADD COLUMN IF NOT EXISTS "actual_arrival" timestamp;

      ALTER TABLE "bus_tickets" ADD COLUMN IF NOT EXISTS "shift_id" integer;
      ALTER TABLE "bus_tickets" ADD COLUMN IF NOT EXISTS "device_id" text;
      ALTER TABLE "bus_tickets" ADD COLUMN IF NOT EXISTS "local_ticket_id" text;
      ALTER TABLE "bus_tickets" ADD COLUMN IF NOT EXISTS "currency" text DEFAULT 'USD';
      ALTER TABLE "bus_tickets" ADD COLUMN IF NOT EXISTS "status" text DEFAULT 'active';
      ALTER TABLE "bus_tickets" ADD COLUMN IF NOT EXISTS "accounting_status" text DEFAULT 'unposted';
      ALTER TABLE "bus_tickets" ADD COLUMN IF NOT EXISTS "accounting_error" text;
      ALTER TABLE "bus_tickets" ADD COLUMN IF NOT EXISTS "posted_journal_entry_id" integer REFERENCES "journal_entries"("id");
      ALTER TABLE "bus_tickets" ADD COLUMN IF NOT EXISTS "posted_at" timestamp;
      ALTER TABLE "bus_tickets" ADD COLUMN IF NOT EXISTS "voided_at" timestamp;
      ALTER TABLE "bus_tickets" ADD COLUMN IF NOT EXISTS "void_reason" text;

      ALTER TABLE "bus_reconciliations" ADD COLUMN IF NOT EXISTS "status" text DEFAULT 'pending';
      ALTER TABLE "bus_reconciliations" ADD COLUMN IF NOT EXISTS "signed_off_by" uuid REFERENCES "users"("id");
      ALTER TABLE "bus_reconciliations" ADD COLUMN IF NOT EXISTS "signed_off_at" timestamp;
      ALTER TABLE "bus_reconciliations" ADD COLUMN IF NOT EXISTS "accounting_status" text DEFAULT 'unposted';
      ALTER TABLE "bus_reconciliations" ADD COLUMN IF NOT EXISTS "accounting_error" text;
      ALTER TABLE "bus_reconciliations" ADD COLUMN IF NOT EXISTS "posted_journal_entry_id" integer REFERENCES "journal_entries"("id");
      ALTER TABLE "bus_reconciliations" ADD COLUMN IF NOT EXISTS "posted_at" timestamp;

      UPDATE "bus_tickets" SET "currency" = 'USD' WHERE "currency" IS NULL;
      UPDATE "bus_tickets" SET "status" = 'active' WHERE "status" IS NULL;
      UPDATE "bus_tickets" SET "accounting_status" = 'unposted' WHERE "accounting_status" IS NULL;
      UPDATE "bus_reconciliations" SET "status" = 'pending' WHERE "status" IS NULL;
      UPDATE "bus_reconciliations" SET "accounting_status" = 'unposted' WHERE "accounting_status" IS NULL;

      ALTER TABLE "bus_tickets" ALTER COLUMN "currency" SET DEFAULT 'USD';
      ALTER TABLE "bus_tickets" ALTER COLUMN "status" SET DEFAULT 'active';
      ALTER TABLE "bus_tickets" ALTER COLUMN "status" SET NOT NULL;
      ALTER TABLE "bus_tickets" ALTER COLUMN "accounting_status" SET DEFAULT 'unposted';
      ALTER TABLE "bus_tickets" ALTER COLUMN "accounting_status" SET NOT NULL;
      ALTER TABLE "bus_reconciliations" ALTER COLUMN "status" SET DEFAULT 'pending';
      ALTER TABLE "bus_reconciliations" ALTER COLUMN "status" SET NOT NULL;
      ALTER TABLE "bus_reconciliations" ALTER COLUMN "accounting_status" SET DEFAULT 'unposted';
      ALTER TABLE "bus_reconciliations" ALTER COLUMN "accounting_status" SET NOT NULL;
    `).then(() => undefined).catch((err) => {
      busTicketingSchemaReady = null;
      throw err;
    });
  }

  return busTicketingSchemaReady;
}

router.use(async (_req, res, next) => {
  try {
    await ensureBusTicketingSchema();
    next();
  } catch (err: any) {
    console.error("[BusTicketing] Schema readiness check failed:", err);
    res.status(500).json({ error: "INTERNAL_ERROR", message: err.message });
  }
});

function canonicalLocation(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function reverseRouteName(route: { name: string; fromLocation: string; toLocation: string }) {
  const escapedFrom = route.fromLocation.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const escapedTo = route.toLocation.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const directPattern = new RegExp(`${escapedFrom}\\s*(?:-|->|to)\\s*${escapedTo}`, "i");
  if (directPattern.test(route.name)) {
    return route.name.replace(directPattern, `${route.toLocation} - ${route.fromLocation}`);
  }
  return `${route.toLocation} - ${route.fromLocation}`;
}

function routeDistanceKm(config: unknown) {
  if (!config || typeof config !== "object") return 0;
  const distance = Number((config as any).distanceKm || (config as any).distance || 0);
  return Number.isFinite(distance) ? distance : 0;
}

// --- VEHICLES ---

// GET /vehicles - List all vehicles for the company
router.get("/vehicles", async (req, res) => {
  try {
    const companyId = getTargetCompanyId(req);
    const vehicles = await db.select().from(busVehicles)
      .where(eq(busVehicles.companyId, companyId))
      .orderBy(desc(busVehicles.createdAt));
    res.json(vehicles);
  } catch (err: any) {
    res.status(500).json({ error: "INTERNAL_ERROR", message: err.message });
  }
});

// POST /vehicles - Create a new vehicle
router.post("/vehicles", async (req, res) => {
  const parsed = vehicleRequestSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "VALIDATION_ERROR", details: parsed.error.errors });

  try {
    const companyId = getTargetCompanyId(req);
    const [vehicle] = await db.insert(busVehicles)
      .values({ ...parsed.data, companyId })
      .returning();
    res.status(201).json(vehicle);
  } catch (err: any) {
    res.status(500).json({ error: "INTERNAL_ERROR", message: err.message });
  }
});

// PATCH /vehicles/:vehicleId - Update vehicle details/status
router.patch("/vehicles/:vehicleId", async (req, res) => {
  const vehicleId = Number(req.params.vehicleId);
  if (!Number.isFinite(vehicleId) || vehicleId <= 0) {
    return res.status(400).json({ error: "VALIDATION_ERROR", message: "Invalid vehicle id" });
  }

  const parsed = vehicleUpdateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "VALIDATION_ERROR", details: parsed.error.errors });

  try {
    const companyId = getTargetCompanyId(req);
    const [vehicle] = await db.update(busVehicles)
      .set(parsed.data)
      .where(and(eq(busVehicles.id, vehicleId), eq(busVehicles.companyId, companyId)))
      .returning();
    if (!vehicle) return res.status(404).json({ error: "NOT_FOUND", message: "Vehicle not found" });
    res.json(vehicle);
  } catch (err: any) {
    res.status(500).json({ error: "INTERNAL_ERROR", message: err.message });
  }
});

// --- ROUTES ---

// GET /routes - List cloud routes
router.get("/routes", async (req, res) => {
  try {
    const companyId = getTargetCompanyId(req);
    const routes = await db.select().from(busRoutes)
      .where(eq(busRoutes.companyId, companyId))
      .orderBy(desc(busRoutes.createdAt));
    res.json(routes);
  } catch (err: any) {
    res.status(500).json({ error: "INTERNAL_ERROR", message: err.message });
  }
});

// POST /routes - Create/Sync a route to cloud
router.post("/routes", async (req, res) => {
  const parsed = routeRequestSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "VALIDATION_ERROR", details: parsed.error.errors });

  try {
    const companyId = getTargetCompanyId(req);
    const { createReverseRoute, ...routeData } = parsed.data;
    const result = await db.transaction(async (tx) => {
      const [route] = await tx.insert(busRoutes)
        .values({
          ...routeData,
          companyId,
          config: {
            ...(routeData.config || {}),
            direction: "outbound",
            reverseRouteAutoCreated: createReverseRoute,
          },
        })
        .returning();

      let reverseRoute = null;
      const from = canonicalLocation(routeData.fromLocation);
      const to = canonicalLocation(routeData.toLocation);
      if (createReverseRoute && from !== to) {
        const existingRoutes = await tx.select().from(busRoutes).where(eq(busRoutes.companyId, companyId));
        reverseRoute = existingRoutes.find((candidate) =>
          canonicalLocation(candidate.fromLocation) === to &&
          canonicalLocation(candidate.toLocation) === from
        ) || null;

        if (!reverseRoute) {
          const [createdReverse] = await tx.insert(busRoutes)
            .values({
              ...routeData,
              companyId,
              name: reverseRouteName(routeData),
              fromLocation: routeData.toLocation,
              toLocation: routeData.fromLocation,
              config: {
                ...(routeData.config || {}),
                direction: "return",
                pairedRouteId: route.id,
                autoCreatedFromRouteId: route.id,
              },
            })
            .returning();
          reverseRoute = createdReverse;
        }
      }

      return { route, reverseRoute };
    });

    res.status(201).json(result.route);
  } catch (err: any) {
    res.status(500).json({ error: "INTERNAL_ERROR", message: err.message });
  }
});

// PATCH /routes/:routeId - Update route details/status
router.patch("/routes/:routeId", async (req, res) => {
  const routeId = Number(req.params.routeId);
  if (!Number.isFinite(routeId) || routeId <= 0) {
    return res.status(400).json({ error: "VALIDATION_ERROR", message: "Invalid route id" });
  }

  const parsed = routeUpdateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "VALIDATION_ERROR", details: parsed.error.errors });

  try {
    const companyId = getTargetCompanyId(req);
    const { createReverseRoute: _ignoredCreateReverseRoute, ...routeUpdates } = parsed.data;
    const [route] = await db.update(busRoutes)
      .set(routeUpdates)
      .where(and(eq(busRoutes.id, routeId), eq(busRoutes.companyId, companyId)))
      .returning();
    if (!route) return res.status(404).json({ error: "NOT_FOUND", message: "Route not found" });
    res.json(route);
  } catch (err: any) {
    res.status(500).json({ error: "INTERNAL_ERROR", message: err.message });
  }
});

// --- TRIPS ---

// GET /trips - List all trips
router.get("/trips", async (req, res) => {
  try {
    const companyId = getTargetCompanyId(req);
    const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 500);
    const conditions: any[] = [eq(busTrips.companyId, companyId)];
    if (req.query.status === "ongoing") {
      conditions.push(inArray(busTrips.status, ONGOING_TRIP_STATUSES as unknown as string[]));
    } else if (typeof req.query.status === "string" && req.query.status.trim()) {
      conditions.push(eq(busTrips.status, req.query.status.trim()));
    }
    if (req.query.vehicleId) {
      const vehicleId = Number(req.query.vehicleId);
      if (Number.isFinite(vehicleId)) conditions.push(eq(busTrips.vehicleId, vehicleId));
    }
    if (req.query.routeId) {
      const routeId = Number(req.query.routeId);
      if (Number.isFinite(routeId)) conditions.push(eq(busTrips.routeId, routeId));
    }

    const trips = await db.select().from(busTrips)
      .where(and(...conditions))
      .orderBy(desc(busTrips.scheduledDeparture))
      .limit(limit);
    res.json(trips);
  } catch (err: any) {
    console.error("[BusTicketing] Trips fetch failed:", err);
    res.status(500).json({ error: "INTERNAL_ERROR", message: err.message });
  }
});

// GET /trips/active - For mobile POS: List trips assigned to current user
router.get("/trips/active", async (req, res) => {
  const user = (req as any).user;
  if (!user?.id) {
    return res.status(401).json({ error: "UNAUTHORIZED", message: "Authenticated user is required" });
  }
  try {
    const companyId = getTargetCompanyId(req);
    const activeTrips = await db.select().from(busTrips)
      .where(and(
        eq(busTrips.companyId, companyId),
        eq(busTrips.conductorId, user.id),
        inArray(busTrips.status, ["scheduled", ...ONGOING_TRIP_STATUSES] as string[])
      ))
      .orderBy(desc(busTrips.scheduledDeparture));
    res.json(activeTrips);
  } catch (err: any) {
    res.status(500).json({ error: "INTERNAL_ERROR", message: err.message });
  }
});

// POST /trips - Schedule a trip
router.post("/trips", async (req, res) => {
  const parsed = tripRequestSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "VALIDATION_ERROR", details: parsed.error.errors });

  try {
    const companyId = getTargetCompanyId(req);
    const conductorId = (req as any).user?.id || parsed.data.conductorId;
    if (!conductorId) {
      return res.status(400).json({
        error: "MISSING_CONDUCTOR",
        message: "A logged-in user or valid conductorId is required to start a bus trip.",
      });
    }

    const [conductor] = await db.select({ id: users.id })
      .from(users)
      .where(eq(users.id, conductorId))
      .limit(1);
    if (!conductor) {
      return res.status(400).json({
        error: "INVALID_CONDUCTOR",
        message: "The conductor user does not exist on the server.",
      });
    }

    const [existingActiveTrip] = await db.select({ id: busTrips.id })
      .from(busTrips)
      .where(and(
        eq(busTrips.companyId, companyId),
        eq(busTrips.vehicleId, parsed.data.vehicleId),
        inArray(busTrips.status, ONGOING_TRIP_STATUSES as unknown as string[])
      ))
      .limit(1);

    if (existingActiveTrip) {
      return res.status(409).json({
        error: "BUS_ALREADY_IN_USE",
        message: "This bus is already on an ongoing trip. Please select another bus.",
      });
    }

    const [trip] = await db.insert(busTrips)
      .values({ ...parsed.data, conductorId, companyId })
      .returning();
    res.status(201).json(trip);
  } catch (err: any) {
    res.status(500).json({ error: "INTERNAL_ERROR", message: err.message });
  }
});

// PATCH /trips/:tripId - Update trip state, used by mobile end-trip flow
router.patch("/trips/:tripId", async (req, res) => {
  const tripId = Number(req.params.tripId);
  if (!Number.isFinite(tripId) || tripId <= 0) {
    return res.status(400).json({ error: "VALIDATION_ERROR", message: "Invalid trip id" });
  }

  const parsed = tripStatusUpdateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "VALIDATION_ERROR", details: parsed.error.errors });

  return updateTripStatus(req, res, tripId, parsed.data);
});

// POST /trips/:tripId/close - Close a trip from mobile clients that cannot PATCH reliably
router.post("/trips/:tripId/close", async (req, res) => {
  const tripId = Number(req.params.tripId);
  if (!Number.isFinite(tripId) || tripId <= 0) {
    return res.status(400).json({ error: "VALIDATION_ERROR", message: "Invalid trip id" });
  }

  return updateTripStatus(req, res, tripId, {
    status: "completed",
    actualArrival: req.body?.actualArrival ? new Date(req.body.actualArrival) : new Date(),
  });
});

// --- REPORTS ---

router.get("/reports/summary", async (req, res) => {
  try {
    const companyId = getTargetCompanyId(req);
    const from = req.query.from ? new Date(String(req.query.from)) : new Date(new Date().setHours(0, 0, 0, 0));
    const to = req.query.to ? new Date(String(req.query.to)) : new Date(new Date().setHours(23, 59, 59, 999));

    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      return res.status(400).json({ error: "VALIDATION_ERROR", message: "Invalid date range" });
    }

    const rows = await db.select({
      ticketId: busTickets.id,
      tripId: busTickets.tripId,
      ticketNumber: busTickets.ticketNumber,
      quantity: busTickets.quantity,
      amount: busTickets.amount,
      paymentMethod: busTickets.paymentMethod,
      accountingStatus: busTickets.accountingStatus,
      accountingError: busTickets.accountingError,
      timestamp: busTickets.timestamp,
      tripStatus: busTrips.status,
      scheduledDeparture: busTrips.scheduledDeparture,
      actualDeparture: busTrips.actualDeparture,
      actualArrival: busTrips.actualArrival,
      routeId: busTrips.routeId,
      vehicleId: busTrips.vehicleId,
      conductorId: busTrips.conductorId,
      routeName: busRoutes.name,
      fromLocation: busRoutes.fromLocation,
      toLocation: busRoutes.toLocation,
      routeConfig: busRoutes.config,
      vehicleRegNumber: busVehicles.regNumber,
      vehicleCapacity: busVehicles.capacity,
      conductorName: users.name,
      conductorEmail: users.email,
    })
      .from(busTickets)
      .leftJoin(busTrips, eq(busTickets.tripId, busTrips.id))
      .leftJoin(busRoutes, eq(busTrips.routeId, busRoutes.id))
      .leftJoin(busVehicles, eq(busTrips.vehicleId, busVehicles.id))
      .leftJoin(users, eq(busTrips.conductorId, users.id))
      .where(and(
        eq(busTickets.companyId, companyId),
        eq(busTickets.status, ACTIVE_TICKET_STATUS),
        gte(busTickets.timestamp, from),
        lte(busTickets.timestamp, to)
      ))
      .orderBy(desc(busTickets.timestamp));

    const totals = rows.reduce((acc, row) => {
      acc.tickets += 1;
      acc.passengers += Number(row.quantity || 1);
      acc.revenue += Number(row.amount || 0);
      return acc;
    }, { tickets: 0, passengers: 0, revenue: 0 });

    const summarize = (keyFn: (row: typeof rows[number]) => string, labelFn: (row: typeof rows[number]) => string) => {
      const map = new Map<string, { id: string; label: string; tickets: number; passengers: number; revenue: number }>();
      for (const row of rows) {
        const id = keyFn(row);
        const current = map.get(id) || { id, label: labelFn(row), tickets: 0, passengers: 0, revenue: 0 };
        current.tickets += 1;
        current.passengers += Number(row.quantity || 1);
        current.revenue += Number(row.amount || 0);
        map.set(id, current);
      }
      return Array.from(map.values()).sort((a, b) => b.revenue - a.revenue);
    };

    const tripRows = await db.select({
      tripId: busTrips.id,
      tripStatus: busTrips.status,
      scheduledDeparture: busTrips.scheduledDeparture,
      actualDeparture: busTrips.actualDeparture,
      actualArrival: busTrips.actualArrival,
      routeId: busTrips.routeId,
      vehicleId: busTrips.vehicleId,
      conductorId: busTrips.conductorId,
      routeName: busRoutes.name,
      fromLocation: busRoutes.fromLocation,
      toLocation: busRoutes.toLocation,
      routeConfig: busRoutes.config,
      vehicleRegNumber: busVehicles.regNumber,
      vehicleCapacity: busVehicles.capacity,
      conductorName: users.name,
      conductorEmail: users.email,
    })
      .from(busTrips)
      .leftJoin(busRoutes, eq(busTrips.routeId, busRoutes.id))
      .leftJoin(busVehicles, eq(busTrips.vehicleId, busVehicles.id))
      .leftJoin(users, eq(busTrips.conductorId, users.id))
      .where(and(
        eq(busTrips.companyId, companyId),
        gte(busTrips.scheduledDeparture, from),
        lte(busTrips.scheduledDeparture, to)
      ))
      .orderBy(desc(busTrips.scheduledDeparture));

    const tripsById = new Map<number, {
      id: number;
      label: string;
      routeName: string | null;
      direction: string;
      conductorId: string | null;
      conductorName: string | null;
      vehicleId: number | null;
      vehicleRegNumber: string | null;
      capacity: number;
      status: string | null;
      scheduledDeparture: Date | null;
      actualDeparture: Date | null;
      actualArrival: Date | null;
      tickets: number;
      passengers: number;
      revenue: number;
      cashRevenue: number;
      nonCashRevenue: number;
    }>();

    const ensureTrip = (row: any) => {
      const tripId = Number(row.tripId);
      if (!Number.isFinite(tripId)) return null;
      const existing = tripsById.get(tripId);
      if (existing) return existing;
      const direction = [row.fromLocation, row.toLocation].filter(Boolean).join(" -> ") || row.routeName || "Unknown direction";
      const trip = {
        id: tripId,
        label: `${direction} #${tripId}`,
        routeName: row.routeName || null,
        direction,
        conductorId: row.conductorId || null,
        conductorName: row.conductorName || row.conductorEmail || null,
        vehicleId: row.vehicleId || null,
        vehicleRegNumber: row.vehicleRegNumber || null,
        capacity: Number(row.vehicleCapacity || 0),
        status: row.tripStatus || null,
        scheduledDeparture: row.scheduledDeparture || null,
        actualDeparture: row.actualDeparture || null,
        actualArrival: row.actualArrival || null,
        tickets: 0,
        passengers: 0,
        revenue: 0,
        cashRevenue: 0,
        nonCashRevenue: 0,
      };
      tripsById.set(tripId, trip);
      return trip;
    };

    tripRows.forEach(ensureTrip);
    rows.forEach((row) => {
      const trip = ensureTrip(row);
      if (!trip) return;
      const revenue = Number(row.amount || 0);
      trip.tickets += 1;
      trip.passengers += Number(row.quantity || 1);
      trip.revenue += revenue;
      if ((row.paymentMethod || "").toLowerCase() === "cash") {
        trip.cashRevenue += revenue;
      } else {
        trip.nonCashRevenue += revenue;
      }
    });

    const tripReports = Array.from(tripsById.values())
      .map((trip) => ({
        ...trip,
        occupancyRate: trip.capacity > 0 ? trip.passengers / trip.capacity : null,
        averageFare: trip.passengers > 0 ? trip.revenue / trip.passengers : 0,
      }))
      .sort((a, b) => b.revenue - a.revenue);

    const routeDetailsById = new Map<string, {
      id: string;
      label: string;
      direction: string;
      tickets: number;
      passengers: number;
      trips: number;
      completedTrips: number;
      cancelledTrips: number;
      revenue: number;
      distanceKm: number;
      totalSeatCapacity: number;
    }>();

    for (const trip of tripRows) {
      const id = String(trip.routeId || "unknown");
      const current = routeDetailsById.get(id) || {
        id,
        label: trip.routeName || "Unknown route",
        direction: `${trip.fromLocation || "Unknown"} -> ${trip.toLocation || "Unknown"}`,
        tickets: 0,
        passengers: 0,
        trips: 0,
        completedTrips: 0,
        cancelledTrips: 0,
        revenue: 0,
        distanceKm: routeDistanceKm(trip.routeConfig),
        totalSeatCapacity: 0,
      };
      current.trips += 1;
      current.totalSeatCapacity += Number(trip.vehicleCapacity || 0);
      if (trip.tripStatus === "completed") current.completedTrips += 1;
      if (trip.tripStatus === "cancelled") current.cancelledTrips += 1;
      routeDetailsById.set(id, current);
    }

    for (const row of rows) {
      const id = String(row.routeId || "unknown");
      const current = routeDetailsById.get(id) || {
        id,
        label: row.routeName || "Unknown route",
        direction: `${row.fromLocation || "Unknown"} -> ${row.toLocation || "Unknown"}`,
        tickets: 0,
        passengers: 0,
        trips: 0,
        completedTrips: 0,
        cancelledTrips: 0,
        revenue: 0,
        distanceKm: routeDistanceKm(row.routeConfig),
        totalSeatCapacity: 0,
      };
      current.tickets += 1;
      current.passengers += Number(row.quantity || 1);
      current.revenue += Number(row.amount || 0);
      routeDetailsById.set(id, current);
    }

    const routePerformance = Array.from(routeDetailsById.values()).map((route) => ({
      ...route,
      revenuePerKm: route.distanceKm > 0 ? route.revenue / route.distanceKm : null,
      passengersPerTrip: route.trips > 0 ? route.passengers / route.trips : 0,
      occupancyRate: route.totalSeatCapacity > 0 ? route.passengers / route.totalSeatCapacity : null,
      averageFare: route.passengers > 0 ? route.revenue / route.passengers : 0,
      completionRate: route.trips > 0 ? route.completedTrips / route.trips : null,
    })).sort((a, b) => b.revenue - a.revenue);

    const revenueRoutes = routePerformance.filter((route) => route.trips > 0);
    const averageRouteRevenue = revenueRoutes.length
      ? revenueRoutes.reduce((sum, route) => sum + route.revenue, 0) / revenueRoutes.length
      : 0;
    const underperformingRoutes = revenueRoutes
      .filter((route) => route.revenue < averageRouteRevenue)
      .sort((a, b) => a.revenue - b.revenue);

    const unsyncedTickets = await db.select({
      id: busTickets.id,
      ticketNumber: busTickets.ticketNumber,
      tripId: busTickets.tripId,
      timestamp: busTickets.timestamp,
      amount: busTickets.amount,
    })
      .from(busTickets)
      .where(and(
        eq(busTickets.companyId, companyId),
        eq(busTickets.isSynced, false),
        gte(busTickets.timestamp, from),
        lte(busTickets.timestamp, to)
      ))
      .orderBy(desc(busTickets.timestamp));

    const reconciliationRows = await db.select({
      id: busReconciliations.id,
      conductorId: busReconciliations.conductorId,
      conductorName: users.name,
      conductorEmail: users.email,
      date: busReconciliations.date,
      expectedCash: busReconciliations.expectedCash,
      cashReceived: busReconciliations.cashReceived,
      gap: busReconciliations.gap,
      status: busReconciliations.status,
      accountingStatus: busReconciliations.accountingStatus,
      accountingError: busReconciliations.accountingError,
      notes: busReconciliations.notes,
    })
      .from(busReconciliations)
      .leftJoin(users, eq(busReconciliations.conductorId, users.id))
      .where(and(
        eq(busReconciliations.companyId, companyId),
        gte(busReconciliations.date, from.toISOString().slice(0, 10)),
        lte(busReconciliations.date, to.toISOString().slice(0, 10))
      ));

    const conductorVarianceMap = new Map<string, { id: string; label: string; expectedCash: number; cashReceived: number; variance: number; reconciliations: number; exceptions: number }>();
    for (const row of reconciliationRows) {
      const id = String(row.conductorId || "unknown");
      const current = conductorVarianceMap.get(id) || {
        id,
        label: row.conductorName || row.conductorEmail || "Unknown conductor",
        expectedCash: 0,
        cashReceived: 0,
        variance: 0,
        reconciliations: 0,
        exceptions: 0,
      };
      const gap = Number(row.gap || 0);
      current.expectedCash += Number(row.expectedCash || 0);
      current.cashReceived += Number(row.cashReceived || 0);
      current.variance += gap;
      current.reconciliations += 1;
      if (Math.abs(gap) > 0.005 || row.status === "rejected") current.exceptions += 1;
      conductorVarianceMap.set(id, current);
    }

    const conductorVariance = Array.from(conductorVarianceMap.values())
      .sort((a, b) => Math.abs(b.variance) - Math.abs(a.variance));

    const cashupExceptions = reconciliationRows
      .filter((row) => Math.abs(Number(row.gap || 0)) > 0.005 || row.status === "rejected")
      .map((row) => ({
        id: row.id,
        conductorId: row.conductorId,
        conductorName: row.conductorName || row.conductorEmail,
        date: row.date,
        expectedCash: Number(row.expectedCash || 0),
        cashReceived: Number(row.cashReceived || 0),
        gap: Number(row.gap || 0),
        status: row.status,
        notes: row.notes,
      }));

    const accountingTickets = rows.reduce((acc, row) => {
      const status = row.accountingStatus || "unposted";
      acc[status] = (acc[status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const accountingReconciliations = reconciliationRows.reduce((acc, row) => {
      const status = row.accountingStatus || "unposted";
      acc[status] = (acc[status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const accountingExceptions = [
      ...rows
        .filter((row) => ["failed", "unposted"].includes(row.accountingStatus || "unposted"))
        .map((row) => ({
          type: "ticket",
          id: row.ticketId,
          reference: row.ticketNumber,
          status: row.accountingStatus || "unposted",
          error: row.accountingError,
          amount: Number(row.amount || 0),
          date: row.timestamp,
        })),
      ...reconciliationRows
        .filter((row) => ["failed", "unposted"].includes(row.accountingStatus || "unposted"))
        .map((row) => ({
          type: "cashup",
          id: row.id,
          reference: `Cash-up ${row.date}`,
          status: row.accountingStatus || "unposted",
          error: row.accountingError,
          amount: Number(row.cashReceived || 0),
          date: row.date,
        })),
    ];

    res.json({
      from: from.toISOString(),
      to: to.toISOString(),
      totals,
      tripTotals: {
        trips: tripReports.length,
        completed: tripReports.filter((trip) => trip.status === "completed").length,
        active: tripReports.filter((trip) => ONGOING_TRIP_STATUSES.includes(trip.status as any)).length,
        scheduled: tripReports.filter((trip) => trip.status === "scheduled").length,
        cancelled: tripReports.filter((trip) => trip.status === "cancelled").length,
        averageOccupancy: (() => {
          const occupiedTrips = tripReports.filter((trip) => trip.occupancyRate !== null);
          if (occupiedTrips.length === 0) return null;
          return occupiedTrips.reduce((sum, trip) => sum + Number(trip.occupancyRate || 0), 0) / occupiedTrips.length;
        })(),
      },
      byRoute: summarize(
        (row) => String(row.routeId || "unknown"),
        (row) => row.routeName || "Unknown route"
      ),
      byDirection: summarize(
        (row) => `${row.fromLocation || "Unknown"} -> ${row.toLocation || "Unknown"}`,
        (row) => `${row.fromLocation || "Unknown"} -> ${row.toLocation || "Unknown"}`
      ),
      byConductor: summarize(
        (row) => String(row.conductorId || "unknown"),
        (row) => row.conductorName || row.conductorEmail || "Unknown conductor"
      ),
      byVehicle: summarize(
        (row) => String(row.vehicleId || "unknown"),
        (row) => row.vehicleRegNumber || "Unknown vehicle"
      ),
      routePerformance,
      underperformingRoutes,
      conductorVariance,
      syncAudit: {
        unsyncedTickets: unsyncedTickets.length,
        tickets: unsyncedTickets.map((ticket) => ({
          id: ticket.id,
          ticketNumber: ticket.ticketNumber,
          tripId: ticket.tripId,
          amount: Number(ticket.amount || 0),
          timestamp: ticket.timestamp,
        })),
      },
      cashup: {
        expectedCash: reconciliationRows.reduce((sum, row) => sum + Number(row.expectedCash || 0), 0),
        cashReceived: reconciliationRows.reduce((sum, row) => sum + Number(row.cashReceived || 0), 0),
        variance: reconciliationRows.reduce((sum, row) => sum + Number(row.gap || 0), 0),
        reconciled: reconciliationRows.filter((row) => row.status === "approved").length,
        unreconciled: reconciliationRows.filter((row) => row.status !== "approved").length,
        exceptions: cashupExceptions,
      },
      accounting: {
        tickets: accountingTickets,
        reconciliations: accountingReconciliations,
        postedTickets: accountingTickets.posted || 0,
        unpostedTickets: accountingTickets.unposted || 0,
        failedTickets: accountingTickets.failed || 0,
        postedCashups: accountingReconciliations.posted || 0,
        unpostedCashups: accountingReconciliations.unposted || 0,
        failedCashups: accountingReconciliations.failed || 0,
        exceptions: accountingExceptions,
      },
      utilization: {
        activeVehicles: new Set(tripReports.filter((trip) => ONGOING_TRIP_STATUSES.includes(trip.status as any)).map((trip) => trip.vehicleId).filter(Boolean)).size,
        vehiclesUsed: new Set(tripReports.map((trip) => trip.vehicleId).filter(Boolean)).size,
        averageOccupancy: (() => {
          const occupiedTrips = tripReports.filter((trip) => trip.occupancyRate !== null);
          if (occupiedTrips.length === 0) return null;
          return occupiedTrips.reduce((sum, trip) => sum + Number(trip.occupancyRate || 0), 0) / occupiedTrips.length;
        })(),
      },
      tickets: rows.map((row) => ({
        id: row.ticketId,
        tripId: row.tripId,
        ticketNumber: row.ticketNumber,
        quantity: Number(row.quantity || 1),
        amount: Number(row.amount || 0),
        paymentMethod: row.paymentMethod,
        accountingStatus: row.accountingStatus,
        accountingError: row.accountingError,
        timestamp: row.timestamp,
        conductorId: row.conductorId,
        routeId: row.routeId,
        vehicleId: row.vehicleId,
        routeName: row.routeName,
        direction: `${row.fromLocation || "Unknown"} -> ${row.toLocation || "Unknown"}`,
        vehicleRegNumber: row.vehicleRegNumber,
        conductorName: row.conductorName || row.conductorEmail,
      })),
      trips: tripReports,
    });
  } catch (err: any) {
    console.error("[BusTicketing] Report summary failed:", err);
    res.status(500).json({ error: "INTERNAL_ERROR", message: err.message });
  }
});

// --- SYNC ---

const syncSchema = z.object({
  tickets: z.array(ticketSyncSchema).default([]),
  shifts: z.array(shiftSyncSchema).default([]),
  reconciliations: z.array(reconciliationSyncSchema).default([])
});

// POST /sync - Bulk upload data from mobile POS
router.post("/sync", async (req, res) => {
  const parsed = syncSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "VALIDATION_ERROR", details: parsed.error.errors });

  const { tickets, shifts, reconciliations } = parsed.data;

  try {
    const companyId = getTargetCompanyId(req);
    const syncResult = await db.transaction(async (tx) => {
      let insertedTickets = 0;
      let skippedTickets = 0;
      const rejectedTickets: Array<{ ticketNumber?: string; localTicketId?: string | null; reason: string }> = [];

      if (tickets.length > 0) {
        const tripIds = Array.from(new Set(tickets.map((ticket) => ticket.tripId)));
        const tripRows = await tx.select({
          id: busTrips.id,
          status: busTrips.status,
          capacity: busVehicles.capacity,
        })
          .from(busTrips)
          .leftJoin(busVehicles, eq(busTrips.vehicleId, busVehicles.id))
          .where(and(eq(busTrips.companyId, companyId), inArray(busTrips.id, tripIds)));

        const tripsById = new Map(tripRows.map((trip) => [trip.id, trip]));
        const existingTickets = await tx.select({
          tripId: busTickets.tripId,
          ticketNumber: busTickets.ticketNumber,
          seatNumber: busTickets.seatNumber,
          quantity: busTickets.quantity,
          status: busTickets.status,
        })
          .from(busTickets)
          .where(and(eq(busTickets.companyId, companyId), inArray(busTickets.tripId, tripIds)));

        const existingTicketNumbers = new Set(existingTickets.map((ticket) => ticket.ticketNumber));
        const passengersByTrip = new Map<number, number>();
        const occupiedSeatsByTrip = new Map<number, Set<string>>();

        for (const ticket of existingTickets) {
          if ((ticket.status || ACTIVE_TICKET_STATUS) !== ACTIVE_TICKET_STATUS) continue;
          passengersByTrip.set(ticket.tripId, (passengersByTrip.get(ticket.tripId) || 0) + Number(ticket.quantity || 1));
          if (ticket.seatNumber) {
            const seats = occupiedSeatsByTrip.get(ticket.tripId) || new Set<string>();
            seats.add(ticket.seatNumber.trim().toLowerCase());
            occupiedSeatsByTrip.set(ticket.tripId, seats);
          }
        }

        const batchTicketNumbers = new Set<string>();
        for (const ticket of tickets) {
          const ticketNumber = ticket.ticketNumber?.trim();
          const trip = tripsById.get(ticket.tripId);
          if (!trip) {
            rejectedTickets.push({ ticketNumber, localTicketId: ticket.localTicketId, reason: "Trip does not belong to this company or no longer exists." });
            continue;
          }
          if (["completed", "cancelled"].includes(trip.status)) {
            rejectedTickets.push({ ticketNumber, localTicketId: ticket.localTicketId, reason: "Trip is closed and cannot accept more tickets." });
            continue;
          }
          if (!ticketNumber) {
            rejectedTickets.push({ ticketNumber, localTicketId: ticket.localTicketId, reason: "Ticket number is required." });
            continue;
          }
          if (existingTicketNumbers.has(ticketNumber) || batchTicketNumbers.has(ticketNumber)) {
            skippedTickets += 1;
            continue;
          }

          const seatNumber = ticket.seatNumber?.trim();
          if (seatNumber) {
            const occupiedSeats = occupiedSeatsByTrip.get(ticket.tripId) || new Set<string>();
            const normalizedSeat = seatNumber.toLowerCase();
            if (occupiedSeats.has(normalizedSeat)) {
              rejectedTickets.push({ ticketNumber, localTicketId: ticket.localTicketId, reason: `Seat ${seatNumber} is already allocated on this trip.` });
              continue;
            }
            occupiedSeats.add(normalizedSeat);
            occupiedSeatsByTrip.set(ticket.tripId, occupiedSeats);
          }

          const currentPassengers = passengersByTrip.get(ticket.tripId) || 0;
          const nextPassengers = currentPassengers + Number(ticket.quantity || 1);
          if (trip.capacity && nextPassengers > trip.capacity) {
            rejectedTickets.push({ ticketNumber, localTicketId: ticket.localTicketId, reason: `Trip capacity exceeded. Capacity is ${trip.capacity}, attempted passengers would be ${nextPassengers}.` });
            continue;
          }

          const inserted = await tx.insert(busTickets)
            .values({
              ...ticket,
              ticketNumber,
              seatNumber: seatNumber || null,
              companyId,
              isSynced: true,
            })
            .onConflictDoNothing()
            .returning();

          if (inserted.length > 0) {
            insertedTickets += 1;
            batchTicketNumbers.add(ticketNumber);
            existingTicketNumbers.add(ticketNumber);
            passengersByTrip.set(ticket.tripId, nextPassengers);
            await postBusTicketAccounting(inserted[0], tx);
          } else {
            skippedTickets += 1;
          }
        }
      }

      if (shifts.length > 0) {
        await tx.insert(busShifts).values(shifts.map(s => ({ ...s, companyId })));
      }
      if (reconciliations.length > 0) {
        const insertedReconciliations = await tx.insert(busReconciliations)
          .values(reconciliations.map(r => ({ ...r, companyId })))
          .returning();
        for (const reconciliation of insertedReconciliations) {
          await postBusReconciliationAccounting(reconciliation, tx);
        }
      }

      return { insertedTickets, skippedTickets, rejectedTickets };
    });

    res.json({
      success: syncResult.rejectedTickets.length === 0,
      synced: { tickets: syncResult.insertedTickets, shifts: shifts.length, reconciliations: reconciliations.length },
      skipped: { tickets: syncResult.skippedTickets },
      rejected: { tickets: syncResult.rejectedTickets },
    });
  } catch (err: any) {
    res.status(500).json({ error: "INTERNAL_ERROR", message: err.message });
  }
});

export default router;
