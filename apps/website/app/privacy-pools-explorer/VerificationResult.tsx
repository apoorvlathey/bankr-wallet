import { useMemo } from "react";
import { Box, Flex, HStack, Link, Text, VStack } from "@chakra-ui/react";
import {
  Check,
  Clock3,
  ExternalLink,
  FileCheck2,
  ShieldCheck,
  ShieldQuestion,
  X,
} from "lucide-react";

import type { PrivacyPoolsExplorerResult } from "./types";

function truncate(value: string, start = 10, end = 8) {
  return value.length > start + end + 1
    ? `${value.slice(0, start)}…${value.slice(-end)}`
    : value;
}

export function formatDuration(seconds: number) {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const days = Math.floor(safeSeconds / 86_400);
  const hours = Math.floor((safeSeconds % 86_400) / 3_600);
  const minutes = Math.floor((safeSeconds % 3_600) / 60);
  const remainingSeconds = safeSeconds % 60;
  const parts = [
    days ? `${days}d` : "",
    hours ? `${hours}h` : "",
    minutes ? `${minutes}m` : "",
    !days && !hours ? `${remainingSeconds}s` : "",
  ].filter(Boolean);
  return parts.slice(0, 2).join(" ");
}

export function relativeTime(isoDate: string, now: number) {
  const seconds = Math.max(0, Math.floor((now - Date.parse(isoDate)) / 1_000));
  return `${formatDuration(seconds)} ago`;
}

function localTimestamp(isoDate: string) {
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    timeZoneName: "short",
  }).format(new Date(isoDate));
}

function timestampWithRelativeTime(isoDate: string, now: number) {
  return `${localTimestamp(isoDate)} (${relativeTime(isoDate, now)})`;
}

function VerificationStage({
  complete,
  failed = false,
  title,
  detail,
  last = false,
}: {
  complete: boolean;
  failed?: boolean;
  title: string;
  detail: string;
  last?: boolean;
}) {
  const color = failed
    ? "bauhaus.red"
    : complete
      ? "bauhaus.green"
      : "bauhaus.yellow";
  return (
    <HStack align="stretch" spacing={4}>
      <VStack spacing={0} flexShrink={0}>
        <Flex
          w="32px"
          h="32px"
          align="center"
          justify="center"
          bg={color}
          color={failed || complete ? "white" : "bauhaus.black"}
          border="2px solid"
          borderColor="bauhaus.black"
        >
          {failed ? <X size={17} /> : complete ? <Check size={17} /> : <Clock3 size={15} />}
        </Flex>
        {!last && <Box w="2px" minH="36px" flex="1" bg="bauhaus.black" opacity={0.24} />}
      </VStack>
      <Box pb={last ? 0 : 5} pt={0.5} minW={0}>
        <Text fontWeight="800" fontSize="sm" textTransform="uppercase" letterSpacing="wide">
          {title}
        </Text>
        <Text fontSize="sm" color="gray.600" mt={1} lineHeight="1.45">
          {detail}
        </Text>
      </Box>
    </HStack>
  );
}

function DetailRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <Flex
      justify="space-between"
      align={{ base: "flex-start", sm: "center" }}
      direction={{ base: "column", sm: "row" }}
      gap={1}
      py={3}
      borderBottom="1px solid"
      borderColor="blackAlpha.200"
    >
      <Text fontSize="xs" color="gray.500" fontWeight="800" textTransform="uppercase" letterSpacing="wide">
        {label}
      </Text>
      <Text
        fontSize="sm"
        fontWeight="700"
        fontFamily={mono ? "mono" : undefined}
        wordBreak="break-all"
        textAlign={{ base: "left", sm: "right" }}
        sx={{ fontVariantNumeric: "tabular-nums" }}
      >
        {value}
      </Text>
    </Flex>
  );
}

export function VerificationResult({
  result,
  now,
}: {
  result: PrivacyPoolsExplorerResult;
  now: number;
}) {
  const stages = useMemo(() => {
    const accepted = ["approved", "exited", "spent"].includes(result.asp.reviewStatus);
    return [
      {
        complete: true,
        title: "Shield deposit confirmed",
        detail: `Block ${result.deposit.blockNumber} at ${timestampWithRelativeTime(result.deposit.confirmedAt, now)}.`,
      },
      {
        complete: accepted && result.asp.exactDepositMatch,
        failed: result.asp.reviewStatus === "declined" || !result.asp.exactDepositMatch,
        title: "ASP compliance review",
        detail: result.asp.exactDepositMatch
          ? `Review status: ${result.asp.reviewStatus.replace("_", " ")}. The ASP record exactly matches the transaction.`
          : result.asp.reviewStatus === "not_seen"
            ? "The ASP has not indexed this label yet."
            : "The ASP record does not exactly match the on-chain deposit.",
      },
      {
        complete: result.asp.labelIncluded,
        failed: result.status === "declined",
        title: "Association-set membership",
        detail: result.asp.labelIncluded
          ? "The deposit label is present in the current ASP association tree."
          : "The deposit label is not present in the current ASP association tree.",
      },
      {
        complete: result.onchain.rootMatches,
        title: "Entrypoint root published",
        detail: result.onchain.rootMatches
          ? result.onchain.publishedAt
            ? `The ASP root matches latestRoot() and was published ${timestampWithRelativeTime(result.onchain.publishedAt, now)}.`
            : "The ASP root matches latestRoot(); its publication block could not be resolved."
          : "The latest ASP root has not been published to the Entrypoint yet.",
      },
    ];
  }, [now, result]);

  const resultColor = result.status === "confirmed"
    ? "bauhaus.green"
    : result.status === "declined"
      ? "bauhaus.red"
      : "bauhaus.yellow";

  return (
    <Box
      bg="white"
      border={{ base: "2px solid", md: "4px solid" }}
      borderColor="bauhaus.black"
      boxShadow={{ base: "4px 4px 0 #121212", md: "8px 8px 0 #121212" }}
      overflow="hidden"
    >
      <Box bg={resultColor} color={result.status === "pending" ? "bauhaus.black" : "white"} p={{ base: 5, md: 7 }}>
        <Flex justify="space-between" align={{ base: "flex-start", sm: "center" }} gap={4} direction={{ base: "column", sm: "row" }}>
          <HStack spacing={4} align="flex-start">
            {result.status === "confirmed" ? <ShieldCheck size={30} /> : <ShieldQuestion size={30} />}
            <Box>
              <Text fontSize="xs" fontWeight="800" textTransform="uppercase" letterSpacing="widest">
                {result.chainName} · checked {timestampWithRelativeTime(result.checkedAt, now)}
              </Text>
              <Text as="h2" fontSize={{ base: "2xl", md: "3xl" }} fontWeight="black" textTransform="uppercase" lineHeight="1" mt={1}>
                {result.status === "confirmed"
                  ? "Compliance confirmed"
                  : result.status === "declined"
                    ? "Compliance declined"
                    : "Compliance pending"}
              </Text>
              {result.status === "confirmed" && result.onchain.verificationLatencySeconds !== null && (
                <Text mt={2} fontWeight="800">
                  Compliance check done in {formatDuration(result.onchain.verificationLatencySeconds)}
                </Text>
              )}
            </Box>
          </HStack>
          <Link
            href={result.explorerUrl}
            isExternal
            display="inline-flex"
            alignItems="center"
            gap={2}
            px={3}
            py={2}
            minH="44px"
            border="2px solid"
            borderColor="currentColor"
            fontSize="xs"
            fontWeight="800"
            textTransform="uppercase"
            _hover={{ textDecoration: "none", bg: "blackAlpha.100" }}
          >
            View transaction <ExternalLink size={14} />
          </Link>
        </Flex>
      </Box>

      <Flex direction={{ base: "column", lg: "row" }}>
        <Box flex="1" p={{ base: 5, md: 7 }} borderRight={{ lg: "2px solid" }} borderColor={{ lg: "bauhaus.black" }}>
          <HStack mb={6} spacing={3}>
            <FileCheck2 size={18} />
            <Text fontSize="sm" fontWeight="900" textTransform="uppercase" letterSpacing="widest">
              Verification path
            </Text>
          </HStack>
          {stages.map((stage, index) => (
            <VerificationStage
              key={stage.title}
              {...stage}
              last={index === stages.length - 1}
            />
          ))}
        </Box>

        <Box flex="1" p={{ base: 5, md: 7 }} bg="blackAlpha.50">
          <Text fontSize="sm" fontWeight="900" textTransform="uppercase" letterSpacing="widest" mb={3}>
            Deposit evidence
          </Text>
          <DetailRow label="Amount" value={`${result.deposit.amountEth} ETH`} />
          <DetailRow label="Block" value={result.deposit.blockNumber} />
          <DetailRow label="Depositor" value={truncate(result.deposit.depositor)} mono />
          <DetailRow label="Label" value={truncate(result.deposit.label, 13, 10)} mono />
          <DetailRow label="ASP status" value={result.asp.reviewStatus.replace("_", " ")} />
          <DetailRow
            label="ASP root created"
            value={timestampWithRelativeTime(result.asp.rootCreatedAt, now)}
          />
          {result.onchain.publishedAt && (
            <DetailRow
              label="Root published"
              value={timestampWithRelativeTime(result.onchain.publishedAt, now)}
            />
          )}
          {result.onchain.verificationLatencySeconds !== null && (
            <DetailRow
              label="Compliance check duration"
              value={formatDuration(result.onchain.verificationLatencySeconds)}
            />
          )}
          {result.onchain.publisherTransactionUrl && result.onchain.publisherTransactionHash && (
            <Link
              href={result.onchain.publisherTransactionUrl}
              isExternal
              display="inline-flex"
              alignItems="center"
              gap={2}
              mt={4}
              fontSize="xs"
              fontWeight="800"
              textTransform="uppercase"
              textDecoration="underline"
            >
              Root publisher {truncate(result.onchain.publisherTransactionHash)} <ExternalLink size={13} />
            </Link>
          )}
          <Text mt={5} fontSize="xs" color="gray.500" lineHeight="1.5">
            The ASP does not expose its internal approval timestamp. This tool reports when the current approving root became wallet-verifiable on-chain; for older deposits, that may be later than the first approving root.
          </Text>
        </Box>
      </Flex>
    </Box>
  );
}
