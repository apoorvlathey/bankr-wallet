import { InfoOutlineIcon } from "@chakra-ui/icons";
import {
  Box,
  Button,
  HStack,
  Popover,
  PopoverBody,
  PopoverContent,
  PopoverTrigger,
  Portal,
  SimpleGrid,
  Text,
  VStack,
} from "@chakra-ui/react";
import { LabeledAddressPopover } from "@/components/shared/LabeledAddressPopover";
import { RecipientSection } from "@/components/Transfer/RecipientSection";
import type { TransferRecipient } from "@/components/Transfer/hooks/useTransferRecipient";
import { truncateAddress } from "@/lib/addressUtils";
import type { ReturnTypeUseUnshield } from "./hooks/useUnshield.types";
import {
  ShieldDirectionMarker,
  ShieldSourceCard,
} from "./ShieldAssetCards";
import { PrivacyPoolsLogo } from "./ShieldComplianceInfoPopover";
import { formatShieldUsdValue, formatShieldWei } from "./model/shieldQuote";
import { SHIELDED_ETH_NETWORK_NAME } from "./model/shieldedAsset";
import { getUnshieldCopy } from "./model/unshield";

interface Props {
  availableWei: bigint;
  totalReadyWei: bigint;
  confirmedWei: bigint;
  pendingWei: bigint;
  controller: ReturnTypeUseUnshield;
  recipientState: TransferRecipient;
  explorerUrl: string;
  nativePriceUsd: number | null;
  publicExit?: {
    amountWei: bigint;
    depositAccountAddress: string;
    waitingForAsp: boolean;
    isPrimaryRoute: boolean;
  };
}

/** Amount and destination only; quote-dependent details belong to review. */
export default function UnshieldAmountPanel({
  availableWei,
  totalReadyWei,
  confirmedWei,
  pendingWei,
  controller,
  recipientState,
  explorerUrl,
  nativePriceUsd,
  publicExit,
}: Props) {
  const copy = getUnshieldCopy();
  const usesPublicExit = Boolean(publicExit?.isPrimaryRoute);
  const publicExitAmount = publicExit ? formatShieldWei(publicExit.amountWei) : null;
  const inputAmountWei = usesPublicExit
    ? publicExit?.amountWei ?? 0n
    : controller.amountValidation.valid
      ? controller.amountValidation.amountWei
      : 0n;
  const inputAmountUsd = controller.amount || usesPublicExit
    ? formatShieldUsdValue(inputAmountWei, nativePriceUsd)
    : null;
  const hasSplitReadyBalance = !usesPublicExit &&
    totalReadyWei > availableWei &&
    availableWei > 0n;
  const error = !usesPublicExit && controller.amount && !controller.amountValidation.valid
    ? "Enter an amount within your available balance."
    : null;
  const balanceLabel = usesPublicExit
    ? publicExit?.waitingForAsp
      ? "Awaiting eligibility"
      : "Public exit available"
    : availableWei > 0n
      ? copy.availableBalanceLabel
      : pendingWei > 0n
        ? `${formatShieldWei(pendingWei)} ETH is still awaiting its check`
        : confirmedWei > 0n
          ? "No private balance is ready yet"
          : "No Shielded ETH yet";

  return (
    <VStack align="stretch" spacing={0}>
      <ShieldSourceCard
        label="From"
        shielded
        amount={usesPublicExit ? publicExitAmount ?? "" : controller.amount}
        amountWei={inputAmountWei}
        conversionLabel={inputAmountUsd}
        balanceWei={usesPublicExit ? publicExit?.amountWei ?? 0n : availableWei}
        maxWei={usesPublicExit ? 0n : availableWei}
        balanceLabel={balanceLabel}
        balanceSummary={hasSplitReadyBalance ? (
          <SimpleGrid columns={2} spacing={3} mt={2}>
            <VStack align="start" spacing={0.5} minW={0}>
              <Text fontSize="2xs" color="fg.muted" lineHeight="short">
                Total ready
              </Text>
              <Text
                fontSize="sm"
                fontWeight="600"
                color="fg.primary"
                lineHeight="short"
                sx={{ fontVariantNumeric: "tabular-nums" }}
              >
                {formatShieldWei(totalReadyWei)} ETH
              </Text>
            </VStack>
            <Popover placement="top-end" isLazy>
              <PopoverTrigger>
                <Button
                  aria-label={`Why this withdrawal is limited to ${formatShieldWei(availableWei)} ETH`}
                  variant="unstyled"
                  h="auto"
                  minW={0}
                  display="flex"
                  justifyContent="flex-start"
                  color="accent.highlight"
                >
                  <VStack align="end" spacing={0.5} minW={0} w="full">
                    <HStack spacing={1}>
                      <Text fontSize="2xs" lineHeight="short">
                        Max per withdrawal
                      </Text>
                      <InfoOutlineIcon boxSize="11px" aria-hidden />
                    </HStack>
                    <Text
                      fontSize="sm"
                      fontWeight="600"
                      lineHeight="short"
                      sx={{ fontVariantNumeric: "tabular-nums" }}
                    >
                      {formatShieldWei(availableWei)} ETH
                    </Text>
                  </VStack>
                </Button>
              </PopoverTrigger>
              <Portal>
                <PopoverContent
                  w="272px"
                  maxW="calc(100vw - 24px)"
                  _focus={{ outline: "none" }}
                >
                  <PopoverBody p={3}>
                    <Text fontSize="xs" fontWeight="700" color="fg.primary">
                      Why is the maximum lower?
                    </Text>
                    <Text mt={1} fontSize="xs" color="fg.secondary" lineHeight="1.45">
                      A Privacy Pools withdrawal uses one private commitment at a time.
                      You can withdraw up to {formatShieldWei(availableWei)} ETH now,
                      then withdraw again for the rest.
                    </Text>
                  </PopoverBody>
                </PopoverContent>
              </Portal>
            </Popover>
          </SimpleGrid>
        ) : undefined}
        balanceLabelColor={usesPublicExit || (availableWei === 0n && pendingWei > 0n)
          ? "accent.highlight"
          : undefined}
        error={error}
        isDisabled={!usesPublicExit && availableWei === 0n}
        isReadOnly={usesPublicExit}
        onAmountChange={controller.setAmount}
      />

      <ShieldDirectionMarker />

      <Box
        bg="surface.raised"
        borderWidth="1px"
        borderColor="border.default"
        borderRadius="lg"
        px={3}
        py={3}
      >
        {usesPublicExit && publicExit ? (
          <Box>
            <Text mb={1.5} fontSize="sm" fontWeight="600" color="fg.secondary">
              {copy.recipientLabel}
            </Text>
            <HStack
              minH="48px"
              px={3}
              justify="space-between"
              bg="surface.sunken"
              borderWidth="1px"
              borderColor="border.default"
              borderRadius="md"
            >
              <Text fontSize="xs" color="fg.muted">Original deposit account</Text>
              <LabeledAddressPopover
                address={publicExit.depositAccountAddress}
                contextLabel="public exit recipient"
                explorer={explorerUrl}
                label={truncateAddress(publicExit.depositAccountAddress)}
                maxW="160px"
              />
            </HStack>
          </Box>
        ) : (
          <RecipientSection
            recipientState={recipientState}
            explorerUrl={explorerUrl}
            label={copy.recipientLabel}
            chooserLabel={copy.recipientChooserLabel}
          />
        )}
      </Box>

      <HStack justify="flex-end" spacing={1.5} px={1} pt={3} w="full">
        <PrivacyPoolsLogo size="18px" />
        <Text fontSize="xs" color="fg.secondary" whiteSpace="nowrap">
          Privacy Pools · {SHIELDED_ETH_NETWORK_NAME}
        </Text>
      </HStack>
    </VStack>
  );
}
