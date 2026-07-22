import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Box } from "@chakra-ui/react";
import { motion, useReducedMotion, type Transition } from "framer-motion";
import { useTheme } from "@/theme";
import {
  getScreenTransitionPlan,
  type ScreenTransitionKind,
} from "./screenTransitionModel";
import { createScreenAnimationCompletionGate } from "./screenAnimationCompletionGate";
import { useScreenScrollRestoration } from "./useScreenScrollRestoration";
const ScreenEnteredContext = createContext<boolean>(true);
// eslint-disable-next-line react-refresh/only-export-components
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
  | "erc7715PermissionConfirm"
  | "watchAssetConfirm"
  | "addChainConfirm"
  | "dappConnectionConfirm"
  | "waitingForOnboarding"
  | "chat"
  | "addAccount"
  | "safeApprovals"
  | "transfer"
  | "swap"
  | "staking"
  | "shield"
  | "more"
  | "hideTokens"
  | "hiddenTokens"
  | "walletConnect"
  | "batchTxConfirm"
  | "crossDappBatchConfirm"
  | "txDetail";

interface ScreenMeta {
  kind: ScreenTransitionKind;
  depth: number;
}
// eslint-disable-next-line react-refresh/only-export-components
export const SCREEN_META: Record<AppView, ScreenMeta> = {
  main: { kind: "slide", depth: 0 },
  settings: { kind: "slide", depth: 1 },
  settingsAddChain: { kind: "slide", depth: 2 },
  accountSettings: { kind: "slide", depth: 1 },
  swap: { kind: "slide", depth: 1 },
  staking: { kind: "slide", depth: 2 },
  shield: { kind: "slide", depth: 1 },
  transfer: { kind: "slide", depth: 1 },
  more: { kind: "slide", depth: 1 },
  hideTokens: { kind: "slide", depth: 2 },
  hiddenTokens: { kind: "slide", depth: 3 },
  walletConnect: { kind: "slide", depth: 1 },
  chat: { kind: "slide", depth: 1 },
  addAccount: { kind: "slide", depth: 1 },
  safeApprovals: { kind: "slide", depth: 1 },
  pendingTxList: { kind: "slide", depth: 1 },
  txDetail: { kind: "slide", depth: 2 },
  txConfirm: { kind: "slide", depth: 1 },
  batchTxConfirm: { kind: "slide", depth: 1 },
  crossDappBatchConfirm: { kind: "slide", depth: 1 },
  signatureConfirm: { kind: "slide", depth: 1 },
  erc7715PermissionConfirm: { kind: "slide", depth: 1 },
  watchAssetConfirm: { kind: "slide", depth: 1 },
  addChainConfirm: { kind: "slide", depth: 1 },
  dappConnectionConfirm: { kind: "slide", depth: 1 },
  unlock: { kind: "fade", depth: 0 },
  waitingForOnboarding: { kind: "fade", depth: 0 },
};
interface Snapshot {
  view: AppView;
  children: ReactNode;
}

interface AboveLayer {
  view: AppView;
  children: ReactNode;
  role: "enter" | "exit";
  kind: ScreenTransitionKind;
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
  const completionGateRef = useRef(createScreenAnimationCompletionGate());
  const completionTimerRef = useRef<number | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const navigationStateRef = useRef(
    new Map<AppView, { scrollTop: number; focusPath: number[] | null }>(),
  );
  const pendingBackRestoreRef = useRef<AppView | null>(null);
  const { cancel: cancelScrollRestore, restore: restoreScroll } =
    useScreenScrollRestoration(containerRef);
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

    cancelScrollRestore();
    if (completionTimerRef.current !== null) {
      window.clearTimeout(completionTimerRef.current);
      completionTimerRef.current = null;
    }

    const prevMeta = SCREEN_META[prevView];
    const nextMeta = SCREEN_META[view];
    const plan = getScreenTransitionPlan(prevMeta, nextMeta);
    const forward = plan.direction === "forward";
    const useFade = plan.kind === "fade";
    const kind = plan.kind;

    const container = containerRef.current;
    if (container) {
      const scrollOwner = container.querySelector<HTMLElement>(
        "[data-screen-scroll-owner]",
      );
      const activeElement = document.activeElement;
      let focusPath: number[] | null = null;

      if (
        activeElement instanceof HTMLElement &&
        container.contains(activeElement)
      ) {
        const path: number[] = [];
        let node: Element | null = activeElement;
        while (node && node !== container) {
          const parent: Element | null = node.parentElement;
          if (!parent) break;
          path.unshift(Array.from(parent.children).indexOf(node));
          node = parent;
        }
        if (node === container) focusPath = path;
      }

      navigationStateRef.current.set(prevView, {
        scrollTop: scrollOwner?.scrollTop ?? 0,
        focusPath,
      });
      const shouldReleaseFocus = (forward || useFade) &&
        activeElement instanceof HTMLElement && container.contains(activeElement);
      if (shouldReleaseFocus) activeElement.blur();
    }
    pendingBackRestoreRef.current = forward ? null : view;

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
  }, [view, children, cancelScrollRestore]);

  useLayoutEffect(() => {
    if (state.phase !== "transitioning" || state.above.role !== "exit") return;
    const destination = pendingBackRestoreRef.current;
    if (!destination) return;
    const saved = navigationStateRef.current.get(destination);
    if (saved) restoreScroll(saved.scrollTop, state.beneathKey);
  }, [state, restoreScroll]);

  const restoreDestinationFocus = (destination: AppView) => {
    const root = containerRef.current;
    if (!root) return;

    const saved = navigationStateRef.current.get(destination);
    let target: HTMLElement | null = null;
    if (saved?.focusPath) {
      let node: Element = root;
      for (const index of saved.focusPath) {
        const next = node.children.item(index);
        if (!next) {
          node = root;
          break;
        }
        node = next;
      }
      if (node instanceof HTMLElement && node !== root) target = node;
    }

    target ??= root.querySelector<HTMLElement>("[data-screen-heading]");
    target?.focus({ preventScroll: true });
  };

  const focusEnteredHeading = (enteredKey: number) => {
    const enteredLayer = containerRef.current?.querySelector<HTMLElement>(
      `[data-screen-layer="${enteredKey}"]`,
    );
    if (!enteredLayer) return;

    // Some destinations intentionally focus their primary control on mount
    // (for example, Settings focuses its search field). Preserve that focus
    // instead of replacing it with the heading when the slide settles.
    if (
      document.activeElement instanceof HTMLElement &&
      enteredLayer.contains(document.activeElement)
    ) {
      return;
    }

    enteredLayer
      .querySelector<HTMLElement>("[data-screen-heading]")
      ?.focus({ preventScroll: true });
  };

  const onAboveSettled = (
    completedKey: number,
    completedRole: "enter" | "exit",
    completedKind: ScreenTransitionKind,
  ) => {
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

    requestAnimationFrame(() => {
      if (completedRole === "exit" && pendingBackRestoreRef.current) {
        restoreDestinationFocus(pendingBackRestoreRef.current);
        pendingBackRestoreRef.current = null;
      } else if (completedRole === "enter" && completedKind === "slide") {
        focusEnteredHeading(completedKey);
      }
    });
  };

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

  const duration = prefersReduced
    ? Math.min(0.12, tokens.motion.screenDuration)
    : tokens.motion.screenDuration;
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
    transitionRole?: "enter" | "exit";
    transitionKind?: ScreenTransitionKind;
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
      transitionRole: state.above.role,
      transitionKind: state.above.kind,
    });
  }

  return (
    <Box
      ref={containerRef}
      position="relative"
      h="100%"
      w="100%"
      overflow="hidden"
    >
      {layers.map((layer) => {
        let initial: { x?: string; opacity?: number } | undefined;
        let animate: { x?: string; opacity?: number };
        let zIndex: number;
        let willChange: string;
        const animating = layer.role !== "stable";

        switch (layer.role) {
          case "stable":
            initial = undefined; // framer uses animate as the resting pose
            animate = { x: "0%", opacity: 1 };
            zIndex = 1;
            willChange = "auto";
            break;
          case "enter-slide":
            initial = prefersReduced ? { opacity: 0 } : { x: "100%" };
            animate = prefersReduced ? { opacity: 1 } : { x: "0%" };
            zIndex = 2;
            willChange = "transform";
            break;
          case "exit-slide":
            // No explicit initial — the motion.div was previously the stable
            // layer at x=0%, so framer tweens from its current position.
            initial = undefined;
            animate = prefersReduced ? { opacity: 0 } : { x: "100%" };
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
        const isCovered =
          state.phase === "transitioning" && layer.key === state.beneathKey;
        // React 18's DOM typings predate the declarative `inert` attribute.
        const inertProps = isCovered ? ({ inert: "" } as const) : {};

        return (
          <motion.div
            key={layer.key}
            data-screen-layer={layer.key}
            {...inertProps}
            initial={initial}
            animate={animate}
            transition={transition}
            onAnimationStart={
              animating
                ? (definition) =>
                    completionGateRef.current.start(layer.key, definition)
                : undefined
            }
            onAnimationComplete={
              animating && layer.transitionRole && layer.transitionKind
                ? (definition) => {
                    const delay = completionGateRef.current.consumeDelay(
                      layer.key,
                      definition,
                      duration * 1_000,
                    );
                    if (delay === null) return;
                    const settle = () => {
                      completionTimerRef.current = null;
                      onAboveSettled(
                        layer.key,
                        layer.transitionRole!,
                        layer.transitionKind!,
                      );
                    };
                    if (delay === 0) settle();
                    else completionTimerRef.current = window.setTimeout(settle, delay);
                  }
                : undefined
            }
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              flexDirection: "column",
              zIndex,
              willChange,
              pointerEvents: isCovered ? "none" : "auto",
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
