export type StorageRecord = Record<string, unknown>;

type StorageAreaName = "local" | "sync" | "session";

export interface StorageWrite {
  area: StorageAreaName;
  operation: "set" | "remove" | "clear";
  value?: unknown;
}

export interface StorageFailure {
  area: StorageAreaName;
  operation: StorageWrite["operation"];
  key?: string;
  /** Ignore this many matching operations before failing the next one. */
  skipMatches?: number;
  error?: Error;
}

function clone<T>(value: T): T {
  return value === undefined ? value : structuredClone(value);
}

function selectValues(
  storage: StorageRecord,
  keys?: string | string[] | StorageRecord | null,
): StorageRecord {
  if (keys == null) return clone(storage);
  if (typeof keys === "string") {
    return storage[keys] === undefined
      ? {}
      : { [keys]: clone(storage[keys]) };
  }
  if (Array.isArray(keys)) {
    return Object.fromEntries(
      keys.flatMap((key) =>
        storage[key] === undefined ? [] : [[key, clone(storage[key])]],
      ),
    );
  }
  return Object.fromEntries(
    Object.entries(keys).map(([key, fallback]) => [
      key,
      clone(storage[key] === undefined ? fallback : storage[key]),
    ]),
  );
}

export function createChromeStorageHarness(
  initial: Partial<Record<StorageAreaName, StorageRecord>> = {},
) {
  const originalChrome = Object.getOwnPropertyDescriptor(globalThis, "chrome");
  const stores: Record<StorageAreaName, StorageRecord> = {
    local: clone(initial.local ?? {}),
    sync: clone(initial.sync ?? {}),
    session: clone(initial.session ?? {}),
  };
  const writes: StorageWrite[] = [];
  const failures: StorageFailure[] = [];
  const runtimeMessages: unknown[] = [];
  const storageListeners = new Set<(...args: unknown[]) => void>();

  const takeFailure = (
    area: StorageAreaName,
    operation: StorageWrite["operation"],
    keys: readonly string[] = [],
  ): StorageFailure | null => {
    for (let index = 0; index < failures.length; index++) {
      const failure = failures[index];
      if (
        failure.area !== area ||
        failure.operation !== operation ||
        (failure.key && !keys.includes(failure.key))
      ) {
        continue;
      }
      if ((failure.skipMatches ?? 0) > 0) {
        failure.skipMatches = (failure.skipMatches ?? 0) - 1;
        continue;
      }
      failures.splice(index, 1);
      return failure;
    }
    return null;
  };

  const storageArea = (area: StorageAreaName) => ({
    get(
      keys?: string | string[] | StorageRecord | null,
      callback?: (values: StorageRecord) => void,
    ) {
      const values = selectValues(stores[area], keys);
      if (callback) {
        callback(values);
        return;
      }
      return Promise.resolve(values);
    },
    async set(values: StorageRecord) {
      const failure = takeFailure(area, "set", Object.keys(values));
      if (failure) {
        throw failure.error ?? new Error("Simulated storage set failure");
      }
      const copied = clone(values);
      Object.assign(stores[area], copied);
      writes.push({ area, operation: "set", value: copied });
    },
    async remove(keys: string | string[]) {
      const list = Array.isArray(keys) ? keys : [keys];
      const failure = takeFailure(area, "remove", list);
      if (failure) {
        throw failure.error ?? new Error("Simulated storage remove failure");
      }
      const copied = clone(keys);
      for (const key of list) {
        delete stores[area][key];
      }
      writes.push({ area, operation: "remove", value: copied });
    },
    async clear() {
      const failure = takeFailure(area, "clear");
      if (failure) {
        throw failure.error ?? new Error("Simulated storage clear failure");
      }
      for (const key of Object.keys(stores[area])) delete stores[area][key];
      writes.push({ area, operation: "clear" });
    },
  });

  Object.defineProperty(globalThis, "chrome", {
    configurable: true,
    value: {
      runtime: {
        lastError: undefined,
        onStartup: { addListener() {} },
        async sendMessage(message: unknown) {
          runtimeMessages.push(clone(message));
        },
      },
      storage: {
        local: storageArea("local"),
        sync: storageArea("sync"),
        session: storageArea("session"),
        onChanged: {
          addListener(listener: (...args: unknown[]) => void) {
            storageListeners.add(listener);
          },
          removeListener(listener: (...args: unknown[]) => void) {
            storageListeners.delete(listener);
          },
        },
      },
    },
  });

  return {
    stores,
    writes,
    runtimeMessages,
    failNext(failure: StorageFailure): void {
      failures.push(failure);
    },
    snapshot(area: StorageAreaName): StorageRecord {
      return clone(stores[area]);
    },
    clearObservations(): void {
      writes.length = 0;
      runtimeMessages.length = 0;
      failures.length = 0;
    },
    restore(): void {
      if (originalChrome) {
        Object.defineProperty(globalThis, "chrome", originalChrome);
      } else {
        Reflect.deleteProperty(globalThis, "chrome");
      }
    },
  };
}
