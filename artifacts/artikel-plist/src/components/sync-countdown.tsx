import { useEffect, useState } from "react";
import { Timer } from "lucide-react";

export function SyncCountdown({ nextSyncAt }: { nextSyncAt: string | null | undefined }) {
  const [now, setNow] = useState(Date.now);

  useEffect(() => {
    // Use the current clock, not accumulated ticks, to recover after a sleeping tab.
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  const deadline = nextSyncAt ? Date.parse(nextSyncAt) : NaN;
  const remainingMs = deadline - now;
  let label = "Nächste Sync: unbekannt";
  if (Number.isFinite(deadline)) {
    label = remainingMs > 0
      ? `Nächste Sync in ${Math.ceil(remainingMs / 60_000)} Min.`
      : "Nächste Sync in Kürze";
  }

  return (
    <div className="flex items-center gap-1 mb-3" data-testid="sync-countdown">
      <Timer className="w-3 h-3 shrink-0 text-sidebar-foreground/50" />
      <p className="text-xs text-sidebar-foreground/70">{label}</p>
    </div>
  );
}
