import { useState, useEffect, useCallback } from "react";
import {
  Box,
  VStack,
  HStack,
  Text,
  Image,
  Badge,
  Input,
  Button,
  IconButton,
  Spinner,
  Tooltip,
} from "@chakra-ui/react";
import {
  WarningIcon,
  EditIcon,
  CheckIcon,
  CloseIcon,
  CopyIcon,
  ExternalLinkIcon,
} from "@chakra-ui/icons";
import { formatUnits, parseUnits } from "viem";
import {
  type ParsedApproval,
  encodeApproveCalldata,
  INFINITE_THRESHOLD,
} from "@/lib/erc20Approve";
import { updatePendingTxRequestData } from "@/chrome/pendingTxStorage";
import { ethShLabelsUrl } from "@/constants/externalUrls";
import { useTheme } from "@/theme";
import { getChainConfig } from "@/constants/chainConfig";
import { KNOWN_TOKEN_LOGOS } from "@/chrome/txSimulation";

interface TokenMeta {
  name: string;
  symbol: string;
  decimals: number;
  logoUrl?: string;
}

interface ERC20ApproveDisplayProps {
  /** The ERC20 token contract address (tx.to) */
  tokenAddress: string;
  /** Parsed approval data */
  approval: ParsedApproval;
  /** Chain ID for explorer links and RPC calls */
  chainId: number;
  /** Pending tx ID — used to persist calldata changes */
  txId: string;
}

/**
 * Format a large number with commas for readability.
 */
function formatWithCommas(value: string): string {
  const [integer, decimal] = value.split(".");
  const formatted = integer.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  if (decimal) return `${formatted}.${decimal}`;
  return formatted;
}

export default function ERC20ApproveDisplay({
  tokenAddress,
  approval,
  chainId,
  txId,
}: ERC20ApproveDisplayProps) {
  const { tokens } = useTheme();
  const [token, setToken] = useState<TokenMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState("");
  const [currentAmount, setCurrentAmount] = useState(approval.amount);
  const [isInfinite, setIsInfinite] = useState(approval.isInfinite);
  const [spenderLabels, setSpenderLabels] = useState<string[]>([]);
  const [copiedSpender, setCopiedSpender] = useState(false);
  const [copiedToken, setCopiedToken] = useState(false);

  const chainConfig = getChainConfig(chainId);

  // Fetch token metadata
  useEffect(() => {
    setLoading(true);

    // Fetch on-chain info via background
    const infoPromise = new Promise<{
      success: boolean;
      data?: { name: string; symbol: string; decimals: number };
    }>((resolve) => {
      chrome.runtime.sendMessage(
        { type: "fetchTokenInfo", tokenAddress, chainId },
        resolve,
      );
    });

    // Fetch token list for logo
    const listPromise = new Promise<{
      success: boolean;
      data?: Array<{
        address: string;
        logoURI: string;
      }>;
    }>((resolve) => {
      chrome.runtime.sendMessage(
        { type: "fetchSwapTokenList", chainId },
        resolve,
      );
    });

    Promise.all([infoPromise, listPromise])
      .then(([infoRes, listRes]) => {
        if (infoRes.success && infoRes.data) {
          // Find logo from token list
          const listEntry = listRes?.data?.find(
            (t) =>
              t.address.toLowerCase() === tokenAddress.toLowerCase(),
          );

          setToken({
            name: infoRes.data.name,
            symbol: infoRes.data.symbol,
            decimals: infoRes.data.decimals,
            logoUrl:
              listEntry?.logoURI ||
              KNOWN_TOKEN_LOGOS[tokenAddress.toLowerCase()] ||
              undefined,
          });
        }
      })
      .finally(() => setLoading(false));
  }, [tokenAddress, chainId]);

  // Fetch spender labels
  useEffect(() => {
    fetch(
      ethShLabelsUrl(approval.spender, chainId),
    )
      .then((res) => (res.ok ? res.json() : []))
      .then((labels) => {
        if (Array.isArray(labels) && labels.length > 0) {
          setSpenderLabels(labels);
        }
      })
      .catch(() => {});
  }, [approval.spender, chainId]);

  const formattedAmount =
    token && !isInfinite
      ? formatWithCommas(formatUnits(currentAmount, token.decimals))
      : null;

  const handleStartEdit = useCallback(() => {
    if (!token) return;
    setEditValue(formatUnits(currentAmount, token.decimals));
    setEditing(true);
  }, [token, currentAmount]);

  const handleCancelEdit = useCallback(() => {
    setEditing(false);
    setEditValue("");
  }, []);

  const handleSaveEdit = useCallback(async () => {
    if (!token) return;

    try {
      const newAmount = parseUnits(editValue, token.decimals);
      setCurrentAmount(newAmount);
      setIsInfinite(newAmount >= INFINITE_THRESHOLD);

      // Persist to storage so confirm uses updated calldata
      const newData = encodeApproveCalldata(approval.spender, newAmount);
      await updatePendingTxRequestData(txId, newData);

      setEditing(false);
    } catch {
      // Invalid input — don't save
    }
  }, [token, editValue, approval.spender, txId]);

  const handleCopySpender = async () => {
    try {
      await navigator.clipboard.writeText(approval.spender);
      setCopiedSpender(true);
      setTimeout(() => setCopiedSpender(false), 2000);
    } catch {}
  };

  const handleCopyToken = async () => {
    try {
      await navigator.clipboard.writeText(tokenAddress);
      setCopiedToken(true);
      setTimeout(() => setCopiedToken(false), 2000);
    } catch {}
  };

  if (loading) {
    return (
      <Box
        bg="surface.raised"
        border={tokens.borders.thin}
        borderColor="border.default"
        borderRadius="lg"
        boxShadow="card"
        p={3}
      >
        <HStack justify="center" spacing={2}>
          <Spinner size="sm" />
          <Text fontSize="xs" fontWeight="700" color="text.secondary">
            Detecting approval...
          </Text>
        </HStack>
      </Box>
    );
  }

  if (!token) return null;

  return (
    <Box
      bg="status.info.bg"
      border={tokens.borders.thin}
      borderColor="border.default"
      borderRadius="lg"
      boxShadow="card"
      overflow="hidden"
      position="relative"
    >
      {/* Rows use explicit borderTop instead of VStack's `divider` prop
          — see BatchTransactionConfirmation info card for the rationale. */}
      <VStack spacing={0} align="stretch">
        {/* Token info */}
        <HStack w="full" py={2} px={3} justify="space-between">
          <Text
            fontSize="xs"
            color="text.secondary"
            fontWeight="700"
            textTransform="uppercase"
          >
            Token
          </Text>
          <HStack spacing={1.5}>
            {token.logoUrl ? (
              <Image
                src={token.logoUrl}
                alt={token.symbol}
                boxSize="18px"
                borderRadius="full"
                border="1.5px solid"
                borderColor="border.default"
              />
            ) : (
              <Box
                boxSize="18px"
                bg="accent.secondary"
                borderRadius="full"
                border="1.5px solid"
                borderColor="border.default"
                display="flex"
                alignItems="center"
                justifyContent="center"
              >
                <Text fontSize="7px" fontWeight="900" color="accentFg.secondary">
                  {token.symbol.slice(0, 2)}
                </Text>
              </Box>
            )}
            <Text fontSize="xs" fontWeight="700" color="text.primary">
              {token.name}
            </Text>
            <Badge
              fontSize="2xs"
              bg="bg.muted"
              color="text.secondary"
              border="1px solid"
              borderColor="border.subtle"
              px={1.5}
              py={0}
              fontWeight="700"
            >
              {token.symbol}
            </Badge>
            <IconButton
              aria-label="Copy token address"
              icon={copiedToken ? <CheckIcon /> : <CopyIcon />}
              size="xs"
              variant="ghost"
              color={copiedToken ? "accent.highlight" : "text.secondary"}
              onClick={handleCopyToken}
              _hover={{ color: "accent.secondary", bg: "bg.muted" }}
            />
            {chainConfig.explorer && (
              <IconButton
                aria-label="View token on explorer"
                icon={<ExternalLinkIcon boxSize="10px" />}
                size="xs"
                variant="ghost"
                minW="18px"
                h="18px"
                color="text.tertiary"
                onClick={() =>
                  window.open(
                    `${chainConfig.explorer}/address/${tokenAddress}`,
                    "_blank",
                  )
                }
                _hover={{ color: "accent.secondary", bg: "bg.muted" }}
              />
            )}
          </HStack>
        </HStack>

        {/* Spender */}
        <Box
          w="full"
          py={2}
          px={3}
          borderTop="1px solid"
          borderColor="border.subtle"
        >
          <HStack justify="space-between" mb={spenderLabels.length > 0 ? 1 : 0}>
            <Text
              fontSize="xs"
              color="text.secondary"
              fontWeight="700"
              textTransform="uppercase"
            >
              Spender
            </Text>
            <HStack
              spacing={0.5}
              px={1.5}
              py={0.5}
              bg="surface.raised"
              border="1.5px solid"
              borderColor="border.default"
              borderRadius="md"
            >
              <Text
                fontSize="xs"
                color="text.primary"
                fontFamily="mono"
                fontWeight="700"
              >
                {approval.spender.slice(0, 6)}...
                {approval.spender.slice(-4)}
              </Text>
              <IconButton
                aria-label="Copy spender"
                icon={copiedSpender ? <CheckIcon /> : <CopyIcon />}
                size="xs"
                variant="ghost"
                color={copiedSpender ? "accent.highlight" : "text.secondary"}
                onClick={handleCopySpender}
                _hover={{ color: "accent.secondary", bg: "bg.muted" }}
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
                  onClick={() =>
                    window.open(
                      `${chainConfig.explorer}/address/${approval.spender}`,
                      "_blank",
                    )
                  }
                  _hover={{ color: "accent.secondary", bg: "bg.muted" }}
                />
              )}
            </HStack>
          </HStack>
          {spenderLabels.length > 0 && (
            <HStack justify="flex-end">
              <Badge
                fontSize="2xs"
                bg="accent.secondary"
                color="accentFg.secondary"
                border="1.5px solid"
                borderColor="border.default"
                px={1.5}
                py={0}
                fontWeight="700"
                maxW="200px"
                isTruncated
              >
                {spenderLabels[0]}
              </Badge>
            </HStack>
          )}
        </Box>

        {/* Amount */}
        <Box
          w="full"
          py={2}
          px={3}
          borderTop="1px solid"
          borderColor="border.subtle"
        >
          <HStack justify="space-between" align="center">
            <Text
              fontSize="xs"
              color="text.secondary"
              fontWeight="700"
              textTransform="uppercase"
            >
              Amount
            </Text>

            {editing ? (
              <HStack spacing={1} flex={1} ml={3}>
                <Input
                  size="xs"
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  fontFamily="mono"
                  fontWeight="700"
                  fontSize="xs"
                  px={2}
                  py={1}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSaveEdit();
                    if (e.key === "Escape") handleCancelEdit();
                  }}
                  autoFocus
                />
                <IconButton
                  aria-label="Save"
                  icon={<CheckIcon />}
                  size="xs"
                  variant="ghost"
                  color="status.success.fg"
                  onClick={handleSaveEdit}
                  _hover={{ bg: "status.success.bg" }}
                />
                <IconButton
                  aria-label="Cancel"
                  icon={<CloseIcon boxSize="8px" />}
                  size="xs"
                  variant="ghost"
                  color="status.error.fg"
                  onClick={handleCancelEdit}
                  _hover={{ bg: "status.error.bg" }}
                />
              </HStack>
            ) : (
              <HStack spacing={1.5}>
                {isInfinite ? (
                  <Tooltip
                    label="This grants unlimited spending of your tokens. Consider setting a specific amount."
                    fontSize="xs"
                    hasArrow
                    bg="fg.primary"
                    color="fg.inverse"
                    maxW="200px"
                  >
                    <HStack
                      spacing={1.5}
                      bg="status.error.bg"
                      px={2}
                      py={0.5}
                      border="1.5px solid"
                      borderColor="status.error.border"
                    >
                      <WarningIcon boxSize={2.5} color="status.error.fg" />
                      <Text
                        fontSize="xs"
                        fontWeight="900"
                        color="status.error.fg"
                        textTransform="uppercase"
                      >
                        Unlimited
                      </Text>
                    </HStack>
                  </Tooltip>
                ) : (
                  <Tooltip
                    label={formatUnits(currentAmount, token.decimals)}
                    fontSize="xs"
                    hasArrow
                    isDisabled={!formattedAmount || formattedAmount.length < 20}
                  >
                    <Text
                      fontSize="xs"
                      fontWeight="700"
                      color="text.primary"
                      maxW="160px"
                      isTruncated
                    >
                      {formattedAmount} {token.symbol}
                    </Text>
                  </Tooltip>
                )}
                <IconButton
                  aria-label="Edit amount"
                  icon={<EditIcon boxSize="10px" />}
                  size="xs"
                  variant="ghost"
                  color="accentFg.highlight"
                  bg="accent.highlight"
                  border="1.5px solid"
                  borderColor="border.default"
                  borderRadius="none"
                  onClick={handleStartEdit}
                  _hover={{ opacity: 0.85 }}
                  minW="22px"
                  h="22px"
                />
              </HStack>
            )}
          </HStack>
        </Box>
      </VStack>
    </Box>
  );
}
