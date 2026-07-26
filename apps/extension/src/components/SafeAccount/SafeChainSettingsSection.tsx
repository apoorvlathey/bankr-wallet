import { ExternalLinkIcon } from "@chakra-ui/icons";
import {
  Accordion,
  AccordionButton,
  AccordionIcon,
  AccordionItem,
  AccordionPanel,
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
import { LabeledAddressPopover } from "@/components/shared/LabeledAddressPopover";
import { ScreenSection } from "@/components/ui";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

interface SafeChainDescriptor {
  chainId: number;
  name: string;
  explorer: string;
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

function SafeChainDetails({
  snapshot,
  chain,
  accounts,
}: {
  snapshot: SafeChainSnapshot;
  chain?: SafeChainDescriptor;
  accounts: Account[];
}) {
  const explorerAddressUrl = chain ? `${chain.explorer}/address` : undefined;

  return (
    <>
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
              const linkedAccount = accounts.find(
                (candidate) => candidate.address.toLowerCase() === owner.toLowerCase(),
              );
              return (
                <HStack key={owner} spacing={2} justify="space-between">
                  <LabeledAddressPopover
                    account={linkedAccount ?? null}
                    address={owner}
                    contextLabel="Safe owner address"
                    explorer={chain?.explorer}
                    label={isContractOwner ? "Contract owner" : "External owner"}
                    maxW="260px"
                    showFallbackAvatar
                  />
                  {isContractOwner && <Badge variant="warning">Unsupported</Badge>}
                </HStack>
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
    </>
  );
}

function SafeChainHeader({
  snapshot,
  chainName,
  safeAddress,
  showChainIcon = true,
}: {
  snapshot: SafeChainSnapshot;
  chainName: string;
  safeAddress: string;
  showChainIcon?: boolean;
}) {
  return (
    <HStack px={4} py={3} spacing={3} borderBottom="1px solid" borderColor="border.subtle">
      {showChainIcon && <ChainIcon chainId={snapshot.chainId} chainName={chainName} size="32px" withChip />}
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
  );
}

export function SafeChainSettingsSection({
  snapshot,
  chain,
  safeAddress,
  accounts,
}: {
  snapshot: SafeChainSnapshot;
  chain?: SafeChainDescriptor;
  safeAddress: string;
  accounts: Account[];
}) {
  const chainName = chain?.name || `Chain ${snapshot.chainId}`;
  return (
    <ScreenSection title={chainName}>
      <Box bg="surface.raised" border="1px solid" borderColor="border.default" borderRadius="lg" overflow="hidden">
        <SafeChainHeader snapshot={snapshot} chainName={chainName} safeAddress={safeAddress} />
        <SafeChainDetails snapshot={snapshot} chain={chain} accounts={accounts} />
      </Box>
    </ScreenSection>
  );
}

export function SafeChainSettingsAccordion({
  snapshots,
  chains,
  safeAddress,
  accounts,
}: {
  snapshots: SafeChainSnapshot[];
  chains: readonly SafeChainDescriptor[];
  safeAddress: string;
  accounts: Account[];
}) {
  return (
    <ScreenSection title="Safe networks" description={`${snapshots.length} deployments`}>
      <Accordion allowToggle border="1px solid" borderColor="border.default" borderRadius="lg" overflow="hidden">
        {snapshots.map((snapshot) => {
          const chain = chains.find((item) => item.chainId === snapshot.chainId);
          const chainName = chain?.name || `Chain ${snapshot.chainId}`;
          return (
            <AccordionItem key={snapshot.chainId} border="0" borderBottom="1px solid" borderColor="border.subtle" _last={{ borderBottom: 0 }}>
              <AccordionButton px={4} py={3} gap={3} _hover={{ bg: "surface.raisedHover" }}>
                <ChainIcon chainId={snapshot.chainId} chainName={chainName} size="32px" withChip />
                <Box flex={1} minW={0} textAlign="left">
                  <Text fontSize="sm" fontWeight="600" noOfLines={1}>{chainName}</Text>
                  <Text color="fg.secondary" fontSize="xs" noOfLines={1}>
                    Safe {snapshot.version} · {snapshot.threshold} of {snapshot.owners.length} owners
                  </Text>
                </Box>
                <AccordionIcon color="fg.muted" />
              </AccordionButton>
              <AccordionPanel p={0} borderTop="1px solid" borderColor="border.subtle">
                <SafeChainHeader snapshot={snapshot} chainName={chainName} safeAddress={safeAddress} showChainIcon={false} />
                <SafeChainDetails snapshot={snapshot} chain={chain} accounts={accounts} />
              </AccordionPanel>
            </AccordionItem>
          );
        })}
      </Accordion>
    </ScreenSection>
  );
}
