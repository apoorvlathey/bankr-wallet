import { useCallback, useEffect, useState } from "react";
import {
  initializeSoundManager,
  saveSoundsEnabled,
  subscribeToSoundsEnabled,
} from "./soundManager";

export function useSoundsEnabled() {
  const [enabled, setEnabled] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;
    const unsubscribe = subscribeToSoundsEnabled((next) => {
      if (active) setEnabled(next);
    });

    void initializeSoundManager().then((stored) => {
      if (active) setEnabled(stored);
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const update = useCallback(async (next: boolean) => {
    setEnabled(next);
    await saveSoundsEnabled(next);
  }, []);

  return { enabled, setEnabled: update };
}
