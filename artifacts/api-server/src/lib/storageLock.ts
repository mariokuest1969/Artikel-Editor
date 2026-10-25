import { pool } from "@workspace/db";

/** Serializes imports, edits, syncs and settings changes across API instances. */
export async function withStorageLock<T>(operation: () => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("SELECT pg_advisory_lock(481930271)");
    return await operation();
  } finally {
    try { await client.query("SELECT pg_advisory_unlock(481930271)"); }
    finally { client.release(); }
  }
}
