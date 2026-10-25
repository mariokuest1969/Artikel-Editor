import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useSaveStorageSettings, getGetStorageSettingsQueryKey, getGetMetaQueryKey } from "@workspace/api-client-react";
import type { StorageSettings, StoragePathsInput } from "@workspace/api-client-react";
import { FolderOpen, FileSearch, Save, AlertTriangle, HardDrive, Cloud } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { errorMessage } from "@/lib/errors";
import { Section } from "./section";
import { DropboxBrowser } from "./dropbox-browser";

function splitPath(p: string) {
  const i = p.lastIndexOf("/");
  return i < 0 ? { folder: "", file: p } : { folder: p.slice(0, i), file: p.slice(i + 1) };
}

function Choice({ active, onClick, title, text, icon, testId, disabled }: { active: boolean; onClick: () => void; title: string; text: string; icon: React.ReactNode; testId: string; disabled?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} data-testid={testId}
      className={`flex-1 rounded-lg border p-4 text-left transition-colors disabled:opacity-50 ${active ? "border-primary bg-primary/5 ring-1 ring-primary" : "bg-card hover:bg-accent"}`}>
      <div className="flex items-center gap-2 font-medium text-sm">{icon}{title}</div>
      <p className="mt-1 text-xs text-muted-foreground leading-relaxed">{text}</p>
    </button>
  );
}

export function StoragePaths({ settings, onSaved }: { settings: StorageSettings; onSaved: () => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const save = useSaveStorageSettings();
  const [form, setForm] = useState<StoragePathsInput>({ mode: settings.mode, provider: settings.provider, importPath: settings.importPath, exportPath: settings.exportPath });
  const init = useRef(false);
  useEffect(() => {
    if (init.current) return;
    init.current = true;
    setForm({ mode: settings.mode, provider: settings.provider, importPath: settings.importPath, exportPath: settings.exportPath });
  }, [settings]);
  const [picker, setPicker] = useState<null | "file" | "folder">(null);

  const exp = splitPath(form.exportPath);
  const dirty = form.mode !== settings.mode || form.provider !== settings.provider || form.importPath !== settings.importPath || form.exportPath !== settings.exportPath;
  const differ = form.importPath.trim() !== form.exportPath.trim();
  const set = (patch: Partial<StoragePathsInput>) => setForm((f) => ({ ...f, ...patch }));

  const submit = () => {
    if (form.mode === "dropbox" && (!form.importPath.trim() || !form.exportPath.trim())) {
      toast({ title: "Pfade fehlen", description: "Import- und Export-Pfad angeben.", variant: "destructive" });
      return;
    }
    save.mutate({ data: { ...form, importPath: form.importPath.trim(), exportPath: form.exportPath.trim() } }, {
      onSuccess: (s) => {
        qc.setQueryData(getGetStorageSettingsQueryKey(), s);
        qc.invalidateQueries({ queryKey: getGetMetaQueryKey() });
        onSaved();
        toast({ title: "Einstellungen gespeichert" });
      },
      onError: (e) => toast({ title: "Speichern fehlgeschlagen", description: errorMessage(e), variant: "destructive" }),
    });
  };

  return (
    <Section id="speicher" eyebrow="Ablage" title="Wo die aktive Artikelliste liegt"
      description="Änderungen hier werden erst mit „Speichern“ übernommen. Es wird dabei nichts importiert oder hochgeladen.">
      <div className="flex flex-col gap-3 sm:flex-row">
        <Choice active={form.mode === "dropbox"} onClick={() => set({ mode: "dropbox" })} testId="choice-mode-dropbox" icon={<Cloud className="h-4 w-4 text-primary" />}
          title="Dropbox" text="Liste wird aus Dropbox gelesen, Änderungen werden in die Export-Datei geschrieben." />
        <Choice active={form.mode === "local"} onClick={() => set({ mode: "local" })} testId="choice-mode-local" icon={<HardDrive className="h-4 w-4 text-primary" />}
          title="Lokal auf dem Server" text="Aktive Daten liegen auf dem Server. Bearbeitungen werden nicht nach Dropbox hochgeladen." />
      </div>

      <div className="rounded-lg border bg-card p-5 space-y-5">
        <div>
          <Label className="text-xs text-muted-foreground">Dropbox-Anbieter</Label>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row">
            <Choice active={form.provider === "connector"} onClick={() => set({ provider: "connector" })} testId="choice-provider-connector" icon={null}
              title="Replit-Verbindung" text="Die bestehende, bereits eingerichtete Verbindung." />
            <Choice active={form.provider === "own"} disabled={!settings.ownConnected} onClick={() => set({ provider: "own" })} testId="choice-provider-own" icon={null}
              title="Eigene Dropbox-App" text={settings.ownConnected ? "Über die oben verbundene App." : "Erst oben verbinden."} />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="import-path">Import-Datei</Label>
          <div className="flex gap-2">
            <Input id="import-path" className="font-mono text-xs" value={form.importPath} onChange={(e) => set({ importPath: e.target.value })} placeholder="/Kasse/artikelData.plist" data-testid="input-import-path" />
            <Button variant="outline" onClick={() => setPicker("file")} data-testid="button-pick-import"><FileSearch className="h-4 w-4 sm:mr-2" /><span className="hidden sm:inline">Wählen</span></Button>
          </div>
        </div>

        <div className="grid gap-2 sm:grid-cols-[1fr_200px]">
          <div className="space-y-1.5">
            <Label htmlFor="export-folder">Export-Ordner</Label>
            <div className="flex gap-2">
              <Input id="export-folder" className="font-mono text-xs" value={exp.folder} onChange={(e) => set({ exportPath: `${e.target.value}/${exp.file}` })} placeholder="/Kasse" data-testid="input-export-folder" />
              <Button variant="outline" onClick={() => setPicker("folder")} data-testid="button-pick-export"><FolderOpen className="h-4 w-4 sm:mr-2" /><span className="hidden sm:inline">Wählen</span></Button>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="export-file">Dateiname</Label>
            <Input id="export-file" className="font-mono text-xs" value={exp.file} onChange={(e) => set({ exportPath: `${exp.folder}/${e.target.value}` })} placeholder="artikelData.plist" data-testid="input-export-file" />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">Vollständiger Export-Pfad: <code className="font-mono" data-testid="text-export-path">{form.exportPath || "–"}</code></p>

        {differ && form.mode === "dropbox" && (
          <div className="flex gap-3 rounded-md bg-amber-50 p-3 text-xs text-amber-900 ring-1 ring-amber-200" data-testid="warning-paths-differ">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <p>Import- und Export-Pfad unterscheiden sich. Die automatische Synchronisierung wird deshalb pausiert, damit bearbeitete Daten nicht durch die ältere Quelldatei überschrieben werden. Ein manueller Import ist weiterhin unten möglich.</p>
          </div>
        )}

        <div className="flex items-center justify-between gap-3 border-t pt-4">
          <p className="text-xs text-muted-foreground">{dirty ? "Ungespeicherte Änderungen" : "Alles gespeichert"}</p>
          <Button onClick={submit} disabled={!dirty || save.isPending} data-testid="button-save-settings">
            <Save className="h-4 w-4 mr-2" />{save.isPending ? "Speichert …" : "Speichern"}
          </Button>
        </div>
      </div>
      <DropboxBrowser open={picker !== null} mode={picker ?? "file"} onOpenChange={(o) => !o && setPicker(null)}
        onSelect={(p) => (picker === "file" ? set({ importPath: p }) : set({ exportPath: `${p}/${exp.file || "artikelData.plist"}` }))} />
    </Section>
  );
}
