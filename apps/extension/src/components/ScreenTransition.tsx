import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Box } from "@chakra-ui/react";
import { motion, useReducedMotion, type Transition } from "framer-motion";
import { useTheme } from "@/theme";

// True once the surrounding screen's entry animation has settled.
// Stable / exit layers always read `true`. Entering layers start at `false`
// and flip when the slide/fade completes. Heavy data-bound subtrees gate
// their first fetch on this so the slide-in stays smooth (no React work +
// layout shift competing with the running animation).
const ScreenEnteredContext = createContext<boolean>(true);

export function useScreenEntered(): boolean {
  return useContext(ScreenEnteredContext);
}

export type AppView =
  | "main"
  | "unlock"
  | "settings"
  | "settingsAddChain"
  | "accountSettings"
  | "pendingTxList"
  | "txConfirm"
  | "signatureConfirm"
  | "watchAssetConfirm"
  | "addChainConfirm"
  | "waitingForOnboarding"
  | "chat"
  | "addAccount"
  | "transfer"
  | "swap"
  | "batchTxConfirm"
  | "crossDappBatchConfirm";

type TransitionKind = "slide" | "fade";

interface ScreenMeta {
  kind: TransitionKind;
  depth: number;
}

// Depth drives slide direction. Anything deeper than `main` slides up when
// entering and down when exiting back.
export const SCREEN_META: Record<AppView, ScreenMeta> = {
  main: { kind: "slide", depth: 0 },
  settings: { kind: "slide", depth: 1 },
  settingsAddChain: { kind: "slide", depth: 2 },
  accountSettings: { kind: "slide", depth: 1 },
  swap: { kind: "slide", depth: 1 },
  transfer: { kind: "slide", depth: 1 },
  chat: { kind: "slide", depth: 1 },
  addAccount: { kind: "slide", depth: 1 },
  pendingTxList: { kind: "slide", depth: 1 },
  txConfirm: { kind: "slide", depth: 1 },
  batchTxConfirm: { kind: "slide", depth: 1 },
  crossDappBatchConfirm: { kind: "slide", depth: 1 },
  signatureConfirm: { kind: "slide", depth: 1 },
  watchAssetConfirm: { kind: "slide", depth: 1 },
  addChainConfirm: { kind: "slide", depth: 1 },
  unlock: { kind: "fade", depth: 0 },
  waitingForOnboarding: { kind: "fade", depth: 0 },
};

// -----------------------------------------------------------------------
// Design notes
// -----------------------------------------------------------------------
// We don't use <AnimatePresence> — it has a quirk where the exiting element's
// props (including the `custom` passed to variants) can reflect stale values
// captured at mount time, which caused the previous implementation to pick the
// wrong exit direction on back transitions (visible as a jitter mid-slide).
//
// Instead we manage a tiny explicit state machine:
//   phase="idle"         — one active layer, no animation
//   phase="transitioning" — two layers: a static `beneath` and an animating
//                           `above`. Above is either entering (forward / fade)
//                           or exiting (back).
//
// The motion.div that holds the current view keeps the same React `key` across
// the idle ↔ transitioning boundary, so the component inside (Settings, Swap,
// etc.) is not remounted by the transition itself.
// -----------------------------------------------------------------------

interface Snapshot {
  view: AppView;
  children: ReactNode;
}

interface AboveLayer {
  view: AppView;
  children: ReactNode;
  role: "enter" | "exit";
  kind: TransitionKind;
  key: number;
}

type StackState =
  | {
      phase: "idle";
      active: Snapshot;
      activeKey: number;
    }
  | {
      phase: "transitioning";
      beneath: Snapshot;
      beneathKey: number;
      above: AboveLayer;
    };

interface ScreenStackProps {
  view: AppView;
  children: ReactNode;
}

export function ScreenStack({ view, children }: ScreenStackProps) {
  const { tokens } = useTheme();
  const prefersReduced = useReducedMotion();

  const [state, setState] = useState<StackState>(() => ({
    phase: "idle",
    active: { view, children },
    activeKey: 0,
  }));
  const lastViewRef = useRef(view);
  const keyCounter = useRef(1);
  // Set of layer keys whose entry animation has already settled. Layers
  // listed here read `true` from ScreenEnteredContext; layers absent read
  // `false`. The first/initial layer (key=0) is considered entered.
  const [enteredKeys, setEnteredKeys] = useState<Set<number>>(
    () => new Set([0]),
  );

  useEffect(() => {
    const prevView = lastViewRef.current;

    // Same view — children may have changed (e.g. re-render). Update whichever
    // snapshot currently holds this view so the new React element is shown.
    if (prevView === view) {
      setState((s) => {
        if (s.phase === "idle" && s.active.view === view) {
          if (s.active.children === children) return s;
          return { ...s, active: { view, children } };
        }
        if (s.phase === "transitioning") {
          if (s.above.view === view && s.above.children !== children) {
            return { ...s, above: { ...s.above, children } };
          }
          if (s.beneath.view === view && s.beneath.children !== children) {
            return { ...s, beneath: { view, children } };
          }
        }
        return s;
      });
      return;
    }

    lastViewRef.current = view;

    const prevMeta = SCREEN_META[prevView];
    const nextMeta = SCREEN_META[view];
    const forward = nextMeta.depth > prevMeta.depth;
    const useFade =
      nextMeta.kind === "fade" || prevMeta.kind === "fade";
    const kind: TransitionKind = useFade ? "fade" : "slide";

    setState((s) => {
      // The currently-visible snapshot (and its key). If we were already
      // transitioning, the visible one is whichever layer is "entering" (it's
      // on top and recently in focus) or the beneath one (if an exit was in
      // flight).
      let currentSnap: Snapshot;
      let currentKey: number;
      if (s.phase === "idle") {
        currentSnap = s.active;
        currentKey = s.activeKey;
      } else if (s.above.role === "enter") {
        currentSnap = { view: s.above.view, children: s.above.children };
        currentKey = s.above.key;
      } else {
        currentSnap = s.beneath;
        currentKey = s.beneathKey;
      }

      if (forward || useFade) {
        // New layer slides/fades in on top; current stays static beneath.
        const newKey = keyCounter.current++;
        return {
          phase: "transitioning",
          beneath: currentSnap,
          beneathKey: currentKey,
          above: {
            view,
            children,
            role: "enter",
            kind,
            key: newKey,
          },
        };
      }

      // Back: current layer stays on top and animates out; destination is
      // mounted beneath (no entry animation; it's revealed as the old one
      // slides away). Mark the destination key as entered immediately —
      // there's no slide-in for the beneath layer, so its data-bound
      // children should fetch right away.
      const newKey = keyCounter.current++;
      setEnteredKeys((prev) => {
        if (prev.has(newKey)) return prev;
        const next = new Set(prev);
        next.add(newKey);
        return next;
      });
      return {
        phase: "transitioning",
        beneath: { view, children },
        beneathKey: newKey,
        above: {
          view: currentSnap.view,
          children: currentSnap.children,
          role: "exit",
          kind,
          key: currentKey,
        },
      };
    });
  }, [view, children]);

  const onAboveSettled = (completedKey: number) => {
    setState((s) => {
      if (s.phase !== "transitioning") return s;
      if (s.above.key !== completedKey) return s;
      if (s.above.role === "enter") {
        return {
          phase: "idle",
          active: { view: s.above.view, children: s.above.children },
          activeKey: s.above.key,
        };
      }
      return {
        phase: "idle",
        active: s.beneath,
        activeKey: s.beneathKey,
      };
    });
    // Mark the now-settled layer as entered. Children of that layer will
    // re-render with `useScreenEntered() === true` and can kick off their
    // deferred data fetches.
    setEnteredKeys((prev) => {
      if (prev.has(completedKey)) return prev;
      const next = new Set(prev);
      next.add(completedKey);
      return next;
    });
  };

  // Prune entered keys that no longer correspond to a live layer so the set
  // doesn't grow forever across hundreds of navigations.
  useEffect(() => {
    setEnteredKeys((prev) => {
      const liveKeys =
        state.phase === "idle"
          ? [state.activeKey]
          : [state.beneathKey, state.above.key];
      let changed = false;
      const next = new Set<number>();
      for (const k of prev) {
        if (liveKeys.includes(k)) next.add(k);
        else changed = true;
      }
      return changed ? next : prev;
    });
  }, [state]);

  const duration = prefersReduced ? 0 : tokens.motion.screenDuration;
  const transition: Transition = {
    duration,
    ease: tokens.motion.screenEase,
  };

  // Flatten to an ordered list of motion.divs. Keyed so React preserves the
  // existing screen's DOM node across the idle ↔ transitioning boundary.
  type Role =
    | "stable"
    | "enter-slide"
    | "exit-slide"
    | "enter-fade"
    | "exit-fade";
  interface RenderLayer {
    key: number;
    children: ReactNode;
    role: Role;
  }
  const layers: RenderLayer[] = [];
  if (state.phase === "idle") {
    layers.push({
      key: state.activeKey,
      children: state.active.children,
      role: "stable",
    });
  } else {
    layers.push({
      key: state.beneathKey,
      children: state.beneath.children,
      role: "stable",
    });
    const aboveRole: Role =
      state.above.role === "enter"
        ? state.above.kind === "fade"
          ? "enter-fade"
          : "enter-slide"
        : state.above.kind === "fade"
          ? "exit-fade"
          : "exit-slide";
    layers.push({
      key: state.above.key,
      children: state.above.children,
      role: aboveRole,
    });
  }

  return (
    <Box position="relative" h="100%" w="100%" overflow="hidden">
      {layers.map((layer) => {
        let initial: { y?: string; opacity?: number } | undefined;
        let animate: { y?: string; opacity?: number };
        let zIndex: number;
        let willChange: string;
        const animating = layer.role !== "stable";

        switch (layer.role) {
          case "stable":
            initial = undefined; // framer uses animate as the resting pose
            animate = { y: "0%", opacity: 1 };
            zIndex = 1;
            willChange = "auto";
            break;
          case "enter-slide":
            initial = { y: "100%" };
            animate = { y: "0%" };
            zIndex = 2;
            willChange = "transform";
            break;
          case "exit-slide":
            // No explicit initial — the motion.div was previously the stable
            // layer at y=0%, so framer tweens from its current position.
            initial = undefined;
            animate = { y: "100%" };
            zIndex = 2;
            willChange = "transform";
            break;
          case "enter-fade":
            initial = { opacity: 0 };
            animate = { opacity: 1 };
            zIndex = 2;
            willChange = "opacity";
            break;
          case "exit-fade":
            initial = undefined;
            animate = { opacity: 0 };
            zIndex = 2;
            willChange = "opacity";
            break;
        }

        const layerEntered = enteredKeys.has(layer.key);

        return (
          <motion.div
            key={layer.key}
            initial={initial}
            animate={animate}
            transition={transition}
            onAnimationComplete={
              animating ? () => onAboveSettled(layer.key) : undefined
            }
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              flexDirection: "column",
              zIndex,
              willChange,
            }}
          >
            <ScreenEnteredContext.Provider value={layerEntered}>
              {layer.children}
            </ScreenEnteredContext.Provider>
          </motion.div>
        );
      })}
    </Box>
  );
}
