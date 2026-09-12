import { db } from './server/db';
import { products } from './shared/schema';

const companyId = 60;

const items = [
  // DASH CAMS
  { name: "C.I.A 5 4G Fleet Single Dash Cam", price: "148.00", category: "DASH CAMS", type: "good" },
  { name: "7 Dual Dash Cam", price: "269.00", category: "DASH CAMS", type: "good" },
  { name: "C.I.A 7 Pro Dual Dash Cam with AI", price: "299.00", category: "DASH CAMS", type: "good" },
  { name: "Unknown Dash Cam (Option 4)", price: "320.00", category: "DASH CAMS", type: "good" },
  { name: "Dashcam Monitoring & Recharge Services", price: "90.00", category: "DASH CAMS", type: "service" },
  { name: "Dashcam Monitoring Services", price: "20.00", category: "DASH CAMS", type: "service" },

  // PANIC BUTTONS
  { name: "Panic button EV-07B (Silver)", price: "71.00", category: "PANIC BUTTONS", type: "good" },
  { name: "Panic Button GPS Tracker A (Orange)", price: "71.00", category: "PANIC BUTTONS", type: "good" },
  { name: "Panic Button Security Deposit", price: "50.22", category: "PANIC BUTTONS", type: "service" },
  { name: "Panic Button Yearly Subscription", price: "10.39", category: "PANIC BUTTONS", type: "service" },
  { name: "Panic Button Monthly Subscription", price: "114.29", category: "PANIC BUTTONS", type: "service" },

  // BEACONS
  { name: "Bluetooth Beacons BLE 5.0", price: "40.00", category: "BEACONS", type: "good" },

  // VEHICLE TRACKERS
  { name: "Vehicle Prying Kit", price: "18.00", category: "VEHICLE TRACKERS", type: "good" },
  { name: "Vehicle Tracker CIA12", price: "100.00", category: "VEHICLE TRACKERS", type: "good" },
  { name: "Vehicle Tracker CIA16", price: "100.00", category: "VEHICLE TRACKERS", type: "good" },
  { name: "Vehicle Tracker CIA10", price: "100.00", category: "VEHICLE TRACKERS", type: "good" },
  { name: "Vehicle Tracker CIA11", price: "100.00", category: "VEHICLE TRACKERS", type: "good" },
  { name: "Dual Tracker Installation", price: "130.00", category: "VEHICLE TRACKERS", type: "service" },
  { name: "Vehicle Tracker Monitoring (Level 1)", price: "5.19", category: "VEHICLE TRACKERS", type: "service" },
  { name: "Vehicle Tracker Monitoring (Level 2)", price: "20.00", category: "VEHICLE TRACKERS", type: "service" },

  // FUEL TRACKERS
  { name: "Standard fuel sensor", price: "240.00", category: "FUEL TRACKERS", type: "good" },
  { name: "BLE fuel monitoring sensor", price: "280.00", category: "FUEL TRACKERS", type: "good" },
  { name: "Ultra Sonic Fuel sensor", price: "400.00", category: "FUEL TRACKERS", type: "good" },
  { name: "Calibrator", price: "100.00", category: "FUEL TRACKERS", type: "good" },

  // ASSET TRACKERS
  { name: "Asset Trackers S21L(E)", price: "80.00", category: "ASSET TRACKERS", type: "good" },
  { name: "Asset Trackers W18(U-EC)", price: "80.00", category: "ASSET TRACKERS", type: "good" },

  // CCTV CAMERAS
  { name: "Thumbsize Cameras", price: "47.62", category: "CCTV CAMERAS", type: "good" },
  { name: "CIA Standalone Cameras", price: "180.00", category: "CCTV CAMERAS", type: "good" },
  { name: "Monitoring for Standalone Camera", price: "25.00", category: "CCTV CAMERAS", type: "service" },
  { name: "Monitoring for 6-11 Channel Camera System", price: "150.00", category: "CCTV CAMERAS", type: "service" },
  { name: "Monitoring for 12+ Channel Camera System", price: "250.00", category: "CCTV CAMERAS", type: "service" },
];

async function run() {
  const values = items.map(item => ({
    companyId,
    name: item.name,
    price: item.price,
    category: item.category,
    productType: item.type,
    isTracked: item.type === "good",
    isForSale: true,
    isActive: true,
  }));

  const inserted = await db.insert(products).values(values).returning();
  console.log(`Inserted ${inserted.length} products.`);
  process.exit(0);
}
run().catch(console.error);
