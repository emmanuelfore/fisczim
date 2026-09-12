import AsyncStorage from '@react-native-async-storage/async-storage';
import { BusTrip, IssuedTicket, ShiftRecord } from '../types/busTicketing';

const QUEUE_KEY = 'bus_ticketing_offline_queue';
const LOCATION_HISTORY_PREFIX = 'bus_trip_location_';

export type QueuedAction =
  | { type: 'CREATE_TRIP'; trip: BusTrip; timestamp: string; id?: string }
  | { type: 'UPDATE_LOCATION'; tripId: string; latitude: number; longitude: number; timestamp: string; id?: string }
  | { type: 'ISSUE_TICKET'; ticket: IssuedTicket; timestamp: string; id?: string }
  | { type: 'CLOSE_SHIFT'; record: ShiftRecord; timestamp: string; id?: string }
  | { type: 'UPDATE_TRIP_STATUS'; tripId: string; status: BusTrip['status']; timestamp: string; id?: string };

type ActionInput =
  | { type: 'CREATE_TRIP'; trip: BusTrip }
  | { type: 'UPDATE_LOCATION'; tripId: string; latitude: number; longitude: number; timestamp: string }
  | { type: 'ISSUE_TICKET'; ticket: IssuedTicket }
  | { type: 'CLOSE_SHIFT'; record: ShiftRecord }
  | { type: 'UPDATE_TRIP_STATUS'; tripId: string; status: BusTrip['status'] };

function generateId(): string {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

async function readQueue(): Promise<QueuedAction[]> {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

async function writeQueue(queue: QueuedAction[]): Promise<void> {
  try {
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  } catch (e) {
    console.error('[busOfflineQueue] Failed to write queue:', e);
  }
}

export async function enqueueAction(action: ActionInput): Promise<string> {
  const queue = await readQueue();
  const id = generateId();
  const queuedAction = { ...action, timestamp: new Date().toISOString(), id } as QueuedAction;
  queue.push(queuedAction);
  await writeQueue(queue);
  return id;
}

export async function getOfflineQueue(): Promise<(QueuedAction & { id: string })[]> {
  const queue = await readQueue();
  return queue.map((item, index) => ({ ...item, id: (item as any).id || `legacy_${index}` })) as (QueuedAction & { id: string })[];
}

export async function removeFromQueue(id: string): Promise<void> {
  const queue = await readQueue();
  const filtered = queue.filter((item) => (item as any).id !== id);
  await writeQueue(filtered);
}

export async function clearQueue(): Promise<void> {
  await AsyncStorage.removeItem(QUEUE_KEY);
}

export async function processOfflineQueue(
  companyId: number,
  executeAction: (action: QueuedAction) => Promise<void>
): Promise<{ processed: number; failed: number }> {
  const queue = await getOfflineQueue();
  if (!queue.length) return { processed: 0, failed: 0 };

  let processed = 0;
  let failed = 0;
  const remaining: (QueuedAction & { id: string })[] = [];

  for (const action of queue) {
    try {
      await executeAction(action);
      await removeFromQueue(action.id);
      processed++;
    } catch (error) {
      console.warn('[busOfflineQueue] Action failed, will retry:', action.type, error);
      remaining.push(action);
      failed++;
    }
  }

  return { processed, failed };
}

// ─── Location History Persistence ─────────────────────────────────────────────

interface LocationPoint {
  latitude: number;
  longitude: number;
  timestamp: string;
}

export async function saveLocationHistory(tripId: string, point: LocationPoint): Promise<void> {
  const key = `${LOCATION_HISTORY_PREFIX}${tripId}`;
  try {
    const raw = await AsyncStorage.getItem(key);
    const history: LocationPoint[] = raw ? JSON.parse(raw) : [];
    history.push(point);
    // Keep last 200 points to prevent unbounded growth
    if (history.length > 200) {
      history.splice(0, history.length - 200);
    }
    await AsyncStorage.setItem(key, JSON.stringify(history));
  } catch (e) {
    console.error('[busOfflineQueue] Failed to save location history:', e);
  }
}

export async function getLocationHistory(tripId: string): Promise<LocationPoint[]> {
  const key = `${LOCATION_HISTORY_PREFIX}${tripId}`;
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export async function clearLocationHistory(tripId: string): Promise<void> {
  const key = `${LOCATION_HISTORY_PREFIX}${tripId}`;
  await AsyncStorage.removeItem(key);
}

export async function mergeLocationHistory(tripId: string, cloudHistory: LocationPoint[]): Promise<LocationPoint[]> {
  const localHistory = await getLocationHistory(tripId);
  const combined = [...localHistory, ...cloudHistory];
  // Deduplicate by timestamp (keep first occurrence)
  const seen = new Set<string>();
  const deduped = combined.filter((point) => {
    if (seen.has(point.timestamp)) return false;
    seen.add(point.timestamp);
    return true;
  });
  // Sort by timestamp
  deduped.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  // Save merged history
  const key = `${LOCATION_HISTORY_PREFIX}${tripId}`;
  await AsyncStorage.setItem(key, JSON.stringify(deduped.slice(-200)));
  return deduped;
}