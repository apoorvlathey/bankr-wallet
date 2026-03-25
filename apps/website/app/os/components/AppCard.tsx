"use client";

import {
  Box,
  HStack,
  VStack,
  Text,
  Tooltip,
} from "@chakra-ui/react";
import type { DappEntry } from "../data/dapps";
import { CHAIN_NAMES, CATEGORY_LABELS, CATEGORY_COLORS } from "../data/dapps";
import { ChainIcon } from "./ChainIcon";

const MAX_VISIBLE_CHAINS = 4;

interface AppCardProps {
  dapp: DappEntry;
  selectedChain?: number | null;
  onClick: () => void;
  /** App Store mode: show install/uninstall button */
  isInstalled?: boolean;
  onInstall?: () => void;
  onUninstall?: () => void;
}

function getDappDomain(url: string): string {
  try {
    const { hostname } = new URL(url);
    return hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function AppCard({ dapp, onClick, isInstalled, onInstall, onUninstall }: AppCardProps) {
  const visibleChains = dapp.chains.slice(0, MAX_VISIBLE_CHAINS);
  const overflowCount = dapp.chains.length - MAX_VISIBLE_CHAINS;
  const domain = getDappDomain(dapp.url);

  return (
    <Box
      as="button"
      w="full"
      bg="white"
      border="2px solid"
      borderColor="bauhaus.black"
      borderRadius="16px"
      boxShadow="3px 3px 0px 0px var(--chakra-colors-bauhaus-black)"
      p={5}
      textAlign="left"
      cursor="pointer"
      transition="all 0.15s ease-out"
      _hover={{
        transform: "translate(-2px, -2px)",
        boxShadow: "5px 5px 0px 0px var(--chakra-colors-bauhaus-black)",
      }}
      _active={{
        transform: "translate(3px, 3px)",
        boxShadow: "none",
      }}
      onClick={onClick}
      position="relative"
    >
      {/* Category badges + auto-connect zap — top right */}
      {(dapp.categories?.length || dapp.autoConnect === true) && (
        <HStack position="absolute" top={2} right={2} spacing={1}>
          {dapp.categories?.map((cat) => (
            <Text
              key={cat}
              fontSize="8px"
              fontWeight="800"
              textTransform="uppercase"
              letterSpacing="wide"
              color={CATEGORY_COLORS[cat]?.[0] || "bauhaus.blue"}
              bg={`${CATEGORY_COLORS[cat]?.[0] || "#1040C0"}15`}
              px={1.5}
              py={0.5}
              border="1px solid"
              borderColor={`${CATEGORY_COLORS[cat]?.[0] || "#1040C0"}35`}
              borderRadius="full"
              lineHeight="1"
            >
              {CATEGORY_LABELS[cat] || cat}
            </Text>
          ))}
          {dapp.autoConnect === true && (
            <Tooltip
              label="Auto-connects wallet"
              fontSize="xs"
              bg="bauhaus.black"
              color="white"
              borderRadius="0"
              fontWeight="700"
              px={2}
              py={1}
            >
              <Text fontSize="sm" lineHeight="1">⚡</Text>
            </Tooltip>
          )}
        </HStack>
      )}
      <HStack spacing={3} align="start" mt={dapp.categories?.length || dapp.autoConnect === true ? 1 : 0}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={dapp.iconUrl}
          alt={dapp.name}
          width={48}
          height={48}
          style={{ borderRadius: "50%", flexShrink: 0, width: 48, height: 48 }}
        />
        <VStack align="start" spacing={1} flex={1} minW={0}>
          <Text
            fontWeight="900"
            fontSize="sm"
            textTransform="uppercase"
            letterSpacing="wide"
            noOfLines={1}
            pr={dapp.categories?.length || dapp.autoConnect === true ? 10 : 0}
          >
            {dapp.name}
          </Text>
          <Text
            fontSize="11px"
            color="gray.500"
            noOfLines={1}
            lineHeight="1"
            mt={-0.5}
          >
            {domain}
          </Text>
          <Text
            fontSize="xs"
            color="gray.600"
            noOfLines={2}
            mt={0.5}
            lineHeight="short"
          >
            {dapp.description}
          </Text>
          {/* Chain indicators + Install button */}
          <HStack spacing={1.5} mt={1} justify="space-between" w="full">
            <HStack spacing={1.5}>
              {visibleChains.map((chainId) => (
                <Tooltip
                  key={chainId}
                  label={CHAIN_NAMES[chainId] || `Chain ${chainId}`}
                  fontSize="xs"
                  bg="bauhaus.black"
                  color="white"
                  borderRadius="0"
                  fontWeight="700"
                  textTransform="uppercase"
                  px={2}
                  py={1}
                >
                  <Box>
                    <ChainIcon chainId={chainId} />
                  </Box>
                </Tooltip>
              ))}
              {overflowCount > 0 && (
                <Tooltip
                  label={dapp.chains
                    .slice(MAX_VISIBLE_CHAINS)
                    .map((id) => CHAIN_NAMES[id] || id)
                    .join(", ")}
                  fontSize="xs"
                  bg="bauhaus.black"
                  color="white"
                  borderRadius="0"
                  fontWeight="700"
                  textTransform="uppercase"
                  px={2}
                  py={1}
                >
                  <Text
                    fontSize="9px"
                    fontWeight="800"
                    color="gray.500"
                    lineHeight="10px"
                    flexShrink={0}
                  >
                    +{overflowCount}
                  </Text>
                </Tooltip>
              )}
            </HStack>
            {isInstalled !== undefined && (
              <Text
                as="span"
                fontSize="9px"
                fontWeight="800"
                color={isInstalled ? "green.500" : "bauhaus.blue"}
                textTransform="uppercase"
                cursor="pointer"
                _hover={{ textDecoration: "underline" }}
                onClick={(e) => {
                  e.stopPropagation();
                  if (isInstalled) {
                    onUninstall?.();
                  } else {
                    onInstall?.();
                  }
                }}
              >
                {isInstalled ? "✓ Installed" : "+ Install"}
              </Text>
            )}
          </HStack>
        </VStack>
      </HStack>
    </Box>
  );
}
