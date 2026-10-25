import { useQueryClient } from "@tanstack/react-query";
import { useConnectOwnDropbox, useDisconnectOwnDropbox, getGetStorageSettingsQueryKey } from "@workspace/api-client-react";
import type { StorageSettings } from "@workspace/api-client-react";
import { Copy, Link2, Unlink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { errorMessage } from "@/lib/errors";
import { Section, StatusPill } from "./section";

export function DropboxConnection({ settings }: { settings: StorageSettings }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const connect = useConnectOwnDropbox();
  const disconnect = useDisconnectOwnDropbox();
  const keysReady = settings.appKeyConfigured && settings.appSecretConfigured;

  const copy = async () => {
    try { await navigator.clipboard.writeText(settings.redirectUri); toast({ title: "Redirect-URI kopiert" }); }
    catch { toast({ title: "Kopieren nicht möglich", description: "Bitte die Adresse manuell markieren.", variant: "destructive" }); }
  };

  return (
    <Section id="dropbox" eyebrow="Verbindung" title="Eigene Dropbox-App"
      description={<>Optional. Bis die eigene App unten als Anbieter gewählt ist, bleibt die bestehende Dropbox-Verbindung von Replit aktiv.</>}>
      <div className="rounded-lg border bg-card p-5 space-y-4">
        <div className="flex flex-wrap gap-2">
          <StatusPill ok={settings.appKeyConfigured} okText="App-Key hinterlegt" badText="App-Key fehlt" testId="status-app-key" />
          <StatusPill ok={settings.appSecretConfigured} okText="App-Secret hinterlegt" badText="App-Secret fehlt" testId="status-app-secret" />
          <StatusPill ok={settings.ownConnected} okText="Eigene Dropbox verbunden" badText="Nicht verbunden" testId="status-own-connected" />
        </div>
        <p className="text-sm text-muted-foreground">
          App-Key und App-Secret werden nie hier eingegeben oder angezeigt. Sie liegen in den Replit-Secrets und sind bereits hinterlegt, wenn oben „hinterlegt“ steht. Änderungen nur dort vornehmen.
        </p>
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-1.5">Redirect-URI</p>
          <div className="flex gap-2">
            <code className="flex-1 truncate rounded-md border bg-muted px-3 py-2 font-mono text-xs" data-testid="text-redirect-uri">{settings.redirectUri}</code>
            <Button variant="outline" size="sm" onClick={copy} data-testid="button-copy-redirect"><Copy className="h-3.5 w-3.5 mr-1.5" />Kopieren</Button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground leading-relaxed">
            Diese Adresse muss in der Dropbox-Developer-Console unter „OAuth 2 · Redirect URIs“ eingetragen sein. Benötigte Berechtigungen: <code className="font-mono">files.metadata.read</code>, <code className="font-mono">files.content.read</code>, <code className="font-mono">files.content.write</code>. Bei App-Ordner-Apps beziehen sich alle Pfade auf den App-Ordner selbst, also ohne „/Apps/…“-Präfix.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 pt-1">
          <Button disabled={!keysReady || connect.isPending} data-testid="button-connect-dropbox"
            onClick={() => connect.mutate(undefined, {
              onSuccess: (r) => window.location.assign(r.url),
              onError: (e) => toast({ title: "Verbindung fehlgeschlagen", description: errorMessage(e), variant: "destructive" }),
            })}>
            <Link2 className="h-4 w-4 mr-2" />{settings.ownConnected ? "Neu verbinden" : "Mit Dropbox verbinden"}
          </Button>
          {settings.ownConnected && (
            <Button variant="outline" disabled={disconnect.isPending} data-testid="button-disconnect-dropbox"
              onClick={() => disconnect.mutate(undefined, {
                onSuccess: (s) => { qc.setQueryData(getGetStorageSettingsQueryKey(), s); toast({ title: "Eigene Dropbox getrennt" }); },
                onError: (e) => toast({ title: "Trennen fehlgeschlagen", description: errorMessage(e), variant: "destructive" }),
              })}>
              <Unlink className="h-4 w-4 mr-2" />Trennen
            </Button>
          )}
        </div>
        {!keysReady && <p className="text-xs text-amber-800">Verbinden ist erst möglich, wenn App-Key und App-Secret in den Replit-Secrets hinterlegt sind.</p>}
      </div>
    </Section>
  );
}
