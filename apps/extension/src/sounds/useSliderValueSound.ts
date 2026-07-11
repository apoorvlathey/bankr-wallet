import { useCallback, useRef } from "react";
import { playInteractionSound } from "@/sounds/soundManager";

export const BALANCE_SLIDER_SNAP_POINTS = [0, 25, 50, 75, 100] as const;
const SNAP_THRESHOLD = 3;

export function snapBalanceSliderValue(value: number): number {
  const nearest = BALANCE_SLIDER_SNAP_POINTS.find(
    (point) => Math.abs(value - point) <= SNAP_THRESHOLD,
  );
  return nearest ?? value;
}

function isSnapPoint(value: number): boolean {
  return BALANCE_SLIDER_SNAP_POINTS.some((point) => point === value);
}

/**
 * Ticks for actual movement between stops and announces each newly-entered
 * snap point once. Normalizing before comparison prevents pointer jitter in a
 * snap zone from producing a stuck or repeated sound.
 */
export function useSliderValueSound(initialValue = 0) {
  const isChanging = useRef(false);
  const lastValue = useRef<number | null>(initialValue);
  const lastSnapPoint = useRef<number | null>(
    isSnapPoint(initialValue) ? initialValue : null,
  );

  const onChangeStart = useCallback((value: number) => {
    isChanging.current = true;
    lastValue.current = value;
    lastSnapPoint.current = isSnapPoint(value) ? value : null;
  }, []);

  const onValueChange = useCallback((value: number): boolean => {
    if (lastValue.current === value) return false;

    lastValue.current = value;
    if (isSnapPoint(value)) {
      if (lastSnapPoint.current !== value) {
        void playInteractionSound("sliderSnap");
      }
      lastSnapPoint.current = value;
    } else {
      lastSnapPoint.current = null;
      void playInteractionSound("sliderValueChange");
    }

    return true;
  }, []);

  const onChangeEnd = useCallback((value: number) => {
    if (!isChanging.current) return;
    isChanging.current = false;

    lastValue.current = value;
    lastSnapPoint.current = isSnapPoint(value) ? value : null;
  }, []);

  return {
    onChangeStart,
    onChangeEnd,
    onValueChange,
  };
}
