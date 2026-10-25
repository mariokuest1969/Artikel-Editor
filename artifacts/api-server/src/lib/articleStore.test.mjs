import assert from "node:assert/strict";
import { test } from "node:test";
import { build } from "esbuild";

// Exercise the real scheduler with a fake clock and no Dropbox or disk writes.
test("auto-sync deadlines follow the server timer and reset on manual attempts", async (t) => {
  const { outputFiles } = await build({
    stdin: {
      contents: `
        export * from "./articleStore";
        export { setDownloadFailure } from "./dropbox";
        export { setStoragePaths } from "./storageSettings";
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
        build.onResolve({ filter: /^(\.\/dropbox|\.\/logger|\.\/storageSettings|\.\/storageLock|plist|node:fs)$/ }, (args) => ({
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
                 export const setStoragePaths = (value) => { settings = value; };
                 export const getStoragePaths = async () => settings;
                 export const readState = async () => null;
                 export const writeState = async () => {};`
            : path === "./storageLock"
              ? "export const withStorageLock = async (operation) => operation();"
            : path === "./logger"
              ? "export const logger = { info() {}, warn() {}, error() {} };"
              : path === "plist"
                ? 'export const parse = () => []; export const build = () => "";'
                : 'export const readFileSync = () => { throw new Error("No config"); }; export const writeFileSync = () => {};',
        }));
      },
    }],
  });
  t.mock.timers.enable({ apis: ["Date", "setInterval"], now: 1_800_000_000_000 });
  const store = await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString("base64")}`);
  const deadline = () => Date.parse(store.getAutoSyncConfig().nextSyncAt);

  assert.equal(store.getAutoSyncConfig().nextSyncAt, null);
  store.setAutoSyncInterval(300_000);
  assert.equal(deadline(), Date.now() + 300_000);
  t.mock.timers.tick(60_000);
  const originalDeadline = deadline();
  store.startAutoSync();
  assert.equal(deadline(), originalDeadline, "repeated starts must not reset the countdown");

  store.setAutoSyncInterval(60_000);
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
