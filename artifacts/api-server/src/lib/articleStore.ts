import * as plist from "plist";
import * as fs from "node:fs";
import * as path from "node:path";
import { downloadPlist, uploadPlist } from "./dropbox";
import { logger } from "./logger";
import { getStoragePaths, readState, writeState } from "./storageSettings";
import { withStorageLock } from "./storageLock";

// ---------------------------------------------------------------------------
// Persisted config (survives server restarts)
// ---------------------------------------------------------------------------

const CONFIG_PATH = path.join(process.cwd(), "sync-config.json");

interface PersistedConfig {
  intervalMs?: number;
}

function readPersistedConfig(): PersistedConfig {
  try {
    const raw = fs.readFileSync(CONFIG_PATH, "utf8");
    return JSON.parse(raw) as PersistedConfig;
  } catch {
    return {};
  }
}

function writePersistedConfig(config: PersistedConfig): void {
  try {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), "utf8");
  } catch (err) {
    logger.warn({ err, path: CONFIG_PATH }, "Failed to persist sync config");
  }
}

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
  letzteSynchronisierungFehler: string | null;
  sparten: string[];
  druckerListe: string[];
  preislisten: string[];
  warengruppen: string[];
}

let articles: Article[] = [];
let lastSync: Date | null = null;
let lastSyncError: string | null = null;
let loaded = false;
let loadPromise: Promise<void> | null = null;
let autoSyncTimer: ReturnType<typeof setInterval> | null = null;
let currentIntervalMs: number | null = null;
let nextSyncAt: number | null = null;

const DEFAULT_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

function resolveIntervalMs(): number {
  if (currentIntervalMs !== null) return currentIntervalMs;

  // 1. Persisted config (written by setAutoSyncInterval, survives restarts)
  const persisted = readPersistedConfig();
  if (
    persisted.intervalMs !== undefined &&
    Number.isFinite(persisted.intervalMs) &&
    persisted.intervalMs > 0
  ) {
    logger.info(
      { intervalMs: persisted.intervalMs, source: "sync-config.json" },
      "Loaded sync interval from persisted config",
    );
    currentIntervalMs = persisted.intervalMs;
    return persisted.intervalMs;
  }

  // 2. Environment variable override
  const raw = process.env["AUTO_SYNC_INTERVAL_MS"];
  const parsed =
    raw && Number.isFinite(Number(raw)) && Number(raw) > 0
      ? Number(raw)
      : DEFAULT_INTERVAL_MS;
  currentIntervalMs = parsed;
  return parsed;
}

/** Returns the currently active auto-sync interval in milliseconds. */
export function getAutoSyncInterval(): number {
  return resolveIntervalMs();
}

export function getAutoSyncConfig() {
  return {
    intervalMs: getAutoSyncInterval(),
    nextSyncAt: nextSyncAt === null ? null : new Date(nextSyncAt).toISOString(),
  };
}

/**
 * Change the auto-sync interval at runtime. The running timer is replaced
 * immediately so the next tick fires after the new interval. The value is
 * persisted to disk so it survives server restarts.
 */
export function setAutoSyncInterval(ms: number): void {
  currentIntervalMs = ms;
  writePersistedConfig({ intervalMs: ms });
  restartAutoSync();
}

function restartAutoSync(): void {
  if (autoSyncTimer !== null) {
    clearInterval(autoSyncTimer);
    autoSyncTimer = null;
  }
  startAutoSync();
}

function parsePlistToArticles(raw: string, rejectDuplicates = false): Article[] {
  if (Buffer.byteLength(raw, "utf8") > 10_000_000) throw new Error("Die Datei darf höchstens 10 MB groß sein.");
  if (raw.startsWith("bplist")) throw new Error("Binäre plist-Dateien werden nicht unterstützt. Bitte als XML-plist exportieren.");
  if (/<!ENTITY/i.test(raw) || /<!DOCTYPE[^>]*\[/i.test(raw)) throw new Error("XML-Entitäten sind nicht erlaubt.");
  const parsed = plist.parse(raw);
  if (!Array.isArray(parsed)) {
    throw new Error("Unexpected plist structure: expected top-level array");
  }
  const ids = new Set<string>();
  for (const item of parsed) {
    const record = item as Record<string, unknown>;
    if (!item || typeof item !== "object" || Array.isArray(item) ||
        typeof record.ArtikelId !== "string" || !record.ArtikelId.trim() ||
        typeof record.Artikel !== "string" ||
        Object.values(item).some((value) => typeof value !== "string")) {
      throw new Error("Ungültiger Artikel: ArtikelId, Artikel und alle Feldwerte müssen Zeichenketten sein.");
    }
    if (rejectDuplicates && ids.has(record.ArtikelId as string)) throw new Error(`Doppelte Artikelnummer: ${record.ArtikelId}`);
    ids.add(record.ArtikelId as string);
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

// Automation rule 1: "Tresen" printer articles always carry 19% VAT.
// Format ("19,00") matches the existing comma-decimal convention used in the plist.
const TRESEN_MWST = "19,00";
const TRESEN_PRINTER = "Tresen";
// Articles 9002 and 9003 are always 0,00 (in Haus / außer Haus) and must be
// excluded from the automatic Tresen -> 19% MWSt rule.
const TRESEN_MWST_EXCLUDED_IDS = new Set(["9002", "9003"]);

function normalizeArticle(article: Article): { article: Article; changed: boolean } {
  if (
    (article.Drucker ?? "").trim() === TRESEN_PRINTER &&
    !TRESEN_MWST_EXCLUDED_IDS.has((article.ArtikelId ?? "").trim()) &&
    (article.MWSt ?? "").trim() !== TRESEN_MWST
  ) {
    return { article: { ...article, MWSt: TRESEN_MWST }, changed: true };
  }
  return { article, changed: false };
}

// Automation rule 2: drop "Leerzeilen" -- articles with no article name at all.
function normalizeArticles(items: Article[]): { items: Article[]; changed: boolean } {
  let changed = false;
  const result: Article[] = [];
  for (const item of items) {
    if ((item.Artikel ?? "").trim() === "") {
      changed = true;
      continue;
    }
    const { article, changed: itemChanged } = normalizeArticle(item);
    if (itemChanged) changed = true;
    result.push(article);
  }
  return { items: result, changed };
}

async function doLoad(): Promise<void> {
  const settings = await getStoragePaths();
  if (settings.mode === "local") {
    articles = (await readState<Article[]>("active-articles")) ?? [];
    loaded = true;
    return;
  }
  const raw = await downloadPlist();
  const parsed = parsePlistToArticles(raw);
  const { items, changed } = normalizeArticles(parsed);
  if (changed && settings.importPath === settings.exportPath) {
    await uploadPlist(serializeArticlesToPlist(items), settings);
  }
  await writeState("active-articles", items);
  articles = items;
  lastSync = new Date();
  lastSyncError = null;
  loaded = true;
  logger.info({ count: articles.length }, "Loaded articles from Dropbox");

}

/**
 * Start a background timer that syncs from Dropbox at a fixed interval.
 * The interval is configurable via the AUTO_SYNC_INTERVAL_MS environment
 * variable (default: 5 minutes). Calling this a second time is a no-op.
 */
export function startAutoSync(): void {
  if (autoSyncTimer !== null) return;

  const intervalMs = resolveIntervalMs();

  logger.info({ intervalMs }, "Auto-sync started");

  nextSyncAt = Date.now() + intervalMs;
  autoSyncTimer = setInterval(() => {
    nextSyncAt = Date.now() + intervalMs;
    logger.info("Auto-sync: running background sync from Dropbox");
    withStorageLock(async () => {
      const settings = await getStoragePaths();
      if (settings.mode === "local" || settings.importPath !== settings.exportPath) return;
      await doLoad();
    }).catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      lastSyncError = message;
      logger.error({ err }, "Auto-sync failed");
    });
  }, intervalMs);

  // Keep the timer from preventing process exit (useful in tests / dev).
  if (autoSyncTimer.unref) autoSyncTimer.unref();
}

export async function ensureLoaded(): Promise<void> {
  const persisted = await readState<Article[]>("active-articles");
  if (persisted) { articles = persisted; loaded = true; return; }
  if (loaded) return;
  if (!loadPromise) {
    loadPromise = doLoad().finally(() => {
      loadPromise = null;
    });
  }
  await loadPromise;
}

export async function syncFromDropbox(): Promise<MetaResult> {
  // A manual attempt starts a fresh interval, even if Dropbox rejects it.
  restartAutoSync();
  return withStorageLock(async () => {
    const settings = await getStoragePaths();
    if (settings.mode === "local" || settings.importPath !== settings.exportPath) {
      throw new Error("Bitte den Import mit Vorschau auf der Einstellungsseite verwenden.");
    }
    await doLoad();
    return getMeta();
  });
}

async function persist(): Promise<void> {
  const raw = serializeArticlesToPlist(articles);
  const settings = await getStoragePaths();
  if (settings.mode === "dropbox") await uploadPlist(raw, settings);
  await writeState("active-articles", articles);
}

export function validateImport(raw: string): Article[] {
  return normalizeArticles(parsePlistToArticles(raw, true)).items;
}

export function countStoredArticles(raw: string): number {
  return parsePlistToArticles(raw).length;
}

/** Caller holds storage lock and has verified confirmation against current data. */
export async function replaceArticles(items: Article[]): Promise<void> {
  const settings = await getStoragePaths();
  if (settings.mode === "dropbox") await uploadPlist(serializeArticlesToPlist(items), settings);
  await writeState("active-articles", items);
  articles = items;
  loaded = true;
  lastSync = new Date();
  lastSyncError = null;
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

async function cloneArticleUnlocked(id: string): Promise<Article | undefined> {
  await ensureLoaded();
  const source = articles.find((a) => a.ArtikelId === id);
  if (!source) return undefined;

  // Preserve every plist field, including fields not exposed in the editor.
  const copy: Article = { ...source, ArtikelId: nextArtikelId() };
  articles.push(copy);
  try {
    await persist();
  } catch (error) {
    // A failed upload must not leave a phantom clone in the local list.
    articles = articles.filter((article) => article !== copy);
    throw error;
  }
  return copy;
}

async function createArticleUnlocked(input: ArticleInput): Promise<Article> {
  await ensureLoaded();

  const id = input.ArtikelId && input.ArtikelId.trim() !== "" ? input.ArtikelId : nextArtikelId();

  if (articles.some((a) => a.ArtikelId === id)) {
    throw new Error(`ArtikelId "${id}" existiert bereits`);
  }

  const { article } = normalizeArticle({
    ...input,
    ArtikelId: id,
  } as Article);

  articles.push(article);
  await persist();
  return article;
}

async function updateArticleUnlocked(
  id: string,
  input: Partial<ArticleInput>,
): Promise<Article | undefined> {
  await ensureLoaded();

  const index = articles.findIndex((a) => a.ArtikelId === id);
  if (index === -1) return undefined;

  const { article: updated } = normalizeArticle({
    ...articles[index],
    ...input,
    ArtikelId: id,
  } as Article);

  articles[index] = updated;
  await persist();
  return updated;
}

async function deleteArticleUnlocked(id: string): Promise<boolean> {
  await ensureLoaded();

  const index = articles.findIndex((a) => a.ArtikelId === id);
  if (index === -1) return false;

  articles.splice(index, 1);
  await persist();
  return true;
}

export async function exportPlist(): Promise<string> {
  await ensureLoaded();
  return serializeArticlesToPlist(articles);
}

export const cloneArticle = (id: string) => withStorageLock(() => cloneArticleUnlocked(id));
export const createArticle = (input: ArticleInput) => withStorageLock(() => createArticleUnlocked(input));
export const updateArticle = (id: string, input: Partial<ArticleInput>) => withStorageLock(() => updateArticleUnlocked(id, input));
export const deleteArticle = (id: string) => withStorageLock(() => deleteArticleUnlocked(id));

export async function getMeta(): Promise<MetaResult> {
  await ensureLoaded();

  return {
    gesamtAnzahl: articles.length,
    letzteSynchronisierung: (lastSync ?? new Date()).toISOString(),
    letzteSynchronisierungFehler: lastSyncError,
    sparten: distinctSorted(articles.map((a) => a.Sparte)),
    druckerListe: distinctSorted(articles.map((a) => a.Drucker)),
    preislisten: distinctSorted(articles.map((a) => a.Preisliste)),
    warengruppen: distinctSorted(articles.map((a) => a.WG)),
  };
}
