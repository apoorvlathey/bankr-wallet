import {
  Box,
  Badge,
  Code,
  Collapse,
  HStack,
  Image,
  Spacer,
  Text,
  VStack,
} from "@chakra-ui/react";
import { ChevronDownIcon, ChevronUpIcon } from "@chakra-ui/icons";
import type { CompletedTransaction } from "@/chrome/txHistoryStorage";
import { AddressParam } from "@/components/decodedParams/AddressParam";
import CalldataDecoder from "@/components/CalldataDecoder";
import { CopyButton } from "@/components/CopyButton";
import { FromAccountDisplay } from "@/components/FromAccountDisplay";
import { formatValue } from "./formatting";

export default function RawTransactionDetails({
  tx,
  resolveLogo,
  nativeSym,
  expanded,
  onToggle,
  formatWeiUsd,
}: {
  tx: CompletedTransaction;
  resolveLogo: (url: string | null | undefined) => string | undefined;
  nativeSym: string;
  expanded: boolean;
  onToggle: () => void;
  formatWeiUsd: (raw: string | undefined | null) => string | null;
}) {
  const hasCalldata = tx.tx.data && tx.tx.data !== "0x";
  const isContractDeploy = !tx.tx.to;

  return (
    <>
      {/* Toggle for the raw tx details. Default collapsed when the
          hero card is showing (the hero already answers "what did this
          do?"); default expanded for everything else so non-clear-
          signed txs render the same shape they did before. */}
      <HStack
        as="button"
        type="button"
        w="full"
        appearance="none"
        bg="transparent"
        border={0}
        fontFamily="inherit"
        cursor="pointer"
        aria-expanded={expanded}
        onClick={() => onToggle()}
        _hover={{ bg: "bg.muted" }}
        borderRadius="md"
        px={1}
        py={1}
        justify="space-between"
        textAlign="start"
        _focusVisible={{ outline: "none", boxShadow: "focus" }}
      >
        <Text fontSize="sm" color="text.secondary" fontWeight="600">
          Transaction details
        </Text>
        {expanded
          ? <ChevronUpIcon boxSize={4} color="text.tertiary" />
          : <ChevronDownIcon boxSize={4} color="text.tertiary" />
        }
      </HStack>

      <Collapse in={expanded} animateOpacity>
        <VStack spacing={3} align="stretch">
      {/* Function name */}
      {tx.functionName && (
        <Box>
          <Text fontSize="xs" color="text.secondary" fontWeight="700" textTransform="uppercase" mb={1}>
            Function
          </Text>
          <Code
            px={2}
            py={1}
            fontSize="xs"
            bg="accent.secondary"
            color="accentFg.secondary"
            fontFamily="mono"
            border="2px solid"
            borderColor="border.default"
            fontWeight="700"
          >
            {tx.functionName}
          </Code>
        </Box>
      )}

      {/* Transfer meta (sponsored transfers) */}
      {tx.transferMeta ? (
        <Box
          bg="surface.sunken"
          border="1px solid"
          borderColor="border.subtle"
          borderRadius="md"
          p={3}
        >
          <VStack align="stretch" spacing={3}>
            {/* Amount + Token */}
            <Box>
              <Text fontSize="xs" color="text.secondary" fontWeight="700" textTransform="uppercase" mb={1}>
                Amount
              </Text>
              <HStack spacing={2}>
                {tx.transferMeta.tokenLogo && (
                  <Image
                    src={resolveLogo(tx.transferMeta.tokenLogo)}
                    alt={tx.transferMeta.symbol}
                    boxSize="20px"
                    borderRadius="full"
                  />
                )}
                <Text fontSize="sm" fontWeight="800" color="text.primary">
                  {tx.transferMeta.amount} {tx.transferMeta.symbol}
                </Text>
              </HStack>
            </Box>

            {/* From */}
            <Box>
              <Text fontSize="xs" color="text.secondary" fontWeight="700" textTransform="uppercase" mb={1}>
                From
              </Text>
              <FromAccountDisplay address={tx.tx.from} />
            </Box>

            {/* To (actual recipient) */}
            <Box>
              <Text fontSize="xs" color="text.secondary" fontWeight="700" textTransform="uppercase" mb={1}>
                To
              </Text>
              <AddressParam value={tx.transferMeta.recipient} chainId={tx.chainId} />
            </Box>
          </VStack>
        </Box>
      ) : (
        <>
          {/* From → To card — recessed surface + border gives visual
              separation from the modal's raised backdrop so each
              section reads as its own tile. */}
          <Box
            bg="surface.sunken"
            border="1px solid"
            borderColor="border.subtle"
            borderRadius="md"
            p={3}
          >
            <HStack spacing={2} align="start">
              {/* From (our wallet) */}
              <VStack align="start" spacing={0} flex={1} minW={0}>
                <Text fontSize="xs" color="text.secondary" fontWeight="700" textTransform="uppercase" mb={1}>
                  From
                </Text>
                <FromAccountDisplay address={tx.tx.from} />
              </VStack>

              {/* Arrow */}
              <Text fontSize="md" fontWeight="800" color="text.tertiary" pt={5}>
                →
              </Text>

              {/* To */}
              <VStack align="start" spacing={0} flex={1} minW={0}>
                <Text fontSize="xs" color="text.secondary" fontWeight="700" textTransform="uppercase" mb={1}>
                  {isContractDeploy ? "Type" : "To"}
                </Text>
                {isContractDeploy ? (
                  <Badge
                    fontSize="2xs"
                    bg="accent.highlight"
                    color="accentFg.highlight"
                    border="2px solid"
                    borderColor="border.default"
                    fontWeight="700"
                    px={1.5}
                    py={0.5}
                  >
                    Contract Deploy
                  </Badge>
                ) : (
                  <AddressParam value={tx.tx.to!} chainId={tx.chainId} />
                )}
              </VStack>
            </HStack>
          </Box>

          {/* Value card — single-line layout: label on the left, amount
              + optional USD on the right so the card stays compact. */}
          <Box
            bg="surface.sunken"
            border="1px solid"
            borderColor="border.subtle"
            borderRadius="md"
            px={3}
            py={2}
          >
            <HStack justify="space-between" align="center" spacing={2}>
              <Text
                fontSize="xs"
                color="text.secondary"
                fontWeight="700"
                textTransform="uppercase"
              >
                Value
              </Text>
              <HStack spacing={2} align="baseline">
                <Text fontSize="sm" fontWeight="700" color="text.primary">
                  {formatValue(tx.tx.value, nativeSym)}
                </Text>
                {(() => {
                  const usd = formatWeiUsd(tx.tx.value);
                  return usd ? (
                    <Text fontSize="xs" color="text.tertiary" fontWeight="600">
                      {usd}
                    </Text>
                  ) : null;
                })()}
              </HStack>
            </HStack>
          </Box>
        </>
      )}

      {/* Calldata. Lives inside the collapse alongside From/To/Value
          since it answers the same "what is the raw payload?" question.
          The hero card above already provides the human-readable view
          for clear-signed txs. */}
      {hasCalldata && !isContractDeploy && tx.tx.to && (
        <Box>
          <Text fontSize="xs" color="text.secondary" fontWeight="700" textTransform="uppercase" mb={1}>
            Calldata
          </Text>
          <CalldataDecoder calldata={tx.tx.data!} to={tx.tx.to} chainId={tx.chainId} />
        </Box>
      )}

      {/* Deploy data for contract deployments */}
      {hasCalldata && isContractDeploy && (
        <Box>
          <HStack mb={1}>
            <Text fontSize="xs" color="text.secondary" fontWeight="700" textTransform="uppercase">
              Deploy Data
            </Text>
            <Spacer />
            <CopyButton value={tx.tx.data!} />
          </HStack>
          <Box
            p={3}
            bg="bg.muted"
            border="2px solid"
            borderColor="border.default"
            maxH="100px"
            overflowY="auto"
            css={{
              "&::-webkit-scrollbar": { width: "6px" },
              "&::-webkit-scrollbar-track": {
                background: "var(--chakra-colors-bg-muted)",
              },
              "&::-webkit-scrollbar-thumb": {
                background: "var(--chakra-colors-border-strong)",
              },
            }}
          >
            <Text fontSize="xs" fontFamily="mono" color="text.tertiary" wordBreak="break-all" whiteSpace="pre-wrap">
              {tx.tx.data}
            </Text>
          </Box>
        </Box>
      )}
        </VStack>
      </Collapse>
    </>
  );
}
