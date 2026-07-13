import type { PopupPlacement, WindowBounds } from "./types";

export const POPUP_WINDOW_WIDTH = 360;
export const POPUP_WINDOW_HEIGHT = 680;

const RIGHT_INSET = 10;
const TOP_INSET = 80;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

/**
 * Places the detached popup at the request window's top-right and clamps it to
 * that window's work area. Negative coordinates remain valid for monitors to
 * the left of the primary display.
 */
export function popupPlacementForWindow(
  targetWindow: WindowBounds | null,
): PopupPlacement {
  if (
    targetWindow?.left === undefined ||
    targetWindow.width === undefined ||
    targetWindow.top === undefined
  ) {
    return {};
  }

  const minimumLeft = targetWindow.left;
  const maximumLeft =
    targetWindow.left + Math.max(0, targetWindow.width - POPUP_WINDOW_WIDTH);
  const desiredLeft =
    targetWindow.left +
    targetWindow.width -
    POPUP_WINDOW_WIDTH -
    RIGHT_INSET;

  let top = targetWindow.top + TOP_INSET;
  if (targetWindow.height !== undefined) {
    const maximumTop =
      targetWindow.top +
      Math.max(0, targetWindow.height - POPUP_WINDOW_HEIGHT);
    top = clamp(top, targetWindow.top, maximumTop);
  }

  return {
    left: clamp(desiredLeft, minimumLeft, maximumLeft),
    top,
  };
}
