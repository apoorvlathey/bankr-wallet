import { ExternalLinkIcon } from "@chakra-ui/icons";
import {
  Box,
  Button,
  HStack,
  Link,
  Text,
  usePrefersReducedMotion,
  VStack,
} from "@chakra-ui/react";
import { useRef } from "react";
import { isUnsignedSafeNonceEditable } from "@/chrome/safe/proposalNonce";
import type { SafeProposalRecord } from "@/chrome/safe/types";
import { CopyButton } from "@/components/CopyButton";
import { InlineDisclosure } from "@/components/ui";
import { SafeProposalNonceEditor } from "./SafeProposalNonceEditor";

function short(value: string) {
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}

function DetailRow({ label, value, copy }: { label: string; value: string; copy?: string }) {
  return (
    <HStack minH="44px" px={3} py={2} spacing={3} justify="space-between" borderTop="1px solid" borderColor="border.subtle">
      <Text color="fg.secondary" fontSize="xs" fontWeight="600">{label}</Text>
      <HStack minW={0} justify="flex-end">
        <Text fontFamily="mono" fontSize="xs" noOfLines={1}>{value}</Text>
        {copy && <CopyButton value={copy} />}
      </HStack>
    </HStack>
  );
}

export function SafeProposalAdvancedDetails({
  proposal,
  explorer,
  busy,
  readOnly,
  onAction,
  minimumNonce,
  onNonceChange,
}: {
  proposal: SafeProposalRecord;
  explorer?: string;
  busy: boolean;
  readOnly: boolean;
  onAction: (message: Record<string, unknown>, notice?: string) => void;
  minimumNonce: `${bigint}`;
  onNonceChange: (nonce: string) => Promise<boolean>;
}) {
  const disclosureRef = useRef<HTMLDetailsElement>(null);
  const prefersReducedMotion = usePrefersReducedMotion();
  const hasUnpublishedApproval = proposal.confirmations.some((item) => !item.publishedAt);
  const canDetach = !readOnly &&
    (proposal.route.kind === "injected" || proposal.route.kind === "walletConnect") &&
    !proposal.route.detachedAt;
  const canHide =
    ["cancelled", "executed", "failed", "replaced"].includes(proposal.state);
  const canChangeNonce = !readOnly && isUnsignedSafeNonceEditable(proposal);

  const handleOpenChange = (open: boolean) => {
    if (!open) return;
    requestAnimationFrame(() => {
      if (!disclosureRef.current?.open) return;
      disclosureRef.current.scrollIntoView({
        behavior: prefersReducedMotion ? "auto" : "smooth",
        block: "start",
      });
    });
  };

  return (
    <InlineDisclosure
      ref={disclosureRef}
      label="Advanced details"
      onOpenChange={handleOpenChange}
    >
      <Box bg="surface.raised" border="1px solid" borderColor="border.default" borderRadius="lg" overflow="hidden">
        <SafeProposalNonceEditor
          nonce={proposal.transaction.nonce}
          minimumNonce={minimumNonce}
          busy={busy}
          editable={canChangeNonce}
          onNonceChange={onNonceChange}
        />
        <DetailRow label="Safe proposal" value={short(proposal.safeTxHash)} copy={proposal.safeTxHash} />
        {proposal.transactionHash && (
          <DetailRow label="Onchain transaction" value={short(proposal.transactionHash)} copy={proposal.transactionHash} />
        )}
        <DetailRow label="Safe version" value={proposal.safeVersion} />
      </Box>

      <VStack align="stretch" spacing={2} mt={3}>
        {proposal.transactionHash && explorer && (
          <Button
            as={Link}
            href={`${explorer}/tx/${proposal.transactionHash}`}
            isExternal
            variant="secondary"
            rightIcon={<ExternalLinkIcon />}
          >
            View transaction
          </Button>
        )}
        {!readOnly && proposal.state === "ambiguous" && !proposal.transactionHash && (
          <Button variant="secondary" isLoading={busy} onClick={() => onAction({ type: "retrySafePublication", proposalId: proposal.id }, "Publication retry started.")}>
            Retry publication
          </Button>
        )}
        {!readOnly && proposal.state !== "ambiguous" && hasUnpublishedApproval && (
          <Button variant="secondary" isLoading={busy} onClick={() => onAction({ type: "publishSafeProposal", proposalId: proposal.id }, "Saved approval shared.")}>
            Share saved approval
          </Button>
        )}
        {canDetach && (
          <Button variant="secondary" isLoading={busy} onClick={() => onAction({ type: "detachSafeProposalRoute", proposalId: proposal.id }, "Initiating app disconnected. The Safe proposal remains in WalletChan.")}>
            Detach from app
          </Button>
        )}
        {canHide && (
          <Button variant="ghost" isLoading={busy} onClick={() => onAction({ type: "hideSafeProposal", proposalId: proposal.id })}>
            Hide from Activity
          </Button>
        )}
      </VStack>
    </InlineDisclosure>
  );
}
