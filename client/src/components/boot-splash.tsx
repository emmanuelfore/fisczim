import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { WifiOff, RefreshCw, CheckCircle2, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { BOOT_STAGES, runBootSequence, type BootResult } from "@/lib/boot-sequence";

const FRIENDLY_MESSAGES = [
  "Initializing application…",
  "Loading inventory…",
  "Preparing sales engine…",
  "Connecting to FiscalStack…",
  "Checking printer service…",
  "Finalizing startup…",
];

const STEP_LABELS = ["Navigation", "Sales", "Inventory", "Reports"];

interface BootSplashProps {
  /** Called once the sequence finishes (or the user continues offline). */
  onReady: (result: BootResult) => void;
  /** Minimum time the splash stays visible so instant steps feel deliberate. */
  minDisplayMs?: number;
}

function pushToHtmlShell(pct: number, msg: string) {
  try {
    (window as any).__bootSplashSet?.(pct, msg);
  } catch {}
}

function finishHtmlShell() {
  try {
    (window as any).__bootSplashDone?.();
  } catch {}
}

export function BootSplash({ onReady, minDisplayMs = 900 }: BootSplashProps) {
  const [targetPct, setTargetPct] = useState(4);
  const [displayPct, setDisplayPct] = useState(4);
  const [stageKey, setStageKey] = useState(BOOT_STAGES[0].key);
  const [stageLabel, setStageLabel] = useState(BOOT_STAGES[0].label);
  const [done, setDone] = useState(false);
  const [fading, setFading] = useState(false);
  const [slow, setSlow] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const [completedSteps, setCompletedSteps] = useState(0);
  const resultRef = useRef<BootResult | null>(null);
  const readyFired = useRef(false);
  const startTime = useRef(Date.now());

  // Smooth progress: ease displayPct toward targetPct, never jump.
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      setDisplayPct((prev) => {
        if (prev >= targetPct) return prev;
        const gap = targetPct - prev;
        const step = Math.max(0.4, gap * 0.08);
        const next = Math.min(targetPct, prev + step);
        return Math.round(next * 10) / 10;
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [targetPct]);

  // Rotate friendly status messages while busy.
  const [friendlyIdx, setFriendlyIdx] = useState(0);
  useEffect(() => {
    if (done) return;
    const t = setInterval(() => setFriendlyIdx((i) => (i + 1) % FRIENDLY_MESSAGES.length), 2200);
    return () => clearInterval(t);
  }, [done]);

  // Slow-operation reassurance after 8s.
  useEffect(() => {
    const t = setTimeout(() => setSlow(true), 8000);
    return () => clearTimeout(t);
  }, []);

  // Absolute failsafe: the staged sequence is timeout-guarded, but if anything
  // ever stalls the boot (wedged storage promise, frozen timers on low-end
  // devices), force progress after 30s rather than parking at 90% forever.
  // Offline-capable result so the workspace still opens.
  useEffect(() => {
    const t = setTimeout(() => {
      if (!readyFired.current) {
        setSlow(true);
        finish({ offline: true, storageHealthy: true, serverReachable: false, error: null });
      }
    }, 30000);
    return () => clearTimeout(t);
  }, []);

  const finish = (result: BootResult) => {
    if (readyFired.current) return;
    readyFired.current = true;
    resultRef.current = result;
    const elapsed = Date.now() - startTime.current;
    const wait = Math.max(0, minDisplayMs - elapsed);
    // Ease to 100% first so it never pops 0→100.
    setTargetPct(100);
    pushToHtmlShell(100, "Ready");
    setTimeout(() => {
      setDone(true);
      setFading(true);
      setTimeout(() => {
        finishHtmlShell();
        onReady(result);
        // Notify Electron to fade its native splash + reveal the main window.
        try {
          (window as any).electronAPI?.notifyAppReady?.();
        } catch {}
      }, 260);
    }, wait);
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const result = await runBootSequence((stage) => {
        if (cancelled) return;
        setStageKey(stage.key);
        setStageLabel(stage.label);
        setTargetPct(stage.targetPct);
        pushToHtmlShell(stage.targetPct, stage.label);
        // Progressive checklist mirrors the stage order.
        const idx = BOOT_STAGES.findIndex((s) => s.key === stage.key);
        setCompletedSteps(Math.min(STEP_LABELS.length, Math.max(0, Math.floor(((idx + 1) / BOOT_STAGES.length) * (STEP_LABELS.length + 1)))));
      });
      if (cancelled) return;
      if (result.error && !result.offline) {
        // Hard failure (e.g. storage) — show it, but still allow continuing.
        setFailed(result.error);
        setTargetPct(100);
        return;
      }
      setOffline(result.offline);
      finish(result);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleRetry = () => {
    setFailed(null);
    setSlow(false);
    setTargetPct(4);
    setDisplayPct(4);
    readyFired.current = false;
    startTime.current = Date.now();
    (async () => {
      const result = await runBootSequence((stage) => {
        setStageKey(stage.key);
        setStageLabel(stage.label);
        setTargetPct(stage.targetPct);
        pushToHtmlShell(stage.targetPct, stage.label);
      });
      if (result.error && !result.offline) {
        setFailed(result.error);
        setTargetPct(100);
        return;
      }
      setOffline(result.offline);
      finish(result);
    })();
  };

  const handleContinueOffline = () => {
    finish(
      resultRef.current ?? {
        offline: true,
        storageHealthy: true,
        serverReachable: false,
        error: null,
      },
    );
  };

  const rounded = Math.round(displayPct);

  return (
    <div
      className={cn(
        "min-h-screen flex flex-col items-center justify-center bg-slate-900 text-white p-6 transition-opacity duration-300",
        fading && "opacity-0",
      )}
      aria-live="polite"
      data-testid="boot-splash"
    >
      <div className="w-full max-w-sm text-center">
        <div className="mt-2 flex items-center justify-center gap-1.5" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="w-[7px] h-[7px] rounded-full bg-indigo-500 animate-bounce"
              style={{ animationDelay: `${i * 150}ms` }}
            />
          ))}
        </div>

        <p className="mt-4 text-sm text-slate-300 min-h-[20px]">{stageLabel}</p>
        <p className="mt-1 text-xs text-slate-500 min-h-[16px]">
          {done ? "Ready" : FRIENDLY_MESSAGES[friendlyIdx]}
        </p>

        <div
          className="mx-auto mt-4 w-full max-w-[320px] h-1.5 rounded-full bg-white/10 overflow-hidden"
          role="progressbar"
          aria-valuenow={rounded}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-cyan-400 transition-[width] duration-200"
            style={{ width: `${rounded}%` }}
          />
        </div>
        <p className="mt-2 text-xs text-slate-500 tabular-nums">{rounded}%</p>

        {/* Progressive load checklist */}
        <div className="mt-6 grid grid-cols-2 gap-2 text-left">
          {STEP_LABELS.map((label, i) => {
            const state: "done" | "active" | "pending" =
              i < completedSteps ? "done" : i === completedSteps ? "active" : "pending";
            return (
              <div
                key={label}
                className={cn(
                  "flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold border",
                  state === "done" && "bg-emerald-500/10 border-emerald-500/20 text-emerald-300",
                  state === "active" && "bg-white/5 border-white/10 text-slate-200",
                  state === "pending" && "bg-transparent border-white/5 text-slate-500",
                )}
              >
                {state === "done" ? (
                  <CheckCircle2 className="w-3.5 h-3.5" />
                ) : state === "active" ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <span className="w-3.5 h-3.5 rounded-full border border-current" />
                )}
                {state === "done" ? `✓ ${label}` : state === "active" ? label : `Waiting for ${label.toLowerCase()}…`}
              </div>
            );
          })}
        </div>

        {slow && !done && !failed && (
          <p className="mt-5 text-xs text-slate-400">
            Still preparing… large databases may take longer on first launch.
          </p>
        )}

        {offline && !done && !failed && displayPct >= 90 && (
          <div className="mt-5 p-3 rounded-2xl bg-orange-500/10 border border-orange-500/30 text-orange-300 text-xs font-semibold flex items-center justify-center gap-2">
            <WifiOff className="w-4 h-4" />
            Offline mode is available — essentials load first.
          </div>
        )}

        {failed && (
          <div className="mt-5 p-4 rounded-2xl bg-red-500/10 border border-red-500/20">
            <p className="text-red-300 text-sm font-semibold">{failed}</p>
            <p className="text-slate-400 text-xs mt-1">
              {offline ? "Offline mode is available." : "Sales can continue once the essentials are ready."}
            </p>
            <div className="mt-3 flex gap-2 justify-center">
              <Button
                variant="outline"
                size="sm"
                onClick={handleRetry}
                className="bg-white/5 border-white/10 text-white hover:bg-white/10"
              >
                <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Retry
              </Button>
              <Button size="sm" onClick={handleContinueOffline}>
                Continue Offline
              </Button>
            </div>
          </div>
        )}

        <p className="mt-6 text-[11px] text-slate-600 uppercase tracking-widest font-bold">
          {stageKey === "sync" ? "This may take a few moments — essentials first." : `Step: ${stageLabel}`}
        </p>
      </div>
    </div>
  );
}
