import { Text } from "@chakra-ui/react";

import { CHAIN_REGISTRY } from "@/constants/chainRegistry";
import type { RenderedValue } from "@/lib/clearSigning/applyFormat";

import {
  formatDurationLabel,
  formatTimestamp,
} from "../formatters/valueFormatters";
import { AddressInline } from "./AddressInline";
import { GweiNameInline } from "./GweiNameInline";
import { TokenAmountInline } from "./TokenAmountInline";
import { TokenTickerInline } from "./TokenTickerInline";

export function RenderedValueView({
  value,
  chainId,
}: {
  value: RenderedValue;
  chainId: number;
}) {
  switch (value.kind) {
    case "raw":
      return (
        <Text
          fontSize="xs"
          fontFamily="mono"
          color="fg.primary"
          wordBreak="break-all"
        >
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
          chainId={value.chainId ?? chainId}
          thresholdRaw={value.thresholdRaw}
          thresholdMessage={value.thresholdMessage}
          metadataHint={value.tokenMetadata}
        />
      );
    case "amount":
      return (
        <TokenAmountInline
          amountRaw={value.amountRaw}
          native
          chainId={value.chainId ?? chainId}
        />
      );
    case "date":
      return (
        <Text fontSize="xs" color="fg.primary" fontWeight="600">
          {formatTimestamp(value.timestamp)}
        </Text>
      );
    case "duration":
      return (
        <Text fontSize="xs" color="fg.primary" fontWeight="600">
          {formatDurationLabel(value.seconds)}
        </Text>
      );
    case "unit": {
      return (
        <Text
          fontSize="xs"
          fontFamily="mono"
          color="chart.numeric"
          fontWeight="600"
        >
          {value.text}
        </Text>
      );
    }
    case "enum":
      return (
        <Text
          fontSize="xs"
          color="fg.primary"
          fontWeight="600"
          wordBreak="break-word"
        >
          {value.text}
        </Text>
      );
    case "chainId": {
      const entry = CHAIN_REGISTRY.find((c) => c.chainId === value.chainId);
      return (
        <Text fontSize="xs" color="fg.primary" fontWeight="600">
          {entry?.name || value.text || value.chainId}
        </Text>
      );
    }
    case "tokenTicker":
      return (
        <TokenTickerInline
          tokenAddress={value.tokenAddress}
          chainId={value.chainId ?? chainId}
          metadataHint={value.tokenMetadata}
        />
      );
    case "gweiName":
      return (
        <GweiNameInline
          tokenId={value.tokenId}
          chainId={value.chainId ?? chainId}
        />
      );
    case "contentHash":
      return (
        <Text
          fontSize="xs"
          color="fg.primary"
          fontWeight="700"
          wordBreak="break-all"
        >
          {value.uri || value.raw}
        </Text>
      );
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
