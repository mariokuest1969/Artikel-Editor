import { pool } from "@workspace/db";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

export interface StoragePaths {
  mode: "dropbox" | "local";
  provider: "connector" | "own";
  importPath: string;
  exportPath: string;
}

const defaults: StoragePaths = {
  mode: "dropbox", provider: "connector",
  importPath: "/Apps/Artikel-Plist/artikelData.plist",
  exportPath: "/Apps/Artikel-Plist/artikelData.plist",
};

export async function readState<T>(key: string): Promise<T | null> {
  const result = await pool.query("SELECT value FROM app_storage_state WHERE key = $1", [key]);
  return (result.rows[0]?.value as T) ?? null;
}

export async function writeState(key: string, value: unknown): Promise<void> {
  await pool.query(
    "INSERT INTO app_storage_state (key, value) VALUES ($1, $2::jsonb) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()",
    [key, JSON.stringify(value)],
  );
}

export async function deleteState(key: string): Promise<void> {
  await pool.query("DELETE FROM app_storage_state WHERE key = $1", [key]);
}

export async function getStoragePaths(): Promise<StoragePaths> {
  return (await readState<StoragePaths>("paths")) ?? { ...defaults };
}

export function validatePlistPath(path: string): string {
  const clean = path.trim();
  if (!clean.startsWith("/") || !clean.toLowerCase().endsWith(".plist") ||
      clean.includes("//") || /[\x00-\x1f]/.test(clean) ||
      clean.split("/").some((part) => part === ".." || part === ".")) {
    throw new Error("Bitte einen absoluten Dropbox-Dateipfad mit Endung .plist angeben.");
  }
  return clean;
}

function encryptionKey(): Buffer {
  if (!process.env.SESSION_SECRET) throw new Error("SESSION_SECRET fehlt.");
  return createHash("sha256").update(`dropbox-storage:${process.env.SESSION_SECRET}`).digest();
}

export function seal(value: unknown): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64");
}

export function unseal<T>(value: string): T {
  const bytes = Buffer.from(value, "base64");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), bytes.subarray(0, 12));
  decipher.setAuthTag(bytes.subarray(12, 28));
  return JSON.parse(Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString("utf8")) as T;
}
