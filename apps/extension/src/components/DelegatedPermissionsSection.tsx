import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Box,
  Button,
  Collapse,
  HStack,
  IconButton,
  Image,
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
import DelegatedPermissionGrantCard from "@/components/DelegatedPermissionGrantCard";
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
import { useTheme } from "@/theme";

type GrantsResponse =
  | { success: true; grants: Erc7715PermissionGrant[] }
  | { success: false; error?: string }
  | undefined;

export default function DelegatedPermissionsSection({
  accountId,
}: {
  accountId: string;
}) {
  const toast = useThemedToast();
  const { tokens } = useTheme();
  const { networksInfo } = useNetworks();
  const [isExpanded, setIsExpanded] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [grants, setGrants] = useState<Erc7715PermissionGrant[]>([]);
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
          <Text
            fontSize="2xs"
            fontWeight="700"
            color="text.tertiary"
            textTransform="uppercase"
            letterSpacing="wider"
          >
            Delegated Permissions
          </Text>
        </HStack>
      </Box>

      <Collapse in={isExpanded} animateOpacity unmountOnExit>
        <VStack spacing={2} align="stretch">
          <HStack justify="space-between" align="center">
            <Text fontSize="2xs" color="text.secondary" lineHeight="short">
              Active ERC-7715 grants for this account, grouped by requesting
              site.
            </Text>
            <IconButton
              aria-label="Refresh delegated permissions"
              icon={<RepeatIcon />}
              size="xs"
              variant="ghost"
              color="text.secondary"
              isLoading={isLoading}
              onClick={loadGrants}
            />
          </HStack>

          {isLoading && grants.length === 0 ? (
            <HStack p={3} color="text.secondary">
              <Spinner size="sm" />
              <Text fontSize="xs" fontWeight="700">
                Loading permissions...
              </Text>
            </HStack>
          ) : error ? (
            <Box
              p={3}
              bg="status.error.bg"
              border={tokens.borders.thin}
              borderColor="status.error.border"
              borderRadius={tokens.radii.card}
            >
              <Text fontSize="xs" fontWeight="700" color="status.error.fg">
                {error}
              </Text>
            </Box>
          ) : grants.length === 0 ? (
            <Box
              p={3}
              bg="surface.raised"
              border={tokens.borders.thin}
              borderColor="border.subtle"
              borderRadius={tokens.radii.card}
            >
              <Text fontSize="xs" color="text.secondary" fontWeight="700">
                No active delegated permissions.
              </Text>
            </Box>
          ) : (
            <VStack spacing={3} align="stretch">
              {groupedGrants.map(([origin, originGrants]) => (
                <VStack key={origin} spacing={2} align="stretch">
                  <HStack spacing={2} minW={0}>
                    {originGrants[0]?.favicon ? (
                      <Image
                        src={originGrants[0].favicon}
                        alt=""
                        boxSize="18px"
                        borderRadius="sm"
                      />
                    ) : null}
                    <Text
                      fontSize="xs"
                      color="text.primary"
                      fontWeight="900"
                      noOfLines={1}
                    >
                      {origin}
                    </Text>
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

                    return (
                      <DelegatedPermissionGrantCard
                        key={grant.id}
                        grant={grant}
                        chainName={chain?.name || grant.chainName}
                        explorer={chain?.explorer}
                        nativeSymbol={chain?.nativeCurrency?.symbol || "ETH"}
                        tokenMetadata={tokenMetadata}
                        onRevoke={() => setSelectedGrant(grant)}
                      />
                    );
                  })}
                </VStack>
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
          <ModalHeader
            color="text.primary"
            fontSize="md"
            textTransform="uppercase"
          >
            <HStack>
              <WarningTwoIcon color="status.warning.fg" />
              <Text>Revoke Permission?</Text>
            </HStack>
          </ModalHeader>
          <ModalBody>
            <VStack spacing={3} align="stretch">
              <Text fontSize="sm" color="text.secondary" fontWeight="600">
                Queue an onchain revoke for this permission. Once confirmed,
                the delegate can no longer act with it.
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
              loadingText="Queueing..."
            >
              Revoke
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </VStack>
  );
}
