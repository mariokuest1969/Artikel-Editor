---
name: Dropbox connector proxy content-host limitation
description: Why direct calls to Dropbox content-host endpoints (upload/download) 404 through the Replit connectors proxy, and the workaround pattern.
---

The Replit Dropbox connector's `connectors.proxy("dropbox", path, init)` only routes to
`api.dropboxapi.com`. Dropbox content-host endpoints — `/2/files/download` and
`/2/files/upload` — actually live on `content.dropboxapi.com`, so calling them through
the proxy returns an HTML 404 page (Dropbox's generic web 404, not a JSON API error).

**Why:** the proxy has no per-endpoint host routing; it always targets the same base host
regardless of which Dropbox endpoint path is requested.

**How to apply:** for file content transfer, use the api-host "temporary link" endpoints
instead of the content-host endpoints directly, then do a plain `fetch()` (no proxy, no
connector headers) against the returned link:
- Download: POST `/2/files/get_temporary_link` via the proxy → returns `{ link }` → `fetch(link)` directly.
- Upload: POST `/2/files/get_temporary_upload_link` via the proxy (body: `{ commit_info: { path, mode, autorename, mute }, duration }`) → returns `{ link }` → `fetch(link, { method: "POST", body: content })` directly.

This pattern likely generalizes to any Replit connector whose underlying API splits
metadata/api calls and raw content transfer across different hosts.
