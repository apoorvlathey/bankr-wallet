import { ChevronRightIcon, WarningTwoIcon } from "@chakra-ui/icons";
import {
  Box,
  Button,
  Checkbox,
  HStack,
  Input,
  Spinner,
  Text,
  VStack,
} from "@chakra-ui/react";
import { useEffect, useId, useState } from "react";
import { useTheme } from "@/theme";
import { AddressContactAvatar } from "@/components/shared/AddressContactAvatar";
import { LabeledAddressPopover } from "@/components/shared/LabeledAddressPopover";
import type { TransferRecipient } from "./hooks/useTransferRecipient";

interface RecipientSectionProps {
  recipientState: TransferRecipient;
  explorerUrl: string;
  label?: string;
  chooserLabel?: string;
}

export function RecipientSection({
  recipientState,
  explorerUrl,
  label = "Recipient",
  chooserLabel = "My contacts",
}: RecipientSectionProps) {
  const { tokens } = useTheme();
  const [activeSuggestion, setActiveSuggestion] = useState(0);
  const [isSuggestionsOpen, setSuggestionsOpen] = useState(false);
  const suggestionListId = useId();
  const {
    recipient,
    setRecipient,
    isResolving,
    isLoadingExtras,
    isValid,
    resolvedAddress,
    resolvedName,
    error,
    otherAccounts,
    recipientContacts,
    openRecipientPicker,
    isRecipientContract,
    acknowledgeContract,
    setAcknowledgeContract,
    suggestions,
    selectRecipientAddress,
  } = recipientState;
  const hasRecipientChoices = otherAccounts.length + recipientContacts.length > 0;
  const showSuggestions = isSuggestionsOpen && suggestions.length > 0;

  useEffect(() => setActiveSuggestion(0), [recipient, suggestions.length]);
  useEffect(() => {
    if (!showSuggestions) return;
    document
      .getElementById(`${suggestionListId}-${activeSuggestion}`)
      ?.scrollIntoView({ block: "nearest" });
  }, [activeSuggestion, showSuggestions, suggestionListId]);

  return (
    <Box>
      <HStack justify="space-between" align="center" mb={1}>
        <HStack spacing={1}>
          <Text
            as="label"
            htmlFor="send-recipient"
            fontSize="sm"
            fontWeight="600"
            color="fg.secondary"
          >
            {label}
          </Text>
          {hasRecipientChoices && (
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
              {chooserLabel}
            </Button>
          )}
        </HStack>
        {recipient && (isResolving || isLoadingExtras) && (
          <HStack spacing={1} minW={0}>
            <Spinner size="xs" color="accent.secondary" />
            <Text fontSize="xs" color="text.tertiary" fontWeight="700">
              Resolving...
            </Text>
          </HStack>
        )}
        {recipient && !isResolving && isValid && resolvedAddress && (
          <LabeledAddressPopover
            address={resolvedAddress}
            contextLabel="recipient address"
            explorer={explorerUrl}
            label={resolvedName || `${resolvedAddress.slice(0, 6)}...${resolvedAddress.slice(-4)}`}
            maxW="180px"
          />
        )}
      </HStack>
      <Box position="relative">
        <Input
          id="send-recipient"
          placeholder="0x, contacts, .eth, .gwei"
          value={recipient}
          onFocus={() => setSuggestionsOpen(true)}
          onClick={() => setSuggestionsOpen(true)}
          onChange={(event) => {
            setSuggestionsOpen(true);
            setRecipient(event.target.value);
          }}
          onKeyDown={(event) => {
            if (!showSuggestions) return;
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setActiveSuggestion((index) => (index + 1) % suggestions.length);
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              setActiveSuggestion((index) => (index - 1 + suggestions.length) % suggestions.length);
            } else if (event.key === "Enter") {
              event.preventDefault();
              const selected = suggestions[activeSuggestion];
              if (selected) {
                selectRecipientAddress(selected.address);
                setSuggestionsOpen(false);
              }
            } else if (event.key === "Escape") {
              event.preventDefault();
              setSuggestionsOpen(false);
            }
          }}
          onBlur={() => window.setTimeout(() => setSuggestionsOpen(false), 100)}
          fontFamily="mono"
          fontSize="md"
          autoComplete="off"
          spellCheck={false}
          isInvalid={Boolean(recipient) && !isResolving && !isValid}
          role="combobox"
          aria-label="Recipient address, name service, wallet, or contact"
          aria-autocomplete="list"
          aria-expanded={showSuggestions}
          aria-controls={showSuggestions ? suggestionListId : undefined}
          aria-activedescendant={showSuggestions ? `${suggestionListId}-${activeSuggestion}` : undefined}
        />
        {showSuggestions && (
          <VStack
            id={suggestionListId}
            role="listbox"
            align="stretch"
            spacing={0}
            position="absolute"
            zIndex={20}
            top="calc(100% + 6px)"
            left={0}
            right={0}
            bg="surface.raised"
            border="1px solid"
            borderColor="border.default"
            borderRadius="lg"
            boxShadow="overlay"
            maxH="min(320px, 45vh)"
            overflowY="auto"
          >
            {suggestions.map((suggestion, index) => (
              <Box
                key={suggestion.key}
                id={`${suggestionListId}-${index}`}
                role="option"
                aria-selected={index === activeSuggestion}
                px={3}
                py={2.5}
                cursor="pointer"
                bg={index === activeSuggestion ? "surface.raisedHover" : "transparent"}
                borderBottom={index < suggestions.length - 1 ? "1px solid" : undefined}
                borderColor="border.subtle"
                onMouseEnter={() => setActiveSuggestion(index)}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  selectRecipientAddress(suggestion.address);
                  setSuggestionsOpen(false);
                }}
              >
                <HStack justify="space-between" spacing={3}>
                  <HStack minW={0} spacing={2.5}>
                    <AddressContactAvatar
                      address={suggestion.address}
                      avatar={suggestion.avatar}
                      fallbackSrc={suggestion.fallbackAvatar}
                      size={28}
                    />
                    <Box minW={0}>
                      <Text fontSize="sm" fontWeight="600" noOfLines={1}>{suggestion.label}</Text>
                      <Text
                        fontSize="xs"
                        color="fg.muted"
                        fontFamily={suggestion.secondaryIsAddress ? "mono" : "inherit"}
                        noOfLines={1}
                      >
                        {suggestion.secondaryText}
                      </Text>
                    </Box>
                  </HStack>
                  <Text flexShrink={0} fontSize="2xs" color="fg.secondary" textTransform="uppercase" letterSpacing="wide">{suggestion.kind}</Text>
                </HStack>
              </Box>
            ))}
          </VStack>
        )}
      </Box>
      {recipient && !isResolving && !isValid && (
        <Text fontSize="xs" color="chart.negative" fontWeight="700" mt={1}>
          {error || "Invalid address or name"}
        </Text>
      )}
      {isRecipientContract && (
        <Box
          mt={2}
          border={tokens.borders.thin}
          borderColor={
            acknowledgeContract ? "status.warning.border" : "border.default"
          }
          borderRadius="lg"
          bg="surface.raised"
          px={3}
          py={3}
          transition={tokens.motion.transitionBase}
        >
          <VStack align="stretch" spacing={3}>
            <HStack spacing={2.5} align="flex-start">
              <Box
                display="flex"
                alignItems="center"
                justifyContent="center"
                boxSize="28px"
                flexShrink={0}
                borderRadius="md"
                bg="status.warning.bg"
                color="status.warning.fg"
              >
                <WarningTwoIcon boxSize="14px" />
              </Box>
              <Box minW={0} pt="1px">
                <Text
                  fontSize="sm"
                  fontWeight="700"
                  color="fg.primary"
                  lineHeight="short"
                >
                  Smart contract recipient
                </Text>
                <Text
                  mt={1}
                  fontSize="xs"
                  fontWeight="500"
                  color="fg.secondary"
                  lineHeight="base"
                >
                  Only continue if this contract accepts direct token transfers.
                  Otherwise, your tokens may be permanently stuck.
                </Text>
              </Box>
            </HStack>
            <Checkbox
              isChecked={acknowledgeContract}
              onChange={(event) =>
                setAcknowledgeContract(event.target.checked)
              }
              size="sm"
              alignItems="center"
              minH="36px"
              w="full"
              px={2.5}
              py={2}
              border={tokens.borders.thin}
              borderColor={
                acknowledgeContract ? "status.warning.border" : "border.subtle"
              }
              borderRadius="md"
              bg={acknowledgeContract ? "status.warning.tint" : "surface.sunken"}
              transition={tokens.motion.transitionBase}
              sx={{
                "& .chakra-checkbox__control": {
                  borderWidth: "1px",
                  borderColor: acknowledgeContract
                    ? "status.warning.fg"
                    : "border.strong",
                  bg: acknowledgeContract
                    ? "status.warning.fg"
                    : "surface.raised",
                  color: acknowledgeContract ? "fg.inverse" : undefined,
                  boxShadow: "none",
                  _hover: {
                    borderColor: "status.warning.fg",
                  },
                  _focusVisible: {
                    borderColor: "border.focus",
                    boxShadow: tokens.shadows.focus,
                  },
                },
                "& .chakra-checkbox__label": {
                  flex: 1,
                  fontSize: "xs",
                  fontWeight: 600,
                  color: "fg.primary",
                  lineHeight: "short",
                },
              }}
            >
              I understand the risk and want to continue
            </Checkbox>
          </VStack>
        </Box>
      )}
    </Box>
  );
}
