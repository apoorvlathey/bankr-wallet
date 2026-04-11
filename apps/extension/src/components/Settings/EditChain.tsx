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
  Alert,
  Spinner,
} from "@chakra-ui/react";
import { ArrowBackIcon, WarningTwoIcon } from "@chakra-ui/icons";
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
}: {
  chainName: string;
  back: () => void;
  onSaved?: (chain: { chainName: string; chainId: number }) => void;
}) {
  const { networksInfo, setNetworksInfo } = useNetworks();

  const isCustom = networksInfo?.[chainName]?.isCustom === true;

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

      doSave();
    } else {
      setIsBtnLoading(false);
    }
  };

  const doSave = () => {
    if (!newChainName || !chainId || !rpc || !networksInfo) return;

    const savedChainId = parseInt(chainId);
    const savedChainName = newChainName;

    setNetworksInfo((_networksInfo) => {
      if (newChainName !== chainName && _networksInfo) {
        delete _networksInfo[chainName];
      }
      return {
        ..._networksInfo,
        [newChainName]: {
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
          // Preserve hidden state
          hidden: networksInfo[chainName]?.hidden,
        },
      };
    });
    onSaved?.({ chainName: savedChainName, chainId: savedChainId });
    back();
    setIsBtnLoading(false);
  };

  const forceSave = () => {
    setRpcWarning("");
    setForceAllowed(false);
    doSave();
  };

  useEffect(() => {
    if (networksInfo) {
      const entry = networksInfo[chainName];
      setChainId(entry.chainId.toString());
      setRpc(entry.rpcUrl);
      setExplorer(entry.explorer ?? "");
      setCurrencySymbol(entry.nativeCurrency?.symbol ?? "ETH");
      setCurrencyDecimals((entry.nativeCurrency?.decimals ?? 18).toString());
    }
  }, [networksInfo, chainName]);

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
        <Input
          placeholder="Chain ID"
          value={chainId}
          isReadOnly
          bg="surface.sunken"
          color="text.tertiary"
          cursor="not-allowed"
          opacity={0.7}
        />
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
        <Alert
          status="warning"
          borderRadius="0"
          border="2px solid"
          borderColor="border.default"
          py={2}
          px={3}
        >
          <WarningTwoIcon mr={2} flexShrink={0} />
          <Text fontSize="xs" fontWeight="600">{rpcWarning}</Text>
        </Alert>
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
