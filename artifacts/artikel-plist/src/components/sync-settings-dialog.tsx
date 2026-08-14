import { useState, useEffect } from "react";
import { Settings } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { useGetSyncConfig, useSetSyncConfig } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";

const INTERVAL_OPTIONS = [
  { label: "1 Minute", minutes: 1 },
  { label: "5 Minuten", minutes: 5 },
  { label: "15 Minuten", minutes: 15 },
  { label: "30 Minuten", minutes: 30 },
] as const;

const LS_KEY = "autosync_interval_ms";

/** Only these values may be stored/restored. Mirrors ALLOWED_INTERVAL_MS in api-zod. */
const ALLOWED_MS_SET = new Set<number>([60_000, 300_000, 900_000, 1_800_000]);

/** Format milliseconds as a human-readable German label, e.g. "alle 5 Minuten". */
export function formatIntervalLabel(ms: number): string {
  const minutes = Math.round(ms / 60_000);
  if (minutes === 1) return "alle 1 Minute";
  return `alle ${minutes} Minuten`;
}

/** Read persisted interval from localStorage, returning null if absent or not in the allowed set. */
function readPersistedIntervalMs(): number | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    const n = Number(raw);
    return ALLOWED_MS_SET.has(n) ? n : null;
  } catch {
    return null;
  }
}

/** Persist an interval (ms) to localStorage. */
function persistIntervalMs(ms: number): void {
  try {
    localStorage.setItem(LS_KEY, String(ms));
  } catch {
    // localStorage not available – silently ignore
  }
}

interface SyncSettingsDialogProps {
  /** Called after a successful interval change so the parent can react. */
  onIntervalChanged?: (ms: number) => void;
}

export function SyncSettingsDialog({ onIntervalChanged }: SyncSettingsDialogProps) {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();

  const { data: syncConfig } = useGetSyncConfig();
  const setConfigMutation = useSetSyncConfig();

  // On mount: if localStorage has a preferred interval different from server, apply it.
  useEffect(() => {
    const persisted = readPersistedIntervalMs();
    if (persisted !== null && syncConfig !== undefined && persisted !== syncConfig.intervalMs) {
      setConfigMutation.mutate(
        { data: { intervalMs: persisted } },
        { onSuccess: (res) => onIntervalChanged?.(res.intervalMs) },
      );
    }
    // Only run once after first server data load
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncConfig !== undefined]);

  const currentMs = syncConfig?.intervalMs ?? 5 * 60_000;
  const currentMinutes = Math.round(currentMs / 60_000);
  const selectedValue = String(currentMinutes);

  function handleSelect(value: string) {
    const minutes = Number(value);
    const ms = minutes * 60_000;
    setConfigMutation.mutate(
      { data: { intervalMs: ms } },
      {
        onSuccess: (res) => {
          // Only persist once the server confirms the change.
          persistIntervalMs(res.intervalMs);
          toast({
            title: "Auto-Sync aktualisiert",
            description: `Intervall auf ${formatIntervalLabel(res.intervalMs)} gesetzt.`,
          });
          onIntervalChanged?.(res.intervalMs);
        },
        onError: () => {
          toast({
            title: "Fehler",
            description: "Intervall konnte nicht geändert werden.",
            variant: "destructive",
          });
        },
      },
    );
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          className="ml-auto text-sidebar-foreground/40 hover:text-sidebar-foreground/70 transition-colors"
          title="Sync-Einstellungen"
          aria-label="Sync-Einstellungen öffnen"
        >
          <Settings className="w-3.5 h-3.5" />
        </button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-xs">
        <DialogHeader>
          <DialogTitle>Auto-Sync Intervall</DialogTitle>
        </DialogHeader>
        <div className="py-2 space-y-4">
          <p className="text-sm text-muted-foreground">
            Wie oft soll die App automatisch mit Dropbox synchronisieren?
          </p>
          <Select
            value={selectedValue}
            onValueChange={handleSelect}
            disabled={setConfigMutation.isPending}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Intervall wählen" />
            </SelectTrigger>
            <SelectContent>
              {INTERVAL_OPTIONS.map((opt) => (
                <SelectItem key={opt.minutes} value={String(opt.minutes)}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            className="w-full"
            onClick={() => setOpen(false)}
          >
            Schließen
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
