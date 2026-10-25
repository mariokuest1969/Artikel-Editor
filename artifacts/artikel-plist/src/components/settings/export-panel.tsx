import { useState } from "react";
import { useExportToDropbox } from "@workspace/api-client-react";
import type { StorageSettings } from "@workspace/api-client-react";
import { Download, CloudUpload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { errorMessage, exportDownloadUrl } from "@/lib/errors";
import { Section } from "./section";

export function ExportPanel({ settings }: { settings: StorageSettings }) {
  const { toast } = useToast();
  const exp = useExportToDropbox();
  const [open, setOpen] = useState(false);
  return (
    <Section id="export" eyebrow="Export" title="Artikelliste sichern oder weitergeben"
      description="Beides liest nur die aktive Liste. Die Artikel selbst werden nicht verändert.">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border bg-card p-4 space-y-3">
          <p className="flex items-center gap-2 text-sm font-medium"><Download className="h-4 w-4 text-primary" />Herunterladen</p>
          <p className="text-xs text-muted-foreground leading-relaxed">Lädt die aktive Liste als .plist herunter. Über „Speichern unter“ im Browser lässt sich das Ziel wählen: lokaler Ordner, USB-Stick, externes Laufwerk oder ein eingebundener Cloud-Ordner.</p>
          <Button variant="outline" asChild data-testid="button-download-export"><a href={exportDownloadUrl()} download>Als .plist herunterladen</a></Button>
        </div>
        <div className="rounded-lg border bg-card p-4 space-y-3">
          <p className="flex items-center gap-2 text-sm font-medium"><CloudUpload className="h-4 w-4 text-primary" />Nach Dropbox schreiben</p>
          <p className="text-xs text-muted-foreground leading-relaxed break-all">Schreibt nach <code className="font-mono">{settings.exportPath || "–"}</code>. Funktioniert auch im lokalen Modus, setzt aber eine Dropbox-Verbindung voraus.</p>
          <Button onClick={() => setOpen(true)} disabled={!settings.exportPath || exp.isPending} data-testid="button-open-export-dropbox">{exp.isPending ? "Schreibt …" : "Nach Dropbox exportieren …"}</Button>
        </div>
      </div>
      <AlertDialog open={open} onOpenChange={(o) => !exp.isPending && setOpen(o)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Datei in Dropbox überschreiben?</AlertDialogTitle>
            <AlertDialogDescription>Eine vorhandene Datei unter {settings.exportPath} wird durch die aktive Artikelliste ersetzt. Die Kasse liest danach diese Version.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={exp.isPending} data-testid="button-cancel-export">Abbrechen</AlertDialogCancel>
            <AlertDialogAction disabled={exp.isPending} data-testid="button-confirm-export" onClick={(e) => {
              e.preventDefault();
              exp.mutate(undefined, {
                onSuccess: (r) => { setOpen(false); toast({ title: `${r.count} Artikel exportiert`, description: r.message }); },
                onError: (er) => toast({ title: "Export fehlgeschlagen", description: errorMessage(er), variant: "destructive" }),
              });
            }}>{exp.isPending ? "Schreibt …" : "Überschreiben"}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Section>
  );
}
