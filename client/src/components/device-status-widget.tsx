import { useDeviceStatus } from "@/hooks/use-device-status";
import { Badge } from "@/components/ui/badge";
import { Loader2, Server, AlertCircle, RefreshCw } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Link } from "wouter";
import { useFiscalAuthority } from "@/hooks/use-fiscal-authority";

export function DeviceStatusWidget({ companyId }: { companyId: number }) {
  const { data: status, isLoading, isError } = useDeviceStatus(companyId);
  const { settingsLabel, settingsRoute } = useFiscalAuthority();

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-50 border border-slate-100">
        <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-400" />
      </div>
    );
  }

  if (isError || !status) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Link href={settingsRoute}>
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-red-50 border border-red-100 cursor-pointer hover:bg-red-100 transition-colors">
                <AlertCircle className="w-3.5 h-3.5 text-red-500" />
                <span className="text-[10px] font-bold text-red-700 uppercase tracking-wide">
                  Error
                </span>
              </div>
            </Link>
          </TooltipTrigger>
          <TooltipContent>
            <p>Failed to check device status</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  if (!status.isConfigured) {
    return (
      <Link href={settingsRoute}>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-100 border border-slate-200 cursor-pointer hover:bg-slate-200 transition-colors">
          <Server className="w-3.5 h-3.5 text-slate-400" />
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">
            Setup Device
          </span>
        </div>
      </Link>
    );
  }

  // Determine state
  const isDayOpen = status.fiscalDayOpen;
  const isClosurePending = status.fiscalDayStatus === "FiscalDayCloseFailed";

  // Logic:
  // Closure Pending = Pending (Amber)
  // Online + Day Open = Green
  // Online + Day Closed = Neutral
  // Offline = Muted

  let state: "online" | "closed" | "offline" | "pending" = "online";
  if (!status.isOnline) state = "offline";
  else if (isClosurePending) state = "pending";
  else if (!isDayOpen) state = "closed";

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Link href={settingsRoute}>
            <div
              className={`
                        flex items-center gap-2 px-3 py-1.5 rounded-full border cursor-pointer transition-all duration-200
                        ${state === "online" ? "bg-emerald-50 border-emerald-100 hover:bg-emerald-100" : ""}
                        ${state === "closed" ? "bg-slate-50 border-slate-200 hover:bg-slate-100" : ""}
                        ${state === "offline" ? "bg-slate-50 border-slate-100 hover:bg-slate-100" : ""}
                        ${state === "pending" ? "bg-amber-50 border-amber-200 hover:bg-amber-100" : ""}
                    `}
            >
              <div
                className={`w-2 h-2 rounded-full ${
                  state === "online"
                    ? "bg-emerald-500 animate-pulse"
                    : state === "closed"
                      ? "bg-slate-400"
                      : state === "pending"
                        ? "bg-amber-500"
                        : "bg-slate-400"
                }`}
              />
              <span
                className={`text-[10px] font-black uppercase tracking-wide ${
                  state === "online"
                    ? "text-emerald-700"
                    : state === "closed"
                      ? "text-slate-600"
                      : state === "pending"
                        ? "text-amber-700"
                        : "text-slate-500"
                }`}
              >
                {state === "online"
                  ? "Fiscal Day Open"
                  : state === "closed"
                    ? "Fiscal Day Closed"
                    : state === "pending"
                      ? "Closure Pending"
                      : "Offline"}
              </span>
              {state === "pending" && (
                <RefreshCw className="w-3 h-3 ml-1 text-amber-500" />
              )}
            </div>
          </Link>
        </TooltipTrigger>
        <TooltipContent>
          <div className="text-xs space-y-1">
            <p className="font-bold">
              Device Status: {status.isOnline ? "Online" : "Offline"}
            </p>
            <p>
              {isDayOpen
                ? `Fiscal Day ${status.fiscalDayNumber} Open`
                : "Fiscal Day is Closed"}
            </p>
            {status.lastSync && (
              <p className="text-slate-400">
                Last Open: {new Date(status.lastSync).toLocaleTimeString()}
              </p>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
