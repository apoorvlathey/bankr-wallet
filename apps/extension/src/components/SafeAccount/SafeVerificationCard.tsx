import { ExternalLinkIcon } from "@chakra-ui/icons";
import {
  Badge,
  Box,
  HStack,
  IconButton,
  SimpleGrid,
  Text,
  VStack,
} from "@chakra-ui/react";
import type { Account } from "@/chrome/types";
import type { SafeChainSnapshot } from "@/chrome/safe/types";
import ChainIcon from "@/components/ChainIcon";
import { LabeledAddressPopover } from "@/components/shared/LabeledAddressPopover";
import { SafeCapabilityBadge } from "./SafeCapabilityBadge";

function walletTypeLabel(account: Account) {
  if (account.type === "bankr") return "Bankr API";
  if (account.type === "privateKey") return "Private key";
  if (account.type === "seedPhrase") return "Seed phrase";
  return account.type;
}

function formatBalance(balanceUsd: number | undefined) {
  if (balanceUsd === undefined) return "Unavailable";
  return `$${balanceUsd.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

export function SafeVerificationCard({
  snapshot,
  chain,
  safeAddress,
  balanceUsd,
  accounts,
  isAlreadyAdded = false,
}: {
  snapshot: SafeChainSnapshot;
  chain?: { name: string; explorer: string };
  safeAddress: `0x${string}`;
  balanceUsd?: number;
  accounts: Account[];
  isAlreadyAdded?: boolean;
}) {
  const chainName = chain?.name ?? `Chain ${snapshot.chainId}`;

  return (
    <Box
      p={3}
      bg="surface.raised"
      border="1px solid"
      borderColor="border.subtle"
      borderRadius="md"
    >
      <HStack justify="space-between" align="start" spacing={3}>
        <HStack minW={0} spacing={2.5}>
          <ChainIcon
            chainId={snapshot.chainId}
            chainName={chainName}
            size="28px"
            withChip
          />
          <Box minW={0}>
            <Text fontWeight="700" noOfLines={1}>{chainName}</Text>
            <Text color="fg.secondary" fontSize="xs">Safe {snapshot.version}</Text>
          </Box>
        </HStack>
        <HStack flexShrink={0} spacing={1}>
          <SafeCapabilityBadge
            capability={snapshot.capability}
            isAlreadyAdded={isAlreadyAdded}
          />
          {chain && (
            <IconButton
              as="a"
              href={`${chain.explorer}/address/${safeAddress}`}
              target="_blank"
              rel="noreferrer"
              aria-label={`View Safe on ${chain.name}`}
              icon={<ExternalLinkIcon />}
              size="xs"
              variant="ghost"
            />
          )}
        </HStack>
      </HStack>

      <SimpleGrid
        columns={2}
        spacing={3}
        mt={3}
        pt={3}
        borderTop="1px solid"
        borderColor="border.subtle"
      >
        <Box>
          <Text color="fg.muted" fontSize="xs">Approval threshold</Text>
          <Text mt={0.5} fontSize="sm" fontWeight="600">
            {snapshot.threshold} of {snapshot.owners.length} owners
          </Text>
        </Box>
        <Box textAlign="right">
          <Text color="fg.muted" fontSize="xs">Balance</Text>
          <Text mt={0.5} fontSize="sm" fontWeight="600" sx={{ fontVariantNumeric: "tabular-nums" }}>
            {formatBalance(balanceUsd)}
          </Text>
        </Box>
      </SimpleGrid>

      <Box mt={3} pt={3} borderTop="1px solid" borderColor="border.subtle">
        <Text color="fg.muted" fontSize="xs" mb={1}>Owners</Text>
        <VStack align="stretch" spacing={0}>
          {snapshot.owners.map((owner, index) => {
            const linked = accounts.filter(
              (account) => account.address.toLowerCase() === owner,
            );
            const isContractOwner = snapshot.contractOwners.includes(owner);
            const ownerTitle = isContractOwner
              ? "Contract owner"
              : linked[0]?.displayName || (linked.length ? "Your owner account" : "External owner");
            const ownerType = isContractOwner
              ? "Unsupported"
              : linked.length
                ? linked.map(walletTypeLabel).join(" · ")
                : "External";

            return (
              <HStack
                key={owner}
                w="full"
                spacing={3}
                justify="space-between"
                py={2}
                borderTop={index ? "1px solid" : undefined}
                borderColor="border.subtle"
              >
                <LabeledAddressPopover
                  account={linked[0] ?? null}
                  address={owner}
                  contextLabel="Safe owner address"
                  explorer={chain?.explorer}
                  label={ownerTitle}
                  maxW="260px"
                  showFallbackAvatar
                />
                <Badge flexShrink={0}>{ownerType}</Badge>
              </HStack>
            );
          })}
        </VStack>
      </Box>

      {snapshot.blockedReason && (
        <Text mt={2} color="status.warning.fg" fontSize="xs">
          {snapshot.blockedReason}
        </Text>
      )}
    </Box>
  );
}
