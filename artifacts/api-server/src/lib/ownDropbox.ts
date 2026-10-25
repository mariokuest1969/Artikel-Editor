import { createHash, randomBytes } from "node:crypto";
import { pool } from "@workspace/db";
import { deleteState, readState, seal, unseal, writeState } from "./storageSettings";

interface TokenRecord { refreshToken: string; }
interface PendingAuth { userId: string; verifier: string; redirectUri: string; expires: number; }
let cachedToken: { value: string; expires: number; connection: string } | null = null;
let refreshing: Promise<string> | null = null;

function credentials() {
  const key = process.env.DROPBOX_APP_KEY;
  const secret = process.env.DROPBOX_APP_SECRET;
  if (!key || !secret) throw new Error("Dropbox App Key oder App Secret fehlt in den Secrets.");
  return { key, secret };
}

async function exchange(params: Record<string, string>) {
  const { key, secret } = credentials();
  const response = await fetch("https://api.dropboxapi.com/oauth2/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ ...params, client_id: key, client_secret: secret }),
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw new Error(`Dropbox-Anmeldung fehlgeschlagen (${response.status}). App-Konfiguration und Freigabe prüfen.`);
  const data = await response.json() as { access_token: string; refresh_token?: string; expires_in: number };
  if (!data.access_token) throw new Error("Dropbox hat keine gültige Anmeldung zurückgegeben.");
  return data;
}

export async function ownDropboxConnected(): Promise<boolean> {
  return Boolean(await readState<string>("dropbox-token"));
}

export async function beginDropboxAuth(userId: string, redirectUri: string): Promise<string> {
  const { key } = credentials();
  const state = randomBytes(32).toString("hex");
  const verifier = randomBytes(48).toString("base64url");
  await pool.query("DELETE FROM app_storage_state WHERE key LIKE 'oauth:%' AND updated_at < now() - interval '15 minutes'");
  await writeState(`oauth:${state}`, seal({ userId, verifier, redirectUri, expires: Date.now() + 600000 }));
  const params = new URLSearchParams({
    client_id: key, response_type: "code", redirect_uri: redirectUri, state,
    token_access_type: "offline", code_challenge_method: "S256",
    code_challenge: createHash("sha256").update(verifier).digest("base64url"),
    scope: "files.metadata.read files.content.read files.content.write",
  });
  return `https://www.dropbox.com/oauth2/authorize?${params}`;
}

export async function completeDropboxAuth(userId: string, state: string, code: string): Promise<void> {
  if (!/^[a-f0-9]{64}$/.test(state)) throw new Error("Ungültige Dropbox-Anmeldung.");
  // Consume once, across all server instances, before exchanging the code.
  const result = await pool.query("DELETE FROM app_storage_state WHERE key = $1 RETURNING value", [`oauth:${state}`]);
  if (!result.rows[0]) throw new Error("Dropbox-Anmeldung abgelaufen.");
  const pending = unseal<PendingAuth>(result.rows[0].value);
  if (pending.userId !== userId || pending.expires < Date.now()) throw new Error("Dropbox-Anmeldung abgelaufen.");
  const tokens = await exchange({ grant_type: "authorization_code", code, redirect_uri: pending.redirectUri, code_verifier: pending.verifier });
  if (!tokens.refresh_token) throw new Error("Dropbox hat keine dauerhafte Freigabe erteilt. Bitte erneut verbinden.");
  await writeState("dropbox-token", seal({ refreshToken: tokens.refresh_token }));
  cachedToken = null;
}

export async function disconnectDropbox(): Promise<void> {
  await deleteState("dropbox-token");
  cachedToken = null;
}

async function accessToken(): Promise<string> {
  // Check persistent connection even when this process has a cached access token.
  const encrypted = await readState<string>("dropbox-token");
  if (!encrypted) throw new Error("Eigene Dropbox-App ist noch nicht verbunden.");
  const connection = createHash("sha256").update(encrypted).digest("hex");
  if (cachedToken && cachedToken.connection === connection && cachedToken.expires > Date.now()) return cachedToken.value;
  if (!refreshing) {
    refreshing = (async () => {
      const record = unseal<TokenRecord>(encrypted);
      const tokens = await exchange({ grant_type: "refresh_token", refresh_token: record.refreshToken });
      cachedToken = { value: tokens.access_token, expires: Date.now() + (tokens.expires_in - 60) * 1000, connection };
      return tokens.access_token;
    })().finally(() => { refreshing = null; });
  }
  return refreshing;
}

export async function ownDropboxRequest(path: string, body: unknown): Promise<Response> {
  return fetch(`https://api.dropboxapi.com${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${await accessToken()}`, "Content-Type": "application/json" },
    body: JSON.stringify(body), signal: AbortSignal.timeout(30000),
  });
}
