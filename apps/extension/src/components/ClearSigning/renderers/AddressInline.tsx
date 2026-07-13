import { CheckIcon, CopyIcon, ExternalLinkIcon } from "@chakra-ui/icons";
import { HStack, IconButton, Image, Text, VStack } from "@chakra-ui/react";
import { useEffect, useMemo, useState } from "react";
import { blo } from "blo";

import type { Account } from "@/chrome/types";
import { getChainConfig } from "@/constants/chainConfig";
import { useCachedAvatarSrc } from "@/hooks/useCachedAvatarSrc";
import { useEnsIdentities } from "@/hooks/useEnsIdentities";
import { getEthShLabels } from "@/lib/ethShLabelsCache";

export function AddressInline({
  address,
  chainId,
}: {
  address: string;
  chainId: number;
}) {
  const [account, setAccount] = useState<Account | null>(null);
  const [externalLabel, setExternalLabel] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const addresses = useMemo(() => [address], [address]);
  const { identities } = useEnsIdentities(addresses);
  const ens = identities.get(address.toLowerCase());
  const cachedAvatar = useCachedAvatarSrc(ens?.avatar);

  const explorerUrl = useMemo(() => {
    const config = getChainConfig(chainId);
    return config?.explorer
      ? `${config.explorer}/address/${address}`
      : null;
  }, [address, chainId]);

  // User-account lookup — if this address belongs to one of the user's saved
  // wallets we'll show its displayName + the FromAccountDisplay-style avatar
  // instead of the bare 0x form.
  useEffect(() => {
    if (!address?.startsWith("0x")) return;
    let cancelled = false;
    chrome.runtime.sendMessage(
      { type: "getAccounts" },
      (accounts: Account[] | null) => {
        if (cancelled) return;
        if (!accounts) return;
        const match = accounts.find(
          (a) => a.address.toLowerCase() === address.toLowerCase(),
        );
        setAccount(match || null);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [address]);

  // External label (eth.sh) — only meaningful for addresses that are *not* one
  // of the user's accounts (Permit2, routers, etc.). Skip the fetch when the
  // account lookup has matched to keep noise out of the network panel.
  useEffect(() => {
    if (!address?.startsWith("0x")) return;
    if (account) return;
    let cancelled = false;
    getEthShLabels(address, chainId).then((labels) => {
      if (cancelled) return;
      if (labels.length > 0) setExternalLabel(labels[0]);
    });
    return () => {
      cancelled = true;
    };
  }, [address, chainId, account]);

  const short = `${address.slice(0, 6)}...${address.slice(-4)}`;
  const primaryLabel = account?.displayName || ens?.name || null;

  // Avatar selection mirrors FromAccountDisplay's hierarchy so wallet
  // accounts feel identical across surfaces: ENS avatar > Bankr icon for
  // Bankr-typed accounts > blockie. External addresses skip the avatar
  // entirely (we don't want to fabricate identity for strangers).
  const avatar = (() => {
    if (ens?.avatar) {
      return (
        <Image
          src={cachedAvatar || ens.avatar}
          alt="ENS avatar"
          boxSize="22px"
          minW="22px"
          borderRadius="full"
          objectFit="cover"
          border="1px solid"
          borderColor="border.subtle"
        />
      );
    }
    if (account?.type === "bankr") {
      return (
        <Image
          src="/bankr-icon.png"
          alt="Bankr account"
          boxSize="22px"
          minW="22px"
          borderRadius="sm"
          border="1px solid"
          borderColor="border.subtle"
        />
      );
    }
    if (account) {
      return (
        <Image
          src={blo(address as `0x${string}`)}
          alt="Account avatar"
          boxSize="22px"
          minW="22px"
          borderRadius="sm"
          border="1px solid"
          borderColor="border.subtle"
        />
      );
    }
    return null;
  })();

  const copyButton = (
    <IconButton
      aria-label="Copy"
      icon={copied ? <CheckIcon boxSize="10px" /> : <CopyIcon boxSize="10px" />}
      size="xs"
      variant="ghost"
      minW="14px"
      h="14px"
      color={copied ? "accent.highlight" : "fg.muted"}
      onClick={async () => {
        await navigator.clipboard.writeText(address);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
    />
  );

  const explorerButton = explorerUrl ? (
    <IconButton
      aria-label="Open in explorer"
      icon={<ExternalLinkIcon boxSize="10px" />}
      size="xs"
      variant="ghost"
      minW="14px"
      h="14px"
      color="fg.muted"
      onClick={() => window.open(explorerUrl, "_blank", "noopener,noreferrer")}
    />
  ) : null;

  // When we have a primary label, render two stacked rows right-aligned:
  //   row 1: avatar + resolved name + copy/explorer icons (the action row)
  //   row 2: short 0x… form alone (quiet reference)
  // Icons live with the name so the user's eye lands on the recognizable
  // identity + actions together; the raw hex hangs below as supporting info.
  if (primaryLabel) {
    return (
      <VStack align="end" spacing={0.5}>
        <HStack spacing={1.5} align="center">
          {avatar}
          <Text fontSize="xs" color="fg.primary" fontWeight="700" noOfLines={1}>
            {primaryLabel}
          </Text>
          {/* Inner HStack with spacing=0 — keeps copy + explorer visually
              paired without inheriting the parent row's 1.5 gap. */}
          <HStack spacing={0} align="center">
            {copyButton}
            {explorerButton}
          </HStack>
        </HStack>
        <Text fontSize="2xs" color="fg.muted" fontFamily="mono" noOfLines={1}>
          {short}
        </Text>
      </VStack>
    );
  }

  // External address. When there's no eth.sh label, render a single inline
  // row (short 0x… + actions). When a label is present, stack it BELOW the
  // address so long contract names (e.g. "Uniswap V3 SwapRouter02") wrap
  // freely without pushing the action icons off the row.
  if (externalLabel) {
    return (
      <VStack align="end" spacing={0.5}>
        <HStack spacing={1} align="center" justify="flex-end">
          <Text
            fontSize="xs"
            fontFamily="mono"
            color="accent.secondary"
            fontWeight="600"
          >
            {short}
          </Text>
          <HStack spacing={0} align="center">
            {copyButton}
            {explorerButton}
          </HStack>
        </HStack>
        <Text
          fontSize="10px"
          color="fg.secondary"
          fontWeight="700"
          textAlign="right"
          // Hard-wrap on word boundary; long labels span up to two lines and
          // then truncate. Keeps the field row from ballooning vertically.
          noOfLines={2}
          wordBreak="break-word"
        >
          {externalLabel}
        </Text>
      </VStack>
    );
  }

  return (
    <HStack spacing={1} align="center" justify="flex-end">
      <Text
        fontSize="xs"
        fontFamily="mono"
        color="accent.secondary"
        fontWeight="600"
      >
        {short}
      </Text>
      <HStack spacing={0} align="center">
        {copyButton}
        {explorerButton}
      </HStack>
    </HStack>
  );
}
