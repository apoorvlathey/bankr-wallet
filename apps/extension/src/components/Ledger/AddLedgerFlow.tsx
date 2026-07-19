import { useEffect, useMemo, useState } from "react";
import {
  Badge,
  Box,
  Button,
  Checkbox,
  IconButton,
  Text,
  VStack,
} from "@chakra-ui/react";
import { ExternalLinkIcon } from "@chakra-ui/icons";
import { CopyButton } from "@/components/CopyButton";
import {
  AppHeader,
  AppScreen,
  ListItem,
  ListItemActions,
  ListItemContent,
  ListItemDescription,
  ListItemMedia,
  ListItemTitle,
  ListSurface,
  ScreenBody,
  ScreenSection,
  StickyActionBar,
} from "@/components/ui";
import { LedgerDevicePanel } from "./LedgerDevicePanel";
import {
  LedgerDerivationPicker,
  type LedgerDerivationScheme,
} from "./LedgerDerivationPicker";

type Scheme = LedgerDerivationScheme;
type AddressRow = {
  address: `0x${string}`;
  hdPath: string;
  hdIndex: number;
};
type Device = {
  deviceId: string;
  deviceLabel: string;
  deviceModel: string;
};

export interface AddLedgerFlowProps {
  onBack(): void;
  onComplete(): void;
}

const STATUS_LABELS: Record<string, string> = {
  connecting: "Connecting to Ledger…",
  "awaiting-app": "Open the Ethereum app on your Ledger…",
  scanning: "Reading addresses from your Ledger…",
  "awaiting-confirmation": "Review and approve on your Ledger…",
  signing: "Waiting for your Ledger…",
};

export default function AddLedgerFlow({
  onBack,
  onComplete,
}: AddLedgerFlowProps) {
  const [device, setDevice] = useState<Device | null>(null);
  const [addresses, setAddresses] = useState<AddressRow[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [scheme, setScheme] = useState<Scheme>("ledgerLive");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(
    "Unlock your Ledger and open the Ethereum app.",
  );
  const [error, setError] = useState<string | null>(null);
  const [existingAddresses, setExistingAddresses] = useState<Set<string>>(
    new Set(),
  );
  const opId = useMemo(() => crypto.randomUUID(), []);

  useEffect(() => {
    chrome.runtime.sendMessage(
      { type: "getAccounts" },
      (accounts: Array<{ type: string; address: string }> | undefined) => {
        setExistingAddresses(
          new Set(
            (accounts ?? [])
              .filter((account) => account.type !== "impersonator")
              .map((account) => account.address.toLowerCase()),
          ),
        );
      },
    );
  }, []);

  useEffect(() => {
    const listener = (message: {
      type?: string;
      opId?: string;
      status?: string;
    }) => {
      if (
        message.type !== "offscreenLedgerStatus" ||
        message.opId !== opId
      ) {
        return;
      }
      if (message.status && STATUS_LABELS[message.status]) {
        setStatus(STATUS_LABELS[message.status]);
      }
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, [opId]);

  const scan = async (
    target: Device,
    targetScheme: Scheme,
    startIndex: number,
    replace: boolean,
  ) => {
    setBusy(true);
    setError(null);
    try {
      const response = await chrome.runtime.sendMessage({
        type: "ledgerScan",
        opId,
        deviceId: target.deviceId,
        startIndex,
        count: 5,
        scheme: targetScheme,
      });
      if (!response?.success) {
        throw new Error(response?.error || "Could not read Ledger addresses.");
      }
      const rows = response.addresses as AddressRow[];
      setAddresses((current) => (replace ? rows : [...current, ...rows]));
      setStatus("Ledger connected. Select the accounts you want to add.");
      if (replace) {
        const firstNew = rows.find(
          (row) => !existingAddresses.has(row.address.toLowerCase()),
        );
        setSelected(
          new Set(firstNew ? [firstNew.address.toLowerCase()] : []),
        );
      }
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not read Ledger addresses.",
      );
    } finally {
      setBusy(false);
    }
  };

  const connect = async () => {
    setBusy(true);
    setError(null);
    try {
      const hid = (
        navigator as Navigator & {
          hid?: {
            requestDevice(options: {
              filters: Array<{ vendorId: number }>;
            }): Promise<Array<{ productName?: string }>>;
          };
        }
      ).hid;
      if (!hid) throw new Error("Ledger support requires Chrome 124 or newer.");
      const chosen = await hid.requestDevice({
        filters: [{ vendorId: 0x2c97 }],
      });
      if (!chosen.length) throw new Error("No Ledger device selected.");
      const response = await chrome.runtime.sendMessage({
        type: "ledgerConnect",
        opId,
        productName: chosen[0].productName,
      });
      if (!response?.success) {
        throw new Error(response?.error || "Could not connect to Ledger.");
      }
      const nextDevice = response as Device & { success: true };
      setDevice(nextDevice);
      await scan(nextDevice, scheme, 0, true);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not connect to Ledger.",
      );
    } finally {
      setBusy(false);
    }
  };

  const changeScheme = (value: Scheme) => {
    setScheme(value);
    setAddresses([]);
    setSelected(new Set());
    if (device) void scan(device, value, 0, true);
  };

  const addSelected = async () => {
    if (!device || !selected.size) return;
    setBusy(true);
    setError(null);
    setStatus("Adding Ledger accounts…");
    try {
      const chosen = addresses.filter((row) =>
        selected.has(row.address.toLowerCase()),
      );
      const response = await chrome.runtime.sendMessage({
        type: "addLedgerAccounts",
        ...device,
        addresses: chosen,
      });
      if (!response?.success) {
        throw new Error(response?.error || "Could not add Ledger accounts.");
      }
      onComplete();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not add Ledger accounts.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <AppScreen>
      <AppHeader title="Connect Ledger" onBack={onBack} />
      <ScreenBody pt={5}>
        <VStack spacing={6} align="stretch">
          <LedgerDevicePanel device={device} busy={busy} status={status} />

          {device && (
            <LedgerDerivationPicker value={scheme} onChange={changeScheme} />
          )}

          {device && (
            <ScreenSection
              title="Choose accounts"
              description="Select one or more addresses to add."
            >
              <ListSurface>
                {addresses.map((row) => {
                  const key = row.address.toLowerCase();
                  const alreadyAdded = existingAddresses.has(key);
                  const checked = selected.has(key);
                  return (
                    <ListItem
                      key={`${row.hdPath}:${key}`}
                      interactive
                      isDisabled={alreadyAdded}
                      isSelected={checked}
                      onClick={() => {
                        if (alreadyAdded) return;
                        setSelected((current) => {
                          const next = new Set(current);
                          if (next.has(key)) next.delete(key);
                          else next.add(key);
                          return next;
                        });
                      }}
                    >
                      <ListItemMedia>
                        <Checkbox
                          isChecked={checked}
                          isDisabled={alreadyAdded}
                          pointerEvents="none"
                          aria-label={`Select ${row.address}`}
                        />
                      </ListItemMedia>
                      <ListItemContent>
                        <ListItemTitle fontFamily="mono">
                          {row.address.slice(0, 8)}…{row.address.slice(-6)}
                        </ListItemTitle>
                        <ListItemDescription fontFamily="mono">
                          {row.hdPath}
                        </ListItemDescription>
                      </ListItemContent>
                      <ListItemActions>
                        {alreadyAdded && <Badge>Added</Badge>}
                        <CopyButton value={row.address} />
                        <IconButton
                          as="a"
                          href={`https://etherscan.io/address/${row.address}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label="View address on explorer"
                          icon={<ExternalLinkIcon />}
                          size="xs"
                          variant="ghost"
                          onClick={(event) => event.stopPropagation()}
                        />
                      </ListItemActions>
                    </ListItem>
                  );
                })}
              </ListSurface>
              <Button
                mt={3}
                w="full"
                variant="secondary"
                isDisabled={busy}
                onClick={() => void scan(device, scheme, addresses.length, false)}
              >
                Load 5 more
              </Button>
            </ScreenSection>
          )}

          {error && (
            <Box
              role="alert"
              p={3}
              bg="status.error.bg"
              border="1px solid"
              borderColor="status.error.border"
              borderRadius="md"
            >
              <Text color="status.error.fg" fontSize="sm" fontWeight="600">
                {error}
              </Text>
            </Box>
          )}
        </VStack>
      </ScreenBody>
      <StickyActionBar
        primaryAction={
          device ? (
            <Button
              variant="brand"
              isLoading={busy}
              loadingText="Adding…"
              isDisabled={!selected.size}
              onClick={() => void addSelected()}
            >
              Add {selected.size || ""} account{selected.size === 1 ? "" : "s"}
            </Button>
          ) : (
            <Button
              variant="brand"
              isLoading={busy}
              loadingText="Connecting…"
              onClick={() => void connect()}
            >
              Connect Ledger
            </Button>
          )
        }
      />
    </AppScreen>
  );
}
