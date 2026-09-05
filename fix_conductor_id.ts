import fs from 'fs';
const file = './mobile/src/hooks/useBusReports.ts';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
  /const cTickets = dayTickets\.filter\(\(t\) => t\.conductorId === conductorId\);/g,
  "const cTickets = dayTickets.filter((t) => String(t.conductorId) === String(conductorId));"
);

content = content.replace(
  /return tickets\.filter\(\(t\) => t\.conductorId === conductorId\);/g,
  "return tickets.filter((t) => String(t.conductorId) === String(conductorId));"
);

fs.writeFileSync(file, content);
