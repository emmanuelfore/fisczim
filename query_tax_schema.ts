import 'dotenv/config';
import { db } from './server/db';
import { taxTypes } from './shared/schema';

console.log(Object.keys(taxTypes));
