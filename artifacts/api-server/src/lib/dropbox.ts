import { ReplitConnectors } from "@replit/connectors-sdk";
import { getStoragePaths, type StoragePaths } from "./storageSettings";
import { ownDropboxConnected, ownDropboxRequest } from "./ownDropbox";

const connectors = new ReplitConnectors();
export async function dropboxRequest(path: string, body: unknown, provider?: StoragePaths["provider"]): Promise<Response> {
  const active = provider ?? (await getStoragePaths()).provider;
  if (active === "own") return ownDropboxRequest(path, body);
  return connectors.proxy("dropbox", path, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
}

async function checked(response: Response): Promise<Response> {
  if (!response.ok) {
    // Never return/log upstream payloads: they can contain signed URLs or credentials.
    throw new Error(`Dropbox-Anfrage fehlgeschlagen (${response.status}). Verbindung, Berechtigungen und Dateipfad prüfen.`);
  }
  return response;
}

export async function downloadPlist(config?: StoragePaths): Promise<string> {
  const settings = config ?? await getStoragePaths();
  const response = await checked(await dropboxRequest("/2/files/get_temporary_link", { path: settings.importPath }, settings.provider));
  const { link } = await response.json() as { link: string };
  const file = await checked(await fetch(link, { signal: AbortSignal.timeout(30000) }));
  // Limit even streamed responses without Content-Length.
  if (!file.body) throw new Error("Dropbox-Datei ist leer.");
  const reader = file.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const part = await reader.read();
    if (part.done) break;
    length += part.value.length;
    if (length > 10_000_000) { await reader.cancel(); throw new Error("Die plist-Datei darf höchstens 10 MB groß sein."); }
    chunks.push(part.value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

export async function uploadPlist(content: string, config?: StoragePaths): Promise<void> {
  const settings = config ?? await getStoragePaths();
  const response = await checked(await dropboxRequest("/2/files/get_temporary_upload_link", {
    commit_info: { path: settings.exportPath, mode: "overwrite", autorename: false, mute: true },
    duration: 60,
  }, settings.provider));
  const { link } = await response.json() as { link: string };
  await checked(await fetch(link, {
    method: "POST", headers: { "Content-Type": "application/octet-stream" },
    body: content, signal: AbortSignal.timeout(30000),
  }));
}

export async function browseDropbox(path: string, cursor?: string) {
  const provider = await ownDropboxConnected() ? "own" : (await getStoragePaths()).provider;
  const response = await checked(await dropboxRequest(
    cursor ? "/2/files/list_folder/continue" : "/2/files/list_folder",
    cursor ? { cursor } : { path, recursive: false, limit: 200 }, provider,
  ));
  const data = await response.json() as {
    entries: { ".tag": string; name: string; path_display?: string; path_lower: string }[];
    cursor: string; has_more: boolean;
  };
  return {
    entries: data.entries.filter((item) => item[".tag"] === "folder" || item.name.toLowerCase().endsWith(".plist"))
      .map((item) => ({ name: item.name, path: item.path_display ?? item.path_lower, kind: item[".tag"] })),
    cursor: data.cursor, hasMore: data.has_more,
  };
}
