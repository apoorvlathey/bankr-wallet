import { useState, useEffect } from "react";
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
  InputGroup,
  InputRightElement,
  Spinner,
  Tooltip,
} from "@chakra-ui/react";
import {
  ArrowBackIcon,
  DeleteIcon,
  ViewIcon,
  ViewOffIcon,
  WarningTwoIcon,
} from "@chakra-ui/icons";
import { useNetworks } from "@/contexts/NetworksContext";

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

function EditChain({
  chainName,
  back,
  onSaved,
  onToggleHidden,
  onDelete,
}: {
  chainName: string;
  back: () => void;
  onSaved?: (chain: { chainName: string; chainId: number }) => void;
  onToggleHidden?: (hidden: boolean) => void;
  onDelete?: () => void;
}) {
  const { networksInfo } = useNetworks();

  const currentEntry = networksInfo?.[chainName];
  const isCustom = currentEntry?.isCustom === true;
  const currentChainId = currentEntry?.chainId;
  const currentRpcUrl = currentEntry?.rpcUrl;
  const currentExplorer = currentEntry?.explorer;
  const currentCurrencySymbol = currentEntry?.nativeCurrency?.symbol;
  const currentCurrencyDecimals = currentEntry?.nativeCurrency?.decimals;

  const [newChainName, setNewChainName] = useState<string>(chainName);
  const [chainId, setChainId] = useState<string>();
  const [rpc, setRpc] = useState<string>();
  const [explorer, setExplorer] = useState<string>("");
  const [currencySymbol, setCurrencySymbol] = useState<string>("ETH");
  const [currencyDecimals, setCurrencyDecimals] = useState<string>("18");

  const [isBtnLoading, setIsBtnLoading] = useState(false);
  const [isChainNameNotUnique, setIsChainNameNotUnique] = useState(false);

  // RPC validation
  const [rpcWarning, setRpcWarning] = useState("");
  const [isValidating, setIsValidating] = useState(false);
  const [forceAllowed, setForceAllowed] = useState(false);

  const saveChain = async () => {
    setIsBtnLoading(true);
    setRpcWarning("");
    setForceAllowed(false);

    if (newChainName && chainId && rpc && networksInfo) {
      if (newChainName !== chainName && networksInfo[newChainName]) {
        setIsChainNameNotUnique(true);
        setIsBtnLoading(false);
        return;
      }

      // Validate RPC chainId matches if RPC changed
      const originalRpc = networksInfo[chainName]?.rpcUrl;
      if (rpc !== originalRpc) {
        setIsValidating(true);
        const detectedId = await fetchChainId(rpc);
        setIsValidating(false);

        const expectedChainId = parseInt(chainId);

        if (detectedId === null) {
          setRpcWarning("Could not reach RPC endpoint — it may be down. Save anyway?");
          setForceAllowed(true);
          setIsBtnLoading(false);
          return;
        } else if (detectedId !== expectedChainId) {
          setRpcWarning(`RPC returned chain ID ${detectedId}, expected ${expectedChainId}. Save anyway?`);
          setForceAllowed(true);
          setIsBtnLoading(false);
          return;
        }
      }

      await doSave();
    } else {
      setIsBtnLoading(false);
    }
  };

  const doSave = async () => {
    if (!newChainName || !chainId || !rpc || !networksInfo) return;

    const savedChainId = parseInt(chainId);
    const savedChainName = newChainName;

    const result = await new Promise<{
      success: boolean;
      chainName?: string;
      chainId?: number;
      error?: string;
    }>((resolve) => {
      chrome.runtime.sendMessage(
        {
          type: "updateNetwork",
          chainName,
          nextChainName: savedChainName,
          entry: {
            chainId: savedChainId,
            rpcUrl: rpc,
            ...(isCustom && {
              isCustom: true,
              explorer: explorer.replace(/\/+$/, "") || undefined,
              nativeCurrency: {
                name: currencySymbol,
                symbol: currencySymbol,
                decimals: parseInt(currencyDecimals) || 18,
              },
            }),
          },
        },
        (response) =>
          resolve(
            response ?? {
              success: false,
              error: chrome.runtime.lastError?.message || "Failed to save network.",
            },
          ),
      );
    });

    if (!result.success) {
      setRpcWarning(result.error || "Failed to save network.");
      setIsBtnLoading(false);
      return;
    }

    onSaved?.({
      chainName: result.chainName || savedChainName,
      chainId: result.chainId || savedChainId,
    });
    back();
    setIsBtnLoading(false);
  };

  const forceSave = async () => {
    setRpcWarning("");
    setForceAllowed(false);
    await doSave();
  };

  const numericChainId = chainId ? Number.parseInt(chainId, 10) : NaN;
  const chainIdHex = Number.isFinite(numericChainId)
    ? `0x${numericChainId.toString(16)}`
    : "";

  useEffect(() => {
    if (!currentChainId || !currentRpcUrl) return;
    setNewChainName(chainName);
    setChainId(currentChainId.toString());
    setRpc(currentRpcUrl);
    setExplorer(currentExplorer ?? "");
    setCurrencySymbol(currentCurrencySymbol ?? "ETH");
    setCurrencyDecimals((currentCurrencyDecimals ?? 18).toString());
  }, [
    chainName,
    currentChainId,
    currentRpcUrl,
    currentExplorer,
    currentCurrencySymbol,
    currentCurrencyDecimals,
  ]);

  return (
    <VStack spacing={4} align="stretch">
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
          Edit Chain
        </Text>
        <Spacer />
        {currentEntry && onToggleHidden && (
          <Tooltip label={currentEntry.hidden ? "Show chain" : "Hide chain"} hasArrow>
            <IconButton
              aria-label={currentEntry.hidden ? "Show chain" : "Hide chain"}
              icon={currentEntry.hidden ? <ViewOffIcon /> : <ViewIcon />}
              variant="ghost"
              size="sm"
              onClick={() => onToggleHidden(!currentEntry.hidden)}
            />
          </Tooltip>
        )}
        {isCustom && onDelete && (
          <Tooltip label="Delete chain" hasArrow>
            <IconButton
              aria-label="Delete chain"
              icon={<DeleteIcon />}
              variant="ghost"
              size="sm"
              color="chart.negative"
              onClick={onDelete}
            />
          </Tooltip>
        )}
      </HStack>

      <FormControl>
        <FormLabel color="text.secondary" fontWeight="700" textTransform="uppercase" fontSize="xs">
          Name
        </FormLabel>
        <Input
          placeholder="Chain name"
          value={newChainName}
          onChange={(e) => {
            setNewChainName(e.target.value);
            if (isChainNameNotUnique) {
              setIsChainNameNotUnique(false);
            }
          }}
          isInvalid={isChainNameNotUnique}
          isReadOnly={!isCustom}
          bg={!isCustom ? "surface.sunken" : undefined}
          color={!isCustom ? "text.tertiary" : undefined}
          cursor={!isCustom ? "not-allowed" : undefined}
          opacity={!isCustom ? 0.7 : 1}
        />
        {!isCustom && (
          <Text fontSize="xs" color="text.tertiary" mt={1} fontWeight="500">
            Built-in chain names aren't editable.
          </Text>
        )}
        {isChainNameNotUnique && (
          <Text fontSize="xs" color="accent.primary" mt={1} fontWeight="700">
            Chain name already exists
          </Text>
        )}
      </FormControl>

      <FormControl>
        <FormLabel color="text.secondary" fontWeight="700" textTransform="uppercase" fontSize="xs">
          RPC URL
        </FormLabel>
        <HStack>
          <Input
            placeholder="https://..."
            value={rpc}
            onChange={(e) => {
              setRpc(e.target.value.trim());
              setRpcWarning("");
              setForceAllowed(false);
            }}
          />
          {isValidating && <Spinner size="sm" />}
        </HStack>
      </FormControl>

      <FormControl>
        <FormLabel color="text.secondary" fontWeight="700" textTransform="uppercase" fontSize="xs">
          Chain ID
        </FormLabel>
        <InputGroup>
          <Input
            placeholder="Chain ID"
            value={chainId}
            isReadOnly
            bg="surface.sunken"
            color="text.tertiary"
            cursor="not-allowed"
            opacity={0.7}
            pr={chainIdHex ? "5.75rem" : undefined}
          />
          {chainIdHex && (
            <InputRightElement width="5.5rem" pointerEvents="none">
              <VStack spacing={0} align="flex-end" lineHeight="1">
                <Text
                  as="span"
                  color="text.tertiary"
                  fontSize="2xs"
                  fontWeight="700"
                  textTransform="uppercase"
                  opacity={0.75}
                >
                  hex:
                </Text>
                <Text
                  as="span"
                  color="text.tertiary"
                  fontFamily="mono"
                  fontSize="xs"
                  fontWeight="700"
                >
                  {chainIdHex}
                </Text>
              </VStack>
            </InputRightElement>
          )}
        </InputGroup>
        <Text fontSize="xs" color="text.tertiary" mt={1} fontWeight="500">
          Chain ID cannot be changed
        </Text>
      </FormControl>

      {/* Extra fields for custom chains */}
      {isCustom && (
        <>
          <FormControl>
            <FormLabel color="text.secondary" fontWeight="700" textTransform="uppercase" fontSize="xs">
              Block Explorer URL
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
        </>
      )}

      {rpcWarning && (
        <HStack
          align="flex-start"
          spacing={2}
          bg="status.warning.bg"
          border="2px solid"
          borderColor="status.warning.border"
          borderRadius="md"
          py={2}
          px={3}
        >
          <WarningTwoIcon color="status.warning.fg" mt="2px" flexShrink={0} />
          <Text fontSize="xs" fontWeight="600" color="status.warning.fg">
            {rpcWarning}
          </Text>
        </HStack>
      )}

      <Box display="flex" gap={2} pt={2}>
        <Button variant="secondary" flex={1} onClick={back}>
          Cancel
        </Button>
        {forceAllowed ? (
          <Button variant="highlight" flex={1} onClick={forceSave}>
            Force Save
          </Button>
        ) : (
          <Button
            variant="primary"
            flex={1}
            onClick={saveChain}
            isLoading={isBtnLoading}
          >
            Save
          </Button>
        )}
      </Box>
    </VStack>
  );
}

export default EditChain;
