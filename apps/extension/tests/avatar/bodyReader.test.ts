import assert from "node:assert/strict";
import test from "node:test";

import { readAvatarBlobBounded } from "../../src/chrome/avatar/bodyReader";

test("avatar body reader accepts a stream exactly at its ceiling", async () => {
  const blob = await readAvatarBlobBounded(
    new Response(new Uint8Array([1, 2, 3, 4])),
    4,
    "image/png",
  );
  assert.equal(blob?.size, 4);
  assert.equal(blob?.type, "image/png");
});

test("avatar body reader stops before buffering an oversized stream", async () => {
  let cancelled = false;
  const response = new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array([1, 2, 3]));
        controller.enqueue(new Uint8Array([4, 5, 6]));
      },
      cancel() {
        cancelled = true;
      },
    }),
  );
  assert.equal(await readAvatarBlobBounded(response, 5, "image/png"), null);
  assert.equal(cancelled, true);
});

test("avatar body reader rejects declared oversize before consuming bytes", async () => {
  let pulled = false;
  const response = new Response(
    new ReadableStream<Uint8Array>({
      pull(controller) {
        pulled = true;
        controller.enqueue(new Uint8Array([1]));
      },
    }),
    { headers: { "content-length": "999" } },
  );
  assert.equal(await readAvatarBlobBounded(response, 5, "image/png"), null);
  assert.equal(pulled, false);
});

test("avatar body reader preserves the released empty-body behavior", async () => {
  const response = new Response(null, { headers: { "content-type": "image/png" } });
  const blob = await readAvatarBlobBounded(response, 5, "image/png");
  assert.equal(blob?.size, 0);
  assert.equal(blob?.type, "image/png");
});
