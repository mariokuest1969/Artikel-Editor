import { Router } from "express";
import { getAuth } from "@clerk/express";
import { createHash } from "node:crypto";
import { SaveStorageSettingsBody, PreviewImportBody, ConfirmImportBody } from "@workspace/api-zod";
import { getStoragePaths, writeState, validatePlistPath, seal, unseal } from "../lib/storageSettings";
import { beginDropboxAuth, completeDropboxAuth, disconnectDropbox, ownDropboxConnected } from "../lib/ownDropbox";
import { browseDropbox, downloadPlist, uploadPlist } from "../lib/dropbox";
import { exportPlist, validateImport, replaceArticles, countStoredArticles } from "../lib/articleStore";
import { withStorageLock } from "../lib/storageLock";
import { requestOrigin } from "../middlewares/access";

const router = Router();
const digest = (value: string) => createHash("sha256").update(value).digest("hex");
const status = async (origin: string) => ({
  ...await getStoragePaths(),
  appKeyConfigured: Boolean(process.env.DROPBOX_APP_KEY),
  appSecretConfigured: Boolean(process.env.DROPBOX_APP_SECRET),
  ownConnected: await ownDropboxConnected(),
  redirectUri: `${origin}/api/settings/dropbox/callback`,
});

router.get("/settings", async (req, res) => { res.json(await status(requestOrigin(req))); });
router.put("/settings", async (req, res) => {
  try {
    const settings = SaveStorageSettingsBody.parse(req.body);
    settings.importPath = validatePlistPath(settings.importPath);
    settings.exportPath = validatePlistPath(settings.exportPath);
    if (settings.provider === "own" && !await ownDropboxConnected()) throw new Error("Bitte zuerst die eigene Dropbox-App verbinden.");
    await withStorageLock(async () => {
      // Preserve currently active data when switching to local storage.
      await exportPlist();
      await writeState("paths", settings);
    });
    res.json(await status(requestOrigin(req)));
  } catch (error) { res.status(400).json({ message: error instanceof Error ? error.message : "Einstellungen konnten nicht gespeichert werden." }); }
});

router.post("/settings/dropbox/connect", async (req, res) => {
  try { res.json({ url: await beginDropboxAuth(getAuth(req).userId!, `${requestOrigin(req)}/api/settings/dropbox/callback`) }); }
  catch { res.status(400).json({ message: "Dropbox-Anmeldung konnte nicht gestartet werden. App Key und App Secret prüfen." }); }
});
router.get("/settings/dropbox/callback", async (req, res) => {
  try {
    if (typeof req.query.state !== "string" || typeof req.query.code !== "string") throw new Error("Cancelled");
    await completeDropboxAuth(getAuth(req).userId!, req.query.state, req.query.code);
    res.redirect("/einstellungen?dropbox=connected");
  } catch { res.redirect("/einstellungen?dropbox=error"); }
});
router.post("/settings/dropbox/disconnect", async (req, res) => {
  await withStorageLock(async () => {
    const settings = await getStoragePaths();
    // Do not silently switch back to another account; retain data locally.
    if (settings.provider === "own") await writeState("paths", { ...settings, mode: "local", provider: "connector" });
    await disconnectDropbox();
  });
  res.json(await status(requestOrigin(req)));
});
router.get("/settings/dropbox/browse", async (req, res) => {
  try {
    const path = typeof req.query.path === "string" ? req.query.path : "";
    const cursor = typeof req.query.cursor === "string" ? req.query.cursor : undefined;
    if (path && !path.startsWith("/")) throw new Error("Ungültiger Ordner.");
    res.json(await browseDropbox(path, cursor));
  } catch (error) { res.status(400).json({ message: error instanceof Error ? error.message : "Ordner konnten nicht geladen werden." }); }
});

async function importContent(input: { source: "local" | "dropbox"; content?: string }) {
  if (input.source === "dropbox") return downloadPlist();
  if (!input.content) throw new Error("Bitte eine XML-plist-Datei auswählen.");
  return input.content;
}
interface Confirmation { userId: string; rawHash: string; currentHash: string; pathsHash: string; expires: number; }
router.post("/transfer/preview", async (req, res) => {
  try {
    const input = PreviewImportBody.parse(req.body);
    const raw = await importContent(input);
    const items = validateImport(raw);
    const current = await exportPlist();
    const paths = await getStoragePaths();
    res.json({
      count: items.length, currentCount: countStoredArticles(current),
      destination: paths.mode === "local" ? "Lokaler Arbeitsbestand der App (serverseitig gespeichert)" : paths.exportPath,
      sample: items.slice(0, 10).map((item) => ({ ArtikelId: item.ArtikelId, Artikel: item.Artikel, Preis: item.Preis ?? "" })),
      token: seal({ userId: getAuth(req).userId, rawHash: digest(raw), currentHash: digest(current), pathsHash: digest(JSON.stringify(paths)), expires: Date.now() + 600000 }),
    });
  } catch (error) { res.status(400).json({ message: error instanceof Error ? error.message : "Importdatei ist ungültig." }); }
});
router.post("/transfer/import", async (req, res) => {
  try {
    const input = ConfirmImportBody.parse(req.body);
    const confirmation = unseal<Confirmation>(input.token);
    if (confirmation.userId !== getAuth(req).userId || confirmation.expires < Date.now()) throw new Error("Importvorschau abgelaufen. Bitte erneut prüfen.");
    const count = await withStorageLock(async () => {
      const raw = await importContent(input);
      const paths = await getStoragePaths();
      if (confirmation.rawHash !== digest(raw) || confirmation.currentHash !== digest(await exportPlist()) ||
          confirmation.pathsHash !== digest(JSON.stringify(paths))) throw new Error("Daten oder Einstellungen haben sich geändert. Bitte eine neue Vorschau erstellen.");
      const items = validateImport(raw);
      await replaceArticles(items);
      return items.length;
    });
    res.json({ count, message: `${count} Artikel erfolgreich importiert.` });
  } catch (error) { res.status(400).json({ message: error instanceof Error ? error.message : "Import fehlgeschlagen." }); }
});
router.post("/transfer/export", async (_req, res) => {
  try {
    const count = await withStorageLock(async () => {
      const raw = await exportPlist();
      await uploadPlist(raw);
      return countStoredArticles(raw);
    });
    res.json({ count, message: "Datei im eingestellten Dropbox-Exportpfad gespeichert." });
  } catch (error) { res.status(400).json({ message: error instanceof Error ? error.message : "Export fehlgeschlagen." }); }
});

export default router;
