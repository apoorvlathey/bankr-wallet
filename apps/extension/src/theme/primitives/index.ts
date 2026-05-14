/**
 * Public API for theme primitives.
 *
 * Phase 2 of the theming rollout — see _docs/THEMING_PRD.md. These five
 * primitives are the atoms every subsequent migration phase consumes
 * instead of inlining surface / icon / form / decorator markup.
 *
 * Components should `import { ThemedCard, IconBox } from "@/theme"` (the
 * top-level barrel re-exports everything here) rather than reaching into
 * `@/theme/primitives` directly.
 */

export { ThemedCard } from "./ThemedCard";
export type { ThemedCardProps, ThemedCardVariant, ThemedCardWeight } from "./ThemedCard";

export { ThemedPanel } from "./ThemedPanel";
export type { ThemedPanelProps } from "./ThemedPanel";

export { ThemedField } from "./ThemedField";
export type { ThemedFieldProps } from "./ThemedField";

export { IconBox } from "./IconBox";
export type { IconBoxProps } from "./IconBox";

export { Decorator } from "./Decorator";
export type { DecoratorProps, DecoratorPosition, DecoratorAccent } from "./Decorator";
