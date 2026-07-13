import assert from "node:assert/strict";
import test from "node:test";

import {
  isAllowedRasterImageContentType,
  sanitizeTrustedRendererImageSrc,
  sanitizeUntrustedImageUrl,
} from "../../src/lib/remoteImagePolicy";
import {
  isAllowedAvatarUrl,
  isAllowedCachedAvatarDataUrl,
  normalizeAvatarRasterContentType,
} from "../../src/chrome/avatar/policy";

test("avatar fetch policy allows only public HTTPS resources", () => {
  for (const url of [
    "https://avatars.example.org/user.png",
    "https://ipfs.io/ipfs/bafybeigdyrzt/avatar.webp",
    "https://cdn.example.org:443/a.png?size=128",
    "https://8.8.8.8/avatar.png",
    "https://[2606:4700:4700::1111]/avatar.png",
  ]) {
    assert.equal(isAllowedAvatarUrl(url), true, url);
  }
});

test("avatar fetch policy rejects SSRF targets, credentials, and unsafe schemes", () => {
  for (const url of [
    "http://images.example.org/a.png",
    "data:image/svg+xml,<svg/>",
    "file:///etc/passwd",
    "https://user:password@example.org/a.png",
    "https://example.org:8443/a.png",
    "https://localhost/a.png",
    "https://service.local/a.png",
    "https://service.internal/a.png",
    "https://127.0.0.1/a.png",
    "https://127.1/a.png",
    "https://0.0.0.0/a.png",
    "https://10.0.0.1/a.png",
    "https://169.254.169.254/latest/meta-data",
    "https://172.16.0.1/a.png",
    "https://192.168.0.1/a.png",
    "https://224.0.0.1/a.png",
    "https://[::1]/a.png",
    "https://[::ffff:127.0.0.1]/a.png",
    "https://[::ffff:7f00:1]/a.png",
    "https://[::ffff:a9fe:a9fe]/latest/meta-data",
    "https://[fc00::1]/a.png",
    "https://[fe80::1]/a.png",
    "https://[fec0::1]/a.png",
    "https://[ff02::1]/a.png",
    `https://example.org/${"x".repeat(2_100)}`,
  ]) {
    assert.equal(isAllowedAvatarUrl(url), false, url);
  }
});

test("avatar decoder accepts explicit raster MIME types and rejects documents", () => {
  for (const contentType of [
    "image/png",
    "image/jpeg; charset=binary",
    "IMAGE/WEBP",
    "image/gif",
    "image/avif",
    "image/x-icon",
  ]) {
    assert.equal(isAllowedRasterImageContentType(contentType), true, contentType);
    assert.ok(normalizeAvatarRasterContentType(contentType));
  }
  for (const contentType of [
    "image/svg+xml",
    "image/svg+xml; charset=utf-8",
    "text/html",
    "application/octet-stream",
    "",
    null,
  ]) {
    assert.equal(isAllowedRasterImageContentType(contentType), false);
    assert.equal(normalizeAvatarRasterContentType(contentType), null);
  }
});

test("persisted cache policy admits inert raster data only", () => {
  const raster = "data:image/webp;base64,AQ==";
  assert.equal(isAllowedCachedAvatarDataUrl(raster), true);
  assert.equal(sanitizeTrustedRendererImageSrc(raster), raster);
  for (const source of [
    "https://tracker.example/seen.png",
    "data:image/svg+xml,<svg onload=alert(1)/>",
    "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=",
    `data:image/webp;base64,${"A".repeat(700_001)}`,
  ]) {
    assert.equal(isAllowedCachedAvatarDataUrl(source), false, source.slice(0, 80));
  }
});

test("untrusted page icons and trusted renderers retain separate boundaries", () => {
  const raster = "data:image/png;base64,iVBORw0KGgo=";
  assert.equal(sanitizeUntrustedImageUrl("https://cdn.example.org/icon.png"), "https://cdn.example.org/icon.png");
  assert.equal(sanitizeUntrustedImageUrl(raster), raster);
  assert.equal(sanitizeUntrustedImageUrl("data:image/svg+xml,<svg/>"), null);
  assert.equal(sanitizeTrustedRendererImageSrc("https://cdn.example.org/icon.png"), null);
  assert.equal(sanitizeTrustedRendererImageSrc(raster), raster);
});
