import { useCallback, useState, useEffect } from "react";
import {
  Button,
  Box,
  Input,
  VStack,
  HStack,
  Text,
  IconButton,
  FormControl,
  FormLabel,
  InputGroup,
  InputRightElement,
  Tooltip,
  Alert,
} from "@chakra-ui/react";
import {
  DeleteIcon,
  ViewIcon,
  ViewOffIcon,
  WarningTwoIcon,
} from "@chakra-ui/icons";
import { useNetworks } from "@/contexts/NetworksContext";
import ChainIcon from "@/components/ChainIcon";
import { SettingsScreenFrame } from "./SettingsScreenFrame";
import { RpcEndpointManager } from "./RpcEndpointManager";
import { CustomNetworkDetails } from "./CustomNetworkDetails";
import { useNetworkRpcEndpoints } from "./useNetworkRpcEndpoints";
import {
  useBuiltInRpcPersistence,
  type BuiltInRpcChange,
} from "./useBuiltInRpcPersistence";
import { probeRpcChainId } from "@/chrome/network/rpcClient";
import {
  normalizeSavedRpcEndpoints,
  type SavedRpcEndpoint,
} from "@/lib/chains";

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
  const [chainId, setChainId] = useState<string>("");
  const [rpc, setRpc] = useState<string>("");
  const {
    rpcEndpoints: savedRpcEndpoints,
    setRpcEndpoints: setSavedRpcEndpoints,
    isLoading: isRpcHistoryLoading,
  } = useNetworkRpcEndpoints(currentChainId, currentRpcUrl);
  const [explorer, setExplorer] = useState<string>("");
  const [currencySymbol, setCurrencySymbol] = useState<string>("ETH");
  const [currencyDecimals, setCurrencyDecimals] = useState<string>("18");

  const [isBtnLoading, setIsBtnLoading] = useState(false);
  const [isChainNameNotUnique, setIsChainNameNotUnique] = useState(false);

  // RPC validation
  const [rpcWarning, setRpcWarning] = useState("");
  const [isValidating, setIsValidating] = useState(false);
  const [forceAllowed, setForceAllowed] = useState(false);

  const handleBuiltInRpcSaved = useCallback(
    ({ rpcUrl, endpoints }: BuiltInRpcChange) => {
      setSavedRpcEndpoints(endpoints);
      setRpc(rpcUrl);
    },
    [setSavedRpcEndpoints],
  );
  const builtInRpcPersistence = useBuiltInRpcPersistence({
    enabled: !isCustom,
    chainName,
    chainId: currentChainId,
    activeRpcUrl: rpc,
    onSaved: handleBuiltInRpcSaved,
  });

  const saveChain = async () => {
    if (isRpcHistoryLoading) return;
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
        const detectedId = await probeRpcChainId(rpc, {
          allowPrivateWithoutOrigin: true,
        });
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
    if (
      isRpcHistoryLoading ||
      !newChainName ||
      !chainId ||
      !rpc ||
      !networksInfo
    ) return;

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
          rpcEndpoints: savedRpcEndpoints,
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

  const selectRpcLocally = (rpcUrl: string) => {
    setRpc(rpcUrl);
    setRpcWarning("");
    setForceAllowed(false);
  };

  const selectRpc = (rpcUrl: string) => {
    const nextEndpoints = normalizeSavedRpcEndpoints(
      rpcUrl,
      savedRpcEndpoints,
    );
    if (isCustom) {
      setSavedRpcEndpoints(nextEndpoints);
      selectRpcLocally(rpcUrl);
      return;
    }
    void builtInRpcPersistence.persist({
      rpcUrl,
      endpoints: nextEndpoints,
    });
  };

  const addRpc = (endpoint: SavedRpcEndpoint) => {
    const nextEndpoints = normalizeSavedRpcEndpoints(endpoint.url, [
      ...savedRpcEndpoints,
      endpoint,
    ]);
    if (isCustom) {
      setSavedRpcEndpoints(nextEndpoints);
      selectRpcLocally(endpoint.url);
      return;
    }
    void builtInRpcPersistence.persist({
      rpcUrl: endpoint.url,
      endpoints: nextEndpoints,
    });
  };

  const updateRpc = (
    previousUrl: string,
    endpoint: SavedRpcEndpoint,
  ) => {
    const isSelectedEndpoint = rpc === previousUrl;
    const nextSelectedUrl = isSelectedEndpoint ? endpoint.url : rpc;
    const nextEndpoints = normalizeSavedRpcEndpoints(
      nextSelectedUrl,
      savedRpcEndpoints.map((saved) =>
        saved.url === previousUrl ? endpoint : saved,
      ),
    );

    if (isCustom) {
      setSavedRpcEndpoints(nextEndpoints);
      if (isSelectedEndpoint) selectRpcLocally(endpoint.url);
      return;
    }
    void builtInRpcPersistence.persist({
      rpcUrl: nextSelectedUrl,
      endpoints: nextEndpoints,
    });
  };

  const removeRpc = (rpcUrl: string, nextSelectedUrl: string) => {
    const nextEndpoints = normalizeSavedRpcEndpoints(
      nextSelectedUrl,
      savedRpcEndpoints.filter((candidate) => candidate.url !== rpcUrl),
    );
    if (isCustom) {
      setSavedRpcEndpoints(nextEndpoints);
      selectRpcLocally(nextSelectedUrl);
      return;
    }
    void builtInRpcPersistence.persist({
      rpcUrl: nextSelectedUrl,
      endpoints: nextEndpoints,
    });
  };

  const headerAction = isCustom && onDelete ? (
    <Tooltip label="Delete network" hasArrow>
      <IconButton
        aria-label="Delete network"
        icon={<DeleteIcon />}
        variant="ghost"
        minW="44px"
        h="44px"
        color="chart.negative"
        onClick={onDelete}
      />
    </Tooltip>
  ) : undefined;

  return (
    <SettingsScreenFrame
      title="Edit network"
      onBack={back}
      trailing={headerAction}
      secondaryAction={isCustom ? (
        <Button variant="secondary" onClick={back}>
          Cancel
        </Button>
      ) : undefined}
      primaryAction={isCustom ? (
        forceAllowed ? (
          <Button variant="highlight" onClick={forceSave}>
            Save anyway
          </Button>
        ) : (
          <Button
            variant="brand"
            onClick={saveChain}
            isDisabled={isRpcHistoryLoading}
            isLoading={isBtnLoading || isValidating}
            loadingText={isValidating ? "Checking" : "Saving"}
          >
            Save changes
          </Button>
        )
      ) : undefined}
    >
      <VStack spacing={5} align="stretch">
        <HStack spacing={3} align="center">
          {currentEntry && (
            <ChainIcon
              chainId={currentEntry.chainId}
              chainName={chainName}
              size="32px"
              withChip
            />
          )}
          <Text color="fg.primary" fontSize="md" fontWeight="600">
            {chainName}
          </Text>
        </HStack>

        <VStack
          spacing={4}
          align="stretch"
          p={4}
          bg="surface.raised"
          borderWidth="1px"
          borderColor="border.subtle"
          borderRadius="lg"
        >
          <FormControl isInvalid={isChainNameNotUnique}>
            <FormLabel
              htmlFor="edit-network-name"
              mb={1.5}
              color="fg.secondary"
              fontSize="sm"
              fontWeight="500"
            >
              Network name
            </FormLabel>
            <Tooltip
              label="Built-in network names cannot be changed."
              isDisabled={isCustom}
              placement="top"
              hasArrow
            >
              <Box>
                <Input
                  id="edit-network-name"
                  placeholder="Network name"
                  value={newChainName}
                  onChange={(event) => {
                    setNewChainName(event.target.value);
                    if (isChainNameNotUnique) {
                      setIsChainNameNotUnique(false);
                    }
                  }}
                  isReadOnly={!isCustom}
                  bg={!isCustom ? "surface.sunken" : undefined}
                  color={!isCustom ? "fg.muted" : undefined}
                  cursor={!isCustom ? "not-allowed" : undefined}
                />
              </Box>
            </Tooltip>
            {isChainNameNotUnique && (
              <Text mt={1} color="chart.negative" fontSize="xs" fontWeight="600">
                Chain name already exists
              </Text>
            )}
          </FormControl>

          <FormControl>
            <FormLabel
              htmlFor="edit-network-chain-id"
              mb={1.5}
              color="fg.secondary"
              fontSize="sm"
              fontWeight="500"
            >
              Chain ID
            </FormLabel>
            <Tooltip
              label="Chain ID cannot be changed."
              isDisabled={isCustom}
              placement="top"
              hasArrow
            >
              <Box>
                <InputGroup>
                  <Input
                    id="edit-network-chain-id"
                    placeholder="Chain ID"
                    value={chainId}
                    inputMode="numeric"
                    pattern="[0-9]*"
                    onChange={(event) => {
                      if (isCustom) {
                        setChainId(event.target.value.replace(/\D/g, ""));
                      }
                    }}
                    isReadOnly={!isCustom}
                    bg={!isCustom ? "surface.sunken" : undefined}
                    color={!isCustom ? "fg.muted" : undefined}
                    cursor={!isCustom ? "not-allowed" : undefined}
                    pr={chainIdHex ? "5.75rem" : undefined}
                  />
                  {chainIdHex && (
                    <InputRightElement width="5.5rem" pointerEvents="none">
                      <Text color="fg.muted" fontFamily="mono" fontSize="xs">
                        {chainIdHex}
                      </Text>
                    </InputRightElement>
                  )}
                </InputGroup>
              </Box>
            </Tooltip>
          </FormControl>

          {currentRpcUrl && (
            <RpcEndpointManager
              currentUrl={currentRpcUrl}
              endpoints={savedRpcEndpoints}
              selectedUrl={rpc}
              isLoading={
                isRpcHistoryLoading ||
                (!isCustom && builtInRpcPersistence.isSaving)
              }
              onSelect={selectRpc}
              onAdd={addRpc}
              onUpdate={updateRpc}
              onRemove={removeRpc}
            />
          )}

          {isCustom && (
            <CustomNetworkDetails
              explorer={explorer}
              currencySymbol={currencySymbol}
              currencyDecimals={currencyDecimals}
              onExplorerChange={setExplorer}
              onCurrencySymbolChange={setCurrencySymbol}
              onCurrencyDecimalsChange={setCurrencyDecimals}
            />
          )}
        </VStack>

        {currentEntry && onToggleHidden && (
          <Box display="flex" justifyContent="flex-end">
            <Button
              variant="ghost"
              leftIcon={currentEntry.hidden ? <ViewIcon /> : <ViewOffIcon />}
              onClick={() => onToggleHidden(!currentEntry.hidden)}
            >
              {currentEntry.hidden ? "Unhide network" : "Hide network"}
            </Button>
          </Box>
        )}

        {(isCustom ? rpcWarning : builtInRpcPersistence.warning) && (
          <Alert status="warning" py={2} px={3}>
            <WarningTwoIcon mr={2} color="status.warning.fg" flexShrink={0} />
            <Text
              flex={1}
              color="status.warning.fg"
              fontSize="xs"
              fontWeight="600"
            >
              {isCustom ? rpcWarning : builtInRpcPersistence.warning}
            </Text>
            {!isCustom && builtInRpcPersistence.requiresConfirmation && (
              <Button
                ml={2}
                variant="highlight"
                size="sm"
                flexShrink={0}
                isLoading={builtInRpcPersistence.isSaving}
                onClick={() => void builtInRpcPersistence.forceSave()}
              >
                Use anyway
              </Button>
            )}
          </Alert>
        )}
      </VStack>
    </SettingsScreenFrame>
  );
}

export default EditChain;
