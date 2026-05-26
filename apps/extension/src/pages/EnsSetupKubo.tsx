/**
 * EnsSetupKubo — guides the user through allowing the extension's origin in
 * Kubo's API CORS allowlist. Required for onchain-HTML pinning because
 * Kubo's RPC at :5001 rejects browser-originated POSTs whose Origin isn't on
 * its allowlist (CSRF / DNS-rebinding defense).
 *
 * Default flow targets IPFS Desktop users (merge two keys into the JSON
 * config); the CLI command is tucked into a collapsible for power users.
 */

import { useEffect, useMemo, useState } from "react";
import {
  Box,
  Button,
  Center,
  Collapse,
  HStack,
  Icon,
  IconButton,
  Spinner,
  Text,
  VStack,
} from "@chakra-ui/react";
import { keyframes } from "@emotion/react";
import {
  CheckIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  CopyIcon,
  RepeatIcon,
  WarningTwoIcon,
} from "@chakra-ui/icons";

const spin = keyframes`
  from { transform: rotate(0deg); }
  to   { transform: rotate(360deg); }
`;
import { Decorator, IconBox, ThemedCard, ThemedPanel, useTheme } from "@/theme";

type ProbeState =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "ok"; version?: string }
  | { status: "cors"; cause: string }
  | { status: "unreachable"; cause: string }
  | { status: "http"; httpStatus: number; body: string };

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(text).catch(() => undefined);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <IconButton
      aria-label="Copy"
      icon={copied ? <CheckIcon color="accent.highlight" /> : <CopyIcon />}
      size="sm"
      variant="ghost"
      onClick={handleCopy}
    />
  );
}

// Tiny JSON token colorizer. Keys / strings / structural punctuation / `...`
// placeholder rendered in distinct theme tokens.
function JsonBlock({ src }: { src: string }) {
  const tokens: { text: string; kind: "key" | "str" | "dots" | "punct" | "plain" }[] = [];
  const re = /("(?:[^"\\]|\\.)*")(\s*:)|("(?:[^"\\]|\\.)*")|(\.\.\.)|([{}[\],])/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    if (m.index > last) tokens.push({ text: src.slice(last, m.index), kind: "plain" });
    if (m[1] !== undefined) {
      tokens.push({ text: m[1], kind: "key" });
      tokens.push({ text: m[2], kind: "plain" });
    } else if (m[3] !== undefined) {
      tokens.push({ text: m[3], kind: "str" });
    } else if (m[4] !== undefined) {
      tokens.push({ text: m[4], kind: "dots" });
    } else if (m[5] !== undefined) {
      tokens.push({ text: m[5], kind: "punct" });
    }
    last = re.lastIndex;
  }
  if (last < src.length) tokens.push({ text: src.slice(last), kind: "plain" });

  const colorFor = (k: typeof tokens[number]["kind"]) =>
    k === "key"
      ? "accent.secondary"
      : k === "str"
        ? "chart.positive"
        : k === "dots" || k === "punct"
          ? "fg.muted"
          : "fg.primary";

  return (
    <Box as="pre" fontFamily="mono" fontSize="xs" m={0} whiteSpace="pre" overflowX="auto">
      {tokens.map((t, i) => (
        <Text as="span" key={i} color={colorFor(t.kind)}>
          {t.text}
        </Text>
      ))}
    </Box>
  );
}

function StepNumber({ n }: { n: number }) {
  return (
    <Center
      flexShrink={0}
      w={6}
      h={6}
      borderRadius="full"
      bg="accent.primary"
      color="accentFg.primary"
      fontSize="xs"
      fontWeight={800}
    >
      {n}
    </Center>
  );
}

export default function EnsSetupKubo() {
  const { tokens } = useTheme();
  const extensionOrigin = useMemo(
    () => `chrome-extension://${chrome.runtime.id}`,
    [],
  );
  const combinedCmd = useMemo(
    () =>
      `ipfs config --json API.HTTPHeaders.Access-Control-Allow-Origin '["${extensionOrigin}", "http://localhost:8080"]' && ipfs config --json API.HTTPHeaders.Access-Control-Allow-Methods '["POST"]'`,
    [extensionOrigin],
  );

  const jsonSnippet = useMemo(
    () =>
      [
        `{`,
        `  ...`,
        `  "API": {`,
        `    "HTTPHeaders": {`,
        `      ...`,
        `      "Access-Control-Allow-Methods": ["POST"],`,
        `      "Access-Control-Allow-Origin": [`,
        `        ...,`,
        `        "${extensionOrigin}"`,
        `      ]`,
        `    }`,
        `  },`,
        `  ...`,
        `}`,
      ].join("\n"),
    [extensionOrigin],
  );

  const [probe, setProbe] = useState<ProbeState>({ status: "idle" });
  const [isChecking, setIsChecking] = useState(false);
  const [cliOpen, setCliOpen] = useState(false);
  const [whyOpen, setWhyOpen] = useState(false);

  const recheck = async () => {
    // Keep the last status visible during recheck — only the button reflects
    // the in-flight state (spinner + disabled). The status block updates
    // atomically when the new result arrives.
    setIsChecking(true);
    // Enforce a minimum visible "checking" duration so the spinner animation
    // is always perceivable — local probes often return in <50ms, which
    // would otherwise feel like the button didn't do anything.
    const MIN_CHECKING_MS = 700;
    const startedAt = Date.now();

    let next: ProbeState;
    try {
      const resp = await chrome.runtime.sendMessage({
        type: "ens-probe-kubo-api",
      });
      if (resp?.ok && resp.probe?.ok) {
        next = { status: "ok", version: resp.probe.version };
      } else {
        const detail = resp?.probe?.kind;
        if (detail?.kind === "cors") {
          next = { status: "cors", cause: detail.cause };
        } else if (detail?.kind === "unreachable") {
          next = { status: "unreachable", cause: detail.cause };
        } else if (detail?.kind === "http") {
          next = {
            status: "http",
            httpStatus: detail.status,
            body: String(detail.body ?? ""),
          };
        } else {
          next = { status: "unreachable", cause: "unknown probe failure" };
        }
      }
    } catch (e) {
      next = {
        status: "unreachable",
        cause: e instanceof Error ? e.message : String(e),
      };
    }

    const elapsed = Date.now() - startedAt;
    if (elapsed < MIN_CHECKING_MS) {
      await new Promise((resolve) =>
        setTimeout(resolve, MIN_CHECKING_MS - elapsed),
      );
    }
    setProbe(next);
    setIsChecking(false);
  };

  useEffect(() => {
    recheck();
  }, []);

  const statusBlock =
    probe.status === "ok" ? (
      <HStack
        w="100%"
        bg="status.success.bg"
        color="status.success.fg"
        border={tokens.borders.thin}
        borderColor="status.success.border"
        borderRadius={tokens.radii.card}
        p={4}
      >
        <CheckIcon />
        <Text fontWeight={700}>
          Kubo is accepting WalletChan writes.
          {probe.version ? ` (v${probe.version})` : ""}
        </Text>
      </HStack>
    ) : probe.status === "idle" || probe.status === "checking" ? (
      <HStack color="fg.muted">
        <Spinner size="sm" speed="0.6s" />
        <Text fontSize="sm">Probing Kubo API at 127.0.0.1:5001…</Text>
      </HStack>
    ) : (
      <VStack
        align="start"
        w="100%"
        spacing={2}
        bg="status.error.bg"
        color="status.error.fg"
        border={tokens.borders.thin}
        borderColor="status.error.border"
        borderRadius={tokens.radii.card}
        p={4}
      >
        <HStack>
          <WarningTwoIcon />
          <Text fontWeight={700}>
            {probe.status === "cors"
              ? "Kubo is rejecting the WalletChan origin."
              : probe.status === "unreachable"
                ? "Couldn't reach the Kubo API."
                : `Kubo returned HTTP ${probe.httpStatus}.`}
          </Text>
        </HStack>
        <Text fontSize="xs" fontFamily="mono">
          {"cause" in probe ? probe.cause : probe.body}
        </Text>
      </VStack>
    );

  return (
    <Center minH="100vh" p={6}>
      <Box position="relative" w="100%" maxW="640px">
        <Decorator corner="top-left" accent="primary" />
        <Decorator corner="top-right" accent="highlight" />
        <ThemedPanel variant="raised" weight="medium" p={8}>
          <VStack align="stretch" spacing={5}>
            <HStack spacing={3} align="center">
              <IconBox bg="accent.primary" color="accentFg.primary" size="40px">
                <svg
                  viewBox="0 0 24 24"
                  width="22"
                  height="22"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M12 2L2 7l10 5 10-5-10-5z" />
                  <path d="M2 17l10 5 10-5" />
                  <path d="M2 12l10 5 10-5" />
                </svg>
              </IconBox>
              <VStack align="start" spacing={0} minW={0} flex={1}>
                <Text fontSize="xs" color="fg.muted" letterSpacing="0.08em">
                  WALLETCHAN · DAPP3 · PIN ONCHAIN HTML
                </Text>
                <Text fontWeight={700} fontSize="md">
                  Allow WalletChan to write to your Kubo node
                </Text>
                <HStack
                  as="button"
                  onClick={() => setWhyOpen((v) => !v)}
                  spacing={1}
                  mt={1}
                  cursor="pointer"
                  color="fg.muted"
                  _hover={{ color: "accent.primary" }}
                >
                  {whyOpen ? (
                    <ChevronDownIcon boxSize={3} />
                  ) : (
                    <ChevronRightIcon boxSize={3} />
                  )}
                  <Text fontSize="xs">Why is this needed?</Text>
                </HStack>
              </VStack>
            </HStack>

            <Collapse in={whyOpen} animateOpacity>
              <Text fontSize="xs" color="fg.secondary">
                Onchain HTML resolution pins each ERC-4804 dapp's bytes to
                your local Kubo node so they're served from{" "}
                <Text as="span" fontFamily="mono">
                  &lt;cid&gt;.ipfs.localhost
                </Text>{" "}
                like normal IPFS sites. Kubo blocks browser-origin writes by
                default — this one-time setup tells it WalletChan is allowed.
              </Text>
            </Collapse>

            {/* Step 1 — open IPFS Desktop config */}
            <HStack align="center" spacing={3}>
              <StepNumber n={1} />
              <Text fontSize="sm" fontWeight={700} flex={1} minW={0}>
                Open IPFS Desktop → Settings → IPFS Config
              </Text>
            </HStack>

            {/* Step 2 — merge JSON + save & restart */}
            <HStack align="start" spacing={3}>
              <StepNumber n={2} />
              <VStack align="stretch" spacing={2} flex={1} minW={0}>
                <Text fontSize="sm" fontWeight={700}>
                  Merge into{" "}
                  <Text as="span" fontFamily="mono" fontWeight={700}>
                    API.HTTPHeaders
                  </Text>
                  , save & restart
                </Text>
                <HStack
                  align="start"
                  bg="surface.sunken"
                  border={tokens.borders.thin}
                  borderColor="border.default"
                  borderRadius={tokens.radii.card}
                  p={3}
                  spacing={2}
                >
                  <Box flex={1} minW={0} overflowX="auto">
                    <JsonBlock src={jsonSnippet} />
                  </Box>
                  <CopyButton text={jsonSnippet} />
                </HStack>
              </VStack>
            </HStack>

            {/* CLI fallback — collapsed by default */}
            <ThemedCard p={3}>
              <VStack align="stretch" spacing={2}>
                <HStack
                  as="button"
                  onClick={() => setCliOpen((v) => !v)}
                  spacing={2}
                  cursor="pointer"
                  _hover={{ color: "accent.primary" }}
                  color="fg.secondary"
                >
                  {cliOpen ? (
                    <ChevronDownIcon boxSize={4} />
                  ) : (
                    <ChevronRightIcon boxSize={4} />
                  )}
                  <Text fontSize="sm" fontWeight={600}>
                    Prefer the CLI? One-liner for{" "}
                    <Text as="span" fontFamily="mono">
                      ipfs
                    </Text>
                  </Text>
                </HStack>
                <Collapse in={cliOpen} animateOpacity>
                  <VStack align="stretch" spacing={2} pt={2}>
                    <Text fontSize="xs" color="fg.secondary">
                      Run this in a terminal, then restart{" "}
                      <Text as="span" fontFamily="mono">
                        ipfs daemon
                      </Text>
                      .
                    </Text>
                    <HStack
                      align="start"
                      bg="surface.sunken"
                      border={tokens.borders.thin}
                      borderColor="border.default"
                      borderRadius={tokens.radii.card}
                      p={3}
                      spacing={2}
                    >
                      <Text
                        fontFamily="mono"
                        fontSize="md"
                        color="accent.highlight"
                        fontWeight={700}
                        lineHeight="1.6"
                      >
                        $
                      </Text>
                      <Box
                        as="pre"
                        fontFamily="mono"
                        fontSize="xs"
                        flex={1}
                        m={0}
                        whiteSpace="pre-wrap"
                        wordBreak="break-all"
                        lineHeight="1.6"
                      >
                        {combinedCmd}
                      </Box>
                      <CopyButton text={combinedCmd} />
                    </HStack>
                  </VStack>
                </Collapse>
              </VStack>
            </ThemedCard>

            <HStack w="100%" align="stretch" spacing={3}>
              <Box flex={1} minW={0}>
                {statusBlock}
              </Box>
              <Button
                onClick={recheck}
                isDisabled={isChecking}
                flexShrink={0}
                alignSelf="stretch"
                h="auto"
                minH={14}
                minW={32}
                px={5}
                leftIcon={
                  <Icon
                    as={RepeatIcon}
                    animation={
                      isChecking ? `${spin} 0.9s linear infinite` : undefined
                    }
                  />
                }
              >
                Re-check
              </Button>
            </HStack>
          </VStack>
        </ThemedPanel>
      </Box>
    </Center>
  );
}
