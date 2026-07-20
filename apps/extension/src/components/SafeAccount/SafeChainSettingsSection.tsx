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
import { CopyButton } from "@/components/CopyButton";
import MiddleTruncatedAddress from "@/components/MiddleTruncatedAddress";
import { ScreenSection } from "@/components/ui";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

function ownerAccountLabel(owner: string, accounts: Account[]): string {
  const linked = accounts.filter(
    (candidate) =>
      candidate.address.toLowerCase() === owner.toLowerCase() &&
      ["bankr", "privateKey", "seedPhrase"].includes(candidate.type),
  );

  if (!linked.length) return "External owner";
  return linked.map((candidate) => candidate.displayName || "Your account").join(" · ");
}

function configurationLabel(address: string): string {
  return address.toLowerCase() === ZERO_ADDRESS ? "None" : "Configured";
}

function AddressActionRow({
  address,
  label,
  explorerUrl,
}: {
  address: string;
  label: string;
  explorerUrl?: string;
}) {
  return (
    <HStack spacing={2} minW={0}>
      <Box minW={0} flex={1} color="fg.secondary" fontFamily="mono" fontSize="xs">
        <MiddleTruncatedAddress address={address} />
      </Box>
      <CopyButton value={address} label={`Copy ${label}`} />
      {explorerUrl && (
        <IconButton
          as="a"
          href={explorerUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`View ${label} on explorer`}
          icon={<ExternalLinkIcon />}
          size="xs"
          minW="24px"
          w="24px"
          h="24px"
          variant="ghost"
          color="fg.secondary"
          _hover={{ color: "accent.highlight", bg: "surface.raisedHover" }}
        />
      )}
    </HStack>
  );
}

export function SafeChainSettingsSection({
  snapshot,
  chain,
  safeAddress,
  accounts,
}: {
  snapshot: SafeChainSnapshot;
  chain?: { name: string; explorer: string };
  safeAddress: string;
  accounts: Account[];
}) {
  const chainName = chain?.name || `Chain ${snapshot.chainId}`;
  const explorerAddressUrl = chain ? `${chain.explorer}/address` : undefined;

  return (
    <ScreenSection title={chainName}>
      <Box
        bg="surface.raised"
        border="1px solid"
        borderColor="border.default"
        borderRadius="lg"
        overflow="hidden"
      >
        <HStack px={4} py={3} spacing={3} borderBottom="1px solid" borderColor="border.subtle">
          <ChainIcon chainId={snapshot.chainId} chainName={chainName} size="32px" withChip />
          <Box flex={1} minW={0}>
            <Text fontSize="sm" fontWeight="600">Safe {snapshot.version}</Text>
            <Text color="fg.secondary" fontSize="xs" sx={{ fontVariantNumeric: "tabular-nums" }}>
              Nonce {snapshot.nonce}
            </Text>
          </Box>
          <IconButton
            as="a"
            href={`https://app.safe.global/home?safe=${snapshot.chainId}:${safeAddress}`}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Open ${chainName} Safe in Safe Wallet`}
            icon={<ExternalLinkIcon />}
            size="sm"
            variant="ghost"
            color="accent.secondary"
          />
        </HStack>

        <SimpleGrid columns={2} spacing={0} borderBottom="1px solid" borderColor="border.subtle">
          <Box px={4} py={3} borderRight="1px solid" borderColor="border.subtle">
            <Text color="fg.muted" fontSize="xs">Approval threshold</Text>
            <Text mt={0.5} fontSize="sm" fontWeight="600">
              {snapshot.threshold} of {snapshot.owners.length} owners
            </Text>
          </Box>
          <Box px={4} py={3}>
            <Text color="fg.muted" fontSize="xs">Transaction service</Text>
            <Text mt={0.5} fontSize="sm" fontWeight="600" textTransform="capitalize">
              {snapshot.transactionService}
            </Text>
          </Box>
        </SimpleGrid>

        <Box px={4} py={3} borderBottom="1px solid" borderColor="border.subtle">
          <Text color="fg.muted" fontSize="xs" mb={2}>Owners</Text>
          <VStack align="stretch" spacing={3}>
            {snapshot.owners.map((owner) => {
              const isContractOwner = snapshot.contractOwners.includes(owner);
              return (
                <Box key={owner}>
                  <HStack mb={1} spacing={2} justify="space-between">
                    <Text fontSize="sm" fontWeight="600" noOfLines={1}>
                      {isContractOwner ? "Contract owner" : ownerAccountLabel(owner, accounts)}
                    </Text>
                    {isContractOwner && <Badge variant="warning">Unsupported</Badge>}
                  </HStack>
                  <AddressActionRow
                    address={owner}
                    label="owner address"
                    explorerUrl={explorerAddressUrl && `${explorerAddressUrl}/${owner}`}
                  />
                </Box>
              );
            })}
          </VStack>
        </Box>

        <Box px={4} py={3} borderBottom="1px solid" borderColor="border.subtle">
          <Text color="fg.muted" fontSize="xs" mb={1}>Singleton contract</Text>
          <AddressActionRow
            address={snapshot.singleton}
            label="singleton address"
            explorerUrl={explorerAddressUrl && `${explorerAddressUrl}/${snapshot.singleton}`}
          />
        </Box>

        <SimpleGrid columns={3} spacing={0} px={4} py={3}>
          {[
            ["Modules", String(snapshot.modules.length)],
            ["Guard", configurationLabel(snapshot.guard)],
            ["Fallback", configurationLabel(snapshot.fallbackHandler)],
          ].map(([label, value]) => (
            <Box key={label} minW={0}>
              <Text color="fg.muted" fontSize="xs">{label}</Text>
              <Text mt={0.5} fontSize="sm" fontWeight="600" noOfLines={1}>{value}</Text>
            </Box>
          ))}
        </SimpleGrid>

        {snapshot.blockedReason && (
          <Box px={4} py={3} bg="status.warning.bg" borderTop="1px solid" borderColor="status.warning.border">
            <Text color="status.warning.fg" fontSize="sm">{snapshot.blockedReason}</Text>
          </Box>
        )}
      </Box>
    </ScreenSection>
  );
}
