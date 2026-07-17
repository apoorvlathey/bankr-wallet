import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import {
  AlertDialog,
  AlertDialogBody,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogOverlay,
  Box,
  Button,
  FormControl,
  FormLabel,
  HStack,
  IconButton,
  Input,
  Text,
  VStack,
} from "@chakra-ui/react";
import { ExternalLinkIcon } from "@chakra-ui/icons";

import ChainIcon from "@/components/ChainIcon";
import { CopyButton } from "@/components/CopyButton";
import { FullScreenPickerLayer } from "@/components/FullScreenPickerLayer";
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
import { getChainConfig } from "@/constants/chainConfig";

interface EditCustomTokenModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUpdated: () => void;
  token: {
    contractAddress: string;
    chainId: number;
    symbol: string;
    name: string;
    decimals: number;
  } | null;
}

async function sendCustomTokenWrite(
  message: Record<string, unknown>,
): Promise<void> {
  const response = await new Promise<{ success: boolean; error?: string }>(
    (resolve) => {
      chrome.runtime.sendMessage(message, resolve);
    },
  );
  if (!response?.success) {
    throw new Error(response?.error || "Failed to save token");
  }
}

export default function EditCustomTokenModal({
  isOpen,
  onClose,
  onUpdated,
  token,
}: EditCustomTokenModalProps) {
  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("");
  const [decimals, setDecimals] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const cancelRemoveRef = useRef<HTMLButtonElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (token && isOpen) {
      setName(token.name);
      setSymbol(token.symbol);
      setDecimals(String(token.decimals));
      setConfirmingRemove(false);
    }
  }, [token, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    returnFocusRef.current = document.activeElement as HTMLElement | null;
    const frame = requestAnimationFrame(() => headingRef.current?.focus());
    return () => {
      cancelAnimationFrame(frame);
      returnFocusRef.current?.focus();
    };
  }, [isOpen]);

  if (!token || !isOpen) return null;

  const chainConfig = getChainConfig(token.chainId);
  const explorerUrl = chainConfig.explorer
    ? `${chainConfig.explorer.replace(/\/+$/, "")}/address/${token.contractAddress}`
    : null;

  const handleSave = async (event?: FormEvent) => {
    event?.preventDefault();
    if (!symbol || !decimals) return;
    setSaving(true);
    try {
      await sendCustomTokenWrite({
        type: "updateCustomToken",
        chainId: token.chainId,
        contractAddress: token.contractAddress,
        name,
        symbol,
        decimals: parseInt(decimals, 10),
      });
      onUpdated();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = () => {
    setSaving(true);
    sendCustomTokenWrite({
      type: "removeCustomToken",
      chainId: token.chainId,
      contractAddress: token.contractAddress,
    })
      .then(() => {
        onUpdated();
        onClose();
      })
      .finally(() => setSaving(false));
  };

  return (
    <FullScreenPickerLayer>
      <AppScreen stickyActionClearance={4}>
        <AppHeader
          title="Edit token"
          onBack={onClose}
          headingRef={headingRef}
        />

        <ScreenBody pt={4}>
          <Box as="form" id="edit-token-form" onSubmit={handleSave}>
            <VStack align="stretch" spacing={6}>
              <ScreenSection
                title="Token contract"
                description="The network and contract address cannot be changed."
                headingProps={{ fontSize: "lg" }}
              >
                <ListSurface>
                  <ListItem>
                    <ListItemMedia>
                      <ChainIcon
                        chainId={token.chainId}
                        chainName={chainConfig.name}
                        size="24px"
                        withChip
                      />
                    </ListItemMedia>
                    <ListItemContent>
                      <ListItemTitle>{chainConfig.name}</ListItemTitle>
                      <ListItemDescription
                        fontFamily="mono"
                        fontSize="xs"
                        noOfLines={1}
                      >
                        {token.contractAddress}
                      </ListItemDescription>
                    </ListItemContent>
                    <ListItemActions>
                      <CopyButton value={token.contractAddress} />
                      {explorerUrl && (
                        <IconButton
                          aria-label="View token contract"
                          icon={<ExternalLinkIcon />}
                          size="xs"
                          variant="ghost"
                          color="fg.secondary"
                          onClick={() => chrome.tabs.create({ url: explorerUrl })}
                        />
                      )}
                    </ListItemActions>
                  </ListItem>
                </ListSurface>
              </ScreenSection>

              <ScreenSection
                title="Display details"
                description="These labels are stored locally and only affect how the token appears in WalletChan."
                headingProps={{ fontSize: "lg" }}
              >
                <VStack align="stretch" spacing={4}>
                  <FormControl>
                    <FormLabel htmlFor="edit-token-name">Name</FormLabel>
                    <Input
                      id="edit-token-name"
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                    />
                  </FormControl>
                  <HStack spacing={3} align="start">
                    <FormControl isRequired>
                      <FormLabel htmlFor="edit-token-symbol">Symbol</FormLabel>
                      <Input
                        id="edit-token-symbol"
                        value={symbol}
                        onChange={(event) => setSymbol(event.target.value)}
                      />
                    </FormControl>
                    <FormControl isRequired>
                      <FormLabel htmlFor="edit-token-decimals">Decimals</FormLabel>
                      <Input
                        id="edit-token-decimals"
                        value={decimals}
                        onChange={(event) => setDecimals(event.target.value)}
                        type="number"
                        inputMode="numeric"
                      />
                    </FormControl>
                  </HStack>
                </VStack>
              </ScreenSection>

              <ScreenSection
                title="Remove custom token"
                description="Removing it deletes this custom token entry from WalletChan."
                headingProps={{ fontSize: "lg" }}
              >
                <Button
                  type="button"
                  variant="ghost"
                  color="chart.negative"
                  justifyContent="flex-start"
                  px={0}
                  onClick={() => setConfirmingRemove(true)}
                  isDisabled={saving}
                >
                  Remove token
                </Button>
              </ScreenSection>
            </VStack>
          </Box>
        </ScreenBody>

        <StickyActionBar
          primaryAction={
            <Button
              type="submit"
              form="edit-token-form"
              variant="brand"
              isDisabled={!symbol || !decimals || saving}
              isLoading={saving && !confirmingRemove}
            >
              Save changes
            </Button>
          }
        />
      </AppScreen>

      <AlertDialog
        isOpen={confirmingRemove}
        leastDestructiveRef={cancelRemoveRef}
        onClose={() => setConfirmingRemove(false)}
        isCentered
        closeOnEsc={!saving}
        closeOnOverlayClick={!saving}
      >
        <AlertDialogOverlay />
        <AlertDialogContent mx={4}>
          <AlertDialogHeader as="h2" fontSize="lg">
            Remove {symbol}?
          </AlertDialogHeader>
          <AlertDialogBody>
            <Text color="fg.secondary" fontSize="sm">
              This removes the custom token entry from WalletChan. You can add
              the contract again later.
            </Text>
          </AlertDialogBody>
          <AlertDialogFooter gap={2}>
            <Button
              ref={cancelRemoveRef}
              variant="secondary"
              onClick={() => setConfirmingRemove(false)}
              isDisabled={saving}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={handleRemove}
              isLoading={saving}
            >
              Remove token
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </FullScreenPickerLayer>
  );
}
