import { useMemo } from "react";
import { Box, HStack, VStack, Text, Icon } from "@chakra-ui/react";
import { CheckIcon, EditIcon } from "@chakra-ui/icons";
import { useTheme, useStripTokens } from "@/theme";
import {
  TIER_LABELS,
  TIER_ORDER,
  type GasTierSelection,
} from "@/lib/gasTiers";
import type { GasEstimateTiers } from "@/chrome/gasEstimation";
import { GAS_TIER_ACCENT } from "./GasEstimate/model/tierPresentation";

interface GasTierPickerProps {
  /** Per-preset fee pairs (Slow / Normal / Fast). Undefined while loading. */
  tiers?: GasEstimateTiers;
  /** Total gasLimit across all calls (single tx → its limit; batch → sum). */
  gasLimit: bigint | null;
  /** USD price for the chain's native currency, used for the per-button preview. */
  nativePriceUsd: number | null;
  nativeCurrencySymbol: string;
  selected: GasTierSelection;
  onChange: (next: GasTierSelection) => void;
  layout?: "segmented" | "menu";
  customBadge?: string;
}

// ---------------------------------------------------------------------------
// Tier icons — small inline SVGs that pair with the tier labels.
//
// Visual language:
//   - Slow: turtle silhouette (deliberate, low-urgency)
//   - Normal: stopwatch (the default pace)
//   - Fast: lightning bolt (immediate, urgent)
//   - Custom: sliders (user-controlled)
// ---------------------------------------------------------------------------

// Lucide Turtle v0.460.0 (ISC), kept local so the extension does not pull in
// a separate icon dependency for one glyph.
const TurtleIcon = (props: any) => (
  <Icon
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  >
    <path d="m12 10 2 4v3a1 1 0 0 0 1 1h2a1 1 0 0 0 1-1v-3a8 8 0 1 0-16 0v3a1 1 0 0 0 1 1h2a1 1 0 0 0 1-1v-3l2-4h4Z" />
    <path d="M4.82 7.9 8 10" />
    <path d="M15.18 7.9 12 10" />
    <path d="M16.93 10H20a2 2 0 0 1 0 4H2" />
  </Icon>
);

const StopwatchIcon = (props: any) => (
  <Icon viewBox="0 0 24 24" fill="currentColor" {...props}>
    <path d="M9 1h6v2H9V1zm2 13h2V8h-2v6zm8.03-6.61 1.42-1.42c-.43-.51-.9-.99-1.41-1.41l-1.42 1.42A8.962 8.962 0 0 0 12 4c-4.97 0-9 4.03-9 9s4.02 9 9 9 9-4.03 9-9c0-2.12-.74-4.07-1.97-5.61zM12 20c-3.87 0-7-3.13-7-7s3.13-7 7-7 7 3.13 7 7-3.13 7-7 7z" />
  </Icon>
);

const LightningIcon = (props: any) => (
  <Icon viewBox="0 0 24 24" fill="currentColor" {...props}>
    <path d="M11 21h-1l1-7H7.5c-.58 0-.57-.32-.38-.66.19-.34.05-.08.07-.12C8.48 10.94 10.42 7.54 13 3h1l-1 7h3.5c.49 0 .56.33.47.51l-.07.15C12.96 17.55 11 21 11 21z" />
  </Icon>
);

const SlidersIcon = (props: any) => (
  <Icon viewBox="0 0 24 24" fill="currentColor" {...props}>
    <path d="M3 17v2h6v-2H3zM3 5v2h10V5H3zm10 16v-2h8v-2h-8v-2h-2v6h2zM7 9v2H3v2h4v2h2V9H7zm14 4v-2H11v2h10zm-6-4h2V7h4V5h-4V3h-2v6z" />
  </Icon>
);

const TIER_ICON: Record<GasTierSelection, (props: any) => JSX.Element> = {
  slow: TurtleIcon,
  standard: StopwatchIcon,
  fast: LightningIcon,
  custom: SlidersIcon,
};

/**
 * Convert wei string to a short gwei string for the picker preview.
 * Trailing-zero stripped so "0.05" doesn't render as "0.050" — saves
 * horizontal space which is at a premium in the 4-up segmented control,
 * especially in narrow sidepanels where the label is the limiting factor.
 */
function priorityToGweiPreview(maxPriorityWei: string): string {
  try {
    const wei = BigInt(maxPriorityWei);
    if (wei === 0n) return "0 gwei";
    const gwei = Number(wei) / 1e9;
    let str: string;
    if (gwei >= 100) str = Math.round(gwei).toString();
    else if (gwei >= 10) str = gwei.toFixed(1);
    else if (gwei >= 1) str = gwei.toFixed(2);
    else if (gwei >= 0.01) str = gwei.toFixed(3);
    else str = gwei.toFixed(4);
    // Drop trailing zeros and a dangling decimal point.
    str = str.replace(/0+$/, "").replace(/\.$/, "");
    return `${str} gwei`;
  } catch {
    return "—";
  }
}

function formatPreviewUsd(weiCost: bigint, priceUsd: number | null): string | null {
  if (priceUsd === null) return null;
  const eth = Number(weiCost) / 1e18;
  const usd = eth * priceUsd;
  if (usd === 0) return null;
  if (usd < 0.01) return "<$0.01";
  if (usd < 1) return `$${usd.toFixed(3)}`;
  return `$${usd.toFixed(2)}`;
}

/**
 * Slow / Normal / Fast / Custom selector. `segmented` supports legacy gas
 * surfaces; `menu` is the transaction decision popover's scan-friendly form.
 *
 * The menu layout is intentionally decision-only: speed, estimated fiat cost,
 * and selection state. Raw gas parameters stay behind Custom instead of being
 * repeated under every preset.
 *
 * The active button uses the same strip tokens as other segmented selectors
 * in the codebase (Bauhaus: solid black; Midnight: recessed surface) so the
 * full cell flips to a uniform white-on-dark treatment — clear "this is
 * selected" without competing with the per-tier color hints.
 */
export default function GasTierPicker({
  tiers,
  gasLimit,
  nativePriceUsd,
  selected,
  onChange,
  layout = "segmented",
  customBadge,
}: GasTierPickerProps) {
  const { tokens } = useTheme();
  const { bg: activeBg, fg: activeFg } = useStripTokens();

  // Per-button cost preview keyed by tier. Computed once per render — cheap.
  const previewCosts = useMemo(() => {
    if (!tiers || !gasLimit) return null;
    return {
      slow: gasLimit * BigInt(tiers.slow.maxFeePerGas),
      standard: gasLimit * BigInt(tiers.standard.maxFeePerGas),
      fast: gasLimit * BigInt(tiers.fast.maxFeePerGas),
    };
  }, [tiers, gasLimit]);

  if (layout === "menu") {
    return (
      <VStack
        spacing={0.5}
        align="stretch"
        p={0}
      >
        {TIER_ORDER.map((tier) => {
          const isActive = selected === tier;
          const TierIcon = TIER_ICON[tier];
          const usdLine =
            tier !== "custom" && previewCosts
              ? formatPreviewUsd(previewCosts[tier], nativePriceUsd)
              : null;

          return (
            <HStack
              key={tier}
              as="button"
              type="button"
              aria-pressed={isActive}
              w="full"
              minH="36px"
              px={2.5}
              py={1}
              spacing={2}
              border={0}
              borderRadius="md"
              bg={isActive ? "surface.raisedHover" : "transparent"}
              color="fg.primary"
              textAlign="left"
              cursor="pointer"
              onClick={() => onChange(tier)}
              _hover={{ bg: "surface.raisedHover" }}
              _focus={{ outline: "none" }}
              _focusVisible={{ boxShadow: "focus" }}
            >
              <TierIcon
                boxSize={3.5}
                color={GAS_TIER_ACCENT[tier]}
                flexShrink={0}
              />
              <HStack spacing={1.5} flex="1 1 auto" minW={0}>
                <Text fontSize="xs" fontWeight="600">
                  {TIER_LABELS[tier]}
                </Text>
                {tier === "custom" && customBadge && (
                  <Text
                    px={1.5}
                    py={0.5}
                    borderRadius="sm"
                    bg="status.info.bg"
                    color="status.info.fg"
                    border={tokens.borders.thin}
                    borderColor="status.info.border"
                    fontSize="2xs"
                    fontWeight="700"
                    lineHeight="shorter"
                  >
                    {customBadge}
                  </Text>
                )}
              </HStack>
              {tier === "custom" ? (
                <HStack
                  spacing={1}
                  px={2}
                  minH="26px"
                  borderRadius="md"
                  bg="accent.highlight"
                  color="accentFg.highlight"
                  flexShrink={0}
                >
                  <EditIcon boxSize={3} aria-hidden />
                  <Text fontSize="2xs" fontWeight="700">
                    Edit
                  </Text>
                </HStack>
              ) : (
                <Text
                  color="fg.secondary"
                  fontSize="2xs"
                  fontWeight="600"
                  sx={{ fontVariantNumeric: "tabular-nums" }}
                >
                  {usdLine || "—"}
                </Text>
              )}
              {isActive && tier !== "custom" && (
                <CheckIcon boxSize={3} color="accent.highlight" flexShrink={0} />
              )}
            </HStack>
          );
        })}
      </VStack>
    );
  }

  return (
    <HStack
      spacing={0}
      bg="surface.raised"
      border={tokens.borders.thin}
      borderColor="border.default"
      borderRadius="lg"
      overflow="hidden"
      boxShadow="card"
      align="stretch"
    >
      {TIER_ORDER.flatMap((tier, idx) => {
        const isActive = selected === tier;
        const TierIcon = TIER_ICON[tier];
        const accentColor = GAS_TIER_ACCENT[tier];

        // Lines for preset tiers; nothing for Custom (cost is user-driven).
        let gweiLine: string | null = null;
        let usdLine: string | null = null;
        if (tier !== "custom" && tiers && previewCosts) {
          gweiLine = priorityToGweiPreview(tiers[tier].maxPriorityFeePerGas);
          usdLine = formatPreviewUsd(previewCosts[tier], nativePriceUsd);
        }

        const button = (
          <Box
            key={tier}
            as="button"
            type="button"
            flex={1}
            py={2}
            px={1.5}
            cursor="pointer"
            bg={isActive ? activeBg : "transparent"}
            onClick={() => onChange(tier)}
            transition="background-color 100ms ease-out"
            _hover={isActive ? { bg: activeBg } : { bg: "bg.muted" }}
            _focus={{ outline: "none", boxShadow: "none" }}
            _focusVisible={{ outline: "none", boxShadow: "none" }}
            border="none"
            minW={0}
            textAlign="center"
            // The button's children manage their own colors — both for the
            // tier-accent on inactive labels and the strip activeFg when
            // selected. Setting a parent `color` would override that.
          >
            <VStack spacing={0.5} align="center">
              <HStack spacing={1} align="center" justify="center" maxW="full">
                <TierIcon
                  boxSize="11px"
                  color={isActive ? activeFg : accentColor}
                  flexShrink={0}
                />
                <Text
                  fontSize="9px"
                  fontWeight="800"
                  textTransform="uppercase"
                  letterSpacing="0.04em"
                  color={isActive ? activeFg : accentColor}
                  noOfLines={1}
                >
                  {TIER_LABELS[tier]}
                </Text>
              </HStack>

              {tier === "custom" ? (
                // Custom doesn't have a preset preview — show a subtle hint
                // instead of leaving the bottom rows empty (which made the
                // button look misaligned next to the three preset buttons).
                <Text
                  fontSize="9px"
                  fontWeight="600"
                  color={isActive ? activeFg : "text.tertiary"}
                  opacity={isActive ? 0.85 : 1}
                  noOfLines={1}
                >
                  Edit fees
                </Text>
              ) : (
                <>
                  {gweiLine && (
                    <Text
                      fontSize="9px"
                      fontWeight="700"
                      fontFamily="mono"
                      color={isActive ? activeFg : "text.primary"}
                      noOfLines={1}
                      maxW="full"
                    >
                      {gweiLine}
                    </Text>
                  )}
                  {usdLine && (
                    <Text
                      fontSize="9px"
                      fontWeight="600"
                      color={isActive ? activeFg : "text.tertiary"}
                      opacity={isActive ? 0.8 : 1}
                      noOfLines={1}
                    >
                      {usdLine}
                    </Text>
                  )}
                </>
              )}
            </VStack>
          </Box>
        );

        return idx === 0
          ? [button]
          : [
              <Box
                key={`divider-${tier}`}
                w="1px"
                bg="border.default"
                alignSelf="stretch"
              />,
              button,
            ];
      })}
    </HStack>
  );
}
