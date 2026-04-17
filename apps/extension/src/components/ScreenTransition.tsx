import {
  useEffect,
  useRef,
  type ReactNode,
} from "react";
import { Box } from "@chakra-ui/react";
import {
  AnimatePresence,
  motion,
  useReducedMotion,
  type Transition,
  type Variants,
} from "framer-motion";
import { useTheme } from "@/theme";

export type AppView =
  | "main"
  | "unlock"
  | "settings"
  | "settingsAddChain"
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
// entering and down when exiting back. Dapp-initiated confirmations sit at
// depth 1 so they animate in the same way as opening Settings/Swap/etc. from
// the homepage.
export const SCREEN_META: Record<AppView, ScreenMeta> = {
  main: { kind: "slide", depth: 0 },
  settings: { kind: "slide", depth: 1 },
  settingsAddChain: { kind: "slide", depth: 2 },
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

interface DirectionCustom {
  forward: boolean;
}

function buildSlideVariants(t: Transition): Variants {
  // Asymmetric slide:
  //   forward (going deeper): new screen slides UP from bottom over the old;
  //     old screen stays put beneath (new has higher z-index).
  //   back (popping out): old screen slides DOWN off the bottom, revealing
  //     the new screen beneath (old has higher z-index, new is static).
  // This gives the spatial cue that the homepage is the "base layer" and
  // feature pages are stacked on top of it.
  return {
    initial: ({ forward }: DirectionCustom) => ({
      y: forward ? "100%" : "0%",
      zIndex: forward ? 2 : 1,
    }),
    animate: ({ forward }: DirectionCustom) => ({
      y: "0%",
      zIndex: forward ? 2 : 1,
      transition: t,
    }),
    exit: ({ forward }: DirectionCustom) => ({
      y: forward ? "0%" : "100%",
      zIndex: forward ? 1 : 2,
      transition: t,
    }),
  };
}

function buildFadeVariants(t: Transition): Variants {
  return {
    initial: { opacity: 0, zIndex: 1 },
    animate: { opacity: 1, zIndex: 1, transition: t },
    exit: { opacity: 0, zIndex: 1, transition: t },
  };
}

interface ScreenStackProps {
  view: AppView;
  children: ReactNode;
}

export function ScreenStack({ view, children }: ScreenStackProps) {
  const { tokens } = useTheme();
  const prefersReduced = useReducedMotion();

  const prevViewRef = useRef<AppView>(view);
  const prev = prevViewRef.current;
  useEffect(() => {
    prevViewRef.current = view;
  }, [view]);

  const meta = SCREEN_META[view];
  const prevMeta = SCREEN_META[prev];
  const forward = meta.depth > prevMeta.depth;

  // Any transition touching unlock/waitingForOnboarding uses fade on both
  // sides so the exit/enter feel symmetric.
  const useFade = meta.kind === "fade" || prevMeta.kind === "fade";

  const duration = prefersReduced ? 0 : tokens.motion.screenDuration;
  const t: Transition = { duration, ease: tokens.motion.screenEase };
  const variants = useFade ? buildFadeVariants(t) : buildSlideVariants(t);
  const custom: DirectionCustom = { forward };

  return (
    <Box position="relative" h="100%" w="100%" overflow="hidden">
      <AnimatePresence initial={false} custom={custom}>
        <motion.div
          key={view}
          variants={variants}
          initial="initial"
          animate="animate"
          exit="exit"
          custom={custom}
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
          }}
        >
          {children}
        </motion.div>
      </AnimatePresence>
    </Box>
  );
}
