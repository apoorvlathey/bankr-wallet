import {
  copyFile,
  mkdir,
  readFile,
  rename,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import type { StoredSnapshot } from "./types.js";
import { parseStoredSnapshot } from "./validation.js";

const CURRENT_FILE = "eth-phishing-detect.current.json";
const PREVIOUS_FILE = "eth-phishing-detect.previous.json";

export class SnapshotRepository {
  constructor(readonly directory: string) {}

  async load(): Promise<StoredSnapshot | null> {
    for (const filename of [CURRENT_FILE, PREVIOUS_FILE]) {
      try {
        const parsed = parseStoredSnapshot(
          JSON.parse(await readFile(join(this.directory, filename), "utf8")),
        );
        if (parsed) return parsed;
      } catch {
        // Try the previous last-known-good snapshot.
      }
    }
    return null;
  }

  async save(snapshot: StoredSnapshot): Promise<void> {
    await mkdir(this.directory, { recursive: true });
    const current = join(this.directory, CURRENT_FILE);
    const previous = join(this.directory, PREVIOUS_FILE);
    const temporary = join(
      this.directory,
      `${CURRENT_FILE}.${process.pid}.${Date.now()}.tmp`,
    );
    await writeFile(temporary, JSON.stringify(snapshot), {
      encoding: "utf8",
      mode: 0o600,
    });
    await copyFile(current, previous).catch(() => {});
    await rename(temporary, current);
  }
}
