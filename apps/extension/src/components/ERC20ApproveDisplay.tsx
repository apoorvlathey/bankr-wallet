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
      `https://eth.sh/api/labels/${approval.spender}?chainId=${chainId}`,
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
        bg="bauhaus.white"
        border="2px solid"
        borderColor="bauhaus.black"
        boxShadow="2px 2px 0px 0px #121212"
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
      bg="#EEF2FF"
      border="2px solid"
      borderColor="bauhaus.black"
      boxShadow="2px 2px 0px 0px #121212"
      position="relative"
    >
      <VStack spacing={0} divider={<Box h="1px" bg="gray.300" w="full" />}>
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
                borderColor="bauhaus.black"
              />
            ) : (
              <Box
                boxSize="18px"
                bg="bauhaus.blue"
                borderRadius="full"
                border="1.5px solid"
                borderColor="bauhaus.black"
                display="flex"
                alignItems="center"
                justifyContent="center"
              >
                <Text fontSize="7px" fontWeight="900" color="white">
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
              borderColor="gray.300"
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
              color={copiedToken ? "bauhaus.yellow" : "text.secondary"}
              onClick={handleCopyToken}
              _hover={{ color: "bauhaus.blue", bg: "bg.muted" }}
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
                _hover={{ color: "bauhaus.blue", bg: "bg.muted" }}
              />
            )}
          </HStack>
        </HStack>

        {/* Spender */}
        <Box w="full" py={2} px={3}>
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
              bg="bauhaus.white"
              border="1.5px solid"
              borderColor="bauhaus.black"
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
                color={copiedSpender ? "bauhaus.yellow" : "text.secondary"}
                onClick={handleCopySpender}
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
                  onClick={() =>
                    window.open(
                      `${chainConfig.explorer}/address/${approval.spender}`,
                      "_blank",
                    )
                  }
                  _hover={{ color: "bauhaus.blue", bg: "bg.muted" }}
                />
              )}
            </HStack>
          </HStack>
          {spenderLabels.length > 0 && (
            <HStack justify="flex-end">
              <Badge
                fontSize="2xs"
                bg="bauhaus.blue"
                color="white"
                border="1.5px solid"
                borderColor="bauhaus.black"
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
        <Box w="full" py={2} px={3}>
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
                  border="1.5px solid"
                  borderColor="bauhaus.black"
                  borderRadius="none"
                  px={2}
                  py={1}
                  _focus={{
                    borderColor: "bauhaus.blue",
                    boxShadow: "none",
                  }}
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
                  color="green.500"
                  onClick={handleSaveEdit}
                  _hover={{ bg: "green.50" }}
                />
                <IconButton
                  aria-label="Cancel"
                  icon={<CloseIcon boxSize="8px" />}
                  size="xs"
                  variant="ghost"
                  color="bauhaus.red"
                  onClick={handleCancelEdit}
                  _hover={{ bg: "red.50" }}
                />
              </HStack>
            ) : (
              <HStack spacing={1.5}>
                {isInfinite ? (
                  <Tooltip
                    label="This grants unlimited spending of your tokens. Consider setting a specific amount."
                    fontSize="xs"
                    hasArrow
                    bg="bauhaus.black"
                    color="white"
                    maxW="200px"
                  >
                    <HStack
                      spacing={1.5}
                      bg="bauhaus.red"
                      px={2}
                      py={0.5}
                      border="1.5px solid"
                      borderColor="bauhaus.black"
                    >
                      <WarningIcon boxSize={2.5} color="white" />
                      <Text
                        fontSize="xs"
                        fontWeight="900"
                        color="white"
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
                  color="bauhaus.black"
                  bg="bauhaus.yellow"
                  border="1.5px solid"
                  borderColor="bauhaus.black"
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
