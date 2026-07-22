import { Box, Image, Text } from "@chakra-ui/react";
import type { CompletedTransaction } from "@/chrome/txHistoryStorage";
import ChainIcon from "@/components/ChainIcon";
import SafeImage from "@/components/SafeImage";
import { googleFaviconUrl } from "@/constants/externalUrls";
import { INERT_IMAGE_SRC } from "@/hooks/useCachedAvatarSrc";
import { PrivacyShieldIcon } from "@/components/shared/PrivacyShieldIcon";
import { SafeIcon } from "@/components/shared/AccountTypeIcons";
import {
  getInternalSendSymbol,
  isShieldActivityTransaction,
} from "./activityModel";

interface ActivityMediaProps {
  tx: CompletedTransaction;
  originHostname: string | null;
  originFaviconSrc?: string | null;
  originFaviconFallbackSrc?: string | null;
  iconChipBg: string;
  isDarkTheme: boolean;
  resolveLogo: (url: string | undefined) => string | undefined;
}

function ActivityIcon({
  tx,
  originHostname,
  originFaviconSrc,
  originFaviconFallbackSrc,
}: Pick<
  ActivityMediaProps,
  | "tx"
  | "originHostname"
  | "originFaviconSrc"
  | "originFaviconFallbackSrc"
>) {
  const internalSendSymbol = getInternalSendSymbol(tx);
  const fallbackLabel = (internalSendSymbol || tx.origin || "?")
    .slice(0, 3)
    .toUpperCase();
  const imageSrc =
    tx.origin === "WalletChan" ||
    tx.origin === "BankrWallet" ||
    tx.origin === "Cross-Dapp Batch"
      ? "/walletchan-icon.png"
      : originFaviconSrc ||
        tx.favicon ||
        (originHostname ? googleFaviconUrl(originHostname) : undefined);

  if (!imageSrc) {
    return (
      <Text fontSize="2xs" fontWeight="800" color="text.secondary">
        {fallbackLabel}
      </Text>
    );
  }

  return (
    <SafeImage
      src={imageSrc}
      fallbackSrc={
        originFaviconFallbackSrc ||
        (originHostname && !tx.origin.startsWith("Send ")
          ? googleFaviconUrl(originHostname)
          : undefined)
      }
      alt={internalSendSymbol || "favicon"}
      boxSize={originHostname ? "28px" : "20px"}
      objectFit="cover"
      fallback={
        <Text fontSize="2xs" fontWeight="800" color="text.secondary">
          {fallbackLabel}
        </Text>
      }
    />
  );
}

function ChainBadge({
  tx,
  zIndex,
}: Pick<ActivityMediaProps, "tx"> & { zIndex?: number }) {
  return (
    <Box
      position="absolute"
      bottom="-2px"
      right="-2px"
      w="14px"
      h="14px"
      borderRadius="full"
      bg="surface.raised"
      border="1px solid"
      borderColor="surface.raised"
      overflow="hidden"
      display="flex"
      alignItems="center"
      justifyContent="center"
      zIndex={zIndex}
    >
      <ChainIcon
        chainId={tx.chainId}
        chainName={tx.chainName}
        size="10px"
        withChip
      />
    </Box>
  );
}

export default function ActivityMedia({
  tx,
  originHostname,
  originFaviconSrc,
  originFaviconFallbackSrc,
  iconChipBg,
  isDarkTheme,
  resolveLogo,
}: ActivityMediaProps) {
  const usableLogo = (logo: string | null | undefined) => {
    const resolved = resolveLogo(logo ?? undefined);
    return resolved && resolved !== INERT_IMAGE_SRC ? resolved : undefined;
  };
  const renderTokenLogo = (
    logo: string | undefined,
    symbol: string,
    size: "22px" | "24px",
  ) => {
    const fallback = (
      <Text
        data-testid="activity-token-fallback"
        fontSize={size === "24px" ? "2xs" : "8px"}
        fontWeight="800"
        color="fg.muted"
        lineHeight="1"
      >
        {(symbol || "?").slice(0, 1).toUpperCase()}
      </Text>
    );

    if (!logo) return fallback;

    return (
      <Image
        src={logo}
        alt={symbol}
        boxSize={size}
        objectFit="contain"
        fallback={fallback}
      />
    );
  };

  if (isShieldActivityTransaction(tx)) {
    return (
      <Box position="relative" flexShrink={0} w="32px" h="32px">
        <Box
          bg="surface.sunken"
          color="accent.highlight"
          borderRadius="md"
          w="32px"
          h="32px"
          display="flex"
          alignItems="center"
          justifyContent="center"
          border="1px solid"
          borderColor="border.subtle"
        >
          <PrivacyShieldIcon boxSize="20px" />
        </Box>
        <ChainBadge tx={tx} />
      </Box>
    );
  }

  if (tx.safeExecutionMeta) {
    return (
      <Box position="relative" flexShrink={0} w="32px" h="32px">
        <Box
          bg={isDarkTheme ? "status.success.bg" : iconChipBg}
          color="status.success.emphasis"
          borderRadius="md"
          w="32px"
          h="32px"
          display="flex"
          alignItems="center"
          justifyContent="center"
          border="1px solid"
          borderColor="border.default"
        >
          <SafeIcon boxSize="20px" />
        </Box>
        <ChainBadge tx={tx} />
      </Box>
    );
  }

  if (tx.swapMeta) {
    const sellLogo = usableLogo(tx.swapMeta.sellTokenLogo);
    const buyLogo = usableLogo(tx.swapMeta.buyTokenLogo);
    const sellSymbol = tx.swapMeta.sellTokenSymbol.trim();
    const buySymbol = tx.swapMeta.buyTokenSymbol.trim();
    const isSameAssetBridge =
      !!tx.bridge &&
      !!sellSymbol &&
      sellSymbol.toLowerCase() === buySymbol.toLowerCase();

    if (isSameAssetBridge) {
      return (
        <Box position="relative" flexShrink={0} w="32px" h="32px">
          <Box
            bg="surface.sunken"
            borderRadius="full"
            w="32px"
            h="32px"
            display="flex"
            alignItems="center"
            justifyContent="center"
            overflow="hidden"
            border="1px solid"
            borderColor="surface.raised"
          >
            {renderTokenLogo(sellLogo || buyLogo, sellSymbol, "24px")}
          </Box>
        </Box>
      );
    }

    return (
      <Box position="relative" flexShrink={0} w="50px" h="32px">
        <Box
          position="absolute"
          left={0}
          top="2px"
          bg="surface.sunken"
          borderRadius="full"
          w="28px"
          h="28px"
          display="flex"
          alignItems="center"
          justifyContent="center"
          overflow="hidden"
          border="2px solid"
          borderColor="surface.raised"
          zIndex={1}
        >
          {renderTokenLogo(sellLogo, sellSymbol, "22px")}
        </Box>
        <Box
          position="absolute"
          left="22px"
          top="2px"
          bg="surface.sunken"
          borderRadius="full"
          w="28px"
          h="28px"
          display="flex"
          alignItems="center"
          justifyContent="center"
          overflow="hidden"
          border="2px solid"
          borderColor="surface.raised"
          zIndex={2}
        >
          {renderTokenLogo(buyLogo, buySymbol, "22px")}
        </Box>
        {!tx.bridge && (
          <ChainBadge tx={tx} zIndex={3} />
        )}
      </Box>
    );
  }

  const isWebsite = !!originHostname;

  return (
    <Box position="relative" flexShrink={0} w="32px" h="32px">
      <Box
        bg={isDarkTheme ? "whiteAlpha.800" : iconChipBg}
        borderRadius={isWebsite ? "md" : "full"}
        w={isWebsite ? "28px" : "32px"}
        h={isWebsite ? "28px" : "32px"}
        m={isWebsite ? "2px" : 0}
        display="flex"
        alignItems="center"
        justifyContent="center"
        overflow="hidden"
        border={isWebsite || isDarkTheme ? "1px solid" : undefined}
        borderColor={isWebsite ? "border.subtle" : "border.default"}
      >
        <ActivityIcon
          tx={tx}
          originHostname={originHostname}
          originFaviconSrc={originFaviconSrc}
          originFaviconFallbackSrc={originFaviconFallbackSrc}
        />
      </Box>
      <ChainBadge tx={tx} />
    </Box>
  );
}
