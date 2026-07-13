import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import * as calldataFacade from "../../src/chrome/calldataAddressCandidates";
import * as customFacade from "../../src/chrome/customTokenStorage";
import * as preflightFacade from "../../src/chrome/erc20CandidatePreflight";
import * as nftFacade from "../../src/chrome/nftMetadata";
import * as logoFacade from "../../src/chrome/tokenLogoConstants";
import * as metadataFacade from "../../src/chrome/tokenMetadata";
import * as calldata from "../../src/chrome/tokens/calldataAddressCandidates";
import * as custom from "../../src/chrome/tokens/customTokenStorage";
import * as preflight from "../../src/chrome/tokens/erc20CandidatePreflight";
import * as nft from "../../src/chrome/tokens/nftMetadata";
import * as logos from "../../src/chrome/tokens/tokenLogoConstants";
import * as metadata from "../../src/chrome/tokens/tokenMetadata";

const CHROME_ROOT = new URL("../../src/chrome/", import.meta.url);

async function source(path: string): Promise<string> {
  return readFile(new URL(path, CHROME_ROOT), "utf8");
}

test("token compatibility facades preserve every public runtime identity", () => {
  assert.equal(customFacade.getCustomTokens, custom.getCustomTokens);
  assert.equal(customFacade.addCustomToken, custom.addCustomToken);
  assert.equal(customFacade.updateCustomToken, custom.updateCustomToken);
  assert.equal(customFacade.removeCustomToken, custom.removeCustomToken);
  assert.equal(metadataFacade.resolveTokenMetadata, metadata.resolveTokenMetadata);
  assert.equal(metadataFacade.resolveTokenLogoUrl, metadata.resolveTokenLogoUrl);
  assert.equal(logoFacade.KNOWN_TOKEN_LOGOS, logos.KNOWN_TOKEN_LOGOS);
  assert.equal(nftFacade.resolveNftMetadata, nft.resolveNftMetadata);
  assert.equal(
    preflightFacade.getPreflightTokenMetadata,
    preflight.getPreflightTokenMetadata,
  );
  assert.equal(
    preflightFacade.preflightAssetCandidates,
    preflight.preflightAssetCandidates,
  );
  assert.equal(
    calldataFacade.MAX_CALLDATA_ADDRESS_CANDIDATES,
    calldata.MAX_CALLDATA_ADDRESS_CANDIDATES,
  );
  assert.equal(
    calldataFacade.extractCalldataAddressCandidates,
    calldata.extractCalldataAddressCandidates,
  );
});

test("token root paths contain no policy, storage, HTTP, or RPC effects", async () => {
  for (const path of [
    "customTokenStorage.ts",
    "tokenMetadata.ts",
    "tokenLogoConstants.ts",
    "nftMetadata.ts",
    "erc20CandidatePreflight.ts",
    "calldataAddressCandidates.ts",
  ]) {
    const text = await source(path);
    assert.ok(text.split("\n").length <= 12, path);
    assert.doesNotMatch(
      text,
      /\b(?:function|fetch|chrome\.|multicall|Map|withStorageLock)\b/,
      path,
    );
  }
});

test("token dependency direction isolates pure policy from effects", async () => {
  for (const path of [
    "tokens/types.ts",
    "tokens/calldataAddressCandidates.ts",
    "tokens/nftMetadataPolicy.ts",
    "tokens/tokenLogoConstants.ts",
  ]) {
    assert.doesNotMatch(
      await source(path),
      /\b(?:chrome\.|fetch\s*\(|multicall\s*\(|withStorageLock)\b/,
      path,
    );
  }

  const storage = await source("tokens/customTokenStorage.ts");
  assert.match(storage, /from ["']\.\.\/storageLock["']/);
  assert.doesNotMatch(storage, /\b(?:fetch|multicall)\s*\(/);

  const nftTransport = await source("tokens/nftMetadata.ts");
  assert.match(nftTransport, /from ["']\.\/nftMetadataPolicy["']/);
  assert.match(nftTransport, /from ["']\.\.\/network\/boundedHttp["']/);

  const resolver = await source("tokens/tokenMetadata.ts");
  assert.match(resolver, /from ["']\.\/customTokenStorage["']/);
  assert.match(resolver, /from ["']\.\/tokenLogoConstants["']/);
});

test("token modules remain independently auditable", async () => {
  const budgets: Record<string, number> = {
    "tokens/types.ts": 40,
    "tokens/customTokenStorage.ts": 85,
    "tokens/tokenLogoConstants.ts": 15,
    "tokens/tokenMetadata.ts": 180,
    "tokens/nftMetadataPolicy.ts": 115,
    "tokens/nftMetadata.ts": 115,
    "tokens/erc20CandidatePreflight.ts": 150,
    "tokens/calldataAddressCandidates.ts": 55,
  };
  for (const [path, maximum] of Object.entries(budgets)) {
    const lines = (await source(path)).split("\n").length;
    assert.ok(lines <= maximum, `${path}: ${lines} > ${maximum}`);
  }
});
