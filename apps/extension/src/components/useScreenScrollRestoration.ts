import { useCallback, useEffect, useRef, type RefObject } from "react";

const RESTORE_TIMEOUT_MS = 1_000;

/** Reapplies a saved offset after async screen content has rebuilt its height. */
export function useScreenScrollRestoration(
  containerRef: RefObject<HTMLElement>,
) {
  const frameRef = useRef<number | null>(null);

  const cancel = useCallback(() => {
    if (frameRef.current === null) return;
    cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
  }, []);

  const restore = useCallback(
    (scrollTop: number) => {
      cancel();
      const startedAt = performance.now();

      const apply = () => {
        const scrollOwner = containerRef.current?.querySelector<HTMLElement>(
          "[data-screen-scroll-owner]",
        );
        if (scrollOwner) {
          scrollOwner.scrollTop = scrollTop;
          if (Math.abs(scrollOwner.scrollTop - scrollTop) <= 1) {
            frameRef.current = null;
            return;
          }
        }

        if (performance.now() - startedAt >= RESTORE_TIMEOUT_MS) {
          frameRef.current = null;
          return;
        }
        frameRef.current = requestAnimationFrame(apply);
      };

      apply();
    },
    [cancel, containerRef],
  );

  useEffect(() => cancel, [cancel]);

  return { cancel, restore };
}
