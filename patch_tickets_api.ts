import fs from 'fs';

const filePath = './server/api/v1/bus-ticketing.ts';
let content = fs.readFileSync(filePath, 'utf8');

const target = `    const tickets = await db.select().from(busTickets)
      .where(and(...conditions))
      .orderBy(desc(busTickets.timestamp))
      .limit(limit);`;

const replacement = `    // Join trips, routes, and users to get full ticket info
    const query = db.select({
      id: busTickets.id,
      ticketNumber: busTickets.ticketNumber,
      tripId: busTickets.tripId,
      shiftId: busTickets.shiftId,
      deviceId: busTickets.deviceId,
      localTicketId: busTickets.localTicketId,
      passengerName: busTickets.passengerName,
      idNumber: busTickets.idNumber,
      phone: busTickets.phone,
      boardingPoint: busTickets.boardingPoint,
      dropOffPoint: busTickets.dropOffPoint,
      seatNumber: busTickets.seatNumber,
      quantity: busTickets.quantity,
      amount: busTickets.amount,
      currency: busTickets.currency,
      paymentMethod: busTickets.paymentMethod,
      status: busTickets.status,
      timestamp: busTickets.timestamp,
      createdAt: busTickets.createdAt,
      // Joined fields
      routeId: busTrips.routeId,
      routeName: busRoutes.name,
      conductorId: busTrips.conductorId,
      conductorName: users.name,
      vehicleId: busTrips.vehicleId,
    })
      .from(busTickets)
      .leftJoin(busTrips, eq(busTickets.tripId, busTrips.id))
      .leftJoin(busRoutes, eq(busTrips.routeId, busRoutes.id))
      .leftJoin(users, eq(busTrips.conductorId, users.id))
      .where(and(...conditions))
      .orderBy(desc(busTickets.timestamp))
      .limit(limit);

    const tickets = await query;`;

content = content.replace(target, replacement);

const target2 = `    const conditions = [eq(busTickets.companyId, companyId)];
    if (tripId && Number.isFinite(tripId)) conditions.push(eq(busTickets.tripId, tripId));
    if (status) conditions.push(eq(busTickets.status, status));`;

const replacement2 = `    const conductorId = req.query.conductorId ? String(req.query.conductorId) : undefined;
    const conditions = [eq(busTickets.companyId, companyId)];
    if (tripId && Number.isFinite(tripId)) conditions.push(eq(busTickets.tripId, tripId));
    if (status) conditions.push(eq(busTickets.status, status));
    if (conductorId) conditions.push(eq(busTrips.conductorId, conductorId));`;

content = content.replace(target2, replacement2);

fs.writeFileSync(filePath, content);
