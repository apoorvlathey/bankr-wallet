import { useState, useEffect, memo } from "react";
import {
  HStack,
  VStack,
  Text,
  Link,
  Box,
  Button,
  Badge,
  IconButton,
  Spacer,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  useDisclosure,
  Icon,
} from "@chakra-ui/react";
import { useBauhausToast } from "@/hooks/useBauhausToast";
import {
  ArrowBackIcon,
  LockIcon,
  ChevronRightIcon,
  DeleteIcon,
  TimeIcon,
  ChatIcon,
  RepeatIcon,
} from "@chakra-ui/icons";

import { clearChatHistory } from "@/chrome/chatStorage";
import { TWITTER_URL } from "@/constants/externalUrls";
import Chains from "./Chains";
import ChangePassword from "./ChangePassword";
import AutoLockSettings from "./AutoLockSettings";
import AgentPasswordSettings from "./AgentPasswordSettings";
import OllamaSettings from "./OllamaSettings";

// Robot/Agent icon for Agent Password section
const AgentIcon = (props: any) => (
  <Icon viewBox="0 0 24 24" {...props}>
    <path
      fill="currentColor"
      d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7h1a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-1v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-1H2a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1h1a7 7 0 0 1 7-7h1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 0 1 2-2M7.5 13A2.5 2.5 0 0 0 5 15.5A2.5 2.5 0 0 0 7.5 18a2.5 2.5 0 0 0 2.5-2.5A2.5 2.5 0 0 0 7.5 13m9 0a2.5 2.5 0 0 0-2.5 2.5a2.5 2.5 0 0 0 2.5 2.5a2.5 2.5 0 0 0 2.5-2.5a2.5 2.5 0 0 0-2.5-2.5Z"
    />
  </Icon>
);

type SettingsTab = "main" | "chains" | "changePassword" | "autoLock" | "agentPassword" | "ollama";

interface SettingsProps {
  close: () => void;
  showBackButton?: boolean;
  onSessionExpired?: () => void;
  initialTab?: SettingsTab;
  initialChainsTab?: "list" | "add";
  initialEditChainName?: string;
  onChainSaved?: (chain: { chainName: string; chainId: number }) => void;
}

function Settings({
  close,
  showBackButton = true,
  onSessionExpired,
  initialTab = "main",
  initialChainsTab = "list",
  initialEditChainName,
  onChainSaved,
}: SettingsProps) {
  const [tab, setTab] = useState<SettingsTab>(initialTab);
  const [isAgentPasswordEnabled, setIsAgentPasswordEnabled] = useState(false);
  const [passwordType, setPasswordType] = useState<"master" | "agent" | null>(null);
  const toast = useBauhausToast();
  const { isOpen: isDeleteModalOpen, onOpen: onDeleteModalOpen, onClose: onDeleteModalClose } = useDisclosure();
  const { isOpen: isChatDeleteModalOpen, onOpen: onChatDeleteModalOpen, onClose: onChatDeleteModalClose } = useDisclosure();

  const handleClearHistory = () => {
    chrome.runtime.sendMessage({ type: "clearTxHistory" }, () => {
      toast({
        title: "Transaction history cleared",
        status: "success",
        duration: 2000,
        isClosable: true,
      });
      onDeleteModalClose();
    });
  };

  const handleResetNonce = () => {
    chrome.runtime.sendMessage({ type: "clearNonceCache" }, () => {
      toast({
        title: "Nonce cache reset",
        status: "success",
        duration: 2000,
        isClosable: true,
      });
    });
  };

  const handleClearChatHistory = async () => {
    await clearChatHistory();
    toast({
      title: "Chat history cleared",
      status: "success",
      duration: 2000,
      isClosable: true,
    });
    onChatDeleteModalClose();
  };

  useEffect(() => {
    checkAgentPassword();
    checkPasswordType();
  }, []);

  const checkAgentPassword = async () => {
    const response = await new Promise<{ enabled: boolean }>((resolve) => {
      chrome.runtime.sendMessage({ type: "isAgentPasswordEnabled" }, resolve);
    });
    setIsAgentPasswordEnabled(response.enabled);
  };

  const checkPasswordType = async () => {
    const response = await new Promise<{ passwordType: "master" | "agent" | null }>((resolve) => {
      chrome.runtime.sendMessage({ type: "getPasswordType" }, resolve);
    });
    setPasswordType(response.passwordType);
  };

  if (tab === "chains") {
    return (
      <Chains
        close={() => setTab("main")}
        initialTab={initialChainsTab}
        initialEditChainName={initialEditChainName}
        onChainSaved={onChainSaved}
      />
    );
  }

  if (tab === "changePassword") {
    return (
      <ChangePassword
        onComplete={() => setTab("main")}
        onCancel={() => setTab("main")}
        onSessionExpired={onSessionExpired || (() => setTab("main"))}
      />
    );
  }

  if (tab === "autoLock") {
    return (
      <AutoLockSettings
        onComplete={() => setTab("main")}
        onCancel={() => setTab("main")}
      />
    );
  }

  if (tab === "agentPassword") {
    return (
      <AgentPasswordSettings
        onComplete={() => {
          checkAgentPassword();
          setTab("main");
        }}
        onCancel={() => setTab("main")}
        onSessionExpired={onSessionExpired || (() => setTab("main"))}
      />
    );
  }

  if (tab === "ollama") {
    return (
      <OllamaSettings
        onComplete={() => setTab("main")}
        onCancel={() => setTab("main")}
      />
    );
  }

  return (
    <VStack spacing={4} align="stretch" flex="1">
      {/* Header */}
      <HStack>
        {showBackButton && (
          <IconButton
            aria-label="Back"
            icon={<ArrowBackIcon />}
            variant="ghost"
            size="sm"
            onClick={close}
          />
        )}
        <Text fontSize="lg" fontWeight="900" color="text.primary" textTransform="uppercase" letterSpacing="tight">
          Settings
        </Text>
        <Spacer />
      </HStack>

      {/* Change Password Section - only accessible with master password */}
      <Box
          bg={passwordType === "agent" ? "gray.100" : "bauhaus.white"}
          border="3px solid"
          borderColor={passwordType === "agent" ? "gray.300" : "bauhaus.black"}
          boxShadow={passwordType === "agent" ? "none" : "4px 4px 0px 0px #121212"}
          p={4}
          cursor={passwordType === "agent" ? "not-allowed" : "pointer"}
          onClick={passwordType === "agent" ? undefined : () => setTab("changePassword")}
          _hover={passwordType === "agent" ? {} : {
            transform: "translateY(-2px)",
            boxShadow: "6px 6px 0px 0px #121212",
          }}
          _active={passwordType === "agent" ? {} : {
            transform: "translate(2px, 2px)",
            boxShadow: "none",
          }}
          transition="all 0.2s ease-out"
          position="relative"
        >
          {/* Corner decoration */}
          <Box
            position="absolute"
            top="-3px"
            right="-3px"
            w="8px"
            h="8px"
            bg={passwordType === "agent" ? "gray.400" : "bauhaus.yellow"}
            border="2px solid"
            borderColor={passwordType === "agent" ? "gray.300" : "bauhaus.black"}
          />

          <HStack justify="space-between">
            <HStack spacing={3}>
              <Box p={2} bg={passwordType === "agent" ? "gray.300" : "bauhaus.yellow"}>
                <LockIcon boxSize={4} color={passwordType === "agent" ? "gray.400" : "bauhaus.black"} />
              </Box>
              <Box>
                <Text fontWeight="700" color={passwordType === "agent" ? "gray.400" : "text.primary"}>
                  Change Password
                </Text>
                <Text fontSize="xs" color={passwordType === "agent" ? "text.secondary" : "text.secondary"} fontWeight="500">
                  {passwordType === "agent"
                    ? "Unlock with master password to access"
                    : "Update your encryption password"}
                </Text>
              </Box>
            </HStack>
            {passwordType !== "agent" && (
              <Box bg="bauhaus.black" p={1}>
                <ChevronRightIcon color="bauhaus.white" />
              </Box>
            )}
          </HStack>
        </Box>

      {/* Agent Password Section */}
      <Box
        bg="bauhaus.white"
        border="3px solid"
        borderColor="bauhaus.black"
        boxShadow="4px 4px 0px 0px #121212"
        p={4}
        cursor="pointer"
        onClick={() => setTab("agentPassword")}
        _hover={{
          transform: "translateY(-2px)",
          boxShadow: "6px 6px 0px 0px #121212",
        }}
        _active={{
          transform: "translate(2px, 2px)",
          boxShadow: "none",
        }}
        transition="all 0.2s ease-out"
        position="relative"
      >
        {/* Corner decoration */}
        <Box
          position="absolute"
          top="-3px"
          right="-3px"
          w="8px"
          h="8px"
          bg={isAgentPasswordEnabled ? "bauhaus.blue" : "gray.300"}
          border="2px solid"
          borderColor="bauhaus.black"
        />

        <HStack justify="space-between">
          <HStack spacing={3}>
            <Box p={2} bg={isAgentPasswordEnabled ? "bauhaus.blue" : "gray.200"}>
              <AgentIcon boxSize={4} color={isAgentPasswordEnabled ? "white" : "gray.600"} />
            </Box>
            <Box>
              <HStack spacing={2}>
                <Text fontWeight="700" color="text.primary">
                  Agent Password
                </Text>
                <Badge
                  bg={isAgentPasswordEnabled ? "bauhaus.blue" : "gray.200"}
                  color={isAgentPasswordEnabled ? "white" : "gray.600"}
                  border="2px solid"
                  borderColor="bauhaus.black"
                  fontSize="xs"
                  fontWeight="700"
                >
                  {isAgentPasswordEnabled ? "ON" : "OFF"}
                </Badge>
              </HStack>
              <Text fontSize="xs" color="text.secondary" fontWeight="500">
                Allow AI agents to unlock wallet
              </Text>
            </Box>
          </HStack>
          <Box bg="bauhaus.black" p={1}>
            <ChevronRightIcon color="bauhaus.white" />
          </Box>
        </HStack>
      </Box>

      {/* Auto-Lock Settings Section */}
      <Box
        bg="bauhaus.white"
        border="3px solid"
        borderColor="bauhaus.black"
        boxShadow="4px 4px 0px 0px #121212"
        p={4}
        cursor="pointer"
        onClick={() => setTab("autoLock")}
        _hover={{
          transform: "translateY(-2px)",
          boxShadow: "6px 6px 0px 0px #121212",
        }}
        _active={{
          transform: "translate(2px, 2px)",
          boxShadow: "none",
        }}
        transition="all 0.2s ease-out"
        position="relative"
      >
        {/* Corner decoration */}
        <Box
          position="absolute"
          top="-3px"
          right="-3px"
          w="8px"
          h="8px"
          bg="bauhaus.yellow"
          border="2px solid"
          borderColor="bauhaus.black"
        />

        <HStack justify="space-between">
          <HStack spacing={3}>
            <Box p={2} bg="bauhaus.yellow">
              <TimeIcon boxSize={4} color="bauhaus.black" />
            </Box>
            <Box>
              <Text fontWeight="700" color="text.primary">
                Auto-Lock
              </Text>
              <Text fontSize="xs" color="text.secondary" fontWeight="500">
                Configure wallet lock timeout
              </Text>
            </Box>
          </HStack>
          <Box bg="bauhaus.black" p={1}>
            <ChevronRightIcon color="bauhaus.white" />
          </Box>
        </HStack>
      </Box>

      {/* Local AI Chat (Ollama) Section */}
      <Box
        bg="bauhaus.white"
        border="3px solid"
        borderColor="bauhaus.black"
        boxShadow="4px 4px 0px 0px #121212"
        p={4}
        cursor="pointer"
        onClick={() => setTab("ollama")}
        _hover={{
          transform: "translateY(-2px)",
          boxShadow: "6px 6px 0px 0px #121212",
        }}
        _active={{
          transform: "translate(2px, 2px)",
          boxShadow: "none",
        }}
        transition="all 0.2s ease-out"
        position="relative"
      >
        {/* Corner decoration */}
        <Box
          position="absolute"
          top="-3px"
          right="-3px"
          w="8px"
          h="8px"
          bg="bauhaus.green"
          border="2px solid"
          borderColor="bauhaus.black"
        />

        <HStack justify="space-between">
          <HStack spacing={3}>
            <Box p={2} bg="bauhaus.green">
              <ChatIcon boxSize={4} color="bauhaus.black" />
            </Box>
            <Box>
              <Text fontWeight="700" color="text.primary">
                Local AI Chat
              </Text>
              <Text fontSize="xs" color="text.secondary" fontWeight="500">
                Configure Ollama for PK/SP accounts
              </Text>
            </Box>
          </HStack>
          <Box bg="bauhaus.black" p={1}>
            <ChevronRightIcon color="bauhaus.white" />
          </Box>
        </HStack>
      </Box>

      {/* Chain RPCs Section */}
      <Box
        bg="bauhaus.white"
        border="3px solid"
        borderColor="bauhaus.black"
        boxShadow="4px 4px 0px 0px #121212"
        p={4}
        cursor="pointer"
        onClick={() => setTab("chains")}
        _hover={{
          transform: "translateY(-2px)",
          boxShadow: "6px 6px 0px 0px #121212",
        }}
        _active={{
          transform: "translate(2px, 2px)",
          boxShadow: "none",
        }}
        transition="all 0.2s ease-out"
        position="relative"
      >
        {/* Corner decoration */}
        <Box
          position="absolute"
          top="-3px"
          right="-3px"
          w="8px"
          h="8px"
          bg="bauhaus.black"
          border="2px solid"
          borderColor="bauhaus.black"
        />

        <HStack justify="space-between">
          <HStack spacing={3}>
            <Box p={2} bg="bauhaus.black">
              <Text fontSize="lg">⛓️</Text>
            </Box>
            <Box>
              <Text fontWeight="700" color="text.primary">
                Chain RPCs
              </Text>
              <Text fontSize="xs" color="text.secondary" fontWeight="500">
                Configure network RPC endpoints
              </Text>
            </Box>
          </HStack>
          <Box bg="bauhaus.black" p={1}>
            <ChevronRightIcon color="bauhaus.white" />
          </Box>
        </HStack>
      </Box>

      {/* Clear Transaction History Section */}
      <Box
        bg="bauhaus.white"
        border="3px solid"
        borderColor="bauhaus.black"
        boxShadow="4px 4px 0px 0px #121212"
        p={4}
        cursor="pointer"
        onClick={onDeleteModalOpen}
        _hover={{
          transform: "translateY(-2px)",
          boxShadow: "6px 6px 0px 0px #121212",
        }}
        _active={{
          transform: "translate(2px, 2px)",
          boxShadow: "none",
        }}
        transition="all 0.2s ease-out"
        position="relative"
      >
        {/* Corner decoration */}
        <Box
          position="absolute"
          top="-3px"
          right="-3px"
          w="8px"
          h="8px"
          bg="bauhaus.red"
          border="2px solid"
          borderColor="bauhaus.black"
        />

        <HStack justify="space-between">
          <HStack spacing={3}>
            <Box p={2} bg="bauhaus.red">
              <DeleteIcon boxSize={4} color="white" />
            </Box>
            <Box>
              <Text fontWeight="700" color="text.primary">
                Clear Transaction History
              </Text>
              <Text fontSize="xs" color="text.secondary" fontWeight="500">
                Remove all transaction records
              </Text>
            </Box>
          </HStack>
        </HStack>
      </Box>

      {/* Reset Nonce Cache Section */}
      <Box
        bg="bauhaus.white"
        border="3px solid"
        borderColor="bauhaus.black"
        boxShadow="4px 4px 0px 0px #121212"
        p={4}
        cursor="pointer"
        onClick={handleResetNonce}
        _hover={{
          transform: "translateY(-2px)",
          boxShadow: "6px 6px 0px 0px #121212",
        }}
        _active={{
          transform: "translate(2px, 2px)",
          boxShadow: "none",
        }}
        transition="all 0.2s ease-out"
        position="relative"
      >
        <Box
          position="absolute"
          top="-3px"
          right="-3px"
          w="8px"
          h="8px"
          bg="bauhaus.blue"
          border="2px solid"
          borderColor="bauhaus.black"
        />
        <HStack justify="space-between">
          <HStack spacing={3}>
            <Box p={2} bg="bauhaus.blue">
              <RepeatIcon boxSize={4} color="white" />
            </Box>
            <Box>
              <Text fontWeight="700" color="text.primary">
                Reset Nonce Cache
              </Text>
              <Text fontSize="xs" color="text.secondary" fontWeight="500">
                Fix stuck transactions from nonce conflicts
              </Text>
            </Box>
          </HStack>
        </HStack>
      </Box>

      {/* Clear Chat History Section */}
      <Box
        bg="bauhaus.white"
        border="3px solid"
        borderColor="bauhaus.black"
        boxShadow="4px 4px 0px 0px #121212"
        p={4}
        cursor="pointer"
        onClick={onChatDeleteModalOpen}
        _hover={{
          transform: "translateY(-2px)",
          boxShadow: "6px 6px 0px 0px #121212",
        }}
        _active={{
          transform: "translate(2px, 2px)",
          boxShadow: "none",
        }}
        transition="all 0.2s ease-out"
        position="relative"
      >
        {/* Corner decoration */}
        <Box
          position="absolute"
          top="-3px"
          right="-3px"
          w="8px"
          h="8px"
          bg="bauhaus.red"
          border="2px solid"
          borderColor="bauhaus.black"
          borderRadius="full"
        />

        <HStack justify="space-between">
          <HStack spacing={3}>
            <Box p={2} bg="bauhaus.red">
              <ChatIcon boxSize={4} color="white" />
            </Box>
            <Box>
              <Text fontWeight="700" color="text.primary">
                Clear Chat History
              </Text>
              <Text fontSize="xs" color="text.secondary" fontWeight="500">
                Remove all chat conversations
              </Text>
            </Box>
          </HStack>
        </HStack>
      </Box>

      {/* Delete Transaction History Confirmation Modal */}
      <Modal isOpen={isDeleteModalOpen} onClose={onDeleteModalClose} isCentered>
        <ModalOverlay bg="blackAlpha.800" />
        <ModalContent
          bg="bauhaus.white"
          border="3px solid"
          borderColor="bauhaus.black"
          boxShadow="8px 8px 0px 0px #121212"
          mx={4}
          borderRadius="0"
        >
          <ModalHeader
            color="bauhaus.black"
            fontWeight="900"
            fontSize="md"
            textTransform="uppercase"
            borderBottom="3px solid"
            borderColor="bauhaus.black"
          >
            Clear Transaction History?
          </ModalHeader>
          <ModalBody py={4}>
            <Text color="text.secondary" fontSize="sm" fontWeight="500">
              This will permanently delete all transaction records. This action cannot be undone.
            </Text>
          </ModalBody>
          <ModalFooter gap={2} borderTop="3px solid" borderColor="bauhaus.black">
            <Button variant="secondary" size="sm" onClick={onDeleteModalClose}>
              Cancel
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={handleClearHistory}
            >
              Delete
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* Delete Chat History Confirmation Modal */}
      <Modal isOpen={isChatDeleteModalOpen} onClose={onChatDeleteModalClose} isCentered>
        <ModalOverlay bg="blackAlpha.800" />
        <ModalContent
          bg="bauhaus.white"
          border="3px solid"
          borderColor="bauhaus.black"
          boxShadow="8px 8px 0px 0px #121212"
          mx={4}
          borderRadius="0"
        >
          <ModalHeader
            color="bauhaus.black"
            fontWeight="900"
            fontSize="md"
            textTransform="uppercase"
            borderBottom="3px solid"
            borderColor="bauhaus.black"
          >
            Clear Chat History?
          </ModalHeader>
          <ModalBody py={4}>
            <Text color="text.secondary" fontSize="sm" fontWeight="500">
              This will permanently delete all chat conversations. This action cannot be undone.
            </Text>
          </ModalBody>
          <ModalFooter gap={2} borderTop="3px solid" borderColor="bauhaus.black">
            <Button variant="secondary" size="sm" onClick={onChatDeleteModalClose}>
              Cancel
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={handleClearChatHistory}
            >
              Delete
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* Spacer to push footer to bottom */}
      <Box flex="1" />

      <Box h="3px" bg="bauhaus.black" w="full" />

      <HStack spacing={1} justify="center">
        <Text fontSize="sm" color="text.tertiary" fontWeight="500">
          Built by
        </Text>
        <Link
          display="flex"
          alignItems="center"
          gap={1}
          color="bauhaus.blue"
          fontWeight="700"
          _hover={{ color: "bauhaus.red" }}
          onClick={() => {
            chrome.tabs.create({ url: TWITTER_URL });
          }}
        >
          <Box
            as="svg"
            viewBox="0 0 24 24"
            w="14px"
            h="14px"
            fill="currentColor"
          >
            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
          </Box>
          <Text fontSize="sm" textDecor="underline">
            @apoorveth
          </Text>
        </Link>
      </HStack>
    </VStack>
  );
}

export default memo(Settings);
