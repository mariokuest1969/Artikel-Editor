import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { usePreviewImport, useConfirmImport, getListArticlesQueryKey, getGetMetaQueryKey } from "@workspace/api-client-react";
import type { ImportPreview, ImportInputSource } from "@workspace/api-client-react";
import { Upload, Cloud, Download, AlertTriangle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { errorMessage, exportDownloadUrl } from "@/lib/errors";
import { Section } from "./section";

const MAX = 10 * 1024 * 1024;
type Snapshot = { source: ImportInputSource; content?: string; label: string; preview: ImportPreview };

export function ImportPanel({ settingsVersion, importPath }: { settingsVersion: number; importPath: string }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const preview = usePreviewImport();
  const confirm = useConfirmImport();
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => { setSnap(null); }, [settingsVersion, importPath]);

  const runPreview = (source: ImportInputSource, label: string, content?: string) => {
    setSnap(null);
    preview.mutate({ data: content !== undefined ? { source, content } : { source } }, {
      onSuccess: (p) => setSnap(Object.freeze({ source, content, label, preview: p })),
    });
  };

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    setFileError(null);
    setSnap(null);
    if (!file) return;
    if (file.size > MAX) { setFileError("Die Datei ist größer als 10 MB."); return; }
    const text = await file.text();
    if (text.startsWith("bplist")) { setFileError("Binäre plist-Dateien werden nicht unterstützt. Bitte die Datei als XML-plist speichern."); return; }
    if (!text.trimStart().startsWith("<")) { setFileError("Die Datei ist keine XML-plist."); return; }
    runPreview("local", file.name, text);
  };

  const doConfirm = () => {
    if (!snap) return;
    confirm.mutate({ data: { source: snap.source, content: snap.content, token: snap.preview.token } }, {
      onSuccess: (r) => {
        setConfirmOpen(false);
        setSnap(null);
        qc.invalidateQueries({ queryKey: getListArticlesQueryKey() });
        qc.invalidateQueries({ queryKey: ["/api/articles"] });
        qc.invalidateQueries({ queryKey: getGetMetaQueryKey() });
        toast({ title: `${r.count} Artikel importiert`, description: r.message });
      },
      onError: (e) => toast({ title: "Import fehlgeschlagen", description: errorMessage(e), variant: "destructive" }),
    });
  };

  const p = snap?.preview;
  return (
    <Section id="import" eyebrow="Import" title="Neue Artikelliste einspielen"
      description="Zuerst wird nur eine Vorschau erstellt. Die aktive Liste ändert sich erst nach ausdrücklicher Bestätigung.">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex cursor-pointer flex-col gap-1 rounded-lg border bg-card p-4 hover:bg-accent" data-testid="label-import-local">
          <span className="flex items-center gap-2 text-sm font-medium"><Upload className="h-4 w-4 text-primary" />Datei vom Gerät</span>
          <span className="text-xs text-muted-foreground">XML-plist bis 10 MB. Je nach Browser und Gerät auch von USB-Sticks, externen Laufwerken oder eingebundenen Cloud-Ordnern.</span>
          <input type="file" accept=".plist,.xml" className="sr-only" onChange={onFile} disabled={preview.isPending} data-testid="input-import-file" />
        </label>
        <button type="button" disabled={preview.isPending} onClick={() => runPreview("dropbox", importPath || "Dropbox")} data-testid="button-preview-dropbox"
          className="flex flex-col gap-1 rounded-lg border bg-card p-4 text-left hover:bg-accent disabled:opacity-50">
          <span className="flex items-center gap-2 text-sm font-medium"><Cloud className="h-4 w-4 text-primary" />Aus Dropbox</span>
          <span className="text-xs text-muted-foreground break-all">Liest <code className="font-mono">{importPath || "den gespeicherten Import-Pfad"}</code></span>
        </button>
      </div>

      {preview.isPending && <p className="text-sm text-muted-foreground" data-testid="status-preview-pending">Vorschau wird erstellt …</p>}
      {(fileError || preview.isError) && (
        <div className="flex gap-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive" data-testid="error-preview">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />{fileError ?? errorMessage(preview.error, "Vorschau fehlgeschlagen.")}
        </div>
      )}

      {snap && p && (
        <div className="rounded-lg border bg-card" data-testid="card-import-preview">
          <div className="flex items-start justify-between gap-3 border-b p-4">
            <div>
              <p className="text-xs text-muted-foreground">Vorschau aus {snap.source === "local" ? "lokaler Datei" : "Dropbox"}</p>
              <p className="font-medium break-all">{snap.label}</p>
            </div>
            <Button variant="ghost" size="icon" onClick={() => setSnap(null)} data-testid="button-discard-preview" aria-label="Vorschau verwerfen"><X className="h-4 w-4" /></Button>
          </div>
          <div className="grid grid-cols-2 divide-x border-b text-center">
            <div className="p-4"><p className="text-2xl font-semibold tabular-nums" data-testid="text-preview-count">{p.count}</p><p className="text-xs text-muted-foreground">Artikel in der Datei</p></div>
            <div className="p-4"><p className="text-2xl font-semibold tabular-nums text-muted-foreground" data-testid="text-current-count">{p.currentCount}</p><p className="text-xs text-muted-foreground">aktuell aktiv</p></div>
          </div>
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs text-muted-foreground"><th className="px-4 py-2">Nr.</th><th className="px-4 py-2">Artikel</th><th className="px-4 py-2 text-right">Preis</th></tr></thead>
            <tbody>
              {p.sample.map((s) => (
                <tr key={s.ArtikelId} className="border-t"><td className="px-4 py-2 font-mono text-xs">{s.ArtikelId}</td><td className="px-4 py-2">{s.Artikel}</td><td className="px-4 py-2 text-right font-mono tabular-nums">{s.Preis}</td></tr>
              ))}
            </tbody>
          </table>
          <div className="space-y-3 border-t p-4">
            <p className="text-xs text-muted-foreground">Nach dem Import werden Änderungen {p.destination ? <>in <code className="font-mono break-all" data-testid="text-preview-destination">{p.destination}</code> geschrieben</> : "nur lokal auf dem Server gespeichert"}.</p>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" asChild data-testid="button-backup-before-import">
                <a href={exportDownloadUrl()} download><Download className="h-4 w-4 mr-2" />Erst Sicherung herunterladen</a>
              </Button>
              <Button variant="destructive" onClick={() => setConfirmOpen(true)} data-testid="button-open-confirm-import">Aktive Liste ersetzen …</Button>
            </div>
          </div>
        </div>
      )}

      <AlertDialog open={confirmOpen} onOpenChange={(o) => !confirm.isPending && setConfirmOpen(o)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Gesamte Artikelliste ersetzen?</AlertDialogTitle>
            <AlertDialogDescription>
              Die {p?.currentCount ?? 0} aktiven Artikel werden vollständig durch {p?.count ?? 0} Artikel aus „{snap?.label}“ ersetzt, inklusive aller Preise.
              {p?.destination ? ` Die Dropbox-Datei ${p.destination} wird dabei überschrieben.` : " Es wird nichts nach Dropbox hochgeladen."} Dies lässt sich nur mit einer vorher heruntergeladenen Sicherung rückgängig machen.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={confirm.isPending} data-testid="button-cancel-import">Abbrechen</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); doConfirm(); }} disabled={confirm.isPending} className="bg-destructive text-destructive-foreground hover:bg-destructive/90" data-testid="button-confirm-import">
              {confirm.isPending ? "Importiert …" : "Ja, ersetzen"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Section>
  );
}
