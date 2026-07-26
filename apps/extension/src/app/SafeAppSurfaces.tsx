import { Box, Button, Text } from "@chakra-ui/react";
import type { Account, SafeAccount } from "@/chrome/types";
import SafeApprovalsScreen from "@/components/SafeApprovals/SafeApprovalsScreen";
import { SafeProposalActivity } from "@/components/SafeApprovals/SafeProposalActivity";
import { SafeHomeAlert } from "@/components/SafeAccount/SafeHomeAlert";
import { SafeQuickActions } from "@/components/SafeAccount/SafeQuickActions";

export function SafeFeatureUnavailable({ title, onBack }: { title: string; onBack: () => void }) {
  return <Box bg="bg.base" h="100%" px={5} display="flex" flexDirection="column" alignItems="center" justifyContent="center" gap={4} textAlign="center">
    <Text color="fg.primary" fontSize="xl" fontWeight="700">{title}</Text>
    <Text color="fg.secondary" fontSize="sm" maxW="320px">This action uses the Safe proposal and approval flow. It is unavailable through the standard wallet signer.</Text>
    <Button variant="secondary" onClick={onBack}>Back</Button>
  </Box>;
}

export function SafeApprovalsSurface({ account, chainId, accounts, proposalId, fullscreen, onBack, onProposalBack, onExecutionSubmitted, onExecutionConfirmed }: { account: SafeAccount; chainId: number; accounts: Account[]; proposalId: string | null; fullscreen: boolean; onBack: () => void; onProposalBack?: () => void; onExecutionSubmitted: () => void; onExecutionConfirmed: () => void }) {
  return <Box bg="bg.base" h="100%" display="flex" flexDirection="column"><Box maxW={fullscreen ? "480px" : "100%"} mx="auto" w="100%" h="100%"><SafeApprovalsScreen safeAccount={account} chainId={chainId} accounts={accounts} initialProposalId={proposalId} onBack={onBack} onProposalBack={onProposalBack} onExecutionSubmitted={onExecutionSubmitted} onExecutionConfirmed={onExecutionConfirmed} /></Box></Box>;
}

export function SafeHomeApprovalRail({ accountId, onOpen }: { accountId: string; onOpen: () => void }) {
  return <SafeHomeAlert safeAccountId={accountId} onOpen={onOpen} />;
}

export function SafeHomeQuickActions({ hasConnectedApps, onSend, onSwap, onMore }: { hasConnectedApps?: boolean; onSend: () => void; onSwap: () => void; onMore: () => void }) {
  return <SafeQuickActions hasConnectedApps={hasConnectedApps} onSend={onSend} onSwap={onSwap} onMore={onMore} />;
}

export function SafeHomeActivity({ accountId, accounts, chainId, onOpen, onVisibilityChange }: { accountId: string; accounts: Account[]; chainId: number | null; onOpen: (proposalId: string) => void; onVisibilityChange: (visible: boolean) => void }) {
  return <SafeProposalActivity safeAccountId={accountId} accounts={accounts} filterChainId={chainId} onOpen={onOpen} onVisibilityChange={onVisibilityChange} />;
}
