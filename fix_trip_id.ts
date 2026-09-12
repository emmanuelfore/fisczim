import fs from 'fs';
const file = './mobile/src/screens/BusTicketing/TripManifestScreen.tsx';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
  /tickets\.filter\(\(t\) => t\.tripId === selectedTripId\)/g,
  "tickets.filter((t) => String(t.tripId) === String(selectedTripId))"
);

content = content.replace(
  /tickets\.filter\(\(t\) => t\.tripId === trip\.id\)/g,
  "tickets.filter((t) => String(t.tripId) === String(trip.id))"
);

fs.writeFileSync(file, content);
