export interface ScreenAnimationCompletionGate {
  start: (layerKey: number, definition: unknown, startedAt?: number) => void;
  consumeDelay: (
    layerKey: number,
    definition: unknown,
    minimumDurationMs: number,
    completedAt?: number,
  ) => number | null;
}

/** Ignore completion callbacks left over from a layer's previous resting pose. */
export function createScreenAnimationCompletionGate(): ScreenAnimationCompletionGate {
  const startedAnimations = new Map<number, { definition: unknown; startedAt: number }>();

  return {
    start: (layerKey, definition, startedAt = performance.now()) => {
      startedAnimations.set(layerKey, { definition, startedAt });
    },
    consumeDelay: (
      layerKey,
      definition,
      minimumDurationMs,
      completedAt = performance.now(),
    ) => {
      const started = startedAnimations.get(layerKey);
      if (!started || started.definition !== definition) return null;
      startedAnimations.delete(layerKey);
      return Math.max(0, minimumDurationMs - (completedAt - started.startedAt));
    },
  };
}
