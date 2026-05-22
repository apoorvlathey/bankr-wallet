/**
 * ClearSigningView — renders an ERC-7730 descriptor for a tx or EIP-712 message.
 *
 * Mounts in:
 *   - TransactionConfirmation.tsx          (kind="calldata")
 *   - BatchTransactionConfirmation.tsx     (kind="calldata", per call)
 *   - SignatureRequestConfirmation.tsx     (kind="eip712")
 *
 * Returns `null` until a descriptor is resolved and a format matches. Callers
 * pass an `onResolved` callback so they can collapse the raw decoder beneath.
 */

import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Box,
  HStack,
  VStack,
  Text,
  Image,
  IconButton,
  Skeleton,
  Divider,
  Tooltip,
} from "@chakra-ui/react";
import { CopyIcon, CheckIcon, ExternalLinkIcon, ChevronRightIcon, ChevronDownIcon } from "@chakra-ui/icons";
import { blo } from "blo";

import { ThemedCard } from "@/theme/primitives/ThemedCard";
import { useTheme } from "@/theme";
import { getChainConfig } from "@/constants/chainConfig";
import { CHAIN_REGISTRY } from "@/constants/chainRegistry";
import { formatUsd } from "@/lib/currencyFormatUtils";
import { formatAbsoluteTimestamp } from "@/lib/timeFormatUtils";
import { getEthShLabels } from "@/lib/ethShLabelsCache";
import { KNOWN_TOKEN_LOGOS } from "@/chrome/txSimulation";
import type { Account } from "@/chrome/types";
import { useEnsIdentities } from "@/hooks/useEnsIdentities";
import { useCachedAvatarSrc } from "@/hooks/useCachedAvatarSrc";
import { matchCalldataFormat, matchEip712Format, verifyDeployment } from "@/lib/clearSigning/matchDescriptor";
import { applyFormat, type RenderedField, type RenderedValue } from "@/lib/clearSigning/applyFormat";
import { decodeCalldataForDescriptor } from "@/lib/clearSigning/decodeForDescriptor";
import { resolveDescriptor } from "@/lib/clearSigning/resolver";
import { getBuiltinCalldataDescriptor } from "@/lib/clearSigning/builtinDescriptors";
import type { Erc7730Descriptor } from "@/lib/clearSigning/types";
import { useScreenEntered } from "@/components/ScreenTransition";
import { decodeRecursive } from "@/lib/decoder";
import { renderParams } from "@/components/renderParams";
import type { DecodeRecursiveResult } from "@/lib/decoder/types";

interface CalldataProps {
  kind: "calldata";
  chainId: number;
  to: string;
  calldata: string;
}

interface Eip712Props {
  kind: "eip712";
  chainId: number;
  verifyingContract: string;
  typedData: {
    primaryType: string;
    types: Record<string, Array<{ name: string; type: string }>>;
    message: Record<string, unknown>;
  };
}

export type ClearSigningViewProps = (CalldataProps | Eip712Props) & {
  /**
   * Called once when the view determines whether it has anything to render.
   * Parent can use this to collapse the raw decoder when `matched` is true.
   */
  onResolved?: (matched: boolean) => void;
  /**
   * When true, render nothing during descriptor resolution instead of the
   * default skeleton card. Used by the batch summary view where we mount one
   * `ClearSigningView` per call — most won't match, so the skeletons would
   * appear briefly only to disappear. Quiet by default for parents that want
   * to keep their layout stable until something is actually known.
   */
  hideLoadingSkeleton?: boolean;
  /**
   * Recursion depth — incremented each time a `calldata`-format field renders
   * a nested ClearSigningView for an embedded inner call. Capped at
   * MAX_NESTED_DEPTH to prevent runaway descriptors from melting the wallet.
   * Top-level callers leave this undefined (treated as 0).
   */
  depth?: number;
};

/**
 * Maximum nesting for embedded `calldata` fields. 3 covers realistic patterns
 * (Safe → Multicall → ERC-20) without letting a pathological descriptor recurse
 * indefinitely. Anything deeper falls back to the raw-bytes card.
 */
const MAX_NESTED_DEPTH = 3;

interface MatchedState {
  descriptor: Erc7730Descriptor;
  fields: RenderedField[];
  intent: string;
  ownerName?: string;
}

export function ClearSigningView(props: ClearSigningViewProps) {
  const { kind, chainId, hideLoadingSkeleton } = props;
  const depth = props.depth ?? 0;
  const lookupAddress = kind === "calldata" ? props.to : props.verifyingContract;
  // Midnight's luminous card shadows stack visibly when 2+ clear-signing
  // cards nest (outer → "Batched calls" → inner "Approve token"). At depth
  // > 0 we drop the shadow so the border + accentTint bg do the lifting
  // alone — keeps deeply-nested confirmations from looking like a glow
  // tower. Bauhaus's hard shadows are part of the aesthetic so we leave
  // them alone there.
  const { themeId } = useTheme();
  const cardShadow =
    depth > 0 && themeId === "midnight" ? "none" : undefined;
  const [loading, setLoading] = useState(true);
  const [state, setState] = useState<MatchedState | null>(null);
  const { onResolved } = props;

  // Stable signature for the effect dependency array — re-run whenever the
  // payload we'd render against changes.
  const calldataValue = kind === "calldata" ? props.calldata : "";
  const typedDataKey =
    kind === "eip712"
      ? `${props.typedData?.primaryType || ""}:${JSON.stringify(props.typedData?.message || {})}`
      : "";

  // Defer the descriptor fetch + ABI decode until the surrounding screen
  // has finished animating in. The resolved match flips a sibling raw
  // CalldataDecoder collapse/expand, so running it mid-animation visibly
  // jitters the slide.
  const screenEntered = useScreenEntered();

  useEffect(() => {
    if (!screenEntered) return;
    let cancelled = false;
    setLoading(true);
    setState(null);

    const tag = `[clear-signing] ${kind} ${chainId}:${lookupAddress}`;

    (async () => {
      console.log(`${tag} → resolving descriptor…`);
      const { descriptor: remoteDescriptor, enabled } = await resolveDescriptor({
        chainId,
        address: lookupAddress,
        kind,
      });

      if (cancelled) return;
      if (!enabled) {
        console.log(`${tag} ✗ feature disabled in settings`);
        setLoading(false);
        onResolved?.(false);
        return;
      }

      // Try the remote descriptor first; fall back to a built-in generic
      // descriptor (ERC-20 transfer, etc.) when there's no remote entry or
      // the remote entry doesn't cover this selector. Built-ins are only
      // available for calldata, not eip712.
      let descriptor: Erc7730Descriptor | null = remoteDescriptor;
      let matched =
        descriptor &&
        verifyDeployment(descriptor, kind, chainId, lookupAddress)
          ? kind === "calldata"
            ? matchCalldataFormat(descriptor, props.calldata)
            : matchEip712Format(descriptor, props.typedData)
          : null;

      if (descriptor) {
        console.log(`${tag} ✓ remote descriptor loaded`, descriptor);
      } else {
        console.log(`${tag} ✗ no remote descriptor (404 / not in registry)`);
      }

      if (!matched && kind === "calldata") {
        const builtin = getBuiltinCalldataDescriptor(chainId, lookupAddress, props.calldata);
        if (builtin) {
          const builtinMatch = matchCalldataFormat(builtin, props.calldata);
          if (builtinMatch) {
            console.log(`${tag} ✓ matched built-in descriptor`, builtinMatch.formatKey);
            descriptor = builtin;
            matched = builtinMatch;
          }
        }
      }

      if (!descriptor || !matched) {
        if (kind === "calldata") {
          const selector = props.calldata.slice(0, 10).toLowerCase();
          console.log(`${tag} ✗ no descriptor matches selector ${selector}`);
        } else {
          console.log(
            `${tag} ✗ no descriptor matches primaryType "${props.typedData.primaryType}"`,
          );
        }
        setLoading(false);
        onResolved?.(false);
        return;
      }
      console.log(`${tag} ✓ matched format`, matched.formatKey);

      const data =
        kind === "calldata"
          ? decodeCalldataForDescriptor(matched.formatKey, props.calldata)
          : props.typedData.message;

      if (!data) {
        console.log(
          `${tag} ✗ decode failed for format "${matched.formatKey}" (calldata likely doesn't match the signature ABI)`,
        );
        setLoading(false);
        onResolved?.(false);
        return;
      }
      console.log(`${tag} ✓ decoded data`, data);

      const fields = applyFormat(matched.format, { data, chainId });
      if (fields.length === 0) {
        console.log(`${tag} ✗ applyFormat produced 0 fields`);
        setLoading(false);
        onResolved?.(false);
        return;
      }
      console.log(`${tag} ✓ rendering ${fields.length} field(s)`);

      setState({
        descriptor,
        fields,
        intent: matched.format.intent || matched.format.$id || "",
        ownerName: descriptor.metadata?.owner,
      });
      setLoading(false);
      onResolved?.(true);
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, chainId, lookupAddress, calldataValue, typedDataKey, onResolved, screenEntered]);

  if (loading) {
    if (hideLoadingSkeleton) return null;
    return (
      <ThemedCard
        variant="default"
        weight="thin"
        p={4}
        bg="surface.accentTint"
        boxShadow={cardShadow}
      >
        <Skeleton height="10px" width="35%" mb={2} />
        <Skeleton height="18px" width="70%" mb={3} />
        <VStack align="stretch" spacing={2}>
          <Skeleton height="12px" width="80%" />
          <Skeleton height="12px" width="65%" />
          <Skeleton height="12px" width="75%" />
        </VStack>
      </ThemedCard>
    );
  }

  if (!state) return null;

  // `surface.accentTint` is a step lighter than the default `surface.raised`
  // used by the surrounding cards (ERC20 approval, Origin/From info). Quietly
  // draws the eye to the human-readable intent without a colored wash — neutral
  // whitish lift in Midnight, soft warm cream in Bauhaus.
  return (
    <ThemedCard
      variant="default"
      weight="thin"
      p={3}
      bg="surface.accentTint"
      boxShadow={cardShadow}
    >
      {/* Header — title + small "via Owner" attribution sitting tight on the
          same row. Owner name is the source of the human-readable copy, not a
          safety claim, so it stays muted. */}
      <HStack mb={2} align="baseline" spacing={2}>
        <Text
          fontSize="md"
          color="fg.primary"
          fontWeight="700"
          lineHeight="1.2"
          flex={1}
          minW={0}
        >
          {state.intent || "Action"}
        </Text>
        {state.ownerName && (
          <Text
            fontSize="10px"
            color="fg.muted"
            fontWeight="600"
            flexShrink={0}
            whiteSpace="nowrap"
          >
            via {state.ownerName}
          </Text>
        )}
      </HStack>

      <Divider borderColor="border.default" mb={2.5} />

      <VStack align="stretch" spacing={2}>
        {state.fields.map((field, idx) => (
          <FieldRow
            key={`${field.label}-${idx}`}
            field={field}
            chainId={chainId}
            depth={depth}
          />
        ))}
      </VStack>
    </ThemedCard>
  );
}

interface FieldRowProps {
  field: RenderedField;
  chainId: number;
  /** Current ClearSigningView nesting depth, threaded down for calldata fields. */
  depth: number;
}

function FieldRow({ field, chainId, depth }: FieldRowProps) {
  // Embedded calldata values can't share the label-left / value-right row —
  // each one is a substantial nested card. When this field's values are
  // calldata, render them as a full-width stack with a numbered header per
  // inner call (Safe BatchExecutor-style "1 / 3 — Transaction").
  const calldataValues = field.values.filter(
    (v): v is Extract<RenderedValue, { kind: "calldata" }> => v.kind === "calldata",
  );
  if (calldataValues.length > 0 && calldataValues.length === field.values.length) {
    return (
      <NestedCalldataField
        label={field.label}
        values={calldataValues}
        chainId={chainId}
        depth={depth}
      />
    );
  }

  // Grouped fields (e.g. Permit2 `details.[]` iteration) — each item gets a
  // numbered pill chip + a full-width rule so batched permits read as distinct
  // sections without a nested card-in-card. Single-group case skips the header.
  if (field.groups && field.groups.length > 0) {
    const total = field.groups.length;
    const itemLabel = field.label || "Item";
    return (
      <VStack align="stretch" spacing={3.5}>
        {field.groups.map((group, gi) => (
          <Box key={gi}>
            {total > 1 && (
              <HStack mb={2.5} spacing={2} align="center">
                <HStack
                  spacing={1}
                  px={2}
                  py="2px"
                  borderRadius="full"
                  bg="accent.secondary"
                  flexShrink={0}
                >
                  <Text
                    fontSize="10px"
                    color="accentFg.secondary"
                    fontWeight="800"
                    lineHeight="1.2"
                  >
                    {gi + 1}
                  </Text>
                  <Text
                    fontSize="10px"
                    color="accentFg.secondary"
                    fontWeight="700"
                    opacity={0.75}
                    lineHeight="1.2"
                  >
                    / {total}
                  </Text>
                </HStack>
                <Text
                  fontSize="10px"
                  color="fg.secondary"
                  fontWeight="700"
                  textTransform="uppercase"
                  letterSpacing="0.08em"
                  flexShrink={0}
                >
                  {itemLabel}
                </Text>
                <Box flex={1} h="1px" bg="border.default" />
              </HStack>
            )}
            <VStack align="stretch" spacing={2}>
              {group.map((sub, si) => (
                <FieldRow
                  key={`${sub.label}-${si}`}
                  field={sub}
                  chainId={chainId}
                  depth={depth}
                />
              ))}
            </VStack>
          </Box>
        ))}
      </VStack>
    );
  }

  // Always render label-left / value-right. Addresses display as a short
  // 0x….0x form plus copy + explorer icons — narrow enough to live on the
  // right; long ENS labels wrap inside the value column without breaking
  // the layout because `minW={0}` lets the flex column shrink.
  return (
    <HStack align="start" spacing={3} justify="space-between" w="full">
      <Text
        fontSize="xs"
        color="fg.secondary"
        fontWeight="600"
        flexShrink={0}
        pt="1px"
      >
        {field.label || "—"}
      </Text>
      <Box flex="1" minW={0} textAlign="right">
        {field.values.length === 0 ? (
          <Text fontSize="xs" color="fg.muted">—</Text>
        ) : (
          <VStack align="end" spacing={0.5}>
            {field.values.map((v, i) => (
              <RenderedValueView key={i} value={v} chainId={chainId} />
            ))}
          </VStack>
        )}
      </Box>
    </HStack>
  );
}

function RenderedValueView({ value, chainId }: { value: RenderedValue; chainId: number }) {
  switch (value.kind) {
    case "raw":
      return (
        <Text fontSize="xs" fontFamily="mono" color="fg.primary" wordBreak="break-all">
          {value.text}
        </Text>
      );
    case "address":
      return <AddressInline address={value.address} chainId={chainId} />;
    case "tokenAmount":
      return (
        <TokenAmountInline
          amountRaw={value.amountRaw}
          tokenAddress={value.tokenAddress}
          native={value.native}
          chainId={chainId}
        />
      );
    case "amount":
      return <TokenAmountInline amountRaw={value.amountRaw} native chainId={chainId} />;
    case "date":
      return (
        <Text fontSize="xs" color="fg.primary" fontWeight="600">
          {formatTimestamp(value.timestamp)}
        </Text>
      );
    case "unit": {
      const formatted = formatUnit(value.raw, value.decimals);
      const base = value.base || "";
      return (
        <Text fontSize="xs" fontFamily="mono" color="chart.numeric" fontWeight="600">
          {value.prefix ? `${base}${formatted}` : `${formatted}${base}`}
        </Text>
      );
    }
    case "missing":
      return (
        <Text fontSize="xs" color="fg.muted">
          (missing)
        </Text>
      );
    case "calldata":
      // Calldata values are full-width nested cards handled in FieldRow before
      // reaching this switch (`NestedCalldataField`). Reaching here would mean
      // a stray mixed-kind values array — render nothing to stay safe.
      return null;
  }
}

/**
 * Full-width container for one or more embedded calldata calls. Renders each
 * inner call as a recursive ClearSigningView; when the inner contract has no
 * matching descriptor (or we've hit the depth cap), falls back to a raw card
 * showing callee + value + selector + truncated data so the user still has
 * something legible.
 */
function NestedCalldataField({
  label,
  values,
  chainId,
  depth,
}: {
  label: string;
  values: Array<Extract<RenderedValue, { kind: "calldata" }>>;
  chainId: number;
  depth: number;
}) {
  const total = values.length;
  const headerLabel = label || "Transaction";
  return (
    <VStack align="stretch" spacing={3} w="full">
      {values.map((value, idx) => (
        <Box key={idx}>
          {total > 1 && (
            <HStack mb={2} spacing={2} align="center">
              <HStack
                spacing={1}
                px={2}
                py="2px"
                borderRadius="full"
                bg="accent.secondary"
                flexShrink={0}
              >
                <Text fontSize="10px" color="accentFg.secondary" fontWeight="800" lineHeight="1.2">
                  {idx + 1}
                </Text>
                <Text
                  fontSize="10px"
                  color="accentFg.secondary"
                  fontWeight="700"
                  opacity={0.75}
                  lineHeight="1.2"
                >
                  / {total}
                </Text>
              </HStack>
              <Text
                fontSize="10px"
                color="fg.secondary"
                fontWeight="700"
                textTransform="uppercase"
                letterSpacing="0.08em"
                flexShrink={0}
              >
                {headerLabel}
              </Text>
              <Box flex={1} h="1px" bg="border.default" />
            </HStack>
          )}
          <NestedCalldataCard value={value} chainId={chainId} depth={depth} />
        </Box>
      ))}
    </VStack>
  );
}

function NestedCalldataCard({
  value,
  chainId,
  depth,
}: {
  value: Extract<RenderedValue, { kind: "calldata" }>;
  chainId: number;
  depth: number;
}) {
  // `null` = inner ClearSigningView is still resolving. `true` = matched (the
  // inner card paints itself); `false` = no descriptor matched (we show the
  // raw fallback below). Depth-capped branches skip the recursive mount and
  // jump straight to the fallback so we don't burn lookups on a tree that's
  // already too deep to be useful.
  const [matched, setMatched] = useState<boolean | null>(null);
  const canRecurse = depth < MAX_NESTED_DEPTH;

  if (!canRecurse) {
    return <RawNestedCalldataFallback value={value} chainId={chainId} />;
  }

  return (
    <>
      <ClearSigningView
        kind="calldata"
        chainId={chainId}
        to={value.callee}
        calldata={value.data}
        depth={depth + 1}
        onResolved={setMatched}
        hideLoadingSkeleton
      />
      {matched === false && <RawNestedCalldataFallback value={value} chainId={chainId} />}
    </>
  );
}

/**
 * Shown when an inner embedded call has no descriptor (or we've hit the
 * recursion cap). Renders as flat field rows (To / Value / Selector / Data)
 * with a thin left-border accent so it reads as a continuation of the parent
 * card rather than its own mini-card. No header, no "no descriptor" badge —
 * the rows speak for themselves; jargon noise just makes the parent louder.
 */
function RawNestedCalldataFallback({
  value,
  chainId,
}: {
  value: Extract<RenderedValue, { kind: "calldata" }>;
  chainId: number;
}) {
  const showValue =
    value.amount !== undefined && value.amount !== null && value.amount !== "0";
  const hasCalldata = value.data && value.data.length >= 10;
  return (
    <Box
      pl={3}
      borderLeft="2px solid"
      borderLeftColor="border.default"
      // No right/bottom padding — left rail is the only visual treatment, so
      // the rows align flush with the rest of the parent's column.
    >
      <VStack align="stretch" spacing={2}>
        <NestedFallbackRow label="To">
          <AddressInline address={value.callee} chainId={chainId} />
        </NestedFallbackRow>
        {showValue && value.amount && (
          <NestedFallbackRow label="Value">
            <TokenAmountInline amountRaw={value.amount} native chainId={chainId} />
          </NestedFallbackRow>
        )}
        {/* Inline calldata row — keeps the label-left / value-right rhythm
            of "To" / "Value" above. Left: literal "Calldata". Right: the
            decoded function name as a pill + expand chevron. Expanding
            unfurls a quiet param list below the row. Function-name lookup
            uses `decodeRecursive`, so Safe MultiSend / 4byte / on-chain ABI
            all just work. */}
        {hasCalldata && (
          <InlineCalldataRow
            calldata={value.data}
            to={value.callee}
            chainId={chainId}
          />
        )}
      </VStack>
    </Box>
  );
}

function NestedFallbackRow({
  label,
  children,
  alignTop,
}: {
  label: string;
  children: ReactNode;
  alignTop?: boolean;
}) {
  return (
    <HStack align={alignTop ? "start" : "center"} spacing={3} justify="space-between" w="full">
      <Text
        fontSize="xs"
        color="fg.secondary"
        fontWeight="600"
        flexShrink={0}
        pt={alignTop ? "1px" : 0}
      >
        {label}
      </Text>
      <Box flex="1" minW={0} textAlign="right">
        {children}
      </Box>
    </HStack>
  );
}

/**
 * Compact inline calldata viewer used inside the nested-call fallback. Mimics
 * the parent's label-left / value-right row when collapsed (label "Calldata",
 * right side = function-name pill + chevron). Click expands a quiet param
 * list directly below the row — no card chrome, no tabs, no copy button (the
 * outer "Show raw details" already covers those). Phase 1 / 2 decode mirrors
 * `CalldataDecoder`: instant local decode by selector, then upgrade with
 * ABI-lookup if it yields better param names.
 */
function InlineCalldataRow({
  calldata,
  to,
  chainId,
}: {
  calldata: string;
  to: string;
  chainId: number;
}) {
  const [result, setResult] = useState<DecodeRecursiveResult>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!calldata || calldata === "0x") return;
    let cancelled = false;
    (async () => {
      try {
        const local = await decodeRecursive({ calldata });
        if (cancelled) return;
        if (local?.functionName) setResult(local);
        // Background ABI upgrade for better param names. We don't gate the
        // collapsed pill on this — the local decode is enough for the
        // function name; ABI just enriches the expanded params.
        try {
          const withAbi = await decodeRecursive({ calldata, address: to, chainId });
          if (!cancelled && withAbi?.functionName) {
            setResult((prev) => {
              if (!prev) return withAbi;
              const localBetter = prev.args.some(
                (a) => a.name && !/^arg\d+$/.test(a.name),
              );
              return localBetter ? prev : withAbi;
            });
          }
        } catch {
          // keep local result
        }
      } catch {
        // selector unknown — fall back to "Unknown" pill below
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [calldata, to, chainId]);

  const fnName = result?.functionName;
  const selector = calldata.slice(0, 10).toLowerCase();
  const canExpand = !!result?.args?.length;

  return (
    <Box>
      <HStack align="center" spacing={3} justify="space-between" w="full">
        <Text fontSize="xs" color="fg.secondary" fontWeight="600" flexShrink={0}>
          Calldata
        </Text>
        <HStack spacing={1} flex="1" minW={0} justify="flex-end">
          {fnName ? (
            <Box
              as={canExpand ? "button" : "div"}
              onClick={canExpand ? () => setExpanded((v) => !v) : undefined}
              cursor={canExpand ? "pointer" : "default"}
              px={2}
              py="2px"
              borderRadius="md"
              bg="accent.secondary"
              _hover={canExpand ? { opacity: 0.85 } : undefined}
            >
              <Text
                fontSize="2xs"
                fontFamily="mono"
                color="accentFg.secondary"
                fontWeight="800"
                lineHeight="1.4"
                noOfLines={1}
              >
                {fnName}
              </Text>
            </Box>
          ) : (
            <Text fontSize="xs" fontFamily="mono" color="chart.numeric" fontWeight="600">
              {selector}
            </Text>
          )}
          {canExpand && (
            <IconButton
              aria-label={expanded ? "Hide params" : "Show params"}
              icon={
                expanded ? (
                  <ChevronDownIcon boxSize="14px" />
                ) : (
                  <ChevronRightIcon boxSize="14px" />
                )
              }
              size="xs"
              variant="ghost"
              minW="18px"
              h="18px"
              color="fg.muted"
              onClick={() => setExpanded((v) => !v)}
            />
          )}
        </HStack>
      </HStack>
      {expanded && result?.args && (
        <Box mt={2} pl={2} borderLeft="1px solid" borderLeftColor="border.subtle">
          <VStack align="stretch" spacing={1.5}>
            {result.args.map((arg, i) => renderParams(i, arg, chainId))}
          </VStack>
        </Box>
      )}
    </Box>
  );
}

function AddressInline({ address, chainId }: { address: string; chainId: number }) {
  const [account, setAccount] = useState<Account | null>(null);
  const [externalLabel, setExternalLabel] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const addresses = useMemo(() => [address], [address]);
  const { identities } = useEnsIdentities(addresses);
  const ens = identities.get(address.toLowerCase());
  const cachedAvatar = useCachedAvatarSrc(ens?.avatar);

  const explorerUrl = useMemo(() => {
    const config = getChainConfig(chainId);
    return config?.explorer ? `${config.explorer}/address/${address}` : null;
  }, [address, chainId]);

  // User-account lookup — if this address belongs to one of the user's saved
  // wallets we'll show its displayName + the FromAccountDisplay-style avatar
  // instead of the bare 0x form.
  useEffect(() => {
    if (!address?.startsWith("0x")) return;
    let cancelled = false;
    chrome.runtime.sendMessage(
      { type: "getAccounts" },
      (accounts: Account[] | null) => {
        if (cancelled) return;
        if (!accounts) return;
        const match = accounts.find(
          (a) => a.address.toLowerCase() === address.toLowerCase(),
        );
        setAccount(match || null);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [address]);

  // External label (eth.sh) — only meaningful for addresses that are *not* one
  // of the user's accounts (Permit2, routers, etc.). Skip the fetch when the
  // account lookup has matched to keep noise out of the network panel.
  useEffect(() => {
    if (!address?.startsWith("0x")) return;
    if (account) return;
    let cancelled = false;
    getEthShLabels(address, chainId).then((labels) => {
      if (cancelled) return;
      if (labels.length > 0) setExternalLabel(labels[0]);
    });
    return () => {
      cancelled = true;
    };
  }, [address, chainId, account]);

  const short = `${address.slice(0, 6)}...${address.slice(-4)}`;
  const primaryLabel = account?.displayName || ens?.name || null;

  // Avatar selection mirrors FromAccountDisplay's hierarchy so wallet
  // accounts feel identical across surfaces: ENS avatar > Bankr icon for
  // Bankr-typed accounts > blockie. External addresses skip the avatar
  // entirely (we don't want to fabricate identity for strangers).
  const avatar = (() => {
    if (ens?.avatar) {
      return (
        <Image
          src={cachedAvatar || ens.avatar}
          alt="ENS avatar"
          boxSize="22px"
          minW="22px"
          borderRadius="full"
          objectFit="cover"
          border="1px solid"
          borderColor="border.subtle"
        />
      );
    }
    if (account?.type === "bankr") {
      return (
        <Image
          src="/bankr-icon.png"
          alt="Bankr account"
          boxSize="22px"
          minW="22px"
          borderRadius="sm"
          border="1px solid"
          borderColor="border.subtle"
        />
      );
    }
    if (account) {
      return (
        <Image
          src={blo(address as `0x${string}`)}
          alt="Account avatar"
          boxSize="22px"
          minW="22px"
          borderRadius="sm"
          border="1px solid"
          borderColor="border.subtle"
        />
      );
    }
    return null;
  })();

  const copyButton = (
    <IconButton
      aria-label="Copy"
      icon={copied ? <CheckIcon boxSize="10px" /> : <CopyIcon boxSize="10px" />}
      size="xs"
      variant="ghost"
      minW="14px"
      h="14px"
      color={copied ? "accent.highlight" : "fg.muted"}
      onClick={async () => {
        await navigator.clipboard.writeText(address);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
    />
  );

  const explorerButton = explorerUrl ? (
    <IconButton
      aria-label="Open in explorer"
      icon={<ExternalLinkIcon boxSize="10px" />}
      size="xs"
      variant="ghost"
      minW="14px"
      h="14px"
      color="fg.muted"
      onClick={() => window.open(explorerUrl, "_blank")}
    />
  ) : null;

  // When we have a primary label, render two stacked rows right-aligned:
  //   row 1: avatar + resolved name + copy/explorer icons (the action row)
  //   row 2: short 0x… form alone (quiet reference)
  // Icons live with the name so the user's eye lands on the recognizable
  // identity + actions together; the raw hex hangs below as supporting info.
  if (primaryLabel) {
    return (
      <VStack align="end" spacing={0.5}>
        <HStack spacing={1.5} align="center">
          {avatar}
          <Text fontSize="xs" color="fg.primary" fontWeight="700" noOfLines={1}>
            {primaryLabel}
          </Text>
          {/* Inner HStack with spacing=0 — keeps copy + explorer visually
              paired without inheriting the parent row's 1.5 gap. */}
          <HStack spacing={0} align="center">
            {copyButton}
            {explorerButton}
          </HStack>
        </HStack>
        <Text fontSize="2xs" color="fg.muted" fontFamily="mono" noOfLines={1}>
          {short}
        </Text>
      </VStack>
    );
  }

  // External address. When there's no eth.sh label, render a single inline
  // row (short 0x… + actions). When a label is present, stack it BELOW the
  // address so long contract names (e.g. "Uniswap V3 SwapRouter02") wrap
  // freely without pushing the action icons off the row.
  if (externalLabel) {
    return (
      <VStack align="end" spacing={0.5}>
        <HStack spacing={1} align="center" justify="flex-end">
          <Text fontSize="xs" fontFamily="mono" color="accent.secondary" fontWeight="600">
            {short}
          </Text>
          <HStack spacing={0} align="center">
            {copyButton}
            {explorerButton}
          </HStack>
        </HStack>
        <Text
          fontSize="10px"
          color="fg.secondary"
          fontWeight="700"
          textAlign="right"
          // Hard-wrap on word boundary; long labels span up to two lines and
          // then truncate. Keeps the field row from ballooning vertically.
          noOfLines={2}
          wordBreak="break-word"
        >
          {externalLabel}
        </Text>
      </VStack>
    );
  }

  return (
    <HStack spacing={1} align="center" justify="flex-end">
      <Text fontSize="xs" fontFamily="mono" color="accent.secondary" fontWeight="600">
        {short}
      </Text>
      <HStack spacing={0} align="center">
        {copyButton}
        {explorerButton}
      </HStack>
    </HStack>
  );
}

// Sentinels treated as "unlimited" approvals. uint256 is the standard ERC-20
// approve max; uint160 is Permit2's AllowanceTransfer max (its amount field is
// uint160, not uint256).
const MAX_UINT256 = (1n << 256n) - 1n;
const MAX_UINT160 = (1n << 160n) - 1n;

interface TokenInfo {
  symbol: string;
  decimals: number;
  logoUrl?: string;
}

function formatUsdValue(amountRaw: string, decimals: number, priceUsd: number): string | null {
  if (!priceUsd || priceUsd <= 0) return null;
  let big: bigint;
  try {
    big = BigInt(amountRaw);
  } catch {
    return null;
  }
  // Skip "unlimited" approvals — a USD value on max-uint is meaningless.
  // Permit2's AllowanceTransfer uses uint160, so its sentinel is 2^160-1, not
  // 2^256-1; treat both as unlimited.
  if (big === MAX_UINT256 || big === MAX_UINT160) return null;
  const neg = big < 0n;
  if (neg) big = -big;
  // Compute amount * price using JS number after scaling decimals; tokens here
  // have realistic magnitudes so precision loss is acceptable for display.
  const divisor = 10n ** BigInt(decimals);
  const whole = Number(big / divisor);
  const frac = Number(big % divisor) / Number(divisor);
  const value = (neg ? -1 : 1) * (whole + frac) * priceUsd;
  if (value === 0) return null;
  return formatUsd(value);
}

/**
 * Headline amount text. When the raw value is a max-uint sentinel
 * (uint256 or Permit2's uint160), shows "unlimited" but lets the user
 * hover to see the precise amount the contract is actually approved for.
 */
function AmountText({
  amountRaw,
  decimals,
  symbol,
}: {
  amountRaw: string;
  decimals: number;
  symbol: string;
}) {
  const unlimited = isUnlimitedAmount(amountRaw);
  const text = (
    <Text fontSize="lg" color="fg.primary" fontWeight="700" lineHeight="1.1">
      {formatUnit(amountRaw, decimals)}
    </Text>
  );
  if (!unlimited) return text;
  return (
    <Tooltip
      label={`${formatUnitFull(amountRaw, decimals)} ${symbol}`}
      placement="top"
      hasArrow
      openDelay={150}
    >
      {/* Box wrapper so the tooltip can fire on touch / focus without
          requiring the Text itself to forward refs. */}
      <Box as="span" cursor="help" borderBottom="1px dotted" borderColor="fg.muted">
        {text}
      </Box>
    </Tooltip>
  );
}

function TokenLogo({ src, alt }: { src?: string; alt: string }) {
  // Same data-URL cache used by ENS avatars + batch inline summary. After
  // first paint the logo renders synchronously from chrome.storage on every
  // reopen — no network roundtrip.
  const cached = useCachedAvatarSrc(src);
  const resolved = cached || src;
  if (!resolved) return null;
  return (
    <Image
      src={resolved}
      alt={alt}
      boxSize="20px"
      borderRadius="full"
      fallback={<Box boxSize="20px" borderRadius="full" bg="bg.muted" />}
    />
  );
}

function TokenAmountInline({
  amountRaw,
  tokenAddress,
  native,
  chainId,
}: {
  amountRaw: string;
  tokenAddress?: string;
  native?: boolean;
  chainId: number;
}) {
  const [info, setInfo] = useState<TokenInfo | null>(null);
  const [priceUsd, setPriceUsd] = useState<number>(0);

  useEffect(() => {
    if (native || !tokenAddress) return;
    let cancelled = false;
    // Resolve metadata + logo from three sources in parallel:
    //   1. onchain ERC-20 (canonical symbol / decimals — always works)
    //   2. CoinGecko swap list (best logo source for popular tokens)
    //   3. user's customTokens storage (logos for watchAsset-added tokens
    //      that CoinGecko doesn't index)
    // KNOWN_TOKEN_LOGOS is the final hardcoded fallback.
    const infoPromise = new Promise<{
      success: boolean;
      data?: { symbol: string; decimals: number };
    }>((resolve) => {
      chrome.runtime.sendMessage(
        { type: "fetchTokenInfo", tokenAddress, chainId },
        resolve,
      );
    });
    const listPromise = new Promise<{
      success: boolean;
      data?: Array<{ address: string; logoURI: string }>;
    }>((resolve) => {
      chrome.runtime.sendMessage(
        { type: "fetchSwapTokenList", chainId },
        resolve,
      );
    });
    const customPromise = new Promise<{
      success: boolean;
      data?: { symbol: string; decimals: number; image?: string } | null;
    }>((resolve) => {
      chrome.runtime.sendMessage(
        { type: "lookupCustomToken", tokenAddress, chainId },
        resolve,
      );
    });

    Promise.all([infoPromise, listPromise, customPromise]).then(
      ([infoRes, listRes, customRes]) => {
        if (cancelled) return;
        const addrLower = tokenAddress.toLowerCase();
        const listEntry = listRes?.data?.find(
          (t) => t.address.toLowerCase() === addrLower,
        );
        const custom = customRes?.data || null;

        // Symbol/decimals: prefer onchain → fall back to custom-token entry
        // (works even if the RPC read failed for some reason).
        const symbol = infoRes?.data?.symbol ?? custom?.symbol;
        const decimals = infoRes?.data?.decimals ?? custom?.decimals;
        if (symbol === undefined || decimals === undefined) return;

        setInfo({
          symbol,
          decimals,
          // Logo priority: swap list → custom token's stored image →
          // hardcoded fallback. Swap list is highest-quality when present.
          logoUrl:
            listEntry?.logoURI ||
            custom?.image ||
            KNOWN_TOKEN_LOGOS[addrLower] ||
            undefined,
        });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [tokenAddress, chainId, native]);

  // USD price resolution — uses the same cached CoinGecko handlers that power
  // the portfolio (5-min storage cache), so when a token is already in the
  // user's portfolio this is a free read.
  useEffect(() => {
    let cancelled = false;
    if (native) {
      const entry = CHAIN_REGISTRY.find((c) => c.chainId === chainId);
      if (!entry) return;
      chrome.runtime.sendMessage(
        {
          type: "resolveCoinGeckoNativeAssets",
          requests: [
            {
              chainId,
              chainName: entry.name,
              nativeCurrencyName: entry.nativeCurrency.name,
              symbol: entry.nativeCurrency.symbol,
            },
          ],
        },
        (res: { success: boolean; data?: Array<{ priceUsd: number }> }) => {
          if (cancelled) return;
          const p = res?.data?.[0]?.priceUsd;
          if (p && p > 0) setPriceUsd(p);
        },
      );
    } else if (tokenAddress && /^0x[a-fA-F0-9]{40}$/.test(tokenAddress)) {
      chrome.runtime.sendMessage(
        {
          type: "resolveCoinGeckoErc20Prices",
          requests: [{ chainId, contractAddress: tokenAddress.toLowerCase() }],
        },
        (res: { success: boolean; data?: Array<{ priceUsd: number }> }) => {
          if (cancelled) return;
          const p = res?.data?.[0]?.priceUsd;
          if (p && p > 0) setPriceUsd(p);
        },
      );
    }
    return () => {
      cancelled = true;
    };
  }, [tokenAddress, chainId, native]);

  // Friendly amount color: `fg.primary` (white in Midnight, black in Bauhaus).
  // Bumped to `lg` size — token amounts are the headline value the user needs
  // to see at a glance. Logo and symbol scale up alongside so the trio reads
  // as a single confident unit instead of three timid tokens.
  if (native) {
    const entry = CHAIN_REGISTRY.find((c) => c.chainId === chainId);
    const symbol = entry?.nativeCurrency.symbol || "ETH";
    const decimals = entry?.nativeCurrency.decimals ?? 18;
    const usd = formatUsdValue(amountRaw, decimals, priceUsd);
    return (
      <VStack spacing={0} align="flex-end">
        <HStack spacing={2} justify="flex-end" align="center">
          <AmountText
            amountRaw={amountRaw}
            decimals={decimals}
            symbol={symbol}
          />
          <Text fontSize="sm" color="fg.secondary" fontWeight="600">
            {symbol}
          </Text>
        </HStack>
        {usd && (
          <Text
            fontSize="sm"
            color="fg.secondary"
            fontWeight="700"
            lineHeight="1.2"
            mt={0.5}
          >
            {usd}
          </Text>
        )}
      </VStack>
    );
  }

  if (!info) {
    return (
      <Text fontSize="sm" fontFamily="mono" color="fg.muted">
        {amountRaw}
      </Text>
    );
  }

  const usd = formatUsdValue(amountRaw, info.decimals, priceUsd);
  return (
    <VStack spacing={0} align="flex-end">
      <HStack spacing={2} justify="flex-end" align="center">
        <AmountText
          amountRaw={amountRaw}
          decimals={info.decimals}
          symbol={info.symbol}
        />
        <TokenLogo src={info.logoUrl} alt={info.symbol} />
        <Text fontSize="sm" color="fg.secondary" fontWeight="600">
          {info.symbol}
        </Text>
      </HStack>
      {usd && (
        <Text fontSize="xs" color="fg.muted" fontWeight="500">
          {usd}
        </Text>
      )}
    </VStack>
  );
}

function isUnlimitedAmount(raw: string): boolean {
  try {
    const big = BigInt(raw);
    return big === MAX_UINT256 || big === MAX_UINT160;
  } catch {
    return false;
  }
}

function formatUnit(raw: string, decimals: number): string {
  if (decimals <= 0) return raw;
  let big: bigint;
  try {
    big = BigInt(raw);
  } catch {
    return raw;
  }
  if (big === MAX_UINT256 || big === MAX_UINT160) return "unlimited";
  const neg = big < 0n;
  if (neg) big = -big;
  const divisor = 10n ** BigInt(decimals);
  const whole = big / divisor;
  const frac = big % divisor;
  if (frac === 0n) return `${neg ? "-" : ""}${whole.toString()}`;
  let fracStr = frac.toString().padStart(decimals, "0").replace(/0+$/, "");
  // Cap to 8 fractional digits for display sanity.
  if (fracStr.length > 8) fracStr = fracStr.slice(0, 8);
  return `${neg ? "-" : ""}${whole.toString()}.${fracStr}`;
}

// Full-precision rendering used in the tooltip when we collapse a max-uint
// sentinel to "unlimited" — the user can still inspect what the contract will
// actually receive. Adds thousand separators to the whole part and keeps every
// fractional digit (no 8-digit cap).
function formatUnitFull(raw: string, decimals: number): string {
  let big: bigint;
  try {
    big = BigInt(raw);
  } catch {
    return raw;
  }
  const neg = big < 0n;
  if (neg) big = -big;
  if (decimals <= 0) {
    const s = big.toString();
    return `${neg ? "-" : ""}${s.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
  }
  const divisor = 10n ** BigInt(decimals);
  const whole = big / divisor;
  const frac = big % divisor;
  const wholeStr = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  if (frac === 0n) return `${neg ? "-" : ""}${wholeStr}`;
  const fracStr = frac.toString().padStart(decimals, "0").replace(/0+$/, "");
  return `${neg ? "-" : ""}${wholeStr}.${fracStr}`;
}

const formatTimestamp = (ts: number): string =>
  formatAbsoluteTimestamp(ts, { includeYear: true, separator: " · " });
