---
name: Sync countdown semantics
description: Why the sidebar countdown must follow the scheduler rather than the last successful sync.
---

Use the server's scheduled deadline as the countdown source. A manual sync attempt starts a new full interval even if Dropbox fails.

**Why:** The requested countdown must reset when a manual sync is triggered. The last successful download is not a scheduling anchor: initial loads, failed attempts, and interval changes can all make it diverge from the actual timer.

**How to apply:** Preserve these semantics when changing sync scheduling or displaying sync status. Do not substitute last-success time plus interval for the actual next deadline.
