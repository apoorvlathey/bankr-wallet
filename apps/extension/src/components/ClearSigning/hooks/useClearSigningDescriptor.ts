import { useEffect, useMemo, useRef, useState } from "react";

import { CHAIN_REGISTRY } from "@/constants/chainRegistry";
import { useNetworks } from "@/contexts/NetworksContext";
import { getNativeAssetMeta } from "@/lib/chains";
import {
  applyFormat,
  formatRuntimeGuardsPass,
  resolveIntentText,
  runtimeTokenMetadataKey,
} from "@/lib/clearSigning/applyFormat";
import { getBuiltinCalldataDescriptor } from "@/lib/clearSigning/builtinDescriptors";
import { decodeCalldataForDescriptor } from "@/lib/clearSigning/decodeForDescriptor";
import {
  encodeType,
  matchCalldataFormat,
  matchEip712Format,
  verifyDescriptorContext,
} from "@/lib/clearSigning/matchDescriptor";
import { resolveDescriptor } from "@/lib/clearSigning/resolver";
import type { Erc7730Descriptor } from "@/lib/clearSigning/types";
import { resolveTokenMetadataClient } from "@/lib/tokenMetadataClient";
import { useScreenEntered } from "@/components/ScreenTransition";

import {
  collectRuntimeTokenReferences,
  toRuntimeTokenMetadataHint,
} from "../model/runtimeTokenMetadata";
import type { ClearSigningViewProps, MatchedState } from "../types";

/**
 * Resolves, validates, matches, decodes, and applies an ERC-7730 descriptor.
 * The hook intentionally owns the complete asynchronous decision so the view
 * stays quiet until it knows whether a human-readable rendering exists.
 */
export function useClearSigningDescriptor(props: ClearSigningViewProps): {
  loading: boolean;
  state: MatchedState | null;
} {
  const { kind, chainId } = props;
  const lookupAddress =
    kind === "calldata" ? props.to : props.verifyingContract;
  const { networksInfo } = useNetworks();
  const nativeCurrency = useMemo(() => {
    const runtimeNative = getNativeAssetMeta(chainId, networksInfo);
    const builtIn = CHAIN_REGISTRY.find((chain) => chain.chainId === chainId);
    const symbol =
      runtimeNative?.symbol || builtIn?.nativeCurrency.symbol || "ETH";
    const decimals =
      runtimeNative?.decimals ?? builtIn?.nativeCurrency.decimals ?? 18;
    return { symbol, decimals };
  }, [chainId, networksInfo]);
  const [loading, setLoading] = useState(true);
  const [state, setState] = useState<MatchedState | null>(null);
  const { onResolved } = props;
  const onResolvedRef = useRef(onResolved);

  useEffect(() => {
    onResolvedRef.current = onResolved;
  }, [onResolved]);

  // Stable signature for the effect dependency array — re-run whenever the
  // payload we'd render against changes.
  const calldataValue = kind === "calldata" ? props.calldata : "";
  const typedDataKey =
    kind === "eip712"
      ? `${props.typedData?.primaryType || ""}:${JSON.stringify(
          props.typedData?.types || {},
        )}:${JSON.stringify(props.typedData?.message || {})}:${JSON.stringify(
          props.typedData?.domain || {},
        )}`
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
    const selector =
      kind === "calldata" &&
      props.calldata?.startsWith("0x") &&
      props.calldata.length >= 10
        ? props.calldata.slice(0, 10).toLowerCase()
        : undefined;
    const formatKey =
      kind === "eip712"
        ? encodeType(props.typedData.primaryType, props.typedData.types) ??
          undefined
        : undefined;

    (async () => {
      console.log(`${tag} → resolving descriptor…`);
      const { descriptor: remoteDescriptor, enabled } =
        await resolveDescriptor({
          chainId,
          address: lookupAddress,
          kind,
          selector,
          formatKey,
        });

      if (cancelled) return;
      if (!enabled) {
        console.log(`${tag} ✗ feature disabled in settings`);
        setLoading(false);
        onResolvedRef.current?.(false);
        return;
      }

      // Try the remote descriptor first; fall back to a built-in generic
      // calldata descriptor (ERC-20 transfer, etc.) when there's no remote
      // entry or the remote entry doesn't cover this selector.
      let descriptor: Erc7730Descriptor | null = remoteDescriptor;
      let matched =
        descriptor &&
        verifyDescriptorContext(
          descriptor,
          kind,
          chainId,
          lookupAddress,
          kind === "eip712" ? props.typedData.domain : undefined,
        )
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
        const builtin = getBuiltinCalldataDescriptor(
          chainId,
          lookupAddress,
          props.calldata,
        );
        if (builtin) {
          const builtinMatch = matchCalldataFormat(builtin, props.calldata);
          if (builtinMatch) {
            console.log(
              `${tag} ✓ matched built-in descriptor`,
              builtinMatch.formatKey,
            );
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
        onResolvedRef.current?.(false);
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
        onResolvedRef.current?.(false);
        return;
      }
      console.log(`${tag} ✓ decoded data`, data);

      const envelope =
        kind === "calldata"
          ? {
              chainId,
              from: props.from,
              to: props.to,
              value: props.value ?? "0",
            }
          : {
              chainId,
              from: props.from ?? undefined,
              to: props.verifyingContract,
              value: "0",
              domain: props.typedData.domain,
            };
      const renderInput = { data, chainId, nativeCurrency, envelope };
      if (!formatRuntimeGuardsPass(matched.format, renderInput, descriptor)) {
        console.log(`${tag} ✗ runtime field guards did not pass`);
        setLoading(false);
        onResolvedRef.current?.(false);
        return;
      }
      const initialFields = applyFormat(matched.format, renderInput, descriptor);
      if (initialFields.length === 0) {
        console.log(`${tag} ✗ applyFormat produced 0 fields`);
        setLoading(false);
        onResolvedRef.current?.(false);
        return;
      }
      const tokenReferences = collectRuntimeTokenReferences(
        initialFields,
        chainId,
      );
      const metadataEntries = await Promise.all(
        tokenReferences.map(async ({ chainId: tokenChainId, tokenAddress }) => {
          const metadata = toRuntimeTokenMetadataHint(
            await resolveTokenMetadataClient(tokenChainId, tokenAddress),
          );
          return [
            runtimeTokenMetadataKey(tokenChainId, tokenAddress),
            metadata,
          ] as const;
        }),
      );
      if (cancelled) return;
      const tokenMetadata = Object.fromEntries(
        metadataEntries.filter(
          (entry): entry is readonly [string, NonNullable<(typeof entry)[1]>] =>
            entry[1] !== null,
        ),
      );
      const enrichedInput = {
        ...renderInput,
        tokenMetadata,
      };
      const fields = applyFormat(matched.format, enrichedInput, descriptor);
      console.log(`${tag} ✓ rendering ${fields.length} field(s)`);

      const intent = resolveIntentText(
        matched.format,
        enrichedInput,
        descriptor,
      );
      setState({
        descriptor,
        fields,
        intent,
        ownerName: descriptor.metadata?.owner,
      });
      setLoading(false);
      onResolvedRef.current?.(true, intent);
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    kind,
    chainId,
    lookupAddress,
    calldataValue,
    typedDataKey,
    screenEntered,
    nativeCurrency,
  ]);

  return { loading, state };
}
