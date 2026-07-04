// Dropbox integration (connection:conn_dropbox_01KW2WY38XAR8B9PTH9H9FCW75)
// Uses the Replit Dropbox connector via the proxy pattern.
// Do not cache the connectors client — tokens can be refreshed under the hood.
import { ReplitConnectors } from "@replit/connectors-sdk";
import { logger } from "./logger";

const PLIST_PATH = "/Apps/Artikel-Plist/artikelData.plist";

const connectors = new ReplitConnectors();

async function proxy(path: string, init?: RequestInit): Promise<Response> {
  return connectors.proxy("dropbox", path, init);
}

/**
 * Downloads the plist file content as a string.
 * Note: /2/files/download does not route correctly through the connector proxy
 * (content-host endpoints return 404), so we first request a temporary direct
 * link via /2/files/get_temporary_link, then fetch that link directly.
 */
export async function downloadPlist(): Promise<string> {
  const response = await proxy("/2/files/get_temporary_link", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path: PLIST_PATH }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(
      `Dropbox get_temporary_link failed: ${response.status} ${text}`,
    );
  }

  const data = (await response.json()) as { link: string };

  const fileResponse = await fetch(data.link);
  if (!fileResponse.ok) {
    throw new Error(
      `Dropbox temporary link download failed: ${fileResponse.status}`,
    );
  }

  return await fileResponse.text();
}

/**
 * Uploads new plist file content, overwriting the existing file.
 * Note: /2/files/upload does not route correctly through the connector proxy
 * either (it's also a content-host endpoint, same issue as /2/files/download),
 * so we first request a temporary direct upload link via
 * /2/files/get_temporary_upload_link, then POST the content to that link directly.
 */
export async function uploadPlist(content: string): Promise<void> {
  const linkResponse = await proxy("/2/files/get_temporary_upload_link", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      commit_info: {
        path: PLIST_PATH,
        mode: "overwrite",
        autorename: false,
        mute: true,
      },
      duration: 3600,
    }),
  });

  if (!linkResponse.ok) {
    const text = await linkResponse.text().catch(() => "");
    logger.error(
      { status: linkResponse.status, text },
      "Dropbox get_temporary_upload_link failed",
    );
    throw new Error(
      `Dropbox get_temporary_upload_link failed: ${linkResponse.status} ${text}`,
    );
  }

  const { link } = (await linkResponse.json()) as { link: string };

  const uploadResponse = await fetch(link, {
    method: "POST",
    headers: { "Content-Type": "application/octet-stream" },
    body: content,
  });

  if (!uploadResponse.ok) {
    const text = await uploadResponse.text().catch(() => "");
    logger.error(
      { status: uploadResponse.status, text },
      "Dropbox upload failed",
    );
    throw new Error(`Dropbox upload failed: ${uploadResponse.status} ${text}`);
  }
}
