import {
  Badge,
  Box,
  Code,
  HStack,
  Image,
  Spacer,
  StackDivider,
  Text,
  VStack,
  Button,
  Spinner,
} from "@chakra-ui/react";
import type { ReactNode } from "react";
import type { CompletedTransaction } from "@/chrome/txHistoryStorage";
import CalldataDecoder from "@/components/CalldataDecoder";
import { CopyButton } from "@/components/CopyButton";
import { FromAccountDisplay } from "@/components/FromAccountDisplay";
import { AddressParam } from "@/components/decodedParams/AddressParam";
import { formatValue } from "./formatting";

function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <HStack minH="48px" px={3} py={2.5} spacing={3} justify="space-between">
      <Text color="fg.secondary" fontSize="xs" fontWeight="600" flexShrink={0}>
        {label}
      </Text>
      <Box minW={0} textAlign="right">
        {children}
      </Box>
    </HStack>
  );
}

export default function RawTransactionDetails({
  tx,
  resolveLogo,
  nativeSym,
  formatWeiUsd,
  onFunctionName,
  calldataLoading,
  calldataError,
  onRetryCalldata,
}: {
  tx: CompletedTransaction;
  resolveLogo: (url: string | null | undefined) => string | undefined;
  nativeSym: string;
  formatWeiUsd: (raw: string | undefined | null) => string | null;
  onFunctionName: (name: string) => void;
  calldataLoading: boolean;
  calldataError: string | null;
  onRetryCalldata: () => void;
}) {
  const hasCalldata = Boolean(tx.tx.data && tx.tx.data !== "0x");
  const isContractDeploy = !tx.tx.to;
  const valueUsd = formatWeiUsd(tx.tx.value);

  return (
    <VStack
      spacing={0}
      align="stretch"
      divider={<StackDivider borderColor="border.subtle" />}
    >
      {tx.functionName && (
        <DetailRow label="Function">
          <Code
            px={2}
            py={1}
            bg="surface.sunken"
            color="fg.primary"
            borderWidth="1px"
            borderStyle="solid"
            borderColor="border.subtle"
            borderRadius="md"
            fontFamily="mono"
            fontSize="xs"
            fontWeight="600"
          >
            {tx.functionName}
          </Code>
        </DetailRow>
      )}

      {tx.transferMeta && (
        <DetailRow label="Amount">
          <HStack spacing={1.5} justify="flex-end">
            {tx.transferMeta.tokenLogo && (
              <Image
                src={resolveLogo(tx.transferMeta.tokenLogo)}
                alt=""
                boxSize="18px"
                borderRadius="full"
              />
            )}
            <Text color="fg.primary" fontSize="xs" fontWeight="700">
              {tx.transferMeta.amount} {tx.transferMeta.symbol}
            </Text>
          </HStack>
        </DetailRow>
      )}

      <DetailRow label="From">
        <FromAccountDisplay address={tx.tx.from} />
      </DetailRow>

      <DetailRow label={isContractDeploy ? "Type" : "To"}>
        {isContractDeploy ? (
          <Badge
            fontSize="xs"
            bg="accent.highlight"
            color="accentFg.highlight"
            borderWidth="1px"
            borderStyle="solid"
            borderColor="border.default"
            px={2}
            py={0.5}
            fontWeight="700"
          >
            Contract deployment
          </Badge>
        ) : (
          <AddressParam
            value={tx.transferMeta?.recipient ?? tx.tx.to!}
            chainId={tx.chainId}
          />
        )}
      </DetailRow>

      {!tx.transferMeta && (
        <DetailRow label="Value">
          <VStack spacing={0} align="flex-end">
            <Text color="fg.primary" fontSize="xs" fontWeight="700">
              {formatValue(tx.tx.value, nativeSym)}
            </Text>
            {valueUsd && (
              <Text color="fg.secondary" fontSize="2xs" fontWeight="600">
                {valueUsd}
              </Text>
            )}
          </VStack>
        </DetailRow>
      )}

      {hasCalldata && !isContractDeploy && tx.tx.to && (
        <Box px={3} py={2.5}>
          <Text color="fg.secondary" fontSize="xs" fontWeight="600" mb={2}>
            Calldata
          </Text>
          <CalldataDecoder
            calldata={tx.tx.data!}
            to={tx.tx.to}
            chainId={tx.chainId}
            onFunctionName={onFunctionName}
            flat
          />
        </Box>
      )}

      {hasCalldata && isContractDeploy && (
        <Box px={3} py={2.5}>
          <HStack mb={2}>
            <Text color="fg.secondary" fontSize="xs" fontWeight="600">
              Deploy data
            </Text>
            <Spacer />
            <CopyButton value={tx.tx.data!} label="Copy deploy data" />
          </HStack>
          <Box
            p={2.5}
            bg="surface.sunken"
            borderWidth="1px"
            borderStyle="solid"
            borderColor="border.subtle"
            borderRadius="md"
            maxH="120px"
            overflowY="auto"
          >
            <Text
              color="fg.secondary"
              fontFamily="mono"
              fontSize="xs"
              wordBreak="break-all"
              whiteSpace="pre-wrap"
            >
              {tx.tx.data}
            </Text>
          </Box>
        </Box>
      )}

      {!hasCalldata && (calldataLoading || calldataError) && (
        <Box px={3} py={2.5}>
          <HStack justify="space-between">
            <Text color="fg.secondary" fontSize="xs" fontWeight="600">
              Calldata
            </Text>
            {calldataLoading ? (
              <HStack spacing={2}>
                <Spinner size="xs" />
                <Text color="fg.secondary" fontSize="xs">Loading…</Text>
              </HStack>
            ) : (
              <Button size="xs" variant="secondary" onClick={onRetryCalldata}>
                Retry
              </Button>
            )}
          </HStack>
          {calldataError && (
            <Text mt={1.5} color="fg.secondary" fontSize="xs">
              {calldataError}
            </Text>
          )}
        </Box>
      )}
    </VStack>
  );
}
