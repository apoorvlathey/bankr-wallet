import { useEffect, useState } from "react";
import {
  Box,
  HStack,
  IconButton,
  Spacer,
  Spinner,
  Switch,
  Text,
  VStack,
} from "@chakra-ui/react";
import { ArrowBackIcon } from "@chakra-ui/icons";
import { ThemedCard } from "@/theme";
import {
  DEFAULT_ENS_BROWSING_SETTINGS,
  type EnsBrowsingSettings as Settings,
} from "@/chrome/ensBrowsing/settingsStorage";

interface EnsBrowsingSettingsProps {
  onBack: () => void;
}

// Single key in chrome.storage.local — read/write via the same helper the SW
// uses so the typed shape stays canonical.
const STORAGE_KEY = "ensBrowsing";

async function readSettings(): Promise<Settings> {
  const raw = await chrome.storage.local.get(STORAGE_KEY);
  const stored = (raw[STORAGE_KEY] as Partial<Settings> | undefined) ?? {};
  return {
    tier1: stored.tier1 !== false,
    tier2aLocalIpfs: stored.tier2aLocalIpfs === true,
    tier2bKubo: stored.tier2bKubo === true,
  };
}

async function writeSetting<K extends keyof Settings>(key: K, value: Settings[K]) {
  const current = await readSettings();
  const next: Settings = { ...current, [key]: value };
  await chrome.storage.local.set({ [STORAGE_KEY]: next });
  return next;
}

export default function EnsBrowsingSettings({ onBack }: EnsBrowsingSettingsProps) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [pending, setPending] = useState<keyof Settings | null>(null);

  useEffect(() => {
    readSettings().then(setSettings).catch(() => setSettings(DEFAULT_ENS_BROWSING_SETTINGS));
  }, []);

  const toggle = (key: keyof Settings) => async () => {
    if (!settings || pending) return;
    const next = !settings[key];
    setPending(key);
    setSettings({ ...settings, [key]: next });
    try {
      await writeSetting(key, next);
    } finally {
      setPending(null);
    }
  };

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
          ENS Browsing
        </Text>
      </HStack>

      <Box>
        <Text fontSize="xs" color="fg.muted">
          Type any <Text as="span" fontFamily="mono">.eth</Text> name (like{" "}
          <Text as="span" fontFamily="mono">vitalik.eth</Text>) in the address
          bar to open it directly. WalletChan resolves the ENS contenthash
          against your configured mainnet RPC and routes the navigation to the
          right gateway.
        </Text>
      </Box>

      <ThemedCard p={3}>
        <HStack align="start">
          <VStack align="start" spacing={0.5} flex={1}>
            <Text fontSize="sm" fontWeight="700" color="fg.primary">
              Route .eth via hosted gateways
            </Text>
            <Text fontSize="xs" color="fg.secondary">
              IPFS / IPNS contenthashes route to{" "}
              <Text as="span" fontFamily="mono">
                &lt;name&gt;.eth.limo
              </Text>
              ; onchain HTML (ERC-4804) dapps route to{" "}
              <Text as="span" fontFamily="mono">
                &lt;name&gt;.w3eth.io
              </Text>
              .
            </Text>
          </VStack>
          <Spacer />
          {settings === null ? (
            <Spinner size="sm" />
          ) : (
            <Switch
              isChecked={settings.tier1}
              onChange={toggle("tier1")}
              isDisabled={pending !== null}
            />
          )}
        </HStack>
      </ThemedCard>

      <ThemedCard p={3}>
        <HStack align="start">
          <VStack align="start" spacing={0.5} flex={1}>
            <Text fontSize="sm" fontWeight="700" color="fg.primary">
              Resolve via local Kubo gateway
            </Text>
            <Text fontSize="xs" color="fg.secondary">
              Requires{" "}
              <Text as="span" fontFamily="mono">
                IPFS Desktop
              </Text>{" "}
              (or a local Kubo node). When reachable, IPFS / IPNS sites stream
              from{" "}
              <Text as="span" fontFamily="mono">
                127.0.0.1:8080
              </Text>{" "}
              with a themed identity banner. Falls back to eth.limo silently
              when Kubo isn't running.
            </Text>
          </VStack>
          <Spacer />
          {settings === null ? (
            <Spinner size="sm" />
          ) : (
            <Switch
              isChecked={settings.tier2aLocalIpfs}
              onChange={toggle("tier2aLocalIpfs")}
              isDisabled={pending !== null || !settings.tier1}
            />
          )}
        </HStack>
      </ThemedCard>

      <ThemedCard p={3}>
        <VStack align="stretch" spacing={2}>
          <HStack align="start">
            <VStack align="start" spacing={0.5} flex={1}>
              <Text fontSize="sm" fontWeight="700" color="fg.primary">
                Pin onchain HTML to local Kubo
              </Text>
              <Text fontSize="xs" color="fg.secondary">
                Fetch ERC-4804 dapp bodies via your RPC, pin to Kubo, serve at{" "}
                <Text as="span" fontFamily="mono">
                  &lt;cid&gt;.ipfs.localhost
                </Text>
                . Requires a one-time Kubo CORS allowlist update.
              </Text>
            </VStack>
            <Spacer />
            {settings === null ? (
              <Spinner size="sm" />
            ) : (
              <Switch
                isChecked={settings.tier2bKubo}
                onChange={async (e) => {
                  if (!settings || pending) return;
                  const next = e.target.checked;
                  setPending("tier2bKubo");
                  setSettings({ ...settings, tier2bKubo: next });
                  try {
                    await writeSetting("tier2bKubo", next);
                    // First-enable: open the setup page so users discover
                    // the CORS commands without having to dig.
                    if (next) {
                      chrome.tabs.create({
                        url: chrome.runtime.getURL("setup-kubo.html"),
                      });
                    }
                  } finally {
                    setPending(null);
                  }
                }}
                isDisabled={
                  pending !== null || !settings.tier1 || !settings.tier2aLocalIpfs
                }
              />
            )}
          </HStack>
          {settings && settings.tier2bKubo && (
            <Box pt={1}>
              <Text
                as="a"
                fontSize="xs"
                color="accent.primary"
                cursor="pointer"
                textDecoration="underline"
                onClick={() => {
                  chrome.tabs.create({
                    url: chrome.runtime.getURL("setup-kubo.html"),
                  });
                }}
              >
                Open Kubo setup screen →
              </Text>
            </Box>
          )}
        </VStack>
      </ThemedCard>

      <Box>
        <Text fontSize="xs" color="fg.muted">
          Toggle off to let Chrome handle{" "}
          <Text as="span" fontFamily="mono">
            .eth
          </Text>{" "}
          navigations normally (DNS lookup will fail and Chrome will offer a
          search instead).
        </Text>
      </Box>
    </VStack>
  );
}
