import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { clerkMiddleware, getAuth } from "@clerk/express";
import { publishableKeyFromHost } from "@clerk/shared/keys";
import { CLERK_PROXY_PATH, clerkProxyMiddleware, getClerkProxyHost } from "./middlewares/clerkProxyMiddleware";
import { accessStatus, requireAdministrator, sameOrigin } from "./middlewares/access";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());
app.use(cors({ credentials: true, origin: false }));
app.use(express.json({ limit: "12mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(clerkMiddleware((req) => ({
  publishableKey: publishableKeyFromHost(getClerkProxyHost(req) ?? "", process.env.CLERK_PUBLISHABLE_KEY),
})));

// Disable browser/proxy caching for all API responses so that after a Dropbox
// sync the browser always fetches fresh data instead of returning a stale
// 304 Not Modified from its ETag cache.
app.use("/api", (_req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  next();
});

app.get("/api/healthz", (_req, res) => { res.json({ status: "ok" }); });
app.get("/api/access", async (req, res) => {
  if (!getAuth(req).userId) { res.status(401).json({ message: "Bitte anmelden." }); return; }
  try { res.json(await accessStatus(req)); }
  catch { res.status(503).json({ message: "Zugriffsprüfung derzeit nicht möglich." }); }
});
app.use("/api", requireAdministrator, sameOrigin, router);

export default app;
