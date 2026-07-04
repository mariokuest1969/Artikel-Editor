import plist from "plist";
import { downloadPlist, uploadPlist } from "./dropbox";
import { logger } from "./logger";

// All plist fields are plain strings; keys match the original plist exactly
// for round-trip fidelity.
export type Article = Record<string, string> & {
  ArtikelId: string;
  Artikel: string;
};

export interface ArticleInput extends Record<string, string | undefined> {
  ArtikelId?: string;
  Artikel: string;
}

interface ListParams {
  search?: string;
  sparte?: string;
  wg?: string;
  page?: number;
  pageSize?: number;
}

interface ListResult {
  items: Article[];
  total: number;
  page: number;
  pageSize: number;
}

interface MetaResult {
  gesamtAnzahl: number;
  letzteSynchronisierung: string;
  sparten: string[];
  druckerListe: string[];
  preislisten: string[];
  warengruppen: string[];
}

let articles: Article[] = [];
let lastSync: Date | null = null;
let loaded = false;
let loadPromise: Promise<void> | null = null;

function parsePlistToArticles(raw: string): Article[] {
  const parsed = plist.parse(raw);
  if (!Array.isArray(parsed)) {
    throw new Error("Unexpected plist structure: expected top-level array");
  }
  return parsed as Article[];
}

function serializeArticlesToPlist(items: Article[]): string {
  return plist.build(items);
}

function distinctSorted(values: (string | undefined)[]): string[] {
  const set = new Set<string>();
  for (const value of values) {
    if (value !== undefined && value.trim() !== "") {
      set.add(value);
    }
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b, "de"));
}

async function doLoad(): Promise<void> {
  const raw = await downloadPlist();
  articles = parsePlistToArticles(raw);
  lastSync = new Date();
  loaded = true;
  logger.info({ count: articles.length }, "Loaded articles from Dropbox");
}

export async function ensureLoaded(): Promise<void> {
  if (loaded) return;
  if (!loadPromise) {
    loadPromise = doLoad().finally(() => {
      loadPromise = null;
    });
  }
  await loadPromise;
}

export async function syncFromDropbox(): Promise<MetaResult> {
  await doLoad();
  return getMeta();
}

async function persist(): Promise<void> {
  const raw = serializeArticlesToPlist(articles);
  await uploadPlist(raw);
}

export async function listArticles(params: ListParams): Promise<ListResult> {
  await ensureLoaded();

  const page = params.page && params.page > 0 ? params.page : 1;
  const pageSize = params.pageSize && params.pageSize > 0 ? params.pageSize : 50;

  let filtered = articles;

  if (params.sparte) {
    filtered = filtered.filter((a) => a.Sparte === params.sparte);
  }
  if (params.wg) {
    filtered = filtered.filter((a) => a.WG === params.wg);
  }
  if (params.search) {
    const needle = params.search.toLowerCase();
    filtered = filtered.filter(
      (a) =>
        a.Artikel?.toLowerCase().includes(needle) ||
        a.ArtikelId?.toLowerCase().includes(needle) ||
        a.BarCode?.toLowerCase().includes(needle),
    );
  }

  const total = filtered.length;
  const start = (page - 1) * pageSize;
  const items = filtered.slice(start, start + pageSize);

  return { items, total, page, pageSize };
}

export async function getArticleById(id: string): Promise<Article | undefined> {
  await ensureLoaded();
  return articles.find((a) => a.ArtikelId === id);
}

function nextArtikelId(): string {
  let max = 0;
  for (const a of articles) {
    const n = Number.parseInt(a.ArtikelId, 10);
    if (Number.isFinite(n) && n > max) {
      max = n;
    }
  }
  return String(max + 1);
}

export async function createArticle(input: ArticleInput): Promise<Article> {
  await ensureLoaded();

  const id = input.ArtikelId && input.ArtikelId.trim() !== "" ? input.ArtikelId : nextArtikelId();

  if (articles.some((a) => a.ArtikelId === id)) {
    throw new Error(`ArtikelId "${id}" existiert bereits`);
  }

  const article: Article = {
    ...input,
    ArtikelId: id,
  } as Article;

  articles.push(article);
  await persist();
  return article;
}

export async function updateArticle(
  id: string,
  input: ArticleInput,
): Promise<Article | undefined> {
  await ensureLoaded();

  const index = articles.findIndex((a) => a.ArtikelId === id);
  if (index === -1) return undefined;

  const updated: Article = {
    ...articles[index],
    ...input,
    ArtikelId: id,
  } as Article;

  articles[index] = updated;
  await persist();
  return updated;
}

export async function deleteArticle(id: string): Promise<boolean> {
  await ensureLoaded();

  const index = articles.findIndex((a) => a.ArtikelId === id);
  if (index === -1) return false;

  articles.splice(index, 1);
  await persist();
  return true;
}

export async function getMeta(): Promise<MetaResult> {
  await ensureLoaded();

  return {
    gesamtAnzahl: articles.length,
    letzteSynchronisierung: (lastSync ?? new Date()).toISOString(),
    sparten: distinctSorted(articles.map((a) => a.Sparte)),
    druckerListe: distinctSorted(articles.map((a) => a.Drucker)),
    preislisten: distinctSorted(articles.map((a) => a.Preisliste)),
    warengruppen: distinctSorted(articles.map((a) => a.WG)),
  };
}
