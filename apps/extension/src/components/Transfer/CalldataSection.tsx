import {
  ChevronDownIcon,
  ChevronRightIcon,
  Search2Icon,
  SettingsIcon,
} from "@chakra-ui/icons";
import {
  Box,
  Button,
  Collapse,
  HStack,
  IconButton,
  Text,
  Textarea,
  Tooltip,
  useDisclosure,
} from "@chakra-ui/react";
import { NativeCalldataDecodeModal } from "@/components/NativeCalldataDecodeModal";
import { ActionSheet } from "@/components/ui";
import { useTheme } from "@/theme";
import type { TransferPreparation } from "./hooks/useTransferPreparation";

interface CalldataSectionProps {
  preparation: TransferPreparation;
  decodeDisabledReason: string | null;
  fromAddress: string;
  resolvedAddress: string | null;
  chainId: number;
}

export function CalldataSection({
  preparation,
  decodeDisabledReason,
  fromAddress,
  resolvedAddress,
  chainId,
}: CalldataSectionProps) {
  const { tokens } = useTheme();
  const deployToggle = useDisclosure();
  const decodeModal = useDisclosure();
  const {
    hexData,
    setHexData,
    isHexDataExpanded,
    setIsHexDataExpanded,
    trimmedHexData,
    hexDataIsEmpty,
    isHexDataValid,
    hasNativeCalldata,
    isContractDeployment,
    setIsContractDeployment,
    canShowDeployToggle,
  } = preparation;
  const canOpenDecoder =
    !isContractDeployment && decodeDisabledReason === null;

  return (
    <>
      <Box>
        <HStack
          as="button"
          type="button"
          w="full"
          spacing={1}
          align="center"
          onClick={() => setIsHexDataExpanded(!isHexDataExpanded)}
          cursor="pointer"
          _hover={{ opacity: 0.8 }}
          transition="opacity 0.15s"
        >
          {isHexDataExpanded ? (
            <ChevronDownIcon boxSize="14px" color="text.secondary" />
          ) : (
            <ChevronRightIcon boxSize="14px" color="text.secondary" />
          )}
          <Text fontSize="sm" fontWeight="600" color="fg.secondary">
            Advanced transaction data
          </Text>
          <Text fontSize="2xs" fontWeight="500" color="fg.muted">
            Optional
          </Text>
          {!isHexDataExpanded && !hexDataIsEmpty && !isHexDataValid && (
            <Text
              ml="auto"
              fontSize="2xs"
              fontWeight="600"
              color="chart.negative"
            >
              Invalid
            </Text>
          )}
        </HStack>
        <Collapse in={isHexDataExpanded} animateOpacity>
          <Box mt={1.5}>
            {(canShowDeployToggle || !isContractDeployment) && (
              <HStack justify="flex-end" spacing={1.5} mb={1}>
                {canShowDeployToggle ? (
                  <>
                    {isContractDeployment ? (
                      <Button
                        aria-label="Advanced transaction mode"
                        size="sm"
                        variant="ghost"
                        minH="32px"
                        px={2}
                        leftIcon={<SettingsIcon boxSize="14px" />}
                        color="accent.secondary"
                        fontSize="xs"
                        onClick={deployToggle.onOpen}
                      >
                        Contract deployment
                      </Button>
                    ) : (
                      <IconButton
                        aria-label="Advanced transaction mode"
                        icon={<SettingsIcon boxSize="14px" />}
                        size="sm"
                        variant="ghost"
                        minW="32px"
                        h="32px"
                        color="text.tertiary"
                        onClick={deployToggle.onOpen}
                      />
                    )}
                    <ActionSheet
                      isOpen={deployToggle.isOpen}
                      onClose={deployToggle.onClose}
                      title="Transaction mode"
                      description="Choose how WalletChan should use the transaction data below."
                      choices={[
                        {
                          id: "transfer",
                          label: "Standard transfer",
                          description:
                            "Send to the recipient and include the bytes as transaction data.",
                          isSelected: !isContractDeployment,
                        },
                        {
                          id: "deployment",
                          label: "Contract deployment",
                          description: hasNativeCalldata
                            ? "Treat the bytes as deployment bytecode and omit the recipient."
                            : "Add valid transaction data to enable contract deployment.",
                          isSelected: isContractDeployment,
                          isDisabled: !hasNativeCalldata,
                        },
                      ]}
                      onSelect={(mode) =>
                        setIsContractDeployment(mode === "deployment")
                      }
                    />
                  </>
                ) : (
                  <Tooltip
                    label={decodeDisabledReason || "Decode calldata"}
                    fontSize="xs"
                    hasArrow
                    isDisabled={canOpenDecoder}
                  >
                    <Box as="span" display="inline-block">
                      <Button
                        size="xs"
                        variant="ghost"
                        h="22px"
                        px={1.5}
                        leftIcon={<Search2Icon boxSize="12px" />}
                        iconSpacing={1.5}
                        color="accent.secondary"
                        fontSize="2xs"
                        fontWeight="600"
                        isDisabled={!canOpenDecoder}
                        onClick={decodeModal.onOpen}
                        _hover={{ bg: "bg.muted" }}
                      >
                        Decode
                      </Button>
                    </Box>
                  </Tooltip>
                )}
              </HStack>
            )}
            <Textarea
              placeholder="0x..."
              value={hexData}
              onChange={(event) => setHexData(event.target.value)}
              fontFamily="mono"
              fontSize="xs"
              rows={3}
              resize="vertical"
              isInvalid={!isHexDataValid}
              bg="surface.raised"
              color="fg.primary"
              border={tokens.borders.thin}
              borderColor="border.default"
              borderRadius={tokens.radii.input}
              _placeholder={{ color: "fg.muted" }}
              _hover={{ bg: "surface.raised", borderColor: "border.default" }}
              _focus={{
                bg: "surface.raised",
                borderColor: "border.focus",
                boxShadow: "focus",
              }}
              _invalid={{
                borderColor: "chart.negative",
                boxShadow:
                  "3px 3px 0px 0px var(--chakra-colors-chart-negative)",
              }}
            />
            <Text fontSize="2xs" color="text.tertiary" fontWeight="600" mt={1}>
              Bytes appended as tx calldata. Leave blank for a plain transfer.
            </Text>
            {!isHexDataValid && (
              <Text fontSize="xs" color="chart.negative" fontWeight="700" mt={1}>
                Must be a 0x-prefixed hex string with an even number of hex
                chars.
              </Text>
            )}
          </Box>
        </Collapse>
      </Box>
      {canOpenDecoder && resolvedAddress && (
        <NativeCalldataDecodeModal
          isOpen={decodeModal.isOpen}
          onClose={decodeModal.onClose}
          calldata={trimmedHexData}
          from={fromAddress}
          to={resolvedAddress}
          chainId={chainId}
        />
      )}
    </>
  );
}
