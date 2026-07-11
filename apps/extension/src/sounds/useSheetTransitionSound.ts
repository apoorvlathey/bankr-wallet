import { useEffect, useRef } from "react";
import { playInteractionSound } from "@/sounds/soundManager";

/** Plays the shared bottom-sheet cue once for each open or close transition. */
export function useSheetTransitionSound(isOpen: boolean): void {
  const previousIsOpen = useRef(false);

  useEffect(() => {
    if (isOpen === previousIsOpen.current) return;
    previousIsOpen.current = isOpen;
    void playInteractionSound("actionSheetTransition");
  }, [isOpen]);
}
