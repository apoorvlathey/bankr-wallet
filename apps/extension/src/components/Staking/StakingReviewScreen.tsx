import { Box, Button, HStack, Text, VStack } from "@chakra-ui/react";
import { useState } from "react";
import { formatUnits } from "viem";
import MultiTxGasEstimateDisplay from "@/components/MultiTxGasEstimateDisplay";
import SmartAccountSetupBanner from "@/components/SmartAccountSetupBanner";
import { RequestChainContext } from "@/components/RequestConfirmation/EstimatedChangesHeading";
import { omitOuterValueForEip7702 } from "@/chrome/batchTxHandlers";
import { AppHeader, AppScreen, ScreenBody, StickyActionBar } from "@/components/ui";
import { formatUsd } from "@/lib/currencyFormatUtils";
import { formatStakingAmount } from "./model/stakingFormatting";
import { STAKING_CHAIN_ID, STAKING_CHAIN_NAME } from "./constants";
import type { PreparedStakingPlan, StakingAccountType } from "./types";

export function StakingReviewScreen(props: {
  plan: PreparedStakingPlan;
  owner: string;
  accountType: StakingAccountType;
  priceUsd: number;
  submitting: boolean;
  onBack: () => void;
  onConfirm: () => void;
  onGasEstimates: (estimates: import("@/chrome/gasEstimation").GasEstimate[]) => void;
}) {
  const [gasValid, setGasValid] = useState(true);
  const isLocalBatch = Boolean(props.plan.batchTx && props.plan.delegation);
  const batchedTx = props.plan.batchTx
    ? isLocalBatch ? omitOuterValueForEip7702(props.plan.batchTx) : props.plan.batchTx
    : undefined;
  const actionLabel = props.plan.action === "claim"
    ? "Claim rewards"
    : props.plan.action === "stake"
      ? "Stake WCHAN"
      : "Unstake WCHAN";
  const unit = props.plan.action === "unstake" ? "sWCHAN" : "WCHAN";
  const amountUsd = props.priceUsd > 0
    ? formatUsd(Number(formatUnits(props.plan.amount, 18)) * props.priceUsd)
    : null;

  return (
    <AppScreen stickyActionClearance="118px">
      <AppHeader title={`Review ${props.plan.action}`} onBack={props.onBack} isBackDisabled={props.submitting} />
      <ScreenBody pt={4}>
        <VStack align="stretch" spacing={4}>
          <Box bg="surface.raised" border="1px solid" borderColor="border.default" borderRadius="lg" overflow="hidden">
            <VStack align="stretch" spacing={1} px={3} py={3}>
              <Text fontSize="xs" color="fg.secondary">{actionLabel}</Text>
              {props.plan.action !== "claim" && (
                <HStack justify="space-between" align="baseline" spacing={3}>
                  <Text fontFamily="mono" fontSize="lg" fontWeight="700">
                    {formatStakingAmount(props.plan.amount)} {unit}
                  </Text>
                  {amountUsd && (
                    <Text fontFamily="mono" fontSize="xs" color="fg.secondary" flexShrink={0}>
                      {amountUsd}
                    </Text>
                  )}
                </HStack>
              )}
            </VStack>
            <HStack px={3} py={2.5} justify="space-between" borderTop="1px solid" borderColor="border.subtle">
              <Text fontSize="xs" color="fg.secondary">Network</Text>
              <RequestChainContext chainId={STAKING_CHAIN_ID} chainName={STAKING_CHAIN_NAME} showPreposition={false} />
            </HStack>
          </Box>

          {props.plan.delegation?.needsAuth && (
            <SmartAccountSetupBanner
              delegate={props.plan.delegation.delegate}
              onchainDelegate={props.plan.delegation.onchainDelegate}
              explorerUrl="https://basescan.org"
            />
          )}

          <Box>
            <Text mb={2} fontSize="xs" color="fg.secondary" fontWeight="600">
              Transactions{props.plan.batchTx ? " · atomic batch" : props.plan.transactions.length > 1 ? " · sequential" : ""}
            </Text>
            <VStack align="stretch" spacing={0} bg="surface.raised" border="1px solid" borderColor="border.default" borderRadius="lg" overflow="hidden">
              {props.plan.transactions.map((entry, index) => (
                <HStack key={`${entry.origin}-${index}`} px={3} py={2.5} borderTop={index ? "1px solid" : undefined} borderColor="border.subtle">
                  <Box boxSize="22px" borderRadius="md" bg="surface.raisedHover" display="grid" placeItems="center" color="accent.highlight" fontSize="xs" fontWeight="800">
                    {index + 1}
                  </Box>
                  <Text flex="1" minW={0} fontSize="sm" fontWeight="600" noOfLines={1}>{entry.origin}</Text>
                  <Text fontFamily="mono" fontSize="2xs" color="fg.muted">
                    {entry.tx.to?.slice(0, 6)}…{entry.tx.to?.slice(-4)}
                  </Text>
                </HStack>
              ))}
            </VStack>
          </Box>

          {props.accountType === "ledger" && props.plan.transactions.length > 1 && (
            <Text fontSize="xs" color="fg.secondary">
              Your Ledger will ask you to review each transaction in order.
            </Text>
          )}

          <MultiTxGasEstimateDisplay
            transactions={props.plan.transactions.map((entry) => ({
              tx: {
                ...entry.tx,
                to: entry.tx.to || "0x0000000000000000000000000000000000000000",
                data: entry.tx.data || "0x",
                value: entry.tx.value || "0x0",
              },
              label: entry.origin,
            }))}
            accountType={props.accountType}
            batchedTx={batchedTx ? { tx: { ...batchedTx, from: props.owner, chainId: STAKING_CHAIN_ID }, label: "Staking batch" } : undefined}
            eip7702Delegate={props.plan.delegation?.needsAuth ? props.plan.delegation.delegate : undefined}
            onGasEstimates={props.onGasEstimates}
            onValidityChange={setGasValid}
          />
        </VStack>
      </ScreenBody>
      <StickyActionBar primaryAction={
        <Button variant="brand" onClick={props.onConfirm} isLoading={props.submitting} loadingText="Submitting…" isDisabled={!gasValid || props.submitting}>
          Confirm {props.plan.action}
        </Button>
      } />
    </AppScreen>
  );
}
