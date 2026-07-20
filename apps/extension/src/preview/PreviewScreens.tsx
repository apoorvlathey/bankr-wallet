import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Box,
  Container,
} from "@chakra-ui/react";
import App from "@/App";
import Onboarding from "@/pages/Onboarding";
import UnlockScreen from "@/components/UnlockScreen";
import UnlockView from "@/components/UnlockView";
import TransactionConfirmation from "@/components/TransactionConfirmation";
import SignatureRequestConfirmation from "@/components/SignatureRequestConfirmation";
import BatchTransactionConfirmation from "@/components/BatchTransactionConfirmation";
import CrossDappBatchConfirmation from "@/components/CrossDappBatchConfirmation";
import Erc7715PermissionConfirmation from "@/components/Erc7715PermissionConfirmation";
import WatchAssetConfirmation from "@/components/WatchAssetConfirmation";
import AddChain from "@/components/Settings/AddChain";
import TokenTransfer from "@/components/TokenTransfer";
import { QRCodeModal } from "@/components/QRCodeModal";
import MoreActionsView from "@/components/MoreActionsView";
import WalletConnectView from "@/components/WalletConnectView";
import ChatView from "@/components/Chat/ChatView";
import AccountSettings, {
  type AccountSettingsSubView,
} from "@/components/AccountSettings";
import AddAccount from "@/components/AddAccount";
import AddTokenModal from "@/components/AddTokenModal";
import EditCustomTokenModal from "@/components/EditCustomTokenModal";
import HideTokensView from "@/components/HideTokensView";
import HiddenPortfolioTokensView from "@/components/HiddenPortfolioTokensView";
import Settings, { type SettingsTab } from "@/components/Settings";
import PortfolioTabs from "@/components/PortfolioTabs";
import TxDetailScreen from "@/components/TxDetailScreen";
import { ScreenStack } from "@/components/ScreenTransition";
import SwapView from "@/components/Swap/SwapView";
import BridgeChainTokenModal from "@/components/Swap/BridgeChainTokenModal";
import ComponentLab from "./ComponentLab";
import MobilePrimitivesPreview from "./MobilePrimitivesPreview";
import DecisionPrimitivesPreview from "./DecisionPrimitivesPreview";
import {
  createPreviewBatchScenario,
  createPreviewCrossDappBatchScenario,
  createPreviewPermissionScenario,
  createPreviewSignatureScenario,
  createPreviewTxScenario,
  createPreviewWatchAssetRequest,
  createPreviewAddChainRequest,
  getPreviewWallet,
  previewAccounts,
  previewCustomToken,
  previewVisibleChains,
} from "./fixtures";
import { getPreviewCompletedTransaction } from "./completedTransactionScenarios";
import {
  getPreviewPortfolioResponse,
  previewPortfolioResponse,
} from "./previewEnvironment";
import type {
  FrameMode,
  PreviewRoute,
  PreviewWalletType,
} from "./types";
function PreviewShell({ children }: { children: ReactNode }) {
  return (
    <Box h="100%" minH={0} overflow="hidden" bg="surface.base" color="fg.primary">
      {children}
    </Box>
  );
}
function PortfolioPreview({
  wallet,
  scenario,
}: {
  wallet: PreviewWalletType;
  scenario: string;
}) {
  const txRequest = createPreviewTxScenario(wallet, scenario);
  const [selectedTransaction, setSelectedTransaction] =
    useState<ReturnType<typeof getPreviewCompletedTransaction> | null>(null);
  return (
    <PreviewShell>
      <ScreenStack view={selectedTransaction ? "txDetail" : "main"}>
        {selectedTransaction ? (
        <TxDetailScreen
          tx={selectedTransaction}
          onBack={() => setSelectedTransaction(null)}
        />
        ) : (
          <Box data-screen-scroll-owner h="100%" overflowY="auto" p={3}>
            <PortfolioTabs
              address={txRequest.tx.from}
              accounts={previewAccounts}
              activityTabTrigger={scenario === "activity-selected" ? 1 : 0}
              onTransactionClick={setSelectedTransaction}
            />
          </Box>
        )}
      </ScreenStack>
    </PreviewShell>
  );
}
function SettingsPreview({ scenario }: { scenario: string }) {
  const settingsScenarioTabs: Partial<Record<string, SettingsTab>> = {
    security: "security",
    data: "data",
    about: "about",
    networks: "chains",
    "network-add": "chains",
    "network-edit": "chains",
    appearance: "appearance",
    "change-password": "changePassword",
    "auto-lock": "autoLock",
    "agent-password": "agentPassword",
    biometric: "biometricUnlock",
    "clear-signing": "clearSigning",
    "transaction-history": "clearTxHistory",
    "ens-browsing": "ensBrowsing",
  };
  const initialTab = settingsScenarioTabs[scenario] ?? "main";
  return (
    <PreviewShell>
      <Container
        pt={4}
        pb={4}
        h="100%"
        display="flex"
        flexDirection="column"
        overflowY="auto"
        minH={0}
      >
        <Settings
          close={() => {}}
          initialTab={initialTab}
          initialChainsTab={scenario === "network-add" ? "add" : "list"}
          initialEditChainName={scenario === "network-edit" ? "Base" : undefined}
          initialQuery={scenario === "no-results" ? "not-a-real-setting" : ""}
        />
      </Container>
    </PreviewShell>
  );
}
function AutoActivateButton({ label }: { label: string }) {
  const activated = useRef(false);

  useEffect(() => {
    let attempts = 0;
    const timer = window.setInterval(() => {
      if (activated.current || attempts >= 40) {
        window.clearInterval(timer);
        return;
      }
      attempts += 1;
      const button = Array.from(document.querySelectorAll("button")).find(
        (candidate) => candidate.textContent?.trim() === label,
      );
      if (!button || button.disabled) return;
      activated.current = true;
      button.click();
      window.clearInterval(timer);
    }, 100);
    return () => window.clearInterval(timer);
  }, [label]);

  return null;
}

function setReactInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

function AutoConfigureSwap({ bridge }: { bridge: boolean }) {
  useEffect(() => {
    let cancelled = false;
    const waitFor = async <T extends Element,>(
      find: () => T | undefined,
    ): Promise<T | undefined> => {
      for (let attempt = 0; attempt < 50 && !cancelled; attempt += 1) {
        const match = find();
        if (match) return match;
        await new Promise((resolve) => window.setTimeout(resolve, 100));
      }
      return undefined;
    };

    void (async () => {
      const select = await waitFor(() =>
        Array.from(document.querySelectorAll("button")).find(
          (button) =>
            button.textContent?.trim().toUpperCase().startsWith("SELECT"),
        ),
      );
      if (!select || cancelled) return;
      select.click();

      if (bridge) {
        const arbitrum = await waitFor(() =>
          Array.from(document.querySelectorAll("button")).find((button) =>
            button.textContent?.toLowerCase().includes("arbitrum"),
          ),
        );
        if (!arbitrum || cancelled) return;
        arbitrum.click();
        await new Promise((resolve) => window.setTimeout(resolve, 250));
      }

      const usdc = await waitFor(() =>
        Array.from(document.querySelectorAll("button")).find((button) =>
          button.textContent?.toUpperCase().includes("USDC"),
        ),
      );
      if (!usdc || cancelled) return;
      usdc.click();

      const amountInput = await waitFor(() =>
        Array.from(document.querySelectorAll("input")).find(
          (input) => !input.readOnly && input.placeholder === "0.0",
        ),
      );
      if (!amountInput || cancelled) return;
      setReactInputValue(amountInput, "0.5");
    })();

    return () => {
      cancelled = true;
    };
  }, [bridge]);

  return null;
}

function SwapPreview({
  wallet,
  scenario,
}: {
  wallet: PreviewWalletType;
  scenario: string;
}) {
  const effectiveWallet = scenario === "disabled" ? "viewOnly" : wallet;
  const account = getPreviewWallet(effectiveWallet);
  return (
    <PreviewShell>
      {(scenario === "quoted" || scenario === "bridge-quoted") && (
        <AutoConfigureSwap bridge={scenario === "bridge-quoted"} />
      )}
      <SwapView
        fromAddress={account.address}
        accountId={account.accountId}
        accountType={account.accountType}
        chainId={8453}
        chainName="Base"
        onBack={() => {}}
        onSwapInitiated={() => {}}
        onChainChange={() => {}}
      />
    </PreviewShell>
  );
}

function SwapPickerPreview({
  wallet,
  mode,
  scenario,
}: {
  wallet: PreviewWalletType;
  mode: "sell" | "buy";
  scenario: string;
}) {
  const account = getPreviewWallet(wallet);

  return (
    <PreviewShell>
      <BridgeChainTokenModal
        isOpen
        onClose={() => {}}
        mode={mode}
        initialPanel={scenario === "chains" ? "chains" : "tokens"}
        accountType={account.accountType}
        initialChainId={8453}
        selectedTokenAddress="native"
        selectedTokenChainId={8453}
        onSelect={() => {}}
        fromAddress={account.address}
        holdingsAllChains={getPreviewPortfolioResponse(scenario).tokens}
        initialTokenSearch={
          scenario === "search"
            ? "USDC"
            : scenario === "empty"
              ? "__no_such_token__"
              : ""
        }
      />
    </PreviewShell>
  );
}

function UnlockScenarioPreview({ scenario }: { scenario: string }) {
  const passwordInputRef = useRef<HTMLInputElement>(null);
  const noop = () => {};

  if (scenario === "pending-requests" || scenario === "empty") {
    const pendingCount = scenario === "empty" ? 0 : 1;
    return (
      <UnlockScreen
        onUnlock={noop}
        pendingTxCount={pendingCount}
        pendingSignatureCount={0}
        pendingBatchCount={0}
        pendingPermissionCount={0}
      />
    );
  }

  const isSubmitting = scenario === "submitting";
  return (
    <UnlockView
      password={isSubmitting ? "preview-password" : ""}
      showPassword={false}
      error={scenario === "invalid-password" ? "Invalid password" : ""}
      isUnlocking={isSubmitting}
      isPasskeyUnlocking={false}
      mascotState={scenario === "success"
        ? "success"
        : scenario === "invalid-password"
          ? "invalid"
          : isSubmitting
            ? "attentive"
            : "sleeping"}
      passkeySupported
      passkeyConfigured={
        scenario === "biometric-configured" || scenario === "invalid-password"
      }
      pendingRequestLabel={undefined}
      sidePanelSupported
      sidePanelMode={false}
      passwordInputRef={passwordInputRef}
      onPasswordChange={noop}
      onTogglePassword={noop}
      onUnlock={noop}
      onPasskeyUnlock={noop}
      onSetupBiometric={noop}
      onOpenReset={noop}
      onOpenFullscreen={noop}
      onToggleSidePanel={noop}
      resetDialog={{
        isOpen: false,
        isResetting: false,
        onClose: noop,
        onConfirm: noop,
      }}
    />
  );
}

function AccountManagementPreview({
  wallet,
  scenario,
}: {
  wallet: PreviewWalletType;
  scenario: string;
}) {
  if (scenario === "add") {
    return (
      <PreviewShell>
        <AddAccount
          onBack={() => {}}
          onAccountAdded={() => {}}
          onOpenBiometricSettings={() => {}}
        />
      </PreviewShell>
    );
  }

  const fixture = getPreviewWallet(wallet);
  const account =
    previewAccounts.find((candidate) => candidate.id === fixture.accountId) ??
    previewAccounts[0];
  const securityView: Record<PreviewWalletType, AccountSettingsSubView> = {
    bankr: "changeApiKey",
    privateKey: "revealPrivateKey",
    seedPhrase: "revealSeedPhrase",
    // View-only accounts intentionally have no secret to reveal. Showing the
    // production settings screen is the truthful negative-path fixture.
    viewOnly: "settings",
  };

  return (
    <PreviewShell>
      <AccountSettings
        account={account}
        onClose={() => {}}
        onAccountUpdated={() => {}}
        accounts={previewAccounts}
        initialView={scenario === "security" ? securityView[wallet] : "settings"}
      />
    </PreviewShell>
  );
}

function TokenManagementPreview({
  wallet,
  scenario,
}: {
  wallet: PreviewWalletType;
  scenario: string;
}) {
  const account = getPreviewWallet(wallet);
  const tokenKey = `${previewCustomToken.chainId}-${previewCustomToken.contractAddress}`;

  if (scenario === "edit") {
    return (
      <PreviewShell>
        <EditCustomTokenModal
          isOpen
          onClose={() => {}}
          onUpdated={() => {}}
          token={previewCustomToken}
        />
      </PreviewShell>
    );
  }

  if (scenario === "hide") {
    return (
      <PreviewShell>
        <HideTokensView
          address={account.address}
          onBack={() => {}}
          onOpenHidden={() => {}}
        />
      </PreviewShell>
    );
  }

  if (scenario === "hidden") {
    return (
      <PreviewShell>
        <HiddenPortfolioTokensView
          address={account.address}
          onBack={() => {}}
        />
      </PreviewShell>
    );
  }

  return (
    <PreviewShell>
      <AddTokenModal
        isOpen
        onClose={() => {}}
        onTokenAdded={() => {}}
        existingTokenKeys={new Set([tokenKey])}
        allTokenKeys={new Set([tokenKey])}
        hiddenTokenKeys={new Set()}
      />
    </PreviewShell>
  );
}

export function PreviewScreen({
  route,
  mode,
  scenario,
  wallet,
}: {
  route: PreviewRoute;
  mode: FrameMode;
  scenario: string;
  wallet: PreviewWalletType;
}) {
  const noop = () => {};
  const effectiveWallet = scenario === "impersonator-disabled"
    ? "viewOnly"
    : wallet;
  const txRequest = createPreviewTxScenario(effectiveWallet, scenario);
  const signatureRequest = createPreviewSignatureScenario(
    effectiveWallet,
    scenario,
  );
  const batchRequest = createPreviewBatchScenario(effectiveWallet, scenario);
  const crossDappBatch = createPreviewCrossDappBatchScenario(
    effectiveWallet,
    scenario,
  );
  const permissionRequest = createPreviewPermissionScenario(
    wallet,
    scenario,
  );

  switch (route) {
    case "home":
      return <App />;
    case "onboarding":
      return (
        <PreviewShell>
          <Onboarding />
        </PreviewShell>
      );
    case "unlock":
      return (
        <PreviewShell>
          <UnlockScenarioPreview scenario={scenario} />
        </PreviewShell>
      );
    case "tx":
      return (
        <PreviewShell>
          <TransactionConfirmation
            txRequest={txRequest}
            currentIndex={0}
            totalCount={5}
            isInSidePanel={mode === "sidepanel"}
            accountType={
              effectiveWallet === "viewOnly"
                ? "impersonator"
                : txRequest.accountType
            }
            onBack={noop}
            onConfirmed={noop}
            onRejected={noop}
            onRejectAll={noop}
            onNavigate={noop}
            crossDappBatch={crossDappBatch}
            onAddedToBatch={noop}
          />
        </PreviewShell>
      );
    case "signature":
      return (
        <PreviewShell>
          {scenario === "submitting" && <AutoActivateButton label="Sign" />}
          <SignatureRequestConfirmation
            sigRequest={signatureRequest}
            currentIndex={1}
            totalCount={5}
            isInSidePanel={mode === "sidepanel"}
            accountType={
              effectiveWallet === "viewOnly"
                ? "impersonator"
                : signatureRequest.accountType
            }
            onBack={noop}
            onCancelled={noop}
            onRejectAll={noop}
            onNavigate={noop}
            onConfirmed={noop}
          />
        </PreviewShell>
      );
    case "settings":
      return <SettingsPreview scenario={scenario} />;
    case "portfolio":
      return <PortfolioPreview wallet={wallet} scenario={scenario} />;
    case "tx-detail":
      return (
        <PreviewShell>
          <TxDetailScreen
            onBack={noop}
            tx={getPreviewCompletedTransaction(scenario, effectiveWallet)}
          />
        </PreviewShell>
      );
    case "swap":
      return <SwapPreview wallet={wallet} scenario={scenario} />;
    case "swap-picker":
      return (
        <SwapPickerPreview
          wallet={wallet}
          mode={scenario === "buy" ? "buy" : "sell"}
          scenario={scenario}
        />
      );
    case "components":
      return <ComponentLab />;
    case "mobile-primitives":
      return <MobilePrimitivesPreview scenario={scenario} />;
    case "decision-primitives":
      return <DecisionPrimitivesPreview scenario={scenario} />;
    case "batch":
      return (
        <PreviewShell>
          <BatchTransactionConfirmation
            batchRequest={batchRequest}
            currentIndex={2}
            totalCount={5}
            isInSidePanel={mode === "sidepanel"}
            accountType={batchRequest.accountType}
            accountAddress={batchRequest.params.from ?? batchRequest.accountAddress ?? ""}
            onBack={noop}
            onConfirmed={noop}
            onRejected={noop}
            onRejectAll={noop}
            onNavigate={noop}
            crossDappBatch={crossDappBatch}
            onAddedToBatch={noop}
          />
        </PreviewShell>
      );
    case "cross-batch":
      return (
        <PreviewShell>
          <CrossDappBatchConfirmation
            batch={crossDappBatch}
            currentIndex={3}
            totalCount={5}
            isInSidePanel={mode === "sidepanel"}
            onBack={noop}
            onConfirmed={noop}
            onRejected={noop}
            onRejectAll={noop}
            onNavigate={noop}
          />
        </PreviewShell>
      );
    case "permission":
      return (
        <PreviewShell>
          {scenario === "submitting" && (
            <AutoActivateButton label="Grant permission" />
          )}
          <Erc7715PermissionConfirmation
            permissionRequest={permissionRequest}
            currentIndex={4}
            totalCount={5}
            isInSidePanel={mode === "sidepanel"}
            accountType={
              wallet === "viewOnly" ? "impersonator" : getPreviewWallet(wallet).accountType
            }
            onBack={noop}
            onConfirmed={noop}
            onCancelled={noop}
            onCancelAll={noop}
            onNavigate={noop}
          />
        </PreviewShell>
      );
    case "watch-asset":
      return (
        <PreviewShell>
          <WatchAssetConfirmation
            request={createPreviewWatchAssetRequest(scenario)}
            onConfirmed={noop}
            onRejected={noop}
          />
        </PreviewShell>
      );
    case "add-chain":
      return (
        <PreviewShell>
          <AddChain
            mode="dapp"
            initialRequest={createPreviewAddChainRequest(scenario)}
            back={noop}
            onAdded={noop}
          />
        </PreviewShell>
      );
    case "send": {
      const account = getPreviewWallet(wallet);
      return (
        <PreviewShell>
          <TokenTransfer
            token={previewPortfolioResponse.tokens[1]}
            fromAddress={account.address}
            chainId={8453}
            accountType={account.accountType}
            accounts={previewAccounts}
            onBack={noop}
            onTransferInitiated={noop}
          />
        </PreviewShell>
      );
    }
    case "receive": {
      const account = getPreviewWallet(wallet);
      return (
        <PreviewShell>
          <QRCodeModal isOpen onClose={noop} address={account.address} />
        </PreviewShell>
      );
    }
    case "more": {
      const account = getPreviewWallet(wallet);
      return (
        <PreviewShell>
          <MoreActionsView
            onBack={noop}
            onWalletConnect={noop}
            fromAddress={account.address}
            walletConnectSessionCount={1}
          />
        </PreviewShell>
      );
    }
    case "connected-apps": {
      const previewWallet = getPreviewWallet(wallet);
      const activeAccount = previewAccounts.find(
        (account) => account.id === previewWallet.accountId,
      ) ?? previewAccounts[0];
      return (
        <PreviewShell>
          <WalletConnectView
            accounts={previewAccounts}
            activeAccount={activeAccount}
            selectedChain={previewVisibleChains[0]}
            visibleChains={previewVisibleChains}
            onBack={noop}
            onAccountSelect={noop}
            onAddAccount={noop}
            onAccountSettings={noop}
            onChainSelect={noop}
            onAddChain={noop}
            onAddChainRequest={noop}
            onDismissRetryNotice={noop}
          />
        </PreviewShell>
      );
    }
    case "chat":
      return (
        <PreviewShell>
          <ChatView
            onBack={noop}
            startWithNewChat={scenario === "new"}
            isWalletUnlocked
          />
        </PreviewShell>
      );
    case "account-management":
      return (
        <AccountManagementPreview wallet={wallet} scenario={scenario} />
      );
    case "token-management":
      return <TokenManagementPreview wallet={wallet} scenario={scenario} />;
    case "all": return null;
  }
}
