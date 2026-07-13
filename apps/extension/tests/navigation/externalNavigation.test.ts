import assert from "node:assert/strict";
import test from "node:test";

import {
  sanitizeCustomExplorerUrl,
  sanitizeExternalNavigationUrl,
} from "../../src/lib/externalNavigation";
import { normalizeNetworksInfo } from "../../src/lib/chains";

test("remote navigation metadata is restricted to public HTTPS", () => {
  assert.equal(
    sanitizeExternalNavigationUrl("https://app.example/path?q=1"),
    "https://app.example/path?q=1",
  );
  for (const value of [
    "javascript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "file:///etc/passwd",
    "http://app.example",
    "https://user:secret@app.example",
    "https://127.0.0.1/admin",
    "https://192.168.1.1/admin",
    "https://metadata.internal/latest",
    "https://site.test/path",
    "https://hidden.onion/path",
  ]) {
    assert.equal(sanitizeExternalNavigationUrl(value), null, value);
  }
});

test("custom explorers retain explicit loopback development without broad private access", () => {
  assert.equal(
    sanitizeCustomExplorerUrl("http://localhost:4000"),
    "http://localhost:4000/",
  );
  assert.equal(
    sanitizeCustomExplorerUrl("https://explorer.example"),
    "https://explorer.example/",
  );
  assert.equal(sanitizeCustomExplorerUrl("http://192.168.1.10:4000"), null);
  assert.equal(sanitizeCustomExplorerUrl("http://explorer.example"), null);
});

test("legacy or corrupt custom explorer values are removed during normalization", () => {
  const common = {
    chainId: 999_999,
    rpcUrl: "https://rpc.example",
    isCustom: true,
    nativeCurrency: { name: "Test", symbol: "TST", decimals: 18 },
  };
  const unsafe = normalizeNetworksInfo({
    Unsafe: { ...common, explorer: "javascript:alert(1)" },
  });
  assert.equal(unsafe.Unsafe.explorer, undefined);

  const local = normalizeNetworksInfo({
    Local: {
      ...common,
      chainId: 999_998,
      explorer: "http://127.0.0.1:4000/",
    },
  });
  assert.equal(local.Local.explorer, "http://127.0.0.1:4000");
});
