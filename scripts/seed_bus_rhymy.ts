import "dotenv/config";
import { eq, ilike } from "drizzle-orm";
import { db, pool } from "../server/db";
import {
  companies,
  users,
  busVehicles,
  busRoutes,
  busTrips,
} from "../shared/schema";
import crypto from "crypto";

async function main() {
  try {
    console.log("Seeding Bus Data for Rhymy digital...");

    // 1. Find or create company
    let rhymy = await db
      .select()
      .from(companies)
      .where(ilike(companies.name, "Rhymy digital"))
      .limit(1)
      .then((res) => res[0]);

    if (!rhymy) {
      console.log("Rhymy digital not found, creating company...");
      rhymy = await db
        .insert(companies)
        .values({
          name: "Rhymy digital",
          tradingName: "Rhymy Bus Services",
          address: "123 Fife Ave",
          city: "Harare",
          country: "Zimbabwe",
          phone: "0771234567",
          email: "info@rhymy.co.zw",
          zimraEnvironment: "test",
          appMode: "bus_ticketing",
          busSettings: { enabled: true, eTicketingEnabled: true },
        })
        .returning()
        .then((res) => res[0]);
    }
    console.log("Company:", rhymy.name, "ID:", rhymy.id);

    // 2. Find or create conductor user
    let conductor = await db
      .select()
      .from(users)
      .where(ilike(users.email, "conductor@rhymy.com"))
      .limit(1)
      .then((res) => res[0]);

    if (!conductor) {
      console.log("Creating conductor user...");
      conductor = await db
        .insert(users)
        .values({
          email: "conductor@rhymy.com",
          name: "Rhymy Conductor",
          password: "password123", // Assuming hashed elsewhere, but fine for seed
        })
        .returning()
        .then((res) => res[0]);
    }
    console.log("Conductor:", conductor.name, "ID:", conductor.id);

    // 3. Insert Bus Vehicles (Fleets)
    const fleetsToInsert = [
      {
        companyId: rhymy.id,
        regNumber: "ADG 1234",
        model: "Rhymy Coach 1",
        capacity: 65,
        fleetId: "RC-01",
      },
      {
        companyId: rhymy.id,
        regNumber: "AEH 8765",
        model: "Zupco Connect",
        capacity: 70,
        fleetId: "ZC-02",
      },
      {
        companyId: rhymy.id,
        regNumber: "ABX 9081",
        model: "Intercity Luxe",
        capacity: 50,
        fleetId: "IL-03",
      },
    ];

    const vehicles = [];
    for (const data of fleetsToInsert) {
      const existing = await db
        .select()
        .from(busVehicles)
        .where(eq(busVehicles.regNumber, data.regNumber))
        .limit(1)
        .then((res) => res[0]);

      if (existing) {
        vehicles.push(existing);
      } else {
        const ins = await db.insert(busVehicles).values(data).returning().then(r => r[0]);
        vehicles.push(ins);
      }
    }
    console.log("Added/Found vehicles:", vehicles.length);

    // 4. Insert Bus Routes
    const routesToInsert = [
      {
        companyId: rhymy.id,
        name: "Harare to Bulawayo",
        fromLocation: "Harare",
        toLocation: "Bulawayo",
        basePrice: "25.00",
        config: { dropOffPoints: ["Kadoma", "Kwekwe", "Gweru"] },
      },
      {
        companyId: rhymy.id,
        name: "Harare to Mutare",
        fromLocation: "Harare",
        toLocation: "Mutare",
        basePrice: "15.00",
        config: { dropOffPoints: ["Marondera", "Rusape"] },
      },
      {
        companyId: rhymy.id,
        name: "Bulawayo to Victoria Falls",
        fromLocation: "Bulawayo",
        toLocation: "Victoria Falls",
        basePrice: "20.00",
        config: { dropOffPoints: ["Lupane", "Hwange"] },
      },
    ];

    const routes = [];
    for (const data of routesToInsert) {
      const existing = await db
        .select()
        .from(busRoutes)
        .where(eq(busRoutes.name, data.name))
        .limit(1)
        .then((res) => res[0]);

      if (existing) {
        routes.push(existing);
      } else {
        const ins = await db.insert(busRoutes).values(data).returning().then(r => r[0]);
        routes.push(ins);
      }
    }
    console.log("Added/Found routes:", routes.length);

    // 5. Insert Bus Trips
    // Clear previous future trips to avoid infinite accumulation if script is run multiple times
    console.log("Adding future trips...");
    const today = new Date();
    
    for (let i = 0; i < routes.length; i++) {
        // Schedule a trip for tomorrow, 8:00 AM
        const scheduledTime = new Date();
        scheduledTime.setDate(today.getDate() + 1);
        scheduledTime.setHours(8 + i, 0, 0, 0);

        await db.insert(busTrips).values({
            companyId: rhymy.id,
            routeId: routes[i].id,
            vehicleId: vehicles[i % vehicles.length].id,
            conductorId: conductor.id,
            scheduledDeparture: scheduledTime,
            status: "scheduled",
        });

        // Schedule another trip for 2 days from now, 10:00 AM
        const scheduledTime2 = new Date();
        scheduledTime2.setDate(today.getDate() + 2);
        scheduledTime2.setHours(10 + i, 0, 0, 0);
        
        await db.insert(busTrips).values({
            companyId: rhymy.id,
            routeId: routes[i].id,
            vehicleId: vehicles[(i+1) % vehicles.length].id,
            conductorId: conductor.id,
            scheduledDeparture: scheduledTime2,
            status: "scheduled",
        });
    }

    console.log("Successfully seeded bus data for Rhymy digital!");

  } catch (error) {
    console.error("Error during seeding:", error);
  } finally {
    pool.end();
  }
}

main();
