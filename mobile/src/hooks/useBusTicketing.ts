import { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  BusRoute,
  IssuedTicket,
  Conductor,
  ShiftRecord,
  BusVehicle,
  BusTrip,
} from '../types/busTicketing';

// ── Storage keys ────────────────────────────────────────────────
const KEYS = {
  routes: 'fieldpos_bus_routes',
  tickets: 'fieldpos_bus_tickets',
  conductors: 'fieldpos_conductors',
  activeConductor: 'fieldpos_active_conductor',
  shifts: 'fieldpos_bus_shifts',
  reconciliations: 'fieldpos_reconciliations',
  vehicles: 'fieldpos_bus_vehicles',
  trips: 'fieldpos_bus_trips',
} as const;

// ── Helpers ─────────────────────────────────────────────────────
function todayStr(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}

function isSameCalendarDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

async function readJSON<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (raw === null) return fallback;
    return JSON.parse(raw) as T;
  } catch (e) {
    console.error(`[useBusTicketing] readJSON error for key "${key}":`, e);
    return fallback;
  }
}

async function writeJSON<T>(key: string, value: T): Promise<void> {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.error(`[useBusTicketing] writeJSON error for key "${key}":`, e);
  }
}

// ── Hook ────────────────────────────────────────────────────────
export function useBusTicketing() {
  const [routes, setRoutes] = useState<BusRoute[]>([]);
  const [tickets, setTickets] = useState<IssuedTicket[]>([]);
  const [conductors, setConductors] = useState<Conductor[]>([]);
  const [activeConductorId, setActiveConductorId] = useState<string | null>(null);
  const [shifts, setShifts] = useState<ShiftRecord[]>([]);
  const [vehicles, setVehicles] = useState<BusVehicle[]>([]);
  const [trips, setTrips] = useState<BusTrip[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const activeConductor: Conductor | null =
    conductors.find((c) => c.id === activeConductorId) ?? null;

  const activeTrip: BusTrip | null =
    trips.find((t) => t.status === 'in_progress' && t.conductorId === activeConductorId) ?? null;

  // ── Load all on mount ─────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [r, t, c, ac, s, v, tr] = await Promise.all([
        readJSON<BusRoute[]>(KEYS.routes, []),
        readJSON<IssuedTicket[]>(KEYS.tickets, []),
        readJSON<Conductor[]>(KEYS.conductors, []),
        readJSON<string | null>(KEYS.activeConductor, null),
        readJSON<ShiftRecord[]>(KEYS.shifts, []),
        readJSON<BusVehicle[]>(KEYS.vehicles, []),
        readJSON<BusTrip[]>(KEYS.trips, []),
      ]);
      if (!cancelled) {
        setRoutes(r);
        setTickets(t);
        setConductors(c);
        setActiveConductorId(ac);
        setShifts(s);
        setVehicles(v);
        setTrips(tr);
        setIsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // ── Route helpers ─────────────────────────────────────────────
  const getRoutes = useCallback(() => routes, [routes]);

  const saveRoute = useCallback(async (route: BusRoute) => {
    const updated = [...routes, route];
    setRoutes(updated);
    await writeJSON(KEYS.routes, updated);
  }, [routes]);

  const updateRoute = useCallback(async (id: string, updates: Partial<BusRoute>) => {
    const updated = routes.map((r) => (r.id === id ? { ...r, ...updates } : r));
    setRoutes(updated);
    await writeJSON(KEYS.routes, updated);
  }, [routes]);

  const deleteRoute = useCallback(async (id: string) => {
    const hasTickets = tickets.some((t) => t.routeId === id);
    if (hasTickets) {
      throw new Error('Cannot delete a route that has issued tickets.');
    }
    const updated = routes.filter((r) => r.id !== id);
    setRoutes(updated);
    await writeJSON(KEYS.routes, updated);
  }, [routes, tickets]);

  // ── Vehicle helpers ───────────────────────────────────────────
  const saveVehicle = useCallback(async (vehicle: BusVehicle) => {
    const updated = [...vehicles, vehicle];
    setVehicles(updated);
    await writeJSON(KEYS.vehicles, updated);
  }, [vehicles]);

  const updateVehicle = useCallback(async (id: string, updates: Partial<BusVehicle>) => {
    const updated = vehicles.map((v) => (v.id === id ? { ...v, ...updates } : v));
    setVehicles(updated);
    await writeJSON(KEYS.vehicles, updated);
  }, [vehicles]);

  const deleteVehicle = useCallback(async (id: string) => {
    const updated = vehicles.filter((v) => v.id !== id);
    setVehicles(updated);
    await writeJSON(KEYS.vehicles, updated);
  }, [vehicles]);

  // ── Ticket helpers ────────────────────────────────────────────
  const generateTicketId = useCallback((allTickets: IssuedTicket[]): string => {
    const dateStr = todayStr();
    const todayTickets = allTickets.filter((t) =>
      isSameCalendarDay(new Date(t.issuedAt), new Date())
    );
    const seq = String(todayTickets.length + 1).padStart(4, '0');
    return `TKT-${dateStr}-${seq}`;
  }, []);

  const issueTicket = useCallback(async (ticket: IssuedTicket) => {
    // Allow caller to pass id='auto' and we generate it
    const finalTicket: IssuedTicket = {
      ...ticket,
      id: ticket.id === 'auto' ? generateTicketId(tickets) : ticket.id,
    };
    const updated = [...tickets, finalTicket];
    setTickets(updated);
    await writeJSON(KEYS.tickets, updated);
  }, [tickets, generateTicketId]);

  const getTodaysTickets = useCallback((): IssuedTicket[] => {
    const now = new Date();
    return tickets.filter((t) => isSameCalendarDay(new Date(t.issuedAt), now));
  }, [tickets]);

  const getTicketsByDateRange = useCallback(
    (from: Date, to: Date): IssuedTicket[] => {
      const start = new Date(from.getFullYear(), from.getMonth(), from.getDate());
      const end = new Date(to.getFullYear(), to.getMonth(), to.getDate(), 23, 59, 59, 999);
      return tickets.filter((t) => {
        const d = new Date(t.issuedAt);
        return d >= start && d <= end;
      });
    },
    [tickets]
  );

  // ── Conductor helpers ─────────────────────────────────────────
  const saveConductor = useCallback(async (conductor: Conductor) => {
    const exists = conductors.some((c) => c.id === conductor.id);
    const updated = exists
      ? conductors.map((c) => (c.id === conductor.id ? conductor : c))
      : [...conductors, conductor];
    setConductors(updated);
    await writeJSON(KEYS.conductors, updated);
  }, [conductors]);

  const setActiveConductor = useCallback(async (id: string) => {
    setActiveConductorId(id);
    await writeJSON(KEYS.activeConductor, id);
  }, []);

  const getActiveConductor = useCallback(async (): Promise<Conductor | null> => {
    const id = await readJSON<string | null>(KEYS.activeConductor, null);
    if (!id) return null;
    const all = await readJSON<Conductor[]>(KEYS.conductors, []);
    return all.find((c) => c.id === id) ?? null;
  }, []);

  // ── Trip/Shift helpers ─────────────────────────────────────────
  const startTrip = useCallback(async (trip: BusTrip) => {
    // Guard against bus already being taken by an in_progress trip
    const vehicleTaken = trips.find(t => t.vehicleId === trip.vehicleId && t.status === 'in_progress');
    if (vehicleTaken) {
      throw new Error(`This vehicle is currently in use by another conductor's trip.`);
    }
    const updated = [...trips, trip];
    setTrips(updated);
    await writeJSON(KEYS.trips, updated);
  }, [trips]);

  const closeShift = useCallback(async (record: ShiftRecord) => {
    const updatedShifts = [...shifts, record];
    setShifts(updatedShifts);
    await writeJSON(KEYS.shifts, updatedShifts);

    // Auto-close active trip if it exists
    if (activeTrip) {
      const updatedTrips = trips.map(t => t.id === activeTrip.id ? { ...t, status: 'completed' as const } : t);
      setTrips(updatedTrips);
      await writeJSON(KEYS.trips, updatedTrips);
    }
  }, [shifts, trips, activeTrip]);

  const getShifts = useCallback(async (): Promise<ShiftRecord[]> => {
    return readJSON<ShiftRecord[]>(KEYS.shifts, []);
  }, []);

  return {
    // State
    routes,
    tickets,
    conductors,
    vehicles,
    trips,
    activeConductor,
    activeTrip,
    isLoading,
    // Routes
    getRoutes,
    saveRoute,
    updateRoute,
    deleteRoute,
    // Vehicles
    saveVehicle,
    updateVehicle,
    deleteVehicle,
    // Tickets
    issueTicket,
    getTodaysTickets,
    getTicketsByDateRange,
    generateTicketId,
    // Conductors
    saveConductor,
    setActiveConductor,
    getActiveConductor,
    // Shifts & Trips
    startTrip,
    closeShift,
    getShifts,
  };
}
