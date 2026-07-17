import { useState, useEffect, useMemo, useRef, memo } from "react";
import {
  Box,
  VStack,
  HStack,
  Text,
  Button,
  Checkbox,
  Image,
  IconButton,
  Spinner,
} from "@chakra-ui/react";
import {
  ArrowBackIcon,
  ExternalLinkIcon,
} from "@chakra-ui/icons";
import { blo } from "blo";
import { useEnsIdentities } from "@/hooks/useEnsIdentities";
import { useCachedAvatarSrc } from "@/hooks/useCachedAvatarSrc";
import { useAddressContactLabelMap } from "@/hooks/useAddressContacts";
import { fetchPortfolio } from "@/chrome/portfolio/api";
import { formatUsd } from "@/lib/currencyFormatUtils";
import { truncateAddress } from "@/lib/addressUtils";
import { CopyButton } from "./CopyButton";
import {
  AppHeader,
  AppScreen,
  ListSurface,
  ScreenBody,
  StickyActionBar,
} from "@/components/ui";

export type PickerSource =
  | { kind: "mnemonic"; mnemonic: string }
  | {
      kind: "existingGroup";
      seedGroupId: string;
      existingIndices: number[];
    };

interface PreviewItem {
  index: number;
  address: string;
  exists: boolean;
}

interface SeedAddressPickerProps {
  title: string;
  source: PickerSource;
  /** Submit handler — receives sorted, deduped, NEW indices only (existing/locked ones are filtered out). */
  onSubmit: (indices: number[]) => Promise<void>;
  onBack: () => void;
  submitLabel?: (count: number) => string;
  /** True while the parent is processing onSubmit (so the button shows a spinner). */
  isSubmitting: boolean;
  /** Optional render slot above the address list (e.g. a help blurb). */
  intro?: React.ReactNode;
  /** Layout: onboarding (no scroll wrapper, fixed width) vs settings (full-height, scrollable). */
  variant?: "onboarding" | "panel";
}

const INITIAL_PAGE_SIZE = 5;
const LOAD_MORE_PAGE_SIZE = 5;
const MAX_PER_FETCH = 20;

function EnsAvatarImg({ src }: { src: string }) {
  const cached = useCachedAvatarSrc(src);
  return (
    <Image
      src={cached || src}
      alt="ENS avatar"
      w="24px"
      h="24px"
      minW="24px"
      borderRadius="full"
      border="1px solid"
      borderColor="border.default"
      objectFit="cover"
    />
  );
}

function BlockieAvatarImg({ address }: { address: string }) {
  const src = useMemo(() => blo(address as `0x${string}`), [address]);
  return (
    <Image
      src={src}
      alt="Account avatar"
      w="24px"
      h="24px"
      minW="24px"
      borderRadius="full"
      border="1px solid"
      borderColor="border.default"
    />
  );
}

function AddressRow({
  item,
  resolvedName,
  ensAvatar,
  portfolioState,
  checked,
  locked,
  onToggle,
}: {
  item: PreviewItem;
  resolvedName: string | null;
  ensAvatar: string | null;
  portfolioState: { loading: boolean; value: number | null; error: boolean };
  checked: boolean;
  /** Locked rows can't be toggled (already-added accounts in existing-group mode). */
  locked: boolean;
  onToggle: () => void;
}) {
  const short = truncateAddress(item.address);
  const primary = resolvedName || short;
  const showAddrLine = !!resolvedName;

  return (
    <HStack
      minH="68px"
      bg={checked && !locked ? "surface.raisedHover" : "transparent"}
      borderBottom="1px solid"
      borderColor="border.subtle"
      _last={{ borderBottomWidth: 0 }}
      px={3}
      py={3}
      spacing={3}
      align="center"
      opacity={locked ? 0.6 : 1}
      cursor={locked ? "not-allowed" : "pointer"}
      role="checkbox"
      aria-checked={checked}
      aria-disabled={locked || undefined}
      tabIndex={locked ? -1 : 0}
      onClick={() => {
        if (!locked) onToggle();
      }}
      onKeyDown={(event) => {
        if (!locked && (event.key === "Enter" || event.key === " ")) {
          event.preventDefault();
          onToggle();
        }
      }}
      _hover={locked ? undefined : { bg: "surface.raisedHover" }}
      _focusVisible={{ boxShadow: "inset 0 0 0 2px var(--chakra-colors-border-focus)" }}
    >
      <Checkbox
        variant="commitment"
        isChecked={checked}
        isDisabled={locked}
        onChange={onToggle}
        pointerEvents="none"
      />

      {ensAvatar ? (
        <EnsAvatarImg src={ensAvatar} />
      ) : (
        <BlockieAvatarImg address={item.address} />
      )}

      <VStack align="start" spacing={0} flex={1} minW={0}>
        <HStack spacing={2} w="full" align="baseline">
          <Text
            fontSize="sm"
            fontWeight="700"
            color="text.primary"
            fontFamily={resolvedName ? undefined : "mono"}
            noOfLines={1}
            flex={1}
            minW={0}
            title={resolvedName ? `${primary} · ${item.address}` : item.address}
          >
            {primary}
          </Text>
        </HStack>
        <HStack spacing={1} w="full" align="center">
          <Text
            fontSize="10px"
            color="text.tertiary"
            fontWeight="700"
            textTransform="uppercase"
            letterSpacing="wide"
            flexShrink={0}
          >
            #{item.index}
            {locked ? " · added" : ""}
          </Text>
          {showAddrLine && (
            <Text
              fontSize="10px"
              color="text.tertiary"
              fontFamily="mono"
              fontWeight="600"
              noOfLines={1}
              flex={1}
              minW={0}
            >
              {short}
            </Text>
          )}
        </HStack>
      </VStack>

      <VStack align="end" spacing={1} flexShrink={0}>
        <Box minH="18px">
          {portfolioState.loading ? (
            <Spinner size="xs" color="text.tertiary" />
          ) : portfolioState.error ? (
            <Text fontSize="xs" color="text.tertiary" fontWeight="600">
              —
            </Text>
          ) : (
            <Text
              fontSize="sm"
              color={
                portfolioState.value && portfolioState.value > 0
                  ? "text.primary"
                  : "text.tertiary"
              }
              fontWeight="800"
            >
              {formatUsd(portfolioState.value ?? 0)}
            </Text>
          )}
        </Box>
        <HStack
          spacing={0}
          onClick={(e) => e.stopPropagation()}
          // Don't propagate clicks to the row toggle handler.
        >
          <CopyButton value={item.address} />
          <IconButton
            aria-label="View on Etherscan"
            icon={<ExternalLinkIcon />}
            size="xs"
            variant="ghost"
            color="text.secondary"
            _hover={{ color: "accent.secondary", bg: "bg.muted" }}
            onClick={(e) => {
              e.stopPropagation();
              chrome.tabs.create({
                url: `https://etherscan.io/address/${item.address}`,
              });
            }}
          />
        </HStack>
      </VStack>
    </HStack>
  );
}

function SeedAddressPicker({
  title,
  source,
  onSubmit,
  onBack,
  submitLabel,
  isSubmitting,
  intro,
  variant = "panel",
}: SeedAddressPickerProps) {
  const existingIndicesSet = useMemo(() => {
    if (source.kind === "existingGroup") {
      return new Set(source.existingIndices);
    }
    return new Set<number>();
  }, [source]);

  // For existing-group mode, the initial fetch covers indices 0..maxExisting+5 so
  // the user sees their already-added accounts in context (without paginating
  // backwards). For new-import mode, it just starts at 0 and pages forward.
  const initialCount = useMemo(() => {
    if (source.kind === "existingGroup") {
      const maxExisting = source.existingIndices.length
        ? Math.max(...source.existingIndices)
        : -1;
      return Math.min(MAX_PER_FETCH, maxExisting + 1 + INITIAL_PAGE_SIZE);
    }
    return INITIAL_PAGE_SIZE;
  }, [source]);

  const [items, setItems] = useState<PreviewItem[]>([]);
  const [selected, setSelected] = useState<Set<number>>(() => {
    // Default selection: in mnemonic mode, pre-check index 0 to mirror the
    // legacy single-account import. In existing-group mode, pre-check just
    // the first non-existing index so the "Derive" CTA isn't disabled.
    if (source.kind === "mnemonic") return new Set([0]);
    return new Set();
  });
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Initial fetch
  useEffect(() => {
    let cancelled = false;
    setIsInitialLoading(true);
    setError(null);
    const payload =
      source.kind === "mnemonic"
        ? {
            type: "previewSeedAddresses",
            mnemonic: source.mnemonic,
            start: 0,
            count: initialCount,
          }
        : {
            type: "previewSeedAddresses",
            seedGroupId: source.seedGroupId,
            start: 0,
            count: initialCount,
          };

    chrome.runtime.sendMessage(payload, (response) => {
      if (cancelled) return;
      if (!response?.success || !response.items) {
        setError(response?.error || "Failed to derive addresses");
        setIsInitialLoading(false);
        return;
      }
      setItems(response.items as PreviewItem[]);
      // In existing-group mode, also seed the selection with the first
      // non-existing index so the submit button is immediately actionable.
      if (source.kind === "existingGroup") {
        const firstNew = (response.items as PreviewItem[]).find(
          (it) => !it.exists,
        );
        if (firstNew) setSelected(new Set([firstNew.index]));
      }
      setIsInitialLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [source, initialCount]);

  const handleLoadMore = () => {
    setIsLoadingMore(true);
    setError(null);
    const start = items.length ? items[items.length - 1].index + 1 : 0;
    const payload =
      source.kind === "mnemonic"
        ? {
            type: "previewSeedAddresses",
            mnemonic: source.mnemonic,
            start,
            count: LOAD_MORE_PAGE_SIZE,
          }
        : {
            type: "previewSeedAddresses",
            seedGroupId: source.seedGroupId,
            start,
            count: LOAD_MORE_PAGE_SIZE,
          };
    chrome.runtime.sendMessage(payload, (response) => {
      if (!response?.success || !response.items) {
        setError(response?.error || "Failed to derive more addresses");
        setIsLoadingMore(false);
        return;
      }
      setItems((prev) => [...prev, ...(response.items as PreviewItem[])]);
      setIsLoadingMore(false);
    });
  };

  const toggle = (idx: number, locked: boolean) => {
    if (locked) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const addresses = useMemo(() => items.map((it) => it.address), [items]);

  // ENS resolution for everything currently visible.
  const { identities } = useEnsIdentities(addresses);
  const contactLabels = useAddressContactLabelMap();

  // Portfolio fetch per address — keyed by lowercase address; cancellable
  // on unmount so background fetches don't leak.
  const [portfolio, setPortfolio] = useState<
    Map<string, { loading: boolean; value: number | null; error: boolean }>
  >(new Map());
  const inflightRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const controller = new AbortController();
    addresses.forEach((addr) => {
      const key = addr.toLowerCase();
      if (inflightRef.current.has(key)) return;
      if (portfolio.get(key) && portfolio.get(key)!.value !== null) return;
      inflightRef.current.add(key);
      setPortfolio((prev) => {
        const next = new Map(prev);
        next.set(key, { loading: true, value: null, error: false });
        return next;
      });
      fetchPortfolio(addr, controller.signal)
        .then((res) => {
          setPortfolio((prev) => {
            const next = new Map(prev);
            next.set(key, {
              loading: false,
              value: res.totalValueUsd ?? 0,
              error: false,
            });
            return next;
          });
        })
        .catch((err) => {
          if (controller.signal.aborted) return;
          setPortfolio((prev) => {
            const next = new Map(prev);
            next.set(key, { loading: false, value: null, error: true });
            return next;
          });
          // Don't log AbortError noise
          if (!(err instanceof DOMException && err.name === "AbortError")) {
            console.warn("[seedPicker] portfolio fetch failed", addr, err);
          }
        })
        .finally(() => {
          inflightRef.current.delete(key);
        });
    });
    return () => {
      controller.abort();
    };
  }, [addresses]); // eslint-disable-line react-hooks/exhaustive-deps

  // The submit-eligible set: selected indices MINUS any that are existing/locked.
  const newSelectedIndices = useMemo(
    () =>
      Array.from(selected)
        .filter((i) => !existingIndicesSet.has(i))
        .sort((a, b) => a - b),
    [selected, existingIndicesSet],
  );

  const handleSubmit = async () => {
    if (newSelectedIndices.length === 0) {
      setError("Select at least one new address");
      return;
    }
    setError(null);
    try {
      await onSubmit(newSelectedIndices);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to import addresses",
      );
    }
  };

  const labelFor = submitLabel
    ? submitLabel(newSelectedIndices.length)
    : `Import ${newSelectedIndices.length} account${newSelectedIndices.length === 1 ? "" : "s"}`;

  const pickerBody = (
    <VStack spacing={4} align="stretch">
      {intro}

      {isInitialLoading ? (
        <HStack justify="center" py={8}>
          <Spinner size="md" color="accent.primary" />
        </HStack>
      ) : (
        <ListSurface as="div" role="group" aria-label="Derived addresses">
          {items.map((item) => {
            const lower = item.address.toLowerCase();
            const ens = identities.get(lower);
            const locked = item.exists;
            const checked = selected.has(item.index) || locked;
            const port =
              portfolio.get(lower) ?? {
                loading: true,
                value: null,
                error: false,
              };
            return (
              <AddressRow
                key={item.index}
                item={item}
                resolvedName={contactLabels.get(lower) ?? ens?.name ?? null}
                ensAvatar={ens?.avatar ?? null}
                portfolioState={port}
                checked={checked}
                locked={locked}
                onToggle={() => toggle(item.index, locked)}
              />
            );
          })}
        </ListSurface>
      )}

      {!isInitialLoading && (
        <Button
          variant="ghost"
          w="full"
          onClick={handleLoadMore}
          isLoading={isLoadingMore}
          loadingText="Loading…"
          isDisabled={isSubmitting}
        >
          Show {LOAD_MORE_PAGE_SIZE} more
        </Button>
      )}
    </VStack>
  );

  const action = (
    <VStack spacing={2} align="stretch">
      {error && (
        <Box
          bg="status.error.bg"
          border="1px solid"
          borderColor="status.error.border"
          borderRadius="md"
          p={3}
        >
          <Text fontSize="sm" color="status.error.fg" fontWeight="600" aria-live="polite">
            {error}
          </Text>
        </Box>
      )}
      <Button
        variant="brand"
        w="full"
        onClick={handleSubmit}
        isLoading={isSubmitting}
        loadingText="Importing…"
        isDisabled={newSelectedIndices.length === 0 || isInitialLoading}
      >
        {labelFor}
      </Button>
    </VStack>
  );

  if (variant === "onboarding") {
    return (
      <VStack spacing={6} w="full" maxW="400px" align="stretch">
        <HStack spacing={3}>
        <IconButton
          aria-label="Back"
          icon={<ArrowBackIcon />}
          variant="ghost"
          size="sm"
          onClick={onBack}
          isDisabled={isSubmitting}
        />
        <Text
          fontWeight="700"
          fontSize="md"
          color="fg.primary"
          flex={1}
          textAlign="center"
        >
          {title}
        </Text>
        <Box w="32px" flexShrink={0} />
        </HStack>
        {pickerBody}
        {action}
      </VStack>
    );
  }

  return (
    <AppScreen>
      <AppHeader
        title={title}
        onBack={() => {
          if (!isSubmitting) onBack();
        }}
      />
      <ScreenBody pt={5}>{pickerBody}</ScreenBody>
      <StickyActionBar primaryAction={action} />
    </AppScreen>
  );
}

export default memo(SeedAddressPicker);
