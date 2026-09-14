import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";

export interface DeviceStatus {
    isConfigured: boolean;
    isOnline: boolean;
    fiscalDayOpen: boolean;
    fiscalDayStatus: string; // Add this
    fiscalDayNumber: number | null;
    lastSync: string | null;
    certificateExpiry: string | null;
}

export function useDeviceStatus(companyId: number, isLesotho = false) {
    return useQuery<DeviceStatus>({
        queryKey: ["device-status", companyId, isLesotho ? "lekuka" : "zimra"],
        queryFn: async () => {
            try {
                // Lesotho companies check LEKUKA config (local check, no
                // live RSL round-trip); Zimbabwe hits the FDMS status.
                const res = await apiFetch(
                    isLesotho
                        ? `/api/companies/${companyId}/lekuka/status`
                        : `/api/companies/${companyId}/zimra/status`,
                );

                // If backend says Not Registered (400)
                if (res.status === 400) {
                    return {
                        isConfigured: false,
                        isOnline: false,
                        fiscalDayOpen: false,
                        fiscalDayStatus: 'NotConfigured',
                        fiscalDayNumber: null,
                        lastSync: null,
                        certificateExpiry: null
                    };
                }

                if (!res.ok) {
                    const errBody = await res.json().catch(() => null);
                    const reason = (errBody as any)?.message || (errBody as any)?.error || res.statusText;
                    throw new Error(`Device status check failed (HTTP ${res.status}): ${reason}`);
                }

                const data = await res.json();

                if (isLesotho) {
                    return {
                        isConfigured: !!data.isConfigured,
                        isOnline: !!data.isOnline && !!data.isConfigured,
                        fiscalDayOpen: !!data.fiscalDayOpen,
                        fiscalDayStatus: data.fiscalDayStatus || (data.isConfigured ? 'Configured' : 'NotConfigured'),
                        fiscalDayNumber: data.fiscalDayNumber ?? null,
                        lastSync: data.lastSync ?? null,
                        certificateExpiry: null
                    };
                }

                // Map ZimraStatusResponse to DeviceStatus
                return {
                    isConfigured: true,
                    isOnline: true, // If we reached here, api call worked
                    fiscalDayOpen: data.fiscalDayStatus === 'FiscalDayOpened',
                    fiscalDayStatus: data.fiscalDayStatus,
                    fiscalDayNumber: data.lastFiscalDayNo,
                    lastSync: data.lastFiscalDayNoAt || data.fiscalDayClosed || null,
                    certificateExpiry: null
                };
            } catch (error: any) {
                // Network-level failure (backend down / unreachable / aborted).
                if (error instanceof TypeError) {
                    throw new Error("Device status check failed: backend unreachable — is the server running and VITE_API_URL correct?");
                }
                console.error("Device status fetch error:", error);
                throw error;
            }
        },
        enabled: !!companyId,
        refetchInterval: 15000, // Poll more frequently (15s) for responsive status
        retry: 1, // fail fast with the real reason instead of hanging on retries
    });
}
