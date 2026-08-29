import fs from 'fs';

const filePath = './mobile/src/hooks/useBusTicketing.ts';
let content = fs.readFileSync(filePath, 'utf8');

const target1 = `    try {
      const [cloudVehicles, cloudRoutes, cloudTrips] = await Promise.all([
      apiJson<any[]>(\`/api/companies/\${companyId}/bus-ticketing/vehicles\`).catch(() => null),
      apiJson<any[]>(\`/api/companies/\${companyId}/bus-ticketing/routes\`).catch(() => null),
      apiJson<any[]>(RECENT_TRIPS_PATH(companyId)).catch(() => null),
    ]);`;

const replacement1 = `    try {
      const [cloudVehicles, cloudRoutes, cloudTrips, cloudTickets] = await Promise.all([
      apiJson<any[]>(\`/api/companies/\${companyId}/bus-ticketing/vehicles\`).catch(() => null),
      apiJson<any[]>(\`/api/companies/\${companyId}/bus-ticketing/routes\`).catch(() => null),
      apiJson<any[]>(RECENT_TRIPS_PATH(companyId)).catch(() => null),
      apiJson<any[]>(\`/api/companies/\${companyId}/bus-ticketing/tickets?limit=1000\`).catch(() => null),
    ]);`;

content = content.replace(target1, replacement1);

const target2 = `      setTrips(merged);
      await writeJSON(KEYS.trips, merged);
    }`;

const replacement2 = `      setTrips(merged);
      await writeJSON(KEYS.trips, merged);
    }

    if (Array.isArray(cloudTickets)) {
      const localTickets = await readJSON<any[]>(KEYS.tickets, []);
      const localTicketsByCloudId = new Map(
        localTickets.filter(t => typeof t.id === 'number' || !isNaN(Number(t.id))).map(t => [Number(t.id), t])
      );
      const localTicketsByLocalId = new Map(
        localTickets.filter(t => t.localId).map(t => [t.localId, t])
      );
      
      const mappedCloudTickets = cloudTickets.map(t => ({
        id: t.id,
        localId: t.localTicketId,
        tripId: t.tripId,
        vehicleId: t.vehicleId,
        routeId: t.routeId,
        routeName: t.routeName || 'Unknown Route',
        conductorId: t.conductorId,
        conductorName: t.conductorName || 'Unknown Conductor',
        ticketNumber: t.ticketNumber,
        price: Number(t.amount) / Math.max(1, Number(t.quantity)),
        quantity: Number(t.quantity),
        totalAmount: Number(t.amount),
        currency: t.currency || 'USD',
        paymentMethod: t.paymentMethod,
        passengerName: t.passengerName,
        idNumber: t.idNumber,
        phone: t.phone,
        seatNumber: t.seatNumber,
        boardingPoint: t.boardingPoint,
        dropOffPoint: t.dropOffPoint,
        issuedAt: t.timestamp,
        isSynced: true,
        syncedAt: t.createdAt
      }));
      
      const mergedTickets = [
        ...mappedCloudTickets.map(ct => {
          const local = ct.localId ? localTicketsByLocalId.get(ct.localId) : localTicketsByCloudId.get(ct.id);
          return local ? { ...ct, ...local, isSynced: true } : ct;
        }),
        ...localTickets.filter(t => {
          const isNumeric = typeof t.id === 'number' || !isNaN(Number(t.id));
          const inCloud = isNumeric ? mappedCloudTickets.some(ct => ct.id === Number(t.id)) : false;
          const inCloudLocal = t.localId ? mappedCloudTickets.some(ct => ct.localId === t.localId) : false;
          return !inCloud && !inCloudLocal;
        })
      ];
      setTickets(mergedTickets);
      await writeJSON(KEYS.tickets, mergedTickets);
    }`;

content = content.replace(target2, replacement2);

fs.writeFileSync(filePath, content);
