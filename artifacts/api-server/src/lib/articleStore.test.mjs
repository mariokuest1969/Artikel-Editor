import assert from "node:assert/strict";
import { test } from "node:test";
import { build } from "esbuild";

// Each import represents a fresh process with independent in-memory state.
let instance = 0;
async function loadStore({ database = null, legacy = null } = {}) {
  const { outputFiles } = await build({
    stdin: {
      contents: `
        export * from "./articleStore";
        export { default as router } from "../routes/articles";
        export { setDownloadFailure } from "./dropbox";
        export { setStoragePaths, getDatabase, failWrites, failReads } from "./storageSettings";
      `,
      resolveDir: new URL(".", import.meta.url).pathname,
    },
    bundle: true,
    write: false,
    platform: "node",
    format: "esm",
    plugins: [{
      name: "isolated-sync-dependencies",
      setup(build) {
        build.onResolve({ filter: /^(express|\.\.\/lib\/logger|\.\/dropbox|\.\/logger|\.\/storageSettings|\.\/storageLock|plist|node:fs)$/ }, (args) => ({
          path: args.path, namespace: "sync-test",
        }));
        build.onLoad({ filter: /.*/, namespace: "sync-test" }, ({ path }) => ({
          contents: path === "./dropbox"
            ? `let fail = false;
               export const setDownloadFailure = (value) => { fail = value; };
               export const downloadPlist = async () => {
                 if (fail) throw new Error("Dropbox unavailable");
                 return "";
               };
               export const uploadPlist = async () => {};`
            : path === "./storageSettings"
              ? `let settings = { mode: "dropbox", importPath: "/articles.plist", exportPath: "/articles.plist" };
                 let database = ${JSON.stringify(database)};
                 let writeError = false, readError = false;
                 export const getDatabase = () => database;
                 export const failWrites = () => { writeError = true; };
                 export const failReads = () => { readError = true; };
                 export const setStoragePaths = (value) => { settings = value; };
                 export const getStoragePaths = async () => settings;
                 export const readState = async (key) => {
                   if (readError) throw new Error("Database unavailable");
                   return key === "sync-config" ? database : null;
                 };
                 export const writeState = async (key, value) => {
                   if (writeError) throw new Error("Database unavailable");
                   if (key === "sync-config") database = value;
                 };`
            : path === "./storageLock"
              ? "export const withStorageLock = async (operation) => operation();"
             : path === "express"
               ? `export const Router = () => ({
                    puts: {}, get() {}, post() {}, delete() {},
                    put(path, handler) { this.puts[path] = handler; }
                  });`
             : path === "./logger" || path === "../lib/logger"
              ? "export const logger = { info() {}, warn() {}, error() {} };"
              : path === "plist"
                ? 'export const parse = () => []; export const build = () => "";'
                 : `export const readFileSync = () => ${JSON.stringify(JSON.stringify(legacy))};`,
        }));
      },
    }],
  });
  return import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString("base64")}#${instance++}`);
}

// Exercise the real scheduler with a fake clock and no Dropbox or disk writes.
test("auto-sync deadlines follow the server timer and reset on manual attempts", async (t) => {
  t.mock.timers.enable({ apis: ["Date", "setInterval"], now: 1_800_000_000_000 });
  const store = await loadStore();
  const deadline = () => Date.parse(store.getAutoSyncConfig().nextSyncAt);

  await store.initializeAutoSyncConfig();
  assert.equal(store.getAutoSyncConfig().nextSyncAt, null);
  await store.setAutoSyncInterval(300_000);
  assert.equal(deadline(), Date.now() + 300_000);
  t.mock.timers.tick(60_000);
  const originalDeadline = deadline();
  store.startAutoSync();
  assert.equal(deadline(), originalDeadline, "repeated starts must not reset the countdown");

  await store.setAutoSyncInterval(60_000);
  assert.equal(deadline(), Date.now() + 60_000, "settings changes reset the timer");
  t.mock.timers.tick(20_000);
  await store.syncFromDropbox();
  assert.equal(deadline(), Date.now() + 60_000, "manual sync resets the actual timer");

  t.mock.timers.tick(40_000);
  assert.equal(deadline(), Date.now() + 20_000, "the replaced timer must not fire early");
  t.mock.timers.tick(20_000);
  assert.equal(deadline(), Date.now() + 60_000, "automatic ticks advance the deadline");
  await new Promise(setImmediate);

  store.setDownloadFailure(true);
  t.mock.timers.tick(10_000);
  await assert.rejects(store.syncFromDropbox(), /Dropbox unavailable/);
  assert.equal(deadline(), Date.now() + 60_000, "failed manual attempts also reset the timer");
  t.mock.timers.tick(60_000);
  await new Promise(setImmediate);
  assert.equal(deadline(), Date.now() + 60_000, "automatic failures keep the next attempt scheduled");
  assert.equal((await store.getMeta()).letzteSynchronisierungFehler, "Dropbox unavailable");

  store.setDownloadFailure(false);
  store.setStoragePaths({ mode: "local" });
  await assert.rejects(store.syncFromDropbox(), /Import mit Vorschau/);
  store.setStoragePaths({ mode: "dropbox", importPath: "/input.plist", exportPath: "/output.plist" });
  await assert.rejects(store.syncFromDropbox(), /Import mit Vorschau/);
});

test("legacy interval migrates and a fresh process restores database settings without a file", async () => {
  const original = await loadStore({ legacy: { intervalMs: 120_000 } });
  await original.initializeAutoSyncConfig();
  assert.deepEqual(original.getDatabase(), { intervalMs: 120_000 });
  await original.setAutoSyncInterval(600_000);

  const fresh = await loadStore({ database: original.getDatabase() });
  await fresh.initializeAutoSyncConfig();
  assert.equal(fresh.getAutoSyncInterval(), 600_000);
  fresh.startAutoSync();
  assert.ok(Date.parse(fresh.getAutoSyncConfig().nextSyncAt) >= Date.now() + 599_000);

  const staleFile = await loadStore({
    database: original.getDatabase(), legacy: { intervalMs: 120_000 },
  });
  await staleFile.initializeAutoSyncConfig();
  assert.equal(staleFile.getAutoSyncInterval(), 600_000);
});

test("failed database saves leave the active timer and saved value unchanged", async () => {
  const store = await loadStore({ database: { intervalMs: 300_000 } });
  await store.initializeAutoSyncConfig();
  store.startAutoSync();
  const before = store.getAutoSyncConfig();
  store.failWrites();
  await assert.rejects(store.setAutoSyncInterval(60_000), /Database unavailable/);
  assert.deepEqual(store.getAutoSyncConfig(), before);
  assert.deepEqual(store.getDatabase(), { intervalMs: 300_000 });
});

test("startup database failures do not silently replace saved settings", async () => {
  const readFailure = await loadStore({ legacy: { intervalMs: 120_000 } });
  readFailure.failReads();
  await assert.rejects(readFailure.initializeAutoSyncConfig(), /Database unavailable/);
  assert.throws(() => readFailure.startAutoSync(), /not been initialized/);

  const writeFailure = await loadStore();
  writeFailure.failWrites();
  await assert.rejects(writeFailure.initializeAutoSyncConfig(), /Database unavailable/);
  assert.throws(() => writeFailure.startAutoSync(), /not been initialized/);
});

test("first startup stores the environment interval or default in the database", async (t) => {
  const previous = process.env.AUTO_SYNC_INTERVAL_MS;
  t.after(() => {
    if (previous === undefined) delete process.env.AUTO_SYNC_INTERVAL_MS;
    else process.env.AUTO_SYNC_INTERVAL_MS = previous;
  });
  process.env.AUTO_SYNC_INTERVAL_MS = "420000";
  const configured = await loadStore();
  await configured.initializeAutoSyncConfig();
  assert.deepEqual(configured.getDatabase(), { intervalMs: 420_000 });
  delete process.env.AUTO_SYNC_INTERVAL_MS;
  const defaults = await loadStore();
  await defaults.initializeAutoSyncConfig();
  assert.deepEqual(defaults.getDatabase(), { intervalMs: 300_000 });
});

test("PUT rejects non-runnable values and accepted saves survive fresh initialization", async () => {
  const store = await loadStore({ database: { intervalMs: 300_000 } });
  await store.initializeAutoSyncConfig();
  const put = async (intervalMs) => {
    const res = {
      code: 200, body: null,
      status(code) { this.code = code; return this; },
      json(body) { this.body = body; },
    };
    await store.router.puts["/sync-config"]({ body: { intervalMs } }, res);
    return res;
  };
  for (const value of [0, -1, 0.5, 1.5, 2_147_483_648]) {
    assert.equal((await put(value)).code, 400);
    assert.deepEqual(store.getDatabase(), { intervalMs: 300_000 });
    await assert.rejects(store.setAutoSyncInterval(value), /Invalid sync interval/);
  }
  assert.equal((await put(120_000)).code, 200);
  const fresh = await loadStore({ database: store.getDatabase() });
  await fresh.initializeAutoSyncConfig();
  assert.equal(fresh.getAutoSyncInterval(), 120_000);
});
