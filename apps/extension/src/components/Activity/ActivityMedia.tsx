import { Box, Image, Text } from "@chakra-ui/react";
import type { CompletedTransaction } from "@/chrome/txHistoryStorage";
import ChainIcon from "@/components/ChainIcon";
import SafeImage from "@/components/SafeImage";
import { googleFaviconUrl } from "@/constants/externalUrls";
import { getInternalSendSymbol } from "./activityModel";

interface ActivityMediaProps {
  tx: CompletedTransaction;
  originHostname: string | null;
  iconChipBg: string;
  isDarkTheme: boolean;
  resolveLogo: (url: string | undefined) => string | undefined;
}

function ActivityIcon({
  tx,
  originHostname,
}: Pick<ActivityMediaProps, "tx" | "originHostname">) {
  const internalSendSymbol = getInternalSendSymbol(tx);
  const fallbackLabel = (internalSendSymbol || tx.origin || "?")
    .slice(0, 3)
    .toUpperCase();
  const imageSrc =
    tx.origin === "WalletChan" ||
    tx.origin === "BankrWallet" ||
    tx.origin === "Cross-Dapp Batch"
      ? "/walletchan-icon.png"
      : tx.favicon ||
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
        originHostname && !tx.origin.startsWith("Send ")
          ? googleFaviconUrl(originHostname)
          : undefined
      }
      alt={internalSendSymbol || "favicon"}
      boxSize="22px"
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
  iconChipBg,
  zIndex,
}: Pick<ActivityMediaProps, "tx" | "iconChipBg"> & { zIndex?: number }) {
  return (
    <Box
      position="absolute"
      bottom="-2px"
      right="-2px"
      w="16px"
      h="16px"
      borderRadius="full"
      bg={iconChipBg}
      border="1.5px solid"
      borderColor="border.subtle"
      display="flex"
      alignItems="center"
      justifyContent="center"
      zIndex={zIndex}
    >
      <ChainIcon chainId={tx.chainId} chainName={tx.chainName} size="11px" />
    </Box>
  );
}

export default function ActivityMedia({
  tx,
  originHostname,
  iconChipBg,
  isDarkTheme,
  resolveLogo,
}: ActivityMediaProps) {
  if (tx.swapMeta) {
    return (
      <Box position="relative" flexShrink={0} w="42px" h="36px">
        <Box
          position="absolute"
          left={0}
          top={0}
          bg="bg.muted"
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
          {tx.swapMeta.sellTokenLogo ? (
            <Image
              src={resolveLogo(tx.swapMeta.sellTokenLogo)}
              alt={tx.swapMeta.sellTokenSymbol}
              boxSize="20px"
            />
          ) : (
            <Text fontSize="2xs" fontWeight="700">
              {tx.swapMeta.sellTokenSymbol.slice(0, 2)}
            </Text>
          )}
        </Box>
        <Box
          position="absolute"
          left="14px"
          top={0}
          bg="bg.muted"
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
          {tx.swapMeta.buyTokenLogo ? (
            <Image
              src={resolveLogo(tx.swapMeta.buyTokenLogo)}
              alt={tx.swapMeta.buyTokenSymbol}
              boxSize="20px"
            />
          ) : (
            <Text fontSize="2xs" fontWeight="700">
              {tx.swapMeta.buyTokenSymbol.slice(0, 2)}
            </Text>
          )}
        </Box>
        <ChainBadge tx={tx} iconChipBg={iconChipBg} zIndex={3} />
      </Box>
    );
  }

  return (
    <Box position="relative" flexShrink={0} w="36px" h="36px">
      <Box
        bg={isDarkTheme ? "whiteAlpha.800" : iconChipBg}
        borderRadius="full"
        w="36px"
        h="36px"
        display="flex"
        alignItems="center"
        justifyContent="center"
        overflow="hidden"
        border={isDarkTheme ? "1px solid" : undefined}
        borderColor={isDarkTheme ? "border.default" : undefined}
      >
        <ActivityIcon tx={tx} originHostname={originHostname} />
      </Box>
      <ChainBadge tx={tx} iconChipBg={iconChipBg} />
    </Box>
  );
}
