import { useEffect, useState } from "react";
import { useGetStorageSettings, getGetStorageSettingsQueryKey } from "@workspace/api-client-react";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { errorMessage } from "@/lib/errors";
import { DropboxConnection } from "@/components/settings/dropbox-connection";
import { StoragePaths } from "@/components/settings/storage-paths";
import { ImportPanel } from "@/components/settings/import-panel";
import { ExportPanel } from "@/components/settings/export-panel";

export default function SettingsPage() {
  const settings = useGetStorageSettings({ query: { queryKey: getGetStorageSettingsQueryKey() } });
  const [version, setVersion] = useState(0);
  const [oauth, setOauth] = useState<null | { ok: boolean; text: string }>(null);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const d = q.get("dropbox");
    if (!d) return;
    setOauth(d === "connected" ? { ok: true, text: "Eigene Dropbox erfolgreich verbunden. Als Anbieter auswählen und speichern, um sie zu nutzen." } : { ok: false, text: `Dropbox-Verbindung fehlgeschlagen${q.get("message") ? `: ${q.get("message")}` : "."}` });
    window.history.replaceState(null, "", window.location.pathname);
  }, []);

  return (
    <Layout>
      <header className="mb-8">
        <h2 className="text-3xl font-bold tracking-tight">Einstellungen</h2>
        <p className="mt-1 text-muted-foreground">Dateiablage, Dropbox-Verbindung sowie Import und Export der Artikelliste.</p>
      </header>
      {oauth && (
        <div data-testid="banner-oauth" className={`mb-6 flex gap-2 rounded-md p-3 text-sm ${oauth.ok ? "bg-emerald-50 text-emerald-900 ring-1 ring-emerald-200" : "bg-destructive/10 text-destructive"}`}>
          {oauth.ok ? <CheckCircle2 className="h-4 w-4 mt-0.5" /> : <AlertTriangle className="h-4 w-4 mt-0.5" />}{oauth.text}
        </div>
      )}
      {settings.isLoading && <div className="space-y-6">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-48 w-full" />)}</div>}
      {settings.isError && (
        <div className="rounded-lg border bg-card p-6 text-sm">
          <p className="font-medium text-destructive">Einstellungen konnten nicht geladen werden.</p>
          <p className="mt-1 text-muted-foreground">{errorMessage(settings.error)}</p>
          <Button className="mt-4" variant="outline" onClick={() => settings.refetch()} data-testid="button-retry-settings">Erneut versuchen</Button>
        </div>
      )}
      {settings.data && (
        <>
          <DropboxConnection settings={settings.data} />
          <StoragePaths settings={settings.data} onSaved={() => setVersion((v) => v + 1)} />
          <ImportPanel settingsVersion={version} importPath={settings.data.importPath} />
          <ExportPanel settings={settings.data} />
        </>
      )}
    </Layout>
  );
}
