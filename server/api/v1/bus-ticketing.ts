import { Router } from "express";
import { z } from "zod";
import { db } from "../../db.js";
import { 
  busVehicles, busRoutes, busTrips, busTickets, busShifts, busReconciliations,
  users,
  insertBusVehicleSchema, insertBusRouteSchema, insertBusTripSchema,
  insertBusTicketSchema, insertBusShiftSchema, insertBusReconciliationSchema
} from "../../../shared/schema.js";
import { eq, and, desc, gte, lte, inArray } from "drizzle-orm";

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

const routeRequestSchema = insertBusRouteSchema.omit({ companyId: true }).extend({
  name: z.string().trim().min(1, "Route name is required"),
  fromLocation: z.string().trim().min(1, "Origin is required"),
  toLocation: z.string().trim().min(1, "Destination is required"),
  basePrice: z.coerce.string(),
  config: z.record(z.any()).default({}),
});

const tripRequestSchema = insertBusTripSchema.omit({ companyId: true, conductorId: true }).extend({
  routeId: z.coerce.number().int().positive("Route is required"),
  vehicleId: z.coerce.number().int().positive("Vehicle is required"),
  conductorId: z.string().uuid().optional(),
  scheduledDeparture: z.coerce.date(),
  actualDeparture: z.coerce.date().nullable().optional(),
  status: z.string().default("scheduled"),
});

const ticketSyncSchema = insertBusTicketSchema.omit({ companyId: true }).extend({
  tripId: z.coerce.number().int().positive(),
  quantity: z.coerce.number().int().positive().default(1),
  amount: z.coerce.string(),
  timestamp: z.coerce.date(),
});

const shiftSyncSchema = insertBusShiftSchema.omit({ companyId: true }).extend({
  startTime: z.coerce.date(),
  endTime: z.coerce.date().nullable().optional(),
});

const reconciliationSyncSchema = insertBusReconciliationSchema.omit({ companyId: true });
const ONGOING_TRIP_STATUSES = ["boarding", "en_route", "in_progress"] as const;

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
    const [route] = await db.insert(busRoutes)
      .values({ ...parsed.data, companyId })
      .returning();
    res.status(201).json(route);
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
        eq(busTrips.status, "scheduled")
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
      ticketNumber: busTickets.ticketNumber,
      quantity: busTickets.quantity,
      amount: busTickets.amount,
      paymentMethod: busTickets.paymentMethod,
      timestamp: busTickets.timestamp,
      routeId: busTrips.routeId,
      vehicleId: busTrips.vehicleId,
      conductorId: busTrips.conductorId,
      routeName: busRoutes.name,
      vehicleRegNumber: busVehicles.regNumber,
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

    res.json({
      from: from.toISOString(),
      to: to.toISOString(),
      totals,
      byRoute: summarize(
        (row) => String(row.routeId || "unknown"),
        (row) => row.routeName || "Unknown route"
      ),
      byConductor: summarize(
        (row) => String(row.conductorId || "unknown"),
        (row) => row.conductorName || row.conductorEmail || "Unknown conductor"
      ),
      byVehicle: summarize(
        (row) => String(row.vehicleId || "unknown"),
        (row) => row.vehicleRegNumber || "Unknown vehicle"
      ),
      tickets: rows.map((row) => ({
        id: row.ticketId,
        ticketNumber: row.ticketNumber,
        quantity: Number(row.quantity || 1),
        amount: Number(row.amount || 0),
        paymentMethod: row.paymentMethod,
        timestamp: row.timestamp,
        conductorId: row.conductorId,
        routeId: row.routeId,
        vehicleId: row.vehicleId,
        routeName: row.routeName,
        vehicleRegNumber: row.vehicleRegNumber,
        conductorName: row.conductorName || row.conductorEmail,
      })),
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
    await db.transaction(async (tx) => {
      if (tickets.length > 0) {
        await tx.insert(busTickets).values(tickets.map(t => ({ ...t, companyId, isSynced: true })));
      }
      if (shifts.length > 0) {
        await tx.insert(busShifts).values(shifts.map(s => ({ ...s, companyId })));
      }
      if (reconciliations.length > 0) {
        await tx.insert(busReconciliations).values(reconciliations.map(r => ({ ...r, companyId })));
      }
    });

    res.json({ success: true, synced: { tickets: tickets.length, shifts: shifts.length, reconciliations: reconciliations.length } });
  } catch (err: any) {
    res.status(500).json({ error: "INTERNAL_ERROR", message: err.message });
  }
});

export default router;
