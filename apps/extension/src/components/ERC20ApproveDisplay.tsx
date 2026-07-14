import { useState, useEffect, useCallback } from "react";
import {
  Box,
  VStack,
  HStack,
  Text,
  Image,
  Badge,
  Input,
  IconButton,
  Spinner,
  Tooltip,
  Spacer,
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
import { resolveAddressToName } from "@/lib/ensUtils";
import { getEthShLabels } from "@/lib/ethShLabelsCache";
import { isDarkThemeId, useTheme } from "@/theme";
import { useNetworks } from "@/contexts/NetworksContext";
import { getResolvedChainById } from "@/lib/chains";
import { useCachedAvatarSrc } from "@/hooks/useCachedAvatarSrc";
import {
  AddressActions,
  LabeledAddressPopover,
} from "@/components/shared/LabeledAddressPopover";
import {
  getCachedTokenMetadataSync,
  resolveTokenMetadataClient,
} from "@/lib/tokenMetadataClient";

interface TokenMeta {
  name: string;
  symbol: string;
  decimals: number;
  logoUrl?: string;
}

function toTokenMeta(
  metadata:
    | { name?: string; symbol?: string; decimals?: number; logoUrl?: string }
    | null
    | undefined,
): TokenMeta | null {
  if (!metadata?.symbol || typeof metadata.decimals !== "number") return null;
  return {
    name: metadata.name || metadata.symbol,
    symbol: metadata.symbol,
    decimals: metadata.decimals,
    logoUrl: metadata.logoUrl,
  };
}

interface ERC20ApproveDisplayProps {
  /** The ERC20 token contract address (tx.to) */
  tokenAddress: string;
  /** Parsed approval data */
  approval: ParsedApproval;
  /** Chain ID for explorer links and RPC calls */
  chainId: number;
  /** Remove outer card chrome when a parent call card owns the surface. */
  embedded?: boolean;
  /**
   * Pending tx ID — used to persist calldata changes for single-tx
   * confirmations. Optional when `onSaveCalldata` is provided (batch flows
   * persist via their own storage, not `pendingTxRequests`).
   */
  txId?: string;
  /**
   * Optional override for persisting the edited calldata. When provided,
   * called with the freshly encoded `approve(spender, newAmount)` bytes
   * instead of writing to `pendingTxRequests`. Used by the batch
   * confirmation surface (which owns its own per-call storage) and by the
   * cross-dapp batch wrapper.
   */
  onSaveCalldata?: (
    newData: string,
  ) => Promise<{ success: boolean; error?: string }>;
}

/**
 * Format an ERC20 approval amount for compact display on the approval card.
 *
 * Small values (≤9 integer digits) render with comma separators; the decimal
 * part is trimmed of trailing zeros and capped at 6 dp so "100.000000" doesn't
 * waste card width over "100".
 *
 * Larger values abbreviate with B / T / Q suffixes — approvals in the billions
 * and above stop being readable as comma-separated strings and the exact
 * number is rarely the thing the user is deciding on. Two decimal places are
 * retained so `1,234,567,890` → `1.23B` distinguishes from `9.99B`.
 *
 * Beyond quadrillion (>18 integer digits) falls back to scientific notation
 * (`1.15e20`) — at that point the user just needs to see the order of
 * magnitude; the `Tooltip` in the caller always carries the exact value.
 *
 * BigInt math is used throughout so we stay accurate against arbitrary
 * uint256 amounts; Number() would silently lose precision past 2^53.
 */
interface FormattedApprovalAmount {
  /** The numeric portion, shown in the primary text color. */
  value: string;
  /** Optional magnitude suffix ("B", "e20", etc.) — rendered in a distinct
   *  accent color so users don't miss it when scanning at speed. Empty
   *  string when the display is fully spelled out with commas. */
  suffix: string;
}

function formatApprovalAmount(value: string): FormattedApprovalAmount {
  const [integer = "0", decimal = ""] = value.split(".");
  const digits = integer.length;

  if (digits <= 9) {
    const formatted = integer.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    const trimmed = decimal.replace(/0+$/, "").slice(0, 6);
    return {
      value: trimmed ? `${formatted}.${trimmed}` : formatted,
      suffix: "",
    };
  }

  // 10–12 digits → billions with two decimals (1.23B up to 999.99B). Past
  // that (≥ 1 trillion) stops being a number users reason about — fall back
  // to scientific notation rather than piling on T / Q / etc. suffixes.
  if (digits <= 12) {
    const intBig = BigInt(integer);
    const scaled = (intBig * 100n) / 1_000_000_000n;
    const whole = scaled / 100n;
    const frac = scaled % 100n;
    return {
      value: `${whole}.${frac.toString().padStart(2, "0")}`,
      suffix: "B",
    };
  }

  const first = integer[0];
  const next = integer.slice(1, 3).padEnd(2, "0");
  const exponent = digits - 1;
  return {
    value: `${first}.${next}`,
    suffix: `e${exponent}`,
  };
}

export default function ERC20ApproveDisplay({
  tokenAddress,
  approval,
  chainId,
  embedded = false,
  txId,
  onSaveCalldata,
}: ERC20ApproveDisplayProps) {
  const { tokens, themeId } = useTheme();
  const { networksInfo } = useNetworks();
  const isDarkTheme = isDarkThemeId(themeId);
  const initialToken = toTokenMeta(
    getCachedTokenMetadataSync(chainId, tokenAddress),
  );
  const [token, setToken] = useState<TokenMeta | null>(() => initialToken);
  const [loading, setLoading] = useState(() => !initialToken);
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState("");
  const [currentAmount, setCurrentAmount] = useState(approval.amount);
  const [isInfinite, setIsInfinite] = useState(approval.isInfinite);
  const [isRevoke, setIsRevoke] = useState(approval.isRevoke);
  // Approval card bg. MUST be declared after `isRevoke` — referencing the
  // state in initializer order earlier hit the TDZ once Vite minified the
  // identifier.
  //   Approve (any amount > 0):
  //     Bauhaus uses cornsilk `status.warning.tint` (#FFF8DC) — a warm pale
  //       yellow that reads "caution / approve with care", ties in with the
  //       amber header pill without competing, and keeps dark text legible.
  //     Midnight uses `surface.raisedHover` (#1A2033) — a clearly lifted navy
  //       against the darker surface.raised info card below.
  //   Revoke (amount === 0):
  //     Bauhaus swaps to `status.success.tint` because revoking is a
  //       protective action — the warning yellow would lie about the risk.
  //     Midnight keeps the same lifted navy so the card still reads as a
  //       distinct surface against the modal's other rows. The green REVOKE
  //       chip below carries the "this is safe" semantic on its own.
  const approvalCardBg = isRevoke
    ? isDarkTheme
      ? "surface.raisedHover"
      : "status.success.tint"
    : isDarkTheme
      ? "surface.raisedHover"
      : "status.warning.tint";
  const [spenderLabels, setSpenderLabels] = useState<string[]>([]);
  const [resolvedSpenderName, setResolvedSpenderName] = useState<string | null>(null);
  const [copiedToken, setCopiedToken] = useState(false);
  const spenderLabel = spenderLabels[0] ?? resolvedSpenderName;

  const explorerUrl = getResolvedChainById(chainId, networksInfo)?.explorer ?? "";

  // Fetch token metadata through the centralized resolver shared by
  // clear-signing, tx history, portfolio stubs, and batch inline summaries.
  useEffect(() => {
    let cancelled = false;
    const applyMetadata = (
      metadata:
        | { name?: string; symbol?: string; decimals?: number; logoUrl?: string }
        | null
        | undefined,
    ) => {
      if (cancelled) return false;
      const next = toTokenMeta(metadata);
      if (!next) {
        setToken(null);
        return false;
      }
      setToken(next);
      return true;
    };

    const cached = getCachedTokenMetadataSync(chainId, tokenAddress);
    if (cached === undefined) setToken(null);
    setLoading(cached === undefined || !applyMetadata(cached));

    resolveTokenMetadataClient(chainId, tokenAddress)
      .then((metadata) => {
        applyMetadata(metadata);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [tokenAddress, chainId]);

  // Fetch spender labels
  useEffect(() => {
    let cancelled = false;
    getEthShLabels(approval.spender, chainId).then((labels) => {
      if (cancelled) return;
      if (labels.length > 0) setSpenderLabels(labels);
    });
    return () => {
      cancelled = true;
    };
  }, [approval.spender, chainId]);

  // Reverse resolve the spender address to ENS/Basename/WNS/GNS. Shown as a
  // separate badge so an onchain name and an eth.sh label can coexist
  // (same pattern as the outer "To" row).
  useEffect(() => {
    setResolvedSpenderName(null);
    resolveAddressToName(approval.spender)
      .then((name) => {
        if (name) setResolvedSpenderName(name);
      })
      .catch(() => {});
  }, [approval.spender]);

  const formattedAmount =
    token && !isInfinite
      ? formatApprovalAmount(formatUnits(currentAmount, token.decimals))
      : null;
  const formattedAmountDisplay = formattedAmount
    ? formattedAmount.suffix
      ? `${formattedAmount.value}${formattedAmount.suffix}`
      : formattedAmount.value
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

    let newAmount: bigint;
    try {
      newAmount = parseUnits(editValue, token.decimals);
    } catch {
      // Invalid input — don't save
      return;
    }

    const newData = encodeApproveCalldata(approval.spender, newAmount);

    // Persist via the caller-supplied override (batch flows) or the default
    // single-tx storage path. Only commit local state on success so a failing
    // save doesn't desync the displayed amount from what's on storage.
    if (onSaveCalldata) {
      const result = await onSaveCalldata(newData);
      if (!result.success) return;
    } else if (txId) {
      const result = await new Promise<{ success: boolean; error?: string }>(
        (resolve) => {
          chrome.runtime.sendMessage(
            { type: "updatePendingTxRequestData", txId, newData },
            (response) =>
              resolve(response || { success: false, error: "No response" }),
          );
        },
      );
      if (!result.success) return;
    } else {
      return;
    }

    setCurrentAmount(newAmount);
    setIsInfinite(newAmount >= INFINITE_THRESHOLD);
    setIsRevoke(newAmount === 0n);
    setEditing(false);
  }, [token, editValue, approval.spender, txId, onSaveCalldata]);

  // Cached logo data URL — shares the avatar/token-logo image cache so the
  // approve card paints synchronously on reopen. Must run before any
  // conditional returns (hook order).
  const cachedTokenLogo = useCachedAvatarSrc(token?.logoUrl);

  const handleCopyToken = async () => {
    try {
      await navigator.clipboard.writeText(tokenAddress);
      setCopiedToken(true);
      setTimeout(() => setCopiedToken(false), 2000);
    } catch {
      // Clipboard may be unavailable in some extension contexts.
    }
  };

  if (loading) {
    return (
      <Box
        bg="surface.raised"
        border={embedded ? "none" : tokens.borders.thin}
        borderColor="border.default"
        borderRadius={embedded ? 0 : "lg"}
        boxShadow={embedded ? "none" : "card"}
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

  const tokenLogoSrc = cachedTokenLogo || token.logoUrl;
  const tokenLogo = tokenLogoSrc ? (
    <Image
      src={tokenLogoSrc}
      alt={token.symbol}
      boxSize="20px"
      borderRadius="full"
      border="1.5px solid"
      borderColor="border.default"
    />
  ) : (
    <Box
      boxSize="20px"
      bg="accent.secondary"
      borderRadius="full"
      border="1.5px solid"
      borderColor="border.default"
      display="flex"
      alignItems="center"
      justifyContent="center"
    >
      <Text fontSize="8px" fontWeight="900" color="accentFg.secondary">
        {token.symbol.slice(0, 2)}
      </Text>
    </Box>
  );

  return (
    <Box
      bg={approvalCardBg}
      border={embedded ? "none" : tokens.borders.thin}
      borderColor="border.default"
      borderRadius={embedded ? 0 : "lg"}
      boxShadow={embedded ? "none" : "card"}
      overflow="hidden"
      position="relative"
    >
      <VStack spacing={0} align="stretch">
        {/* Token header strip — identifies which token is being approved.
            Midnight gets a recessed sunken navy so the strip reads as a
            subtle title bar against the raisedHover card bg. Bauhaus
            leaves the strip transparent (inheriting card bg); the bottom
            divider + logo + bold name already signal "token header", and
            a grey-on-grey lip would be invisible since Bauhaus's
            `bg.muted` resolves to the same value as `surface.raisedHover`. */}
        <HStack
          w="full"
          py={1.5}
          px={3}
          spacing={2}
          bg={isDarkTheme ? "surface.sunken" : "transparent"}
        >
          {tokenLogo}
          <Text fontSize="xs" fontWeight="700" color="text.primary" isTruncated>
            {token.name}
          </Text>
          <Badge
            fontSize="2xs"
            bg="surface.raised"
            color="text.secondary"
            border="1px solid"
            borderColor="border.subtle"
            px={1.5}
            py={0}
            fontWeight="700"
          >
            {token.symbol}
          </Badge>
          <Spacer />
          <IconButton
            aria-label="Copy token address"
            icon={copiedToken ? <CheckIcon boxSize="10px" /> : <CopyIcon boxSize="10px" />}
            size="xs"
            variant="ghost"
            minW="20px"
            h="20px"
            color={copiedToken ? "accent.highlight" : "text.tertiary"}
            onClick={handleCopyToken}
            _hover={{ color: "accent.secondary", bg: "surface.raised" }}
          />
          {explorerUrl && (
            <IconButton
              aria-label="View token on explorer"
              icon={<ExternalLinkIcon boxSize="10px" />}
              size="xs"
              variant="ghost"
              minW="20px"
              h="20px"
              color="text.tertiary"
              onClick={() =>
                window.open(
                  `${explorerUrl}/address/${tokenAddress}`,
                  "_blank",
                  "noopener,noreferrer",
                )
              }
              _hover={{ color: "accent.secondary", bg: "surface.raised" }}
            />
          )}
        </HStack>

        {/* Approve amount — the dominant line. Users should answer "how
            much am I handing over?" by glancing at this one block. Label
            sits above; the value below is noticeably bigger than anything
            else on the card. Edit button keeps the inline affordance but
            docked to the right so it doesn't compete with the number. */}
        <Box
          w="full"
          py={3}
          px={3}
          borderTop="1px solid"
          borderColor="border.subtle"
        >
          <Text
            fontSize="2xs"
            color="text.secondary"
            fontWeight="700"
            textTransform="uppercase"
            letterSpacing="wider"
            mb={1}
          >
            {/* Neutral "Approval" label when revoking — the prominent green
                REVOKE chip immediately below already carries the verb. */}
            {isRevoke ? "Approval" : "Approve Amount"}
          </Text>
          {editing ? (
            <HStack spacing={1} w="full">
              <Input
                size="sm"
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                fontFamily="mono"
                fontWeight="700"
                fontSize="md"
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
                size="sm"
                variant="ghost"
                color="status.success.fg"
                onClick={handleSaveEdit}
                _hover={{ bg: "status.success.bg" }}
              />
              <IconButton
                aria-label="Cancel"
                icon={<CloseIcon boxSize="8px" />}
                size="sm"
                variant="ghost"
                color="status.error.fg"
                onClick={handleCancelEdit}
                _hover={{ bg: "status.error.bg" }}
              />
            </HStack>
          ) : (
            <HStack justify="space-between" align="center" spacing={2}>
              {isRevoke ? (
                <Tooltip
                  label="This sets the spender's allowance to 0 — they will no longer be able to move your tokens. Safe to confirm."
                  fontSize="xs"
                  hasArrow
                  bg="fg.primary"
                  color="fg.inverse"
                  maxW="260px"
                >
                  {/* Revoke chip — mirrors the Unlimited chip's silhouette
                      (Bauhaus: sharp rectangle with thick stroke; Midnight:
                      soft chip with no stroke) but flips the palette to
                      `status.success.*` so the user reads "protective
                      action" instead of "warning". The check glyph
                      reinforces "this clears something" over a generic
                      shield. */}
                  <HStack
                    spacing={1.5}
                    bg="status.success.bg"
                    px={2}
                    py={1}
                    border={isDarkTheme ? "none" : "1.5px solid"}
                    borderColor={
                      isDarkTheme ? undefined : "status.success.border"
                    }
                    borderRadius={isDarkTheme ? "md" : "none"}
                  >
                    <CheckIcon boxSize={3} color="status.success.fg" />
                    <Text
                      fontSize="md"
                      fontWeight="900"
                      color="status.success.fg"
                      textTransform="uppercase"
                      letterSpacing="wide"
                    >
                      Revoke
                    </Text>
                  </HStack>
                </Tooltip>
              ) : isInfinite ? (
                <Tooltip
                  label="This grants unlimited spending of your tokens. Consider setting a specific amount."
                  fontSize="xs"
                  hasArrow
                  bg="fg.primary"
                  color="fg.inverse"
                  maxW="240px"
                >
                  {/* Unlimited warning. Bauhaus: sharp rectangle with a
                      thick 1.5px red stroke — the "danger sign" idiom.
                      Midnight: soft-radius chip without the hard border;
                      the tinted error bg + red foreground + warning glyph
                      already carry the warning weight without the poster
                      stroke. */}
                  <HStack
                    spacing={1.5}
                    bg="status.error.bg"
                    px={2}
                    py={1}
                    border={isDarkTheme ? "none" : "1.5px solid"}
                    borderColor={isDarkTheme ? undefined : "status.error.border"}
                    borderRadius={isDarkTheme ? "md" : "none"}
                  >
                    <WarningIcon boxSize={3} color="status.error.fg" />
                    <Text
                      fontSize="md"
                      fontWeight="900"
                      color="status.error.fg"
                      textTransform="uppercase"
                      letterSpacing="wide"
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
                  // Show the exact value whenever the display differs from
                  // the raw formatUnits output — i.e. abbreviated/trimmed
                  // cases. Skipped only when the card is showing the full
                  // number already (nothing hidden to reveal).
                  isDisabled={
                    !formattedAmountDisplay ||
                    formatUnits(currentAmount, token.decimals) ===
                      formattedAmountDisplay
                  }
                >
                  <Text
                    fontSize="xl"
                    fontWeight="900"
                    color="text.primary"
                    fontFamily="mono"
                    lineHeight="1.1"
                    isTruncated
                    flex={1}
                    minW={0}
                  >
                    {formattedAmount?.value}
                    {/* Magnitude suffix ("B", "e20", etc.) so users
                        skimming a huge number can't mistake `1.15` for a
                        normal amount.
                        Midnight: `chart.numeric` (amber) — pops on dark
                          navy without fighting the violet accents.
                        Bauhaus: `chart.negative` (red) — amber would fade
                          into the cornsilk card bg, whereas red flags the
                          magnitude as "be careful, this is large". */}
                    {formattedAmount?.suffix && (
                      <Text
                        as="span"
                        fontSize="xl"
                        fontWeight="900"
                        color={isDarkTheme ? "chart.numeric" : "chart.negative"}
                        ml={0.5}
                      >
                        {formattedAmount.suffix}
                      </Text>
                    )}{" "}
                    <Text as="span" fontSize="sm" fontWeight="700" color="text.secondary">
                      {token.symbol}
                    </Text>
                  </Text>
                </Tooltip>
              )}
              {/* Edit button. Bauhaus: hard square pill in amber with the
                  thick-border look. Midnight: a soft-radius chip with the
                  same amber fill but no hard stroke — Midnight borrows
                  weight from luminous shadows instead of thick borders, so
                  the Bauhaus rectangle reads as out-of-place there. */}
              {(txId || onSaveCalldata) && (
                <IconButton
                  aria-label="Edit amount"
                  icon={<EditIcon boxSize="11px" />}
                  size={embedded ? "xs" : "sm"}
                  color="accentFg.highlight"
                  bg="accent.highlight"
                  border={isDarkTheme ? "none" : "1.5px solid"}
                  borderColor={isDarkTheme ? undefined : "border.default"}
                  borderRadius={isDarkTheme ? "md" : "none"}
                  boxShadow={isDarkTheme ? "button" : undefined}
                  onClick={handleStartEdit}
                  _hover={
                    isDarkTheme
                      ? { opacity: 0.9, transform: "translateY(-1px)" }
                      : { opacity: 0.85 }
                  }
                  _active={isDarkTheme ? { transform: "scale(0.96)" } : undefined}
                  minW={embedded ? "32px" : "40px"}
                  w={embedded ? "32px" : "40px"}
                  minH={embedded ? "28px" : "40px"}
                  h={embedded ? "28px" : "40px"}
                  flexShrink={0}
                />
              )}
            </HStack>
          )}
        </Box>

        {/* Spender — secondary. Recognizable labels stay visible while raw
            address controls move into the same on-demand disclosure used by
            transaction counterparties. Unlabeled spenders remain explicit. */}
        <Box
          w="full"
          py={2}
          px={3}
          borderTop="1px solid"
          borderColor="border.subtle"
        >
          <HStack
            justify="space-between"
            align="flex-start"
            spacing={2}
          >
            <Text
              fontSize="2xs"
              color="text.secondary"
              fontWeight="700"
              textTransform="uppercase"
              letterSpacing="wider"
              pt={0.5}
            >
              {/* "Spender" stays regardless of direction — the chip above
                  already says revoke vs approve, so a "Revoke From" label
                  here would just stack a third "REVOKE …". */}
              Spender
            </Text>
            {spenderLabel ? (
              <LabeledAddressPopover
                address={approval.spender}
                contextLabel="spender address"
                explorer={explorerUrl}
                label={spenderLabel}
                maxW="200px"
              />
            ) : (
              <AddressActions
                address={approval.spender}
                compact
                contextLabel="spender address"
                explorer={explorerUrl}
              />
            )}
          </HStack>
        </Box>
      </VStack>
    </Box>
  );
}
