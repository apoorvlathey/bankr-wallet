import { useMemo, useState } from "react";
import {
  Button,
  Box,
  Input,
  VStack,
  HStack,
  Text,
  FormControl,
  FormLabel,
  Alert,
  AlertIcon,
  Spinner,
} from "@chakra-ui/react";
import { ExternalLinkIcon, WarningTwoIcon } from "@chakra-ui/icons";
import { useNetworks } from "@/contexts/NetworksContext";
import type { PendingAddChainRequest } from "@/chrome/requests/pendingAddChainStorage";
import { KNOWN_CHAINS } from "@/constants/knownChains.generated";
import { InlineDisclosure } from "@/components/ui";
import { AddChainConfirmationScreen } from "./AddChainConfirmationScreen";
import { SettingsScreenFrame } from "./SettingsScreenFrame";
import {
  assertRpcEndpointAllowedForOrigin,
  probeRpcChainId,
} from "@/chrome/network/rpcClient";

interface AddChainProps {
  back: (options?: { added?: boolean }) => void;
  initialRequest?: PendingAddChainRequest;
  mode?: "settings" | "dapp";
  onAdded?: (chainName: string, chainId: number) => void;
}

type NetworkMutationResponse = {
  success: boolean;
  chainName?: string;
  chainId?: number;
  error?: string;
};

function AddChain({
  back,
  initialRequest,
  mode = "settings",
  onAdded,
}: AddChainProps) {
  const { networksInfo, setReloadRequired } = useNetworks();

  const defaultName = initialRequest?.chainName ?? "";
  const defaultChainId =
    initialRequest?.chainId != null ? String(initialRequest.chainId) : "";
  const defaultRpc = initialRequest?.rpcUrls?.[0] ?? "";
  const defaultExplorer = initialRequest?.blockExplorerUrls?.[0] ?? "";
  const defaultCurrencySymbol = initialRequest?.nativeCurrency?.symbol ?? "ETH";
  const defaultCurrencyDecimals = String(
    initialRequest?.nativeCurrency?.decimals ?? 18,
  );

  const [chainName, setChainName] = useState(defaultName);
  const [chainId, setChainId] = useState(defaultChainId);
  const [rpc, setRpc] = useState(defaultRpc);
  const [explorer, setExplorer] = useState(defaultExplorer);
  const [currencySymbol, setCurrencySymbol] = useState(defaultCurrencySymbol);
  const [currencyDecimals, setCurrencyDecimals] = useState(defaultCurrencyDecimals);
  const [isBtnLoading, setIsBtnLoading] = useState(false);
  const [isDetecting, setIsDetecting] = useState(false);
  const [technicalOpen, setTechnicalOpen] = useState(!defaultRpc);

  // Validation states
  const [nameError, setNameError] = useState("");
  const [chainIdConflict, setChainIdConflict] = useState("");
  const [rpcWarning, setRpcWarning] = useState("");
  const [rpcError, setRpcError] = useState("");
  const knownChainForHint = useMemo(() => {
    const parsed = parseInt(chainId, 10);
    if (!Number.isFinite(parsed)) return null;
    return KNOWN_CHAINS[parsed] ?? null;
  }, [chainId]);
  const rpcProbeOptions =
    mode === "dapp"
      ? { requestOrigin: initialRequest?.origin }
      : { allowPrivateWithoutOrigin: true };

  const checkChainIdConflict = (id: string) => {
    if (!id || !networksInfo) {
      setChainIdConflict("");
      return;
    }
    const numId = parseInt(id);
    for (const name of Object.keys(networksInfo)) {
      if (networksInfo[name].chainId === numId) {
        setChainIdConflict(`Chain ID ${numId} already exists as "${name}". You can edit its RPC in the chain list.`);
        return;
      }
    }
    setChainIdConflict("");
  };

  /**
   * Apply canonical metadata for a known chain into empty form fields.
   * Deliberately non-destructive: anything the user has already typed is
   * preserved (they may be customising). Called both when chainId is
   * detected from an RPC and when the user types the chainId directly.
   */
  const applyKnownChainPrefill = (id: number) => {
    const known = KNOWN_CHAINS[id];
    if (!known) return;
    setChainName((current) => (current.trim() ? current : known.name));
    setExplorer((current) => (current.trim() ? current : known.explorer));
    setCurrencySymbol((current) =>
      current.trim() ? current : known.nativeCurrency.symbol,
    );
    setCurrencyDecimals((current) =>
      current.trim() ? current : String(known.nativeCurrency.decimals),
    );
  };

  const buildEntry = () => ({
    chainId: parseInt(chainId, 10),
    rpcUrl: rpc,
    isCustom: true,
    explorer: explorer.replace(/\/+$/, "") || undefined,
    nativeCurrency: {
      name: currencySymbol || "ETH",
      symbol: currencySymbol || "ETH",
      decimals: parseInt(currencyDecimals, 10) || 18,
    },
  });

  const handleRpcChange = async (value: string) => {
    const trimmed = value.trim();
    setRpc(trimmed);
    setRpcWarning("");
    setRpcError("");

    if (!trimmed || !trimmed.startsWith("http")) return;

    // Auto-detect chainId from RPC
    setIsDetecting(true);
    try {
      const detectedId = await probeRpcChainId(trimmed, rpcProbeOptions);
      if (detectedId !== null) {
        setChainId(detectedId.toString());
        checkChainIdConflict(detectedId.toString());
        applyKnownChainPrefill(detectedId);
        setRpcError("");
      } else {
        setRpcError("Could not fetch chain ID from this RPC. It may be down or invalid.");
      }
    } catch {
      setRpcError("Failed to connect to RPC endpoint.");
    }
    setIsDetecting(false);
  };

  const handleRpcPaste = async (e: React.ClipboardEvent<HTMLInputElement>) => {
    const pasted = e.clipboardData.getData("Text").trim();
    // Prevent double-handling since onChange will also fire
    e.preventDefault();
    setRpc(pasted);
    await handleRpcChange(pasted);
  };

  const addChain = async () => {
    setIsBtnLoading(true);
    setNameError("");
    setRpcWarning("");

    if (!chainName || !chainId || !rpc) {
      if (!rpc) setTechnicalOpen(true);
      setIsBtnLoading(false);
      return;
    }

    // Check name uniqueness
    if (networksInfo && networksInfo[chainName]) {
      setNameError("Chain name already exists");
      setIsBtnLoading(false);
      return;
    }

    // Validate RPC returns expected chainId
    try {
      assertRpcEndpointAllowedForOrigin(
        rpc,
        mode === "dapp" ? initialRequest?.origin : undefined,
        { allowPrivateWithoutOrigin: mode !== "dapp" },
      );
    } catch (error) {
      setRpcWarning(
        error instanceof Error ? error.message : "This RPC URL is not allowed.",
      );
      setTechnicalOpen(true);
      setIsBtnLoading(false);
      return;
    }

    const detectedId = await probeRpcChainId(rpc, rpcProbeOptions);
    if (detectedId === null) {
      setRpcWarning("Could not verify RPC — endpoint may be down. Chain saved anyway.");
      setTechnicalOpen(true);
    } else if (detectedId !== parseInt(chainId)) {
      setRpcWarning(`RPC returned chain ID ${detectedId}, but you entered ${chainId}. Please verify.`);
      setTechnicalOpen(true);
      setIsBtnLoading(false);
      return;
    }

    if (mode === "dapp" && initialRequest) {
      const result = await new Promise<{
        success: boolean;
        chainName?: string;
        error?: string;
      }>((resolve) => {
        chrome.runtime.sendMessage(
          {
            type: "confirmAddChain",
            requestId: initialRequest.id,
            chainName,
            chainId: parseInt(chainId, 10),
            rpcUrl: rpc,
            explorer: explorer.replace(/\/+$/, "") || undefined,
            nativeCurrency: {
              name: currencySymbol || "ETH",
              symbol: currencySymbol || "ETH",
              decimals: parseInt(currencyDecimals, 10) || 18,
            },
          },
          (response) =>
            resolve(
              response ?? {
                success: false,
                error: chrome.runtime.lastError?.message || "Failed to add network.",
              },
            ),
        );
      });

      if (!result.success) {
        setRpcWarning(result.error || "Failed to add network.");
        setTechnicalOpen(true);
        setIsBtnLoading(false);
        return;
      }

      onAdded?.(result.chainName || chainName, parseInt(chainId, 10));
      back({ added: true });
      setIsBtnLoading(false);
      return;
    }

    const result = await new Promise<NetworkMutationResponse>((resolve) => {
      chrome.runtime.sendMessage(
        {
          type: "addNetwork",
          chainName,
          entry: buildEntry(),
        },
        (response) =>
          resolve(
            response ?? {
              success: false,
              error: chrome.runtime.lastError?.message || "Failed to add network.",
            },
          ),
      );
    });

    if (!result.success) {
      setRpcWarning(result.error || "Failed to add network.");
      setTechnicalOpen(true);
      setIsBtnLoading(false);
      return;
    }

    if (!networksInfo || Object.keys(networksInfo).length === 0) {
      setReloadRequired(true);
    }

    onAdded?.(result.chainName || chainName, result.chainId || parseInt(chainId, 10));
    back({ added: true });
    setIsBtnLoading(false);
  };

  if (mode === "dapp") {
    return (
      <AddChainConfirmationScreen
        chainName={chainName}
        chainId={chainId}
        requestOrigin={initialRequest?.origin ?? ""}
        requestFavicon={initialRequest?.favicon ?? null}
        nameError={nameError}
        chainIdConflict={chainIdConflict}
        knownChainName={knownChainForHint?.name}
        rpc={rpc}
        rpcError={rpcError}
        rpcWarning={rpcWarning}
        isDetecting={isDetecting}
        explorer={explorer}
        currencySymbol={currencySymbol}
        currencyDecimals={currencyDecimals}
        technicalOpen={technicalOpen}
        isSubmitting={isBtnLoading}
        isApproveDisabled={!chainName || !chainId || !rpc || !!chainIdConflict}
        onBack={() => back()}
        onApprove={addChain}
        onOpenChainlist={() =>
          chrome.tabs.create({ url: "https://chainlist.org" })
        }
        onChainNameChange={(event) => {
          setChainName(event.target.value);
          if (nameError) setNameError("");
        }}
        onChainIdChange={(event) => {
          setChainId(event.target.value);
          checkChainIdConflict(event.target.value);
          const parsed = parseInt(event.target.value, 10);
          if (parsed && !Number.isNaN(parsed)) {
            applyKnownChainPrefill(parsed);
          }
        }}
        onRpcChange={(event) => handleRpcChange(event.target.value)}
        onRpcPaste={handleRpcPaste}
        onExplorerChange={(event) => setExplorer(event.target.value.trim())}
        onCurrencySymbolChange={(event) =>
          setCurrencySymbol(event.target.value.trim())
        }
        onCurrencyDecimalsChange={(event) =>
          setCurrencyDecimals(event.target.value)
        }
        onTechnicalOpenChange={setTechnicalOpen}
      />
    );
  }

  return (
    <SettingsScreenFrame
      title="Add network"
      onBack={() => back()}
      trailing={
        <Button
          variant="ghost"
          size="sm"
          rightIcon={<ExternalLinkIcon boxSize={3.5} />}
          onClick={() => chrome.tabs.create({ url: "https://chainlist.org" })}
        >
          Chainlist
        </Button>
      }
      secondaryAction={
        <Button variant="secondary" onClick={() => back()}>
          Cancel
        </Button>
      }
      primaryAction={
        <Button
          variant="brand"
          onClick={addChain}
          isLoading={isBtnLoading}
          loadingText="Adding"
          isDisabled={!chainName || !chainId || !rpc || !!chainIdConflict}
        >
          Add network
        </Button>
      }
    >
      <VStack spacing={5} align="stretch">
        <Box>
          <Text color="fg.primary" fontSize="md" fontWeight="600">
            Connect a custom EVM network
          </Text>
          <Text mt={1} color="fg.secondary" fontSize="sm" lineHeight="1.45">
            Enter a trusted RPC endpoint. WalletChan will check its chain ID
            before saving the connection.
          </Text>
        </Box>

        <VStack
          spacing={4}
          align="stretch"
          p={4}
          bg="surface.raised"
          borderWidth="1px"
          borderColor="border.subtle"
          borderRadius="lg"
        >
          <FormControl isInvalid={!!rpcError}>
            <FormLabel mb={1.5} color="fg.secondary" fontSize="sm" fontWeight="500">
              RPC URL
            </FormLabel>
            <HStack>
              <Input
                autoFocus
                placeholder="https://rpc.example.com"
                value={rpc}
                onChange={(event) => handleRpcChange(event.target.value)}
                onPaste={handleRpcPaste}
              />
              {isDetecting && <Spinner size="sm" flexShrink={0} />}
            </HStack>
            <Text mt={1} color="fg.secondary" fontSize="xs">
              Paste or enter an endpoint to detect its chain ID.
            </Text>
            {rpcError && (
              <Text mt={1} color="chart.negative" fontSize="xs" fontWeight="600">
                {rpcError}
              </Text>
            )}
          </FormControl>

          <FormControl isInvalid={!!chainIdConflict}>
            <FormLabel mb={1.5} color="fg.secondary" fontSize="sm" fontWeight="500">
              Chain ID
            </FormLabel>
            <Input
              placeholder="e.g., 43114"
              type="number"
              value={chainId}
              onChange={(event) => {
                setChainId(event.target.value);
                checkChainIdConflict(event.target.value);
                const parsed = parseInt(event.target.value, 10);
                if (parsed && !Number.isNaN(parsed)) {
                  applyKnownChainPrefill(parsed);
                }
              }}
            />
            {chainIdConflict && (
              <Alert status="warning" mt={2} py={2} px={3}>
                <AlertIcon />
                <Text color="status.warning.fg" fontSize="xs" fontWeight="600">
                  {chainIdConflict}
                </Text>
              </Alert>
            )}
            {knownChainForHint && !chainIdConflict && (
              <Alert status="info" mt={2} py={2} px={3}>
                <AlertIcon />
                <Text color="status.info.fg" fontSize="xs" fontWeight="600">
                  EIP-7702 atomic batching is enabled by default for{" "}
                  {knownChainForHint.name}; no manual delegate setup is needed.
                </Text>
              </Alert>
            )}
          </FormControl>

          <FormControl isInvalid={!!nameError}>
            <FormLabel mb={1.5} color="fg.secondary" fontSize="sm" fontWeight="500">
              Network name
            </FormLabel>
            <Input
              placeholder="e.g., Avalanche C-Chain"
              value={chainName}
              onChange={(event) => {
                setChainName(event.target.value);
                if (nameError) setNameError("");
              }}
            />
            <Text mt={1} color="fg.secondary" fontSize="xs">
              This is the name shown in WalletChan.
            </Text>
            {nameError && (
              <Text mt={1} color="chart.negative" fontSize="xs" fontWeight="600">
                {nameError}
              </Text>
            )}
          </FormControl>

          <InlineDisclosure
            label="Advanced network details"
            description="Explorer and native currency metadata"
          >
            <VStack spacing={4} align="stretch" pt={2}>
              <FormControl>
                <FormLabel mb={1.5} color="fg.secondary" fontSize="sm" fontWeight="500">
                  Block explorer URL
                </FormLabel>
                <Input
                  placeholder="https://explorer.example.com"
                  value={explorer}
                  onChange={(event) => setExplorer(event.target.value.trim())}
                />
                <Text mt={1} color="fg.secondary" fontSize="xs">
                  Optional. Used for transaction and address links.
                </Text>
              </FormControl>

              <HStack spacing={3} align="flex-start">
                <FormControl flex={2}>
                  <FormLabel mb={1.5} color="fg.secondary" fontSize="sm" fontWeight="500">
                    Native token symbol
                  </FormLabel>
                  <Input
                    placeholder="ETH"
                    value={currencySymbol}
                    onChange={(event) => setCurrencySymbol(event.target.value.trim())}
                  />
                </FormControl>
                <FormControl flex={1}>
                  <FormLabel mb={1.5} color="fg.secondary" fontSize="sm" fontWeight="500">
                    Decimals
                  </FormLabel>
                  <Input
                    type="number"
                    value={currencyDecimals}
                    onChange={(event) => setCurrencyDecimals(event.target.value)}
                  />
                </FormControl>
              </HStack>
            </VStack>
          </InlineDisclosure>
        </VStack>

        {rpcWarning && (
          <Alert status="warning" py={2} px={3}>
            <WarningTwoIcon mr={2} color="status.warning.fg" />
            <Text color="status.warning.fg" fontSize="xs" fontWeight="600">
              {rpcWarning}
            </Text>
          </Alert>
        )}
      </VStack>
    </SettingsScreenFrame>
  );
}

export default AddChain;
