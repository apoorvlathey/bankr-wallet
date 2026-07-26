import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { snapshotFromConfig } from "../src/detector.js";
import { SnapshotManager } from "../src/snapshotManager.js";
import { SnapshotRepository } from "../src/snapshotRepository.js";
import { fetchSourceConfig, SOURCE_URL } from "../src/sourceClient.js";

const config = {
  version: 2 as const,
  tolerance: 1,
  whitelist: [],
  blacklist: ["blocked.example"],
  fuzzylist: ["metamask.io"],
};

test("source client sends ETags and accepts a 304 without parsing a body", async () => {
  let observedEtag = "";
  const result = await fetchSourceConfig('"etag-1"', async (_input, init) => {
    observedEtag = new Headers(init?.headers).get("if-none-match") ?? "";
    return new Response(null, { status: 304 });
  });
  assert.equal(observedEtag, '"etag-1"');
  assert.deepEqual(result, { kind: "not-modified" });
});

test("snapshot repository falls back to the previous validated snapshot", async () => {
  const directory = await mkdtemp(join(tmpdir(), "walletchan-reputation-"));
  const repository = new SnapshotRepository(directory);
  const first = snapshotFromConfig(
    config,
    SOURCE_URL,
    "2026-07-26T00:00:00.000Z",
  );
  await repository.save(first);
  await repository.save({
    ...first,
    fetchedAt: "2026-07-26T00:05:00.000Z",
  });
  await writeFile(
    join(directory, "eth-phishing-detect.current.json"),
    "{corrupt",
    "utf8",
  );
  assert.deepEqual(await repository.load(), first);
});

test("a successful 304 refreshes snapshot freshness", async () => {
  const directory = await mkdtemp(join(tmpdir(), "walletchan-reputation-"));
  const repository = new SnapshotRepository(directory);
  await repository.save(
    snapshotFromConfig(
      config,
      SOURCE_URL,
      "2026-07-26T00:00:00.000Z",
      '"etag-1"',
    ),
  );
  const manager = new SnapshotManager(
    repository,
    async () => ({ kind: "not-modified" }),
    () => Date.parse("2026-07-26T00:05:00.000Z"),
  );
  await manager.start();
  manager.stop();
  assert.equal(
    manager.detector?.snapshot.fetchedAt,
    "2026-07-26T00:05:00.000Z",
  );
  assert.equal(manager.detector?.check("ordinary.example").snapshot.stale, false);
});
