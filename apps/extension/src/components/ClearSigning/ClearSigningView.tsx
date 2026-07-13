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

import {
  Divider,
  HStack,
  Skeleton,
  Text,
  VStack,
} from "@chakra-ui/react";

import { isDarkThemeId, useTheme } from "@/theme";
import { ThemedCard } from "@/theme/primitives/ThemedCard";

import { useClearSigningDescriptor } from "./hooks/useClearSigningDescriptor";
import { FieldRow } from "./renderers/FieldRow";
import type { ClearSigningViewProps } from "./types";

export type { ClearSigningViewProps } from "./types";

export function ClearSigningView(props: ClearSigningViewProps) {
  const { chainId, hideLoadingSkeleton } = props;
  const depth = props.depth ?? 0;
  // Midnight's luminous card shadows stack visibly when 2+ clear-signing
  // cards nest (outer → "Batched calls" → inner "Approve token"). At depth
  // > 0 we drop the shadow so the border + accentTint bg do the lifting
  // alone — keeps deeply-nested confirmations from looking like a glow
  // tower. Bauhaus's hard shadows are part of the aesthetic so we leave
  // them alone there.
  const { themeId } = useTheme();
  const cardShadow =
    depth > 0 && isDarkThemeId(themeId) ? "none" : undefined;
  const { loading, state } = useClearSigningDescriptor(props);

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
        {state.fields.map((field, index) => (
          <FieldRow
            key={`${field.label}-${index}`}
            field={field}
            chainId={chainId}
            depth={depth}
            ClearSigningComponent={ClearSigningView}
          />
        ))}
      </VStack>
    </ThemedCard>
  );
}
