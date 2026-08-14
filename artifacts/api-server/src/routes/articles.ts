import { Router, type IRouter } from "express";
import {
  ListArticlesQueryParams,
  CreateArticleBody,
  GetArticleParams,
  UpdateArticleParams,
  UpdateArticleBody,
  DeleteArticleParams,
  GetMetaResponse,
  SyncFromDropboxResponse,
  SetSyncConfigBody,
} from "@workspace/api-zod";
import {
  listArticles,
  getArticleById,
  createArticle,
  updateArticle,
  deleteArticle,
  getMeta,
  syncFromDropbox,
  exportPlist,
  getAutoSyncInterval,
  setAutoSyncInterval,
} from "../lib/articleStore";
import { logger } from "../lib/logger";

const router: IRouter = Router();

router.get("/articles", async (req, res) => {
  try {
    const query = ListArticlesQueryParams.parse(req.query);
    const result = await listArticles(query);
    res.json(result);
  } catch (err) {
    logger.error({ err }, "Failed to list articles");
    res.status(400).json({ message: "Ungültige Anfrageparameter" });
  }
});

router.post("/articles", async (req, res) => {
  try {
    const body = CreateArticleBody.partial({ ArtikelId: true }).parse(req.body);
    const article = await createArticle(body);
    res.status(201).json(article);
  } catch (err) {
    logger.error({ err }, "Failed to create article");
    res.status(400).json({ message: (err as Error).message ?? "Anlegen fehlgeschlagen" });
  }
});

router.get("/articles/:id", async (req, res) => {
  const { id } = GetArticleParams.parse(req.params);
  const article = await getArticleById(id);
  if (!article) {
    res.status(404).json({ message: "Artikel nicht gefunden" });
    return;
  }
  res.json(article);
});

router.put("/articles/:id", async (req, res) => {
  try {
    const { id } = UpdateArticleParams.parse(req.params);
    const body = UpdateArticleBody.partial({ ArtikelId: true, Artikel: true }).parse(req.body);
    const article = await updateArticle(id, body);
    if (!article) {
      res.status(404).json({ message: "Artikel nicht gefunden" });
      return;
    }
    res.json(article);
  } catch (err) {
    logger.error({ err }, "Failed to update article");
    res.status(400).json({ message: (err as Error).message ?? "Aktualisierung fehlgeschlagen" });
  }
});

router.delete("/articles/:id", async (req, res) => {
  const { id } = DeleteArticleParams.parse(req.params);
  const success = await deleteArticle(id);
  if (!success) {
    res.status(404).json({ message: "Artikel nicht gefunden" });
    return;
  }
  res.json({ success: true, id });
});

router.get("/meta", async (_req, res) => {
  const meta = await getMeta();
  res.json(GetMetaResponse.parse(meta));
});

router.post("/sync", async (_req, res) => {
  try {
    const meta = await syncFromDropbox();
    res.json(SyncFromDropboxResponse.parse(meta));
  } catch (err) {
    logger.error({ err }, "Failed to sync from Dropbox");
    res.status(500).json({ message: "Synchronisierung fehlgeschlagen" });
  }
});

router.get("/sync-config", (_req, res) => {
  res.json({ intervalMs: getAutoSyncInterval() });
});

router.put("/sync-config", (req, res) => {
  try {
    const { intervalMs } = SetSyncConfigBody.parse(req.body);
    setAutoSyncInterval(intervalMs);
    res.json({ intervalMs: getAutoSyncInterval() });
  } catch (err) {
    logger.error({ err }, "Invalid sync-config body");
    res.status(400).json({ message: "Ungültige Konfiguration" });
  }
});

// Not part of the OpenAPI/Zod contract on purpose: this is a raw file
// download (browser "Save As" flow), not a JSON API response. The frontend
// links to this URL directly instead of using a generated hook, so the user
// can save an exported copy of the plist (e.g. to a different folder / their
// iPad's Files app) independent of the live Dropbox sync file.
router.get("/export", async (_req, res) => {
  try {
    const raw = await exportPlist();
    const timestamp = new Date().toISOString().slice(0, 10);
    res.setHeader("Content-Type", "application/x-plist");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="artikelData_export_${timestamp}.plist"`,
    );
    res.send(raw);
  } catch (err) {
    logger.error({ err }, "Failed to export plist");
    res.status(500).json({ message: "Export fehlgeschlagen" });
  }
});

export default router;
