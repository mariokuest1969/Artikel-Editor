import { clerkClient, getAuth } from "@clerk/express";
import type { Request, RequestHandler } from "express";
import { getClerkProxyHost } from "./clerkProxyMiddleware";

export function allowedOrigins(): string[] {
  return [
    process.env.APP_PUBLIC_URL,
    ...(process.env.REPLIT_DOMAINS ?? "").split(",").filter(Boolean).map((host) => `https://${host}`),
    process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : undefined,
  ].filter((origin): origin is string => Boolean(origin)).map((origin) => new URL(origin).origin);
}

export function requestOrigin(req: Request): string {
  const origin = `https://${getClerkProxyHost(req)}`;
  if (!allowedOrigins().includes(origin)) throw new Error("Unbekannte App-Adresse.");
  return origin;
}

export const sameOrigin: RequestHandler = (req, res, next) => {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  const origin = req.headers.origin;
  if (!origin || !allowedOrigins().includes(origin)) {
    res.status(403).json({ message: "Anfrage nur aus der eigenen App erlaubt." });
    return;
  }
  next();
};

export async function accessStatus(req: Request) {
  const emails = (process.env.ADMIN_EMAILS ?? "").split(",").map((value) => value.trim().toLowerCase()).filter(Boolean);
  const configured = emails.length > 0;
  const { userId } = getAuth(req);
  if (!userId || !configured) return { allowed: false, configured };
  const user = await clerkClient.users.getUser(userId);
  const allowed = user.emailAddresses.some((email) =>
    email.verification?.status === "verified" && emails.includes(email.emailAddress.toLowerCase()));
  return { allowed, configured };
}

export const requireAdministrator: RequestHandler = async (req, res, next) => {
  if (!getAuth(req).userId) {
    res.status(401).json({ message: "Bitte anmelden." });
    return;
  }
  try {
    const status = await accessStatus(req);
    if (!status.allowed) {
      res.status(403).json({ message: status.configured ? "Dieses Konto ist nicht freigegeben." : "Administratorkonto noch nicht konfiguriert." });
      return;
    }
    next();
  } catch {
    res.status(503).json({ message: "Zugriffsprüfung derzeit nicht möglich." });
  }
};
