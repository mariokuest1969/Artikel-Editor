import { Link, useLocation } from "wouter";
import { formatDistanceToNow } from "date-fns";
import { de } from "date-fns/locale";
import { Settings, LogOut, RefreshCw, LayoutDashboard, Plus, Download, AlertTriangle, Clock, Timer } from "lucide-react";
import { useGetMeta, useSyncFromDropbox, getGetMetaQueryKey, getListArticlesQueryKey } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { ToastAction } from "@/components/ui/toast";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { SyncSettingsDialog, formatIntervalLabel } from "@/components/sync-settings-dialog";
import { useGetSyncConfig, getGetSyncConfigQueryKey } from "@workspace/api-client-react";
import { useRef, useEffect } from "react";
import { useClerk, useUser } from "@clerk/react";

const layoutBasePath = import.meta.env.BASE_URL.replace(/\/$/, "");

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { signOut } = useClerk();
  const { user } = useUser();
  const queryClientForLogout = useQueryClient();
  // Poll every 30 seconds so the UI picks up background auto-sync changes quickly.
  const { data: meta } = useGetMeta({
    query: {
      queryKey: getGetMetaQueryKey(),
      refetchInterval: 30_000,
    },
  });
  const { data: syncConfig, refetch: refetchSyncConfig } = useGetSyncConfig();
  const syncMutation = useSyncFromDropbox();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const handleSync = () => {
    syncMutation.mutate(undefined, {
      onSuccess: () => {
        toast({ title: "Sync successful", description: "Article data has been updated from Dropbox." });
        queryClient.invalidateQueries({ queryKey: getGetMetaQueryKey() });
        queryClient.invalidateQueries({ queryKey: getListArticlesQueryKey() });
      },
      onError: () => {
        toast({ title: "Sync failed", description: "There was an error synchronizing from Dropbox.", variant: "destructive" });
      }
    });
  };

  // prevErrorRef is initialized to `undefined` (sentinel: "not yet seen a real response").
  // On the first successful meta fetch we silently record whatever error state already exists
  // without toasting — the user may be loading the page into a pre-existing error and the
  // sidebar already shows it. Only subsequent null→error transitions trigger a toast.
  const prevErrorRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    // meta is undefined while the first request is still in flight; skip those renders.
    if (meta === undefined) return;

    const currentError = meta.letzteSynchronisierungFehler ?? null;
    const prevError = prevErrorRef.current;

    if (prevError === undefined) {
      // First successful response — seed the baseline silently, no toast.
      prevErrorRef.current = currentError;
      return;
    }

    // Toast only when a subsequent poll reveals a new error (previous poll was clean).
    if (!prevError && currentError) {
      toast({
        title: "Auto-Sync fehlgeschlagen",
        description: currentError,
        variant: "destructive",
        action: (
          <ToastAction altText="Jetzt synchronisieren" onClick={handleSync}>
            Jetzt synchronisieren
          </ToastAction>
        ),
      });
    }

    prevErrorRef.current = currentError;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meta]);

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Sidebar */}
      <div className="w-64 border-r bg-sidebar flex flex-col">
        <div className="p-6">
          <h1 className="text-xl font-bold text-sidebar-foreground tracking-tight">Artikel-Plist</h1>
          <p className="text-sm text-sidebar-foreground/60 mt-1">POS Management</p>
        </div>
        
        <nav className="flex-1 px-4 space-y-1">
          <Link href="/artikel" className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${location === "/artikel" ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium" : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"}`}>
            <LayoutDashboard className="w-4 h-4" />
            <span>Artikelliste</span>
          </Link>
          <Link href="/artikel/neu" className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${location === "/artikel/neu" ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium" : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"}`}>
            <Plus className="w-4 h-4" />
            <span>Neuer Artikel</span>
          </Link>
          <Link href="/einstellungen" data-testid="link-settings" className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${location === "/einstellungen" ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium" : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"}`}>
            <Settings className="w-4 h-4" />
            <span>Einstellungen</span>
          </Link>
        </nav>

        <div className="p-4 border-t border-sidebar-border space-y-4">
          <div className="bg-sidebar-accent/30 rounded-lg p-3">
            {/* Header row: label + settings gear */}
            <div className="flex items-center mb-1">
              <p className="text-xs font-medium text-sidebar-foreground/70">Dropbox Sync</p>
              <SyncSettingsDialog
                onIntervalChanged={() => refetchSyncConfig()}
              />
            </div>

            {/* Auto-sync interval indicator */}
            <div className="flex items-center gap-1 mb-2">
              <Timer className="w-3 h-3 text-sidebar-foreground/40" />
              <p className="text-xs text-sidebar-foreground/50">
                {syncConfig ? formatIntervalLabel(syncConfig.intervalMs) : "Auto-Sync: alle 5 Minuten"}
              </p>
            </div>

            {/* Sync error banner */}
            {meta?.letzteSynchronisierungFehler && (
              <div className="flex items-start gap-1.5 mb-2 p-2 rounded bg-destructive/10 text-destructive">
                <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
                <p className="text-xs leading-tight break-words">
                  Auto-Sync fehlgeschlagen: {meta.letzteSynchronisierungFehler}
                </p>
              </div>
            )}

            {/* Last sync time */}
            <div className="flex items-center gap-1 mb-3">
              <Clock className="w-3 h-3 text-sidebar-foreground/50" />
              <p className="text-xs text-sidebar-foreground/70">
                {meta?.letzteSynchronisierung
                  ? formatDistanceToNow(new Date(meta.letzteSynchronisierung), { addSuffix: true, locale: de })
                  : "Unbekannt"}
              </p>
            </div>

            <Button 
              variant="secondary" 
              className="w-full h-8 text-xs bg-sidebar-primary text-sidebar-primary-foreground hover:bg-sidebar-primary/90" 
              onClick={handleSync}
              disabled={syncMutation.isPending}
              data-testid="button-sync"
            >
              <RefreshCw className={`w-3 h-3 mr-2 ${syncMutation.isPending ? "animate-spin" : ""}`} />
              Jetzt synchronisieren
            </Button>
            <Button
              variant="outline"
              asChild
              className="w-full h-8 text-xs mt-2"
              data-testid="button-export"
            >
              <a href={`${window.location.origin}/api/export`} download>
                <Download className="w-3 h-3 mr-2" />
                Als .plist exportieren
              </a>
            </Button>
          </div>
          <div className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5">
            <p className="text-xs text-sidebar-foreground/60 truncate" data-testid="text-user-email">
              {user?.primaryEmailAddress?.emailAddress ?? "Angemeldet"}
            </p>
            <button
              type="button"
              data-testid="button-logout"
              onClick={() => { queryClientForLogout.clear(); void signOut({ redirectUrl: layoutBasePath || "/" }); }}
              className="flex items-center gap-1 text-xs text-sidebar-foreground/70 hover:text-sidebar-foreground"
            >
              <LogOut className="w-3 h-3" /> Abmelden
            </button>
          </div>
          <div className="text-xs text-sidebar-foreground/50 text-center">
            {meta?.gesamtAnzahl ? `${meta.gesamtAnzahl} Artikel gesamt` : ""}
          </div>
        </div>
      </div>

      {/* Main content */}
      <main className="flex-1 flex flex-col h-full overflow-hidden bg-background">
        <div className="flex-1 overflow-auto p-8">
          <div className="max-w-7xl mx-auto">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
