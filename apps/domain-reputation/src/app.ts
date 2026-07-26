import { timingSafeEqual } from "node:crypto";
import { Hono } from "hono";
import type { SnapshotManager } from "./snapshotManager.js";
import { normalizeLookupHostname } from "./validation.js";

const REQUEST_MAX_BYTES = 1_024;

async function readTextBounded(
  stream: ReadableStream<Uint8Array> | null,
  maxBytes: number,
): Promise<string> {
  if (!stream) return "";
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let total = 0;
  let text = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) return text + decoder.decode();
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new RangeError("Body is too large");
      }
      text += decoder.decode(value, { stream: true });
    }
  } finally {
    reader.releaseLock();
  }
}

function secureEqual(value: string, expected: string): boolean {
  const left = Buffer.from(value);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function createApp(manager: SnapshotManager, serviceToken: string) {
  const app = new Hono();

  app.get("/healthz", (context) =>
    context.json({ ok: true }, 200, { "cache-control": "no-store" }));

  app.get("/readyz", (context) => {
    const detector = manager.detector;
    if (!detector) {
      return context.json(
        { ok: false, error: "No validated snapshot is loaded" },
        503,
        { "cache-control": "no-store" },
      );
    }
    return context.json(
      {
        ok: true,
        snapshot: {
          version: detector.snapshot.config.version,
          fetchedAt: detector.snapshot.fetchedAt,
        },
      },
      200,
      { "cache-control": "no-store" },
    );
  });

  app.post("/v1/domain/check", async (context) => {
    const authorization = context.req.header("authorization") ?? "";
    if (
      !authorization.startsWith("Bearer ") ||
      !secureEqual(authorization.slice(7), serviceToken)
    ) {
      return context.json(
        { error: "Unauthorized" },
        401,
        { "cache-control": "no-store" },
      );
    }
    const declared = Number(context.req.header("content-length") || 0);
    if (declared > REQUEST_MAX_BYTES) {
      return context.json(
        { error: "Request body is too large" },
        413,
        { "cache-control": "no-store" },
      );
    }
    let body: unknown;
    try {
      const text = await readTextBounded(
        context.req.raw.body,
        REQUEST_MAX_BYTES,
      );
      body = JSON.parse(text);
    } catch (error) {
      if (error instanceof RangeError) {
        return context.json(
          { error: "Request body is too large" },
          413,
          { "cache-control": "no-store" },
        );
      }
      return context.json(
        { error: "Invalid JSON" },
        400,
        { "cache-control": "no-store" },
      );
    }
    const hostname = normalizeLookupHostname(
      body && typeof body === "object" && !Array.isArray(body)
        ? (body as Record<string, unknown>).hostname
        : null,
    );
    if (!hostname) {
      return context.json(
        { error: "Invalid hostname" },
        400,
        { "cache-control": "no-store" },
      );
    }
    const detector = manager.detector;
    if (!detector) {
      return context.json(
        { error: "Reputation data is unavailable" },
        503,
        { "cache-control": "no-store" },
      );
    }
    return context.json(detector.check(hostname), 200, {
      "cache-control": "no-store",
    });
  });

  return app;
}
