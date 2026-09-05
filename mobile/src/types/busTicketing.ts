// ─────────────────────────────────────────────
//  Bus Ticketing — Data Models
// ─────────────────────────────────────────────

export type DropOffPoint = {
  name: string;
  price: number;
};

export type RouteFareMatrix = Record<string, number>; // keyed "From|To" (e.g. "Harare|Kadoma"), symmetric

export type TicketFieldConfig = {
  passengerName: boolean;
  idNumber: boolean;
  phone: boolean;
  seatNumber: boolean;
  dropOffPoint: boolean;
  dropOffPoints: DropOffPoint[]; // legacy: e.g. [{name: "Kadoma", price: 15}, {name: "Kwekwe", price: 20}]
  stops?: string[]; // ordered route stops incl. origin & destination: ["Harare", "Chinhoyi", ..., "Gweru"]
  fares?: RouteFareMatrix; // inter-stop prices, keyed "From|To"
  requirePaymentMethod: boolean;
  allowMultiPassenger: boolean;
};

export function getRouteFare(
  config: TicketFieldConfig | undefined,
  boardAt: string | undefined,
  dropAt: string | undefined,
  fallbackPrice: number,
): number {
  if (boardAt && dropAt && config?.fares) {
    const key = `${boardAt}|${dropAt}`;
    const reverseKey = `${dropAt}|${boardAt}`;
    const fare = config.fares[key] ?? config.fares[reverseKey];
    if (typeof fare === 'number' && Number.isFinite(fare)) return fare;
  }
  return fallbackPrice;
}

export type BusVehicle = {
  id: string; // uuid
  registrationNumber: string;
  fleetNumber?: string;
  model?: string;
  capacity?: number;
  isActive: boolean;
  createdAt: string; // ISO datetime
};

export type BusTrip = {
  id: string; // uuid
  routeId: string;
  vehicleId: string;
  conductorId: string;
  scheduledDeparture: string;
  status: 'scheduled' | 'boarding' | 'en_route' | 'in_progress' | 'completed' | 'cancelled';
  actualDeparture?: string;
  actualArrival?: string;
  localId?: string;
  // Location tracking
  currentLatitude?: number;
  currentLongitude?: number;
  lastLocationUpdate?: string;
  locationHistory?: Array<{
    latitude: number;
    longitude: number;
    timestamp: string;
  }>;
};

export type BusRoute = {
  id: string; // uuid
  name: string; // auto-generated: "Origin → Destination"
  origin: string;
  destination: string;
  price: number; // USD
  currency: 'USD' | 'ZWG';
  isActive: boolean;
  config: TicketFieldConfig;
  createdAt: string; // ISO datetime
};

export type IssuedTicket = {
  id: string; // TKT-YYYYMMDD-XXXX
  routeId: string;
  routeName: string;
  price: number;
  quantity: number; // number of passengers
  totalAmount: number; // price × quantity
  currency: string;
  paymentMethod?: 'Cash' | 'EcoCash' | 'InnBucks' | 'Swipe';
  passengerName?: string;
  idNumber?: string;
  phone?: string;
  seatNumber?: string;
  boardingPoint?: string;
  dropOffPoint?: string;
  issuedAt: string; // ISO datetime
  conductorId?: string;
  conductorName?: string;
  tripId?: string;
  vehicleId?: string;
  tripSnapshot?: BusTrip;
  isSynced?: boolean;
  syncedAt?: string;
};

export type Conductor = {
  id: string;
  name: string;
  phone?: string;
  isActive: boolean;
};

export type ShiftRecord = {
  id: string;
  conductorId?: string;
  conductorName?: string;
  date: string;
  vehicleId?: string;
  tripId?: string;
  routeId?: string;
  shiftStart: string;
  shiftEnd: string;
  totalTickets: number;
  totalPassengers: number;
  totalRevenue: number;
  closedAt: string;
  isSynced?: boolean;
  syncedAt?: string;
  // Cash reconciliation fields
  expectedCash?: number;
  cashReceived?: number;
  gap?: number;
};

export type ReconciliationRecord = {
  id: string;
  conductorId: string;
  conductorName: string;
  date: string;
  tripId?: string;
  shiftId?: string;
  expectedCash: number;
  cashReceived: number;
  gap: number;
  notes?: string;
  savedAt: string;
  status?: 'pending' | 'approved' | 'rejected';
  signedOffBy?: string;
  signedOffAt?: string;
  adminNotes?: string;
  isSynced?: boolean;
  syncedAt?: string;
};

export type RouteBreakdown = {
  routeId: string;
  routeName: string;
  ticketCount: number;
  passengerCount: number;
  revenue: number;
  avgTicketsPerHour: number;
};

export type PaymentBreakdown = {
  method: string;
  count: number;
  amount: number;
  percentage: number;
};

export type HourBreakdown = {
  hour: number;
  ticketCount: number;
  revenue: number;
};

export type StopBreakdown = {
  id: string;
  routeId: string;
  routeName: string;
  stop: string;
  ticketCount: number;
  passengerCount: number;
  revenue: number;
};

export type DailySummary = {
  date: string;
  totalTickets: number;
  totalPassengers: number;
  totalRevenue: number;
  byRoute: RouteBreakdown[];
  byPaymentMethod: PaymentBreakdown[];
  byHour: HourBreakdown[];
  byStop: StopBreakdown[];
};

export type RangeReport = {
  from: string;
  to: string;
  totalTickets: number;
  totalPassengers: number;
  totalRevenue: number;
  avgDailyRevenue: number;
  bestDay: { date: string; revenue: number };
  worstDay: { date: string; revenue: number };
  byRoute: RouteBreakdown[];
  byDay: DailySummary[];
  byStop: StopBreakdown[];
};

export type ConductorReport = {
  conductorId: string;
  conductorName: string;
  date: string;
  ticketsIssued: number;
  passengersServed: number;
  expectedCash: number;
  totalCollected: number;
  byRoute: RouteBreakdown[];
  shiftStart?: string;
  shiftEnd?: string;
};
