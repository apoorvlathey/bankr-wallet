import { SnapshotDetector, snapshotFromConfig } from "./detector.js";
import { SnapshotRepository } from "./snapshotRepository.js";
import {
  fetchSourceConfig,
  SOURCE_URL,
  type SourceFetchResult,
} from "./sourceClient.js";

const SYNC_INTERVAL_MS = 5 * 60 * 1_000;

export class SnapshotManager {
  #detector: SnapshotDetector | null = null;
  #timer: ReturnType<typeof setInterval> | null = null;
  #refreshing: Promise<void> | null = null;

  constructor(
    private readonly repository: SnapshotRepository,
    private readonly fetchSource: (
      etag: string | null,
    ) => Promise<SourceFetchResult> = fetchSourceConfig,
    private readonly now: () => number = Date.now,
  ) {}

  get detector(): SnapshotDetector | null {
    return this.#detector;
  }

  async start(): Promise<void> {
    const stored = await this.repository.load();
    if (stored) {
      this.#detector = new SnapshotDetector(stored, this.now);
      console.info("[domain-reputation]", {
        event: "snapshot_loaded",
        fetchedAt: stored.fetchedAt,
        version: stored.config.version,
      });
    }
    await this.refresh().catch((error) => {
      console.error("[domain-reputation]", {
        event: "sync_failed",
        error: error instanceof Error ? error.message : "unknown error",
      });
    });
    this.#timer = setInterval(() => {
      void this.refresh().catch((error) => {
        console.error("[domain-reputation]", {
          event: "sync_failed",
          error: error instanceof Error ? error.message : "unknown error",
        });
      });
    }, SYNC_INTERVAL_MS);
    this.#timer.unref();
  }

  stop(): void {
    if (this.#timer) clearInterval(this.#timer);
    this.#timer = null;
  }

  refresh(): Promise<void> {
    if (this.#refreshing) return this.#refreshing;
    this.#refreshing = this.#refresh().finally(() => {
      this.#refreshing = null;
    });
    return this.#refreshing;
  }

  async #refresh(): Promise<void> {
    const current = this.#detector?.snapshot ?? null;
    const result = await this.fetchSource(current?.etag ?? null);
    if (result.kind === "not-modified") {
      if (!current) throw new Error("source returned 304 without a snapshot");
      const refreshed = {
        ...current,
        fetchedAt: new Date(this.now()).toISOString(),
      };
      await this.repository.save(refreshed);
      this.#detector = new SnapshotDetector(refreshed, this.now);
      console.info("[domain-reputation]", {
        event: "sync_not_modified",
        fetchedAt: refreshed.fetchedAt,
      });
      return;
    }
    const snapshot = snapshotFromConfig(
      result.config,
      SOURCE_URL,
      new Date(this.now()).toISOString(),
      result.etag,
    );
    await this.repository.save(snapshot);
    this.#detector = new SnapshotDetector(snapshot, this.now);
    console.info("[domain-reputation]", {
      event: "sync_success",
      fetchedAt: snapshot.fetchedAt,
      version: snapshot.config.version,
      blacklistEntries: snapshot.config.blacklist.length,
      whitelistEntries: snapshot.config.whitelist.length,
    });
  }
}
