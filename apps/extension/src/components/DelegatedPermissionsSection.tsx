import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Box,
  Button,
  Collapse,
  HStack,
  IconButton,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Spinner,
  Text,
  VStack,
} from "@chakra-ui/react";
import {
  ChevronDownIcon,
  ChevronRightIcon,
  RepeatIcon,
  WarningTwoIcon,
} from "@chakra-ui/icons";

import type { Erc7715PermissionGrant } from "@/chrome/pendingErc7715PermissionStorage";
import type { Account } from "@/chrome/types";
import DelegatedPermissionGrantCard from "@/components/DelegatedPermissionGrantCard";
import DappSiteIcon from "@/components/DappSiteIcon";
import {
  EmptyState,
  EmptyStateDescription,
  EmptyStateHeader,
  EmptyStateMedia,
  EmptyStateTitle,
  ListSurface,
} from "@/components/ui";
import { ShieldIcon } from "@/components/Settings/icons";
import { useNetworks } from "@/contexts/NetworksContext";
import {
  groupGrantsByOrigin,
  metadataKey,
  tokenAddressFromGrant,
} from "@/lib/erc7715PermissionDisplay";
import { getResolvedChainById } from "@/lib/chains";
import {
  resolveTokenMetadataClient,
  type TokenDisplayMetadata,
} from "@/lib/tokenMetadataClient";
import { useThemedToast } from "@/hooks/useThemedToast";
import { useEnsIdentities } from "@/hooks/useEnsIdentities";
import { useTheme } from "@/theme";

type GrantsResponse =
  | { success: true; grants: Erc7715PermissionGrant[] }
  | { success: false; error?: string }
  | undefined;

function originLabel(origin: string): string {
  try {
    return new URL(origin).hostname || origin;
  } catch {
    return origin;
  }
}

export default function DelegatedPermissionsSection({
  accountId,
  standalone = false,
}: {
  accountId: string;
  standalone?: boolean;
}) {
  const toast = useThemedToast();
  const { tokens } = useTheme();
  const { networksInfo } = useNetworks();
  const [isExpanded, setIsExpanded] = useState(standalone);
  const [isLoading, setIsLoading] = useState(false);
  const [grants, setGrants] = useState<Erc7715PermissionGrant[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [queueingRevokeId, setQueueingRevokeId] = useState<string | null>(null);
  const [selectedGrant, setSelectedGrant] =
    useState<Erc7715PermissionGrant | null>(null);
  const [metadata, setMetadata] = useState<
    Record<string, TokenDisplayMetadata | null>
  >({});

  const loadGrants = useCallback(() => {
    setIsLoading(true);
    setError(null);
    chrome.runtime.sendMessage(
      { type: "getErc7715PermissionGrantsForAccount", accountId },
      (response: GrantsResponse) => {
        setIsLoading(false);
        const runtimeError = chrome.runtime.lastError?.message;
        const responseError =
          response && !response.success ? response.error : undefined;
        if (runtimeError || !response?.success) {
          setError(
            runtimeError ||
              responseError ||
              "Failed to load delegated permissions",
          );
          return;
        }
        setGrants(response.grants);
      },
    );
  }, [accountId]);

  useEffect(() => {
    if (isExpanded) loadGrants();
  }, [isExpanded, loadGrants]);

  useEffect(() => {
    const loadAccounts = () => {
      chrome.runtime.sendMessage(
        { type: "getAccounts" },
        (response: Account[] | null | undefined) => {
          if (chrome.runtime.lastError || !Array.isArray(response)) return;
          setAccounts(response);
        },
      );
    };
    const handleMessage = (message: { type?: string }) => {
      if (message.type === "accountsUpdated") loadAccounts();
    };

    loadAccounts();
    chrome.runtime.onMessage.addListener(handleMessage);
    return () => chrome.runtime.onMessage.removeListener(handleMessage);
  }, [accountId]);

  useEffect(() => {
    const requests = grants
      .map((grant) => ({
        chainId: grant.chainId,
        tokenAddress: tokenAddressFromGrant(grant),
      }))
      .filter(
        (request): request is { chainId: number; tokenAddress: string } =>
          !!request.tokenAddress,
      );

    for (const request of requests) {
      const key = metadataKey(request.chainId, request.tokenAddress);
      if (metadata[key] !== undefined) continue;
      resolveTokenMetadataClient(request.chainId, request.tokenAddress).then(
        (nextMetadata) => {
          setMetadata((current) => ({ ...current, [key]: nextMetadata }));
        },
      );
    }
  }, [grants, metadata]);

  const groupedGrants = useMemo(() => groupGrantsByOrigin(grants), [grants]);
  const accountsByAddress = useMemo(
    () => new Map(accounts.map((account) => [account.address.toLowerCase(), account])),
    [accounts],
  );
  const recognizedDelegateAddresses = useMemo(
    () =>
      Array.from(
        new Set(
          grants
            .map((grant) => grant.request.to)
            .filter((address) => accountsByAddress.has(address.toLowerCase())),
        ),
      ),
    [accountsByAddress, grants],
  );
  const { identities: delegateIdentities } = useEnsIdentities(
    recognizedDelegateAddresses,
  );
  const activeSummary = `${grants.length} active permission${grants.length === 1 ? "" : "s"} · ${groupedGrants.length} site${groupedGrants.length === 1 ? "" : "s"}`;

  const handleOnchainRevoke = () => {
    if (!selectedGrant) return;
    setQueueingRevokeId(selectedGrant.id);
    chrome.runtime.sendMessage(
      {
        type: "initiateErc7715PermissionRevoke",
        grantId: selectedGrant.id,
        accountId,
      },
      (
        response:
          | { success: true; txId?: string; localOnly?: boolean }
          | { success: false; error?: string }
          | undefined,
      ) => {
        setQueueingRevokeId(null);
        const runtimeError = chrome.runtime.lastError?.message;
        const responseError =
          response && !response.success ? response.error : undefined;
        if (runtimeError || !response?.success) {
          toast({
            title: "Failed to queue revoke",
            description: runtimeError || responseError || "Unknown error",
            status: "error",
            duration: 4000,
          });
          return;
        }

        setSelectedGrant(null);
        if (response.localOnly) {
          setGrants((current) =>
            current.filter((grant) => grant.id !== selectedGrant.id),
          );
          toast({
            title: "Permission already inactive",
            description:
              "The grant was already expired or disabled onchain, so it was removed from active permissions.",
            status: "success",
            duration: 3000,
          });
          return;
        }
      },
    );
  };

  return (
    <VStack spacing={2} align="stretch">
      {!standalone && (
        <Box
          as="button"
          type="button"
          onClick={() => setIsExpanded((value) => !value)}
          textAlign="left"
          w="full"
          cursor="pointer"
          _hover={{ "& > .chevron": { color: "text.primary" } }}
        >
          <HStack spacing={1} align="center">
            {isExpanded ? (
              <ChevronDownIcon
                className="chevron"
                boxSize="14px"
                color="text.tertiary"
              />
            ) : (
              <ChevronRightIcon
                className="chevron"
                boxSize="14px"
                color="text.tertiary"
              />
            )}
            <Text fontSize="2xs" fontWeight="600" color="text.tertiary">
              Delegated permissions
            </Text>
          </HStack>
        </Box>
      )}

      <Collapse in={isExpanded} animateOpacity unmountOnExit>
        <VStack spacing={4} align="stretch">
          <HStack justify="space-between" align="center">
            <Text fontSize="sm" color="text.secondary" lineHeight="short">
              {grants.length > 0 ? activeSummary : "Onchain app access"}
            </Text>
            <IconButton
              aria-label="Refresh delegated permissions"
              icon={<RepeatIcon />}
              size="xs"
              variant="ghost"
              color="text.secondary"
              ml="auto"
              isLoading={isLoading}
              onClick={loadGrants}
              _hover={{ color: "accent.highlight", bg: "surface.raisedHover" }}
            />
          </HStack>

          {isLoading && grants.length === 0 ? (
            <HStack minH="140px" justify="center" color="text.secondary">
              <Spinner size="sm" />
              <Text fontSize="sm" fontWeight="600">
                Loading permissions…
              </Text>
            </HStack>
          ) : error ? (
            <VStack
              p={4}
              align="stretch"
              spacing={3}
              bg="status.error.bg"
              border={tokens.borders.thin}
              borderColor="status.error.border"
              borderRadius={tokens.radii.card}
            >
              <Text fontSize="sm" fontWeight="600" color="status.error.fg">
                Permissions could not be loaded
              </Text>
              <Text fontSize="xs" color="text.secondary">
                {error}
              </Text>
              <Button size="sm" variant="secondary" alignSelf="flex-start" onClick={loadGrants}>
                Try again
              </Button>
            </VStack>
          ) : grants.length === 0 ? (
            <EmptyState minH="190px">
              <EmptyStateMedia>
                <ShieldIcon boxSize="28px" color="accent.highlight" />
              </EmptyStateMedia>
              <EmptyStateHeader>
                <EmptyStateTitle>No active permissions</EmptyStateTitle>
                <EmptyStateDescription>
                  Apps have no delegated access to this account.
                </EmptyStateDescription>
              </EmptyStateHeader>
            </EmptyState>
          ) : (
            <VStack spacing={4} align="stretch">
              {groupedGrants.map(([origin, originGrants]) => (
                <ListSurface key={origin} as="section">
                  <HStack px={4} py={3} spacing={3} bg="surface.sunken">
                    <DappSiteIcon
                      src={originGrants[0]?.favicon}
                      label={originLabel(origin)}
                      size="36px"
                      imageSize="24px"
                    />
                    <VStack spacing={0} align="start" minW={0}>
                      <Text
                        fontSize="sm"
                        color="text.primary"
                        fontWeight="700"
                        noOfLines={1}
                      >
                        {originLabel(origin)}
                      </Text>
                      <Text fontSize="xs" color="text.tertiary">
                        {originGrants.length} active permission{originGrants.length === 1 ? "" : "s"}
                      </Text>
                    </VStack>
                  </HStack>

                  {originGrants.map((grant) => {
                    const chain = getResolvedChainById(
                      grant.chainId,
                      networksInfo,
                    );
                    const tokenAddress = tokenAddressFromGrant(grant);
                    const tokenMetadata = tokenAddress
                      ? metadata[metadataKey(grant.chainId, tokenAddress)]
                      : null;
                    const delegateAddress = grant.request.to.toLowerCase();
                    const delegateAccount = accountsByAddress.get(delegateAddress);
                    const delegateIdentity = delegateIdentities.get(delegateAddress);

                    return (
                      <DelegatedPermissionGrantCard
                        key={grant.id}
                        grant={grant}
                        chainName={chain?.name || grant.chainName}
                        explorer={chain?.explorer}
                        nativeSymbol={chain?.nativeCurrency?.symbol || "ETH"}
                        tokenMetadata={tokenMetadata}
                        delegateAccount={delegateAccount}
                        delegateName={delegateIdentity?.name || null}
                        delegateAvatar={delegateIdentity?.avatar || null}
                        onRevoke={() => setSelectedGrant(grant)}
                        hasDivider
                      />
                    );
                  })}
                </ListSurface>
              ))}
            </VStack>
          )}
        </VStack>
      </Collapse>

      <Modal
        isOpen={!!selectedGrant}
        onClose={() =>
          queueingRevokeId ? undefined : setSelectedGrant(null)
        }
        isCentered
      >
        <ModalOverlay bg="surface.overlay" />
        <ModalContent mx={4}>
          <ModalHeader color="text.primary" fontSize="md">
            <HStack>
              <WarningTwoIcon color="status.warning.fg" />
              <Text>Revoke permission?</Text>
            </HStack>
          </ModalHeader>
          <ModalBody>
            <VStack spacing={3} align="stretch">
              <Text fontSize="sm" color="text.secondary">
                This queues an onchain transaction. Once confirmed, the app can
                no longer use this permission.
              </Text>
            </VStack>
          </ModalBody>
          <ModalFooter gap={2}>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setSelectedGrant(null)}
              isDisabled={!!queueingRevokeId}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={handleOnchainRevoke}
              isLoading={!!queueingRevokeId}
              loadingText="Queueing…"
            >
              Revoke
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </VStack>
  );
}
