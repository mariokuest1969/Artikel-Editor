---
name: Storage and access policy
description: User-selected providers, security scope, and safe split-path import behavior.
---
The user wants their own Dropbox app (App Key and App Secret), Dropbox and local file transfer only, and login protection for the entire article manager.

**Why:** The app is internet-accessible; file browsing and destructive imports must not be available to unapproved visitors. The user explicitly chose full-app protection.

**How to apply:** Require a verified, explicitly approved administrator identity, not merely any registered account. Keep credentials in server secrets; never expose them in the settings UI. Device and external-drive access goes through browser file selection/download, not arbitrary server filesystem paths.

When Dropbox import and export paths differ, do not automatically reload the import source over edited data.

**Why:** The input file can remain older than the exported changes. Repeated automatic imports would undo edits.

**How to apply:** Use a reviewed manual import for split paths; retain the active article dataset between restarts. Do not treat the split paths as a bidirectional synchronization pair.
