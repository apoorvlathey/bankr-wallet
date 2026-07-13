import { useState, useEffect } from "react";
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
  Spinner,
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
import { InlineDisclosure } from "@/components/ui";
import { SettingsScreenFrame } from "./SettingsScreenFrame";
import { probeRpcChainId } from "@/chrome/rpcHttpClient";

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

  const headerActions = (
    <HStack spacing={0}>
      {currentEntry && onToggleHidden && (
        <Tooltip label={currentEntry.hidden ? "Show network" : "Hide network"} hasArrow>
          <IconButton
            aria-label={currentEntry.hidden ? "Show network" : "Hide network"}
            icon={currentEntry.hidden ? <ViewOffIcon /> : <ViewIcon />}
            variant="ghost"
            minW="44px"
            h="44px"
            onClick={() => onToggleHidden(!currentEntry.hidden)}
          />
        </Tooltip>
      )}
      {isCustom && onDelete && (
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
      )}
    </HStack>
  );

  return (
    <SettingsScreenFrame
      title="Edit network"
      onBack={back}
      trailing={headerActions}
      secondaryAction={
        <Button variant="secondary" onClick={back}>
          Cancel
        </Button>
      }
      primaryAction={
        forceAllowed ? (
          <Button variant="highlight" onClick={forceSave}>
            Save anyway
          </Button>
        ) : (
          <Button
            variant="primary"
            onClick={saveChain}
            isLoading={isBtnLoading || isValidating}
            loadingText={isValidating ? "Checking" : "Saving"}
          >
            Save changes
          </Button>
        )
      }
    >
      <VStack spacing={5} align="stretch">
        <Box>
          <Text color="fg.primary" fontSize="md" fontWeight="600">
            {chainName}
          </Text>
          <Text mt={1} color="fg.secondary" fontSize="sm" lineHeight="1.45">
            WalletChan verifies a changed RPC endpoint before saving it.
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
          <FormControl isInvalid={isChainNameNotUnique}>
            <FormLabel mb={1.5} color="fg.secondary" fontSize="sm" fontWeight="500">
              Network name
            </FormLabel>
            <Input
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
            {!isCustom && (
              <Text mt={1} color="fg.secondary" fontSize="xs">
                Built-in network names cannot be changed.
              </Text>
            )}
            {isChainNameNotUnique && (
              <Text mt={1} color="chart.negative" fontSize="xs" fontWeight="600">
                Chain name already exists
              </Text>
            )}
          </FormControl>

          <FormControl>
            <FormLabel mb={1.5} color="fg.secondary" fontSize="sm" fontWeight="500">
              RPC URL
            </FormLabel>
            <HStack>
              <Input
                placeholder="https://rpc.example.com"
                value={rpc}
                onChange={(event) => {
                  setRpc(event.target.value.trim());
                  setRpcWarning("");
                  setForceAllowed(false);
                }}
              />
              {isValidating && <Spinner size="sm" flexShrink={0} />}
            </HStack>
            <Text mt={1} color="fg.secondary" fontSize="xs">
              The endpoint must report the same chain ID shown below.
            </Text>
          </FormControl>

          <FormControl>
            <FormLabel mb={1.5} color="fg.secondary" fontSize="sm" fontWeight="500">
              Chain ID
            </FormLabel>
            <InputGroup>
              <Input
                placeholder="Chain ID"
                value={chainId}
                isReadOnly
                bg="surface.sunken"
                color="fg.muted"
                cursor="not-allowed"
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
            <Text mt={1} color="fg.secondary" fontSize="xs">
              Chain ID cannot be changed.
            </Text>
          </FormControl>

          {isCustom && (
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
                </FormControl>

                <HStack spacing={3} align="flex-start">
                  <FormControl flex={2}>
                    <FormLabel mb={1.5} color="fg.secondary" fontSize="sm" fontWeight="500">
                      Native token symbol
                    </FormLabel>
                    <Input
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
          )}
        </VStack>

        {rpcWarning && (
          <Alert status="warning" py={2} px={3}>
            <WarningTwoIcon mr={2} color="status.warning.fg" flexShrink={0} />
            <Text color="status.warning.fg" fontSize="xs" fontWeight="600">
              {rpcWarning}
            </Text>
          </Alert>
        )}
      </VStack>
    </SettingsScreenFrame>
  );
}

export default EditChain;
