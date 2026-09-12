import { Layout } from "@/components/layout";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { useBusTrips, useBusRoutes, useBusVehicles } from "@/hooks/use-bus-ticketing";
import {
  MapPin,
  Bus,
  Clock,
  Navigation,
  RefreshCw,
  ExternalLink,
  MapPinned,
  AlertTriangle,
} from "lucide-react";
import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { format } from "date-fns";

const HARARE_CENTER = { lat: -17.8292, lng: 31.0522 };
const BUS_SVG =
  '<svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="18" height="18"><path d="M8 6v6"/><path d="M15 6v6"/><path d="M2 12h19.6"/><path d="M18 18h3s.5-1.7.8-2.8c.1-.4.2-.8.2-1.2 0-.4-.1-.8-.2-1.2l-1.4-5C20.1 6.8 19.1 6 18 6H4a2 2 0 0 0-2 2v10h3"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="18" r="2"/></svg>';

// Cache a single Leaflet load promise so repeated visits don't re-inject scripts.
let leafletPromise: Promise<any> | null = null;

function loadLeaflet(): Promise<any> {
  if (typeof window !== "undefined" && (window as any).L) {
    return Promise.resolve((window as any).L);
  }
  if (leafletPromise) return leafletPromise;
  leafletPromise = new Promise((resolve, reject) => {
    if (!document.getElementById("leaflet-css")) {
      const link = document.createElement("link");
      link.id = "leaflet-css";
      link.rel = "stylesheet";
      link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
      document.head.appendChild(link);
    }
    const existing = document.getElementById("leaflet-js");
    if (existing) {
      existing.addEventListener("load", () => resolve((window as any).L));
      existing.addEventListener("error", () => {
        leafletPromise = null;
        reject(new Error("Map library failed to load"));
      });
      return;
    }
    const script = document.createElement("script");
    script.id = "leaflet-js";
    script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
    script.onload = () => resolve((window as any).L);
    script.onerror = () => {
      leafletPromise = null;
      reject(new Error("Map library failed to load"));
    };
    document.head.appendChild(script);
  });
  return leafletPromise;
}

export default function BusTrackingPage() {
  const companyId = parseInt(localStorage.getItem("selectedCompanyId") || "0");
  const { data: trips, isLoading, refetch, isFetching, isError } = useBusTrips(companyId);
  const { data: routes } = useBusRoutes(companyId);
  const { data: vehicles } = useBusVehicles(companyId);
  const [lastUpdate, setLastUpdate] = useState(new Date());
  const [mapError, setMapError] = useState<string | null>(null);

  const mapElRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<any>(null);
  const markersRef = useRef<Map<number, any>>(new Map());

  const activeTrips = useMemo(
    () =>
      (trips || []).filter((trip: any) => {
        const lat = Number(trip.currentLatitude);
        const lng = Number(trip.currentLongitude);
        return (
          ["boarding", "en_route", "in_progress"].includes(trip.status) &&
          Number.isFinite(lat) &&
          Number.isFinite(lng) &&
          Math.abs(lat) <= 90 &&
          Math.abs(lng) <= 180 &&
          !(lat === 0 && lng === 0)
        );
      }),
    [trips],
  );

  // Auto-refresh every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      refetch().catch((e) => {
        console.warn("Bus tracking refresh failed:", e?.message || e);
      });
      setLastUpdate(new Date());
    }, 30000);
    return () => clearInterval(interval);
  }, [refetch]);

  const buildPopup = (trip: any, route: any, vehicle: any) => {
    const lat = Number(trip.currentLatitude);
    const lng = Number(trip.currentLongitude);
    const label = vehicle?.registrationNumber || `Vehicle #${trip.vehicleId}`;
    const routeLabel = route?.name || `Route #${trip.routeId}`;
    const mapHref = `https://www.openstreetmap.org/?mlat=${lat.toFixed(6)}&mlon=${lng.toFixed(6)}#map=16/${lat.toFixed(6)}/${lng.toFixed(6)}`;
    return `
      <div style="min-width:180px;font-family:inherit;line-height:1.45">
        <div style="font-weight:700;font-size:13px;margin-bottom:2px">🚌 ${label}</div>
        <div style="font-size:12px;color:#64748b;margin-bottom:6px">${routeLabel}</div>
        <div style="font-size:12px;margin-bottom:4px"><b>Status:</b> ${String(trip.status).replace("_", " ")}</div>
        <div style="font-size:12px;margin-bottom:4px"><b>Last update:</b> ${getLocationAge(trip.lastLocationUpdate) || "-"}</div>
        <div style="font-size:11px;color:#64748b;font-family:monospace">${lat.toFixed(6)}, ${lng.toFixed(6)}</div>
        <div style="margin-top:6px">
          <a href="${mapHref}" target="_blank" rel="noopener noreferrer"
             style="display:inline-block;background:#f97316;color:#fff;font-size:11px;font-weight:700;
                    padding:3px 8px;border-radius:6px;text-decoration:none">View larger map</a>
        </div>
      </div>`;
  };

  const syncMarkers = useCallback(() => {
    const map = mapInstanceRef.current;
    const L = (window as any).L;
    if (!map || !L) return;

    const seen = new Set<number>();
    activeTrips.forEach((trip: any) => {
      const id = Number(trip.id);
      const lat = Number(trip.currentLatitude);
      const lng = Number(trip.currentLongitude);
      seen.add(id);

      let marker = markersRef.current.get(id);
      if (!marker) {
        const icon = L.divIcon({
          className: "bus-track-marker",
          html: `<div style="width:34px;height:34px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:#f97316;border:2px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center">${BUS_SVG.replace('<svg ', '<svg style="transform:rotate(45deg)" ')}</div>`,
          iconSize: [34, 34],
          iconAnchor: [17, 30],
          popupAnchor: [0, -28],
        });
        marker = L.marker([lat, lng], { icon }).addTo(map);
        markersRef.current.set(id, marker);
      } else {
        marker.setLatLng([lat, lng]);
      }

      const route = routes?.find((r: any) => r.id === trip.routeId);
      const vehicle = vehicles?.find((v: any) => v.id === trip.vehicleId);
      marker.setPopupContent(buildPopup(trip, route, vehicle));
    });

    markersRef.current.forEach((marker, id) => {
      if (!seen.has(id)) {
        map.removeLayer(marker);
        markersRef.current.delete(id);
      }
    });

    const latLngs = Array.from(markersRef.current.values()).map((m: any) => m.getLatLng());
    if (latLngs.length > 0) {
      map.fitBounds(L.latLngBounds(latLngs).pad(0.35));
    }
  }, [activeTrips, routes, vehicles]);

  const syncMarkersRef = useRef(syncMarkers);
  syncMarkersRef.current = syncMarkers;

  // Initialize Leaflet map once
  useEffect(() => {
    let cancelled = false;
    loadLeaflet()
      .then((L) => {
        if (cancelled || !mapElRef.current || mapInstanceRef.current) return;
        const map = L.map(mapElRef.current).setView([HARARE_CENTER.lat, HARARE_CENTER.lng], 6);
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
          maxZoom: 19,
        }).addTo(map);
        mapInstanceRef.current = map;
        syncMarkersRef.current();
      })
      .catch((e) => {
        if (!cancelled) setMapError(e?.message || "Could not load map");
      });
    return () => {
      cancelled = true;
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
      markersRef.current.clear();
    };
  }, []);

  // Keep markers in sync whenever trips/routes/vehicles change
  useEffect(() => {
    syncMarkers();
  }, [syncMarkers]);

  const getTripLocation = (trip: any) => {
    if (!trip.currentLatitude || !trip.currentLongitude) return null;
    return {
      lat: trip.currentLatitude,
      lng: trip.currentLongitude,
      lastUpdate: trip.lastLocationUpdate,
    };
  };

  const getLocationAge = (timestamp: string) => {
    if (!timestamp) return null;
    const now = new Date();
    const then = new Date(timestamp);
    const diffMs = now.getTime() - then.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${Math.floor(diffHours / 24)}d ago`;
  };

  return (
    <Layout>
      <PageHeader
        title="Bus Tracking"
        subtitle="Real-time location tracking for active trips"
        actions={
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <RefreshCw className={`w-4 h-4 ${isFetching ? "animate-spin" : ""}`} />
            <span>Last updated: {format(lastUpdate, "HH:mm:ss")}</span>
          </div>
        }
      />

      {isLoading ? (
        <Card className="border-none shadow-sm">
          <CardContent className="p-8 text-center text-slate-500">
            Loading bus locations...
          </CardContent>
        </Card>
      ) : isError ? (
        <Card className="border-none shadow-sm">
          <CardContent className="p-8 text-center text-red-500">
            Failed to load trip locations. Check your connection and try again.
          </CardContent>
        </Card>
      ) : activeTrips.length === 0 ? (
        <Card className="border-none shadow-sm">
          <CardContent className="p-8 text-center text-slate-500">
            <div className="flex flex-col items-center gap-4">
              <Bus className="w-12 h-12 text-slate-300" />
              <p>No active buses with location data</p>
              <p className="text-sm">
                Buses must be on active trips with GPS enabled to appear here
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {/* Real-time Map */}
          <Card className="border-none shadow-sm lg:col-span-2">
            <CardContent className="p-0">
              {mapError ? (
                <div className="flex h-96 items-center justify-center gap-2 rounded-lg bg-amber-50 p-6 text-center text-amber-700">
                  <AlertTriangle className="w-5 h-5" />
                  <p>Map could not load ({mapError}). Coordinates are still listed below.</p>
                </div>
              ) : (
                <div className="relative h-[480px] overflow-hidden rounded-lg">
                  <div ref={mapElRef} className="absolute inset-0 z-0" />
                  <div className="pointer-events-none absolute right-3 top-3 z-[500] flex items-center gap-1.5 rounded-full bg-white/90 px-3 py-1.5 text-xs font-bold text-slate-700 shadow">
                    <MapPinned className="w-3.5 h-3.5 text-orange-500" />
                    {activeTrips.length} active bus{activeTrips.length === 1 ? "" : "es"}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Active Trips List */}
          {activeTrips.map((trip: any) => {
            const route = routes?.find((r: any) => r.id === trip.routeId);
            const vehicle = vehicles?.find((v: any) => v.id === trip.vehicleId);
            const location = getTripLocation(trip);

            if (!location) return null;

            return (
              <Card key={trip.id} className="border-none shadow-sm">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-orange-50 flex items-center justify-center text-orange-600">
                        <Bus className="w-5 h-5" />
                      </div>
                      <div>
                        <p className="font-bold text-slate-900">
                          {vehicle?.registrationNumber || `Vehicle #${trip.vehicleId}`}
                        </p>
                        <p className="text-xs text-slate-500">
                          {route?.name || `Route #${trip.routeId}`}
                        </p>
                      </div>
                    </div>
                    <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-100">
                      {trip.status.replace("_", " ")}
                    </span>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center gap-2 text-sm">
                      <MapPin className="w-4 h-4 text-blue-500" />
                      <span className="font-mono text-slate-700">
                        {Number(location.lat).toFixed(6)}, {Number(location.lng).toFixed(6)}
                      </span>
                      <a
                        href={`https://www.openstreetmap.org/?mlat=${Number(location.lat).toFixed(6)}&mlon=${Number(location.lng).toFixed(6)}#map=14/${Number(location.lat).toFixed(6)}/${Number(location.lng).toFixed(6)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-xs font-bold text-blue-600 hover:bg-blue-50"
                      >
                        <ExternalLink className="w-3 h-3" />
                        View map
                      </a>
                    </div>

                    <div className="flex items-center gap-2 text-sm text-slate-500">
                      <Clock className="w-4 h-4" />
                      <span>
                        Last update: {getLocationAge(location.lastUpdate)}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 text-sm text-slate-500">
                      <Navigation className="w-4 h-4" />
                      <span>
                        {route?.origin} → {route?.destination}
                      </span>
                    </div>

                    {trip.scheduledDeparture && (
                      <div className="flex items-center gap-2 text-sm text-slate-500">
                        <Clock className="w-4 h-4" />
                        <span>
                          Scheduled: {format(new Date(trip.scheduledDeparture), "MMM d, HH:mm")}
                        </span>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </Layout>
  );
}