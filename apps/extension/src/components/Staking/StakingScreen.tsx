import { useMemo, useState } from "react";
import { Box, Button, HStack, Spinner, Text, VStack } from "@chakra-ui/react";
import { FromAccountDisplay } from "@/components/FromAccountDisplay";
import { AppHeader, AppScreen, ScreenBody, StickyActionBar } from "@/components/ui";
import { useStakingState } from "./hooks/useStakingState";
import { useStakingController } from "./hooks/useStakingController";
import { useWchanPrice } from "./hooks/useWchanPrice";
import { useWchanApy } from "./hooks/useWchanApy";
import {
  activeBalance,
  amountFromPercentage,
  displayAmountFromToken,
  parseStakingAmount,
  percentageFromAmount,
  tokenAmountFromDisplay,
} from "./model/stakingModel";
import { StakingAmountPanel } from "./StakingAmountPanel";
import { StakingBalanceSummary } from "./StakingBalanceSummary";
import { StakingConditions } from "./StakingConditions";
import { StakingReviewScreen } from "./StakingReviewScreen";
import type { StakingMode, StakingScreenProps } from "./types";

export default function StakingScreen(props: StakingScreenProps) {
  const [mode, setMode] = useState<StakingMode>("stake");
  const [amount, setAmount] = useState("");
  const [isUsdMode, setIsUsdMode] = useState(false);
  const [isMaxMode, setIsMaxMode] = useState(false);
  const priceUsd = useWchanPrice();
  const apy = useWchanApy();
  const tokenAmount = useMemo(
    () => tokenAmountFromDisplay(amount, isUsdMode, priceUsd),
    [amount, isUsdMode, priceUsd],
  );
  const requestedAmount = useMemo(() => parseStakingAmount(tokenAmount), [tokenAmount]);
  const staking = useStakingState(props.fromAddress, mode, requestedAmount);
  const balance = activeBalance(staking.state, mode);
  const parsedAmount = isMaxMode && balance > 0n ? balance : requestedAmount;
  const sliderValue = percentageFromAmount(parsedAmount, balance);
  const insufficient = Boolean(parsedAmount && parsedAmount > balance);
  const controller = useStakingController({
    owner: props.fromAddress,
    accountId: props.accountId,
    accountType: props.accountType,
    state: staking.state,
    onTransactionInitiated: props.onTransactionInitiated,
  });
  const isImpersonator = props.accountType === "impersonator";

  if (controller.plan) {
    return (
      <StakingReviewScreen
        plan={controller.plan}
        owner={props.fromAddress}
        accountType={props.accountType}
        priceUsd={priceUsd}
        submitting={controller.submitting}
        onBack={controller.cancel}
        onConfirm={controller.confirm}
        onGasEstimates={controller.setGasEstimates}
      />
    );
  }

  const changeMode = (nextMode: StakingMode) => {
    setMode(nextMode);
    setAmount("");
    setIsMaxMode(false);
  };
  const changePercentage = (percentage: number) => {
    setIsMaxMode(percentage === 100);
    setAmount(displayAmountFromToken(
      amountFromPercentage(balance, percentage),
      isUsdMode,
      priceUsd,
    ));
  };
  const toggleAmountMode = () => {
    if (!(priceUsd > 0)) return;
    const exactTokenAmount = isMaxMode && balance > 0n
      ? amountFromPercentage(balance, 100)
      : tokenAmount;
    setAmount(displayAmountFromToken(exactTokenAmount, !isUsdMode, priceUsd));
    setIsUsdMode((current) => !current);
  };
  const canReview = Boolean(
    parsedAmount &&
    parsedAmount > 0n &&
    parsedAmount <= balance &&
    staking.state &&
    !isImpersonator,
  );
  const needsApproval = Boolean(
    mode === "stake" &&
    parsedAmount &&
    staking.state &&
    staking.state.allowance < parsedAmount,
  );
  const canBatchApproval = needsApproval && (
    props.accountType === "bankr" ||
    ((props.accountType === "privateKey" || props.accountType === "seedPhrase") && controller.delegate)
  );

  return (
    <AppScreen stickyActionClearance="118px">
      <AppHeader
        title="Stake WCHAN"
        onBack={props.onBack}
        trailing={props.fromAddress ? <FromAccountDisplay address={props.fromAddress} /> : undefined}
      />
      <ScreenBody pt={4}>
        <VStack align="stretch" spacing={4}>
          <StakingBalanceSummary
            state={staking.state}
            apy={apy}
            loading={staking.loading}
            claiming={controller.submitting}
            onClaim={() => controller.prepare("claim", 0n)}
          />

          <HStack
            role="tablist"
            aria-label="Staking action"
            spacing={1}
            p={1}
            bg="surface.sunken"
            border="1px solid"
            borderColor="border.subtle"
            borderRadius="lg"
          >
            {(["stake", "unstake"] as const).map((tab) => {
              const selected = mode === tab;
              return (
                <Button
                  key={tab}
                  role="tab"
                  aria-selected={selected}
                  variant="ghost"
                  flex="1"
                  h="38px"
                  bg={selected ? "surface.raisedHover" : "transparent"}
                  color={selected ? "accent.highlight" : "fg.secondary"}
                  border={selected ? "1px solid" : "1px solid transparent"}
                  borderColor={selected ? "border.default" : "transparent"}
                  onClick={() => changeMode(tab)}
                  textTransform="capitalize"
                  _hover={{ bg: "surface.raisedHover", color: "fg.primary" }}
                >
                  {tab}
                </Button>
              );
            })}
          </HStack>

          <StakingAmountPanel
            mode={mode}
            amount={amount}
            tokenAmount={parsedAmount}
            isUsdMode={isUsdMode}
            priceUsd={priceUsd}
            balance={balance}
            previewAmount={staking.state?.previewAmount ?? null}
            sliderValue={sliderValue}
            insufficient={insufficient}
            disabled={controller.submitting || isImpersonator}
            onAmountChange={(value) => {
              setIsMaxMode(false);
              setAmount(value);
            }}
            onToggleMode={toggleAmountMode}
            onPercentageChange={changePercentage}
          />

          <StakingConditions mode={mode} state={staking.state} />

          {needsApproval && (
            <HStack px={1} spacing={2} align="flex-start">
              <Box boxSize="7px" mt="5px" borderRadius="full" bg={canBatchApproval ? "chart.positive" : "accent.highlight"} flexShrink={0} />
              <Text fontSize="xs" color="fg.secondary">
                {canBatchApproval
                  ? "Approval and staking will be submitted in batch."
                  : props.accountType === "ledger"
                    ? "Approval and staking will be reviewed on your Ledger and broadcast in order."
                    : "Approval and staking will be broadcast sequentially."}
              </Text>
            </HStack>
          )}

          {staking.error && (
            <Box px={3} py={2.5} bg="status.error.bg" color="status.error.fg" border="1px solid" borderColor="status.error.border" borderRadius="lg">
              <Text fontSize="xs" fontWeight="600">{staking.error}</Text>
            </Box>
          )}

          {isImpersonator && (
            <Box px={3} py={2.5} bg="status.info.bg" color="status.info.fg" border="1px solid" borderColor="status.info.border" borderRadius="lg">
              <Text fontSize="xs" fontWeight="600">
                View-only accounts can inspect staking balances but cannot stake, unstake, or claim.
              </Text>
            </Box>
          )}
        </VStack>
      </ScreenBody>
      <StickyActionBar
        summary={staking.loading && !staking.state ? (
          <HStack justify="center"><Spinner size="xs" /><Text fontSize="xs" color="fg.secondary">Loading Base balances…</Text></HStack>
        ) : undefined}
        primaryAction={
          <Button
            variant="brand"
            onClick={() => parsedAmount && controller.prepare(mode, parsedAmount)}
            isDisabled={!canReview}
          >
            {!amount ? "Enter an amount" : `Review ${mode}`}
          </Button>
        }
      />
    </AppScreen>
  );
}
