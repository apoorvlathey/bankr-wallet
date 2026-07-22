import {
  getPrivacyPoolArtifactManifestEntry,
  PRIVACY_POOLS_PROTOCOL_MANIFEST,
  type PrivacyPoolArtifactId,
} from "./manifest";

export class PrivacyPoolArtifactError extends Error {
  constructor(
    readonly code:
      | "unavailable"
      | "invalid-size"
      | "invalid-integrity"
      | "invalid-origin",
  ) {
    super(`Privacy Pools artifact ${code}`);
    this.name = "PrivacyPoolArtifactError";
  }
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    bytes.slice().buffer as ArrayBuffer,
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

export async function verifyPrivacyPoolArtifact(
  id: PrivacyPoolArtifactId,
  bytes: Uint8Array,
): Promise<void> {
  const expected = getPrivacyPoolArtifactManifestEntry(id);
  if (bytes.byteLength !== expected.bytes) {
    throw new PrivacyPoolArtifactError("invalid-size");
  }
  if ((await sha256Hex(bytes)) !== expected.sha256) {
    throw new PrivacyPoolArtifactError("invalid-integrity");
  }
}

function packagedArtifactUrl(
  id: PrivacyPoolArtifactId,
  extensionRootHref: string,
): string {
  const entry = getPrivacyPoolArtifactManifestEntry(id);
  const extensionRoot = new URL(extensionRootHref);
  const url = new URL(
    `${PRIVACY_POOLS_PROTOCOL_MANIFEST.artifacts.basePath}/${entry.file}`,
    extensionRoot,
  );
  if (url.origin !== extensionRoot.origin || url.protocol !== "chrome-extension:") {
    throw new PrivacyPoolArtifactError("invalid-origin");
  }
  return url.href;
}

export async function loadPackagedPrivacyPoolArtifact(
  id: PrivacyPoolArtifactId,
  extensionRootHref = chrome.runtime.getURL("/"),
): Promise<Uint8Array> {
  const expected = getPrivacyPoolArtifactManifestEntry(id);
  const response = await fetch(packagedArtifactUrl(id, extensionRootHref), {
    cache: "no-store",
    credentials: "omit",
    redirect: "error",
  });
  if (!response.ok) throw new PrivacyPoolArtifactError("unavailable");

  const contentLength = response.headers.get("content-length");
  if (
    contentLength !== null &&
    (!/^\d+$/.test(contentLength) || Number(contentLength) !== expected.bytes)
  ) {
    throw new PrivacyPoolArtifactError("invalid-size");
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  await verifyPrivacyPoolArtifact(id, bytes);
  return bytes;
}
