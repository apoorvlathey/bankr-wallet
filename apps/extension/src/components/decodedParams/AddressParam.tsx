import { useState, useEffect } from "react";
import { HStack, Text, Box, Image, Link, IconButton, Tooltip, Button } from "@chakra-ui/react";
import { ExternalLinkIcon } from "@chakra-ui/icons";
import { CopyButton } from "@/components/CopyButton";
import { resolveAddressToName, getNameAvatar } from "@/lib/ensUtils";
import { getChainConfig } from "@/constants/chainConfig";
import { getEthShLabels } from "@/lib/ethShLabelsCache";
import { useCachedAvatarSrc } from "@/hooks/useCachedAvatarSrc";

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
  const cachedAvatar = useCachedAvatarSrc(avatar);

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

    // eth.sh labels (shared cache + in-flight dedup across all surfaces)
    getEthShLabels(address, chainId).then((l) => {
      if (l.length > 0) setLabels(l);
    });
  }, [address, chainId]);

  const truncatedAddr = `${address.slice(0, 8)}...${address.slice(-6)}`;
  const displayText = !showAddress && ensName ? ensName : truncatedAddr;

  return (
    // Avatar + name lead so the visual identity reads first; actions cluster
    // tightly to the right and the name/address toggle sits as a subtle
    // suffix. Outer wrap is still allowed for very narrow widths, but each
    // semantic group (identity / actions) is now non-wrapping so they don't
    // split mid-cluster the way the previous layout did when the column
    // was too narrow for everything to fit on one row.
    <HStack
      spacing={1}
      flexWrap="wrap"
      align="center"
      maxW="100%"
      minW={0}
      rowGap={1}
    >
      <HStack spacing={1} align="center" minW={0} flexShrink={1}>
        {avatar && (
          <Image
            src={cachedAvatar || avatar}
            boxSize="16px"
            border="1px solid"
            borderColor="border.default"
            objectFit="cover"
            flexShrink={0}
          />
        )}
        <Tooltip label={address} fontSize="xs" openDelay={400}>
          <Text
            fontSize="xs"
            fontFamily="mono"
            color="accent.secondary"
            fontWeight="700"
            isTruncated
            maxW="100%"
          >
            {displayText}
          </Text>
        </Tooltip>
      </HStack>

      {/* Labels */}
      {labels.length > 0 && (
        <Box
          px={1.5}
          py={0.5}
          bg="accent.secondary"
          border="1.5px solid"
          borderColor="border.default"
          borderRadius="md"
          flexShrink={0}
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

      {/* Actions — copy + explorer + (if ENS resolved) name/address toggle.
          Kept in one inner HStack so they never split across rows. */}
      <HStack spacing={0} align="center" flexShrink={0}>
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
        {ensName && (
          <Button
            size="xs"
            h="18px"
            px={1}
            ml={0.5}
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
      </HStack>
    </HStack>
  );
}
