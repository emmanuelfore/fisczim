import 'dotenv/config';
import fs from 'fs';

const data = fs.readFileSync('./server/lib/fiscalization.ts', 'utf8');
const lines = data.split('\n');
let print = false;
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('receiptTaxes:')) {
    print = true;
  }
  if (print) {
    console.log(lines[i]);
  }
  if (print && lines[i].includes('}')) {
    print = false;
  }
}
process.exit(0);
