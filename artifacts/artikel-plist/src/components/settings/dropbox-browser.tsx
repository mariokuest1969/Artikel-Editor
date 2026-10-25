import { useEffect, useState } from "react";
import { useBrowseDropbox, getBrowseDropboxQueryKey } from "@workspace/api-client-react";
import type { BrowseDropbox200EntriesItem } from "@workspace/api-client-react";
import { Folder, FileText, ChevronUp, Home, AlertTriangle } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { errorMessage } from "@/lib/errors";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "file" | "folder";
  onSelect: (path: string) => void;
};

function parentOf(path: string) {
  const idx = path.lastIndexOf("/");
  return idx <= 0 ? "" : path.slice(0, idx);
}

export function DropboxBrowser({ open, onOpenChange, mode, onSelect }: Props) {
  const [path, setPath] = useState("");
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [entries, setEntries] = useState<BrowseDropbox200EntriesItem[]>([]);
  const params = cursor ? { path, cursor } : { path };
  const browse = useBrowseDropbox(params, {
    query: { queryKey: getBrowseDropboxQueryKey(params), enabled: open, staleTime: 30_000 },
  });

  useEffect(() => {
    if (!browse.data) return;
    const page = browse.data.entries;
    setEntries((prev) => (cursor ? [...prev, ...page.filter((e) => !prev.some((p) => p.path === e.path))] : page));
  }, [browse.data, cursor]);

  const go = (p: string) => { setEntries([]); setCursor(undefined); setPath(p); };
  const sorted = [...entries].sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name, "de") : a.kind === "folder" ? -1 : 1));
  const firstLoad = browse.isLoading && entries.length === 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{mode === "file" ? "Import-Datei in Dropbox wählen" : "Export-Ordner in Dropbox wählen"}</DialogTitle>
          <DialogDescription>
            {mode === "file" ? "Eine .plist-Datei anklicken." : "Ordner öffnen und mit „Diesen Ordner verwenden“ bestätigen."} Bei App-Ordner-Apps entspricht „/“ dem freigegebenen App-Ordner.
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-2 rounded-md bg-muted px-3 py-2 text-sm">
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => go("")} disabled={!path} data-testid="button-browse-root" aria-label="Wurzel"><Home className="h-4 w-4" /></Button>
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => go(parentOf(path))} disabled={!path} data-testid="button-browse-up" aria-label="Übergeordneter Ordner"><ChevronUp className="h-4 w-4" /></Button>
          <code className="truncate font-mono text-xs" data-testid="text-browse-path">{path || "/"}</code>
        </div>
        <div className="max-h-80 min-h-40 overflow-auto rounded-md border">
          {firstLoad && <div className="space-y-2 p-3">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-8 w-full" />)}</div>}
          {browse.isError && (
            <div className="flex flex-col items-start gap-2 p-4 text-sm text-destructive">
              <span className="flex items-center gap-2"><AlertTriangle className="h-4 w-4" />{errorMessage(browse.error, "Ordner konnte nicht geladen werden.")}</span>
              <Button size="sm" variant="outline" onClick={() => browse.refetch()} data-testid="button-browse-retry">Erneut versuchen</Button>
            </div>
          )}
          {!firstLoad && !browse.isError && sorted.length === 0 && <p className="p-6 text-center text-sm text-muted-foreground">Dieser Ordner ist leer.</p>}
          <ul>
            {sorted.map((e) => {
              const plist = /\.(plist|xml)$/i.test(e.name);
              const clickable = e.kind === "folder" || (mode === "file" && plist);
              return (
                <li key={e.path}>
                  <button type="button" disabled={!clickable} data-testid={`browse-entry-${e.name}`}
                    onClick={() => (e.kind === "folder" ? go(e.path) : (onSelect(e.path), onOpenChange(false)))}
                    className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-accent disabled:opacity-40 disabled:hover:bg-transparent">
                    {e.kind === "folder" ? <Folder className="h-4 w-4 text-primary" /> : <FileText className="h-4 w-4 text-muted-foreground" />}
                    <span className="truncate">{e.name}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          {browse.data?.hasMore && entries.length > 0 && (
            <div className="border-t p-2">
              <Button variant="ghost" size="sm" className="w-full" disabled={browse.isFetching} onClick={() => setCursor(browse.data?.cursor)} data-testid="button-browse-more">
                {browse.isFetching ? "Lädt …" : "Weitere laden"}
              </Button>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="button-browse-cancel">Abbrechen</Button>
          {mode === "folder" && (
            <Button onClick={() => { onSelect(path); onOpenChange(false); }} data-testid="button-browse-use-folder">Diesen Ordner verwenden</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
