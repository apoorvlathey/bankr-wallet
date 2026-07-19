import type { ReactNode } from "react";
import {
  Popover,
  PopoverBody,
  PopoverContent,
  PopoverTrigger,
  Portal,
  usePrefersReducedMotion,
} from "@chakra-ui/react";
import { AnimatePresence, motion } from "framer-motion";
import type { GasEstimateTiers } from "@/chrome/gasEstimation";
import type { GasTierSelection } from "@/lib/gasTiers";
import GasTierPicker from "../GasTierPicker";
import { GasFeeTrigger } from "./GasFeeTrigger";

interface GasFeePopoverProps {
  expanded: boolean;
  fiatFee: string | null;
  nativeFee: string;
  tier?: GasTierSelection;
  onToggle: () => void;
  onClose: () => void;
  showPicker: boolean;
  customEditorOpen: boolean;
  customEditor: ReactNode;
  fallbackContent: ReactNode;
  tiers?: GasEstimateTiers;
  gasLimit: bigint | null;
  nativePriceUsd: number | null;
  nativeCurrencySymbol: string;
  selectedTier: GasTierSelection;
  onTierChange: (tier: GasTierSelection) => void;
  customBadge?: string;
  isDisabled?: boolean;
}

const transition = {
  duration: 0.18,
  ease: [0.23, 1, 0.32, 1] as [number, number, number, number],
};

/** Anchored two-step fee chooser: tiers first, custom parameters second. */
export function GasFeePopover({
  expanded,
  fiatFee,
  nativeFee,
  tier,
  onToggle,
  onClose,
  showPicker,
  customEditorOpen,
  customEditor,
  fallbackContent,
  tiers,
  gasLimit,
  nativePriceUsd,
  nativeCurrencySymbol,
  selectedTier,
  onTierChange,
  customBadge,
  isDisabled = false,
}: GasFeePopoverProps) {
  const prefersReducedMotion = usePrefersReducedMotion();
  const motionTransition = prefersReducedMotion
    ? { duration: 0.1 }
    : transition;

  return (
    <Popover
      isOpen={!isDisabled && expanded}
      onClose={onClose}
      placement="top-end"
      gutter={8}
      closeOnBlur
    >
      <PopoverTrigger>
        <GasFeeTrigger
          expanded={expanded}
          fiatFee={fiatFee}
          nativeFee={nativeFee}
          tier={tier}
          onToggle={onToggle}
          isDisabled={isDisabled}
        />
      </PopoverTrigger>
      <Portal>
        <PopoverContent
          w={customEditorOpen ? "280px" : "292px"}
          maxW="calc(100vw - 32px)"
          maxH="calc(100vh - 96px)"
        >
          <PopoverBody p={2} overflowY="auto" overflowX="hidden">
            {showPicker ? (
              <AnimatePresence initial={false} mode="popLayout">
                {customEditorOpen ? (
                  <motion.div
                    key="custom-editor"
                    initial={
                      prefersReducedMotion
                        ? { opacity: 0 }
                        : { opacity: 0, x: 18 }
                    }
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, transition: { duration: 0 } }}
                    transition={motionTransition}
                  >
                    {customEditor}
                  </motion.div>
                ) : (
                  <motion.div
                    key="tier-picker"
                    initial={{ opacity: 1, x: 0 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={
                      prefersReducedMotion
                        ? { opacity: 0 }
                        : { opacity: 0, x: -18 }
                    }
                    transition={motionTransition}
                  >
                    <GasTierPicker
                      tiers={tiers}
                      gasLimit={gasLimit}
                      nativePriceUsd={nativePriceUsd}
                      nativeCurrencySymbol={nativeCurrencySymbol}
                      selected={selectedTier}
                      onChange={onTierChange}
                      layout="menu"
                      customBadge={customBadge}
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            ) : (
              fallbackContent
            )}
          </PopoverBody>
        </PopoverContent>
      </Portal>
    </Popover>
  );
}
