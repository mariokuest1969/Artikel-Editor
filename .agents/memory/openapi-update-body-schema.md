---
name: OpenAPI update body schemas need relaxed required fields
description: When a generated Zod schema for a PUT/update body reuses the same required fields as the create schema, update requests fail validation even though the ID is already supplied via the URL path.
---

If an OpenAPI spec defines one shared schema (e.g. `ArticleInput`) for both create and update request bodies, and that schema marks the primary key (e.g. `ArtikelId`) as required, the generated Zod validator for the update route will reject legitimate update requests that only send changed fields — even though the resource ID is already known from the URL path parameter.

**Why:** This caused a real bug where all article edits failed with HTTP 400 ("ArtikelId is Required"), because the PUT route parsed the request body with the full required-fields schema instead of treating the ID as optional/already-resolved from `req.params`.

**How to apply:** For PUT/PATCH routes, relax the shared schema before parsing the body, e.g. `UpdateBody.partial({ id: true }).parse(req.body)`, mirroring whatever pattern the create route already uses for optional fields. Prefer this over duplicating the whole schema. When a user reports "can't edit/update X" but creation works, suspect this exact mismatch first — check the update route's body validation against what the frontend actually sends (edit forms often omit unchanged/disabled fields).
