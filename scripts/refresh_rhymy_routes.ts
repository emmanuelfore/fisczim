import "dotenv/config";
import { eq, ilike, inArray } from "drizzle-orm";
import { db, pool } from "../server/db";
import {
  companies,
  busRoutes,
  busTrips,
  busTickets,
  busVehicles,
} from "../shared/schema";

async function main() {
  try {
    console.log("Refreshing Rhymy Digital routes...");

    const rhymy = await db
      .select()
      .from(companies)
      .where(ilike(companies.name, "Rhymy digital"))
      .limit(1)
      .then((res) => res[0]);

    if (!rhymy) {
      console.log("Rhymy digital not found!");
      return;
    }
    console.log("Company:", rhymy.name, "ID:", rhymy.id);

    // 1. Clean up existing
    const existingRoutes = await db
      .select()
      .from(busRoutes)
      .where(eq(busRoutes.companyId, rhymy.id));
    console.log("Existing routes:", existingRoutes.length);

    if (existingRoutes.length > 0) {
      const routeIds = existingRoutes.map(r => r.id);
      const existingTrips = await db
        .select()
        .from(busTrips)
        .where(inArray(busTrips.routeId, routeIds));
      console.log("Existing trips:", existingTrips.length);

      if (existingTrips.length > 0) {
        const tripIds = existingTrips.map(t => t.id);
        const existingTickets = await db
          .select()
          .from(busTickets)
          .where(inArray(busTickets.tripId, tripIds));
        console.log("Existing tickets:", existingTickets.length);

        if (existingTickets.length > 0) {
          await db.delete(busTickets).where(inArray(busTickets.tripId, tripIds));
          console.log("Deleted tickets:", existingTickets.length);
        }
        if (existingTrips.length > 0) {
          await db.delete(busTrips).where(inArray(busTrips.routeId, routeIds));
          console.log("Deleted trips:", existingTrips.length);
        }
      }
      await db.delete(busRoutes).where(eq(busRoutes.companyId, rhymy.id));
      console.log("Deleted routes:", existingRoutes.length);
    }

    // 2. Seed new routes with fare matrices (inter-stop pricing)
    const newRoutes = [
      {
        companyId: rhymy.id,
        name: "Harare ↔ Chinhoyi Express",
        fromLocation: "Harare",
        toLocation: "Chinhoyi",
        basePrice: "12.00",
        config: {
          dropOffPoints: [
            { name: "Banket", price: 5.00 },
            { name: "Lions Den", price: 7.00 },
            { name: "Mhangura", price: 9.00 },
          ],
          stops: ["Harare", "Banket", "Lions Den", "Mhangura", "Chinhoyi"],
          fares: {
            "Harare|Banket": 5.00,
            "Banket|Harare": 5.00,
            "Harare|Lions Den": 7.00,
            "Lions Den|Harare": 7.00,
            "Harare|Mhangura": 9.00,
            "Mhangura|Harare": 9.00,
            "Harare|Chinhoyi": 12.00,
            "Chinhoyi|Harare": 12.00,
            "Banket|Lions Den": 3.00,
            "Lions Den|Banket": 3.00,
            "Banket|Mhangura": 5.00,
            "Mhangura|Banket": 5.00,
            "Banket|Chinhoyi": 8.00,
            "Chinhoyi|Banket": 8.00,
            "Lions Den|Mhangura": 3.00,
            "Mhangura|Lions Den": 3.00,
            "Lions Den|Chinhoyi": 6.00,
            "Chinhoyi|Lions Den": 6.00,
            "Mhangura|Chinhoyi": 4.00,
            "Chinhoyi|Mhangura": 4.00,
          },
        },
      },
      {
        companyId: rhymy.id,
        name: "Bulawayo ↔ Beitbridge Border",
        fromLocation: "Bulawayo",
        toLocation: "Beitbridge",
        basePrice: "18.00",
        config: {
          dropOffPoints: [
            { name: "Plumtree", price: 6.00 },
            { name: "Mphoengs", price: 10.00 },
            { name: "West Nicholson", price: 14.00 },
          ],
          stops: ["Bulawayo", "Plumtree", "Mphoengs", "West Nicholson", "Beitbridge"],
          fares: {
            "Bulawayo|Plumtree": 6.00,
            "Plumtree|Bulawayo": 6.00,
            "Bulawayo|Mphoengs": 10.00,
            "Mphoengs|Bulawayo": 10.00,
            "Bulawayo|West Nicholson": 14.00,
            "West Nicholson|Bulawayo": 14.00,
            "Bulawayo|Beitbridge": 18.00,
            "Beitbridge|Bulawayo": 18.00,
            "Plumtree|Mphoengs": 5.00,
            "Mphoengs|Plumtree": 5.00,
            "Plumtree|West Nicholson": 9.00,
            "West Nicholson|Plumtree": 9.00,
            "Plumtree|Beitbridge": 13.00,
            "Beitbridge|Plumtree": 13.00,
            "Mphoengs|West Nicholson": 5.00,
            "West Nicholson|Mphoengs": 5.00,
            "Mphoengs|Beitbridge": 9.00,
            "Beitbridge|Mphoengs": 9.00,
            "West Nicholson|Beitbridge": 5.00,
            "Beitbridge|West Nicholson": 5.00,
          },
        },
      },
      {
        companyId: rhymy.id,
        name: "Mutare ↔ Chimanimani Scenic",
        fromLocation: "Mutare",
        toLocation: "Chimanimani",
        basePrice: "8.00",
        config: {
          dropOffPoints: [
            { name: "Watsomba", price: 3.00 },
            { name: "Nyanyadzi", price: 5.00 },
            { name: "Birchenough", price: 6.00 },
          ],
          stops: ["Mutare", "Watsomba", "Nyanyadzi", "Birchenough", "Chimanimani"],
          fares: {
            "Mutare|Watsomba": 3.00,
            "Watsomba|Mutare": 3.00,
            "Mutare|Nyanyadzi": 5.00,
            "Nyanyadzi|Mutare": 5.00,
            "Mutare|Birchenough": 6.00,
            "Birchenough|Mutare": 6.00,
            "Mutare|Chimanimani": 8.00,
            "Chimanimani|Mutare": 8.00,
            "Watsomba|Nyanyadzi": 3.00,
            "Nyanyadzi|Watsomba": 3.00,
            "Watsomba|Birchenough": 4.00,
            "Birchenough|Watsomba": 4.00,
            "Watsomba|Chimanimani": 6.00,
            "Chimanimani|Watsomba": 6.00,
            "Nyanyadzi|Birchenough": 2.00,
            "Birchenough|Nyanyadzi": 2.00,
            "Nyanyadzi|Chimanimani": 4.00,
            "Chimanimani|Nyanyadzi": 4.00,
            "Birchenough|Chimanimani": 3.00,
            "Chimanimani|Birchenough": 3.00,
          },
        },
      },
      {
        companyId: rhymy.id,
        name: "Gweru ↔ Zvishavane Minerals",
        fromLocation: "Gweru",
        toLocation: "Zvishavane",
        basePrice: "10.00",
        config: {
          dropOffPoints: [
            { name: "Mhandamabwe", price: 4.00 },
            { name: "Kwekwe", price: 6.00 },
            { name: "Redcliff", price: 8.00 },
          ],
          stops: ["Gweru", "Mhandamabwe", "Kwekwe", "Redcliff", "Zvishavane"],
          fares: {
            "Gweru|Mhandamabwe": 4.00,
            "Mhandamabwe|Gweru": 4.00,
            "Gweru|Kwekwe": 6.00,
            "Kwekwe|Gweru": 6.00,
            "Gweru|Redcliff": 8.00,
            "Redcliff|Gweru": 8.00,
            "Gweru|Zvishavane": 10.00,
            "Zvishavane|Gweru": 10.00,
            "Mhandamabwe|Kwekwe": 3.00,
            "Kwekwe|Mhandamabwe": 3.00,
            "Mhandamabwe|Redcliff": 5.00,
            "Redcliff|Mhandamabwe": 5.00,
            "Mhandamabwe|Zvishavane": 7.00,
            "Zvishavane|Mhandamabwe": 7.00,
            "Kwekwe|Redcliff": 3.00,
            "Redcliff|Kwekwe": 3.00,
            "Kwekwe|Zvishavane": 5.00,
            "Zvishavane|Kwekwe": 5.00,
            "Redcliff|Zvishavane": 3.00,
            "Zvishavane|Redcliff": 3.00,
          },
        },
      },
      {
        companyId: rhymy.id,
        name: "Masvingo ↔ Great Zimbabwe Loop",
        fromLocation: "Masvingo",
        toLocation: "Great Zimbabwe",
        basePrice: "5.00",
        config: {
          dropOffPoints: [
            { name: "Lake Mutirikwi", price: 2.00 },
            { name: "Kyle Dam", price: 3.00 },
            { name: "Norah's Farm", price: 4.00 },
          ],
          stops: ["Masvingo", "Lake Mutirikwi", "Kyle Dam", "Norah's Farm", "Great Zimbabwe"],
          fares: {
            "Masvingo|Lake Mutirikwi": 2.00,
            "Lake Mutirikwi|Masvingo": 2.00,
            "Masvingo|Kyle Dam": 3.00,
            "Kyle Dam|Masvingo": 3.00,
            "Masvingo|Norah's Farm": 4.00,
            "Norah's Farm|Masvingo": 4.00,
            "Masvingo|Great Zimbabwe": 5.00,
            "Great Zimbabwe|Masvingo": 5.00,
            "Lake Mutirikwi|Kyle Dam": 2.00,
            "Kyle Dam|Lake Mutirikwi": 2.00,
            "Lake Mutirikwi|Norah's Farm": 3.00,
            "Norah's Farm|Lake Mutirikwi": 3.00,
            "Lake Mutirikwi|Great Zimbabwe": 4.00,
            "Great Zimbabwe|Lake Mutirikwi": 4.00,
            "Kyle Dam|Norah's Farm": 2.00,
            "Norah's Farm|Kyle Dam": 2.00,
            "Kyle Dam|Great Zimbabwe": 3.00,
            "Great Zimbabwe|Kyle Dam": 3.00,
            "Norah's Farm|Great Zimbabwe": 2.00,
            "Great Zimbabwe|Norah's Farm": 2.00,
          },
        },
      },
      {
        companyId: rhymy.id,
        name: "Harare ↔ Kariba Sunset",
        fromLocation: "Harare",
        toLocation: "Kariba",
        basePrice: "22.00",
        config: {
          dropOffPoints: [
            { name: "Chinhoyi", price: 8.00 },
            { name: "Makuti", price: 14.00 },
            { name: "Nyamhunga", price: 18.00 },
          ],
          stops: ["Harare", "Chinhoyi", "Makuti", "Nyamhunga", "Kariba"],
          fares: {
            "Harare|Chinhoyi": 8.00,
            "Chinhoyi|Harare": 8.00,
            "Harare|Makuti": 14.00,
            "Makuti|Harare": 14.00,
            "Harare|Nyamhunga": 18.00,
            "Nyamhunga|Harare": 18.00,
            "Harare|Kariba": 22.00,
            "Kariba|Harare": 22.00,
            "Chinhoyi|Makuti": 7.00,
            "Makuti|Chinhoyi": 7.00,
            "Chinhoyi|Nyamhunga": 11.00,
            "Nyamhunga|Chinhoyi": 11.00,
            "Chinhoyi|Kariba": 15.00,
            "Kariba|Chinhoyi": 15.00,
            "Makuti|Nyamhunga": 5.00,
            "Nyamhunga|Makuti": 5.00,
            "Makuti|Kariba": 9.00,
            "Kariba|Makuti": 9.00,
            "Nyamhunga|Kariba": 5.00,
            "Kariba|Nyamhunga": 5.00,
          },
        },
      },
    ];

    console.log("\nSeeding new routes with fare matrices...");
    for (const data of newRoutes) {
      const existing = await db
        .select()
        .from(busRoutes)
        .where(eq(busRoutes.name, data.name))
        .limit(1)
        .then((res) => res[0]);

      if (existing) {
        console.log(`  ✓ Already exists: ${data.name}`);
      } else {
        const ins = await db.insert(busRoutes).values(data).returning().then(r => r[0]);
        console.log(`  ✓ Created: ${ins.name} (ID: ${ins.id}) - $${ins.basePrice} full, segments in fare matrix`);
      }
    }

    console.log("\n✅ Done! Rhymy Digital routes with segment pricing seeded.");

  } catch (error) {
    console.error("Error:", error);
  } finally {
    pool.end();
  }
}

main();
