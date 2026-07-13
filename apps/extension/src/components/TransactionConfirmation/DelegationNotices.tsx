import { ExternalLinkIcon } from "@chakra-ui/icons";
import {
  Badge,
  Box,
  HStack,
  IconButton,
  Text,
  VStack,
} from "@chakra-ui/react";
import type { PendingTxRequest } from "@/chrome/requests/pendingTxStorage";
import { useTheme } from "@/theme";
import { CopyButton } from "./CopyButton";

function EffectBullet({ children }: { children: React.ReactNode }) {
  return (
    <HStack spacing={2} align="flex-start">
      <Text
        fontSize="xs"
        color="status.warning.fg"
        fontWeight="900"
        lineHeight="short"
      >
        •
      </Text>
      <Text
        fontSize="xs"
        color="status.warning.fg"
        fontWeight="600"
        lineHeight="short"
      >
        {children}
      </Text>
    </HStack>
  );
}

function NoticeShell({ children }: { children: React.ReactNode }) {
  const { tokens } = useTheme();
  return (
    <Box
      p={3}
      bg="status.warning.bg"
      border={tokens.borders.medium}
      borderColor="status.warning.border"
      borderRadius="lg"
      boxShadow="card"
    >
      <VStack spacing={2.5} align="stretch">
        {children}
      </VStack>
    </Box>
  );
}

function AfterConfirmationLabel() {
  return (
    <>
      <Box h="1px" bg="status.warning.border" opacity={0.5} />
      <Text
        fontSize="2xs"
        color="status.warning.fg"
        fontWeight="700"
        textTransform="uppercase"
        letterSpacing="wider"
      >
        After confirmation
      </Text>
    </>
  );
}

export function DelegationRevokeNotice({ chainName }: { chainName: string }) {
  return (
    <NoticeShell>
      <Text
        fontSize="xs"
        color="status.warning.fg"
        fontWeight="600"
        lineHeight="short"
      >
        Sends an EIP-7702 transaction that removes your account&apos;s onchain
        delegation on{" "}
        <Text as="span" fontWeight="900">
          {chainName}
        </Text>
        .
      </Text>
      <AfterConfirmationLabel />
      <VStack spacing={1.5} align="stretch">
        <EffectBullet>Account stops behaving as a smart account.</EffectBullet>
      </VStack>
    </NoticeShell>
  );
}

interface DelegationSetNoticeProps {
  delegation: NonNullable<PendingTxRequest["delegation7702Meta"]>;
  chainName: string;
  delegateLabels: string[];
  explorer?: string;
}

export function DelegationSetNotice({
  delegation,
  chainName,
  delegateLabels,
  explorer,
}: DelegationSetNoticeProps) {
  return (
    <NoticeShell>
      <Text
        fontSize="xs"
        color="status.warning.fg"
        fontWeight="600"
        lineHeight="short"
      >
        Sends an EIP-7702 transaction that delegates your account on{" "}
        <Text as="span" fontWeight="900">
          {chainName}
        </Text>{" "}
        to the contract below.
      </Text>

      <Box
        p={2}
        bg="surface.raised"
        border="1.5px solid"
        borderColor="status.warning.border"
        borderRadius="md"
      >
        <Text
          fontSize="2xs"
          color="status.warning.fg"
          fontWeight="700"
          textTransform="uppercase"
          letterSpacing="wider"
          mb={1}
        >
          Delegating to
        </Text>
        <HStack spacing={1.5} align="center">
          <Text
            fontSize="xs"
            color="text.primary"
            fontFamily="mono"
            fontWeight="700"
            isTruncated
          >
            {delegation.targetDelegate.slice(0, 10)}…
            {delegation.targetDelegate.slice(-8)}
          </Text>
          <CopyButton value={delegation.targetDelegate} />
          {explorer && (
            <IconButton
              aria-label="View on explorer"
              icon={<ExternalLinkIcon boxSize="12px" />}
              size="xs"
              variant="ghost"
              minW="24px"
              w="24px"
              h="24px"
              color="text.tertiary"
              onClick={() =>
                window.open(
                  `${explorer}/address/${delegation.targetDelegate}`,
                  "_blank",
                  "noopener,noreferrer",
                )
              }
              _hover={{ color: "accent.secondary", bg: "bg.muted" }}
            />
          )}
        </HStack>
        {delegateLabels.length > 0 && (
          <HStack spacing={1} mt={1.5}>
            <Badge
              bg="accent.secondary"
              color="accentFg.secondary"
              fontSize="2xs"
              fontWeight="800"
              px={1.5}
              py={0}
              border="1px solid"
              borderColor="border.default"
            >
              {delegateLabels[0]}
            </Badge>
          </HStack>
        )}
      </Box>

      <AfterConfirmationLabel />
      <VStack spacing={1.5} align="stretch">
        <EffectBullet>
          Your account starts behaving as a smart account on this chain.
        </EffectBullet>
        <EffectBullet>
          Future multi-call batches execute as a single atomic tx.
        </EffectBullet>
        <EffectBullet>
          Use Revoke in Account Settings to undo this any time.
        </EffectBullet>
      </VStack>
    </NoticeShell>
  );
}
