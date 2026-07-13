import assert from "node:assert/strict";
import test from "node:test";

import { AVATAR_MAX_ENCODED_BYTES } from "../../src/chrome/avatar/constants";
import { rasterizeAvatarBlob } from "../../src/chrome/avatar/rasterizer";
import { withGlobalReplacements } from "./runtime";

test("avatar rasterizer bounds dimensions, emits WebP, and closes the bitmap", async () => {
  let canvasSize: [number, number] | undefined;
  let drawSize: [number, number] | undefined;
  let closeCalls = 0;
  await withGlobalReplacements(
    {
      createImageBitmap: async () => ({
        width: 300,
        height: 100,
        close() { closeCalls += 1; },
      }),
      OffscreenCanvas: class {
        constructor(width: number, height: number) { canvasSize = [width, height]; }
        getContext() {
          return { drawImage: (_bitmap: unknown, _x: number, _y: number, width: number, height: number) => { drawSize = [width, height]; } };
        }
        async convertToBlob() {
          return new Blob([new Uint8Array([1, 2])], { type: "image/webp" });
        }
      },
    },
    async () => {
      const result = await rasterizeAvatarBlob(
        new Blob([new Uint8Array([1])], { type: "image/png" }),
      );
      assert.match(result || "", /^data:image\/webp;base64,/);
      assert.deepEqual(canvasSize, [128, 43]);
      assert.deepEqual(drawSize, [128, 43]);
      assert.equal(closeCalls, 1);
    },
  );
});

test("avatar rasterizer never upscales small images", async () => {
  let canvasSize: [number, number] | undefined;
  await withGlobalReplacements(
    {
      createImageBitmap: async () => ({ width: 24, height: 12, close() {} }),
      OffscreenCanvas: class {
        constructor(width: number, height: number) { canvasSize = [width, height]; }
        getContext() { return { drawImage() {} }; }
        async convertToBlob() { return new Blob([new Uint8Array([1])], { type: "image/webp" }); }
      },
    },
    async () => {
      await rasterizeAvatarBlob(new Blob([new Uint8Array([1])], { type: "image/png" }));
      assert.deepEqual(canvasSize, [24, 12]);
    },
  );
});

test("avatar rasterizer closes bitmaps on canvas and encoded-size failures", async () => {
  let closeCalls = 0;
  await withGlobalReplacements(
    {
      createImageBitmap: async () => ({
        width: 1,
        height: 1,
        close() { closeCalls += 1; },
      }),
      OffscreenCanvas: class {
        getContext() { return { drawImage() {} }; }
        async convertToBlob() {
          return new Blob([new Uint8Array(AVATAR_MAX_ENCODED_BYTES + 1)], {
            type: "image/webp",
          });
        }
      },
    },
    async () => {
      assert.equal(
        await rasterizeAvatarBlob(new Blob([new Uint8Array([1])], { type: "image/png" })),
        null,
      );
      assert.equal(closeCalls, 1);
    },
  );
});

test("avatar rasterizer rejects rich MIME before invoking the decoder", async () => {
  let bitmapCalls = 0;
  await withGlobalReplacements(
    { createImageBitmap: async () => { bitmapCalls += 1; throw new Error("unexpected"); } },
    async () => {
      assert.equal(
        await rasterizeAvatarBlob(new Blob(["<svg/>"], { type: "image/svg+xml" })),
        null,
      );
      assert.equal(bitmapCalls, 0);
    },
  );
});
