import { ChevronDownIcon } from "@chakra-ui/icons";
import { Button, HStack, Text } from "@chakra-ui/react";
import { forwardRef } from "react";
import { useTheme } from "@/theme";
import { TIER_LABELS, type GasTierSelection } from "@/lib/gasTiers";
import { GAS_TIER_ACCENT } from "./model/tierPresentation";

interface GasFeeTriggerProps {
  expanded: boolean;
  fiatFee: string | null;
  nativeFee: string;
  tier?: GasTierSelection;
  onToggle: () => void;
}

/** Compact trigger for the anchored fee-detail popover. */
export const GasFeeTrigger = forwardRef<HTMLButtonElement, GasFeeTriggerProps>(
  function GasFeeTrigger(
    { expanded, fiatFee, nativeFee, tier, onToggle },
    ref,
  ) {
    const { tokens } = useTheme();

    return (
      <Button
        ref={ref}
        type="button"
        variant="unstyled"
        display="flex"
        w="full"
        minH="44px"
        h="auto"
        px={3}
        py={1}
        onClick={onToggle}
        aria-expanded={expanded}
        border={tokens.borders.thin}
        borderColor="border.default"
        borderRadius="lg"
        bg="surface.raised"
        fontWeight="inherit"
        textTransform="none"
        _hover={{ bg: "surface.raisedHover" }}
        _focus={{ outline: "none" }}
        _focusVisible={{ boxShadow: "focus" }}
        justifyContent="space-between"
      >
        <Text fontSize="xs" color="text.secondary" fontWeight="600" flexShrink={0}>
          Gas fee
        </Text>
        <HStack spacing={1.5} minW={0} justify="flex-end">
          <Text
            fontSize="xs"
            fontWeight="700"
            color="text.primary"
            sx={{ fontVariantNumeric: "tabular-nums" }}
            noOfLines={1}
          >
            {fiatFee || nativeFee}
          </Text>
          {fiatFee && (
            <Text
              fontSize="2xs"
              color="text.tertiary"
              fontWeight="600"
              fontFamily="mono"
              noOfLines={1}
            >
              {nativeFee}
            </Text>
          )}
          {tier && (
            <Text
              px={2}
              py={0.5}
              borderRadius="md"
              bg="surface.sunken"
              color={GAS_TIER_ACCENT[tier]}
              fontSize="xs"
              fontWeight="700"
              flexShrink={0}
            >
              {TIER_LABELS[tier]}
            </Text>
          )}
          <ChevronDownIcon
            boxSize={4}
            color="text.tertiary"
            transform={expanded ? "rotate(180deg)" : "rotate(0deg)"}
            transitionProperty="transform"
            transitionDuration="fast"
            aria-hidden
          />
        </HStack>
      </Button>
    );
  },
);
