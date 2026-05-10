import { Router } from "express";
import { z } from "zod";
import { db } from "../../db.js";
import { 
  busVehicles, busRoutes, busTrips, busTickets, busShifts, busReconciliations,
  insertBusVehicleSchema, insertBusRouteSchema, insertBusTripSchema,
  insertBusTicketSchema, insertBusShiftSchema, insertBusReconciliationSchema
} from "../../../shared/schema.js";
import { eq, and, desc, gte, lte } from "drizzle-orm";

const router = Router({ mergeParams: true });

// Helper to get company Id from either API key (req.company) or URL/Session (req.params)
function getTargetCompanyId(req: any) {
  if (req.company?.id) return req.company.id;
  if (req.params.companyId) return parseInt(req.params.companyId);
  throw new Error("Missing company context");
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
  const parsed = insertBusVehicleSchema.safeParse(req.body);
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
  const parsed = insertBusRouteSchema.safeParse(req.body);
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
    const trips = await db.select().from(busTrips)
      .where(eq(busTrips.companyId, companyId))
      .orderBy(desc(busTrips.scheduledDeparture));
    res.json(trips);
  } catch (err: any) {
    res.status(500).json({ error: "INTERNAL_ERROR", message: err.message });
  }
});

// GET /trips/active - For mobile POS: List trips assigned to current user
router.get("/trips/active", async (req, res) => {
  const user = (req as any).user;
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
  const parsed = insertBusTripSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "VALIDATION_ERROR", details: parsed.error.errors });

  try {
    const companyId = getTargetCompanyId(req);
    const [trip] = await db.insert(busTrips)
      .values({ ...parsed.data, companyId })
      .returning();
    res.status(201).json(trip);
  } catch (err: any) {
    res.status(500).json({ error: "INTERNAL_ERROR", message: err.message });
  }
});

// --- SYNC ---

const syncSchema = z.object({
  tickets: z.array(insertBusTicketSchema),
  shifts: z.array(insertBusShiftSchema),
  reconciliations: z.array(insertBusReconciliationSchema)
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
