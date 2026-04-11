import { useState, useEffect } from "react";
import { HStack, Text, Box, Image, Link, IconButton, Tooltip, Button } from "@chakra-ui/react";
import { ExternalLinkIcon } from "@chakra-ui/icons";
import { CopyButton } from "@/components/CopyButton";
import { resolveAddressToName, getNameAvatar } from "@/lib/ensUtils";
import { getChainConfig } from "@/constants/chainConfig";
import { ethShLabelsUrl } from "@/constants/externalUrls";

interface AddressParamProps {
  value: string;
  chainId: number;
}

export function AddressParam({ value, chainId }: AddressParamProps) {
  const [ensName, setEnsName] = useState<string | null>(null);
  const [avatar, setAvatar] = useState<string | null>(null);
  const [labels, setLabels] = useState<string[]>([]);
  const [showAddress, setShowAddress] = useState(false);

  const address = value?.toLowerCase().startsWith("0x") ? value : `0x${value}`;
  const explorer = getChainConfig(chainId).explorer;

  useEffect(() => {
    if (!address || address === "0x") return;

    // ENS/Basename reverse resolution
    resolveAddressToName(address).then((name) => {
      if (name) {
        setEnsName(name);
        getNameAvatar(name).then((a) => {
          if (a) setAvatar(a);
        });
      }
    });

    // eth.sh labels
    fetch(ethShLabelsUrl(address, chainId))
      .then((r) => (r.ok ? r.json() : []))
      .then((l) => {
        if (Array.isArray(l) && l.length > 0) setLabels(l);
      })
      .catch(() => {});
  }, [address, chainId]);

  const truncatedAddr = `${address.slice(0, 8)}...${address.slice(-6)}`;
  const displayText = !showAddress && ensName ? ensName : truncatedAddr;

  return (
    <HStack spacing={1} flexWrap="wrap" align="center">
      {/* Name/Address toggle button */}
      {ensName && (
        <Button
          size="xs"
          h="18px"
          px={1}
          fontSize="9px"
          fontWeight="700"
          bg={showAddress ? "transparent" : "bg.muted"}
          color="text.tertiary"
          border="1px solid"
          borderColor="border.subtle"
          borderRadius={0}
          boxShadow="none"
          onClick={() => setShowAddress(!showAddress)}
          _hover={{ borderColor: "border.default", boxShadow: "none" }}
          _active={{ transform: "translate(1px, 1px)", boxShadow: "none" }}
          title={showAddress ? "Show name" : "Show address"}
        >
          {showAddress ? "name" : "address"}
        </Button>
      )}

      {/* Avatar */}
      {avatar && (
        <Image
          src={avatar}
          boxSize="16px"
          border="1px solid"
          borderColor="border.default"
          objectFit="cover"
        />
      )}

      {/* Address / ENS display */}
      <Tooltip label={address} fontSize="xs" openDelay={400}>
        <Text
          fontSize="xs"
          fontFamily="mono"
          color="accent.secondary"
          fontWeight="700"
        >
          {displayText}
        </Text>
      </Tooltip>

      {/* Labels */}
      {labels.length > 0 && (
        <Box
          px={1.5}
          py={0.5}
          bg="accent.secondary"
          border="1.5px solid"
          borderColor="border.default"
        >
          <Text
            fontSize="9px"
            fontWeight="800"
            textTransform="uppercase"
            color="accentFg.secondary"
            letterSpacing="wide"
          >
            {labels[0]}
          </Text>
        </Box>
      )}

      {/* Actions - tight spacing */}
      <HStack spacing={0} align="center">
        <CopyButton value={address} />
        {explorer && (
          <Link href={`${explorer}/address/${address}`} isExternal>
            <IconButton
              aria-label="View on explorer"
              icon={<ExternalLinkIcon />}
              size="xs"
              variant="ghost"
              color="text.secondary"
              _hover={{ color: "accent.secondary", bg: "bg.muted" }}
            />
          </Link>
        )}
      </HStack>
    </HStack>
  );
}
