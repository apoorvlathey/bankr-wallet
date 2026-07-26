import {
  ArrowDownIcon,
  ArrowUpIcon,
  ChevronDownIcon,
  InfoOutlineIcon,
} from "@chakra-ui/icons";
import {
  Box,
  Button,
  Collapse,
  Divider,
  Flex,
  HStack,
  Text,
  Tooltip,
  usePrefersReducedMotion,
  VStack,
} from "@chakra-ui/react";
import { useState } from "react";
import type { AssetChange, SimulationResult } from "@/chrome/txSimulation";
import { ShapesLoader } from "@/components/Chat/ShapesLoader";
import { useTheme } from "@/theme";
import { AssetRow } from "./AssetRow";
import { ApprovalChangesGroup } from "./ApprovalChangesGroup";
import { ResidualApprovalBanner } from "./ResidualApprovalBanner";
import { groupAssetChanges } from "./assetChangesModel";
import type { AssetChangesDisplayProps } from "./types";

function EmbeddedAssetGroup({
  changes,
  direction,
  explorerUrl,
}: {
  changes: AssetChange[];
  direction: "send" | "receive";
  explorerUrl: string;
}) {
  const isSend = direction === "send";
  const ArrowIcon = isSend ? ArrowUpIcon : ArrowDownIcon;
  const color = isSend ? "chart.negative" : "chart.positive";

  return (
    <VStack spacing={0} align="stretch">
      <HStack spacing={1.5} pt={2.5} pb={0.5}>
        <Flex
          boxSize="18px"
          flexShrink={0}
          align="center"
          justify="center"
          borderRadius="full"
          bg={color}
          color="surface.base"
        >
          <ArrowIcon
            boxSize="10px"
            transform="rotate(45deg)"
            aria-hidden
          />
        </Flex>
        <Text
          color={color}
          fontSize="xs"
          fontWeight="700"
          textTransform="uppercase"
        >
          {direction}
        </Text>
      </HStack>

      <VStack spacing={0} align="stretch">
        {changes.map((change, index) => (
          <AssetRow
            key={`${direction}-${change.address}-${index}`}
            change={change}
            explorerUrl={explorerUrl}
          />
        ))}
      </VStack>
    </VStack>
  );
}

export function AssetChangesPanel({
  explorerUrl,
  loading,
  result,
  embedded = false,
  approvalCleanup,
}: {
  explorerUrl: string;
  loading: boolean;
  result: SimulationResult | null;
  embedded?: boolean;
  approvalCleanup?: AssetChangesDisplayProps["approvalCleanup"];
}) {
  const { tokens } = useTheme();
  const [expanded, setExpanded] = useState(true);
  const prefersReducedMotion = usePrefersReducedMotion();

  if (loading) {
    if (embedded) {
      return (
        <HStack minH="44px" justify="center" spacing={3}>
          <ShapesLoader size="6px" />
          <Text fontSize="xs" color="text.secondary" fontWeight="600">
            Simulating changes…
          </Text>
        </HStack>
      );
    }
    return (
      <Box
        border={tokens.borders.medium}
        borderColor="border.default"
        borderRadius="lg"
        bg="surface.raised"
        boxShadow="card"
      >
        <HStack px={3} py={2.5} justify="center" spacing={3}>
          <ShapesLoader size="6px" />
          <Text fontSize="xs" color="text.secondary" fontWeight="700">
            Simulating…
          </Text>
        </HStack>
      </Box>
    );
  }

  if (!result) return null;

  const { allChanges, approvals, incoming, outgoing, summary } =
    groupAssetChanges(result);
  const residualApprovals = result.residualApprovals ?? [];
  const hasAssetChanges = outgoing.length > 0 || incoming.length > 0;
  if (
    result.simulationFailed &&
    approvals.length === 0 &&
    residualApprovals.length === 0
  ) return null;

  if (
    allChanges.length === 0 &&
    approvals.length === 0 &&
    residualApprovals.length === 0
  ) {
    return (
      <Text color="fg.secondary" fontSize="sm" lineHeight="1.45">
        No additional asset changes were detected.
      </Text>
    );
  }

  if (embedded) {
    return (
      <VStack
        align="stretch"
        spacing={0}
        pb={residualApprovals.length > 0 ? 0 : 2}
      >
        <ApprovalChangesGroup
          changes={approvals}
          detectionIncomplete={result.approvalDetectionIncomplete}
          explorerUrl={explorerUrl}
        />
        {approvals.length > 0 && hasAssetChanges && (
          <Divider mt={2} borderColor="border.subtle" opacity={1} />
        )}
        {outgoing.length > 0 && (
          <EmbeddedAssetGroup
            changes={outgoing}
            direction="send"
            explorerUrl={explorerUrl}
          />
        )}
        {incoming.length > 0 && (
          <EmbeddedAssetGroup
            changes={incoming}
            direction="receive"
            explorerUrl={explorerUrl}
          />
        )}
        <ResidualApprovalBanner
          approvals={residualApprovals}
          cleanup={approvalCleanup}
          explorerUrl={explorerUrl}
        />
      </VStack>
    );
  }

  return (
    <VStack align="stretch" spacing={2}>
      <Box
        borderTop="1px solid"
        borderBottom="1px solid"
        borderColor="border.subtle"
        borderRadius="lg"
        bg="transparent"
        boxShadow="none"
        position="relative"
        overflow="hidden"
      >
        <Button
          type="button"
          variant="unstyled"
          display="flex"
          w="full"
          minH="44px"
          h="auto"
          px={3}
          py={2.5}
          onClick={() => setExpanded(!expanded)}
          aria-expanded={expanded}
          aria-controls="asset-changes-details"
          borderRadius={0}
          fontWeight="inherit"
          textTransform="none"
          _hover={{ bg: "surface.raisedHover" }}
          justifyContent="space-between"
        >
          <HStack spacing={1} flexShrink={0}>
            <Text fontSize="xs" color="text.secondary" fontWeight="700">
              Estimated changes
            </Text>
            <Tooltip
              label="This is an estimation. Actual onchain transfers may differ based on updated contract state."
              fontSize="xs"
              hasArrow
              placement="top"
            >
              <InfoOutlineIcon boxSize="11px" color="text.tertiary" />
            </Tooltip>
          </HStack>
          <HStack spacing={1} minW={0}>
            {!expanded && (
              <Text
                fontSize="xs"
                fontWeight="700"
                color="text.primary"
                fontFamily="mono"
                noOfLines={1}
              >
                {summary}
              </Text>
            )}
            <ChevronDownIcon
              boxSize={4}
              color="text.tertiary"
              transform={expanded ? "rotate(180deg)" : "rotate(0deg)"}
              transition={
                prefersReducedMotion
                  ? "none"
                  : "transform 150ms cubic-bezier(0.23, 1, 0.32, 1)"
              }
              aria-hidden
            />
          </HStack>
        </Button>

        <Collapse
          id="asset-changes-details"
          in={expanded}
          animateOpacity={!prefersReducedMotion}
        >
          <VStack align="stretch" spacing={0} px={3} pb={3} pt={1}>
            <Box h="1px" bg="border.subtle" />

            <ApprovalChangesGroup
              changes={approvals}
              detectionIncomplete={result.approvalDetectionIncomplete}
              explorerUrl={explorerUrl}
            />

            {approvals.length > 0 && hasAssetChanges && (
              <Divider mt={2} borderColor="border.subtle" opacity={1} />
            )}

            {outgoing.length > 0 && (
              <>
                <Text
                  fontSize="2xs"
                  fontWeight="700"
                  color="chart.negative"
                  pt={2}
                  pb={1}
                >
                  Send
                </Text>
                <VStack spacing={1.5} align="stretch">
                  {outgoing.map((change, index) => (
                    <AssetRow
                      key={`out-${change.address}-${index}`}
                      change={change}
                      explorerUrl={explorerUrl}
                    />
                  ))}
                </VStack>
              </>
            )}

            {incoming.length > 0 && (
              <>
                <Text
                  fontSize="2xs"
                  fontWeight="700"
                  color="chart.positive"
                  pt={outgoing.length > 0 ? 2.5 : 2}
                  pb={1}
                >
                  Receive
                </Text>
                <VStack spacing={1.5} align="stretch">
                  {incoming.map((change, index) => (
                    <AssetRow
                      key={`in-${change.address}-${index}`}
                      change={change}
                      explorerUrl={explorerUrl}
                    />
                  ))}
                </VStack>
              </>
            )}
            <ResidualApprovalBanner
              approvals={residualApprovals}
              cleanup={approvalCleanup}
              explorerUrl={explorerUrl}
              flushBottom
            />
          </VStack>
        </Collapse>
      </Box>
    </VStack>
  );
}
