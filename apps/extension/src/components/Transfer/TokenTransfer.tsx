import { Button, VStack } from "@chakra-ui/react";
import { memo, useCallback, useMemo, useState } from "react";
import type { PortfolioToken } from "@/chrome/portfolio/api";
import { FromAccountDisplay } from "@/components/FromAccountDisplay";
import {
  AppHeader,
  AppScreen,
  ScreenBody,
  StickyActionBar,
} from "@/components/ui";
import { useNetworks } from "@/contexts/NetworksContext";
import { getChainEnvironmentLabel } from "@/lib/chainIcons";
import { getResolvedChainById, getVisibleChains } from "@/lib/chains";
import { AmountSection } from "./AmountSection";
import { CalldataSection } from "./CalldataSection";
import { DeploymentBanner } from "./DeploymentBanner";
import { NetworkPicker } from "./NetworkPicker";
import { RecipientPicker } from "./RecipientPicker";
import { RecipientSection } from "./RecipientSection";
import { SponsorshipEligibilityNotice, TransferNotices } from "./TransferNotices";
import { TokenSelectionSection } from "./TokenSelectionSection";
import { useSponsoredTransfer } from "./hooks/useSponsoredTransfer";
import { useTransferCatalog } from "./hooks/useTransferCatalog";
import { useTransferPreparation } from "./hooks/useTransferPreparation";
import { useTransferRecipient } from "./hooks/useTransferRecipient";
import { useTransferSubmission } from "./hooks/useTransferSubmission";
import type { TokenTransferProps } from "./types";

function TokenTransfer({
  token: initialToken,
  fromAddress,
  chainId,
  accountType,
  accounts,
  onBack,
  onTransferInitiated,
}: TokenTransferProps) {
  const { networksInfo } = useNetworks();
  const [isNetworkPickerOpen, setIsNetworkPickerOpen] = useState(false);
  const catalog = useTransferCatalog({
    initialToken,
    initialChainId: chainId,
    fromAddress,
    networksInfo,
  });
  const recipientState = useTransferRecipient({
    accounts,
    fromAddress,
    chainId: catalog.selectedChainId,
  });
  const preparation = useTransferPreparation({
    token: catalog.selectedToken,
    recipient: recipientState.recipient,
  });

  const allChains = useMemo(() => {
    const visibleChainIds = getVisibleChains(networksInfo).map(
      (chain) => chain.chainId,
    );
    return [
      catalog.selectedChainId,
      ...visibleChainIds.filter(
        (candidate) => candidate !== catalog.selectedChainId,
      ),
    ];
  }, [catalog.selectedChainId, networksInfo]);

  const getChainName = useCallback(
    (candidateChainId: number) =>
      getResolvedChainById(candidateChainId, networksInfo)?.name ??
      `Chain ${candidateChainId}`,
    [networksInfo],
  );
  const getNativeSymbol = useCallback(
    (candidateChainId: number) =>
      getResolvedChainById(candidateChainId, networksInfo)?.nativeCurrency
        .symbol,
    [networksInfo],
  );
  const chainName = getChainName(catalog.selectedChainId);
  const chainEnvironmentLabel = getChainEnvironmentLabel(
    catalog.selectedChainId,
    chainName,
  );
  const triggerChainLabel = chainEnvironmentLabel
    ? chainName.replace(/\s+testnet$/i, "").trim() || chainName
    : chainName;
  const explorerUrl =
    getResolvedChainById(catalog.selectedChainId, networksInfo)?.explorer ?? "";

  const sponsored = useSponsoredTransfer({
    token: catalog.selectedToken,
    fromAddress,
    accountType,
    onTransferInitiated,
  });
  const submission = useTransferSubmission({
    token: catalog.selectedToken,
    fromAddress,
    accountType,
    resolvedAddress: recipientState.resolvedAddress,
    tokenAmount: preparation.tokenAmount,
    chainName,
    isNativeToken: preparation.isNativeToken,
    trimmedHexData: preparation.trimmedHexData,
    isContractDeployment: preparation.isContractDeployment,
    sponsored,
    onTransferInitiated,
  });
  const isBusy = submission.isSubmitting || sponsored.isCheckingStatus;

  const recipientGatesPass = preparation.isContractDeployment
    ? true
    : recipientState.isValid &&
      !recipientState.isResolving &&
      !recipientState.isCheckingRecipientKind &&
      (!recipientState.isRecipientContract ||
        recipientState.acknowledgeContract);
  const canSubmit = Boolean(
    catalog.selectedToken &&
      recipientGatesPass &&
      preparation.isAmountValid() &&
      !isBusy &&
      preparation.isHexDataValid,
  );

  const decodeCalldataDisabledReason = (() => {
    if (!preparation.hasNativeCalldata) {
      return preparation.hexDataIsEmpty
        ? "Add calldata to decode."
        : "Fix calldata hex first.";
    }
    if (!recipientState.recipient.trim()) {
      return "Enter a recipient to decode against.";
    }
    if (recipientState.isResolving) return "Resolving recipient.";
    if (!recipientState.isValid || !recipientState.resolvedAddress) {
      return "Use a valid recipient.";
    }
    return null;
  })();

  const resetSelectionFields = () => preparation.resetForSelection();
  const handleChainChange = (selectedChainId: number) => {
    catalog.changeChain(selectedChainId);
    resetSelectionFields();
    setIsNetworkPickerOpen(false);
  };
  const handleTokenSelect = (token: PortfolioToken) => {
    catalog.selectToken(token);
    resetSelectionFields();
  };
  const handleCustomTokenSelect = (token: PortfolioToken) => {
    catalog.selectCustomToken(token);
    resetSelectionFields();
  };

  if (isNetworkPickerOpen) {
    return (
      <NetworkPicker
        chainIds={allChains}
        selectedChainId={catalog.selectedChainId}
        getChainName={getChainName}
        getNativeSymbol={getNativeSymbol}
        chainBalances={catalog.chainBalances}
        fundedChainIds={catalog.fundedChainIds}
        onSelect={handleChainChange}
        onBack={() => setIsNetworkPickerOpen(false)}
      />
    );
  }

  if (recipientState.isRecipientPickerOpen) {
    return (
      <RecipientPicker
        accounts={recipientState.filteredRecipientAccounts}
        contacts={recipientState.filteredRecipientContacts}
        allContacts={recipientState.allAddressContacts}
        recipient={recipientState.recipient}
        search={recipientState.recipientSearch}
        onSearchChange={recipientState.setRecipientSearch}
        getAccountDisplayName={recipientState.getAccountDisplayName}
        getAccountAvatar={recipientState.getAccountAvatar}
        onSelect={recipientState.selectRecipientAccount}
        onSelectAddress={recipientState.selectRecipientAddress}
        onRemoveContact={recipientState.removeContact}
        onReorderContacts={recipientState.reorderContacts}
        onBack={recipientState.closeRecipientPicker}
      />
    );
  }

  return (
    <AppScreen stickyActionClearance={4}>
      <AppHeader
        title="Send"
        onBack={onBack}
        trailing={
          fromAddress ? <FromAccountDisplay address={fromAddress} /> : undefined
        }
      />
      <ScreenBody pt={4} pb={4}>
        <VStack spacing={5} align="stretch">
          <SponsorshipEligibilityNotice
            accountType={accountType}
            sponsored={sponsored}
          />
          <TokenSelectionSection
            selectedChainId={catalog.selectedChainId}
            chainName={chainName}
            triggerChainLabel={triggerChainLabel}
            chainEnvironmentLabel={chainEnvironmentLabel}
            token={catalog.selectedToken}
            holdings={catalog.holdings}
            tokenList={catalog.tokenList}
            holdingsLoading={catalog.holdingsLoading}
            resolvedCustomToken={catalog.resolvedCustomToken}
            customTokenLoading={catalog.customTokenLoading}
            customTokenError={catalog.customTokenError}
            onOpenNetworkPicker={() => setIsNetworkPickerOpen(true)}
            onSelectToken={handleTokenSelect}
            onResolveCustomAddress={catalog.resolveCustomAddress}
            onSelectCustomToken={handleCustomTokenSelect}
            onTokenSelectorOpenChange={catalog.setIsTokenSelectorOpen}
          />

          {preparation.isContractDeployment ? (
            <DeploymentBanner />
          ) : (
            <RecipientSection
              recipientState={recipientState}
              explorerUrl={explorerUrl}
            />
          )}
          <AmountSection token={catalog.selectedToken} preparation={preparation} />
          {preparation.isNativeToken && (
            <CalldataSection
              preparation={preparation}
              decodeDisabledReason={decodeCalldataDisabledReason}
              fromAddress={fromAddress}
              resolvedAddress={recipientState.resolvedAddress}
              chainId={catalog.selectedChainId}
            />
          )}
          <TransferNotices
            accountType={accountType}
            sponsored={sponsored}
            isBusy={isBusy}
            onFallbackSend={submission.sendFallback}
          />
        </VStack>
      </ScreenBody>

      <StickyActionBar
        secondaryAction={(
          <Button variant="secondary" onClick={onBack} isDisabled={isBusy}>
            Cancel
          </Button>
        )}
        primaryAction={(
          <Button
            variant="brand"
            onClick={() => submission.submit(canSubmit)}
            isLoading={isBusy}
            isDisabled={!canSubmit || accountType === "impersonator"}
            fontSize={sponsored.isSponsoredFlow ? "sm" : undefined}
          >
            {sponsored.isSponsoredFlow
              ? "Sign gas-free transfer"
              : "Review send"}
          </Button>
        )}
      />
    </AppScreen>
  );
}

export default memo(TokenTransfer);
