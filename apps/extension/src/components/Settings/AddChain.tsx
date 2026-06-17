import { useMemo, useState } from "react";
import {
  Button,
  Box,
  Input,
  VStack,
  HStack,
  Text,
  IconButton,
  Spacer,
  FormControl,
  FormLabel,
  Alert,
  AlertIcon,
  Spinner,
} from "@chakra-ui/react";
import { ArrowBackIcon, ExternalLinkIcon, WarningTwoIcon } from "@chakra-ui/icons";
import { useNetworks } from "@/contexts/NetworksContext";
import { isDarkThemeId, useTheme } from "@/theme";
import type { PendingAddChainRequest } from "@/chrome/pendingAddChainStorage";
import { KNOWN_CHAINS } from "@/constants/knownChains.generated";

interface AddChainProps {
  back: (options?: { added?: boolean }) => void;
  initialRequest?: PendingAddChainRequest;
  mode?: "settings" | "dapp";
  onAdded?: (chainName: string, chainId: number) => void;
}

/** Fetch chainId from an RPC endpoint via eth_chainId. */
async function fetchChainId(rpcUrl: string): Promise<number | null> {
  try {
    const res = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] }),
    });
    const json = await res.json();
    if (json.result) return Number(json.result);
    return null;
  } catch {
    return null;
  }
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
  const { themeId } = useTheme();
  const isDarkTheme = isDarkThemeId(themeId);

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

  // Validation states
  const [nameError, setNameError] = useState("");
  const [chainIdConflict, setChainIdConflict] = useState("");
  const [rpcWarning, setRpcWarning] = useState("");
  const [rpcError, setRpcError] = useState("");
  const requestedBy = useMemo(() => {
    if (!initialRequest?.origin) return "";
    try {
      return new URL(initialRequest.origin).hostname;
    } catch {
      return initialRequest.origin;
    }
  }, [initialRequest?.origin]);
  const knownChainForHint = useMemo(() => {
    const parsed = parseInt(chainId, 10);
    if (!Number.isFinite(parsed)) return null;
    return KNOWN_CHAINS[parsed] ?? null;
  }, [chainId]);

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
      const detectedId = await fetchChainId(trimmed);
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
    const detectedId = await fetchChainId(rpc);
    if (detectedId === null) {
      setRpcWarning("Could not verify RPC — endpoint may be down. Chain saved anyway.");
    } else if (detectedId !== parseInt(chainId)) {
      setRpcWarning(`RPC returned chain ID ${detectedId}, but you entered ${chainId}. Please verify.`);
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

  return (
    <VStack spacing={4} align="stretch" px={2} pb={20}>
      {/* Header */}
      <HStack>
        <IconButton
          aria-label="Back"
          icon={<ArrowBackIcon />}
          variant="ghost"
          size="sm"
          onClick={back}
        />
        <Text fontSize="lg" fontWeight="900" color="text.primary" textTransform="uppercase" letterSpacing="tight">
          {mode === "dapp" ? "Add Network" : "Add Chain"}
        </Text>
        <Button
          size="xs"
          variant="ghost"
          rightIcon={<ExternalLinkIcon boxSize={3} />}
          color="accent.secondary"
          fontWeight="800"
          textTransform="uppercase"
          letterSpacing="wide"
          onClick={() => chrome.tabs.create({ url: "https://chainlist.org" })}
          _hover={{ bg: "transparent", color: "accent.primary" }}
          _active={{ bg: "transparent" }}
          px={1}
        >
          Chainlist
        </Button>
        <Spacer />
      </HStack>

      <Text fontSize="sm" color="text.secondary" fontWeight="500">
        {mode === "dapp"
          ? "Review and edit the requested network before adding it to your wallet."
          : "Add a custom EVM network. Only available for Private Key and Seed Phrase accounts."}
      </Text>

      {mode === "dapp" && requestedBy && (
        <Alert
          status="info"
          bg="accent.secondary"
          color="accentFg.secondary"
          borderRadius={isDarkTheme ? "md" : "0"}
          border="2px solid"
          borderColor="border.default"
          py={2}
          px={3}
        >
          <AlertIcon color="accentFg.secondary" />
          <Text fontSize="xs" fontWeight="700" color="accentFg.secondary">
            Requested by {requestedBy}
          </Text>
        </Alert>
      )}

      <FormControl>
        <FormLabel color="text.secondary" fontWeight="700" textTransform="uppercase" fontSize="xs">
          RPC URL
        </FormLabel>
        <HStack>
          <Input
            placeholder="https://..."
            value={rpc}
            onChange={(e) => handleRpcChange(e.target.value)}
            onPaste={handleRpcPaste}
          />
          {isDetecting && <Spinner size="sm" />}
        </HStack>
        <Text fontSize="xs" color="text.tertiary" mt={1} fontWeight="500">
          Paste or type an RPC URL — chain ID is auto-detected
        </Text>
        {rpcError && (
          <Text fontSize="xs" color="accent.primary" mt={1} fontWeight="700">
            {rpcError}
          </Text>
        )}
      </FormControl>

      <FormControl>
        <FormLabel color="text.secondary" fontWeight="700" textTransform="uppercase" fontSize="xs">
          Chain ID
        </FormLabel>
        <Input
          placeholder="e.g., 43114"
          type="number"
          value={chainId}
          onChange={(e) => {
            setChainId(e.target.value);
            checkChainIdConflict(e.target.value);
            const parsed = parseInt(e.target.value, 10);
            if (parsed && !Number.isNaN(parsed)) {
              applyKnownChainPrefill(parsed);
            }
          }}
        />
        {chainIdConflict && (
          <Alert
            status="warning"
            mt={2}
            color="status.warning.fg"
            py={2}
            px={3}
          >
            <AlertIcon />
            <Text fontSize="xs" fontWeight="600" color="status.warning.fg">
              {chainIdConflict}
            </Text>
          </Alert>
        )}
        {knownChainForHint && !chainIdConflict && (
          <Alert
            status="info"
            mt={2}
            bg="status.info.bg"
            color="status.info.fg"
            border="1.5px solid"
            borderColor="status.info.border"
            borderRadius={isDarkTheme ? "md" : "0"}
            py={2}
            px={3}
          >
            <AlertIcon color="status.info.fg" />
            <Text fontSize="xs" fontWeight="700" color="status.info.fg">
              EIP-7702 atomic batching is enabled by default for{" "}
              {knownChainForHint.name}; no manual delegate setup needed.
            </Text>
          </Alert>
        )}
      </FormControl>

      <Box
        bg={mode === "dapp" ? "status.info.bg" : "transparent"}
        border={mode === "dapp" ? "2px solid" : "none"}
        borderColor={mode === "dapp" ? "accent.secondary" : "transparent"}
        borderRadius={mode === "dapp" && isDarkTheme ? "md" : undefined}
        p={mode === "dapp" ? 3 : 0}
      >
        <FormControl>
          <FormLabel
            color={mode === "dapp" ? "accent.secondary" : "text.secondary"}
            fontWeight="800"
            textTransform="uppercase"
            fontSize="xs"
            mb={mode === "dapp" ? 1.5 : undefined}
          >
            Network Name
          </FormLabel>
          <Input
            placeholder="e.g., Avalanche C-Chain"
            value={chainName}
            onChange={(e) => {
              setChainName(e.target.value);
              if (nameError) setNameError("");
            }}
            isInvalid={!!nameError}
            borderColor={mode === "dapp" ? "accent.secondary" : undefined}
            _focusVisible={
              mode === "dapp"
                ? {
                    borderColor: "accent.secondary",
                    boxShadow: "focus",
                  }
                : undefined
            }
          />
          {mode === "dapp" && (
            <Text fontSize="xs" color="text.tertiary" mt={1} fontWeight="600">
              This is the name you&apos;ll see in the wallet.
            </Text>
          )}
          {nameError && (
            <Text fontSize="xs" color="accent.primary" mt={1} fontWeight="700">
              {nameError}
            </Text>
          )}
        </FormControl>
      </Box>

      <FormControl>
        <FormLabel color="text.secondary" fontWeight="700" textTransform="uppercase" fontSize="xs">
          Block Explorer URL (optional)
        </FormLabel>
        <Input
          placeholder="https://explorer.example.com"
          value={explorer}
          onChange={(e) => setExplorer(e.target.value.trim())}
        />
      </FormControl>

      <HStack spacing={3}>
        <FormControl flex={2}>
          <FormLabel color="text.secondary" fontWeight="700" textTransform="uppercase" fontSize="xs">
            Native Token Symbol
          </FormLabel>
          <Input
            placeholder="ETH"
            value={currencySymbol}
            onChange={(e) => setCurrencySymbol(e.target.value.trim())}
          />
        </FormControl>
        <FormControl flex={1}>
          <FormLabel color="text.secondary" fontWeight="700" textTransform="uppercase" fontSize="xs">
            Decimals
          </FormLabel>
          <Input
            type="number"
            value={currencyDecimals}
            onChange={(e) => setCurrencyDecimals(e.target.value)}
          />
        </FormControl>
      </HStack>

      {rpcWarning && (
        <Alert
          status="warning"
          color="status.warning.fg"
          py={2}
          px={3}
        >
          <WarningTwoIcon mr={2} color="status.warning.fg" />
          <Text fontSize="xs" fontWeight="600" color="status.warning.fg">
            {rpcWarning}
          </Text>
        </Alert>
      )}

      <Box
        display="flex"
        gap={2}
        pt={2}
        position="sticky"
        bottom={3}
        bg="surface.base"
        zIndex={1}
      >
        <Button variant="secondary" flex={1} onClick={back}>
          {mode === "dapp" ? "Reject" : "Cancel"}
        </Button>
        <Button
          variant="primary"
          flex={1}
          onClick={addChain}
          isLoading={isBtnLoading}
          isDisabled={!chainName || !chainId || !rpc || !!chainIdConflict}
        >
          {mode === "dapp" ? "Add Network" : "Add Chain"}
        </Button>
      </Box>
    </VStack>
  );
}

export default AddChain;
