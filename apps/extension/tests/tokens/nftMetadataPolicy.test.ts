import assert from "node:assert/strict";
import test from "node:test";

import {
  expandNftUri,
  parseNftMetadataText,
  resolveInlineNftMetadata,
  resolveIpfsUri,
} from "../../src/chrome/tokens/nftMetadataPolicy";

test("NFT policy expands ERC-1155 ids and normalizes both IPFS URI forms", () => {
  const id = "2a".padStart(64, "0");
  assert.equal(
    expandNftUri("https://metadata.example/{id}.json", 42n),
    `https://metadata.example/${id}.json`,
  );
  assert.equal(resolveIpfsUri("ipfs://bafy/file.json"), "https://ipfs.io/ipfs/bafy/file.json");
  assert.equal(resolveIpfsUri("ipfs://ipfs/bafy/file.json"), "https://ipfs.io/ipfs/bafy/file.json");
});

test("NFT metadata fields and image candidates retain exact bounds and order", () => {
  const raster = "data:image/png;base64,iVBORw0KGgo=";
  assert.deepEqual(
    parseNftMetadataText(
      JSON.stringify({
        name: "n".repeat(256),
        description: "d".repeat(2_048),
        image: "",
        image_url: raster,
      }),
    ),
    {
      name: "n".repeat(256),
      description: "d".repeat(2_048),
      image: raster,
    },
  );
  assert.deepEqual(
    parseNftMetadataText(
      JSON.stringify({
        name: "n".repeat(257),
        description: "d".repeat(2_049),
      }),
    ),
    { name: undefined, description: undefined, image: undefined },
  );
});

test("inline NFT policy accepts bounded raster data and rejects active markup", () => {
  const raster = "data:image/png;base64,iVBORw0KGgo=";
  assert.deepEqual(resolveInlineNftMetadata(raster), { image: raster });
  assert.equal(
    resolveInlineNftMetadata("data:image/svg+xml,<svg onload=alert(1)/>"),
    null,
  );
  assert.equal(resolveInlineNftMetadata("data:text/html,<script/>"), null);
});
