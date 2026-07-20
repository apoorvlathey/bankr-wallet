import {
  ArrowDownIcon,
  ArrowUpIcon,
} from "@chakra-ui/icons";
import {
  Badge,
  Box,
  Button,
  Heading,
  HStack,
  SimpleGrid,
  Text,
  Tooltip,
  VStack,
} from "@chakra-ui/react";
import {
  AppHeader,
  AppScreen,
  ScreenBody,
  ScreenSection,
} from "@/components/ui";
import type { ReactNode } from "react";
import {
  getShieldActivityCopy,
  SEPOLIA_SHIELD_DASHBOARD,
  type ShieldDashboardActionId,
} from "./model/shieldDashboard";
import type { ShieldInitializationState } from "./hooks/useShieldInitialization";
import type { ShieldPendingOperation } from "./model/shieldOperation";
import type { UnshieldOperation } from "./model/unshield";
import type { PublicRecoveryOperation } from "./model/recovery";
import { formatShieldUsdValue, formatShieldWei } from "./model/shieldQuote";
import {
  recoveryBadgeCopy,
  recoveryBadgeVariant,
  recoveryStatusCopy,
  shieldOperationBadgeCopy,
  shieldOperationBadgeVariant,
  shieldOperationStatusCopy,
  unshieldBadgeVariant,
  unshieldStatusCopy,
} from "./model/shieldActivity";
import ShieldOperationProgress from "./ShieldOperationProgress";

interface ShieldDashboardProps {
  onBack: () => void;
  onAction: (action: ShieldDashboardActionId) => void;
  initialization: ShieldInitializationState;
  onRetryInitialization: () => void;
  shieldPanel: ReactNode;
  unshieldPanel: ReactNode;
  recoveryPanel: ReactNode;
  operations: ShieldPendingOperation[];
  withdrawals: UnshieldOperation[];
  recoveries: PublicRecoveryOperation[];
  confirmedBalanceWei: bigint;
  pendingAspBalanceWei: bigint;
  nativePriceUsd: number | null;
}

export default function ShieldDashboard({
  onBack,
  onAction,
  initialization,
  onRetryInitialization,
  shieldPanel,
  unshieldPanel,
  recoveryPanel,
  operations,
  withdrawals,
  recoveries,
  confirmedBalanceWei,
  pendingAspBalanceWei,
  nativePriceUsd,
}: ShieldDashboardProps) {
  const activityCopy = getShieldActivityCopy(
    operations.length + withdrawals.length + recoveries.length,
  );
  const balanceUsd = formatShieldUsdValue(
    confirmedBalanceWei,
    nativePriceUsd,
  );

  return (
    <AppScreen>
      <AppHeader title="Shield" onBack={onBack} />

      <ScreenBody as="main" tabIndex={0} py={5}>
        <VStack align="stretch" spacing={5}>
          <Box
            as="section"
            aria-labelledby="shield-balance-heading"
            bg="surface.raised"
            border="1px solid"
            borderColor="border.default"
            borderRadius="lg"
            px={5}
            py={5}
          >
            <HStack justify="space-between" align="center" spacing={3}>
              <Text
                id="shield-balance-heading"
                color="fg.secondary"
                fontSize="sm"
                fontWeight="600"
              >
                Shield balance
              </Text>
              <HStack spacing={2}>
                <Badge variant="info">
                  {SEPOLIA_SHIELD_DASHBOARD.networkName}
                </Badge>
                <Badge variant="warning">
                  {SEPOLIA_SHIELD_DASHBOARD.modeLabel}
                </Badge>
              </HStack>
            </HStack>

            <HStack mt={4} justify="space-between" align="end" spacing={3}>
              <VStack align="start" minW={0} spacing={1}>
                <Heading
                  as="p"
                  fontSize="4xl"
                  lineHeight="1"
                  whiteSpace="nowrap"
                  sx={{ fontVariantNumeric: "tabular-nums" }}
                >
                  {confirmedBalanceWei === 0n
                    ? SEPOLIA_SHIELD_DASHBOARD.balance
                    : formatShieldWei(confirmedBalanceWei)}{" "}
                  <Text
                    as="span"
                    color="fg.secondary"
                    fontSize="lg"
                    fontWeight="600"
                    whiteSpace="nowrap"
                  >
                    {SEPOLIA_SHIELD_DASHBOARD.assetSymbol}
                  </Text>
                </Heading>
                <Text
                  color="fg.secondary"
                  fontSize="sm"
                  lineHeight="1.25"
                  sx={{ fontVariantNumeric: "tabular-nums" }}
                >
                  {balanceUsd ?? "USD value unavailable"}
                </Text>
              </VStack>
              {pendingAspBalanceWei > 0n ? (
                <Tooltip
                  label="Confirmed on Sepolia. Private Unshield waits for the ASP check, or you can withdraw publicly now."
                  fontSize="xs"
                  openDelay={150}
                  hasArrow
                >
                  <Text
                    flexShrink={0}
                    maxW="132px"
                    color="status.warning.emphasis"
                    cursor="help"
                    fontSize="xs"
                    fontWeight="600"
                    lineHeight="1.35"
                    textAlign="right"
                    tabIndex={0}
                    aria-label={`${formatShieldWei(pendingAspBalanceWei)} ETH waiting ASP check. Private Unshield waits for the ASP check, or you can withdraw publicly now.`}
                    _focusVisible={{
                      outline: "2px solid",
                      outlineColor: "border.focus",
                      outlineOffset: "2px",
                      borderRadius: "sm",
                    }}
                  >
                    {formatShieldWei(pendingAspBalanceWei)} ETH
                    <br />
                    waiting ASP check
                  </Text>
                </Tooltip>
              ) : null}
            </HStack>
          </Box>

          <Box as="section" aria-label="Shield balance actions">
            <SimpleGrid columns={2} spacing={3}>
              <Button
                variant="brand"
                minH="48px"
                leftIcon={<ArrowDownIcon />}
                isDisabled={initialization.status !== "ready"}
                onClick={() => onAction("shield")}
              >
                Shield
              </Button>
              <Button
                variant="secondary"
                minH="48px"
                leftIcon={<ArrowUpIcon />}
                isDisabled={initialization.status !== "ready"}
                onClick={() => onAction("unshield")}
              >
                Unshield
              </Button>
            </SimpleGrid>

            {initialization.status === "action-required" ? (
              <HStack
                justify="center"
                mt={2}
                spacing={2}
                role="alert"
                aria-live="polite"
              >
                <Text color="fg.secondary" fontSize="xs" textAlign="center">
                  {initialization.error}
                </Text>
                <Button
                  variant="link"
                  size="xs"
                  h="auto"
                  minW="auto"
                  onClick={onRetryInitialization}
                >
                  Retry
                </Button>
              </HStack>
            ) : null}
          </Box>

          {shieldPanel}
          {unshieldPanel}
          {recoveryPanel}

          <ScreenSection title="Activity">
            {operations.length + withdrawals.length + recoveries.length === 0 ? (
              <Box
                bg="surface.raised"
                border="1px solid"
                borderColor="border.default"
                borderRadius="lg"
                px={4}
                py={4}
              >
                <Text fontSize="sm" fontWeight="600">
                  {activityCopy.title}
                </Text>
                <Text mt={1} color="fg.secondary" fontSize="sm">
                  {activityCopy.description}
                </Text>
              </Box>
            ) : (
              <VStack align="stretch" spacing={2}>
                {operations.map((operation) => (
                  <Box
                    key={operation.id}
                    bg="surface.raised"
                    border="1px solid"
                    borderColor="border.default"
                    borderRadius="lg"
                    px={4}
                    py={3}
                  >
                    <HStack justify="space-between" spacing={3}>
                      <Box minW={0}>
                        <Text fontSize="sm" fontWeight="600">
                          Shield {formatShieldWei(operation.amountWei)} ETH
                        </Text>
                        <Text color="fg.secondary" fontSize="xs">
                          {shieldOperationStatusCopy(operation.state)}
                        </Text>
                      </Box>
                      <Badge variant={shieldOperationBadgeVariant(operation.state)}>
                        {shieldOperationBadgeCopy(operation.state)}
                      </Badge>
                    </HStack>
                    <ShieldOperationProgress state={operation.state} />
                  </Box>
                ))}
                {withdrawals.map((operation) => (
                  <HStack
                    key={operation.id}
                    justify="space-between"
                    bg="surface.raised"
                    border="1px solid"
                    borderColor="border.default"
                    borderRadius="lg"
                    px={4}
                    py={3}
                    spacing={3}
                  >
                    <Box minW={0}>
                      <Text fontSize="sm" fontWeight="600">
                        Unshield {formatShieldWei(operation.amountWei)} ETH
                      </Text>
                      <Text color="fg.secondary" fontSize="xs">
                        {unshieldStatusCopy(operation.state)}
                      </Text>
                    </Box>
                    <Badge variant={unshieldBadgeVariant(operation.state)}>
                      {operation.state === "private_balance_updated" ? "Done" :
                        operation.state === "submitted" || operation.state === "public_confirmed" ? "Pending" :
                          operation.state === "quote_ready" ? "Quoted" : "Attention"}
                    </Badge>
                  </HStack>
                ))}
                {recoveries.map((operation) => (
                  <HStack
                    key={operation.id}
                    justify="space-between"
                    bg="surface.raised"
                    border="1px solid"
                    borderColor="border.default"
                    borderRadius="lg"
                    px={4}
                    py={3}
                    spacing={3}
                  >
                    <Box minW={0}>
                      <Text fontSize="sm" fontWeight="600">
                        Public withdrawal {formatShieldWei(operation.amountWei)} ETH
                      </Text>
                      <Text color="fg.secondary" fontSize="xs">
                        {recoveryStatusCopy(operation.state)}
                      </Text>
                    </Box>
                    <Badge variant={recoveryBadgeVariant(operation.state)}>
                      {recoveryBadgeCopy(operation.state)}
                    </Badge>
                  </HStack>
                ))}
              </VStack>
            )}
          </ScreenSection>
        </VStack>
      </ScreenBody>
    </AppScreen>
  );
}
