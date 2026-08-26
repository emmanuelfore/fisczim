import { useState, useEffect, useCallback, useRef } from 'react';
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
import {
  enqueueAction,
  getOfflineQueue,
  removeFromQueue,
  processOfflineQueue,
  saveLocationHistory,
  getLocationHistory,
  mergeLocationHistory,
  QueuedAction,
} from '../lib/busOfflineQueue';

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
const RECENT_TRIPS_PATH = (companyId: number) => `/api/companies/${companyId}/bus-ticketing/trips?limit=100`;

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

async function readJsonResponse<T = any>(response: Response, fallback: string): Promise<T> {
  const text = await response.text().catch(() => '');
  if (!text) throw new Error(fallback);
  if (text.trim().startsWith('<!DOCTYPE') || text.trim().startsWith('<html')) {
    throw new Error(`${fallback}. Server returned an HTML page instead of JSON.`);
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`${fallback}. Server returned invalid JSON.`);
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
    name: route.name || `${config.origin || route.fromLocation} → ${config.destination || route.toLocation}`,
    origin: config.origin || route.fromLocation,
    destination: config.destination || route.toLocation,
    price: Number(route.basePrice || config.price || 0),
    currency: config.currency || route.currency || 'USD',
    isActive: route.isActive !== false,
    config: {
      passengerName: Boolean(config.passengerName),
      idNumber: Boolean(config.idNumber),
      phone: Boolean(config.phone),
      seatNumber: config.seatNumber !== false,
      dropOffPoint: Boolean(config.dropOffPoint),
      dropOffPoints: Array.isArray(config.dropOffPoints) 
        ? config.dropOffPoints.map((stop: any) => 
            typeof stop === 'string' ? { name: stop, price: Number(route.basePrice || config.price || 0) } : stop
          )
        : [],
      stops: Array.isArray(config.stops) ? config.stops.map((s: any) => String(s)) : undefined,
      fares: config.fares && typeof config.fares === 'object'
        ? Object.fromEntries(
            Object.entries(config.fares as Record<string, unknown>)
              .map(([k, v]) => [k, Number(v)])
              .filter(([, v]) => Number.isFinite(v)),
          )
        : undefined,
      requirePaymentMethod: config.requirePaymentMethod !== false,
      allowMultiPassenger: config.allowMultiPassenger !== false,
    },
    createdAt: route.createdAt || new Date().toISOString(),
  };
}

function normalizeCloudTrip(trip: any): BusTrip {
  const rawStatus = String(trip.status || '').trim().toLowerCase();
  const status =
    rawStatus === 'completed' || rawStatus === 'complete' || rawStatus === 'closed'
      ? 'completed'
      : rawStatus === 'cancelled' || rawStatus === 'canceled' || rawStatus === 'cancelled_trip' || rawStatus === 'canceled_trip'
        ? 'cancelled'
        : rawStatus === 'scheduled'
          ? 'scheduled'
          : rawStatus === 'boarding'
            ? 'boarding'
            : rawStatus === 'en_route'
              ? 'en_route'
              : 'in_progress';
  return {
    id: String(trip.id),
    routeId: String(trip.routeId),
    vehicleId: String(trip.vehicleId),
    conductorId: String(trip.conductorId),
    scheduledDeparture: toIso(trip.scheduledDeparture),
    actualDeparture: trip.actualDeparture ? toIso(trip.actualDeparture) : undefined,
    actualArrival: trip.actualArrival ? toIso(trip.actualArrival) : undefined,
    status,
  };
}

function isNumericId(value?: string): boolean {
  return !!value && /^\d+$/.test(value);
}

function isUuid(value?: string): boolean {
  return !!value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function isOngoingTrip(trip: BusTrip): boolean {
  const status = String(trip.status || '').trim().toLowerCase();
  return status === 'in_progress' || status === 'boarding' || status === 'en_route';
}

function isCloudOngoingTrip(trip: BusTrip): boolean {
  return trip.status === 'in_progress' || (trip.status as string) === 'boarding' || (trip.status as string) === 'en_route';
}

function toCloudTripStatus(status: BusTrip['status'] | string | undefined): string {
  const normalized = String(status || '').trim().toLowerCase();
  if (normalized === 'scheduled') return 'scheduled';
  if (normalized === 'boarding') return 'boarding';
  if (normalized === 'en_route') return 'en_route';
  if (normalized === 'completed' || normalized === 'complete' || normalized === 'closed') return 'completed';
  if (normalized === 'cancelled' || normalized === 'canceled') return 'cancelled';
  return 'in_progress';
}

function getPendingTicketTripIds(tickets: IssuedTicket[]): Set<string> {
  return new Set(
    tickets
      .filter((ticket) => !ticket.isSynced && ticket.tripId)
      .map((ticket) => String(ticket.tripId))
  );
}

// Resolve a local id (uuid) to its cloud numeric id after a trip/vehicle/route has synced.
function toCloudRef(
  localId: string | undefined,
  items: Array<{ id: string; localId?: string }>
): number | null {
  if (!localId) return null;
  if (isNumericId(localId)) return Number(localId);
  const item = items.find((i) => i.id === localId || i.localId === localId);
  if (item && isNumericId(item.id)) return Number(item.id);
  return null;
}

// Combine a "YYYY-MM-DD" + "HH:MM" pair into an ISO timestamp, falling back to `closedAt`.
function toShiftIso(date: string | undefined, hhmm: string | undefined, fallback?: string): string | null {
  if (date && hhmm && /^\d{1,2}:\d{2}$/.test(hhmm)) {
    const iso = new Date(`${date}T${hhmm}:00`).toISOString();
    if (!Number.isNaN(new Date(iso).getTime())) return iso;
  }
  if (fallback) {
    const iso = new Date(fallback).toISOString();
    if (!Number.isNaN(new Date(iso).getTime())) return iso;
  }
  return null;
}

function resolveRouteIdFromTicket(ticket: IssuedTicket, sourceRoutes: BusRoute[]): string | undefined {
  return (
    ticket.routeId ||
    sourceRoutes.find((route) => route.name === ticket.routeName)?.id ||
    sourceRoutes.find((route) => ticket.routeName && (
      `${route.origin} - ${route.destination}` === ticket.routeName ||
      `${route.origin} → ${route.destination}` === ticket.routeName
    ))?.id
  );
}

function findAttachableTripForTicket(
  ticket: IssuedTicket,
  sourceTrips: BusTrip[],
  sourceRoutes: BusRoute[]
): BusTrip | undefined {
  const routeId = resolveRouteIdFromTicket(ticket, sourceRoutes);
  return sourceTrips.find((trip) => (
    isNumericId(trip.id) &&
    (!routeId || trip.routeId === routeId) &&
    (!ticket.vehicleId || trip.vehicleId === ticket.vehicleId) &&
    (isCloudOngoingTrip(trip) || trip.status === 'scheduled' || trip.status === 'in_progress')
  ));
}

function buildRecoverableTripFromTicket(
  ticket: IssuedTicket,
  sourceTrips: BusTrip[] = [],
  sourceRoutes: BusRoute[] = [],
  sourceVehicles: BusVehicle[] = []
): BusTrip | null {
  if (ticket.tripSnapshot?.routeId && ticket.tripSnapshot?.vehicleId) {
    return {
      ...ticket.tripSnapshot,
      id: ticket.tripId || ticket.tripSnapshot.id,
      localId: ticket.tripSnapshot.localId || ticket.tripSnapshot.id || ticket.tripId,
      status: 'completed',
    };
  }

  const matchingTrip = sourceTrips.find((trip) => (
    (ticket.tripId && (trip.id === ticket.tripId || trip.localId === ticket.tripId)) ||
    (ticket.routeId && trip.routeId === ticket.routeId && (ticket.vehicleId ? trip.vehicleId === ticket.vehicleId : true))
  ));
  if (matchingTrip?.routeId && matchingTrip.vehicleId) {
    return {
      ...matchingTrip,
      id: ticket.tripId || matchingTrip.id,
      localId: matchingTrip.localId || matchingTrip.id || ticket.tripId,
      status: 'completed',
    };
  }

  const fallbackRouteId = resolveRouteIdFromTicket(ticket, sourceRoutes) || sourceRoutes[0]?.id;

  const fallbackVehicleId =
    ticket.vehicleId ||
    sourceTrips.find((trip) => fallbackRouteId && trip.routeId === fallbackRouteId)?.vehicleId ||
    sourceVehicles.find((vehicle) => vehicle.isActive)?.id ||
    sourceVehicles[0]?.id;

  if (!fallbackRouteId || !fallbackVehicleId) return null;
  const id = ticket.tripId || `recovered-trip-${ticket.id}`;
  return {
    id,
    localId: id,
    routeId: String(fallbackRouteId),
    vehicleId: String(fallbackVehicleId),
    conductorId: ticket.conductorId || '',
    scheduledDeparture: ticket.issuedAt || new Date().toISOString(),
    actualDeparture: ticket.issuedAt || new Date().toISOString(),
    status: 'completed',
  };
}

// ── Hook ────────────────────────────────────────────────────────
export function useBusTicketing(companyId?: number | null) {
  const [routes, setRoutes] = useState<BusRoute[]>([]);
  const [tickets, setTickets] = useState<IssuedTicket[]>([]);
  const [conductors, setConductors] = useState<Conductor[]>([]);
  const conductorsRef = useRef<Conductor[]>([]);
  conductorsRef.current = conductors;
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
    trips.find((t) => isOngoingTrip(t) && t.conductorId === activeConductorId)
    ?? trips.find((t) => isOngoingTrip(t))
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
    
    // Load location history for each trip from AsyncStorage
    const tripsWithLocation = await Promise.all(tr.map(async (trip) => {
      const history = await getLocationHistory(trip.id);
      if (history.length > 0) {
        return { ...trip, locationHistory: history };
      }
      return trip;
    }));
    
    setRoutes(r);
    setTickets(t);
    setConductors(c);
    setActiveConductorId(ac);
    setShifts(s);
    setReconciliations(rec);
    setVehicles(v);
    setTrips(tripsWithLocation);
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
  const refreshingRef = useRef(false);

  const refreshCloudSetup = useCallback(async () => {
    if (!companyId || refreshingRef.current) return;
    refreshingRef.current = true;

    try {
      const [cloudVehicles, cloudRoutes, cloudTrips] = await Promise.all([
      apiJson<any[]>(`/api/companies/${companyId}/bus-ticketing/vehicles`).catch(() => null),
      apiJson<any[]>(`/api/companies/${companyId}/bus-ticketing/routes`).catch(() => null),
      apiJson<any[]>(RECENT_TRIPS_PATH(companyId)).catch(() => null),
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
      const localTickets = await readJSON<IssuedTicket[]>(KEYS.tickets, []);
      const pendingTripIds = getPendingTicketTripIds(localTickets);
      const localInProgressById = new Map(
        localTrips
          .filter(isOngoingTrip)
          .map((trip) => [trip.id, trip])
      );
      const cloudTripIds = new Set(mapped.map((trip) => trip.id));
      const cloudTripsById = new Map(mapped.map((trip) => [trip.id, trip]));
      const merged = [
        ...mapped.map((trip) => {
          const localActive = isOngoingTrip(trip) ? localInProgressById.get(trip.id) : undefined;
          return localActive ? { ...trip, ...localActive, status: trip.status } : trip;
        }),
        ...localTrips
          .filter((trip) => !cloudTripIds.has(trip.id))
          .map((trip) => {
            const cloudByLocalId = trip.localId ? cloudTripsById.get(trip.localId) : undefined;
            return cloudByLocalId ? { ...trip, ...cloudByLocalId } : trip;
          })
          .filter((trip) => (
            !isNumericId(trip.id) ||
            pendingTripIds.has(trip.id) ||
            (trip.localId ? pendingTripIds.has(trip.localId) : false)
          ))
          .map((trip) => (
            isNumericId(trip.id) && isOngoingTrip(trip)
              ? { ...trip, status: 'completed' as const }
              : trip
          )),
      ];
      setTrips(merged);
      await writeJSON(KEYS.trips, merged);
    }
  } finally {
    refreshingRef.current = false;
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

    const res = await apiFetch(`/api/companies/${companyId}/bus-ticketing/trips/`, {
      method: 'POST',
      body: JSON.stringify({
        routeId: Number(routeId),
        vehicleId: Number(vehicleId),
        conductorId,
        scheduledDeparture: trip.scheduledDeparture,
        actualDeparture: trip.actualDeparture ?? null,
        currentLatitude: trip.currentLatitude ?? null,
        currentLongitude: trip.currentLongitude ?? null,
        lastLocationUpdate: trip.lastLocationUpdate ?? null,
        status: toCloudTripStatus(trip.status),
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

  const syncTickets = useCallback(async (
    sourceTickets: IssuedTicket[],
    sourceTrips: BusTrip[] = trips,
    sourceRoutes: BusRoute[] = routes,
    sourceVehicles: BusVehicle[] = vehicles,
    sourceShifts: ShiftRecord[] = shifts,
    sourceReconciliations: ReconciliationRecord[] = reconciliations
  ) => {
    if (!companyId) return { updatedTickets: sourceTickets, updatedTrips: sourceTrips, tickets: 0, skipped: 0 };
    let workingTickets = sourceTickets;
    let workingTrips = sourceTrips;
    let tripSyncError: string | null = null;
    const tripById = new Map(workingTrips.map((trip) => [trip.id, trip]));
    for (const trip of workingTrips) {
      if (trip.localId) tripById.set(trip.localId, trip);
    }

    for (const ticket of workingTickets.filter((item) => !item.isSynced && !isNumericId(item.tripId))) {
      const originalTripId = ticket.tripId;
      let localTrip = ticket.tripId ? tripById.get(ticket.tripId) : undefined;
      if (!localTrip && !ticket.tripId) {
        const attachableTrip = findAttachableTripForTicket(ticket, workingTrips, sourceRoutes);
        if (attachableTrip) {
          workingTickets = workingTickets.map((item) => (
            item.id === ticket.id
              ? { ...item, tripId: attachableTrip.id, vehicleId: item.vehicleId || attachableTrip.vehicleId }
              : item
          ));
          continue;
        }
      }
      if (!localTrip) {
        localTrip = buildRecoverableTripFromTicket(ticket, workingTrips, sourceRoutes, sourceVehicles) ?? undefined;
        if (localTrip) {
          tripById.set(localTrip.id, localTrip);
          if (localTrip.localId) tripById.set(localTrip.localId, localTrip);
          workingTrips = [...workingTrips, localTrip];
        } else {
          tripSyncError = `Ticket ${ticket.id} is missing its local trip ${ticket.tripId || '(blank)'}.`;
          continue;
        }
      }
      try {
        const cloudTrip = await createCloudTrip(localTrip);
        if (cloudTrip.id !== localTrip.id && workingTrips.some((trip) => trip.id === localTrip.id)) {
          workingTrips = workingTrips.map((trip) => trip.id === localTrip.id ? cloudTrip : trip);
        } else if (!workingTrips.some((trip) => trip.id === cloudTrip.id)) {
          workingTrips = [...workingTrips, cloudTrip];
        }
        workingTickets = workingTickets.map((item) => (
          item.id === ticket.id ||
          item.tripId === originalTripId ||
          item.tripId === localTrip.id ||
          (localTrip.localId && item.tripId === localTrip.localId)
            ? { ...item, tripId: cloudTrip.id, vehicleId: cloudTrip.vehicleId }
            : item
        ));
        tripById.delete(localTrip.id);
        if (localTrip.localId) tripById.delete(localTrip.localId);
        tripById.set(cloudTrip.id, cloudTrip);
        if (cloudTrip.localId) tripById.set(cloudTrip.localId, cloudTrip);
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
    const syncableShifts = sourceShifts
      .filter((shift) => !shift.isSynced && !!shift.conductorId && isUuid(shift.conductorId));
    const syncableReconciliations = sourceReconciliations
      .filter((record) => !record.isSynced && !!record.conductorId && isUuid(record.conductorId));

    const hasNonTicketData = syncableShifts.length > 0 || syncableReconciliations.length > 0;
    if (syncable.length === 0 && !hasNonTicketData) return { updatedTickets: workingTickets, updatedTrips: workingTrips, updatedShifts: sourceShifts, updatedReconciliations: sourceReconciliations, tickets: 0, skipped };

    const payload = {
      tickets: syncable.map((ticket) => ({
        tripId: Number(ticket.tripId),
        ticketNumber: ticket.id,
        passengerName: ticket.passengerName ?? null,
        idNumber: ticket.idNumber ?? null,
        phone: ticket.phone ?? null,
        boardingPoint: ticket.boardingPoint ?? null,
        dropOffPoint: ticket.dropOffPoint ?? null,
        seatNumber: ticket.seatNumber ?? null,
        quantity: ticket.quantity,
        amount: String(ticket.totalAmount),
        currency: ticket.currency || 'USD',
        paymentMethod: ticket.paymentMethod ?? null,
        localTicketId: ticket.id,
        isSynced: true,
        timestamp: ticket.issuedAt,
      })),
      shifts: syncableShifts.map((shift) => ({
        conductorId: shift.conductorId,
        startTime: toShiftIso(shift.date, shift.shiftStart, shift.closedAt) ?? new Date().toISOString(),
        endTime: toShiftIso(shift.date, shift.shiftEnd, shift.closedAt),
        vehicleId: toCloudRef(shift.vehicleId, sourceVehicles),
        tripId: toCloudRef(shift.tripId, sourceTrips),
        routeId: toCloudRef(shift.routeId, sourceRoutes),
        closedAt: shift.closedAt ? new Date(shift.closedAt).toISOString() : null,
        totalTickets: shift.totalTickets ?? 0,
        totalRevenue: String(shift.totalRevenue ?? 0),
        status: 'closed',
      })),
      reconciliations: syncableReconciliations.map((record) => ({
        conductorId: record.conductorId,
        date: record.date,
        expectedCash: String(record.expectedCash ?? 0),
        cashReceived: String(record.cashReceived ?? 0),
        gap: String(record.gap ?? 0),
        notes: record.notes ?? null,
        adminNotes: null,
      })),
    };

    const res = await apiFetch(`/api/companies/${companyId}/bus-ticketing/sync`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(text || `Bus ticket sync failed (${res.status})`);
    }

    const syncResponse = await readJsonResponse<any>(res, 'Bus ticket sync failed');
    const rejectedTicketNumbers = new Set(
      (syncResponse?.rejected?.tickets || []).map((ticket: any) => String(ticket.ticketNumber || ''))
    );
    if (rejectedTicketNumbers.size > 0) {
      const firstRejected = syncResponse.rejected.tickets[0];
      console.warn('[useBusTicketing] Some bus tickets were rejected during sync:', syncResponse.rejected.tickets);
      const acceptedIds = new Set(syncable.filter((ticket) => !rejectedTicketNumbers.has(ticket.id)).map((ticket) => ticket.id));
      const partiallyUpdated = workingTickets.map((ticket) => (
        acceptedIds.has(ticket.id)
          ? { ...ticket, isSynced: true, syncedAt: new Date().toISOString() }
          : ticket
      ));
      const syncedShifts = syncableShifts.map((shift) => ({ ...shift, isSynced: true, syncedAt: new Date().toISOString() }));
      const syncedReconciliations = syncableReconciliations.map((record) => ({ ...record, isSynced: true, syncedAt: new Date().toISOString() }));
      return {
        updatedTickets: partiallyUpdated,
        updatedTrips: workingTrips,
        updatedShifts: syncedShifts,
        updatedReconciliations: syncedReconciliations,
        tickets: Number(syncResponse?.synced?.tickets || acceptedIds.size),
        skipped: Number(syncResponse?.skipped?.tickets || 0) + rejectedTicketNumbers.size,
        error: firstRejected?.reason || 'Some bus tickets were rejected during sync.',
      };
    }

    const syncedIds = new Set(syncable.map((ticket) => ticket.id));
    const updated = workingTickets.map((ticket) => (
      syncedIds.has(ticket.id)
        ? { ...ticket, isSynced: true, syncedAt: new Date().toISOString() }
        : ticket
    ));
    const syncedShifts = syncableShifts.map((shift) => ({ ...shift, isSynced: true, syncedAt: new Date().toISOString() }));
    const syncedReconciliations = syncableReconciliations.map((record) => ({ ...record, isSynced: true, syncedAt: new Date().toISOString() }));
    return {
      updatedTickets: updated,
      updatedTrips: workingTrips,
      updatedShifts: syncedShifts,
      updatedReconciliations: syncedReconciliations,
      tickets: Number(syncResponse?.synced?.tickets || syncable.length),
      skipped: Number(syncResponse?.skipped?.tickets || skipped),
    };
  }, [companyId, createCloudTrip, reconciliations, routes, shifts, trips, vehicles]);

  const syncPendingTickets = useCallback(async () => {
    if (companyId && isOnline) {
      await refreshCloudSetup().catch((e) => {
        console.warn('[useBusTicketing] Setup refresh before ticket sync failed:', e?.message || e);
      });
    }
    const latestTickets = await readJSON<IssuedTicket[]>(KEYS.tickets, tickets);
    const latestTrips = await readJSON<BusTrip[]>(KEYS.trips, trips);
    const latestRoutes = await readJSON<BusRoute[]>(KEYS.routes, routes);
    const latestVehicles = await readJSON<BusVehicle[]>(KEYS.vehicles, vehicles);
    const latestShifts = await readJSON<ShiftRecord[]>(KEYS.shifts, shifts);
    const latestReconciliations = await readJSON<ReconciliationRecord[]>(KEYS.reconciliations, reconciliations);
    const latestPendingCount = latestTickets.filter((ticket) => !ticket.isSynced).length;
    const hasPendingShifts = latestShifts.some((shift) => !shift.isSynced && !!shift.conductorId && isUuid(shift.conductorId));
    const hasPendingReconciliations = latestReconciliations.some((record) => !record.isSynced && !!record.conductorId && isUuid(record.conductorId));
    const hasPending = latestPendingCount > 0 || hasPendingShifts || hasPendingReconciliations;
    if (!hasPending) {
      setLastSyncError(null);
      setSyncStatus('idle');
      return { tickets: 0, skipped: 0 };
    }
    if (!isOnline) {
      setSyncStatus('idle');
      return { tickets: 0, skipped: latestPendingCount };
    }

    setSyncStatus('syncing');
    setLastSyncError(null);
    try {
      const result = await syncTickets(latestTickets, latestTrips, latestRoutes, latestVehicles, latestShifts, latestReconciliations);
      setTrips(result.updatedTrips);
      setTickets(result.updatedTickets);
      if (result.updatedShifts) {
        setShifts(result.updatedShifts);
        await writeJSON(KEYS.shifts, result.updatedShifts);
      }
      if (result.updatedReconciliations) {
        setReconciliations(result.updatedReconciliations);
        await writeJSON(KEYS.reconciliations, result.updatedReconciliations);
      }
      await writeJSON(KEYS.trips, result.updatedTrips);
      await writeJSON(KEYS.tickets, result.updatedTickets);
      DeviceEventEmitter.emit(BUS_STATE_CHANGED);
      if (result.tickets === 0 && result.skipped > 0) {
        setLastSyncError(result.error || 'Queued tickets still have local trip IDs. Start trip online or refresh routes/fleet, then sync again.');
        setSyncStatus('error');
        return { tickets: result.tickets, skipped: result.skipped };
      }
      if (result.error) {
        setLastSyncError(result.error);
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
  }, [companyId, isOnline, refreshCloudSetup, reconciliations, routes, shifts, syncTickets, tickets, trips, vehicles]);

  const lastSyncAttemptRef = useRef(0);
  useEffect(() => {
    if (!companyId || !isOnline || syncStatus === 'syncing') return;
    const hasPendingShifts = shifts.some((shift) => !shift.isSynced && !!shift.conductorId && isUuid(shift.conductorId));
    const hasPendingReconciliations = reconciliations.some((record) => !record.isSynced && !!record.conductorId && isUuid(record.conductorId));
    if (pendingTicketCount === 0 && !hasPendingShifts && !hasPendingReconciliations) return;
    const now = Date.now();
    if (now - lastSyncAttemptRef.current < 15000) return;
    lastSyncAttemptRef.current = now;
    syncPendingTickets().catch((e) => {
      console.warn('[useBusTicketing] Auto ticket sync failed:', e?.message || e);
    });
  }, [companyId, isOnline, pendingTicketCount, reconciliations, shifts, syncPendingTickets, syncStatus]);

  const getRoutes = useCallback(() => routes, [routes]);

  const saveRoute = useCallback(async (route: BusRoute) => {
    let routeToSave = route;
    if (companyId && isOnline) {
      const res = await apiFetch(`/api/companies/${companyId}/bus-ticketing/routes`, {
        method: 'POST',
        body: JSON.stringify({
          name: route.name,
          fromLocation: route.origin,
          toLocation: route.destination,
          basePrice: String(route.price),
          config: { ...route.config, currency: route.currency },
          isActive: route.isActive,
        }),
      });
      if (!res.ok) {
        throw new Error(await readApiError(res, `Route save failed (${res.status})`));
      }
      routeToSave = normalizeCloudRoute(await readJsonResponse(res, 'Route save failed'));
    }
    const updated = [...routes, routeToSave];
    setRoutes(updated);
    await writeJSON(KEYS.routes, updated);
    DeviceEventEmitter.emit(BUS_STATE_CHANGED);
  }, [companyId, isOnline, routes]);

  const updateRoute = useCallback(async (id: string, updates: Partial<BusRoute>) => {
    let finalUpdates = updates;
    if (companyId && isOnline && isNumericId(id)) {
      const next = routes.find((route) => route.id === id);
      const merged = next ? { ...next, ...updates } : updates;
      const res = await apiFetch(`/api/companies/${companyId}/bus-ticketing/routes/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: merged.name,
          fromLocation: merged.origin,
          toLocation: merged.destination,
          basePrice: merged.price === undefined ? undefined : String(merged.price),
          config: merged.config ? { ...merged.config, currency: merged.currency } : undefined,
          isActive: merged.isActive,
        }),
      });
      if (!res.ok) {
        throw new Error(await readApiError(res, `Route update failed (${res.status})`));
      }
      finalUpdates = normalizeCloudRoute(await readJsonResponse(res, 'Route update failed'));
    }
    const updated = routes.map((r) => (r.id === id ? { ...r, ...finalUpdates } : r));
    setRoutes(updated);
    await writeJSON(KEYS.routes, updated);
    DeviceEventEmitter.emit(BUS_STATE_CHANGED);
  }, [companyId, isOnline, routes]);

  const deleteRoute = useCallback(async (id: string) => {
    const hasTickets = tickets.some((t) => t.routeId === id);
    if (hasTickets) {
      throw new Error('Cannot delete a route that has issued tickets.');
    }
    if (companyId && isOnline && isNumericId(id)) {
      const res = await apiFetch(`/api/companies/${companyId}/bus-ticketing/routes/${id}`, {
        method: 'DELETE',
      });
      if (!res.ok && res.status !== 404) {
        throw new Error(await readApiError(res, `Route delete failed (${res.status})`));
      }
    }
    const updated = routes.filter((r) => r.id !== id);
    setRoutes(updated);
    await writeJSON(KEYS.routes, updated);
    DeviceEventEmitter.emit(BUS_STATE_CHANGED);
  }, [companyId, isOnline, routes, tickets]);

  // ── Vehicle helpers ───────────────────────────────────────────
  const saveVehicle = useCallback(async (vehicle: BusVehicle) => {
    const capacity = Number(vehicle.capacity);
    if (!Number.isFinite(capacity) || capacity <= 0) {
      throw new Error('Vehicle capacity must be a positive number.');
    }
    let vehicleToSave = vehicle;
    if (companyId && isOnline) {
      const res = await apiFetch(`/api/companies/${companyId}/bus-ticketing/vehicles`, {
        method: 'POST',
        body: JSON.stringify({
          regNumber: vehicle.registrationNumber,
          model: vehicle.model ?? null,
          capacity,
          fleetId: vehicle.fleetNumber ?? null,
          isActive: vehicle.isActive,
        }),
      });
      if (!res.ok) {
        throw new Error(await readApiError(res, `Vehicle save failed (${res.status})`));
      }
      vehicleToSave = normalizeCloudVehicle(await readJsonResponse(res, 'Vehicle save failed'));
    }
    const updated = [...vehicles, vehicleToSave];
    setVehicles(updated);
    await writeJSON(KEYS.vehicles, updated);
    DeviceEventEmitter.emit(BUS_STATE_CHANGED);
  }, [companyId, isOnline, vehicles]);

  const updateVehicle = useCallback(async (id: string, updates: Partial<BusVehicle>) => {
    let finalUpdates = updates;
    if (companyId && isOnline && isNumericId(id)) {
      const next = vehicles.find((vehicle) => vehicle.id === id);
      const merged = next ? { ...next, ...updates } : updates;
      const capacity = Number(merged.capacity);
      if (!Number.isFinite(capacity) || capacity <= 0) {
        throw new Error('Vehicle capacity must be a positive number.');
      }
      const res = await apiFetch(`/api/companies/${companyId}/bus-ticketing/vehicles/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          regNumber: merged.registrationNumber,
          model: merged.model ?? null,
          capacity,
          fleetId: merged.fleetNumber ?? null,
          isActive: merged.isActive,
        }),
      });
      if (!res.ok) {
        throw new Error(await readApiError(res, `Vehicle update failed (${res.status})`));
      }
      finalUpdates = normalizeCloudVehicle(await readJsonResponse(res, 'Vehicle update failed'));
    }
    const updated = vehicles.map((v) => (v.id === id ? { ...v, ...finalUpdates } : v));
    setVehicles(updated);
    await writeJSON(KEYS.vehicles, updated);
    DeviceEventEmitter.emit(BUS_STATE_CHANGED);
  }, [companyId, isOnline, vehicles]);

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

    // Queue for offline sync if needed
    if (companyId && !isOnline) {
      await enqueueAction({ type: 'ISSUE_TICKET', ticket: finalTicket } as const);
    }

    return finalTicket;
  }, [companyId, isOnline, tickets, generateTicketId]);

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
    const latestConductors = await readJSON<Conductor[]>(KEYS.conductors, conductorsRef.current);
    const exists = latestConductors.some((c) => c.id === conductor.id);
    const updated = exists
      ? latestConductors.map((c) => (c.id === conductor.id ? conductor : c))
      : [...latestConductors, conductor];
    setConductors(updated);
    await writeJSON(KEYS.conductors, updated);
    DeviceEventEmitter.emit(BUS_STATE_CHANGED);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
  const syncNewTripToCloud = useCallback(async (trip: BusTrip) => {
    if (!companyId) return;

    const cloudTrips = await apiJson<any[]>(ONGOING_TRIPS_PATH(companyId)).catch(() => null);
    if (Array.isArray(cloudTrips)) {
      const cloudActive = cloudTrips.map(normalizeCloudTrip).filter(isCloudOngoingTrip);
      const vehicleTaken = cloudActive.find((t) => (
        t.vehicleId === trip.vehicleId && t.id !== trip.id && t.id !== trip.localId
      ));
      if (vehicleTaken) {
        throw new Error(`This vehicle is currently in use by another conductor's trip.`);
      }
    }

    const finalTrip = await createCloudTrip(trip);
    if (finalTrip.id === trip.id) return;

    const current = await readJSON<BusTrip[]>(KEYS.trips, []);
    const mapped = current.map((existing) => (
      existing.id === trip.id || existing.localId === trip.id
        ? { ...finalTrip, localId: existing.localId ?? trip.id, conductorId: existing.conductorId || finalTrip.conductorId }
        : existing
    ));
    setTrips(mapped);
    await writeJSON(KEYS.trips, mapped);
    DeviceEventEmitter.emit(BUS_STATE_CHANGED);
  }, [companyId, createCloudTrip]);

  const startTrip = useCallback(async (trip: BusTrip) => {
    // Save the trip locally first so starting is instant, even offline/slow.
    const updated = [...trips.filter((existing) => existing.id !== trip.id), trip];
    setTrips(updated);
    await writeJSON(KEYS.trips, updated);
    DeviceEventEmitter.emit(BUS_STATE_CHANGED);

    // Queue for offline sync if needed
    if (companyId && !isOnline) {
      await enqueueAction({ type: 'CREATE_TRIP', trip } as const);
    }

    // Best-effort cloud sync in the background (tickets sync will also
    // attach the numeric trip id when they upload).
    if (companyId) {
      syncNewTripToCloud(trip).catch((e: any) => {
        if (String(e?.message || e).toLowerCase().includes('in use')) {
          console.warn('[useBusTicketing] Trip rejected by another device:', e?.message || e);
        } else {
          console.warn('[useBusTicketing] Trip cloud create failed; continuing offline:', e?.message || e);
        }
      });
    }
    return trip;
  }, [companyId, isOnline, trips, syncNewTripToCloud]);

  // Process offline queue when coming back online
  useEffect(() => {
    if (!isOnline || !companyId) return;
    let cancelled = false;
    (async () => {
      await processOfflineQueue(companyId, async (action) => {
        if (cancelled) return;
        switch (action.type) {
          case 'CREATE_TRIP': {
            await syncNewTripToCloud(action.trip);
            break;
          }
          case 'ISSUE_TICKET': {
            // Tickets are synced via syncPendingTickets
            await syncPendingTickets();
            break;
          }
          case 'UPDATE_LOCATION': {
            const cloudTripId = isNumericId(action.tripId) ? action.tripId : null;
            if (!cloudTripId) return;
            // Get the timestamp from the queued action (which has id and timestamp)
            const queuedAction = action as QueuedAction & { timestamp: string };
            await apiFetch(`/api/companies/${companyId}/bus-ticketing/trips/${cloudTripId}/location`, {
              method: 'PATCH',
              body: JSON.stringify({
                currentLatitude: action.latitude,
                currentLongitude: action.longitude,
                lastLocationUpdate: queuedAction.timestamp,
              }),
            });
            break;
          }
          case 'CLOSE_SHIFT': {
            // Shift close is handled via syncPendingTickets
            await syncPendingTickets();
            break;
          }
        }
      });
      if (!cancelled) {
        // Also run regular sync after processing queue
        await syncPendingTickets();
      }
    })();
    return () => { cancelled = true; };
  }, [isOnline, companyId, syncNewTripToCloud, syncPendingTickets]);

  const updateTripLocation = useCallback(async (
    tripId: string,
    latitude?: number | null,
    longitude?: number | null,
    timestamp?: string | null
  ) => {
    if (!companyId) return;
    const updated = trips.map((t) => (
      t.id === tripId || (t.localId && t.localId === tripId)
        ? {
          ...t,
          currentLatitude: latitude ?? t.currentLatitude,
          currentLongitude: longitude ?? t.currentLongitude,
          lastLocationUpdate: timestamp ?? new Date().toISOString(),
          locationHistory: latitude != null && longitude != null
            ? [...(t.locationHistory || []), {
              latitude,
              longitude,
              timestamp: timestamp ?? new Date().toISOString(),
            }].slice(-100)
            : t.locationHistory,
        }
        : t
    ));
    setTrips(updated);
    await writeJSON(KEYS.trips, updated);

    // Persist location history to AsyncStorage (survives app restart)
    if (latitude != null && longitude != null) {
      await saveLocationHistory(tripId, {
        latitude,
        longitude,
        timestamp: timestamp ?? new Date().toISOString(),
      });
    }

    // Queue for offline sync if needed
    const cloudTripId = isNumericId(tripId) ? tripId : null;
    if (!isOnline || !cloudTripId || latitude == null || longitude == null) {
      if (latitude != null && longitude != null) {
        await enqueueAction({
          type: 'UPDATE_LOCATION',
          tripId,
          latitude,
          longitude,
          timestamp: timestamp ?? new Date().toISOString(),
        } as const);
      }
      DeviceEventEmitter.emit(BUS_STATE_CHANGED);
      return;
    }
    try {
      const res = await apiFetch(`/api/companies/${companyId}/bus-ticketing/trips/${cloudTripId}/location`, {
        method: 'PATCH',
        body: JSON.stringify({
          currentLatitude: latitude,
          currentLongitude: longitude,
          lastLocationUpdate: timestamp ?? new Date().toISOString(),
        }),
      });
      if (!res.ok) {
        console.warn('[useBusTicketing] Trip location sync failed:', res.status);
      }
    } catch (e: any) {
      console.warn('[useBusTicketing] Trip location sync failed:', e?.message || e);
    } finally {
      DeviceEventEmitter.emit(BUS_STATE_CHANGED);
    }
  }, [companyId, isOnline, trips]);

  const closeShift = useCallback(async (record: ShiftRecord) => {
    let updatedTrips = trips;
    if (activeTrip) {
      // ── Guard: never close a trip while it still has offline/unsynced sales. ──
      // Sync pending tickets for this trip first; if any fail to reach the cloud
      // (offline or rejected), refuse to close so no revenue is left behind.
      let tripToClose: BusTrip = activeTrip;
      const latestTickets = await readJSON<IssuedTicket[]>(KEYS.tickets, tickets);
      const pendingForTrip = latestTickets.filter(
        (ticket) =>
          !ticket.isSynced &&
          (ticket.tripId === activeTrip.id || ticket.tripId === activeTrip.localId),
      );
      if (pendingForTrip.length > 0) {
        if (!isOnline) {
          throw new Error(
            `Cannot close trip: ${pendingForTrip.length} offline ticket(s) have not been synced. Connect to the internet and sync before closing.`,
          );
        }
        const latestTrips = await readJSON<BusTrip[]>(KEYS.trips, trips);
        const latestRoutes = await readJSON<BusRoute[]>(KEYS.routes, routes);
        const latestVehicles = await readJSON<BusVehicle[]>(KEYS.vehicles, vehicles);
        const latestShifts = await readJSON<ShiftRecord[]>(KEYS.shifts, shifts);
        const latestReconciliations = await readJSON<ReconciliationRecord[]>(KEYS.reconciliations, reconciliations);
        const syncResult = await syncTickets(
          latestTickets,
          latestTrips,
          latestRoutes,
          latestVehicles,
          latestShifts,
          latestReconciliations,
        );
        setTickets(syncResult.updatedTickets);
        setTrips(syncResult.updatedTrips);
        if (syncResult.updatedShifts) {
          setShifts(syncResult.updatedShifts);
          await writeJSON(KEYS.shifts, syncResult.updatedShifts);
        }
        if (syncResult.updatedReconciliations) {
          setReconciliations(syncResult.updatedReconciliations);
          await writeJSON(KEYS.reconciliations, syncResult.updatedReconciliations);
        }
        await writeJSON(KEYS.trips, syncResult.updatedTrips);
        await writeJSON(KEYS.tickets, syncResult.updatedTickets);
        DeviceEventEmitter.emit(BUS_STATE_CHANGED);

        const stillPending = syncResult.updatedTickets.filter(
          (ticket) =>
            !ticket.isSynced &&
            (ticket.tripId === activeTrip.id || ticket.tripId === activeTrip.localId),
        );
        if (stillPending.length > 0) {
          throw new Error(
            `Cannot close trip: ${stillPending.length} ticket(s) could not be synced (${syncResult.error || 'sync failed'}). Review the error and try again.`,
          );
        }
        // The sync may have replaced the local trip with a real cloud trip.
        const syncedCloudTrip = syncResult.updatedTrips.find(
          (trip) =>
            isNumericId(trip.id) &&
            (trip.localId === activeTrip.id || trip.localId === activeTrip.localId),
        );
        if (syncedCloudTrip) tripToClose = syncedCloudTrip;
      }

      let closedTrip: BusTrip = { ...tripToClose, status: 'completed' as const };
      let tripIdForCloud: string | null = isNumericId(tripToClose.id)
        ? tripToClose.id
        : isNumericId(tripToClose.localId)
          ? (tripToClose.localId ?? null)
          : null;
      // If we're online but the trip hasn't reached the cloud yet, sync it first
      // so the shift can be recorded with a real cloud trip id.
      if (companyId && isOnline && !tripIdForCloud) {
        try {
          const syncedTrip = await createCloudTrip(tripToClose);
          tripIdForCloud = isNumericId(syncedTrip.id) ? syncedTrip.id : tripIdForCloud;
          closedTrip = { ...syncedTrip, status: 'completed' as const };
        } catch (e: any) {
          console.warn('[useBusTicketing] Trip cloud create before close failed; closing locally:', e?.message || e);
        }
      }
      if (companyId && isOnline && tripIdForCloud) {
        const closeBody = JSON.stringify({
          status: 'completed',
          actualArrival: new Date().toISOString(),
        });
        let res = await apiFetch(`/api/companies/${companyId}/bus-ticketing/trips/${tripIdForCloud}`, {
          method: 'PATCH',
          body: closeBody,
        });
        if (!res.ok && (res.status === 404 || res.status === 405)) {
          res = await apiFetch(`/api/companies/${companyId}/bus-ticketing/trips/${tripIdForCloud}/close`, {
            method: 'POST',
            body: closeBody,
          });
        }
        if (res.ok) {
          try {
            closedTrip = normalizeCloudTrip(await readJsonResponse(res, 'Trip close failed'));
          } catch (firstError: any) {
            res = await apiFetch(`/api/companies/${companyId}/bus-ticketing/trips/${tripIdForCloud}/close`, {
              method: 'POST',
              body: closeBody,
            });
            if (!res.ok) {
              throw new Error(await readApiError(res, `Trip close failed (${res.status})`));
            }
            try {
              closedTrip = normalizeCloudTrip(await readJsonResponse(res, 'Trip close failed'));
            } catch {
              throw firstError;
            }
          }
        } else {
          throw new Error(await readApiError(res, `Trip close failed (${res.status})`));
        }
      }
      updatedTrips = trips.map(t => (
        (t.id === activeTrip.id || t.id === activeTrip.localId) ||
        (tripToClose.id !== activeTrip.id && (t.id === tripToClose.id || t.id === tripToClose.localId))
          ? { ...t, ...closedTrip, status: 'completed' as const }
          : t
      ));
    }

    const updatedShifts = [...shifts, record];
    setShifts(updatedShifts);
    setTrips(updatedTrips);
    await writeJSON(KEYS.shifts, updatedShifts);
    await writeJSON(KEYS.trips, updatedTrips);
    DeviceEventEmitter.emit(BUS_STATE_CHANGED);

    // Queue for offline sync if needed
    if (companyId && !isOnline) {
      await enqueueAction({ type: 'CLOSE_SHIFT', record } as const);
    }
  }, [activeTrip, companyId, createCloudTrip, isOnline, reconciliations, routes, shifts, syncTickets, tickets, trips, vehicles]);

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
    // Persist the sign-off on the server when possible so the web approval
    // flow and accounting see the same decision.
    const target = reconciliations.find((record) => record.id === id);
    if (companyId && isOnline && target) {
      try {
        const serverList = await apiJson<any[]>(`/api/companies/${companyId}/bus-ticketing/reconciliations`).catch(() => null);
        const serverRecord = Array.isArray(serverList)
          ? serverList.find((row) => (
            String(row.conductorId) === String(target.conductorId) &&
            String(row.date) === String(target.date) &&
            Number(row.expectedCash) === Number(target.expectedCash) &&
            Number(row.cashReceived) === Number(target.cashReceived)
          ))
          : null;
        if (serverRecord?.id) {
          const res = await apiFetch(`/api/companies/${companyId}/bus-ticketing/reconciliations/${serverRecord.id}`, {
            method: 'PATCH',
            body: JSON.stringify({
              status,
              adminNotes: adminNotes?.trim() || undefined,
            }),
          });
          if (!res.ok) {
            const text = await res.text().catch(() => '');
            const message = (() => {
              try { return JSON.parse(text)?.message; } catch { return text; }
            })();
            if (message && !/self/i.test(String(message))) {
              throw new Error(message);
            }
          }
        } else if (target.isSynced) {
          console.warn('[useBusTicketing] Server reconciliation not found for sign-off; updating locally only.');
        }
      } catch (e: any) {
        console.warn('[useBusTicketing] Server reconciliation sign-off failed:', e?.message || e);
      }
    }

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
  }, [companyId, isOnline, reconciliations]);

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
    updateTripLocation,
  };
}
