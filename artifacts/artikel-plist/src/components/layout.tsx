import { Link, useLocation } from "wouter";
import { format, formatDistanceToNow } from "date-fns";
import { de } from "date-fns/locale";
import { RefreshCw, LayoutDashboard, Plus, Download, AlertTriangle, Clock } from "lucide-react";
import { useGetMeta, useSyncFromDropbox, getGetMetaQueryKey, getListArticlesQueryKey } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  // Poll every 60 seconds so the UI picks up background auto-sync changes
  // within a minute of them landing on the server.
  const { data: meta } = useGetMeta({
    query: {
      queryKey: getGetMetaQueryKey(),
      refetchInterval: 60_000,
    },
  });
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

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Sidebar */}
      <div className="w-64 border-r bg-sidebar flex flex-col">
        <div className="p-6">
          <h1 className="text-xl font-bold text-sidebar-foreground tracking-tight">Artikel-Plist</h1>
          <p className="text-sm text-sidebar-foreground/60 mt-1">POS Management</p>
        </div>
        
        <nav className="flex-1 px-4 space-y-1">
          <Link href="/" className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${location === "/" ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium" : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"}`}>
            <LayoutDashboard className="w-4 h-4" />
            <span>Articles List</span>
          </Link>
          <Link href="/artikel/neu" className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${location === "/artikel/neu" ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium" : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"}`}>
            <Plus className="w-4 h-4" />
            <span>New Article</span>
          </Link>
        </nav>

        <div className="p-4 border-t border-sidebar-border space-y-4">
          <div className="bg-sidebar-accent/30 rounded-lg p-3">
            <p className="text-xs font-medium text-sidebar-foreground/70 mb-1">Dropbox Sync</p>

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
              <a href="/api/export" download>
                <Download className="w-3 h-3 mr-2" />
                Als .plist exportieren
              </a>
            </Button>
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
