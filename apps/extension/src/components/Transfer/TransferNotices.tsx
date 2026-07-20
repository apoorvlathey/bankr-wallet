import { Box, Button, HStack, Skeleton, Text } from "@chakra-ui/react";
import { WALLETCHAN_STAKE_URL } from "@/constants/externalUrls";
import { useTheme } from "@/theme";
import type { SponsoredTransferState } from "./hooks/useSponsoredTransfer";
import type { TransferAccountType } from "./types";

interface TransferNoticesProps {
  accountType: TransferAccountType;
  sponsored: SponsoredTransferState;
  isBusy: boolean;
  onFallbackSend: () => void;
}

export function SponsorshipEligibilityNotice({
  accountType,
  sponsored,
}: Pick<TransferNoticesProps, "accountType" | "sponsored">) {
  const { isUsdcOnBase, premiumLoading, premiumStatus } = sponsored;
  if (
    !isUsdcOnBase ||
    premiumLoading ||
    !premiumStatus ||
    premiumStatus.isPremium ||
    accountType === "impersonator" ||
    accountType === "ledger"
  ) {
    return null;
  }

  return (
    <HStack
      spacing={3}
      px={3}
      py={2.5}
      bg="status.info.bg"
      borderWidth="1px"
      borderColor="status.info.border"
      borderRadius="lg"
      justify="space-between"
    >
      <Box>
        <Text fontSize="sm" color="fg.primary" fontWeight="600">
          Gas-free USDC sends
        </Text>
        <Text fontSize="xs" color="fg.secondary">
          Available to eligible sWCHAN stakers.
        </Text>
      </Box>
      <Button
        size="xs"
        variant="ghost"
        color="accent.secondary"
        onClick={() =>
          window.open(WALLETCHAN_STAKE_URL, "_blank", "noopener,noreferrer")
        }
        flexShrink={0}
      >
        Learn more
      </Button>
    </HStack>
  );
}

export function TransferNotices({
  accountType,
  sponsored,
  isBusy,
  onFallbackSend,
}: TransferNoticesProps) {
  const { tokens } = useTheme();
  const {
    isUsdcOnBase,
    premiumLoading,
    premiumStatus,
    failure,
    checkStatus,
  } = sponsored;

  return (
    <>
      {isUsdcOnBase &&
        !premiumLoading &&
        premiumStatus?.isPremium &&
        accountType !== "impersonator" &&
        accountType !== "ledger" && (
          <Box
            bg="status.success.bg"
            borderWidth="1px"
            borderColor="status.success.border"
            borderRadius="lg"
            p={3}
          >
            <Text fontSize="sm" color="status.success.fg" fontWeight="600">
              Network fee covered
            </Text>
            <Text fontSize="xs" color="fg.secondary" mt={0.5}>
              WalletChan will sponsor this USDC transfer.
            </Text>
          </Box>
        )}
      {isUsdcOnBase && premiumLoading && <Skeleton h="60px" />}

      {failure && (
        <Box
          bg="status.error.bg"
          border={tokens.borders.thin}
          borderColor="status.error.border"
          borderRadius="lg"
          p={3}
        >
          <Text fontSize="xs" color="status.error.fg" fontWeight="600">
            {failure.outcomeUncertain
              ? "Transfer status is still pending."
              : "Gas-free transfer is temporarily unavailable."}
          </Text>
          <Text fontSize="xs" color="fg.secondary" mt={1}>
            {failure.outcomeUncertain
              ? failure.message
              : "You can still send by paying gas yourself."}
          </Text>
          <Button
            mt={2}
            w="full"
            size="sm"
            variant="highlight"
            fontSize="xs"
            isLoading={isBusy}
            onClick={failure.outcomeUncertain ? checkStatus : onFallbackSend}
          >
            {failure.outcomeUncertain ? "Check status" : "Send and pay gas"}
          </Button>
        </Box>
      )}

      {accountType === "impersonator" && (
        <Box
          bg="accent.highlight"
          border={tokens.borders.thin}
          borderColor="border.subtle"
          borderRadius="lg"
          p={3}
        >
          <Text fontSize="sm" color="accentFg.highlight" fontWeight="700">
            View-only account — you can review this transfer. Sending is only
            available when developer mode is enabled for the selected RPC.
          </Text>
        </Box>
      )}
    </>
  );
}
