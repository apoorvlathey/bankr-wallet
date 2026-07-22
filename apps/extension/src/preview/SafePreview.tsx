import { Alert, AlertIcon, Badge, Box, Button, HStack, Text, VStack } from "@chakra-ui/react";
import type { SafeChainSnapshot, SafeProposalRecord } from "@/chrome/safe/types";
import type { SafeAccount } from "@/chrome/types";
import { SafeProposalConfirmation } from "@/components/SafeApprovals/SafeProposalConfirmation";
import { SafeSecurityScreen } from "@/components/SafeAccount/SafeSecurityScreen";
import { SafeIcon } from "@/components/shared/AccountTypeIcons";
import { AppHeader, AppScreen, ScreenBody, ScreenSection } from "@/components/ui";
import { previewAccounts } from "./fixtures";
import { previewSafeAccountRecords, previewSafeProposals } from "./safeHomePreview";

const SAFE_ACCOUNT: SafeAccount = {
  id: "preview-safe",
  type: "safe",
  address: previewSafeAccountRecords[0].address,
  displayName: "Treasury Safe",
  createdAt: 1,
};
const PK_OWNER = "0x1234567890123456789012345678901234567890" as const;
const SEED_OWNER = "0x2222222222222222222222222222222222222222" as const;
const EXTERNAL_OWNER = "0x7777777777777777777777777777777777777777" as const;

function scenarioFixture(scenario: string): {
  proposal: SafeProposalRecord;
  snapshot: SafeChainSnapshot;
} {
  const ready = structuredClone(previewSafeProposals[0]);
  const snapshot = structuredClone(previewSafeAccountRecords[0].chains["8453"]);

  if (scenario === "nonce-conflict") {
    return { proposal: structuredClone(previewSafeProposals[1]), snapshot };
  }
  if (scenario === "approval-needed") {
    return {
      proposal: { ...ready, state: "draft", confirmations: [] },
      snapshot: {
        ...snapshot,
        owners: [PK_OWNER, SEED_OWNER, EXTERNAL_OWNER],
        threshold: 2,
        capability: "quorumAvailable",
      },
    };
  }
  if (scenario === "waiting-external") {
    return {
      proposal: { ...ready, state: "awaitingApprovals" },
      snapshot: {
        ...snapshot,
        owners: [PK_OWNER, EXTERNAL_OWNER],
        threshold: 2,
        capability: "approve",
      },
    };
  }
  if (scenario === "observe-only") {
    return {
      proposal: { ...ready, state: "awaitingApprovals", confirmations: [] },
      snapshot: {
        ...snapshot,
        owners: [EXTERNAL_OWNER],
        threshold: 1,
        capability: "observe",
      },
    };
  }
  if (scenario === "configuration-changed") {
    return {
      proposal: {
        ...ready,
        state: "blocked",
        error: "Safe configuration changed; create and review a new proposal.",
      },
      snapshot: { ...snapshot, capability: "blocked" },
    };
  }
  if (scenario === "execution-success") {
    return {
      proposal: {
        ...ready,
        state: "executed",
        transactionHash: `0x${"7e".repeat(32)}`,
        route: {
          kind: "injected",
          origin: "https://swap.defillama.com",
          requestId: "preview-executed-request",
        },
      },
      snapshot,
    };
  }
  if (scenario === "replaced") {
    return {
      proposal: {
        ...ready,
        state: "replaced",
        error: "Another proposal at this Safe nonce executed",
        route: {
          kind: "injected",
          origin: "https://swap.defillama.com",
          requestId: "preview-replaced-request",
        },
      },
      snapshot,
    };
  }
  if (scenario === "execution-failure") {
    return {
      proposal: {
        ...ready,
        state: "failed",
        transactionHash: `0x${"fa".repeat(32)}`,
        error: "Safe execution reverted.",
      },
      snapshot,
    };
  }
  if (scenario === "rejection-signing" || scenario === "rejection-ready") {
    const isReady = scenario === "rejection-ready";
    return {
      proposal: {
        ...ready,
        id: `8453:${ready.safeAddress}:0x${"ca".repeat(32)}`,
        safeTxHash: `0x${"ca".repeat(32)}`,
        calls: [{
          to: ready.safeAddress,
          value: "0",
          data: "0x",
          operation: 0,
        }],
        transaction: {
          ...ready.transaction,
          to: ready.safeAddress,
          value: "0",
          data: "0x",
          operation: 0,
        },
        state: isReady ? "readyToExecute" : "draft",
        confirmations: isReady ? ready.confirmations : [],
        route: { kind: "wallet", origin: "WalletChan" },
        purpose: "rejection",
      },
      snapshot,
    };
  }
  return { proposal: ready, snapshot };
}

function ImportPreview({ scenario }: { scenario: string }) {
  const scanning = scenario === "import-scanning";
  return (
    <AppScreen>
      <AppHeader title="Add Safe" onBack={() => undefined} />
      <ScreenBody pt={5}>
        <VStack align="stretch" spacing={4}>
          <HStack p={4} bg="surface.raised" border="1px solid" borderColor="border.subtle" borderRadius="lg">
            <Box p={2} bg="status.success.bg" color="status.success.fg" borderRadius="md">
              <SafeIcon boxSize="22px" />
            </Box>
            <Box flex={1} minW={0}>
              <Text fontWeight="700">Treasury Safe</Text>
              <Text fontSize="xs" color="fg.secondary" fontFamily="mono">
                {SAFE_ACCOUNT.address.slice(0, 10)}…{SAFE_ACCOUNT.address.slice(-8)}
              </Text>
            </Box>
          </HStack>
          <Alert status={scanning ? "info" : "warning"} alignItems="start">
            <AlertIcon />
            <Box>
              <Text fontWeight="700">{scanning ? "Checking supported networks" : "Safe verified on 2 networks"}</Text>
              <Text fontSize="sm">
                {scanning
                  ? "Verifying canonical Safe deployments…"
                  : "One network could not be reached and can be retried later."}
              </Text>
            </Box>
          </Alert>
          <ScreenSection title="Verified networks" description="Authority is verified independently on each chain">
            <VStack align="stretch" spacing={2}>
              {["Base · 2 of 3 · Safe 1.4.1", "Ethereum · 2 of 3 · Safe 1.4.1"].map((chain) => (
                <HStack key={chain} justify="space-between" p={3} bg="surface.raised" borderRadius="lg">
                  <Text fontSize="sm" fontWeight="700">{chain}</Text>
                  <Badge>Verified</Badge>
                </HStack>
              ))}
            </VStack>
          </ScreenSection>
          {!scanning && <Button variant="brand">Add Safe</Button>}
        </VStack>
      </ScreenBody>
    </AppScreen>
  );
}

export default function SafePreview({ scenario }: { scenario: string }) {
  if (scenario.startsWith("import-")) return <ImportPreview scenario={scenario} />;
  if (scenario === "settings") {
    return (
      <SafeSecurityScreen
        account={SAFE_ACCOUNT}
        onBack={() => undefined}
        onAccountUpdated={() => undefined}
        onRemoved={() => undefined}
      />
    );
  }
  const { proposal, snapshot } = scenarioFixture(scenario);
  return (
    <SafeProposalConfirmation
      safeAccount={SAFE_ACCOUNT}
      proposal={proposal}
      snapshot={snapshot}
      accounts={previewAccounts}
      chainName="Base"
      explorer="https://basescan.org"
      onBack={() => undefined}
      onOpenProposal={() => undefined}
      onReload={async () => undefined}
      onExecutionSubmitted={() => undefined}
    />
  );
}
