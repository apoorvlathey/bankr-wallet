import { serve } from "@hono/node-server";
import { createApp } from "./app.js";
import { SnapshotManager } from "./snapshotManager.js";
import { SnapshotRepository } from "./snapshotRepository.js";

const serviceToken = process.env.DOMAIN_REPUTATION_SERVICE_TOKEN?.trim() ?? "";
if (serviceToken.length < 32) {
  throw new Error("DOMAIN_REPUTATION_SERVICE_TOKEN must be at least 32 characters");
}

const port = Number(process.env.PORT || 42110);
if (!Number.isSafeInteger(port) || port <= 0 || port > 65_535) {
  throw new Error("PORT must be a valid TCP port");
}

const dataDirectory =
  process.env.RAILWAY_VOLUME_MOUNT_PATH?.trim() ||
  new URL("../data", import.meta.url).pathname;
const manager = new SnapshotManager(new SnapshotRepository(dataDirectory));
await manager.start();

const server = serve({
  fetch: createApp(manager, serviceToken).fetch,
  port,
});

console.info("[domain-reputation]", {
  event: "server_started",
  port,
  snapshotLoaded: manager.detector !== null,
});

function shutdown() {
  manager.stop();
  server.close(() => process.exit(0));
}

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
