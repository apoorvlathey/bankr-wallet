import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Box,
  Button,
  Collapse,
  HStack,
  Icon,
  IconButton,
  Input,
  Link,
  Spinner,
  Switch,
  Text,
  VStack,
} from "@chakra-ui/react";
import { keyframes } from "@emotion/react";
import {
  ArrowBackIcon,
  ArrowForwardIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  RepeatIcon,
} from "@chakra-ui/icons";
import { ThemedCard, useTheme } from "@/theme";
import {
  DEFAULT_ENS_BROWSING_SETTINGS,
  DEFAULT_GATEWAY_HOST,
  DEFAULT_GATEWAY_PORT,
  getEnsBrowsingSettings,
  isDefaultGatewayHost,
  setEnsBrowsingSetting,
  type EnsBrowsingSettings as Settings,
} from "@/chrome/ensBrowsing/settingsStorage";

interface EnsBrowsingSettingsProps {
  onBack: () => void;
}

const spin = keyframes`
  from { transform: rotate(0deg); }
  to   { transform: rotate(360deg); }
`;

type KuboStatus = "checking" | "online" | "offline";
type KuboApiStatus =
  | "idle"
  | "checking"
  | "ok"
  | "cors-blocked"
  | "unreachable"
  | "error";
type BoolKey = "enabled" | "useLocalGateway" | "pinOnchainHtml";

export default function EnsBrowsingSettings({ onBack }: EnsBrowsingSettingsProps) {
  const { tokens } = useTheme();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [pending, setPending] = useState<keyof Settings | null>(null);
  const [kuboStatus, setKuboStatus] = useState<KuboStatus>("checking");
  const [kuboApiStatus, setKuboApiStatus] = useState<KuboApiStatus>("idle");
  const [hostDraft, setHostDraft] = useState<string>(DEFAULT_GATEWAY_HOST);
  const [portDraft, setPortDraft] = useState<string>(String(DEFAULT_GATEWAY_PORT));

  useEffect(() => {
    getEnsBrowsingSettings()
      .then((s) => {
        setSettings(s);
        setHostDraft(s.gatewayHost);
        setPortDraft(String(s.gatewayPort));
      })
      .catch(() => setSettings(DEFAULT_ENS_BROWSING_SETTINGS));
  }, []);

  const probeKubo = useCallback(() => {
    setKuboStatus("checking");
    chrome.runtime.sendMessage(
      { type: "ens-probe-kubo" },
      (res: { ok?: boolean; reachable?: boolean } | undefined) => {
        setKuboStatus(res?.ok && res.reachable ? "online" : "offline");
      },
    );
  }, []);

  useEffect(() => {
    probeKubo();
  }, [probeKubo]);

  const probeKuboApi = useCallback(() => {
    setKuboApiStatus("checking");
    chrome.runtime.sendMessage(
      { type: "ens-probe-kubo-api" },
      (
        res:
          | {
              ok?: boolean;
              probe?:
                | { ok: true; version?: string }
                | { ok: false; kind: { kind: string } };
            }
          | undefined,
      ) => {
        if (!res?.ok || !res.probe) {
          setKuboApiStatus("error");
          return;
        }
        if (res.probe.ok) {
          setKuboApiStatus("ok");
          return;
        }
        const k = res.probe.kind.kind;
        setKuboApiStatus(
          k === "cors"
            ? "cors-blocked"
            : k === "unreachable"
              ? "unreachable"
              : "error",
        );
      },
    );
  }, []);

  // Only probe the Kubo write API when pinning is on — otherwise CORS state
  // is irrelevant and we shouldn't surface it. Re-probe whenever the gateway
  // probe flips online so the API check has a fair chance of succeeding.
  useEffect(() => {
    if (!settings?.pinOnchainHtml) {
      setKuboApiStatus("idle");
      return;
    }
    probeKuboApi();
  }, [settings?.pinOnchainHtml, kuboStatus, probeKuboApi]);

  const toggle = (key: BoolKey) => async () => {
    if (!settings || pending) return;
    const next = !settings[key];
    setPending(key);
    setSettings({ ...settings, [key]: next });
    try {
      await setEnsBrowsingSetting(key, next);
    } finally {
      setPending(null);
    }
  };

  const renderToggle = (
    key: BoolKey,
    checked: boolean,
    disabled: boolean,
    onChange?: React.ChangeEventHandler<HTMLInputElement>,
  ) =>
    settings === null ? (
      <Spinner size="sm" />
    ) : (
      <Switch
        isChecked={checked}
        onChange={onChange ?? toggle(key)}
        isDisabled={pending !== null || disabled}
      />
    );

  // Normalized + parsed candidates so we can compare against the saved
  // settings to decide whether the Save button is meaningful, and reuse the
  // same values when actually saving.
  const normalizedHost = hostDraft.trim().toLowerCase();
  const parsedPort = Number.parseInt(portDraft, 10);
  const portValid =
    Number.isInteger(parsedPort) && parsedPort > 0 && parsedPort <= 65535;
  const isDirty =
    !!settings &&
    (normalizedHost !== settings.gatewayHost ||
      (portValid && parsedPort !== settings.gatewayPort));
  const canSave = isDirty && portValid && normalizedHost.length > 0;

  const [justSaved, setJustSaved] = useState(false);
  const [gatewayOpen, setGatewayOpen] = useState(false);

  // Auto-expand the gateway editor once we know the user is already on a
  // custom URL — so they can see/edit it without hunting for the toggle.
  useEffect(() => {
    if (!settings) return;
    if (
      settings.gatewayHost !== DEFAULT_GATEWAY_HOST ||
      settings.gatewayPort !== DEFAULT_GATEWAY_PORT
    ) {
      setGatewayOpen(true);
    }
  }, [settings]);

  const saveGateway = async () => {
    if (!settings || !canSave) return;
    setPending("gatewayHost");
    const nextSettings: Settings = {
      ...settings,
      gatewayHost: normalizedHost,
      gatewayPort: parsedPort,
    };
    setSettings(nextSettings);
    try {
      if (normalizedHost !== settings.gatewayHost) {
        await setEnsBrowsingSetting("gatewayHost", normalizedHost);
      }
      if (parsedPort !== settings.gatewayPort) {
        await setEnsBrowsingSetting("gatewayPort", parsedPort);
      }
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 1800);
      probeKubo();
    } finally {
      setPending(null);
    }
  };

  const resetGatewayDrafts = () => {
    if (!settings) return;
    setHostDraft(settings.gatewayHost);
    setPortDraft(String(settings.gatewayPort));
  };

  const isCustomized = useMemo(
    () =>
      !!settings &&
      (settings.gatewayHost !== DEFAULT_GATEWAY_HOST ||
        settings.gatewayPort !== DEFAULT_GATEWAY_PORT),
    [settings],
  );

  return (
    <VStack align="stretch" spacing={3} p={3}>
      <HStack>
        <IconButton
          aria-label="Back"
          icon={<ArrowBackIcon />}
          size="sm"
          onClick={onBack}
          variant="ghost"
        />
        <Text fontSize="md" fontWeight="800" color="fg.primary" textTransform="uppercase">
          dapp3 - ENS Browsing
        </Text>
      </HStack>

      <ThemedCard p={3}>
        <VStack align="stretch" spacing={2}>
          <HStack align="center" spacing={3}>
            <Text fontSize="sm" fontWeight="700" color="fg.primary" flex={1} minW={0}>
              Enable
            </Text>
            {renderToggle("enabled", settings?.enabled ?? true, false)}
          </HStack>
          <Text fontSize="xs" color="fg.secondary">
            {!settings?.enabled
              ? "WalletChan does not intercept .eth navigations."
              : settings.useLocalGateway && kuboStatus === "online"
                ? "Resolving via your local IPFS node."
                : "Routing .eth via eth.limo and w3eth.io."}
          </Text>
        </VStack>
      </ThemedCard>

      <ThemedCard p={3}>
        <VStack align="stretch" spacing={2}>
          <HStack align="center" spacing={3}>
            <Text fontSize="sm" fontWeight="700" color="fg.primary" flex={1} minW={0}>
              Local Kubo gateway
            </Text>
            {renderToggle(
              "useLocalGateway",
              settings?.useLocalGateway ?? false,
              !settings?.enabled,
            )}
          </HStack>
          <Text fontSize="xs" color="fg.secondary">
            Serve IPFS / IPNS from your local IPFS Desktop or CLI when running.
          </Text>
          <HStack spacing={2} align="center">
            <HStack
              spacing={1.5}
              align="center"
              px={2}
              py={1}
              borderRadius="md"
              bg={
                kuboStatus === "online"
                  ? "status.success.bg"
                  : kuboStatus === "offline"
                    ? "status.warning.bg"
                    : "surface.sunken"
              }
              color={
                kuboStatus === "online"
                  ? "status.success.fg"
                  : kuboStatus === "offline"
                    ? "status.warning.fg"
                    : "fg.muted"
              }
            >
              {kuboStatus === "checking" ? (
                <Spinner size="xs" />
              ) : (
                <Box
                  w={2}
                  h={2}
                  borderRadius="full"
                  bg={kuboStatus === "online" ? "chart.positive" : "chart.negative"}
                />
              )}
              <Text fontSize="xs" fontWeight={700}>
                {kuboStatus === "online"
                  ? `IPFS online (${settings?.gatewayHost ?? DEFAULT_GATEWAY_HOST}:${settings?.gatewayPort ?? DEFAULT_GATEWAY_PORT})`
                  : kuboStatus === "offline"
                    ? "IPFS not reachable"
                    : `Checking ${settings?.gatewayHost ?? DEFAULT_GATEWAY_HOST}:${settings?.gatewayPort ?? DEFAULT_GATEWAY_PORT}…`}
              </Text>
            </HStack>
            <IconButton
              aria-label="Re-check IPFS"
              icon={
                <Icon
                  as={RepeatIcon}
                  animation={
                    kuboStatus === "checking"
                      ? `${spin} 0.9s linear infinite`
                      : undefined
                  }
                />
              }
              size="xs"
              variant="ghost"
              onClick={probeKubo}
              isDisabled={kuboStatus === "checking"}
            />
          </HStack>
          {kuboStatus === "offline" && (
            <Text fontSize="xs" color="fg.muted">
              Install{" "}
              <Link
                href="https://docs.ipfs.tech/install/ipfs-desktop/"
                isExternal
                color="accent.primary"
                textDecoration="underline"
              >
                IPFS Desktop
              </Link>{" "}
              or run <Text as="span" fontFamily="mono">ipfs daemon</Text>.
            </Text>
          )}
        </VStack>
      </ThemedCard>

      <ThemedCard p={3}>
        <VStack align="stretch" spacing={2}>
          <HStack align="center" spacing={3}>
            <Text fontSize="sm" fontWeight="700" color="fg.primary" flex={1} minW={0}>
              Pin onchain HTML
            </Text>
            {renderToggle(
              "pinOnchainHtml",
              settings?.pinOnchainHtml ?? false,
              !settings?.enabled || !settings?.useLocalGateway,
              async (e) => {
                if (!settings || pending) return;
                const next = e.target.checked;
                setPending("pinOnchainHtml");
                setSettings({ ...settings, pinOnchainHtml: next });
                try {
                  await setEnsBrowsingSetting("pinOnchainHtml", next);
                  if (next) {
                    // Probe the Kubo API up-front. Only open setup-kubo.html
                    // when CORS is actually blocking writes — otherwise the
                    // user has a working setup and doesn't need the wizard.
                    setKuboApiStatus("checking");
                    const probe = await new Promise<
                      | {
                          ok?: boolean;
                          probe?:
                            | { ok: true; version?: string }
                            | { ok: false; kind: { kind: string } };
                        }
                      | undefined
                    >((resolve) => {
                      chrome.runtime.sendMessage(
                        { type: "ens-probe-kubo-api" },
                        resolve,
                      );
                    });
                    if (!probe?.ok || !probe.probe) {
                      setKuboApiStatus("error");
                    } else if (probe.probe.ok) {
                      setKuboApiStatus("ok");
                    } else {
                      const k = probe.probe.kind.kind;
                      setKuboApiStatus(
                        k === "cors"
                          ? "cors-blocked"
                          : k === "unreachable"
                            ? "unreachable"
                            : "error",
                      );
                      if (k === "cors") {
                        chrome.tabs.create({
                          url: chrome.runtime.getURL("setup-kubo.html"),
                        });
                      }
                    }
                  }
                } finally {
                  setPending(null);
                }
              },
            )}
          </HStack>
          <Text fontSize="xs" color="fg.secondary">
            Cache ERC-4804 dapps in Kubo. One-time setup.
          </Text>
          {settings?.pinOnchainHtml && (
            <HStack spacing={1} align="center">
              <IconButton
                aria-label="Re-check Kubo API"
                icon={
                  <Icon
                    as={RepeatIcon}
                    animation={
                      kuboApiStatus === "checking"
                        ? `${spin} 0.9s linear infinite`
                        : undefined
                    }
                  />
                }
                size="xs"
                variant="ghost"
                onClick={probeKuboApi}
                isDisabled={kuboApiStatus === "checking"}
              />
              <HStack
                spacing={1.5}
                align="center"
                px={2}
                py={1}
                borderRadius="md"
                bg={
                  kuboApiStatus === "ok"
                    ? "status.success.bg"
                    : kuboApiStatus === "cors-blocked" ||
                        kuboApiStatus === "unreachable" ||
                        kuboApiStatus === "error"
                      ? "status.warning.bg"
                      : "surface.sunken"
                }
                color={
                  kuboApiStatus === "ok"
                    ? "status.success.fg"
                    : kuboApiStatus === "cors-blocked" ||
                        kuboApiStatus === "unreachable" ||
                        kuboApiStatus === "error"
                      ? "status.warning.fg"
                      : "fg.muted"
                }
              >
                {kuboApiStatus === "checking" || kuboApiStatus === "idle" ? (
                  <Spinner size="xs" />
                ) : (
                  <Box
                    w={2}
                    h={2}
                    borderRadius="full"
                    bg={
                      kuboApiStatus === "ok" ? "chart.positive" : "chart.negative"
                    }
                  />
                )}
                <Text fontSize="xs" fontWeight={700}>
                  {kuboApiStatus === "ok"
                    ? "Pinning ready"
                    : kuboApiStatus === "cors-blocked"
                      ? "CORS not allowed"
                      : kuboApiStatus === "unreachable"
                        ? "Kubo API unreachable"
                        : kuboApiStatus === "error"
                          ? "Kubo API error"
                          : "Checking Kubo API…"}
                </Text>
              </HStack>
              {kuboApiStatus === "cors-blocked" && (
                <Button
                  size="xs"
                  ml="auto"
                  bg="accent.secondary"
                  color="accentFg.secondary"
                  rightIcon={<ArrowForwardIcon />}
                  _hover={{ filter: "brightness(1.1)" }}
                  onClick={() => {
                    chrome.tabs.create({
                      url: chrome.runtime.getURL("setup-kubo.html"),
                    });
                  }}
                >
                  Open setup
                </Button>
              )}
            </HStack>
          )}
        </VStack>
      </ThemedCard>

      {settings?.useLocalGateway && (
        <ThemedCard p={3}>
          <VStack align="stretch" spacing={2}>
            <HStack
              as="button"
              onClick={() => setGatewayOpen((v) => !v)}
              spacing={2}
              align="center"
              cursor="pointer"
              _hover={{ color: "accent.primary" }}
            >
              {gatewayOpen ? (
                <ChevronDownIcon boxSize={4} />
              ) : (
                <ChevronRightIcon boxSize={4} />
              )}
              <Text fontSize="sm" fontWeight="700" color="fg.primary">
                Gateway URL
              </Text>
              <Text fontSize="xs" color="fg.muted">
                (optional)
              </Text>
              {isCustomized && (
                <Text
                  fontSize="xs"
                  fontFamily="mono"
                  color="fg.muted"
                  ml="auto"
                  isTruncated
                >
                  {settings?.gatewayHost}:{settings?.gatewayPort}
                </Text>
              )}
            </HStack>
            <Collapse in={gatewayOpen} animateOpacity>
              <VStack align="stretch" spacing={3} pt={2}>
                <Text fontSize="xs" color="fg.secondary">
                  Override the host or port if your Kubo subdomain gateway
                  isn't on the default{" "}
                  <Text as="span" fontFamily="mono">
                    localhost:8080
                  </Text>
                  .
                </Text>

                <Box
                  bg="surface.sunken"
                  border={tokens.borders.thin}
                  borderColor="border.default"
                  borderRadius={tokens.radii.card}
                  px={3}
                  py={2}
                  fontFamily="mono"
                  fontSize="xs"
                  color="fg.muted"
                  whiteSpace="nowrap"
                  overflowX="auto"
                >
                  http://&lt;cid&gt;.ipfs.
                  <Text as="span" color="fg.primary" fontWeight={700}>
                    {hostDraft || DEFAULT_GATEWAY_HOST}
                  </Text>
                  :
                  <Text as="span" color="fg.primary" fontWeight={700}>
                    {portDraft || DEFAULT_GATEWAY_PORT}
                  </Text>
                  /
                </Box>

                <HStack spacing={2} align="end">
                  <VStack align="stretch" spacing={1} flex={1} minW={0}>
                    <Text
                      fontSize="xs"
                      fontWeight={700}
                      color="fg.muted"
                      letterSpacing="0.04em"
                    >
                      HOST
                    </Text>
                    <Input
                      value={hostDraft}
                      onChange={(e) => setHostDraft(e.target.value)}
                      placeholder={DEFAULT_GATEWAY_HOST}
                      size="sm"
                      fontFamily="mono"
                      isDisabled={pending !== null}
                    />
                  </VStack>
                  <VStack align="stretch" spacing={1} w="90px">
                    <Text
                      fontSize="xs"
                      fontWeight={700}
                      color="fg.muted"
                      letterSpacing="0.04em"
                    >
                      PORT
                    </Text>
                    <Input
                      value={portDraft}
                      onChange={(e) => setPortDraft(e.target.value)}
                      placeholder={String(DEFAULT_GATEWAY_PORT)}
                      size="sm"
                      fontFamily="mono"
                      type="number"
                      inputMode="numeric"
                      isDisabled={pending !== null}
                    />
                  </VStack>
                </HStack>

                {!portValid && portDraft.trim().length > 0 && (
                  <Text fontSize="xs" color="status.error.fg">
                    Port must be an integer between 1 and 65535.
                  </Text>
                )}

                {settings && !isDefaultGatewayHost(settings.gatewayHost) && (
                  <Text fontSize="xs" color="status.warning.fg">
                    Identity banner only renders on{" "}
                    <Text as="span" fontFamily="mono">
                      localhost
                    </Text>
                    . Routing still works on custom hosts.
                  </Text>
                )}

                <HStack spacing={2} justify="space-between">
                  <HStack spacing={2}>
                    {isDirty && !justSaved && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={resetGatewayDrafts}
                        isDisabled={pending !== null}
                      >
                        Cancel
                      </Button>
                    )}
                    {!isDirty && isCustomized && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setHostDraft(DEFAULT_GATEWAY_HOST);
                          setPortDraft(String(DEFAULT_GATEWAY_PORT));
                        }}
                        isDisabled={pending !== null}
                      >
                        Reset to default
                      </Button>
                    )}
                  </HStack>
                  <Button
                    size="sm"
                    onClick={saveGateway}
                    isDisabled={!canSave || pending !== null}
                    leftIcon={justSaved ? <CheckIcon /> : undefined}
                  >
                    {justSaved ? "Saved" : "Save"}
                  </Button>
                </HStack>
              </VStack>
            </Collapse>
          </VStack>
        </ThemedCard>
      )}

      <Box pt={1}>
        <Text fontSize="xs" color="fg.muted">
          Type any .eth name in the address bar to open it directly. WalletChan
          resolves the contenthash via your mainnet RPC.
        </Text>
      </Box>
    </VStack>
  );
}
