import { useState, useEffect, useMemo } from "react";
import { HStack, VStack, Text, Box, Image } from "@chakra-ui/react";
import { blo } from "blo";
import type { Account } from "@/chrome/types";
import { useEnsIdentities } from "@/hooks/useEnsIdentities";
import { useCachedAvatarSrc } from "@/hooks/useCachedAvatarSrc";

function truncateAddress(address: string): string {
  if (!address) return "";
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

interface FromAccountDisplayProps {
  address: string;
}

export function FromAccountDisplay({ address }: FromAccountDisplayProps) {
  const [fromAccount, setFromAccount] = useState<Account | null>(null);
  const addresses = useMemo(() => [address], [address]);
  const { identities } = useEnsIdentities(addresses);

  useEffect(() => {
    chrome.runtime.sendMessage(
      { type: "getAccounts" },
      (accounts: Account[] | null) => {
        if (!accounts) return;
        const match = accounts.find(
          (a) => a.address.toLowerCase() === address.toLowerCase(),
        );
        setFromAccount(match || null);
      },
    );
  }, [address]);

  const ens = identities.get(address.toLowerCase());
  const cachedAvatar = useCachedAvatarSrc(ens?.avatar);
  const displayName =
    fromAccount?.displayName || ens?.name || truncateAddress(address);
  const hasResolvedName = !!(fromAccount?.displayName || ens?.name);

  return (
    <HStack spacing={1.5}>
      {/* Avatar */}
      {ens?.avatar ? (
        <Image
          src={cachedAvatar || ens.avatar}
          alt="ENS avatar"
          w="22px"
          h="22px"
          minW="22px"
          borderRadius="full"
          border="2px solid"
          borderColor="border.default"
          objectFit="cover"
        />
      ) : fromAccount?.type === "bankr" ? (
        <Image
          src="/bankr-icon.png"
          alt="Bankr account"
          w="20px"
          h="20px"
          minW="20px"
          borderRadius="sm"
          border="2px solid"
          borderColor="border.default"
        />
      ) : (
        <Image
          src={blo(address as `0x${string}`)}
          alt="Account avatar"
          w="20px"
          h="20px"
          minW="20px"
          borderRadius="sm"
          border="2px solid"
          borderColor="border.default"
        />
      )}
      <VStack align="start" spacing={0} minW={0}>
        <Text fontSize="xs" color="text.primary" fontWeight="700" noOfLines={1}>
          {displayName}
        </Text>
        {hasResolvedName && (
          <Text
            fontSize="2xs"
            color="text.tertiary"
            fontFamily="mono"
            noOfLines={1}
          >
            {truncateAddress(address)}
          </Text>
        )}
        {fromAccount?.displayName && ens?.name && (
          <Box
            bg="gray.600"
            px={1}
            py={0}
            borderRadius="sm"
            border="1px solid"
            borderColor="border.default"
            mt={0.5}
          >
            <Text
              fontSize="7px"
              color="white"
              fontWeight="800"
              letterSpacing="wide"
              noOfLines={1}
            >
              {ens.name}
            </Text>
          </Box>
        )}
      </VStack>
    </HStack>
  );
}
