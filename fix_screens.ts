import fs from 'fs';

function fixManifest() {
  const file = './mobile/src/screens/BusTicketing/TripManifestScreen.tsx';
  let content = fs.readFileSync(file, 'utf8');

  // Fix tripId string comparison issue
  content = content.replace(
    /const tripIds = new Set\(tickets\.map\(\(t\) => t\.tripId\)\.filter\(Boolean\)\);/g,
    "const tripIds = new Set(tickets.map((t) => t.tripId ? String(t.tripId) : null).filter(Boolean));"
  );
  
  // Also fix the filter on tickets to use String
  content = content.replace(
    /tickets\.filter\(\(t\) => t\.tripId === selectedTripId\)/g,
    "tickets.filter((t) => String(t.tripId) === String(selectedTripId))"
  );

  fs.writeFileSync(file, content);
}

function fixConductorReport() {
  const file = './mobile/src/screens/BusTicketing/BusConductorReportScreen.tsx';
  let content = fs.readFileSync(file, 'utf8');

  const oldCode = `  const visibleConductors = useMemo(() => {
    if (!restrictToOwn) return conductors;
    if (activeConductor) return conductors.filter((c) => c.id === activeConductor.id);
    const fallbackId = resolveCashierConductorId(userId, userName);
    if (fallbackId) return conductors.filter((c) => c.id === fallbackId);
    return [];
  }, [restrictToOwn, conductors, activeConductor, userId, userName]);`;

  const newCode = `  const visibleConductors = useMemo(() => {
    if (!restrictToOwn) {
      const existingIds = new Set(conductors.map(c => String(c.id)));
      const fromTickets: typeof conductors = [];
      for (const t of allTickets) {
        if (t.conductorId && !existingIds.has(String(t.conductorId))) {
          existingIds.add(String(t.conductorId));
          fromTickets.push({
            id: String(t.conductorId),
            name: t.conductorName || 'Unknown',
            isActive: false,
          });
        }
      }
      return [...conductors, ...fromTickets];
    }
    
    if (activeConductor) return [activeConductor];
    const fallbackId = resolveCashierConductorId(userId, userName);
    if (fallbackId) {
      const found = conductors.find((c) => c.id === fallbackId);
      return found ? [found] : [{ id: fallbackId, name: userName || 'Conductor', isActive: true }];
    }
    return [];
  }, [restrictToOwn, conductors, activeConductor, userId, userName, allTickets]);`;

  content = content.replace(oldCode, newCode);
  fs.writeFileSync(file, content);
}

fixManifest();
fixConductorReport();
