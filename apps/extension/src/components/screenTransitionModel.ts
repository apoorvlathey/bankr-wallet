export type ScreenTransitionKind = "slide" | "fade";

export interface ScreenTransitionMeta {
  kind: ScreenTransitionKind;
  depth: number;
}
export interface ScreenTransitionPlan {
  direction: "forward" | "back";
  kind: ScreenTransitionKind;
}

/**
 * Keeps the navigation decision independent from the animation runtime so it
 * can be regression-tested without mounting React or Framer Motion.
 */
export function getScreenTransitionPlan(
  previous: ScreenTransitionMeta,
  next: ScreenTransitionMeta,
): ScreenTransitionPlan {
  const useFade = previous.kind === "fade" || next.kind === "fade";

  return {
    direction: next.depth > previous.depth || useFade ? "forward" : "back",
    kind: useFade ? "fade" : "slide",
  };
}
