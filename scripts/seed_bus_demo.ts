import "dotenv/config";
import { and, eq, ilike, inArray } from "drizzle-orm";
import { db, pool } from "../server/db";
import {
  companies,
  users,
  companyUsers,
  busVehicles,
  busRoutes,
  busTrips,
  busTickets,
  busShifts,
  busReconciliations,
  journalEntries,
  ledgerEntries,
} from "../shared/schema";

// ── Demo data for Rhymy Digital ────────────────────────────────────────────
// Resets the company's bus-ticketing data and seeds a realistic demo:
// vehicles, routes with priced drop-off stops, conductors, trips (completed +
// scheduled), tickets for the completed trips, and a closed shift + cash-up.

const ROUTE_DEFS = [
  {
    name: "Harare → Bulawayo",
    fromLocation: "Harare",
    toLocation: "Bulawayo",
    basePrice: "25.00",
    distanceKm: 489,
    stops: [
      { name: "Kadoma", price: 8 },
      { name: "Kwekwe", price: 15 },
      { name: "Gweru", price: 20 },
    ],
  },
  {
    name: "Harare → Mutare",
    fromLocation: "Harare",
    toLocation: "Mutare",
    basePrice: "15.00",
    distanceKm: 263,
    stops: [
      { name: "Marondera", price: 5 },
      { name: "Rusape", price: 10 },
    ],
  },
  {
    name: "Harare → Masvingo",
    fromLocation: "Harare",
    toLocation: "Masvingo",
    basePrice: "18.00",
    distanceKm: 294,
    stops: [
      { name: "Chivhu", price: 6 },
      { name: "Gutu", price: 12 },
    ],
  },
  {
    name: "Bulawayo → Victoria Falls",
    fromLocation: "Bulawayo",
    toLocation: "Victoria Falls",
    basePrice: "20.00",
    distanceKm: 439,
    stops: [
      { name: "Lupane", price: 8 },
      { name: "Hwange", price: 14 },
    ],
  },
  {
    name: "Harare → Beitbridge",
    fromLocation: "Harare",
    toLocation: "Beitbridge",
    basePrice: "30.00",
    distanceKm: 580,
    stops: [
      { name: "Masvingo", price: 15 },
      { name: "Chiredzi", price: 25 },
    ],
  },
];

const VEHICLE_DEFS = [
  { regNumber: "ADG 1234", model: "Yutong ZK6120", capacity: 65, fleetId: "RC-01" },
  { regNumber: "AEH 8765", model: "King Long XMQ6130", capacity: 70, fleetId: "RC-02" },
  { regNumber: "ABX 9081", model: "Ankai HFF6121", capacity: 50, fleetId: "RC-03" },
  { regNumber: "AFZ 3345", model: "Scania Interlink", capacity: 56, fleetId: "RC-04" },
];

function routeConfig(def: typeof ROUTE_DEFS[number]) {
  return {
    currency: "USD",
    distanceKm: def.distanceKm,
    direction: "outbound",
    passengerName: true,
    idNumber: true,
    phone: true,
    seatNumber: true,
    dropOffPoint: true,
    dropOffPoints: def.stops.map((s) => ({ name: s.name, price: s.price })),
    requirePaymentMethod: true,
    allowMultiPassenger: true,
  };
}

function daysFromNow(days: number, hour: number, minute = 0): Date {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(hour, minute, 0, 0);
  return d;
}

function pad(n: number, len = 4) {
  return String(n).padStart(len, "0");
}

async function main() {
  const company = await db
    .select()
    .from(companies)
    .where(ilike(companies.name, "Rhymy digital"))
    .limit(1)
    .then((res) => res[0]);

  if (!company) {
    console.error("Company 'Rhymy Digital' not found. Run the company seed first.");
    return;
  }
  console.log("Company:", company.name, "(id", company.id + ")");

  const companyId = company.id;

  // 1. Reset existing bus data in FK-safe order.
  console.log("\nClearing existing bus data...");
  await db.transaction(async (tx) => {
    await tx.delete(busTickets).where(eq(busTickets.companyId, companyId));
    await tx.delete(busReconciliations).where(eq(busReconciliations.companyId, companyId));
    await tx.delete(busShifts).where(eq(busShifts.companyId, companyId));
    await tx.delete(busTrips).where(eq(busTrips.companyId, companyId));
    await tx.delete(busRoutes).where(eq(busRoutes.companyId, companyId));
    await tx.delete(busVehicles).where(eq(busVehicles.companyId, companyId));

    // Remove orphaned bus journal entries left behind by the deleted tickets.
    const orphanJournals = await tx
      .select({ id: journalEntries.id })
      .from(journalEntries)
      .where(and(
        eq(journalEntries.companyId, companyId),
        inArray(journalEntries.referenceType, ["BUS_TICKET", "BUS_RECONCILIATION"])
      ));
    const ids = orphanJournals.map((j) => j.id);
    if (ids.length > 0) {
      await tx.delete(ledgerEntries).where(inArray(ledgerEntries.journalEntryId, ids));
      await tx.delete(journalEntries).where(inArray(journalEntries.id, ids));
    }
  });
  console.log("Cleared.");

  // 2. Conductor users (link to company).
  console.log("\nEnsuring conductor users...");
  const conductorDefs = [
    { email: "conductor@rhymy.com", name: "Tendai Moyo" },
    { email: "johnmoyo@gmail.com", name: "John Moyo" },
  ];
  const conductors: typeof users.$inferSelect[] = [];
  for (const def of conductorDefs) {
    let user = await db
      .select()
      .from(users)
      .where(ilike(users.email, def.email))
      .limit(1)
      .then((res) => res[0]);
    if (!user) {
      user = await db.insert(users).values({
        email: def.email,
        name: def.name,
        password: "password123",
      }).returning().then((r) => r[0]);
    }
    const link = await db
      .select()
      .from(companyUsers)
      .where(and(
        eq(companyUsers.userId, user.id),
        eq(companyUsers.companyId, companyId)
      ))
      .limit(1)
      .then((res) => res[0]);
    if (!link) {
      await db.insert(companyUsers).values({
        userId: user.id,
        companyId,
        role: "cashier",
      });
    } else if (link.role !== "cashier") {
      await db.update(companyUsers)
        .set({ role: "cashier" })
        .where(and(
          eq(companyUsers.userId, user.id),
          eq(companyUsers.companyId, companyId)
        ));
    }
    conductors.push(user);
    console.log("  conductor:", user.name, user.id);
  }

  // 3. Vehicles.
  console.log("\nSeeding vehicles...");
  const vehicles: typeof busVehicles.$inferSelect[] = [];
  for (const def of VEHICLE_DEFS) {
    const v = await db.insert(busVehicles).values({ companyId, ...def }).returning().then((r) => r[0]);
    vehicles.push(v);
    console.log("  vehicle:", v.regNumber, v.model, `(${v.capacity} seats)`);
  }

  // 4. Routes with priced stops.
  console.log("\nSeeding routes with priced stops...");
  const routes: typeof busRoutes.$inferSelect[] = [];
  for (const def of ROUTE_DEFS) {
    const r = await db.insert(busRoutes).values({
      companyId,
      name: def.name,
      fromLocation: def.fromLocation,
      toLocation: def.toLocation,
      basePrice: def.basePrice,
      config: routeConfig(def),
      isActive: true,
    }).returning().then((row) => row[0]);
    routes.push(r);
    console.log("  route:", r.name, `(full $${r.basePrice})`, def.stops.map((s) => `${s.name} $${s.price}`).join(", "));
  }

  // 5. Trips.
  //    Completed trips on the main routes with tickets (revenue for the demo),
  //    plus scheduled trips over the next few days.
  console.log("\nSeeding trips...");
  const completedTrips: typeof busTrips.$inferSelect[] = [];

  const completedPlan = [
    { routeIdx: 0, vehicleIdx: 0, conductorIdx: 0, daysAgo: 1, hour: 8 },
    { routeIdx: 1, vehicleIdx: 1, conductorIdx: 1, daysAgo: 1, hour: 9 },
    { routeIdx: 0, vehicleIdx: 2, conductorIdx: 0, daysAgo: 0, hour: 8 },
    { routeIdx: 2, vehicleIdx: 3, conductorIdx: 1, daysAgo: 0, hour: 10 },
  ];

  for (const plan of completedPlan) {
    const scheduled = daysFromNow(-plan.daysAgo, plan.hour);
    const actual = new Date(scheduled);
    const arrival = new Date(actual);
    arrival.setHours(actual.getHours() + 7);
    const t = await db.insert(busTrips).values({
      companyId,
      routeId: routes[plan.routeIdx].id,
      vehicleId: vehicles[plan.vehicleIdx].id,
      conductorId: conductors[plan.conductorIdx].id,
      scheduledDeparture: scheduled,
      actualDeparture: actual,
      actualArrival: arrival,
      status: "completed",
    }).returning().then((row) => row[0]);
    completedTrips.push(t);
    console.log("  completed trip:", t.id, routes[plan.routeIdx].name, scheduled.toISOString());
  }

  // Scheduled future trips.
  const futurePlan = [
    { routeIdx: 0, vehicleIdx: 0, conductorIdx: 0, days: 1, hour: 8 },
    { routeIdx: 1, vehicleIdx: 1, conductorIdx: 1, days: 1, hour: 9 },
    { routeIdx: 3, vehicleIdx: 2, conductorIdx: 0, days: 2, hour: 7 },
    { routeIdx: 4, vehicleIdx: 3, conductorIdx: 1, days: 2, hour: 6 },
    { routeIdx: 0, vehicleIdx: 0, conductorIdx: 0, days: 3, hour: 8 },
    { routeIdx: 2, vehicleIdx: 1, conductorIdx: 1, days: 3, hour: 10 },
  ];
  for (const plan of futurePlan) {
    await db.insert(busTrips).values({
      companyId,
      routeId: routes[plan.routeIdx].id,
      vehicleId: vehicles[plan.vehicleIdx].id,
      conductorId: conductors[plan.conductorIdx].id,
      scheduledDeparture: daysFromNow(plan.days, plan.hour),
      status: "scheduled",
    });
  }
  console.log(`  scheduled ${futurePlan.length} future trips`);

  // 6. Tickets for completed trips so the report shows revenue.
  console.log("\nSeeding tickets for completed trips...");
  const PAYMENT_METHODS = ["Cash", "Cash", "Cash", "EcoCash", "Swipe"];
  const ticketNumberSeq: Record<string, number> = {};
  let totalTickets = 0;

  const nextTicketNumber = (dayKey: string) => {
    ticketNumberSeq[dayKey] = (ticketNumberSeq[dayKey] || 0) + 1;
    return `TKT-${dayKey}-${pad(ticketNumberSeq[dayKey])}`;
  };

  for (const trip of completedTrips) {
    const route = routes.find((r) => r.id === trip.routeId)!;
    const stops = (route.config as any).dropOffPoints as Array<{ name: string; price: number }>;
    const fullFare = Number(route.basePrice);
    const options = [...stops.map((s) => ({ price: s.price, label: s.name })), { price: fullFare, label: null }];
    const count = 14 + (trip.id % 3) * 5; // deterministic-ish passenger count
    const dayKey = trip.actualDeparture!.toISOString().slice(0, 10).replace(/-/g, "");

    for (let i = 0; i < count; i++) {
      const opt = options[i % options.length];
      const quantity = 1 + (i % 3 === 0 ? 1 : 0);
      const amount = opt.price * quantity;
      const ticketTime = new Date(trip.actualDeparture!);
      ticketTime.setMinutes(ticketTime.getMinutes() + i * 9);

      await db.insert(busTickets).values({
        companyId,
        tripId: trip.id,
        ticketNumber: nextTicketNumber(dayKey),
        quantity,
        amount: amount.toFixed(2),
        currency: "USD",
        paymentMethod: PAYMENT_METHODS[i % PAYMENT_METHODS.length],
        status: "active",
        isSynced: true,
        accountingStatus: "unposted",
        boardingPoint: route.fromLocation,
        dropOffPoint: opt.label,
        timestamp: ticketTime,
      });
      totalTickets += 1;
    }
  }
  console.log(`  ${totalTickets} tickets created`);

  // 7. A closed shift + cash-up for the most recent completed trip so the
  //    web cash-up approval flow has something to demo.
  console.log("\nSeeding shift + cash-up...");
  const lastTrip = completedTrips[completedTrips.length - 1];
  const lastRoute = routes.find((r) => r.id === lastTrip.routeId)!;
  const lastConductor = conductors.find((c) => c.id === lastTrip.conductorId)!;

  const tripTickets = await db
    .select()
    .from(busTickets)
    .where(eq(busTickets.tripId, lastTrip.id));
  const revenue = tripTickets.reduce((sum, t) => sum + Number(t.amount || 0), 0);
  const expectedCash = tripTickets
    .filter((t) => t.paymentMethod === "Cash")
    .reduce((sum, t) => sum + Number(t.amount || 0), 0);
  const cashReceived = Math.round(expectedCash * 100) / 100; // exact match → approved

  const [shift] = await db.insert(busShifts).values({
    companyId,
    conductorId: lastConductor.id,
    vehicleId: lastTrip.vehicleId,
    tripId: lastTrip.id,
    routeId: lastTrip.routeId,
    startTime: lastTrip.actualDeparture!,
    endTime: lastTrip.actualArrival!,
    closedAt: lastTrip.actualArrival!,
    totalTickets: tripTickets.length,
    totalRevenue: revenue.toFixed(2),
    status: "closed",
  }).returning();

  const dateKey = lastTrip.actualArrival!.toISOString().slice(0, 10);
  await db.insert(busReconciliations).values({
    companyId,
    shiftId: shift.id,
    conductorId: lastConductor.id,
    date: dateKey,
    expectedCash: expectedCash.toFixed(2),
    cashReceived: cashReceived.toFixed(2),
    gap: "0.00",
    status: "pending",
    accountingStatus: "unposted",
  });
  console.log(`  shift #${shift.id} (${lastRoute.name}) expected $${expectedCash.toFixed(2)} / received $${cashReceived.toFixed(2)}`);

  console.log("\n✅ Bus demo seed complete for Rhymy Digital.");
}

main()
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());