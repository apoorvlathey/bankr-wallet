export async function withGlobalReplacements<T>(
  replacements: Record<PropertyKey, unknown>,
  run: () => Promise<T>,
): Promise<T> {
  const descriptors = new Map<PropertyKey, PropertyDescriptor | undefined>();
  for (const key of Reflect.ownKeys(replacements)) {
    descriptors.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, {
      configurable: true,
      writable: true,
      value: replacements[key],
    });
  }
  try {
    return await run();
  } finally {
    for (const [key, descriptor] of descriptors) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
}

export interface MockStorageRuntime {
  values: Record<string, unknown>;
  chrome: unknown;
}

export function createMockStorageRuntime(
  initial: Record<string, unknown> = {},
  hooks: {
    beforeGet?: () => Promise<void>;
    beforeSet?: () => Promise<void>;
    beforeRemove?: () => Promise<void>;
  } = {},
): MockStorageRuntime {
  const values = structuredClone(initial);
  return {
    values,
    chrome: {
      storage: {
        local: {
          async get(key: string) {
            await hooks.beforeGet?.();
            return { [key]: structuredClone(values[key]) };
          },
          async set(update: Record<string, unknown>) {
            await hooks.beforeSet?.();
            Object.assign(values, structuredClone(update));
          },
          async remove(key: string) {
            await hooks.beforeRemove?.();
            delete values[key];
          },
        },
      },
    },
  };
}

export function deferred<T = void>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
} {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}
