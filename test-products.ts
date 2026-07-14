import 'dotenv/config';
import { db } from './server/db.js';
import { storage } from './server/storage.js';

async function test() {
  try {
    const APIProducts = await storage.getProducts(7);
    const nonZero = APIProducts.filter(p => Number(p.stockLevel) !== 0);
    console.log(`Total non-zero stock products: ${nonZero.length}`);
    nonZero.forEach(p => console.log(`Product: ID: ${p.id}, name: ${p.name}, stockLevel: ${p.stockLevel}`));
  } catch(e) {
    console.error(e);
  }
  process.exit();
}

test();
