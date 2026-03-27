import { useState, useMemo, memo } from "react";
import {
  Box,
  VStack,
  HStack,
  Text,
  Input,
  Button,
  Image,
  IconButton,
  InputGroup,
  InputLeftElement,
  InputRightElement,
  Slider,
  SliderTrack,
  SliderFilledTrack,
  SliderThumb,
  SliderMark,
  Spinner,
} from "@chakra-ui/react";
import { ArrowBackIcon, CopyIcon, CheckIcon, ExternalLinkIcon } from "@chakra-ui/icons";
import { useBauhausToast } from "@/hooks/useBauhausToast";
import { useAddressResolver } from "@/hooks/useAddressResolver";
import { isResolvableName } from "@/lib/ensUtils";
import { PortfolioToken } from "@/chrome/portfolioApi";
import { buildTransferTx } from "@/chrome/transferUtils";
import { getChainConfig } from "@/constants/chainConfig";

function formatUsd(value: number): string {
  if (value < 0.01 && value > 0) return "<$0.01";
  return `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatTokenAmount(value: number): string {
  if (value === 0) return "0";
  if (value < 0.000001) return "<0.000001";
  return parseFloat(value.toPrecision(6)).toString();
}

interface TokenTransferProps {
  token: PortfolioToken;
  fromAddress: string;
  accountType: "bankr" | "privateKey" | "seedPhrase" | "impersonator";
  onBack: () => void;
  onTransferInitiated: () => void;
}

function TokenTransfer({
  token,
  fromAddress,
  accountType,
  onBack,
  onTransferInitiated,
}: TokenTransferProps) {
  const toast = useBauhausToast();
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [isUsdMode, setIsUsdMode] = useState(false);
  const [sliderValue, setSliderValue] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [copied, setCopied] = useState(false);

  const { resolvedAddress, resolvedName, avatar, isResolving, isLoadingExtras, isValid: isRecipientValid } =
    useAddressResolver(recipient);

  const chainConfig = getChainConfig(token.chainId);
  const hasPrice = token.priceUsd > 0;

  // Compute the token amount that will actually be sent
  const tokenAmount = useMemo(() => {
    if (!amount) return "";
    const num = parseFloat(amount);
    if (isNaN(num) || num <= 0) return "";
    if (isUsdMode && hasPrice) {
      const converted = num / token.priceUsd;
      const balance = parseFloat(token.balance);
      // Cap at actual balance to avoid rounding past it
      if (converted >= balance) return token.balance;
      return converted.toFixed(token.decimals);
    }
    return amount;
  }, [amount, isUsdMode, hasPrice, token.priceUsd, token.decimals, token.balance]);

  const balanceNum = parseFloat(token.balance);

  const setAmountFromSlider = (pct: number) => {
    if (pct === 0) {
      setAmount("");
    } else if (pct === 100) {
      if (isUsdMode && hasPrice) {
        setAmount((balanceNum * token.priceUsd).toFixed(2));
      } else {
        setAmount(token.balance);
      }
    } else {
      const tokenAmt = (balanceNum * pct) / 100;
      if (isUsdMode && hasPrice) {
        setAmount((tokenAmt * token.priceUsd).toFixed(2));
      } else {
        // Use toPrecision directly, avoiding "<0.000001" display string
        const formatted = tokenAmt === 0 ? "0" : parseFloat(tokenAmt.toPrecision(6)).toString();
        setAmount(formatted);
      }
    }
  };

  const syncSliderFromAmount = (val: string) => {
    const num = parseFloat(val);
    if (!val || isNaN(num) || num <= 0 || balanceNum <= 0) {
      setSliderValue(0);
      return;
    }
    let tokenVal = num;
    if (isUsdMode && hasPrice) {
      tokenVal = num / token.priceUsd;
    }
    const pct = Math.min(100, Math.round((tokenVal / balanceNum) * 100));
    setSliderValue(pct);
  };

  const handleMaxAmount = () => {
    setSliderValue(100);
    if (isUsdMode && hasPrice) {
      const usdValue = balanceNum * token.priceUsd;
      setAmount(usdValue.toFixed(2));
    } else {
      setAmount(token.balance);
    }
  };

  const handleToggleMode = () => {
    if (!hasPrice) return;
    const num = parseFloat(amount);
    if (amount && !isNaN(num) && num > 0) {
      if (isUsdMode) {
        // USD -> Token: convert, cap at balance to avoid rounding past it
        const converted = num / token.priceUsd;
        setAmount(converted >= balanceNum ? token.balance : formatTokenAmount(converted));
      } else {
        // Token -> USD: convert current token to USD
        setAmount((num * token.priceUsd).toFixed(2));
      }
    }
    setIsUsdMode(!isUsdMode);
  };

  const isAmountValid = (): boolean => {
    if (!tokenAmount) return false;
    const num = parseFloat(tokenAmount);
    if (isNaN(num) || num <= 0) return false;
    const balance = parseFloat(token.balance);
    return num <= balance;
  };

  const canSubmit = isRecipientValid && !isResolving && isAmountValid() && !isSubmitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    if (accountType === "impersonator") {
      toast({
        title: "View-only account",
        description: "Impersonator accounts cannot send transactions",
        status: "error",
        duration: 3000,
      });
      return;
    }

    setIsSubmitting(true);

    try {
      const txParts = buildTransferTx({
        to: resolvedAddress!,
        amount: tokenAmount,
        contractAddress: token.contractAddress,
        decimals: token.decimals,
        chainId: token.chainId,
      });

      const result = await new Promise<{ success: boolean; txId?: string; error?: string }>(
        (resolve) => {
          chrome.runtime.sendMessage(
            {
              type: "initiateTransfer",
              tx: {
                from: fromAddress,
                to: txParts.to,
                data: txParts.data,
                value: txParts.value,
                chainId: token.chainId,
              },
              chainName: chainConfig.name,
              tokenName: token.symbol.toUpperCase(),
              tokenLogo: token.logoUrl || null,
            },
            resolve
          );
        }
      );

      if (result.success) {
        onTransferInitiated();
      } else {
        toast({
          title: "Transfer failed",
          description: result.error || "Could not initiate transfer",
          status: "error",
          duration: 3000,
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to initiate transfer",
        status: "error",
        duration: 3000,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Box p={4} minH="100%" bg="bg.base">
      <VStack spacing={3} align="stretch">
        {/* Header */}
        <HStack spacing={2}>
          <IconButton
            aria-label="Back"
            icon={<ArrowBackIcon />}
            variant="ghost"
            size="sm"
            onClick={onBack}
          />
          <Text fontWeight="900" fontSize="lg" color="text.primary" textTransform="uppercase" letterSpacing="wider">
            Send {token.symbol}
          </Text>
        </HStack>

        {/* Token info card */}
        <Box
          bg="bauhaus.white"
          border="3px solid"
          borderColor="bauhaus.black"
          boxShadow="4px 4px 0px 0px #121212"
          p={3}
        >
          <HStack spacing={3}>
            <Box
              bg="bg.muted"
              border="2px solid"
              borderColor="bauhaus.black"
              borderRadius="sm"
              w="32px"
              h="32px"
              display="flex"
              alignItems="center"
              justifyContent="center"
              overflow="hidden"
            >
              {token.logoUrl ? (
                <Image
                  src={token.logoUrl}
                  alt={token.symbol}
                  boxSize="28px"
                  fallback={
                    <Text fontSize="xs" fontWeight="800" color="text.secondary">
                      {token.symbol.slice(0, 3)}
                    </Text>
                  }
                />
              ) : (
                <Text fontSize="xs" fontWeight="800" color="text.secondary">
                  {token.symbol.slice(0, 3)}
                </Text>
              )}
            </Box>
            <VStack align="start" spacing={0} flex={1}>
              <Text fontSize="sm" fontWeight="700" color="text.primary">
                {token.symbol.toUpperCase()}
              </Text>
              <Text fontSize="sm" fontWeight="800" color="text.primary">
                {token.balanceFormatted} {token.symbol.toUpperCase()}
              </Text>
              {hasPrice && (
                <Text fontSize="xs" fontWeight="700" color="text.tertiary">
                  {formatUsd(parseFloat(token.balance) * token.priceUsd)}
                </Text>
              )}
            </VStack>
            {chainConfig.icon && (
              <HStack spacing={1}>
                <Image src={chainConfig.icon} alt={chainConfig.name} boxSize="20px" />
                <Text fontSize="xs" fontWeight="700" color="text.secondary">
                  {chainConfig.name}
                </Text>
              </HStack>
            )}
          </HStack>
        </Box>

        {/* Recipient input */}
        <Box>
          <HStack justify="space-between" align="center" mb={1}>
            <Text fontSize="sm" fontWeight="700" color="text.secondary" textTransform="uppercase">
              Recipient
            </Text>
            {/* Resolution status - top right */}
            {recipient && (isResolving || isLoadingExtras) && (
              <HStack spacing={1}>
                <Spinner size="xs" color="bauhaus.blue" />
                <Text fontSize="xs" color="text.tertiary" fontWeight="700">
                  Resolving...
                </Text>
              </HStack>
            )}
            {recipient && !isResolving && isRecipientValid && isResolvableName(recipient) && resolvedAddress && (
              <HStack spacing={0.5}>
                {avatar && (
                  <Image
                    src={avatar}
                    alt="avatar"
                    boxSize="14px"
                    borderRadius="full"
                    border="1px solid"
                    borderColor="bauhaus.black"
                  />
                )}
                <Text fontSize="xs" color="text.tertiary" fontFamily="mono" fontWeight="700">
                  {resolvedAddress.slice(0, 6)}...{resolvedAddress.slice(-4)}
                </Text>
                <IconButton
                  aria-label="Copy address"
                  icon={copied ? <CheckIcon boxSize="10px" /> : <CopyIcon boxSize="10px" />}
                  size="xs"
                  variant="ghost"
                  minW="18px"
                  h="18px"
                  color={copied ? "bauhaus.yellow" : "text.tertiary"}
                  onClick={async () => {
                    await navigator.clipboard.writeText(resolvedAddress);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  }}
                  _hover={{ color: "bauhaus.blue", bg: "bg.muted" }}
                />
                {chainConfig.explorer && (
                  <IconButton
                    aria-label="View on explorer"
                    icon={<ExternalLinkIcon boxSize="10px" />}
                    size="xs"
                    variant="ghost"
                    minW="18px"
                    h="18px"
                    color="text.tertiary"
                    onClick={() => window.open(`${chainConfig.explorer}/address/${resolvedAddress}`, "_blank")}
                    _hover={{ color: "bauhaus.blue", bg: "bg.muted" }}
                  />
                )}
              </HStack>
            )}
            {recipient && !isResolving && isRecipientValid && !isResolvableName(recipient) && resolvedName && (
              <HStack spacing={0.5}>
                {avatar && (
                  <Image
                    src={avatar}
                    alt="avatar"
                    boxSize="14px"
                    borderRadius="full"
                    border="1px solid"
                    borderColor="bauhaus.black"
                  />
                )}
                <Text fontSize="xs" color="text.tertiary" fontWeight="700">
                  {resolvedName}
                </Text>
              </HStack>
            )}
          </HStack>
          <Input
            placeholder="0x..., ENS, Basename, .wei, or .mega"
            value={recipient}
            onChange={(e) => setRecipient(e.target.value.trim())}
            fontFamily="mono"
            fontSize="sm"
            border="3px solid"
            borderColor={
              recipient && !isResolving && !isRecipientValid
                ? "bauhaus.red"
                : "bauhaus.black"
            }
            borderRadius="0"
            bg="bauhaus.white"
            _hover={{ borderColor: "bauhaus.blue" }}
            _focus={{ borderColor: "bauhaus.blue", boxShadow: "none" }}
          />
          {recipient && !isResolving && !isRecipientValid && (
            <Text fontSize="xs" color="bauhaus.red" fontWeight="700" mt={1}>
              Invalid address or name
            </Text>
          )}
        </Box>

        {/* Amount input */}
        <Box>
          <HStack justify="space-between" align="center" mb={1}>
            <Text fontSize="sm" fontWeight="700" color="text.secondary" textTransform="uppercase">
              Amount
            </Text>
            {hasPrice && (
              <Button
                size="xs"
                variant="ghost"
                color="bauhaus.blue"
                fontWeight="800"
                fontSize="xs"
                h="20px"
                px={1}
                onClick={handleToggleMode}
                _hover={{ bg: "bg.muted" }}
              >
                {isUsdMode ? token.symbol.toUpperCase() : "USD"}
              </Button>
            )}
          </HStack>
          <InputGroup>
            {isUsdMode && (
              <InputLeftElement pointerEvents="none" h="full" w="28px" pl={2}>
                <Text fontFamily="mono" fontSize="sm" color="text.tertiary" fontWeight="700">$</Text>
              </InputLeftElement>
            )}
            <Input
              placeholder="0.0"
              value={amount}
              onChange={(e) => {
                const val = e.target.value;
                if (/^\d*\.?\d*$/.test(val)) {
                  setAmount(val);
                  syncSliderFromAmount(val);
                }
              }}
              fontFamily="mono"
              fontSize="sm"
              border="3px solid"
              borderColor="bauhaus.black"
              borderRadius="0"
              bg="bauhaus.white"
              _hover={{ borderColor: "bauhaus.blue" }}
              _focus={{ borderColor: "bauhaus.blue", boxShadow: "none" }}
              pl={isUsdMode ? "28px" : undefined}
              pr="60px"
            />
            <InputRightElement w="55px" h="full">
              <Button
                size="xs"
                variant="ghost"
                color="bauhaus.blue"
                fontWeight="800"
                onClick={handleMaxAmount}
                _hover={{ bg: "bg.muted" }}
              >
                MAX
              </Button>
            </InputRightElement>
          </InputGroup>
          {/* Conversion display */}
          {amount && parseFloat(amount) > 0 && hasPrice && (
            <Text fontSize="xs" color="text.tertiary" fontWeight="700" mt={1}>
              {isUsdMode
                ? `${formatTokenAmount(parseFloat(amount) / token.priceUsd)} ${token.symbol.toUpperCase()}`
                : formatUsd(parseFloat(amount) * token.priceUsd)
              }
            </Text>
          )}
          {/* Percentage slider */}
          {balanceNum > 0 && (
            <Box px={2} pt={2} pb={6}>
              <Slider
                min={0}
                max={100}
                step={1}
                value={sliderValue}
                onChange={(val) => {
                  const SNAP_THRESHOLD = 3;
                  const snaps = [0, 25, 50, 75, 100];
                  const nearest = snaps.find((s) => Math.abs(val - s) <= SNAP_THRESHOLD);
                  const snapped = nearest !== undefined ? nearest : val;
                  setSliderValue(snapped);
                  setAmountFromSlider(snapped);
                }}
              >
                {[0, 25, 50, 75, 100].map((pct) => (
                  <SliderMark
                    key={pct}
                    value={pct}
                    mt={3}
                    fontSize="xs"
                    fontWeight="800"
                    color={sliderValue >= pct ? "bauhaus.blue" : "gray.400"}
                    whiteSpace="nowrap"
                    transform="translateX(-50%)"
                  >
                    {pct}%
                  </SliderMark>
                ))}
                <SliderTrack bg="gray.200" h="6px" borderRadius={0}>
                  <SliderFilledTrack bg="bauhaus.blue" />
                </SliderTrack>
                <SliderThumb
                  boxSize={5}
                  bg="bauhaus.blue"
                  border="3px solid"
                  borderColor="bauhaus.black"
                  borderRadius={0}
                  _focus={{ boxShadow: "none" }}
                />
              </Slider>
            </Box>
          )}
          {amount && !isAmountValid() && parseFloat(amount) > 0 && (
            <Text fontSize="xs" color="bauhaus.red" fontWeight="700" mt={1}>
              Insufficient balance
            </Text>
          )}
        </Box>

        {/* Impersonator warning */}
        {accountType === "impersonator" && (
          <Box
            bg="bauhaus.yellow"
            border="3px solid"
            borderColor="bauhaus.black"
            boxShadow="3px 3px 0px 0px #121212"
            p={3}
          >
            <Text fontSize="sm" color="bauhaus.black" fontWeight="700">
              View-only account — transfers are disabled.
            </Text>
          </Box>
        )}

        {/* Action buttons */}
        <HStack spacing={3} mt={2}>
          <Button
            variant="secondary"
            flex={1}
            onClick={onBack}
            isDisabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            flex={1}
            onClick={handleSubmit}
            isLoading={isSubmitting}
            isDisabled={!canSubmit || accountType === "impersonator"}
            bg="bauhaus.blue"
            color="white"
            border="3px solid"
            borderColor="bauhaus.black"
            boxShadow="4px 4px 0px 0px #121212"
            fontWeight="700"
            _hover={{
              bg: "bauhaus.blue",
              transform: "translateY(-2px)",
              boxShadow: "6px 6px 0px 0px #121212",
            }}
            _active={{
              transform: "translate(2px, 2px)",
              boxShadow: "none",
            }}
          >
            Send
          </Button>
        </HStack>
      </VStack>
    </Box>
  );
}

export default memo(TokenTransfer);
