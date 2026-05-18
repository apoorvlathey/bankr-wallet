/**
 * EnsSetupKubo — guides the user through allowing the extension's origin in
 * Kubo's API CORS allowlist. Required for Tier 2b (onchain HTML pinning)
 * because Kubo's RPC at :5001 rejects browser-originated POSTs whose Origin
 * isn't on its allowlist (CSRF / DNS-rebinding defense).
 *
 * Adapted from dapp3's interstitial Kubo-setup card. We show the two
 * `ipfs config` commands prefilled with the live `chrome.runtime.id` and a
 * "Re-check" button that fires `ens-probe-kubo-api` against the SW.
 */

import { useEffect, useMemo, useState } from "react";
import {
  Box,
  Button,
  Center,
  HStack,
  IconButton,
  Spinner,
  Text,
  VStack,
} from "@chakra-ui/react";
import { CheckIcon, CopyIcon, WarningTwoIcon } from "@chakra-ui/icons";
import { Decorator, IconBox, ThemedCard, ThemedPanel, useTheme } from "@/theme";

type ProbeState =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "ok"; version?: string }
  | { status: "cors"; cause: string }
  | { status: "unreachable"; cause: string }
  | { status: "http"; httpStatus: number; body: string };

function CommandRow({ command, hint }: { command: string; hint: string }) {
  const { tokens } = useTheme();
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(command).catch(() => undefined);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <VStack align="start" spacing={1} w="100%">
      <Text fontSize="xs" color="fg.muted" letterSpacing="0.04em">
        {hint}
      </Text>
      <HStack
        w="100%"
        bg="surface.sunken"
        border={tokens.borders.thin}
        borderColor="border.default"
        borderRadius={tokens.radii.card}
        p={3}
        align="start"
      >
        <Text fontFamily="mono" fontSize="xs" flex={1} whiteSpace="pre-wrap" wordBreak="break-all">
          {command}
        </Text>
        <IconButton
          aria-label="Copy command"
          icon={copied ? <CheckIcon color="accent.highlight" /> : <CopyIcon />}
          size="sm"
          variant="ghost"
          onClick={handleCopy}
        />
      </HStack>
    </VStack>
  );
}

export default function EnsSetupKubo() {
  const { tokens } = useTheme();
  const extensionOrigin = useMemo(
    () => `chrome-extension://${chrome.runtime.id}`,
    [],
  );
  const cmdOrigin = useMemo(
    () =>
      `ipfs config --json API.HTTPHeaders.Access-Control-Allow-Origin '["${extensionOrigin}", "http://localhost:8080"]'`,
    [extensionOrigin],
  );
  const cmdMethods = useMemo(
    () =>
      `ipfs config --json API.HTTPHeaders.Access-Control-Allow-Methods '["POST"]'`,
    [],
  );

  const [probe, setProbe] = useState<ProbeState>({ status: "idle" });

  const recheck = async () => {
    setProbe({ status: "checking" });
    try {
      const resp = await chrome.runtime.sendMessage({
        type: "ens-probe-kubo-api",
      });
      if (resp?.ok && resp.probe?.ok) {
        setProbe({ status: "ok", version: resp.probe.version });
        return;
      }
      const detail = resp?.probe?.kind;
      if (detail?.kind === "cors") {
        setProbe({ status: "cors", cause: detail.cause });
      } else if (detail?.kind === "unreachable") {
        setProbe({ status: "unreachable", cause: detail.cause });
      } else if (detail?.kind === "http") {
        setProbe({
          status: "http",
          httpStatus: detail.status,
          body: String(detail.body ?? ""),
        });
      } else {
        setProbe({ status: "unreachable", cause: "unknown probe failure" });
      }
    } catch (e) {
      setProbe({
        status: "unreachable",
        cause: e instanceof Error ? e.message : String(e),
      });
    }
  };

  useEffect(() => {
    recheck();
  }, []);

  return (
    <Center minH="100vh" p={6}>
      <Box position="relative" w="100%" maxW="600px">
        <Decorator corner="top-left" accent="primary" />
        <Decorator corner="top-right" accent="highlight" />
        <ThemedPanel variant="raised" weight="medium" p={8}>
          <VStack align="start" spacing={5}>
            <HStack spacing={3}>
              <IconBox bg="accent.primary" color="accentFg.primary">
                <Text fontSize="lg" fontWeight={900}>
                  IPFS
                </Text>
              </IconBox>
              <VStack align="start" spacing={0}>
                <Text fontSize="xs" color="fg.muted" letterSpacing="0.08em">
                  WALLETCHAN · ENS BROWSING · TIER 2B
                </Text>
                <Text fontWeight={700} fontSize="md">
                  Allow WalletChan to write to your Kubo node
                </Text>
              </VStack>
            </HStack>

            <Text fontSize="sm" color="fg.secondary">
              Onchain HTML resolution pins each ERC-4804 dapp's bytes to your
              local Kubo node so they're served from{" "}
              <Text as="span" fontFamily="mono">
                &lt;cid&gt;.ipfs.localhost
              </Text>{" "}
              like normal IPFS sites. Kubo blocks browser-origin writes by
              default; one-time setup tells it WalletChan is allowed.
            </Text>

            <ThemedCard p={4} w="100%">
              <VStack align="stretch" spacing={3}>
                <CommandRow
                  hint="1. Allow the extension origin"
                  command={cmdOrigin}
                />
                <CommandRow
                  hint="2. Allow POST method"
                  command={cmdMethods}
                />
                <Text fontSize="xs" color="fg.muted">
                  After running both commands, restart Kubo (or IPFS Desktop)
                  and click Re-check. Or apply the same change via IPFS
                  Desktop → Settings → JSON → API.HTTPHeaders.
                </Text>
              </VStack>
            </ThemedCard>

            {probe.status === "ok" ? (
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
            ) : probe.status === "checking" || probe.status === "idle" ? (
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
            )}

            <HStack w="100%">
              <Button onClick={recheck} isDisabled={probe.status === "checking"}>
                Re-check
              </Button>
              <Box flex={1} />
              <Text fontSize="xs" color="fg.muted">
                Extension origin:{" "}
                <Text as="span" fontFamily="mono">
                  {extensionOrigin}
                </Text>
              </Text>
            </HStack>
          </VStack>
        </ThemedPanel>
      </Box>
    </Center>
  );
}
