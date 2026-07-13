import {
  CheckIcon,
  ChevronRightIcon,
  CopyIcon,
  ExternalLinkIcon,
  WarningTwoIcon,
} from "@chakra-ui/icons";
import {
  Box,
  Button,
  Checkbox,
  HStack,
  IconButton,
  Image,
  Input,
  Spinner,
  Text,
  VStack,
} from "@chakra-ui/react";
import { useState } from "react";
import { isResolvableName } from "@/lib/ensUtils";
import { useTheme } from "@/theme";
import type { TransferRecipient } from "./hooks/useTransferRecipient";

interface RecipientSectionProps {
  recipientState: TransferRecipient;
  explorerUrl: string;
}

export function RecipientSection({
  recipientState,
  explorerUrl,
}: RecipientSectionProps) {
  const { tokens } = useTheme();
  const [copied, setCopied] = useState(false);
  const {
    recipient,
    setRecipient,
    isResolving,
    isLoadingExtras,
    isValid,
    resolvedAddress,
    resolvedName,
    avatar,
    cachedRecipientAvatar,
    error,
    otherAccounts,
    openRecipientPicker,
    isRecipientContract,
    acknowledgeContract,
    setAcknowledgeContract,
  } = recipientState;

  return (
    <Box>
      <HStack justify="space-between" align="center" mb={1}>
        <HStack spacing={1}>
          <Text fontSize="sm" fontWeight="600" color="fg.secondary">
            Recipient
          </Text>
          {otherAccounts.length > 0 && (
            <Button
              size="sm"
              variant="ghost"
              color="accent.secondary"
              minH="32px"
              h="32px"
              px={2}
              rightIcon={<ChevronRightIcon />}
              onClick={openRecipientPicker}
            >
              Choose my wallet
            </Button>
          )}
        </HStack>
        {recipient && (isResolving || isLoadingExtras) && (
          <HStack spacing={1}>
            <Spinner size="xs" color="accent.secondary" />
            <Text fontSize="xs" color="text.tertiary" fontWeight="700">
              Resolving...
            </Text>
          </HStack>
        )}
        {recipient && !isResolving && isValid && resolvedAddress && (
          <HStack spacing={0.5}>
            {avatar && (
              <Image
                src={cachedRecipientAvatar || avatar}
                alt="avatar"
                boxSize="14px"
                borderRadius="full"
                border="1px solid"
                borderColor="border.default"
              />
            )}
            {isResolvableName(recipient) ? (
              <Text
                fontSize="xs"
                color="text.tertiary"
                fontFamily="mono"
                fontWeight="700"
              >
                {resolvedAddress.slice(0, 6)}...{resolvedAddress.slice(-4)}
              </Text>
            ) : resolvedName ? (
              <Text fontSize="xs" color="text.tertiary" fontWeight="700">
                {resolvedName}
              </Text>
            ) : null}
            <IconButton
              aria-label="Copy address"
              icon={
                copied ? (
                  <CheckIcon boxSize="10px" />
                ) : (
                  <CopyIcon boxSize="10px" />
                )
              }
              size="xs"
              variant="ghost"
              minW="18px"
              h="18px"
              color={copied ? "accent.highlight" : "text.tertiary"}
              onClick={async () => {
                await navigator.clipboard.writeText(resolvedAddress);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
              _hover={{ color: "accent.secondary", bg: "bg.muted" }}
            />
            {explorerUrl && (
              <IconButton
                aria-label="View on explorer"
                icon={<ExternalLinkIcon boxSize="10px" />}
                size="xs"
                variant="ghost"
                minW="18px"
                h="18px"
                color="text.tertiary"
                onClick={() =>
                  window.open(
                    `${explorerUrl}/address/${resolvedAddress}`,
                    "_blank",
                    "noopener,noreferrer",
                  )
                }
                _hover={{ color: "accent.secondary", bg: "bg.muted" }}
              />
            )}
          </HStack>
        )}
      </HStack>
      <Input
        placeholder="0x..., ENS, Basename, .wei, .gwei, or .mega"
        value={recipient}
        onChange={(event) => setRecipient(event.target.value)}
        fontFamily="mono"
        fontSize="sm"
        isInvalid={Boolean(recipient) && !isResolving && !isValid}
      />
      {recipient && !isResolving && !isValid && (
        <Text fontSize="xs" color="chart.negative" fontWeight="700" mt={1}>
          {error || "Invalid address or name"}
        </Text>
      )}
      {isRecipientContract && (
        <Box
          mt={2}
          border={tokens.borders.thin}
          borderColor="status.warning.border"
          borderRadius="lg"
          bg="status.warning.bg"
          px={3}
          py={2.5}
        >
          <HStack spacing={2} align="flex-start">
            <WarningTwoIcon
              boxSize="14px"
              color="status.warning.fg"
              mt="2px"
              flexShrink={0}
            />
            <VStack align="stretch" spacing={2} flex={1}>
              <Text
                fontSize="xs"
                fontWeight="800"
                color="status.warning.fg"
                lineHeight="short"
              >
                Recipient is a smart contract.
              </Text>
              <Text
                fontSize="xs"
                fontWeight="600"
                color="status.warning.fg"
                lineHeight="short"
              >
                Tokens sent directly to a contract may be permanently stuck.
              </Text>
              <Box
                bg="surface.raised"
                border={tokens.borders.thin}
                borderColor="border.default"
                borderRadius="md"
                px={2}
                py={1.5}
              >
                <Checkbox
                  isChecked={acknowledgeContract}
                  onChange={(event) =>
                    setAcknowledgeContract(event.target.checked)
                  }
                  size="sm"
                  colorScheme="orange"
                  sx={{
                    "& .chakra-checkbox__control": {
                      borderWidth: "2px",
                      borderColor: "border.default",
                      bg: "surface.base",
                    },
                    "& .chakra-checkbox__label": {
                      fontSize: "xs",
                      fontWeight: 800,
                      color: "text.primary",
                    },
                  }}
                >
                  I understand and want to continue
                </Checkbox>
              </Box>
            </VStack>
          </HStack>
        </Box>
      )}
    </Box>
  );
}
