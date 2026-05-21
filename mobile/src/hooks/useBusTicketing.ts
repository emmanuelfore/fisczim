import { useState, useEffect, useCallback } from 'react';
import { DeviceEventEmitter } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  BusRoute,
  IssuedTicket,
  Conductor,
  ShiftRecord,
  BusVehicle,
  BusTrip,
  ReconciliationRecord,
} from '../types/busTicketing';
import { apiFetch, apiJson } from '../lib/api';
import { supabase } from '../lib/supabase';

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

const BUS_STATE_CHANGED = 'fieldpos_bus_state_changed';
type BusSyncStatus = 'idle' | 'syncing' | 'error';
const ONGOING_TRIPS_PATH = (companyId: number) => `/api/companies/${companyId}/bus-ticketing/trips?status=ongoing&limit=100`;

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

async function getAuthenticatedUserId(): Promise<string | null> {
  try {
    const session = await supabase.auth.getSession();
    if (session.data.session?.user?.id) return session.data.session.user.id;
    const user = await supabase.auth.getUser();
    return user.data.user?.id ?? null;
  } catch {
    return null;
  }
}

async function readApiError(response: Response, fallback: string): Promise<string> {
  const text = await response.text().catch(() => '');
  if (!text) return fallback;
  if (text.includes('502 Bad Gateway')) {
    return 'Bus trip sync server is unavailable (502 Bad Gateway). Please check the API deployment/server logs.';
  }
  if (text.trim().startsWith('<!DOCTYPE') || text.trim().startsWith('<html')) {
    return `${fallback}. Server returned an HTML error page instead of JSON.`;
  }
  try {
    const parsed = JSON.parse(text);
    return parsed.message || parsed.error || fallback;
  } catch {
    return text;
  }
}

function toIso(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value instanceof Date) return value.toISOString();
  return new Date().toISOString();
}

function normalizeCloudVehicle(vehicle: any): BusVehicle {
  return {
    id: String(vehicle.id),
    registrationNumber: vehicle.registrationNumber ?? vehicle.regNumber ?? '',
    fleetNumber: vehicle.fleetNumber ?? vehicle.fleetId ?? undefined,
    model: vehicle.model ?? undefined,
    capacity: Number(vehicle.capacity || 0),
    isActive: vehicle.isActive !== false,
    createdAt: toIso(vehicle.createdAt),
  };
}

function normalizeCloudRoute(route: any): BusRoute {
  const config = route.config && typeof route.config === 'object' ? route.config : {};
  return {
    id: String(route.id),
    name: route.name ?? `${route.fromLocation ?? route.origin ?? ''} - ${route.toLocation ?? route.destination ?? ''}`,
    origin: route.origin ?? route.fromLocation ?? '',
    destination: route.destination ?? route.toLocation ?? '',
    price: Number(route.price ?? route.basePrice ?? 0),
    currency: config.currency === 'ZWG' ? 'ZWG' : 'USD',
    isActive: route.isActive !== false,
    config: {
      passengerName: Boolean(config.passengerName),
      idNumber: Boolean(config.idNumber),
      phone: Boolean(config.phone),
      seatNumber: config.seatNumber !== false,
      dropOffPoint: Boolean(config.dropOffPoint),
      dropOffPoints: Array.isArray(config.dropOffPoints) ? config.dropOffPoints.map(String) : [],
      requirePaymentMethod: config.requirePaymentMethod !== false,
      allowMultiPassenger: config.allowMultiPassenger !== false,
    },
    createdAt: toIso(route.createdAt),
  };
}

function normalizeCloudTrip(trip: any): BusTrip {
  return {
    id: String(trip.id),
    routeId: String(trip.routeId),
    vehicleId: String(trip.vehicleId),
    conductorId: String(trip.conductorId),
    scheduledDeparture: toIso(trip.scheduledDeparture),
    actualDeparture: trip.actualDeparture ? toIso(trip.actualDeparture) : undefined,
    status: trip.status === 'completed' || trip.status === 'cancelled' ? trip.status : trip.status === 'scheduled' ? 'scheduled' : 'in_progress',
  };
}

function isNumericId(value?: string): boolean {
  return !!value && /^\d+$/.test(value);
}

function isUuid(value?: string): boolean {
  return !!value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function isOngoingTrip(trip: BusTrip): boolean {
  return trip.status === 'in_progress';
}

function isCloudOngoingTrip(trip: BusTrip): boolean {
  return trip.status === 'in_progress' || (trip.status as string) === 'boarding' || (trip.status as string) === 'en_route';
}

// ── Hook ────────────────────────────────────────────────────────
export function useBusTicketing(companyId?: number | null) {
  const [routes, setRoutes] = useState<BusRoute[]>([]);
  const [tickets, setTickets] = useState<IssuedTicket[]>([]);
  const [conductors, setConductors] = useState<Conductor[]>([]);
  const [activeConductorId, setActiveConductorId] = useState<string | null>(null);
  const [shifts, setShifts] = useState<ShiftRecord[]>([]);
  const [reconciliations, setReconciliations] = useState<ReconciliationRecord[]>([]);
  const [vehicles, setVehicles] = useState<BusVehicle[]>([]);
  const [trips, setTrips] = useState<BusTrip[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isOnline, setIsOnline] = useState(true);
  const [syncStatus, setSyncStatus] = useState<BusSyncStatus>('idle');
  const [lastSyncError, setLastSyncError] = useState<string | null>(null);

  const pendingTicketCount = tickets.filter((ticket) => !ticket.isSynced).length;

  const activeConductor: Conductor | null =
    conductors.find((c) => c.id === activeConductorId) ?? null;

  const activeTrip: BusTrip | null =
    trips.find((t) => t.status === 'in_progress' && t.conductorId === activeConductorId)
    ?? trips.find((t) => t.status === 'in_progress')
    ?? null;

  const loadLocalState = useCallback(async () => {
    const [r, t, c, ac, s, rec, v, tr] = await Promise.all([
      readJSON<BusRoute[]>(KEYS.routes, []),
      readJSON<IssuedTicket[]>(KEYS.tickets, []),
      readJSON<Conductor[]>(KEYS.conductors, []),
      readJSON<string | null>(KEYS.activeConductor, null),
      readJSON<ShiftRecord[]>(KEYS.shifts, []),
      readJSON<ReconciliationRecord[]>(KEYS.reconciliations, []),
      readJSON<BusVehicle[]>(KEYS.vehicles, []),
      readJSON<BusTrip[]>(KEYS.trips, []),
    ]);
    setRoutes(r);
    setTickets(t);
    setConductors(c);
    setActiveConductorId(ac);
    setShifts(s);
    setReconciliations(rec);
    setVehicles(v);
    setTrips(tr);
    setIsLoading(false);
  }, []);

  // ── Load all on mount ─────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!cancelled) await loadLocalState();
    })();
    return () => { cancelled = true; };
  }, [loadLocalState]);

  useEffect(() => {
    const subscription = DeviceEventEmitter.addListener(BUS_STATE_CHANGED, () => {
      loadLocalState().catch((e) => {
        console.warn('[useBusTicketing] Local bus state refresh failed:', e?.message || e);
      });
    });
    return () => subscription.remove();
  }, [loadLocalState]);

  useEffect(() => {
    let mounted = true;
    NetInfo.fetch().then((state) => {
      if (!mounted) return;
      setIsOnline(Boolean(state.isConnected && state.isInternetReachable !== false));
    }).catch(() => {});

    const unsubscribe = NetInfo.addEventListener((state) => {
      setIsOnline(Boolean(state.isConnected && state.isInternetReachable !== false));
    });
    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  // ── Route helpers ─────────────────────────────────────────────
  const refreshCloudSetup = useCallback(async () => {
    if (!companyId) return;

    const [cloudVehicles, cloudRoutes, cloudTrips] = await Promise.all([
      apiJson<any[]>(`/api/companies/${companyId}/bus-ticketing/vehicles`).catch(() => null),
      apiJson<any[]>(`/api/companies/${companyId}/bus-ticketing/routes`).catch(() => null),
      apiJson<any[]>(ONGOING_TRIPS_PATH(companyId)).catch(() => null),
    ]);

    if (Array.isArray(cloudVehicles)) {
      const mapped = cloudVehicles.map(normalizeCloudVehicle);
      setVehicles(mapped);
      await writeJSON(KEYS.vehicles, mapped);
    }

    if (Array.isArray(cloudRoutes)) {
      const mapped = cloudRoutes.map(normalizeCloudRoute);
      setRoutes(mapped);
      await writeJSON(KEYS.routes, mapped);
    }

    if (Array.isArray(cloudTrips)) {
      const mapped = cloudTrips.map(normalizeCloudTrip);
      const localTrips = await readJSON<BusTrip[]>(KEYS.trips, []);
      const localInProgressById = new Map(
        localTrips
          .filter((trip) => trip.status === 'in_progress')
          .map((trip) => [trip.id, trip])
      );
      const cloudTripIds = new Set(mapped.map((trip) => trip.id));
      const merged = [
        ...mapped.map((trip) => {
          const localActive = localInProgressById.get(trip.id);
          return localActive ? { ...trip, ...localActive, status: 'in_progress' as const } : trip;
        }),
        ...localTrips.filter((trip) => trip.status === 'in_progress' && !cloudTripIds.has(trip.id)),
      ];
      setTrips(merged);
      await writeJSON(KEYS.trips, merged);
    }
  }, [companyId]);

  useEffect(() => {
    if (!isOnline) return;
    refreshCloudSetup().catch((e) => {
      console.warn('[useBusTicketing] Cloud bus setup refresh failed:', e?.message || e);
    });
  }, [isOnline, refreshCloudSetup]);

  const createCloudRoute = useCallback(async (routeId: string): Promise<string | null> => {
    if (!companyId) throw new Error('Missing company while syncing route.');
    if (isNumericId(routeId)) return routeId;

    const localRoute = routes.find((route) => route.id === routeId);
    if (!localRoute) throw new Error(`Missing local route ${routeId}. Refresh routes, then sync again.`);

    const res = await apiFetch(`/api/companies/${companyId}/bus-ticketing/routes`, {
      method: 'POST',
      body: JSON.stringify({
        name: localRoute.name,
        fromLocation: localRoute.origin,
        toLocation: localRoute.destination,
        basePrice: String(localRoute.price),
        config: { ...localRoute.config, currency: localRoute.currency },
        isActive: localRoute.isActive,
      }),
    });
    if (!res.ok) {
      throw new Error(await readApiError(res, `Route sync failed (${res.status})`));
    }

    const cloudRoute = normalizeCloudRoute(await res.json());
    const updatedRoutes = routes.map((route) => route.id === routeId ? cloudRoute : route);
    const updatedTrips = trips.map((item) => item.routeId === routeId ? { ...item, routeId: cloudRoute.id } : item);
    const updatedTickets = tickets.map((item) => item.routeId === routeId ? { ...item, routeId: cloudRoute.id } : item);
    setRoutes(updatedRoutes);
    setTrips(updatedTrips);
    setTickets(updatedTickets);
    await writeJSON(KEYS.routes, updatedRoutes);
    await writeJSON(KEYS.trips, updatedTrips);
    await writeJSON(KEYS.tickets, updatedTickets);
    DeviceEventEmitter.emit(BUS_STATE_CHANGED);
    return cloudRoute.id;
  }, [companyId, routes, tickets, trips]);

  const createCloudVehicle = useCallback(async (vehicleId: string): Promise<string | null> => {
    if (!companyId) throw new Error('Missing company while syncing vehicle.');
    if (isNumericId(vehicleId)) return vehicleId;

    const localVehicle = vehicles.find((vehicle) => vehicle.id === vehicleId);
    if (!localVehicle) throw new Error(`Missing local vehicle ${vehicleId}. Refresh fleet, then sync again.`);

    const res = await apiFetch(`/api/companies/${companyId}/bus-ticketing/vehicles`, {
      method: 'POST',
      body: JSON.stringify({
        regNumber: localVehicle.registrationNumber,
        model: localVehicle.model ?? null,
        capacity: Number(localVehicle.capacity || 1),
        fleetId: localVehicle.fleetNumber ?? null,
        isActive: localVehicle.isActive,
      }),
    });
    if (!res.ok) {
      throw new Error(await readApiError(res, `Vehicle sync failed (${res.status})`));
    }

    const cloudVehicle = normalizeCloudVehicle(await res.json());
    const updatedVehicles = vehicles.map((vehicle) => vehicle.id === vehicleId ? cloudVehicle : vehicle);
    const updatedTrips = trips.map((item) => item.vehicleId === vehicleId ? { ...item, vehicleId: cloudVehicle.id } : item);
    const updatedTickets = tickets.map((item) => item.vehicleId === vehicleId ? { ...item, vehicleId: cloudVehicle.id } : item);
    setVehicles(updatedVehicles);
    setTrips(updatedTrips);
    setTickets(updatedTickets);
    await writeJSON(KEYS.vehicles, updatedVehicles);
    await writeJSON(KEYS.trips, updatedTrips);
    await writeJSON(KEYS.tickets, updatedTickets);
    DeviceEventEmitter.emit(BUS_STATE_CHANGED);
    return cloudVehicle.id;
  }, [companyId, tickets, trips, vehicles]);

  const createCloudTrip = useCallback(async (trip: BusTrip): Promise<BusTrip> => {
    if (!companyId) throw new Error('Missing company while syncing trip.');
    if (isNumericId(trip.id)) return trip;
    const routeId = await createCloudRoute(trip.routeId);
    const vehicleId = await createCloudVehicle(trip.vehicleId);
    if (!routeId) throw new Error('Trip is missing a route.');
    if (!vehicleId) throw new Error('Trip is missing a vehicle.');

    const conductorId = isUuid(trip.conductorId)
      ? trip.conductorId
      : await getAuthenticatedUserId();
    if (!conductorId) throw new Error('No logged-in user id available for the trip conductor.');

    const res = await apiFetch(`/api/companies/${companyId}/bus-ticketing/trips`, {
      method: 'POST',
      body: JSON.stringify({
        routeId: Number(routeId),
        vehicleId: Number(vehicleId),
        conductorId,
        scheduledDeparture: trip.scheduledDeparture,
        actualDeparture: trip.actualDeparture ?? null,
        status: trip.status === 'scheduled' ? 'scheduled' : 'in_progress',
      }),
    });
    if (!res.ok) {
      if (res.status === 409) {
        const cloudTrips = await apiJson<any[]>(`${ONGOING_TRIPS_PATH(companyId)}&vehicleId=${vehicleId}&routeId=${routeId}`).catch(() => null);
        const existingTrip = Array.isArray(cloudTrips)
          ? cloudTrips.map(normalizeCloudTrip).find((cloudTrip) => (
            cloudTrip.vehicleId === vehicleId &&
            cloudTrip.routeId === routeId &&
            isCloudOngoingTrip(cloudTrip)
          ))
          : null;
        if (existingTrip) {
          return {
            ...trip,
            localId: trip.id,
            id: existingTrip.id,
            conductorId: existingTrip.conductorId || conductorId,
            scheduledDeparture: existingTrip.scheduledDeparture || trip.scheduledDeparture,
            actualDeparture: existingTrip.actualDeparture || trip.actualDeparture,
          };
        }
      }
      throw new Error(await readApiError(res, `Trip sync failed (${res.status})`));
    }

    const cloud = await res.json();
    return {
      ...trip,
      localId: trip.id,
      id: String(cloud.id),
      routeId,
      vehicleId,
      conductorId,
      scheduledDeparture: toIso(cloud.scheduledDeparture ?? trip.scheduledDeparture),
      actualDeparture: cloud.actualDeparture ? toIso(cloud.actualDeparture) : trip.actualDeparture,
    };
  }, [companyId, createCloudRoute, createCloudVehicle]);

  const syncTickets = useCallback(async (sourceTickets: IssuedTicket[], sourceTrips: BusTrip[] = trips) => {
    if (!companyId) return { updatedTickets: sourceTickets, updatedTrips: sourceTrips, tickets: 0, skipped: 0 };
    let workingTickets = sourceTickets;
    let workingTrips = sourceTrips;
    let tripSyncError: string | null = null;
    const tripById = new Map(workingTrips.map((trip) => [trip.id, trip]));

    for (const ticket of workingTickets.filter((item) => !item.isSynced && !isNumericId(item.tripId))) {
      const localTrip = ticket.tripId ? tripById.get(ticket.tripId) : undefined;
      if (!localTrip) {
        tripSyncError = `Ticket ${ticket.id} is missing its local trip ${ticket.tripId || '(blank)'}.`;
        continue;
      }
      try {
        const cloudTrip = await createCloudTrip(localTrip);
        if (cloudTrip.id === localTrip.id) continue;
        workingTrips = workingTrips.map((trip) => trip.id === localTrip.id ? cloudTrip : trip);
        workingTickets = workingTickets.map((item) => (
          item.tripId === localTrip.id
            ? { ...item, tripId: cloudTrip.id, vehicleId: cloudTrip.vehicleId }
            : item
        ));
        tripById.delete(localTrip.id);
        tripById.set(cloudTrip.id, cloudTrip);
      } catch (e: any) {
        tripSyncError = e?.message || 'Trip sync before ticket upload failed.';
        console.warn('[useBusTicketing] Trip sync before ticket upload failed:', tripSyncError);
      }
    }

    const pending = workingTickets.filter((ticket) => !ticket.isSynced);
    const syncable = pending.filter((ticket) => isNumericId(ticket.tripId));
    const skipped = pending.length - syncable.length;
    if (syncable.length === 0 && skipped > 0 && tripSyncError) {
      throw new Error(tripSyncError);
    }
    if (syncable.length === 0 && skipped > 0) {
      const blockedTicket = pending.find((ticket) => !isNumericId(ticket.tripId));
      throw new Error(
        blockedTicket
          ? `Ticket ${blockedTicket.id} still has local trip ID ${blockedTicket.tripId || '(blank)'}. Cloud trip creation did not complete.`
          : 'Queued tickets still have local trip IDs. Cloud trip creation did not complete.'
      );
    }
    if (syncable.length === 0) return { updatedTickets: workingTickets, updatedTrips: workingTrips, tickets: 0, skipped };

    const payload = {
      tickets: syncable.map((ticket) => ({
        tripId: Number(ticket.tripId),
        ticketNumber: ticket.id,
        passengerName: ticket.passengerName ?? null,
        boardingPoint: ticket.routeName,
        dropOffPoint: ticket.dropOffPoint ?? null,
        seatNumber: ticket.seatNumber ?? null,
        quantity: ticket.quantity,
        amount: String(ticket.totalAmount),
        paymentMethod: ticket.paymentMethod ?? null,
        isSynced: true,
        timestamp: ticket.issuedAt,
      })),
      shifts: [],
      reconciliations: [],
    };

    const res = await apiFetch(`/api/companies/${companyId}/bus-ticketing/sync`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(text || `Bus ticket sync failed (${res.status})`);
    }

    const syncedIds = new Set(syncable.map((ticket) => ticket.id));
    const updated = workingTickets.map((ticket) => (
      syncedIds.has(ticket.id)
        ? { ...ticket, isSynced: true, syncedAt: new Date().toISOString() }
        : ticket
    ));
    return { updatedTickets: updated, updatedTrips: workingTrips, tickets: syncable.length, skipped };
  }, [companyId, createCloudTrip, trips]);

  const syncPendingTickets = useCallback(async () => {
    const hasPending = tickets.some((ticket) => !ticket.isSynced);
    if (!hasPending) {
      setLastSyncError(null);
      setSyncStatus('idle');
      return { tickets: 0, skipped: 0 };
    }
    if (!isOnline) {
      setSyncStatus('idle');
      return { tickets: 0, skipped: hasPending ? pendingTicketCount : 0 };
    }

    setSyncStatus('syncing');
    setLastSyncError(null);
    try {
      const result = await syncTickets(tickets, trips);
      setTrips(result.updatedTrips);
      setTickets(result.updatedTickets);
      await writeJSON(KEYS.trips, result.updatedTrips);
      await writeJSON(KEYS.tickets, result.updatedTickets);
      DeviceEventEmitter.emit(BUS_STATE_CHANGED);
      if (result.tickets === 0 && result.skipped > 0) {
        setLastSyncError('Queued tickets still have local trip IDs. Start trip online or refresh routes/fleet, then sync again.');
        setSyncStatus('error');
        return { tickets: result.tickets, skipped: result.skipped };
      }
      setSyncStatus('idle');
      return { tickets: result.tickets, skipped: result.skipped };
    } catch (e: any) {
      const message = e?.message || 'Ticket sync failed';
      setLastSyncError(message);
      setSyncStatus('error');
      throw e;
    }
  }, [isOnline, pendingTicketCount, syncTickets, tickets, trips]);

  useEffect(() => {
    if (!companyId || !isOnline || syncStatus !== 'idle' || pendingTicketCount === 0) return;
    syncPendingTickets().catch((e) => {
      console.warn('[useBusTicketing] Auto ticket sync failed:', e?.message || e);
    });
  }, [companyId, isOnline, pendingTicketCount, syncPendingTickets, syncStatus]);

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
      isSynced: ticket.isSynced === true,
    };
    const updated = [...tickets, finalTicket];
    setTickets(updated);
    await writeJSON(KEYS.tickets, updated);
    DeviceEventEmitter.emit(BUS_STATE_CHANGED);
    return finalTicket;
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
    DeviceEventEmitter.emit(BUS_STATE_CHANGED);
  }, [conductors]);

  const setActiveConductor = useCallback(async (id: string) => {
    setActiveConductorId(id);
    await writeJSON(KEYS.activeConductor, id);
    DeviceEventEmitter.emit(BUS_STATE_CHANGED);
  }, []);

  const getActiveConductor = useCallback(async (): Promise<Conductor | null> => {
    const id = await readJSON<string | null>(KEYS.activeConductor, null);
    if (!id) return null;
    const all = await readJSON<Conductor[]>(KEYS.conductors, []);
    return all.find((c) => c.id === id) ?? null;
  }, []);

  // ── Trip/Shift helpers ─────────────────────────────────────────
  const startTrip = useCallback(async (trip: BusTrip) => {
    let latestTrips = trips;
    if (companyId) {
      const cloudTrips = await apiJson<any[]>(ONGOING_TRIPS_PATH(companyId)).catch(() => null);
      if (Array.isArray(cloudTrips)) {
        latestTrips = [
          ...trips,
          ...cloudTrips.map(normalizeCloudTrip).filter((cloudTrip) => !trips.some((localTrip) => localTrip.id === cloudTrip.id)),
        ];
      }
    }

    const vehicleTaken = latestTrips.find(t => t.vehicleId === trip.vehicleId && isOngoingTrip(t));
    if (vehicleTaken) {
      throw new Error(`This vehicle is currently in use by another conductor's trip.`);
    }
    let finalTrip = trip;
    try {
      finalTrip = await createCloudTrip(trip);
    } catch (e: any) {
      if (String(e?.message || e).toLowerCase().includes('ongoing trip') || String(e?.message || e).toLowerCase().includes('in use')) {
        throw e;
      }
      console.warn('[useBusTicketing] Trip cloud create failed; continuing offline:', e?.message || e);
    }
    const updated = [...latestTrips.filter((existing) => existing.id !== finalTrip.id), finalTrip];
    setTrips(updated);
    await writeJSON(KEYS.trips, updated);
    DeviceEventEmitter.emit(BUS_STATE_CHANGED);
  }, [companyId, trips, createCloudTrip]);

  const closeShift = useCallback(async (record: ShiftRecord) => {
    const updatedShifts = [...shifts, record];
    setShifts(updatedShifts);
    await writeJSON(KEYS.shifts, updatedShifts);

    // Auto-close active trip if it exists
    if (activeTrip) {
      const updatedTrips = trips.map(t => t.id === activeTrip.id ? { ...t, status: 'completed' as const } : t);
      setTrips(updatedTrips);
      await writeJSON(KEYS.trips, updatedTrips);
      DeviceEventEmitter.emit(BUS_STATE_CHANGED);
    }
  }, [shifts, trips, activeTrip]);

  const getShifts = useCallback(async (): Promise<ShiftRecord[]> => {
    return readJSON<ShiftRecord[]>(KEYS.shifts, []);
  }, []);

  const saveReconciliation = useCallback(async (record: ReconciliationRecord) => {
    const finalRecord: ReconciliationRecord = {
      ...record,
      status: record.status ?? 'pending',
    };
    const updated = [...reconciliations, finalRecord];
    setReconciliations(updated);
    await writeJSON(KEYS.reconciliations, updated);
    DeviceEventEmitter.emit(BUS_STATE_CHANGED);
  }, [reconciliations]);

  const signOffReconciliation = useCallback(async (
    id: string,
    status: 'approved' | 'rejected',
    signedOffBy: string,
    adminNotes?: string
  ) => {
    const updated = reconciliations.map((record) => (
      record.id === id
        ? {
          ...record,
          status,
          signedOffBy,
          signedOffAt: new Date().toISOString(),
          adminNotes: adminNotes?.trim() || undefined,
        }
        : record
    ));
    setReconciliations(updated);
    await writeJSON(KEYS.reconciliations, updated);
    DeviceEventEmitter.emit(BUS_STATE_CHANGED);
  }, [reconciliations]);

  return {
    // State
    routes,
    tickets,
    conductors,
    vehicles,
    trips,
    shifts,
    reconciliations,
    activeConductor,
    activeTrip,
    isLoading,
    isOnline,
    syncStatus,
    pendingTicketCount,
    lastSyncError,
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
    refreshCloudSetup,
    syncPendingTickets,
    // Conductors
    saveConductor,
    setActiveConductor,
    getActiveConductor,
    // Shifts & Trips
    startTrip,
    closeShift,
    getShifts,
    saveReconciliation,
    signOffReconciliation,
  };
}
