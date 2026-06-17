import { useCallback, useEffect, useRef, useState } from "react";
import {
  Box,
  Button,
  HStack,
  IconButton,
  Text,
  Textarea,
  VStack,
} from "@chakra-ui/react";
import { ArrowBackIcon, LinkIcon } from "@chakra-ui/icons";
import AccountNetworkControls from "@/components/AccountNetworkControls";
import WalletConnectLogoIcon from "@/components/WalletConnectLogoIcon";
import {
  WalletConnectProposalNotice,
  WalletConnectRetryNoticeCard,
} from "@/components/WalletConnectProposalNotice";
import WalletConnectSessionsList from "@/components/WalletConnectSessionsList";
import type { PendingAddChainRequest } from "@/chrome/pendingAddChainStorage";
import type { Account } from "@/chrome/types";
import { useThemedToast } from "@/hooks/useThemedToast";
import type { ResolvedChain } from "@/lib/chains";
import { isDarkThemeId, ThemedCard, useTheme } from "@/theme";
import type {
  WalletConnectAddChainContext,
  WalletConnectProposalRejection,
  WalletConnectRetryNotice,
  WalletConnectSessionSummary,
  WalletConnectSessionsResponse,
} from "@/types/walletConnect";

interface WalletConnectViewProps {
  accounts: Account[];
  activeAccount: Account | null;
  selectedChain: ResolvedChain | undefined;
  visibleChains: ResolvedChain[];
  onBack: () => void;
  onAccountSelect: (account: Account) => void;
  onAddAccount: () => void;
  onAccountSettings: (account: Account) => void;
  onChainSelect: (chainName: string) => void;
  onAddChain: () => void;
  onAddChainRequest: (
    request: PendingAddChainRequest,
    context?: WalletConnectAddChainContext,
  ) => void;
  retryNotice?: WalletConnectRetryNotice | null;
  onDismissRetryNotice: () => void;
}

function sendMessage<T>(message: { type: string; [key: string]: any }): Promise<T> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(response as T);
    });
  });
}

function normalizeWalletConnectUri(value: string): string {
  return value.replace(/\s+/g, "");
}

export default function WalletConnectView({
  accounts,
  activeAccount,
  selectedChain,
  visibleChains,
  onBack,
  onAccountSelect,
  onAddAccount,
  onAccountSettings,
  onChainSelect,
  onAddChain,
  onAddChainRequest,
  retryNotice,
  onDismissRetryNotice,
}: WalletConnectViewProps) {
  const toast = useThemedToast();
  const { tokens, themeId } = useTheme();
  const isDarkTheme = isDarkThemeId(themeId);
  const [uri, setUri] = useState("");
  const uriInputRef = useRef<HTMLTextAreaElement>(null);
  const [sessions, setSessions] = useState<WalletConnectSessionSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isConnecting, setIsConnecting] = useState(false);
  const [disconnectingTopic, setDisconnectingTopic] = useState<string | null>(
    null,
  );
  const [initError, setInitError] = useState<string | null>(null);
  const [proposalRejection, setProposalRejection] =
    useState<WalletConnectProposalRejection | null>(null);

  const loadSessions = useCallback(async () => {
    try {
      const response = await sendMessage<WalletConnectSessionsResponse>({
        type: "walletConnectGetSessions",
      });
      setSessions(response.sessions || []);
      setInitError(response.success ? null : response.error || null);
    } catch (error) {
      setInitError(
        error instanceof Error ? error.message : "Failed to load sessions",
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSessions();
  }, [loadSessions]);

  useEffect(() => {
    const animationFrame = requestAnimationFrame(() => {
      uriInputRef.current?.focus({ preventScroll: true });
    });

    return () => cancelAnimationFrame(animationFrame);
  }, []);

  useEffect(() => {
    const handleMessage = (message: {
      type: string;
      sessions?: WalletConnectSessionSummary[];
      rejection?: WalletConnectProposalRejection;
    }) => {
      if (message.type === "walletConnectSessionsChanged") {
        setSessions(message.sessions || []);
        setInitError(null);
      }
      if (
        message.type === "walletConnectProposalRejected" &&
        message.rejection
      ) {
        onDismissRetryNotice();
        setProposalRejection(message.rejection);
        toast({
          title: "WalletConnect needs attention",
          description: message.rejection.error,
          status: "warning",
        });
      }
    };

    chrome.runtime.onMessage.addListener(handleMessage);
    return () => chrome.runtime.onMessage.removeListener(handleMessage);
  }, [onDismissRetryNotice, toast]);

  const canConnect = normalizeWalletConnectUri(uri).startsWith("wc:");

  const connect = useCallback(async (nextUri = uri) => {
    const normalizedUri = normalizeWalletConnectUri(nextUri);
    if (!normalizedUri.startsWith("wc:") || isConnecting) return;
    setIsConnecting(true);
    setProposalRejection(null);
    onDismissRetryNotice();
    try {
      const response = await sendMessage<{ success: boolean; error?: string }>({
        type: "walletConnectPair",
        uri: normalizedUri,
      });
      if (!response.success) {
        throw new Error(response.error || "Failed to connect dapp");
      }
      setUri("");
      toast({
        title: "Connecting to dapp",
        status: "info",
      });
      await loadSessions();
    } catch (error) {
      toast({
        title: "WalletConnect failed",
        description:
          error instanceof Error ? error.message : "Failed to connect dapp",
        status: "error",
      });
    } finally {
      setIsConnecting(false);
    }
  }, [isConnecting, loadSessions, onDismissRetryNotice, toast, uri]);

  const disconnect = async (topic: string) => {
    setDisconnectingTopic(topic);
    try {
      const response = await sendMessage<{ success: boolean; error?: string }>({
        type: "walletConnectDisconnectSession",
        topic,
      });
      if (!response.success) {
        throw new Error(response.error || "Failed to disconnect dapp");
      }
      setSessions((current) => current.filter((s) => s.topic !== topic));
    } catch (error) {
      toast({
        title: "Disconnect failed",
        description:
          error instanceof Error ? error.message : "Failed to disconnect dapp",
        status: "error",
      });
    } finally {
      setDisconnectingTopic(null);
    }
  };

  return (
    <Box
      p={4}
      h="100%"
      minH={0}
      overflowY="auto"
      overflowX="hidden"
      bg="surface.base"
    >
      <VStack spacing={4} align="stretch">
        <HStack spacing={2} justify="space-between">
          <HStack spacing={2} minW={0} flex={1}>
            <IconButton
              aria-label="Back"
              icon={<ArrowBackIcon />}
              variant="ghost"
              size="sm"
              onClick={onBack}
            />
            <Text
              fontSize="lg"
              fontWeight="900"
              color="text.primary"
              textTransform="uppercase"
              noOfLines={1}
            >
              WalletConnect
            </Text>
          </HStack>
        </HStack>

        <AccountNetworkControls
          accounts={accounts}
          activeAccount={activeAccount}
          selectedChain={selectedChain}
          visibleChains={visibleChains}
          onAccountSelect={onAccountSelect}
          onAddAccount={onAddAccount}
          onAccountSettings={onAccountSettings}
          onChainSelect={onChainSelect}
          onAddChain={onAddChain}
        />

        <ThemedCard weight="medium">
          <VStack align="stretch" spacing={3}>
            <HStack spacing={3}>
              <Box
                bg="accent.secondary"
                color="accentFg.secondary"
                borderRadius={isDarkTheme ? "md" : undefined}
                p={2}
                flexShrink={0}
              >
                <WalletConnectLogoIcon />
              </Box>
              <Box minW={0}>
                <Text
                  color="text.primary"
                  fontSize="sm"
                  fontWeight="900"
                  lineHeight="1.1"
                  textTransform="uppercase"
                >
                  Connect Dapp
                </Text>
                <Text color="text.secondary" fontSize="xs" fontWeight="600">
                  WalletConnect URI
                </Text>
              </Box>
            </HStack>
            <Textarea
              ref={uriInputRef}
              value={uri}
              onChange={(event) => setUri(event.target.value)}
              onPaste={(event) => {
                const pastedUri = normalizeWalletConnectUri(
                  event.clipboardData.getData("text"),
                );
                if (!pastedUri.startsWith("wc:")) return;
                event.preventDefault();
                setUri(pastedUri);
                void connect(pastedUri);
              }}
              placeholder="wc:..."
              minH="88px"
              resize="none"
              fontSize="xs"
              fontFamily="mono"
              bg="surface.raised"
              color="fg.primary"
              border={tokens.borders.thin}
              borderColor="border.default"
              borderRadius={tokens.radii.input}
              _placeholder={{ color: "fg.muted" }}
              _hover={{ bg: "surface.raised", borderColor: "border.default" }}
              _focus={{
                bg: "surface.raised",
                borderColor: "border.focus",
                boxShadow: "focus",
              }}
            />
            <Button
              leftIcon={<LinkIcon />}
              onClick={() => void connect()}
              isLoading={isConnecting}
              isDisabled={!canConnect}
              bg="accent.secondary"
              color="accentFg.secondary"
              _hover={{ bg: "accent.secondary" }}
              w="100%"
            >
              Connect
            </Button>
          </VStack>
        </ThemedCard>

        {initError && (
          <ThemedCard weight="thin">
            <Text color="chart.negative" fontSize="xs" fontWeight="700">
              {initError}
            </Text>
          </ThemedCard>
        )}

        {retryNotice && (
          <WalletConnectRetryNoticeCard
            notice={retryNotice}
            onDismiss={onDismissRetryNotice}
          />
        )}

        {proposalRejection && (
          <WalletConnectProposalNotice
            rejection={proposalRejection}
            accountType={activeAccount?.type}
            onDismiss={() => setProposalRejection(null)}
            onAddChainRequest={onAddChainRequest}
          />
        )}

        <WalletConnectSessionsList
          sessions={sessions}
          isLoading={isLoading}
          disconnectingTopic={disconnectingTopic}
          onDisconnect={disconnect}
          onRefresh={() => {
            setIsLoading(true);
            void loadSessions();
          }}
        />
      </VStack>
    </Box>
  );
}
