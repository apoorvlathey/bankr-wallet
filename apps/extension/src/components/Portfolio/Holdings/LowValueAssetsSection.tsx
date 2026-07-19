import type { RefObject } from "react";
import { Box, Collapse, Flex, HStack, Spinner, Text } from "@chakra-ui/react";
import { ChevronDownIcon } from "@chakra-ui/icons";
import {
  ListItemContent,
  ListItemMeta,
  ListItemTitle,
  ListSurface,
} from "@/components/ui";
import { AssetRow } from "./AssetRow";
import type { AssetDisplayRow, AssetRowPresentationProps } from "./types";

interface LowValueAssetsSectionProps extends AssetRowPresentationProps {
  rows: AssetDisplayRow[];
  rowCount: number;
  totalValueUsd: number;
  isExpanded: boolean;
  isLoading: boolean;
  hasVisiblePositions: boolean;
  disclosureRef: RefObject<HTMLDivElement>;
  onToggle: () => void;
  onAnimationComplete: () => void;
}

export function LowValueAssetsSection({
  rows,
  rowCount,
  totalValueUsd,
  isExpanded,
  isLoading,
  hasVisiblePositions,
  disclosureRef,
  onToggle,
  onAnimationComplete,
  ...rowPresentation
}: LowValueAssetsSectionProps) {
  return (
    <Box
      ref={disclosureRef}
      as="li"
      w="full"
      listStyleType="none"
      borderBottomWidth={hasVisiblePositions ? "1px" : 0}
      borderBottomColor="border.subtle"
    >
      <Flex
        as="button"
        type="button"
        aria-expanded={isExpanded}
        w="full"
        minH="52px"
        px={4}
        py={2.5}
        gap={3}
        align="center"
        textAlign="start"
        color="fg.primary"
        bg="transparent"
        border={0}
        cursor="pointer"
        transitionProperty="background-color, box-shadow"
        transitionDuration="fast"
        _hover={{ bg: "surface.raisedHover" }}
        _active={{ bg: "surface.sunken" }}
        _focus={{ outline: "none" }}
        _focusVisible={{
          boxShadow: "inset 0 0 0 2px var(--chakra-colors-border-focus)",
        }}
        onClick={onToggle}
      >
        <ChevronDownIcon
          boxSize="18px"
          flexShrink={0}
          color="fg.secondary"
          transform={isExpanded ? "rotate(0deg)" : "rotate(-90deg)"}
          transitionProperty="transform"
          transitionDuration="fast"
        />
        <ListItemContent>
          <HStack spacing={2}>
            <ListItemTitle fontSize="sm">Low-value assets</ListItemTitle>
            {isLoading && (
              <Spinner
                thickness="2px"
                speed="0.65s"
                color="fg.secondary"
                boxSize="12px"
              />
            )}
          </HStack>
        </ListItemContent>
        <ListItemMeta flex="0 0 auto">
          <Text
            as="span"
            display="block"
            color="fg.primary"
            fontSize="sm"
            fontWeight={600}
          >
            {rowPresentation.formatUsd(totalValueUsd)}
          </Text>
          <Text as="span" display="block" fontSize="xs" whiteSpace="nowrap">
            {rowCount} {rowCount === 1 ? "asset" : "assets"}
          </Text>
        </ListItemMeta>
      </Flex>
      <Collapse
        in={isExpanded}
        animateOpacity
        onAnimationComplete={onAnimationComplete}
      >
        {isExpanded && (
          <Box>
            <ListSurface borderWidth={0} borderRadius={0} bg="surface.sunken">
              {rows.map((row, index) => (
                <AssetRow
                  key={
                    row.kind === "aggregate"
                      ? `low-aggregated-${row.symbol.toLowerCase()}`
                      : `low-${row.token.chainId}-${row.token.contractAddress}-${index}`
                  }
                  row={row}
                  {...rowPresentation}
                />
              ))}
            </ListSurface>
          </Box>
        )}
      </Collapse>
    </Box>
  );
}
