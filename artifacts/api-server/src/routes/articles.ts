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
} from "@workspace/api-zod";
import {
  listArticles,
  getArticleById,
  createArticle,
  updateArticle,
  deleteArticle,
  getMeta,
  syncFromDropbox,
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
    const body = UpdateArticleBody.parse(req.body);
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

export default router;
