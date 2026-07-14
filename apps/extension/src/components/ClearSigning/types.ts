import type { ComponentType } from "react";

import type {
  RenderedField,
  RenderedValue,
} from "@/lib/clearSigning/applyFormat";
import type { Erc7730Descriptor } from "@/lib/clearSigning/types";

interface CalldataProps {
  kind: "calldata";
  chainId: number;
  from?: string;
  to: string;
  calldata: string;
  value?: string;
}

interface Eip712Props {
  kind: "eip712";
  chainId: number;
  from?: string | null;
  verifyingContract: string;
  typedData: {
    domain?: Record<string, unknown>;
    primaryType: string;
    types: Record<string, Array<{ name: string; type: string }>>;
    message: Record<string, unknown>;
  };
}

export type ClearSigningViewProps = (CalldataProps | Eip712Props) & {
  /**
   * Removes the view's outer card chrome when another component already owns
   * the surface. The clear-signing hierarchy and field layout stay intact.
   */
  embedded?: boolean;
  /** Omits the intent/owner heading when a parent surface already presents it. */
  hideHeader?: boolean;
  /**
   * Called once when the view determines whether it has anything to render.
   * Parent can use this to collapse the raw decoder when `matched` is true.
   */
  onResolved?: (matched: boolean, intent?: string) => void;
  /**
   * When true, render nothing during descriptor resolution instead of the
   * default skeleton card. Used by the batch summary view where we mount one
   * `ClearSigningView` per call — most won't match, so the skeletons would
   * appear briefly only to disappear. Quiet by default for parents that want
   * to keep their layout stable until something is actually known.
   */
  hideLoadingSkeleton?: boolean;
  /**
   * Recursion depth — incremented each time a `calldata`-format field renders
   * a nested ClearSigningView for an embedded inner call. Capped at
   * MAX_NESTED_DEPTH to prevent runaway descriptors from melting the wallet.
   * Top-level callers leave this undefined (treated as 0).
   */
  depth?: number;
};

export interface MatchedState {
  descriptor: Erc7730Descriptor;
  fields: RenderedField[];
  intent: string;
  ownerName?: string;
}

export type ClearSigningViewComponent = ComponentType<ClearSigningViewProps>;

export type CalldataRenderedValue = Extract<
  RenderedValue,
  { kind: "calldata" }
>;
